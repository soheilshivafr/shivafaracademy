import { useState, useEffect } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, ShoppingBag, Crown, Wallet, Film, Wrench, X, Menu, Trophy, LogOut, User, Headphones, Palette } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { GlassIconBtn } from "./glass-controls";
import { ThemeSelector } from "./theme-selector";
import logoGold from "@/assets/logo-gold.webp";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

const menuItems = [
  { href: "/courses",     icon: GraduationCap, label: "دوره‌های من",     sub: "دوره‌هایی که خریداری کرده‌اید" },
  { href: "/products",    icon: ShoppingBag,   label: "فروشگاه",          sub: "دوره‌ها و محصولات قابل خرید" },
  { href: "/podcasts",    icon: Headphones,    label: "پادکست‌ها",         sub: "پست‌های صوتی آموزشی" },
  { href: "/tribe",       icon: Crown,         label: "قبیله",            sub: "مدیریت قبیله و کمیسیون" },
  { href: "/wallet",      icon: Wallet,        label: "کیف پول",          sub: "موجودی و برداشت" },
  { href: "/reels",       icon: Film,          label: "ریلز",             sub: "ویدیوهای کوتاه آموزشی" },
  { href: "/tools",       icon: Wrench,        label: "ابزارها",          sub: "ابزارهای رایگان آکادمی" },
  { href: "/leaderboard", icon: Trophy,        label: "جدول رتبه‌بندی",   sub: "رقابت قبایل" },
  { href: "/profile",     icon: User,          label: "پروفایل",          sub: "اطلاعات حساب کاربری" },
];

const GOLD = "#e8b800";

