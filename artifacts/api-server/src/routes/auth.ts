import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, otpCodesTable, adminUsersTable, tribesTable, tribeMembersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { sendOtpSms, generateOtpCode } from "../lib/sms";
import { sendPushToUser, checkLeaderboardRankNotification } from "./push";
import { signUserToken, requireUser, setMediaCookie, clearMediaCookie, MEDIA_COOKIE_NAME } from "../middlewares/auth";
import { migrateGuestDiscountsToUser } from "../lib/guest-item-discount";
import { hashPassword, verifyPassword } from "../lib/password";
import { getAdminSetting } from "../lib/settings";
import { attributeSignup } from "../lib/tracking-links";

async function getSmsConfig() {
  const [apiKey, from, patternCode] = await Promise.all([
    getAdminSetting("sms_api_key"),
    getAdminSetting("sms_from"),
    getAdminSetting("sms_pattern_code"),
  ]);
  return { apiKey, from, patternCode };
}

const router = Router();

// ─── شماره‌هایی که برای همیشه از محدودیتِ تک‌دستگاهی معاف‌اند (مدیر سایت) ──────
const DEVICE_EXEMPT_PHONES = new Set<string>(["09354505225"]);

// ─── Helper: device binding ────────────────────────────────────────────────
async function resolveDeviceBinding(
  user: { id: number; phone: string; boundDeviceId: string | null },
  incomingDeviceId: string | undefined,
  res: import("express").Response
): Promise<string | null | false> {
  // معافیتِ دائمی: این شماره‌ها از هر دستگاهی می‌توانند وارد شوند (هیچ‌گاه bind/رد نمی‌شوند)
  if (DEVICE_EXEMPT_PHONES.has(user.phone)) {
    return incomingDeviceId ?? null;
  }

  if (!user.boundDeviceId) {
    // هنوز دستگاهی bind نشده
    if (!incomingDeviceId) return null; // اپ قدیمی بدون deviceId → آزاد
    // اولین ورود با اپ جدید → bind کن
    await db
      .update(usersTable)
      .set({ boundDeviceId: incomingDeviceId, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    return incomingDeviceId;
  }

  // دستگاه bind شده — حتماً باید deviceId بفرسته و یکی باشه
  if (incomingDeviceId && user.boundDeviceId === incomingDeviceId) {
    return incomingDeviceId; // همان دستگاه → مجاز
  }

  // بدون deviceId یا دستگاه متفاوت → رد
  res.status(403).json({
    error: "این اکانت روی دستگاه دیگری فعال است. لطفا برای ورود به حسابتان از همان دستگاهی که اولین بار ورود کرده بودید وارد شوید.",
    code: "DEVICE_MISMATCH",
  });
  return false;
}

// POST /auth/send-otp
router.post("/auth/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone || !/^09[0-9]{9}$/.test(phone)) {
    res.status(400).json({ error: "شماره موبایل نامعتبر است" });
    return;
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Invalidate old OTPs for this phone
  await db
    .update(otpCodesTable)
    .set({ used: true })
    .where(and(eq(otpCodesTable.phone, phone), eq(otpCodesTable.used, false)));

  await db.insert(otpCodesTable).values({ phone, code, expiresAt });

  const smsCfg = await getSmsConfig();
  const sent = await sendOtpSms(phone, code, smsCfg);
  if (!sent && process.env.NODE_ENV !== "development") {
    res.status(500).json({ error: "خطا در ارسال پیامک" });
    return;
  }

  const isDev = process.env.NODE_ENV === "development";
  res.json({ message: "کد تایید ارسال شد", ...(isDev ? { devCode: code } : {}) });
});

// POST /auth/verify-otp
router.post("/auth/verify-otp", async (req, res) => {
  const { phone: rawPhone, code, deviceId } = req.body;
  const headerDeviceId = req.headers["x-device-id"] as string | undefined;
  const effectiveDeviceId = deviceId || headerDeviceId;

  if (!rawPhone || !code) {
    res.status(400).json({ error: "شماره موبایل و کد الزامی است" });
    return;
  }

  const phone = String(rawPhone).replace(/[۰-۹]/g, (d: string) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");

  const now = new Date();
  const [otp] = await db
    .select()
    .from(otpCodesTable)
    .where(
      and(
        eq(otpCodesTable.phone, phone),
        eq(otpCodesTable.code, code),
        eq(otpCodesTable.used, false),
        gt(otpCodesTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!otp) {
    res.status(400).json({ error: "کد تایید نامعتبر یا منقضی شده است" });
    return;
  }

  // Mark OTP as used
  await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otp.id));

  // Find or create user
  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  const isNewUserOtp = !user;

  if (!user) {
    const [newUser] = await db.insert(usersTable).values({ phone }).returning();
    user = newUser;
    await attributeSignup(req, res, user.id);
  }

  // Handle referral: join tribe if new user (cookie is primary source; body is fallback)
  if (isNewUserOtp) {
    const cookieCode = (req.cookies?.referral_code as string | undefined)?.toUpperCase().trim() ?? "";
    const bodyCode = ((req.body.referralCode as string | undefined) ?? "").toUpperCase().trim();
    const refCode = cookieCode || bodyCode;
    if (refCode) {
      try {
        const [tribe] = await db.select({ id: tribesTable.id, chiefUserId: tribesTable.chiefUserId, name: tribesTable.name })
          .from(tribesTable).where(eq(tribesTable.referralCode, refCode)).limit(1);
        if (tribe && tribe.chiefUserId !== user.id) {
          const [existing] = await db.select({ id: tribeMembersTable.id })
            .from(tribeMembersTable).where(eq(tribeMembersTable.userId, user.id)).limit(1);
          if (!existing) {
            await db.insert(tribeMembersTable).values({ tribeId: tribe.id, userId: user.id });
            sendPushToUser(tribe.chiefUserId, {
              title: "👥 عضو جدید در قبیله",
              body: `${user.name ?? user.phone} به قبیله شما پیوست`,
              url: "/tribe",
            }).catch(() => {});
            checkLeaderboardRankNotification(tribe.id, tribe.chiefUserId, tribe.name).catch(() => {});
          }
        }
        // Clear cookie after successful attribution attempt
        res.clearCookie("referral_code");
      } catch (err) {
        console.error("[Referral OTP] Error:", err instanceof Error ? err.message : String(err));
      }
    }
  }

  const resolvedDeviceId = await resolveDeviceBinding(user, effectiveDeviceId, res);
  if (resolvedDeviceId === false) return; // error already sent

  // First-ever login (any auth method) → trigger the one-time welcome message.
  // Atomic flip: only the request that flips false→true gets a row back.
  const [welcomeMarked] = await db
    .update(usersTable)
    .set({ welcomeProactiveSent: true, updatedAt: new Date() })
    .where(and(eq(usersTable.id, user.id), eq(usersTable.welcomeProactiveSent, false)))
    .returning({ id: usersTable.id });
  const firstLogin = !!welcomeMarked;

  const token = signUserToken({ userId: user.id, phone: user.phone }, resolvedDeviceId ?? undefined);

  // انتقال تخفیف‌های مهمان به کاربر واقعی (اگر guestId ارسال شده باشد)
  const guestId = req.headers["x-guest-id"] as string | undefined;
  if (guestId && guestId.trim().length >= 8) {
    migrateGuestDiscountsToUser(guestId.trim(), user.id).catch(() => {});
  }

  setMediaCookie(res, token);
  res.json({
    token,
    isNewUser: firstLogin,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt,
    },
  });
});

// POST /auth/login-password
router.post("/auth/login-password", async (req, res) => {
  const { phone, password, deviceId } = req.body as { phone?: string; password?: string; deviceId?: string };
  const headerDeviceId = req.headers["x-device-id"] as string | undefined;
  const effectiveDeviceId = deviceId || headerDeviceId;

  if (!phone || !password) {
    res.status(400).json({ error: "شماره موبایل و رمز عبور الزامی است" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "شماره موبایل یا رمز عبور اشتباه است" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "شماره موبایل یا رمز عبور اشتباه است" });
    return;
  }

  const resolvedDeviceId = await resolveDeviceBinding(user, effectiveDeviceId, res);
  if (resolvedDeviceId === false) return; // error already sent

  // First-ever login (e.g. admin-created account logging in for the first time)
  // → trigger the one-time welcome message. Atomic flip (false→true once).
  const [welcomeMarked] = await db
    .update(usersTable)
    .set({ welcomeProactiveSent: true, updatedAt: new Date() })
    .where(and(eq(usersTable.id, user.id), eq(usersTable.welcomeProactiveSent, false)))
    .returning({ id: usersTable.id });
  const firstLogin = !!welcomeMarked;

  const token = signUserToken({ userId: user.id, phone: user.phone }, resolvedDeviceId ?? undefined);

  // انتقال تخفیف‌های مهمان به کاربر واقعی
  const guestIdLP = req.headers["x-guest-id"] as string | undefined;
  if (guestIdLP && guestIdLP.trim().length >= 8) {
    migrateGuestDiscountsToUser(guestIdLP.trim(), user.id).catch(() => {});
  }

  setMediaCookie(res, token);
  res.json({
    token,
    isNewUser: firstLogin,
    user: { id: user.id, phone: user.phone, name: user.name, avatar: user.avatar, createdAt: user.createdAt },
  });
});

// POST /auth/register-send-otp
router.post("/auth/register-send-otp", async (req, res) => {
  const { phone, name } = req.body as { phone?: string; name?: string };

  if (!phone || !/^09[0-9]{9}$/.test(phone)) {
    res.status(400).json({ error: "شماره موبایل نامعتبر است" });
    return;
  }
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: "نام باید حداقل ۲ حرف باشد" });
    return;
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.update(otpCodesTable).set({ used: true })
    .where(and(eq(otpCodesTable.phone, phone), eq(otpCodesTable.used, false)));

  await db.insert(otpCodesTable).values({ phone, code, expiresAt });

  const smsCfg = await getSmsConfig();
  const sent = await sendOtpSms(phone, code, smsCfg);
  if (!sent && process.env.NODE_ENV !== "development") {
    res.status(500).json({ error: "خطا در ارسال پیامک" });
    return;
  }

  const isDev = process.env.NODE_ENV === "development";
  res.json({ message: "کد تایید ارسال شد", ...(isDev ? { devCode: code } : {}) });
});

