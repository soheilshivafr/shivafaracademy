import { staticAssetUrl } from "@/lib/static-assets";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { ArrowRight, Send, ChevronLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const API = "";

interface SupportAgent {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatAction {
  route: string;
  label: string;
}

function authFetch(token: string, url: string, opts: RequestInit = {}) {
  return fetch(API + url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
}

// Persian labels for internal routes
const ROUTE_LABELS: Record<string, string> = {
  "/courses": "مشاهده دوره‌ها",
  "/products": "مشاهده محصولات",
  "/podcasts": "پادکست‌ها",
  "/reels": "مشاهده ریلزها",
  "/tribe": "صفحه قبیله",
  "/wallet": "کیف پول",
  "/profile": "پروفایل من",
  "/leaderboard": "لیدربورد",
  "/ai-chat": "چت با پشتیبانی",
  "/student-results": "نتایج دانشجویان",
  "/tools": "ابزارها",
  "/income-expense": "درآمد و هزینه",
  "/collaboration": "همکاری",
};

function routeLabel(url: string): string {
  // exact match
  if (ROUTE_LABELS[url]) return ROUTE_LABELS[url];
  // prefix match (e.g. /courses/123)
  const prefix = Object.keys(ROUTE_LABELS).find(k => url.startsWith(k + "/"));
  if (prefix) return ROUTE_LABELS[prefix];
  return "از اینجا";
}

// Parse message text into segments: plain text or link buttons
// Detects: [label](url), (https://...), (/route)
// Security: links in chat are model-generated, so we use a strict allowlist.
// Internal app routes (starting with "/") are always allowed. External links are
// blocked entirely — MTP registration now happens on the in-app course page, not an external form.
const ALLOWED_EXTERNAL_HOSTS: string[] = [];

function sanitizeUrl(url: string): string | null {
  if (url.startsWith("/")) return url; // internal route
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return ALLOWED_EXTERNAL_HOSTS.includes(u.hostname) ? url : null;
  } catch {
    return null;
  }
}

function parseMessageSegments(text: string): Array<{ type: "text"; value: string } | { type: "link"; url: string; label: string }> {
  const segments: Array<{ type: "text"; value: string } | { type: "link"; url: string; label: string }> = [];
  // Combined regex: markdown link [label](url) OR parenthesised url (https://... or /route)
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)|\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] && m[2]) {
      const url = sanitizeUrl(m[2]);
      if (url) segments.push({ type: "link", label: m[1], url });
    } else if (m[3]) {
      const url = sanitizeUrl(m[3]);
      if (url) {
        const isExternal = url.startsWith("http");
        const label = isExternal ? "از اینجا" : routeLabel(url);
        segments.push({ type: "link", label, url });
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

function MessageContent({ content, navigate }: { content: string; navigate: (to: string) => void }) {
  const segments = parseMessageSegments(content);
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{seg.value}</span>;
        }
        const isExternal = seg.url.startsWith("http");
        return (
          <button
            key={i}
            onClick={() => isExternal ? window.open(seg.url, "_blank", "noopener") : navigate(seg.url)}
            className="inline-flex items-center gap-1 mx-1 my-0.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 shrink-0"
            style={{
              background: "var(--gold-gradient)",
              color: "#fff",
              boxShadow: "0 1px 8px var(--gold-glow)",
              verticalAlign: "middle",
            }}
          >
            {seg.label}
            {isExternal
              ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M10 2L2 10M10 2H5M10 2V7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M7 2L2 7L7 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            }
          </button>
        );
      })}
    </span>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-foreground/50"
          style={{ animation: `typing-dot 2s ease-in-out ${i * 0.35}s infinite` }}
        />
      ))}
    </div>
  );
}

const FALLBACK_AVATAR = staticAssetUrl.supportAvatar();

