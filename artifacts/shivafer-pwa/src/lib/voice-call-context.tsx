import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useAudioPlayback } from "@workspace/integrations-openai-ai-react/audio";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type PhoneState = "idle" | "dialing" | "connected" | "ended";
export type TalkState  = "listening" | "user_speaking" | "confirming" | "sending" | "ai_speaking";
export type VadStatus  = "idle" | "calibrating" | "fingerprinting" | "locked";

/* ── SSE helpers ────────────────────────────────────────────────────────── */
const SSE_DELIMITER = /\r\n\r\n|\n\n|\r\r/g;
function readSseData(block: string): string | null {
  const lines = block.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const data  = lines.filter(l => l.startsWith("data:")).map(l => l.slice(5).replace(/^ /, "")).join("\n");
  return data || null;
}
function extractBlocks(buf: string): { blocks: string[]; remaining: string } {
  const blocks: string[] = [];
  let last = 0;
  SSE_DELIMITER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SSE_DELIMITER.exec(buf)) !== null) { blocks.push(buf.slice(last, m.index)); last = m.index + m[0].length; }
  return { blocks, remaining: buf.slice(last) };
}

/* ── End-of-turn confirmation ───────────────────────────────────────────────
 * When the user pauses mid-speech we don't auto-send. Instead we ask
 * «<name> عزیز، صحبتت تمام شد؟» and only send once they confirm — by tapping a
 * button, by saying a short affirmative, or (fallback) after a few more seconds
 * of silence. Speech bursts are captured as separate webm segments so a verbal
 * "آره"/"نه" can be classified and excluded from the message that's sent. */
const CONFIRM_AUTOSEND_MS       = 3500; // extra silence at the prompt → auto-send
const CONFIRM_ANSWER_SILENCE_MS = 600;  // silence that ends a short verbal answer (snappy)

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res((reader.result as string).split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

function normalizeFa(s: string): string {
  return s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").trim();
}

// Short affirmative ("آره" / "بله" / "تمام شد" / "همینه" …) → user is done.
const AFFIRM_RE    = /(آره|اره|بله|بعله|بعل[هی]|اوهوم|آهان|تموم|تمام|تمومه|همینه|همین بود|همینا بود|کافیه|اوکیه|اوکی|درسته|گفتم دیگه|حرفم تموم|صحبتم تموم|تمومش|بفرستش|بفرستید|بفرستین|بفرست|ارسالش|ارسال)/;
const AFFIRM_STRIP = /(آره|اره|بله|بعله|بعل[هی]|اوهوم|آهان|تموم|تمام|تمومه|شده|شد|دیگه|همینه|همین|بودش|بود|کافیه|اوکیه|اوکی|درسته|گفتم|حرفم|صحبتم|بفرستش|بفرستید|بفرستین|بفرست|ارسالش|ارسال|بزنش|بزن|بکنش|بکن|کنش|کن|بابا|آقا|خانم|خب|که)/g;
// Short negative ("نه" / "هنوز" / "صبر کن" …) → user is NOT done yet.
const NEG_RE       = /(نه|نخیر|هنوز|نگفتم|نشده|تموم نشد|تمام نشد|صبر کن|وایسا|وایستا|بذار|بزار|ادامه|مونده|یه چیز دیگه|یه لحظه|یک لحظه)/;

function isAffirmative(raw: string): boolean {
  const t = normalizeFa(raw);
  if (!t || !AFFIRM_RE.test(t)) return false;
  // Must be essentially ONLY an affirmation, so "آره راستی می‌خواستم بپرسم..."
  // (a continuation that merely starts with "آره") is NOT treated as "done".
  const leftover = t.replace(AFFIRM_STRIP, "").replace(/[\s.،,!?؟]/g, "");
  return leftover.length <= 3;
}

function isNegative(raw: string): boolean {
  const t = normalizeFa(raw);
  if (!t || !NEG_RE.test(t)) return false;
  // Only a short, mostly-negative utterance counts as "no" (so we can discard it).
  // Longer speech that happens to contain "نه" is kept as real content instead.
  return t.replace(/[\s.،,!?؟]/g, "").length <= 14;
}

/* ── Ring tone (Web Audio API, no external files) ───────────────────────── */
function createRingTone(ctx: AudioContext): () => void {
  const nodes: AudioNode[] = [];
  const gain = ctx.createGain();
  gain.gain.value = 0.12;
  gain.connect(ctx.destination);
  nodes.push(gain);

  [440, 480].forEach(freq => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start();
    nodes.push(osc);
  });

  // Ring pattern: 0.9s on, 2.5s off
  const RING = 0.9, GAP = 2.5, PERIOD = RING + GAP;
  function schedulePeriod(t: number) {
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.setValueAtTime(0,     t + RING);
  }
  const now = ctx.currentTime;
  for (let i = 0; i < 4; i++) schedulePeriod(now + i * PERIOD);

  return () => { nodes.forEach(n => { try { (n as OscillatorNode).stop?.(); n.disconnect(); } catch { /* ignore */ } }); };
}

/* ── Timer ──────────────────────────────────────────────────────────────── */
function useCallTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) { setSecs(0); ref.current = setInterval(() => setSecs(s => s + 1), 1000); }
    else { if (ref.current) clearInterval(ref.current); }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ── Gating ─────────────────────────────────────────────────────────────── */
