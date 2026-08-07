import { useState, useEffect } from "react";
import { get, post } from "@/lib/api";
import { Bell, Search, Send } from "lucide-react";

interface User {
  id: number;
  phone: string;
  name?: string | null;
}

export default function PushNotification() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    get<User[]>("/admin/users").then(setUsers).catch(() => {});
  }, []);

  const filtered = users.filter(
    u => u.phone.includes(search) || (u.name ?? "").includes(search)
  );

  async function send() {
    if (!selected || !title || !body) return;
    setBusy(true);
    setResult(null);
    try {
      await post("/admin/push/send", { userId: selected.id, title, body, url: url || undefined });
      setResult({ ok: true, message: "پیام ارسال شد ✓" });
      setTitle("");
      setBody("");
      setUrl("");
      setSelected(null);
    } catch (e: any) {
      setResult({ ok: false, message: e.message ?? "خطا در ارسال" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center gap-2">
        <Bell size={20} className="text-primary" />
        <h1 className="text-xl font-bold">ارسال پیام مستقیم</h1>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">انتخاب کاربر</label>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pr-8 text-sm w-full"
              placeholder="جستجو با نام یا شماره..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); }}
            />
          </div>
          {search && !selected && (
            <div className="border border-border rounded-lg overflow-hidden max-h-44 overflow-y-auto">
              {filtered.length === 0
                ? <p className="text-xs text-muted-foreground p-3 text-center">کاربری یافت نشد</p>
                : filtered.slice(0, 20).map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setSearch(u.name ?? u.phone); }}
                    className="w-full text-right px-3 py-2 hover:bg-muted/50 text-sm flex items-center gap-2 border-b border-border last:border-0"
                  >
                    <span className="font-medium">{u.name ?? "—"}</span>
                    <span className="text-muted-foreground text-xs">{u.phone}</span>
                  </button>
                ))
              }
            </div>
          )}
          {selected && (
            <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-lg">
              <span className="font-medium">{selected.name ?? "—"}</span>
              <span className="opacity-70">{selected.phone}</span>
              <button onClick={() => { setSelected(null); setSearch(""); }} className="mr-auto text-xs opacity-60 hover:opacity-100">×</button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">عنوان نوتیفیکیشن</label>
          <input
            className="input text-sm w-full"
            placeholder="مثلاً: پیام مهم از آکادمی"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">متن پیام</label>
          <textarea
            className="input text-sm w-full resize-none"
            rows={3}
            placeholder="متن پیامی که کاربر دریافت می‌کند..."
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">لینک (اختیاری)</label>
          <input
            className="input text-sm w-full"
            placeholder="/courses یا /tribe"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </div>

        {result && (
          <p className={`text-sm px-3 py-2 rounded-lg ${result.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {result.message}
          </p>
        )}

        <button
          onClick={send}
          disabled={!selected || !title || !body || busy}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Send size={15} />
          {busy ? "در حال ارسال..." : "ارسال نوتیفیکیشن"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        فقط کاربرانی که push notification را در مرورگرشان فعال کرده‌اند پیام دریافت می‌کنند.
      </p>
    </div>
  );
}
