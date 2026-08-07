import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, BookOpen, ShoppingBag, Video, Users,
  CreditCard, KeyRound, Settings, Menu, X, LogOut, ExternalLink,
  Bot, Trophy, UserRound, MessageCircle, Megaphone, PhoneCall, BarChart2, BellRing, Smartphone, HeadphonesIcon, CheckSquare, Database, Tag, FileText, ShieldCheck, Link2, Brain,
} from "lucide-react";

const NAV = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard, permission: "dashboard" },
  { href: "/courses", label: "دوره‌ها", icon: BookOpen, permission: "courses" },
  { href: "/mtp-pricing", label: "قیمت و تخفیف MTP", icon: Tag, permission: "mtp-pricing" },
  { href: "/products", label: "محصولات", icon: ShoppingBag, permission: "products" },
  { href: "/reels", label: "ریلز", icon: Video, permission: "reels" },
  { href: "/channel", label: "کانال", icon: Megaphone, permission: "channel" },
  { href: "/users", label: "کاربران", icon: Users, permission: "users" },
  { href: "/advisor-requests", label: "درخواست مشاور", icon: HeadphonesIcon, permission: "advisor-requests" },
  { href: "/orders", label: "تراکنش‌ها", icon: CreditCard, permission: "orders" },
  { href: "/licenses", label: "لایسنس‌ها", icon: KeyRound, permission: "licenses" },
  { href: "/chatbot", label: "پایگاه دانش (قدیم)", icon: Bot, permission: "chatbot" },
  { href: "/knowledge-base", label: "پایگاه دانش", icon: Database, permission: "knowledge-base" },
  { href: "/pages-content", label: "محتوای صفحات معرفی", icon: FileText, permission: "pages-content" },
  { href: "/voice-advisor-logs", label: "مکالمات سارا", icon: PhoneCall, permission: "voice-advisor-logs" },
  { href: "/proactive-messages", label: "پیام‌های پیشگیرانه", icon: MessageCircle, permission: "proactive-messages" },
  { href: "/support-agents", label: "پشتیبان‌های چت", icon: UserRound, permission: "support-agents" },
  { href: "/campaigns", label: "کمپین‌های جدول", icon: Trophy, permission: "campaigns" },
  { href: "/tracking-links", label: "لینک‌های تبلیغاتی", icon: Link2, permission: "tracking-links" },
  { href: "/assessments", label: "Tests & Assessments", icon: Brain, permission: "assessments" },
  { href: "/financial-reports", label: "گزارش درآمد و هزینه", icon: BarChart2, permission: "financial-reports" },
  { href: "/push-notification", label: "پیام مستقیم", icon: BellRing, permission: "push-notification" },
  { href: "/android-apk", label: "APK اندروید", icon: Smartphone, permission: "android-apk" },
  { href: "/settings", label: "تنظیمات", icon: Settings, permission: "settings" },
  { href: "/system-status", label: "وضعیت سیستم", icon: CheckSquare, permission: "system-status" },
];

const SUPER_ADMIN_NAV = [
  { href: "/admin-management", label: "مدیریت ادمین‌ها", icon: ShieldCheck },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { admin, logout, isSuperAdmin, hasPermission } = useAuth();

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center text-white font-bold text-sm">ش</div>
          <div>
            <p className="text-sidebar-foreground font-bold text-sm leading-tight">شیوافر آکادمی</p>
            <p className="text-sidebar-foreground/50 text-xs">پنل مدیریت</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="mr-auto text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {admin && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <p className="text-sidebar-foreground/60 text-xs">خوش آمدید، <span className="text-sidebar-foreground font-medium">{admin.username}</span></p>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.filter(({ permission }) => hasPermission(permission)).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={onClose}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <Icon size={17} />
                <span>{label}</span>
              </div>
            </Link>
          );
        })}
        {isSuperAdmin && (
          <>
            <div className="pt-2 pb-1 px-3">
              <span className="text-xs text-sidebar-foreground/40 uppercase tracking-wider">سوپر ادمین</span>
            </div>
            {SUPER_ADMIN_NAV.map(({ href, label, icon: Icon }) => {
              const active = location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={onClose}>
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}>
                    <Icon size={17} />
                    <span>{label}</span>
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <a href="/" target="_blank" rel="noopener noreferrer">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm transition-colors">
            <ExternalLink size={16} />
            <span>ورود به سایت اصلی</span>
          </div>
        </a>
        <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors">
          <LogOut size={16} />
          <span>خروج از سیستم</span>
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-sidebar border-l border-sidebar-border">
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-64 bg-sidebar flex flex-col">
            <SidebarContent onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white border-b border-border">
          <button onClick={() => setOpen(true)} className="text-foreground">
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm">شیوافر آکادمی</span>
          <div />
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