export interface GateInfo {
  message: string;
  nextCallAllowedAt: string | null;
}

/* ── Context shape ──────────────────────────────────────────────────────── */
interface VoiceCallContextValue {
  phoneState: PhoneState;
  talkState: TalkState;
  liveText: string;
  lastAiText: string;
  errorMsg: string;
  vadStatus: VadStatus;
  ctaUrl: string;
  ctaLabel: string;
  isMuted: boolean;
  timer: string;
  /** Transient on-screen nudge shown (addressing the user by name) when they try
   *  to talk while Sara is still speaking. Sara keeps talking; this just asks them to wait. */
  waitNudge: string;
  /** On-screen end-of-turn question («... صحبتت تمام شد؟»). Empty unless we're
   *  waiting for the user to confirm their turn is finished. */
  confirmPrompt: string;
  /** User confirmed their turn is done → send it to Sara. */
  confirmDone: () => void;
  /** User says they're not done → dismiss the prompt and keep listening. */
  confirmContinue: () => void;
  /** True while a call is alive (dialing or connected) — used by the floating banner. */
  isCallActive: boolean;
  /** Set when the user tried to call but is in cooldown / over the weekly cap. */
  gateBlocked: GateInfo | null;
  /** Set after a call ends — the cooldown before the next allowed call. */
  nextCallInfo: GateInfo | null;
  /** Dismiss a blocked notice (e.g. when leaving the page). */
  dismissGate: () => void;
  startCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function useVoiceCall(): VoiceCallContextValue {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) throw new Error("useVoiceCall must be used within VoiceCallProvider");
  return ctx;
}