function AgentAvatar({
  agent,
  size = 40,
  onClick,
}: {
  agent: SupportAgent | null;
  size?: number;
  onClick?: () => void;
}) {
  const src = agent?.avatarUrl ?? FALLBACK_AVATAR;
  return (
    <img
      src={src}
      alt={agent?.name ?? "پشتیبانی"}
      loading="eager"
      className="rounded-full object-cover shrink-0"
      style={{
        width: size,
        height: size,
        cursor: onClick ? "pointer" : undefined,
        WebkitTapHighlightColor: "transparent",
      }}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.src !== FALLBACK_AVATAR) el.src = FALLBACK_AVATAR;
      }}
      onClick={onClick}
    />
  );
}

/* ── Instagram-style avatar zoom overlay ──────────────────────────────────── */
function AvatarZoom({
  agent,
  onClose,
}: {
  agent: SupportAgent | null;
  onClose: () => void;
}) {
  const src = agent?.avatarUrl ?? FALLBACK_AVATAR;
  return (
    <motion.div
      key="avatar-zoom"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.7, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 260,
          height: 260,
          borderRadius: "50%",
          overflow: "hidden",
          boxShadow: "0 0 0 4px rgba(255,255,255,0.18), 0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <img
          src={src}
          alt={agent?.name ?? "پشتیبانی"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => { e.currentTarget.src = FALLBACK_AVATAR; }}
        />
      </motion.div>
      {agent?.name && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ color: "white", fontWeight: 700, fontSize: 16, marginTop: 20, textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
        >
          {agent.name}
        </motion.p>
      )}
    </motion.div>
  );
}

const AGENT_STORAGE_KEY = "chatbot_current_agent";

