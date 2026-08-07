import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Refusing to sign/verify tokens with an insecure fallback.",
    );
  }
  return secret;
}

export interface UserPayload {
  userId: number;
  phone: string;
  deviceId?: string;
  v?: number;
}

const TOKEN_VERSION = 3;

export const SUPER_ADMIN_USERNAME = "admin";

export interface AdminPayload {
  adminId: number;
  username: string;
  role: "admin";
  isSuperAdmin?: boolean;
  permissions?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
      admin?: AdminPayload;
    }
  }
}

// ─── Media cookie name & options ──────────────────────────────────────────────
//
// This HttpOnly cookie is set on every login/register response so that the
// browser automatically attaches it to ANY request — including <video> and
// <audio> src requests where the frontend cannot inject Authorization headers.
//
// SameSite=Lax is sufficient for same-site navigation; Strict would break
// direct link navigation from external sites.
//
export const MEDIA_COOKIE_NAME = "shivafer_media";

export function setMediaCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(MEDIA_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — matches JWT expiry
    path: "/",
  });
}

export function clearMediaCookie(res: Response): void {
  res.clearCookie(MEDIA_COOKIE_NAME, { path: "/" });
}

// ─── Token extraction helpers ──────────────────────────────────────────────────

function extractTokenFromRequest(req: Request): string | null {
  // 1. Authorization: Bearer <token>  (API calls, mobile, admin panel)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // 2. HttpOnly cookie (browser <video>/<audio> tags, same-origin fetches)
  const cookieToken = req.cookies?.[MEDIA_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === "string") {
    return cookieToken;
  }
  return null;
}

// ─── requireUser — standard API auth (header only) ────────────────────────────
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "احراز هویت لازم است" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as UserPayload;

    // Reject old tokens that predate device binding (force re-login)
    if (!payload.v || payload.v < TOKEN_VERSION) {
      res.status(401).json({ error: "نشست شما منقضی شده است. لطفاً دوباره وارد شوید" });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "توکن نامعتبر است" });
  }
}

// ─── requireUserViaMedia — media auth (cookie OR header) ──────────────────────
//
// Use this middleware on ALL media streaming endpoints (video, audio, etc.).
// It accepts the JWT from either:
//   a) Authorization: Bearer header  — for API/fetch calls
//   b) shivafer_media HttpOnly cookie — for browser <video>/<audio> src requests
//
// The frontend never needs to add ?token= or manage auth for media URLs.
// This middleware is the single point of truth for media access control.
//
export function requireUserViaMedia(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: "احراز هویت لازم است" });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as UserPayload;

    if (!payload.v || payload.v < TOKEN_VERSION) {
      res.status(401).json({ error: "نشست شما منقضی شده است. لطفاً دوباره وارد شوید" });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "توکن نامعتبر است" });
  }
}

// ─── optionalAuth — populates req.user if valid token present ─────────────────
//
// Also checks cookie so optional-auth routes work transparently for
// browser-native media requests.
//
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as UserPayload;
      if (payload.v && payload.v >= TOKEN_VERSION) {
        req.user = payload;
      }
    } catch {
      // invalid token — proceed as guest
    }
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "دسترسی ادمین لازم است" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AdminPayload;
    if (payload.role !== "admin" || !payload.isSuperAdmin) {
      res.status(403).json({ error: "فقط سوپر ادمین به این بخش دسترسی دارد" });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "توکن ادمین نامعتبر است" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "دسترسی ادمین لازم است" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AdminPayload;
    if (payload.role !== "admin") {
      res.status(403).json({ error: "دسترسی غیرمجاز" });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "توکن ادمین نامعتبر است" });
  }
}

export function signUserToken(payload: UserPayload, deviceId?: string): string {
  const data: UserPayload = { ...payload, v: TOKEN_VERSION };
  if (deviceId) data.deviceId = deviceId;
  return jwt.sign(data, getJwtSecret(), { expiresIn: "30d" });
}

export function signAdminToken(payload: AdminPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "90d" });
}