// POST /auth/register-verify
router.post("/auth/register-verify", async (req, res) => {
  const { phone, code, name, deviceId } = req.body as { phone?: string; code?: string; name?: string; deviceId?: string };
  const headerDeviceId = req.headers["x-device-id"] as string | undefined;
  const effectiveDeviceId = deviceId || headerDeviceId;

  if (!phone || !code || !name) {
    res.status(400).json({ error: "تمام فیلدها الزامی است" });
    return;
  }

  const now = new Date();
  const [otp] = await db.select().from(otpCodesTable).where(
    and(
      eq(otpCodesTable.phone, phone),
      eq(otpCodesTable.code, code),
      eq(otpCodesTable.used, false),
      gt(otpCodesTable.expiresAt, now)
    )
  ).limit(1);

  if (!otp) {
    res.status(400).json({ error: "کد تایید نامعتبر یا منقضی شده است" });
    return;
  }

  await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otp.id));

  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);

  const isNewUser = !user;

  if (!user) {
    const [newUser] = await db.insert(usersTable).values({ phone, name: name.trim() }).returning();
    user = newUser;
    await attributeSignup(req, res, user.id);
  } else {
    const [updated] = await db.update(usersTable)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated;
  }

  // Handle referral: join tribe if new user (cookie primary; body fallback)
  if (isNewUser) {
    const cookieCode = (req.cookies?.referral_code as string | undefined)?.toUpperCase().trim() ?? "";
    const bodyCode = (req.body.referralCode as string | undefined)?.toUpperCase().trim() ?? "";
    const refCode = cookieCode || bodyCode;
    if (refCode) {
      try {
        const [tribe] = await db.select({ id: tribesTable.id, chiefUserId: tribesTable.chiefUserId, name: tribesTable.name })
          .from(tribesTable)
          .where(eq(tribesTable.referralCode, refCode))
          .limit(1);
        if (tribe && tribe.chiefUserId !== user.id) {
          const [existingMembership] = await db.select({ id: tribeMembersTable.id })
            .from(tribeMembersTable)
            .where(eq(tribeMembersTable.userId, user.id))
            .limit(1);
          if (!existingMembership) {
            await db.insert(tribeMembersTable).values({ tribeId: tribe.id, userId: user.id });
            sendPushToUser(tribe.chiefUserId, {
              title: "👥 عضو جدید در قبیله",
              body: `${user.name ?? user.phone} به قبیله شما پیوست`,
              url: "/tribe",
            }).catch(() => {});
            checkLeaderboardRankNotification(tribe.id, tribe.chiefUserId, tribe.name).catch(() => {});
          }
        }
        // Clear cookie after successful attribution attempt
        res.clearCookie("referral_code");
      } catch (err) {
        console.error("[Referral] Error joining tribe:", err instanceof Error ? err.message : String(err));
      }
    }
  }

  const resolvedDeviceId = await resolveDeviceBinding(user, effectiveDeviceId, res);
  if (resolvedDeviceId === false) return; // error already sent

  // First-ever login → trigger the one-time welcome message (independent of the
  // account-creation `isNewUser` flag used for referral attribution above).
  // Atomic flip (false→true once).
  const [welcomeMarked] = await db
    .update(usersTable)
    .set({ welcomeProactiveSent: true, updatedAt: new Date() })
    .where(and(eq(usersTable.id, user.id), eq(usersTable.welcomeProactiveSent, false)))
    .returning({ id: usersTable.id });
  const firstLogin = !!welcomeMarked;

  const token = signUserToken({ userId: user.id, phone: user.phone }, resolvedDeviceId ?? undefined);

  // انتقال تخفیف‌های مهمان به کاربر واقعی
  const guestIdRV = req.headers["x-guest-id"] as string | undefined;
  if (guestIdRV && guestIdRV.trim().length >= 8) {
    migrateGuestDiscountsToUser(guestIdRV.trim(), user.id).catch(() => {});
  }

  setMediaCookie(res, token);
  res.json({
    token,
    isNewUser: firstLogin,
    user: { id: user.id, phone: user.phone, name: user.name, avatar: user.avatar, createdAt: user.createdAt },
  });
});

