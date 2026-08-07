/**
 * Create (or update the password of) a regular user from the command line.
 *
 * Usage on the server (after `pnpm --filter @workspace/api-server build`):
 *   USER_PHONE=09121134567 USER_PASSWORD=s123456 node dist/scripts/seed-user.mjs
 *
 * Optional:
 *   USER_NAME="نام کاربر"   # sets the display name on creation
 *
 * If a user with the given phone already exists, only the password is updated.
 */
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { hashPassword } from "../lib/password";

const USER_PHONE = process.env.USER_PHONE;
const USER_PASSWORD = process.env.USER_PASSWORD;
const USER_NAME = process.env.USER_NAME;

async function main() {
  if (!USER_PHONE || !USER_PASSWORD) {
    console.error("❌ USER_PHONE and USER_PASSWORD environment variables are required.");
    console.error("   Usage: USER_PHONE=09121134567 USER_PASSWORD=s123456 node dist/scripts/seed-user.mjs");
    process.exit(1);
  }

  if (!/^09[0-9]{9}$/.test(USER_PHONE)) {
    console.error(`❌ Invalid phone format: "${USER_PHONE}". Expected 09XXXXXXXXX (11 digits).`);
    process.exit(1);
  }

  try {
    const passwordHash = await hashPassword(USER_PASSWORD);

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, USER_PHONE))
      .limit(1);

    if (existing) {
      await db
        .update(usersTable)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(usersTable.id, existing.id));
      console.log(`✅ Password updated for existing user: ${USER_PHONE}`);
      process.exit(0);
    }

    const [created] = await db
      .insert(usersTable)
      .values({ phone: USER_PHONE, passwordHash, ...(USER_NAME ? { name: USER_NAME.trim() } : {}) })
      .returning();

    console.log(`✅ User created: ${USER_PHONE} (id ${created.id})`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to seed user:", err);
    process.exit(1);
  }
}

main();
