import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { Phone, ChevronDown, ChevronUp, TrendingUp, DollarSign, Clock, Calendar } from "lucide-react";

type VoiceMessage = { role: "user" | "assistant"; content: string; ts: string };

interface VoiceLog {
  id: number;
  sessionId: string;
  userId: number;
  userPhone: string | null;
  userName: string | null;
  startedAt: string;
  lastActivityAt: string;
  turnCount: number;
  gptInputTokens: number;
  gptOutputTokens: number;
  elevenlabsChars: number;
  estimatedCostUsd: number;
  messages: VoiceMessage[] | null;
}

interface Stats {
  today: number;
  week: number;
  month: number;
  total: number;
  costToday: number;
  costWeek: number;
  costTotal: number;
}

function dur(start: string, end: string): string {
  const s = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s} ثانیه`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}:${String(rem).padStart(2, "0")} دقیقه` : `${m} دقیقه`;
}

function fmt(d: string): string {
  return new Date(d).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtCost(c: number): string {
  return `$${c.toFixed(3)}`;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={17} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function VoiceAdvisorLogs() {
  const [logs, setLogs] = useState<VoiceLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(p: number) {
    setLoading(true);
    try {
      const [logsData, statsData] = await Promise.all([
        get<VoiceLog[]>(`/admin/voice-advisor/logs?page=${p}`),
        p === 1 ? get<Stats>("/admin/voice-advisor/stats") : Promise.resolve(stats),
      ]);
      setLogs(logsData);
      if (statsData) setStats(statsData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Phone size={20} className="text-violet-400" />
          مکالمات سارا
        </h1>
        <p className="text-xs text-muted-foreground mt-1">لاگ کامل تماس‌های صوتی با آمار و هزینه</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="تماس امروز" value={String(stats.today)} sub={`هزینه: ${fmtCost(stats.costToday)}`} icon={Calendar} color="bg-violet-500" />
          <StatCard label="این هفته" value={String(stats.week)} sub={`هزینه: ${fmtCost(stats.costWeek)}`} icon={TrendingUp} color="bg-indigo-500" />
          <StatCard label="کل تماس‌ها" value={String(stats.total)} icon={Phone} color="bg-blue-500" />
          <StatCard label="کل هزینه" value={fmtCost(stats.costTotal)} sub="تخمین" icon={DollarSign} color="bg-emerald-500" />
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">جزئیات تماس‌ها</h2>
          <button onClick={() => load(page)} className="text-xs text-muted-foreground hover:text-foreground">↻ بروزرسانی</button>
        </div>

        {loading && <div className="flex justify-center py-12"><div className="loader" /></div>}

        {!loading && logs.length === 0 && (
          <p className="text-muted-foreground text-center py-10 text-sm">هیچ تماسی ثبت نشده</p>
        )}

        {!loading && logs.length > 0 && (
          <div className="divide-y divide-border">
            {logs.map(log => {
              const isExp = expanded === log.sessionId;
              return (
                <div key={log.sessionId}>
                  <button
                    onClick={() => setExpanded(isExp ? null : log.sessionId)}
                    className="w-full text-right px-4 py-3 hover:bg-muted/20 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                      <Phone size={13} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-0.5 text-sm">
                      <div className="md:col-span-1">
                        <p className="font-medium truncate">{log.userName || "بدون نام"}</p>
                        <p className="text-xs text-muted-foreground">{log.userPhone || "—"}</p>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar size={11} />
                        {fmt(log.startedAt)}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock size={11} />
                        {dur(log.startedAt, log.lastActivityAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.turnCount} تبادل
                      </div>
                      <div className="text-xs font-medium text-emerald-400">
                        {fmtCost(log.estimatedCostUsd)}
                      </div>
                    </div>
                    {isExp ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
                  </button>

                  {isExp && (
                    <div className="border-t border-border bg-muted/10 px-4 py-3 space-y-2">
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pb-2 border-b border-border/50">
                        <span>توکن ورودی: <strong className="text-foreground">{log.gptInputTokens.toLocaleString()}</strong></span>
                        <span>توکن خروجی: <strong className="text-foreground">{log.gptOutputTokens.toLocaleString()}</strong></span>
                        <span>کاراکتر ElevenLabs: <strong className="text-foreground">{log.elevenlabsChars.toLocaleString()}</strong></span>
                      </div>
                      {(!log.messages || log.messages.length === 0) ? (
                        <p className="text-xs text-muted-foreground py-2">متن مکالمه ذخیره نشده</p>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {log.messages.map((msg, i) => (
                            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                                msg.role === "user"
                                  ? "bg-violet-600/20 text-foreground"
                                  : "bg-muted/40 text-foreground"
                              }`}>
                                <p className="leading-relaxed">{msg.content}</p>
                                <p className="text-[10px] text-muted-foreground mt-1 text-left">
                                  {msg.role === "user" ? "کاربر" : "سارا"} · {new Date(msg.ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm disabled:opacity-40">قبلی</button>
        <span className="text-sm text-muted-foreground">صفحه {page}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 30} className="btn-secondary text-sm disabled:opacity-40">بعدی</button>
      </div>
    </div>
  );
}