// POST /auth/logout — clears the media cookie (call on user logout)
router.post("/auth/logout", (_req, res) => {
  clearMediaCookie(res);
  res.json({ message: "خروج موفق" });
});

// PUT /auth/change-password
router.put("/auth/change-password", requireUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "کاربر یافت نشد" }); return; }

  if (user.passwordHash) {
    if (!currentPassword) {
      res.status(400).json({ error: "رمز عبور فعلی الزامی است" });
      return;
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "رمز عبور فعلی اشتباه است" });
      return;
    }
  }

  const newHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  res.json({ message: "رمز عبور با موفقیت تغییر یافت" });
});

// GET /auth/me
router.get("/auth/me", requireUser, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

  if (!user) {
    res.status(404).json({ error: "کاربر یافت نشد" });
    return;
  }

  // ── Backfill media cookie for legacy sessions (pre-v44) ──────────────────────
  // Users who logged in before v44 have a valid JWT in localStorage but no
  // shivafer_media HttpOnly cookie. Without this cookie, <video src> requests
  // return 401 because the browser can't attach Authorization headers to them.
  // Fix: whenever /auth/me is called with a Bearer token but no cookie, set it.
  // PWA calls /auth/me on every app load, so the cookie is set on the first
  // page view after the user opens the app — no logout/login required.
  if (!req.cookies?.[MEDIA_COOKIE_NAME]) {
    const token = req.headers.authorization!.slice(7);
    setMediaCookie(res, token);
  }

  const [adminRecord] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.username, user.phone)).limit(1);

  res.json({
    id: user.id,
    phone: user.phone,
    name: user.name,
    avatar: user.avatar,
    createdAt: user.createdAt,
    walletBalance: user.walletBalance ?? 0,
    isAdmin: !!adminRecord,
    hasPassword: !!user.passwordHash,
    assistantName: user.assistantName ?? null,
    assistantAvatar: user.assistantAvatar ?? null,
  });
});