/* ── Provider ───────────────────────────────────────────────────────────── */
export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();

  const [phoneState,   setPhoneState]   = useState<PhoneState>("idle");
  const [talkState,    setTalkState]    = useState<TalkState>("listening");
  const [liveText,     setLiveText]     = useState("");
  const [lastAiText,   setLastAiText]   = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [vadStatus,    setVadStatus]    = useState<VadStatus>("idle");
  const [ctaUrl,       setCtaUrl]       = useState("");
  const [ctaLabel,     setCtaLabel]     = useState("");
  const [isMuted,      setIsMuted]      = useState(false);
  const [waitNudge,    setWaitNudge]    = useState("");
  const [confirmPrompt, setConfirmPrompt] = useState("");
  const [gateBlocked,  setGateBlocked]  = useState<GateInfo | null>(null);
  const [nextCallInfo, setNextCallInfo] = useState<GateInfo | null>(null);

  const abortRef        = useRef<AbortController | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const mediaRecRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const rafRef          = useRef<number>(0);
  const speechStartRef  = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const isSpeakingRef   = useRef(false);
  const talkStateRef    = useRef<TalkState>("listening");
  const ringStopRef     = useRef<(() => void) | null>(null);
  const isMutedRef      = useRef(false);
  const callSessionRef  = useRef(0);   // bumped each start/end; guards async startCall steps
  const gateBlockedRef  = useRef(false); // set if the server blocks the intro mid-stream

  // wait-nudge refs (shown when the user talks over Sara — she keeps speaking)
  const userNameRef          = useRef("");
  const waitNudgeTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitNudgeCooldownRef = useRef(0);

  // typewriter refs
  const pendingTextRef   = useRef("");   // full transcript buffered from GPT
  const typedCountRef    = useRef(0);    // how many chars shown so far
  const typeIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioStartedRef  = useRef(false);

  // playback-tail tracking: keep talkState = "ai_speaking" until Sara's buffered
  // TTS audio has actually finished playing (not just when the SSE stream ends),
  // so the user can't be "heard" / capture a turn during her audio tail.
  const audioPlayedRef         = useRef(false); // any audio chunk played this turn
  const awaitingPlaybackEndRef = useRef(false); // stream done, waiting for audio drain
  const aiSpeakingSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null); // guards stuck ai_speaking

  // end-of-turn confirmation refs
  const segmentsRef     = useRef<string[]>([]);            // base64 content bursts for the current turn
  const turnResolvedRef = useRef(false);                   // guard: the turn has been sent (no double-send)
  const busyRef         = useRef(false);                   // a burst is being stopped/transcribed → pause VAD
  const burstKindRef    = useRef<"content" | "answer">("content"); // what the current burst is
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // auto-send fallback timer
  const finalizeTurnRef    = useRef<(segs: string[]) => void>(() => {});
  const enterConfirmingRef = useRef<() => void>(() => {});
  const classifyAnswerRef  = useRef<(b64: string) => void>(() => {});

  const WORKLET_PATH = `${import.meta.env.BASE_URL}audio-playback-worklet.js`.replace(/\/+/g, "/").replace(":/", "://");
  const playback = useAudioPlayback(WORKLET_PATH);

  const timer = useCallTimer(phoneState === "connected");

  // keep ref in sync so VAD closure always reads latest
  useEffect(() => { talkStateRef.current = talkState; }, [talkState]);

  // Finalize Sara's turn only once her buffered audio has truly drained. The
  // worklet posts "ended" → playback.state "idle" only after streamComplete +
  // full drain, so this fires exactly when she stops speaking aloud.
  useEffect(() => {
    if (playback.state === "idle" && awaitingPlaybackEndRef.current) {
      awaitingPlaybackEndRef.current = false;
    if (aiSpeakingSafetyRef.current) { clearTimeout(aiSpeakingSafetyRef.current); aiSpeakingSafetyRef.current = null; }
      if (aiSpeakingSafetyRef.current) { clearTimeout(aiSpeakingSafetyRef.current); aiSpeakingSafetyRef.current = null; }
      setTalkState("listening");
      setWaitNudge("");               // Sara finished — clear any "please wait" nudge
      waitNudgeCooldownRef.current = 0; // allow a fresh nudge on her next turn
    }
  }, [playback.state]);
  // keep the user's first name available inside the (memoized) VAD closure
  useEffect(() => { userNameRef.current = user?.name?.split(" ")[0] ?? ""; }, [user]);

  /* ── wait nudge (user talked over Sara → she keeps talking, we ask them to wait) ── */
  const triggerWaitNudge = useCallback(() => {
    const now = Date.now();
    if (now < waitNudgeCooldownRef.current) return;   // throttle: don't spam every frame
    waitNudgeCooldownRef.current = now + 7000;
    const first = userNameRef.current.trim();
    const who   = first ? `${first} عزیز` : "عزیزم";
    setWaitNudge(`${who}، لطفاً منتظر بمان صحبت‌های سارا تمام بشه، بعد درخواست بعدی‌ات رو بگو.`);
    if (waitNudgeTimerRef.current) clearTimeout(waitNudgeTimerRef.current);
    waitNudgeTimerRef.current = setTimeout(() => setWaitNudge(""), 4500);
  }, []);

  /* ── typewriter helpers ───────────────────────────────────────────────── */
  const stopTypewriter = useCallback(() => {
    if (typeIntervalRef.current) { clearInterval(typeIntervalRef.current); typeIntervalRef.current = null; }
  }, []);

  const startTypewriter = useCallback(() => {
    if (typeIntervalRef.current) return;
    // ~12 chars/sec to match speech rhythm
    typeIntervalRef.current = setInterval(() => {
      const full  = pendingTextRef.current;
      const shown = typedCountRef.current;
      if (shown >= full.length) return;
      const next = Math.min(shown + 1, full.length);
      typedCountRef.current = next;
      setLiveText(full.slice(0, next));
    }, 85);
  }, []);

  /* ── stream SSE response ──────────────────────────────────────────────── */
  const streamAdvisor = useCallback(async (body: object) => {
    console.log("[VoiceAdvisor] streamAdvisor called", { hasToken: !!token, bodyKeys: Object.keys(body) });
    if (!token) {
      console.warn("[VoiceAdvisor] streamAdvisor: no token, aborting");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // reset typewriter state
    stopTypewriter();
    pendingTextRef.current  = "";
    typedCountRef.current   = 0;
    audioStartedRef.current = false;
    audioPlayedRef.current         = false;
    awaitingPlaybackEndRef.current = false;
    setLiveText("");
    setErrorMsg("");

    try {
      // Init audio playback INSIDE the try block so any failure (e.g. worklet 404,
      // AudioContext creation error) is caught and surfaces a user-facing message
      // instead of silently leaving the UI stuck in "ai_speaking" state.
      console.log("[VoiceAdvisor] initializing audio playback...");
      await playback.init();
      playback.clear();
      console.log("[VoiceAdvisor] audio playback ready, sending POST /chat");
      // Establish the connection with a small auto-retry: on weak mobile networks the
      // initial POST can drop before any data arrives (iOS surfaces this as "Load failed").
      // We retry ONLY the connection — never mid-stream — to avoid duplicate server turns.
      let res: Response | undefined;
      for (let attempt = 0; ; attempt++) {
        try {
          res = await fetch(`/api/openai/voice-advisor/chat?token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
        } catch (netErr) {
          if ((netErr as Error).name === "AbortError") throw netErr;
          if (attempt >= 2) throw netErr;
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          if (ctrl.signal.aborted) return;
          continue;
        }
        if (res.ok) break;
        if (res.status >= 500 && attempt < 2) {
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          if (ctrl.signal.aborted) return;
          continue;
        }
        throw new Error(`خطا: ${res.status}`);
      }
      if (!res) return;

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let aiText = "";

      const process = (blocks: string[]) => {
        // If this turn was aborted (e.g. the user barged in), ignore any
        // already-buffered events so a stale `done`/`transcript` can't flip the
        // talk state back to listening/ai_speaking after we've started capturing.
        if (ctrl.signal.aborted) return;
        for (const block of blocks) {
          const raw = readSseData(block);
          if (!raw) continue;
          let evt: Record<string, unknown>;
          try { evt = JSON.parse(raw); } catch { continue; }

          if (evt.done) {
            if (aiText) setLastAiText(aiText);
            // let typewriter finish naturally — don't force-clear liveText
            playback.signalComplete();
            if (audioPlayedRef.current) {
              // Stay in "ai_speaking" until the buffered audio actually drains;
              // the playback-state effect flips us to "listening" then. This keeps
              // the user from being captured during Sara's audio tail.
              awaitingPlaybackEndRef.current = true;
              // Safety: if audio worklet never signals done (iOS AudioContext issue), unblock after 18s
              if (aiSpeakingSafetyRef.current) clearTimeout(aiSpeakingSafetyRef.current);
              aiSpeakingSafetyRef.current = setTimeout(() => {
                if (awaitingPlaybackEndRef.current) {
                  awaitingPlaybackEndRef.current = false;
                  setTalkState("listening");
                  setWaitNudge("");
                }
              }, 18000);
            } else {
              // No audio this turn (text-only) — finalize immediately.
              setTalkState("listening");
              setWaitNudge("");
              waitNudgeCooldownRef.current = 0;
            }
            return;
          }
          if (evt.type === "transcript") {
            aiText += evt.data as string;
            pendingTextRef.current += evt.data as string;
            // start typewriter on first transcript chunk (works even without audio)
            if (!audioStartedRef.current) {
              audioStartedRef.current = true;
              setTalkState("ai_speaking");
              startTypewriter();
            }
          }
          if (evt.type === "audio") {
            audioPlayedRef.current = true;
            // Ensure we're in "ai_speaking" even if audio arrives before the first
            // transcript chunk — otherwise the user could be captured in that gap.
            if (!audioStartedRef.current) {
              audioStartedRef.current = true;
              setTalkState("ai_speaking");
            }
            playback.pushAudio(evt.data as string);
          }
          if (evt.type === "cta" && typeof evt.url === "string") {
            setCtaUrl(evt.url);
            setCtaLabel((evt.label as string) || "ثبت‌نام در دورهٔ MTP");
          }
          if (evt.type === "blocked") {
            gateBlockedRef.current = true;
            setConfirmPrompt("");
            setGateBlocked({
              message: (evt.message as string) || "",
              nextCallAllowedAt: (evt.nextCallAllowedAt as string) ?? null,
            });
            setPhoneState("idle");
            ctrl.abort();
            return;
          }
          if (evt.type === "error") throw new Error(evt.error as string);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { blocks, remaining } = extractBlocks(buf);
        buf = remaining;
        process(blocks);
      }
      process(extractBlocks(buf + decoder.decode()).blocks);
    } catch (err) {
      stopTypewriter();
      const e = err as Error;
      if (e.name === "AbortError") return;
      // TypeError = network-layer failure (iOS "Load failed" / "Failed to fetch") → weak connection.
      // Anything else (server status / server-emitted error) → generic transient error.
      const friendly = (e instanceof TypeError || e.name === "TypeError")
        ? "اینترنتت ضعیف شد 📶 لطفاً دوباره پیامت رو بگو"
        : "یه مشکل موقت پیش اومد — لطفاً دوباره پیامت رو بگو";
      setErrorMsg(friendly);
      setConfirmPrompt("");
      setTalkState("listening");
    }
  }, [token, playback, stopTypewriter, startTypewriter]);

  /* ── End-of-turn confirmation logic ───────────────────────────────────────
   * Speech is captured as separate webm "segments" (one per burst). When the
   * user pauses we ask «صحبتت تمام شد؟» instead of auto-sending; the turn is
   * sent only on confirm (tap / verbal "آره" / silence-timeout). */
  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
  }, []);

  // STT-only call used to classify a short verbal answer to the prompt.
  const transcribeAudio = useCallback(async (b64: string): Promise<string> => {
    if (!token) return "";
    const r = await fetch(`/api/openai/voice-advisor/transcribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: b64 }),
    });
    if (!r.ok) throw new Error("transcribe failed");
    const data = await r.json();
    return (data?.transcript as string) || "";
  }, [token]);

  // Send the captured turn to Sara (once). Stops any lingering recorder first.
  const finalizeTurn = useCallback((segs: string[]) => {
    if (turnResolvedRef.current) return;
    clearConfirmTimer();
    setConfirmPrompt("");
    // tidy up any recorder still running (e.g. user tapped «بله» mid-answer)
    const mr = mediaRecRef.current;
    if (mr && mr.state === "recording") { mr.onstop = null; mr.stop(); }
    mediaRecRef.current = null;
    chunksRef.current = [];
    isSpeakingRef.current = false;
    speechStartRef.current = 0;
    silenceStartRef.current = 0;
    busyRef.current = false;
    const list = segs.filter(Boolean);
    if (list.length === 0) { setTalkState("listening"); return; }
    turnResolvedRef.current = true;
    segmentsRef.current = [];
    setTalkState("sending");
    const body = list.length === 1 ? { audio: list[0] } : { audioSegments: list };
    streamAdvisor(body).finally(() => { turnResolvedRef.current = false; });
  }, [clearConfirmTimer, streamAdvisor]);
  useEffect(() => { finalizeTurnRef.current = finalizeTurn; }, [finalizeTurn]);

  // Show the prompt and arm the auto-send fallback timer.
  const enterConfirming = useCallback(() => {
    if (turnResolvedRef.current) return;
    if (segmentsRef.current.length === 0) { setTalkState("listening"); return; }
    setTalkState("confirming");
    const first = userNameRef.current.trim();
    const who   = first ? `${first} عزیز` : "عزیزم";
    setConfirmPrompt(`${who}، صحبتت تمام شد؟`);
    clearConfirmTimer();
    confirmTimerRef.current = setTimeout(() => {
      finalizeTurnRef.current(segmentsRef.current.slice());
    }, CONFIRM_AUTOSEND_MS);
  }, [clearConfirmTimer]);
  useEffect(() => { enterConfirmingRef.current = enterConfirming; }, [enterConfirming]);

  // Classify a burst recorded while the prompt was up: verbal "آره" → send,
  // verbal "نه" → discard & keep listening, anything else → real content.
  const classifyAnswer = useCallback(async (b64: string) => {
    busyRef.current = true;
    // Optimistic feedback: the instant the spoken answer ends, drop the prompt
    // and show "processing" — so a verbal یس/نو feels exactly as snappy as
    // tapping the buttons (no lingering "گوش می‌دم" while we transcribe).
    clearConfirmTimer();
    setConfirmPrompt("");
    setTalkState("sending");
    try {
      if (turnResolvedRef.current) return;
      const t = (await transcribeAudio(b64)).trim();
      if (turnResolvedRef.current) return;
      if (isAffirmative(t)) {
        finalizeTurnRef.current(segmentsRef.current.slice());  // exclude the "آره" burst
        return;
      }
      if (isNegative(t)) {
        setTalkState("listening");   // wait for the continuation
        return;
      }
      // real continuation content → keep it and re-ask
      segmentsRef.current.push(b64);
      enterConfirmingRef.current();
    } catch {
      // transcription failed — don't lose audio; treat as content & re-ask
      segmentsRef.current.push(b64);
      enterConfirmingRef.current();
    } finally {
      busyRef.current = false;
    }
  }, [transcribeAudio, clearConfirmTimer]);
  useEffect(() => { classifyAnswerRef.current = classifyAnswer; }, [classifyAnswer]);

  const confirmDone = useCallback(() => {
    finalizeTurnRef.current(segmentsRef.current.slice());
  }, []);

  const confirmContinue = useCallback(() => {
    clearConfirmTimer();
    setConfirmPrompt("");
    if (talkStateRef.current === "confirming") setTalkState("listening");
  }, [clearConfirmTimer]);

  /* ── VAD polling (adaptive noise floor + voice fingerprint) ───────────── */
  const startVAD = useCallback(async (preAcquiredStream?: MediaStream) => {
    try {
      const stream = preAcquiredStream ?? await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }, video: false });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount); // 1024 bins

      // Voice frequency range: 100–3500 Hz
      // At 16 kHz, bin width = 16000/2048 ≈ 7.8 Hz → bins 13–449
      const VBIN_START = 13;
      const VBIN_END   = 449;
      const VBIN_COUNT = VBIN_END - VBIN_START;

      // ── Phase 1: Noise floor calibration ──────────────────────────────
      const NOISE_CALIB_MS  = 1500;
      const SPEECH_THRESH_MIN = 0.022;
      // Upper bound so an echoey calibration window (Sara's intro plays while we
      // calibrate, now that VAD starts before the greeting) can't permanently
      // desensitize the mic. echoCancellation removes most of it; this caps the rest.
      const SPEECH_THRESH_MAX = 0.06;
      let noiseSamples: number[] = [];
      let calibrated    = false;
      let calibStart    = Date.now();
      let noiseFloor    = SPEECH_THRESH_MIN;
      setVadStatus("calibrating");

      // ── Phase 2: Voice fingerprint ─────────────────────────────────────
      const FP_CALIB_MS  = 700;  // collect 700ms of first speech
      // Lowered from 0.70 to 0.55: the previous threshold was too strict.
      // Users speaking at different volumes, angles, or after a pause often
      // don't match their own fingerprint at 70% — causing speech to be silently
      // ignored. 0.55 still blocks unrelated ambient noise while accepting the
      // same speaker in natural variation.
      const FP_MIN_SIM   = 0.55; // cosine similarity threshold
      let voicePrint: Float32Array | null = null;
      let fpFrames: Float32Array[]        = [];
      let fpReady       = false;
      let fpCalibStart  = 0;

      function cosineSim(a: Float32Array, b: Float32Array): number {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
        return (na === 0 || nb === 0) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
      }

      function getVoiceSpectrum(): Float32Array {
        analyser.getByteFrequencyData(freqData);
        const slice = freqData.slice(VBIN_START, VBIN_END);
        const sp    = new Float32Array(slice);
        const mx    = Math.max(...sp, 1);
        for (let i = 0; i < sp.length; i++) sp[i] /= mx;
        return sp;
      }

      const SPEECH_HOLD_MS = 300;
      const SILENCE_MS     = 1600;

      // ── Talk-over detection (user speaks while Sara talks) ─────────────
      // Sara does NOT stop; we just show a gentle "please wait" nudge.
      const BARGE_HOLD_MS = 300;   // sustained speech before we show the nudge
      let bargeStart = 0;

      // Begin recording one speech burst. `kind` distinguishes the first/normal
      // content bursts from a short burst spoken in answer to the «تمام شد؟» prompt.
      function startBurst(kind: "content" | "answer") {
        burstKindRef.current = kind;
        isSpeakingRef.current = true;
        silenceStartRef.current = 0;
        fpCalibStart = fpCalibStart || Date.now();
        if (kind === "answer" && confirmTimerRef.current) {
          clearTimeout(confirmTimerRef.current);   // user is answering → cancel auto-send
          confirmTimerRef.current = null;
        }
        setTalkState("user_speaking");
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
        chunksRef.current = [];
        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start(100);
        mediaRecRef.current = mr;
      }

      // End the current burst: capture the webm blob, then either stash it as
      // content (and ask «تمام شد؟») or classify it as a verbal yes/no answer.
      function endBurst() {
        isSpeakingRef.current = false;
        speechStartRef.current = 0;
        silenceStartRef.current = 0;
        const mr = mediaRecRef.current;
        const kind = burstKindRef.current;
        if (mr && mr.state === "recording") {
          busyRef.current = true;   // pause VAD until this burst is handled
          mr.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
            mediaRecRef.current = null;
            chunksRef.current = [];
            if (blob.size < 300) {
              busyRef.current = false;
              if (kind === "answer") enterConfirmingRef.current();
              else if (talkStateRef.current === "user_speaking") setTalkState("listening");
              return;
            }
            try {
              const base64 = await blobToBase64(blob);
              if (kind === "content") {
                segmentsRef.current.push(base64);
                busyRef.current = false;
                finalizeTurnRef.current(segmentsRef.current.slice());
              } else {
                // classifyAnswer owns busyRef from here (resets it when done)
                await classifyAnswerRef.current(base64);
              }
            } catch {
              // blob conversion failed — never leave VAD frozen
              busyRef.current = false;
              if (talkStateRef.current === "user_speaking") setTalkState("listening");
            }
          };
          mr.stop();
        } else {
          if (kind === "answer") enterConfirmingRef.current();
          else if (talkStateRef.current === "user_speaking") setTalkState("listening");
        }
      }

      function poll() {
        rafRef.current = requestAnimationFrame(poll);
        const state = talkStateRef.current;

        // ── Muted: ignore everything, discard any in-progress capture ──────
        if (isMutedRef.current) {
          const mr = mediaRecRef.current;
          if (mr && mr.state === "recording") { mr.onstop = null; mr.stop(); }
          mediaRecRef.current = null;
          chunksRef.current = [];
          // also drop any pending end-of-turn confirmation
          if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
          segmentsRef.current = [];
          busyRef.current = false;
          setConfirmPrompt("");
          if (isSpeakingRef.current) {
            isSpeakingRef.current = false;
            speechStartRef.current = 0;
            silenceStartRef.current = 0;
          }
          if (talkStateRef.current === "user_speaking" || talkStateRef.current === "confirming") setTalkState("listening");
          return;
        }

        if (state === "sending") return;
        // A burst is being stopped / transcribed → don't start a new capture.
        if (busyRef.current) return;

        // ── While Sara is speaking: do NOT interrupt her. If the user starts
        //    talking over her, Sara keeps speaking and we surface a gentle
        //    on-screen nudge (by name) asking them to wait until she's done. ──
        if (state === "ai_speaking") {
          if (!calibrated) return;                 // need a noise floor first
          analyser.getByteTimeDomainData(timeData);
          let bsum = 0;
          for (let i = 0; i < timeData.length; i++) { const v = (timeData[i] - 128) / 128; bsum += v * v; }
          const brms = Math.sqrt(bsum / timeData.length);
          const bnow = Date.now();
          // Require clearly-loud speech (above ambient + Sara's echo-cancelled playback).
          const BARGE_THRESH = Math.max(noiseFloor * 1.7, SPEECH_THRESH_MIN * 2);
          if (brms > BARGE_THRESH) {
            // Once we know the user's voice, require it to match — so Sara's own
            // audio or background noise can't trigger the nudge on its own.
            if (fpReady && voicePrint && cosineSim(voicePrint, getVoiceSpectrum()) < FP_MIN_SIM) {
              bargeStart = 0;
              return;
            }
            if (!bargeStart) bargeStart = bnow;
            if (bnow - bargeStart > BARGE_HOLD_MS) {
              bargeStart = 0;
              // Sara keeps talking — just nudge the user to wait their turn.
              triggerWaitNudge();
            }
          } else {
            bargeStart = 0;
          }
          return;
        }

        analyser.getByteTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) { const v = (timeData[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / timeData.length);
        const now = Date.now();

        // ── Noise calibration phase (first 1.5 s) ──────────────────────
        if (!calibrated) {
          noiseSamples.push(rms);
          if (now - calibStart > NOISE_CALIB_MS) {
            noiseSamples.sort((a, b) => a - b);
            const p80 = noiseSamples[Math.floor(noiseSamples.length * 0.80)];
            noiseFloor = Math.min(SPEECH_THRESH_MAX, Math.max(SPEECH_THRESH_MIN, p80 * 3.8));
            calibrated = true;
            setVadStatus(fpReady ? "locked" : "fingerprinting");
          }
          return; // don't process speech yet
        }

        const SPEECH_THRESH = noiseFloor;

        if (!isSpeakingRef.current) {
          if (rms > SPEECH_THRESH) {
            // ── Fingerprint gate: reject non-matching voices ──────────
            if (fpReady && voicePrint) {
              const sp  = getVoiceSpectrum();
              const sim = cosineSim(voicePrint, sp);
              if (sim < FP_MIN_SIM) {
                speechStartRef.current = 0;
                return;
              }
            }
            if (!speechStartRef.current) speechStartRef.current = now;
            if (now - speechStartRef.current > SPEECH_HOLD_MS) {
              startBurst("content");
            }
          } else {
            speechStartRef.current = 0;
          }
        } else {
          // ── Collect fingerprint frames during first speech ──────────
          if (!fpReady) {
            fpFrames.push(getVoiceSpectrum());
            if (fpCalibStart && now - fpCalibStart > FP_CALIB_MS && fpFrames.length >= 6) {
              const fp = new Float32Array(VBIN_COUNT);
              for (const fr of fpFrames) for (let i = 0; i < VBIN_COUNT; i++) fp[i] += fr[i];
              for (let i = 0; i < VBIN_COUNT; i++) fp[i] /= fpFrames.length;
              voicePrint = fp;
              fpReady    = true;
              fpFrames   = [];
              setVadStatus("locked");
            }
          }

          if (rms < SPEECH_THRESH) {
            if (!silenceStartRef.current) silenceStartRef.current = now;
            // A short verbal answer ("آره"/"نه") ends faster than normal content.
            const endSilence = burstKindRef.current === "answer" ? CONFIRM_ANSWER_SILENCE_MS : SILENCE_MS;
            if (now - silenceStartRef.current > endSilence) {
              endBurst();
            }
          } else {
            silenceStartRef.current = 0;
          }
        }
      }
      poll();
    } catch {
      setErrorMsg("دسترسی به میکروفون رد شد — لطفاً اجازه دسترسی بده");
    }
  }, [streamAdvisor, triggerWaitNudge]);

  /* ── stop VAD & mic ───────────────────────────────────────────────────── */
  const stopVAD = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    const mr = mediaRecRef.current;
    if (mr) mr.onstop = null;
    mr?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    streamRef.current  = null;
    analyserRef.current = null;
    mediaRecRef.current = null;
    audioCtxRef.current = null;
    isSpeakingRef.current = false;
    speechStartRef.current = 0;
    silenceStartRef.current = 0;
    segmentsRef.current = [];
    burstKindRef.current = "content";
    busyRef.current = false;
    turnResolvedRef.current = false;
    setConfirmPrompt("");
  }, []);

  /* ── toggle mic mute ──────────────────────────────────────────────────── */
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      isMutedRef.current = next;
      streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
  }, []);

  /* ── start call ───────────────────────────────────────────────────────── */
  const startCall = useCallback(async () => {
    // New call session — invalidates any in-flight start/dialing sequence.
    const session = ++callSessionRef.current;
    gateBlockedRef.current = false;
    console.log("[VoiceAdvisor] startCall: begin, session=", session, "hasToken=", !!token);

    // ── iOS AudioContext fix: init BEFORE any await so iOS keeps user-gesture context ──
    // If called after getUserMedia/fetch awaits, iOS forgets the gesture and audio never plays.
    try {
      console.log("[VoiceAdvisor] startCall: pre-init AudioContext (iOS fix)");
      await playback.init();
      console.log("[VoiceAdvisor] startCall: AudioContext pre-init OK");
    } catch (e) {
      console.warn("[VoiceAdvisor] startCall: AudioContext pre-init failed (will retry)", e);
    }

    // ── Gate pre-check: don't even ring if the user is in cooldown / over cap ──
    if (token) {
      try {
        console.log("[VoiceAdvisor] startCall: checking gate...");
        const r = await fetch(`/api/openai/voice-advisor/gate?token=${encodeURIComponent(token)}`);
        if (r.ok) {
          const g = await r.json();
          console.log("[VoiceAdvisor] startCall: gate result", g);
          if (callSessionRef.current !== session) { console.log("[VoiceAdvisor] startCall: session changed after gate, aborting"); return; }
          if (!g.allowed) {
            console.log("[VoiceAdvisor] startCall: gate blocked", g.message);
            setGateBlocked({ message: g.message ?? "", nextCallAllowedAt: g.nextCallAllowedAt ?? null });
            setPhoneState("idle");
            return;
          }
          console.log("[VoiceAdvisor] startCall: gate allowed ✅");
        }
      } catch (e) { console.warn("[VoiceAdvisor] startCall: gate check failed, proceeding anyway", e); }
    }
    setGateBlocked(null);
    setNextCallInfo(null);

    setPhoneState("dialing");
    setTalkState("listening");
    setLiveText("");
    setLastAiText("");
    setErrorMsg("");
    setCtaUrl("");
    setCtaLabel("");
    setIsMuted(false);
    isMutedRef.current = false;

    // Request mic permission NOW (during dialing) so the dialog appears
    // before Sara speaks — avoids audio stutter when user taps Allow mid-speech
    let micStream: MediaStream | null = null;
    try {
      console.log("[VoiceAdvisor] startCall: requesting microphone...");
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }, video: false });
      streamRef.current = micStream;
      console.log("[VoiceAdvisor] startCall: microphone acquired ✅");
    } catch (e) {
      console.error("[VoiceAdvisor] startCall: microphone access denied", e);
      if (callSessionRef.current !== session) return;
      setErrorMsg("دسترسی به میکروفون رد شد — لطفاً اجازه دسترسی بده");
      setPhoneState("idle");
      return;
    }

    // Hung up (e.g. via floating banner) while waiting for mic permission.
    if (callSessionRef.current !== session) { micStream.getTracks().forEach(t => t.stop()); return; }

    // Ring tone (plays while user sees/acts on permission dialog)
    const ringCtx = new AudioContext();
    ringStopRef.current = createRingTone(ringCtx);

    // After ~4 seconds (≈ 2 rings), connect
    await new Promise(r => setTimeout(r, 4000));

    // Stop ring
    ringStopRef.current?.();
    ringCtx.close().catch(() => {});
    ringStopRef.current = null;

    // Hung up during the dialing window — abandon without connecting.
    if (callSessionRef.current !== session) { micStream.getTracks().forEach(t => t.stop()); return; }

    setPhoneState("connected");
    setTalkState("ai_speaking");

    // Start VAD BEFORE the intro so the user can barge in / interrupt Sara
    // even during her very first greeting (uses the already-acquired stream,
    // no new permission dialog).
    console.log("[VoiceAdvisor] startCall: starting VAD...");
    await startVAD(micStream);
    console.log("[VoiceAdvisor] startCall: VAD started ✅");
    if (callSessionRef.current !== session) { console.log("[VoiceAdvisor] startCall: session changed after VAD start"); stopVAD(); return; }

    // AI intro greeting
    console.log("[VoiceAdvisor] startCall: calling streamAdvisor for intro greeting");
    try {
      await streamAdvisor({ intro: true, userName: user?.name?.split(" ")[0] ?? "" });
    } catch (introErr) {
      // Safety net: if streamAdvisor itself throws (should not happen after the
      // internal fix, but guard anyway) — reset the phone state so the user
      // isn't stuck on "در حال صحبت..." forever.
      console.error("[VoiceAdvisor] startCall: intro streamAdvisor threw", introErr);
      stopVAD();
      micStream?.getTracks().forEach(t => t.stop());
      setPhoneState("idle");
      setTalkState("listening");
      setErrorMsg("یه مشکل پیش اومد — لطفاً دوباره تلاش کن");
      return;
    }
    console.log("[VoiceAdvisor] startCall: intro streamAdvisor done");

    if (callSessionRef.current !== session) return;

    // Server blocked the call mid-stream (rare race vs. the pre-check) — don't
    // keep the mic open; the blocked notice is already shown.
    if (gateBlockedRef.current) {
      gateBlockedRef.current = false;
      stopVAD();
      micStream.getTracks().forEach(t => t.stop());
      return;
    }
  }, [streamAdvisor, startVAD, stopVAD, user, token]);

  /* ── end call ─────────────────────────────────────────────────────────── */
  const endCall = useCallback(async () => {
    // Invalidate any in-flight start/dialing sequence so it can't flip to "connected".
    callSessionRef.current++;
    abortRef.current?.abort();
    ringStopRef.current?.();
    ringStopRef.current = null;
    stopTypewriter();
    stopVAD();
    playback.clear();
    awaitingPlaybackEndRef.current = false;
    audioPlayedRef.current = false;
    if (waitNudgeTimerRef.current) { clearTimeout(waitNudgeTimerRef.current); waitNudgeTimerRef.current = null; }
    waitNudgeCooldownRef.current = 0;
    setWaitNudge("");
    setPhoneState("ended");
    setTalkState("listening");
    setVadStatus("idle");
    setLiveText("");
    if (token) {
      try {
        const r = await fetch(`/api/openai/voice-advisor/reset?token=${encodeURIComponent(token)}`, { method: "DELETE" });
        if (r.ok) {
          const data = await r.json();
          if (data?.gate && data.gate.allowed === false) {
            setNextCallInfo({ message: data.gate.message ?? "", nextCallAllowedAt: data.gate.nextCallAllowedAt ?? null });
          }
        }
      } catch { /* ignore */ }
    }
  }, [token, stopVAD, stopTypewriter, playback]);

  const dismissGate = useCallback(() => {
    setGateBlocked(null);
    setNextCallInfo(null);
  }, []);

  /* ── cleanup only on full app teardown ────────────────────────────────── */
  useEffect(() => () => {
    abortRef.current?.abort();
    ringStopRef.current?.();
    stopTypewriter();
    stopVAD();
    if (waitNudgeTimerRef.current) { clearTimeout(waitNudgeTimerRef.current); waitNudgeTimerRef.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: VoiceCallContextValue = {
    phoneState, talkState, liveText, lastAiText, errorMsg, vadStatus,
    ctaUrl, ctaLabel, isMuted, timer, waitNudge,
    confirmPrompt, confirmDone, confirmContinue,
    isCallActive: phoneState === "dialing" || phoneState === "connected",
    gateBlocked, nextCallInfo, dismissGate,
    startCall, endCall, toggleMute,
  };

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}