export function Header({ topOffset = 0 }: { topOffset?: number }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { logout, token } = useAuth();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { setWalletBalance(null); return; }
    fetch(`${API}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWalletBalance(d.balance ?? 0); })
      .catch(() => {});
  }, [token]);

  return (
    <>
      {/* ── Top bar ── */}
      <header
        data-overlay-hide
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-[430px] z-40 flex items-center justify-between px-4"
        style={{
          top: topOffset,
          height: 72,
          background: "var(--glass-header-bg)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          borderBottom: "1px solid var(--glass-header-border)",
          boxShadow: "var(--glass-header-shadow)",
        }}
      >
        {/* Hamburger */}
        <GlassIconBtn onClick={() => setOpen(true)} size={36} aria-label="منو">
          <Menu className="w-4 h-4" />
        </GlassIconBtn>

        {/* Logo + name */}
        <Link href="/courses" className="flex items-center gap-2 select-none">
          <CachedImage src={logoGold} alt="لوگو" style={{ width: 84, height: 84, objectFit: "contain", mixBlendMode: "var(--logo-blend-mode)" as React.CSSProperties["mixBlendMode"] }} />
          <span
            className="text-sm font-black tracking-tight"
            style={{
              background: "var(--brand-name-gradient)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              color: "var(--nav-icon-active)",
            }}
          >
            {location === "/podcasts" ? "پادکست‌های آموزشی" : "آکادمی شیوافر"}
          </span>
        </Link>

        {/* Wallet shortcut */}
        <Link href="/wallet">
          <button
            aria-label="کیف پول"
            className="flex items-center gap-1.5 px-2.5 rounded-xl transition-all active:scale-[0.96]"
            style={{
              height: 36,
              background: "var(--glass-wallet-bg)",
              border: "1px solid var(--glass-wallet-border)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <Wallet className="w-4 h-4 shrink-0" style={{ color: "var(--wallet-btn-color)" }} />
            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--wallet-btn-color)", direction: "rtl" }}>
              {walletBalance === null
                ? "—"
                : `${(walletBalance).toLocaleString("fa")} تومان`}
            </span>
          </button>
        </Link>
      </header>

      {/* ── Overlay ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 backdrop-blur-sm z-50"
            style={{ background: "var(--glass-overlay-bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Drawer ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed top-0 right-1/2 translate-x-[215px] h-full w-72 z-50 flex flex-col"
            style={{
              background: "var(--glass-drawer-bg)",
              backdropFilter: "blur(60px) saturate(180%)",
              WebkitBackdropFilter: "blur(60px) saturate(180%)",
              borderLeft: "1px solid var(--glass-drawer-border)",
              boxShadow: "var(--glass-drawer-shadow)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            dir="rtl"
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-5 pt-12 pb-4"
              style={{ borderBottom: "1px solid var(--glass-drawer-header-sep)" }}
            >
              <div className="flex items-center gap-2.5">
                <CachedImage src={logoGold} alt="لوگو" style={{ width: 32, height: 32, objectFit: "contain", mixBlendMode: "var(--logo-blend-mode)" as React.CSSProperties["mixBlendMode"] }} />
                <div>
                  <div
                    className="text-base font-black"
                    style={{
                      background: "var(--brand-name-gradient)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    آکادمی شیوافر
                  </div>
                  <div className="text-xs text-muted-foreground">
                    منوی اصلی
                  </div>
                </div>
              </div>
              <GlassIconBtn onClick={() => setOpen(false)} size={32}>
                <X className="w-4 h-4" />
              </GlassIconBtn>
            </div>

            {/* Gold glow top-right */}
            <div
              className="absolute top-0 right-0 w-44 h-44 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, var(--glass-glow-radial) 0%, transparent 70%)`,
              }}
            />

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {menuItems.map((item, i) => {
                const active = location === item.href || location.startsWith(item.href + "/");
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all active:scale-[0.97]",
                        active ? "text-foreground" : "text-foreground"
                      )}
                      style={active ? {
                        background: "rgba(240,192,64,0.10)",
                        border: "1px solid rgba(240,192,64,0.22)",
                      } : {
                        ["--hover-bg" as string]: "var(--glass-item-hover)",
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: active ? "rgba(240,192,64,0.15)" : "var(--glass-item-bg-inactive)",
                        }}
                      >
                        <item.icon
                          className="w-4 h-4"
                          style={{ color: active ? GOLD : "var(--glass-icon-inactive)" }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold leading-tight">{item.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{item.sub}</div>
                      </div>
                      {active && (
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: GOLD }}
                        />
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </nav>

            {/* ── Theme selector ── */}
            <div
              className="px-3 py-3"
              style={{ borderTop: "1px solid var(--glass-separator)" }}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold text-muted-foreground">تم</span>
              </div>
              <ThemeSelector />
            </div>

            {/* Enamad badge */}
            <div
              className="px-4 py-3 flex flex-col items-center gap-1"
              style={{ borderTop: "1px solid var(--glass-separator)" }}
            >
              <p className="text-[9px] mb-1 text-muted-foreground" style={{ opacity: 0.6 }}>نماد اعتماد الکترونیکی</p>
              <a
                referrerPolicy="origin"
                target="_blank"
                href="https://trustseal.enamad.ir/?id=728876&Code=4C8eMMpBazD2aPKO0muhxPVEDyr9oXDr"
                className="block"
              >
                <img
                  referrerPolicy="origin"
                  src="https://trustseal.enamad.ir/logo.aspx?id=728876&Code=4C8eMMpBazD2aPKO0muhxPVEDyr9oXDr"
                  alt="نماد اعتماد الکترونیکی"
                  {...{ code: "4C8eMMpBazD2aPKO0muhxPVEDyr9oXDr" } as React.ImgHTMLAttributes<HTMLImageElement>}
                  style={{ width: 80, height: "auto", cursor: "pointer" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </a>
            </div>

            {/* Logout */}
            {token && (
              <div
                className="px-3 pt-2"
                style={{ borderTop: "1px solid var(--glass-separator)", paddingBottom: "calc(5rem + env(safe-area-inset-bottom) + 0.5rem)" }}
              >
                <button
                  onClick={() => { logout(); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors active:scale-[0.97]"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold">خروج از حساب</span>
                </button>
              </div>
            )}
            {!token && (
              <div style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom) + 0.5rem)" }} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