// PUT /auth/profile
router.put("/auth/profile", requireUser, async (req, res) => {
  const { name, avatar } = req.body;

  const [updated] = await db
    .update(usersTable)
    .set({
      name: name ?? undefined,
      avatar: avatar ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.user!.userId))
    .returning();

  res.json({
    id: updated.id,
    phone: updated.phone,
    name: updated.name,
    avatar: updated.avatar,
    createdAt: updated.createdAt,
  });
});

// GET /auth/bank-info
router.get("/auth/bank-info", requireUser, async (req, res) => {
  const [user] = await db
    .select({ bankCard: usersTable.bankCard, sheba: usersTable.sheba, accountName: usersTable.accountName })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);
  res.json(user ?? { bankCard: null, sheba: null, accountName: null });
});

// PATCH /auth/bank-info
router.patch("/auth/bank-info", requireUser, async (req, res) => {
  const { bankCard, sheba, accountName } = req.body as { bankCard?: string; sheba?: string; accountName?: string };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (bankCard !== undefined) updates.bankCard = bankCard.trim() || null;
  if (sheba !== undefined) updates.sheba = sheba.trim() || null;
  if (accountName !== undefined) updates.accountName = accountName.trim() || null;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.user!.userId))
    .returning({ bankCard: usersTable.bankCard, sheba: usersTable.sheba, accountName: usersTable.accountName });

  res.json(updated);
});

export default router;