export default function AiChat() {
  const { token, user } = useAuth();
  const [, navigate] = useLocation();

  // historyAgent: agent saved from previous session (shown on historical messages)
  // currentAgent: newly fetched agent for this session (shown on new messages)
  const [historyAgent, setHistoryAgent] = useState<SupportAgent | null>(null);
  const [currentAgent, setCurrentAgent] = useState<SupportAgent | null>(null);
  // IDs of messages that existed when the page loaded (i.e. "historical")
  const historyIdsRef = useRef<Set<number>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<Map<number, ChatAction[]>>(new Map());
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [zoomedAgent, setZoomedAgent] = useState<SupportAgent | null | "bot">(null);

  const endRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== "undefined" ? (window.visualViewport?.height ?? window.innerHeight) : 812
  );
  const [viewportTop, setViewportTop] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onUpdate = () => {
      setViewportH(vv.height);
      setViewportTop(vv.offsetTop);
    };
    onUpdate(); // sync immediately so initial render is correct
    vv.addEventListener("resize", onUpdate);
    vv.addEventListener("scroll", onUpdate);
    return () => { vv.removeEventListener("resize", onUpdate); vv.removeEventListener("scroll", onUpdate); };
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Returns the right agent for a given message: history messages → historyAgent, new messages → currentAgent
  function agentForMsg(msgId: number): SupportAgent | null {
    if (historyIdsRef.current.has(msgId)) return historyAgent ?? currentAgent;
    return currentAgent ?? historyAgent;
  }

  const scrollToBottom = useCallback((instant?: boolean) => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" }), instant ? 50 : 80);
  }, []);

  useEffect(() => {
    if (!token) {
      // Drop any pending course/product prefill so it can't leak into a later,
      // unrelated chat session after the user logs back in.
      try { localStorage.removeItem("coursePrefill"); } catch { /* ignore */ }
      navigate("/login");
      return;
    }
    // Wait until we know which user this is, so the advisor is locked per-user
    // (and not shared across accounts on the same device).
    if (!user) return;

    async function init() {
      // Course/product context prefill: when the user taps "ask about this
      // course/product" on a detail page, we stash its title and seed the input
      // box here (not auto-sent) so they only have to type their question.
      try {
        const cp = localStorage.getItem("coursePrefill");
        if (cp) {
          localStorage.removeItem("coursePrefill");
          const { title } = JSON.parse(cp) as { title?: string };
          if (title) setInput(`سلام، درباره «${title}» سوال دارم: `);
        }
      } catch { /* ignore */ }

      // Rule 1 — consistent agent identity: lock ONE advisor per user forever.
      // Reuse the saved advisor for every message; only pick a random one the
      // very first time (when none is locked yet). This prevents the name/photo
      // from changing mid- or between conversations.
      const agentKey = `${AGENT_STORAGE_KEY}_${user!.id}`;
      let agent: SupportAgent | null = null;
      try {
        const saved = localStorage.getItem(agentKey);
        if (saved) agent = JSON.parse(saved) as SupportAgent;
      } catch { /* ignore */ }

      try {
        const historyPromise = authFetch(token!, "/api/ai-chat/history");

        if (!agent) {
          const agentRes = await authFetch(token!, "/api/support-agents/random");
          if (agentRes.ok) {
            agent = await agentRes.json() as SupportAgent;
            localStorage.setItem(agentKey, JSON.stringify(agent));
          }
        }
        if (agent) {
          // Same locked agent for both historical and new messages.
          setCurrentAgent(agent);
          setHistoryAgent(agent);
        }

        const historyRes = await historyPromise;
        const history: ChatMessage[] = historyRes.ok ? await historyRes.json() : [];
        // Mark all loaded messages as "historical"
        historyIdsRef.current = new Set(history.map(m => Number(m.id)));

        // ── Restore persisted action buttons from localStorage ──────────────
        try {
          const savedActions = localStorage.getItem(`chat_message_actions_${user!.id}`);
          if (savedActions) {
            const parsed: Record<string, ChatAction[]> = JSON.parse(savedActions);
            const actMap = new Map<number, ChatAction[]>();
            for (const [k, v] of Object.entries(parsed)) actMap.set(Number(k), v);
            setActions(actMap);
          }
        } catch { /* ignore */ }

        // Check for pending proactive message from widget click
        const pendingRaw = localStorage.getItem("proactivePending");
        if (pendingRaw) {
          localStorage.removeItem("proactivePending");
          try {
            const { content } = JSON.parse(pendingRaw) as { content: string };
            if (content) {
              const deliverRes = await authFetch(token!, "/api/ai-chat/proactive/deliver", {
                method: "POST",
                body: JSON.stringify({ content }),
              });
              if (deliverRes.ok) {
                const { message } = await deliverRes.json() as { message: ChatMessage };
                setMessages([...history, message]);
                setLoading(false);
                return;
              }
            }
          } catch { /* ignore */ }
        }

        setMessages(history);
      } catch { /* ignore */ }
      setLoading(false);
    }
    init();
  }, [token, user, navigate]);

  useEffect(() => { scrollToBottom(); }, [messages, typing, scrollToBottom]);

  useEffect(() => { scrollToBottom(true); }, [viewportH, scrollToBottom]);

  // Auto-resize textarea whenever input changes (including programmatic prefill).
  // requestAnimationFrame defers the measurement until AFTER the browser has
  // finished laying out the new value, so scrollHeight is accurate.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    });
    return () => cancelAnimationFrame(id);
  }, [input]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || typing || !token) return;

    setInput("");
    const tmpId = Date.now();
    const userMsg: ChatMessage = { id: tmpId, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    // Auto-retry on transient network/gateway failures (weak mobile connections
    // occasionally drop a request before it reaches the server).
    const MAX_ATTEMPTS = 3;
    let failure: "network" | "server" | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await authFetch(token, "/api/ai-chat/message", {
          method: "POST",
          body: JSON.stringify({ message: text, sessionId, agentName: (currentAgent ?? historyAgent)?.name }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data = await res.json() as { message: ChatMessage; actions?: ChatAction[] };
          setMessages(prev => [...prev, data.message]);
          if (data.actions && data.actions.length > 0) {
            setActions(prev => {
              const next = new Map(prev).set(Number(data.message.id), data.actions!);
              // Persist action buttons so they survive page refresh
              try {
                if (user?.id) {
                  const obj: Record<string, ChatAction[]> = {};
                  next.forEach((v, k) => { obj[String(k)] = v; });
                  localStorage.setItem(`chat_message_actions_${user.id}`, JSON.stringify(obj));
                }
              } catch { /* ignore */ }
              return next;
            });
          }
          failure = null;
          break;
        }
        // 502/503/504 = transient proxy/gateway hiccup → retry; other codes → stop
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          failure = "network";
        } else {
          failure = "server";
          break;
        }
      } catch {
        failure = "network"; // thrown fetch = connection dropped or timed out
      }
      // backoff before the next attempt (0.8s, then 1.6s)
      if (attempt < MAX_ATTEMPTS && failure === "network") {
        await new Promise(r => setTimeout(r, attempt * 800));
      }
    }

    if (failure) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: failure === "network"
          ? "❌ ارتباط اینترنت لحظه‌ای قطع شد و تلاش مجدد هم نتیجه نداد. لطفاً اتصالت رو بررسی کن و همین پیام رو دوباره بفرست."
          : "❌ سرور موقتاً پاسخ نداد. لطفاً یک لحظه بعد دوباره همین پیام را بفرست.",
        createdAt: new Date().toISOString(),
      }]);
    }

    setTyping(false);
  }

  async function clearHistory() {
    if (!token || !confirm("تاریخچه چت پاک بشه؟")) return;
    await authFetch(token, "/api/ai-chat/history", { method: "DELETE" });
    localStorage.removeItem("proactiveLastShown");
    localStorage.removeItem("proactivePending");
    try { if (user?.id) localStorage.removeItem(`chat_message_actions_${user.id}`); } catch { /* ignore */ }
    setMessages([]);
    setActions(new Map());
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ minHeight: "100dvh", background: "var(--chat-loading-bg)" }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--gold-primary) transparent transparent transparent" }} />
        <p className="text-sm" style={{ color: "var(--chat-agent-name-color)" }}>در حال اتصال...</p>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex flex-col"
      style={{
        position: "fixed",
        top: viewportTop,
        left: 0,
        right: 0,
        height: viewportH,
        background: "var(--chat-bg)",
        maxWidth: 430,
        marginLeft: "auto",
        marginRight: "auto",
        overflow: "hidden",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
        style={{
          background: "var(--chat-header-bg)",
          borderColor: "var(--chat-header-border)",
          paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        }}
      >
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else navigate("/profile"); }}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
          style={{ background: "var(--chat-back-btn-bg)", color: "var(--chat-back-btn-color)" }}
        >
          <ArrowRight size={18} />
        </button>

        <div className="flex-1" />

        {/* profile group — last in JSX → LEFT in RTL */}
        <div className="flex items-center gap-2.5">
          {/* text first in flex → RIGHT side in RTL */}
          <div className="min-w-0">
            <div className="flex items-center justify-end gap-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <circle cx="12" cy="12" r="12" fill="#3b82f6" />
                <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-bold text-sm leading-tight" style={{ color: "var(--chat-title-color)" }}>پشتیبانی آکادمی شیوافر</span>
            </div>
            <p className="text-xs mt-0.5 text-left" style={{ color: "#22c55e" }}>آنلاین</p>
          </div>
          {/* avatar second in flex → LEFT side in RTL — always fixed brand photo */}
          <div className="relative shrink-0">
            <img
              src={FALLBACK_AVATAR}
              alt="پشتیبانی"
              loading="eager"
              className="rounded-full object-cover"
              style={{ width: 42, height: 42, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              onClick={() => setZoomedAgent("bot")}
            />
            <span
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
              style={{ background: "#22c55e", borderColor: "var(--chat-online-dot-border)", boxShadow: "0 0 6px rgba(34,197,94,0.7)" }}
            />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {messages.length === 0 && !typing && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <AgentAvatar agent={currentAgent ?? historyAgent} size={64} onClick={() => setZoomedAgent(currentAgent ?? historyAgent)} />
            <div className="text-center">
              <p className="font-bold text-base" style={{ color: "var(--chat-title-color)" }}>{(currentAgent ?? historyAgent)?.name ?? "پشتیبانی شیوافر"}</p>
              <p className="text-sm mt-1" style={{ color: "var(--chat-agent-name-color)" }}>سلام! چطور می‌تونم کمکت کنم؟ 😊</p>
            </div>
          </div>
        )}

        {messages.map(msg => {
          const msgActions = msg.role === "assistant" ? (actions.get(Number(msg.id)) ?? []) : [];
          const msgAgent = agentForMsg(Number(msg.id));
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row" : "flex-row-reverse"}`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 mb-1">
                  <AgentAvatar agent={msgAgent} size={30} onClick={() => setZoomedAgent(msgAgent)} />
                </div>
              )}
              <div className="max-w-[78%] flex flex-col" style={msg.role === "assistant" ? { alignItems: "flex-end" } : { alignItems: "flex-start" }}>
                {msg.role === "assistant" && msgAgent?.name && (
                  <p className="text-[11px] font-semibold mb-1 px-1" style={{ color: "var(--chat-agent-name-color)" }}>
                    {msgAgent.name}
                  </p>
                )}
                <div
                  className="w-full px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                          color: "white",
                          borderBottomRightRadius: "6px",
                        }
                      : {
                          background: "var(--chat-msg-bg)",
                          color: "var(--chat-msg-color)",
                          border: "1px solid var(--chat-msg-border)",
                          borderBottomLeftRadius: "6px",
                        }
                  }
                >
                  <MessageContent content={msg.content} navigate={navigate} />
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: msg.role === "user" ? "var(--chat-time-user)" : "var(--chat-time-agent)", textAlign: "left", direction: "ltr" }}
                  >
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
                {msgActions.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {msgActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => navigate(action.route)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                        style={{
                          background: "var(--gold-gradient)",
              color: "#fff",
              boxShadow: "0 2px 12px var(--gold-glow)",
                        }}
                      >
                        {action.label}
                        <ChevronLeft size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="flex items-end gap-2 flex-row-reverse">
            <div className="shrink-0 mb-1">
              <AgentAvatar agent={currentAgent ?? historyAgent} size={30} onClick={() => setZoomedAgent(currentAgent ?? historyAgent)} />
            </div>
            <div className="flex flex-col" style={{ alignItems: "flex-end" }}>
              {(currentAgent ?? historyAgent)?.name && (
                <p className="text-[11px] font-semibold mb-1 px-1 text-muted-foreground">
                  {(currentAgent ?? historyAgent)!.name} در حال نوشتن...
                </p>
              )}
              <div
                className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.05] dark:bg-white/[0.08]"
                style={{ borderBottomLeftRadius: "6px" }}
              >
                <TypingDots />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 py-3 flex items-center gap-2 border-t"
        style={{
          borderColor: "var(--chat-footer-border)",
          background: "var(--chat-footer-bg)",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            // auto-resize
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={e => {
            // Enter فقط خط جدید — ارسال فقط از طریق دکمه
            if (e.key === "Enter") {
              e.stopPropagation();
            }
          }}
          placeholder="پیام بنویس..."
          rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 outline-none resize-none"
          style={{
            background: "var(--chat-input-bg)",
            border: "1px solid var(--chat-input-border)",
            color: "var(--chat-input-color)",
            caretColor: "#a78bfa",
            fontSize: 16,
            minWidth: 0,
            lineHeight: "1.5",
            overflowY: "auto",
          }}
          disabled={typing}
          dir="rtl"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || typing}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-90 shrink-0"
          style={{
            background: "var(--gold-gradient)",
            opacity: input.trim() && !typing ? 1 : 0.35,
          }}
        >
          <Send size={16} style={{ color: "#ffffff" }} />
        </button>
      </div>

      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* ── Instagram-style avatar zoom ──────────────────────────────────── */}
      <AnimatePresence>
        {zoomedAgent !== null && (
          <AvatarZoom
            agent={zoomedAgent === "bot" ? null : zoomedAgent}
            onClose={() => setZoomedAgent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
