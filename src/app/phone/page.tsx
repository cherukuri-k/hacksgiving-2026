"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUp, Battery, ChevronLeft, Info, Phone, PhoneOff, Signal, Trash2, Wifi, MessageCircle, Mic, MicOff, Grid3X3, Volume2, Settings as SettingsIcon, Map as MapIcon } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useSnapshot } from "@/lib/client/useSnapshot";
import { Conversation } from "@elevenlabs/client";
import { NEED_LABEL, type HelpRequest, type Partner } from "@/lib/types";

type Msg = { id: string; dir: "out" | "in"; number: string; body: string; at: string; mocked?: boolean };
type Screen = "home" | "phone" | "call" | "messages";
type Turn = { role: "agent" | "caller"; text: string };

const DEFAULT_NUMBER = "+1 (414) 555-0199";
const NUMBER_KEY = "relay.phone.number";
const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
const FOLLOWUP_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_FOLLOWUP_AGENT_ID;
const OPENING = "Hey, this is Jordan with ComForce. What's going on today?";

/**
 * Resident's phone — a device the resident actually uses during the demo.
 * Home → Phone app → live call with Jordan (ElevenLabs SDK, transcript on screen) → the tracking-code text
 * arrives as a notification → Messages. Outbound texts come straight from the server's SMS log; replies typed
 * here run through the same handler as the Twilio webhook. Renders full-bleed on a real phone, in a bezel on a laptop.
 */
/**
 * On a handheld whose browser lays the page out wider than its screen (Safari page zoom below
 * 100%, "request desktop site"), everything would render at a fraction of its size. Returns how
 * much to scale the phone UI back up and the box to lay it out in, or null when nothing is off.
 */
function useHandheldFit() {
  const [fit, setFit] = useState<{ scale: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const desk = window.matchMedia("(hover: hover) and (pointer: fine)");
    const measure = () => {
      const portrait = window.innerHeight >= window.innerWidth;
      const device = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
      const scale = window.innerWidth / device;
      setFit(!desk.matches && scale > 1.1 ? { scale, w: window.innerWidth / scale, h: window.innerHeight / scale } : null);
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, []);
  return fit;
}

export default function ResidentPhone() {
  const fit = useHandheldFit();
  const [number, setNumber] = useState(DEFAULT_NUMBER);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [readCount, setReadCount] = useState<number | null>(null);
  const [notif, setNotif] = useState<Msg | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: snapshot } = useSnapshot(2000);

  useEffect(() => {
    // `?number=` lets each teammate's phone own its own thread; otherwise the last used number is remembered.
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search).get("number");
      const v = q ? formatNumber(q) : localStorage.getItem(NUMBER_KEY);
      if (v) { setNumber(v); localStorage.setItem(NUMBER_KEY, v); }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const changeNumber = (v: string) => { setNumber(v); localStorage.setItem(NUMBER_KEY, v); };

  // Poll the server's SMS log; a new incoming text raises a notification banner unless the thread is open.
  const screenRef = useRef<Screen>("home");
  useEffect(() => { screenRef.current = screen; }, [screen]);
  const lastSeenRef = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    lastSeenRef.current = null;
    const pull = async () => {
      const r = await fetch(`/api/sms/log?number=${encodeURIComponent(number)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!alive || !r?.messages) return;
      const list = r.messages as Msg[];
      setMsgs(list);
      const inb = list.filter((m) => m.dir === "out");
      if (lastSeenRef.current === null) { lastSeenRef.current = inb.length; return; }
      if (inb.length > lastSeenRef.current) {
        lastSeenRef.current = inb.length;
        const m = inb[inb.length - 1];
        if (screenRef.current !== "messages") {
          setNotif(m);
          setTimeout(() => setNotif((n) => (n?.id === m.id ? null : n)), 7000);
        }
      }
    };
    pull();
    const t = setInterval(pull, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [number]);

  const inbound = useMemo(() => msgs.filter((m) => m.dir === "out"), [msgs]);
  const unread = screen === "messages" || readCount === null ? 0 : Math.max(0, inbound.length - readCount);
  const openScreen = (s: Screen) => { if (s === "messages" || screen === "messages") setReadCount(inbound.length); setScreen(s); };

  useEffect(() => { if (screen === "messages") endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, typing, screen]);

  const send = async (text = draft) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setDraft("");
    const optimistic: Msg = { id: `tmp-${Date.now()}`, dir: "in", number, body: text, at: new Date().toISOString() };
    setMsgs((m) => [...m, optimistic]);
    setTyping(true);
    try {
      await fetch("/api/sms/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: number, body: text }) });
      const r = await fetch(`/api/sms/log?number=${encodeURIComponent(number)}`, { cache: "no-store" }).then((r) => r.json());
      setMsgs(r.messages);
    } finally {
      setTyping(false);
      setBusy(false);
    }
  };

  const codes = useMemo(() => {
    const seen = new Set<string>();
    for (const m of msgs) for (const c of m.body.match(/R-[A-Z0-9]{4}/g) ?? []) seen.add(c);
    return Array.from(seen).slice(-3);
  }, [msgs]);
  const latest = codes[codes.length - 1];
  const latestReq = snapshot?.requests.find((r) => r.shortCode === latest);
  const groups = useMemo(() => groupByDay(msgs), [msgs]);

  // ---- Outgoing call to Jordan (live ElevenLabs session) ----
  const [callState, setCallState] = useState<"idle" | "connecting" | "active" | "ended">("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [mode, setMode] = useState<"speaking" | "listening" | null>(null);
  const [callErr, setCallErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const convRef = useRef<Conversation | null>(null);
  useEffect(() => {
    if (callState !== "active") return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);
  useEffect(() => () => { convRef.current?.endSession().catch(() => {}); }, []);

  const startCall = useCallback(async () => {
    if (!AGENT_ID || convRef.current) return;
    setScreen("call");
    setCallState("connecting");
    setCallErr(null);
    setTurns([]);
    setElapsed(0);
    setMuted(false);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const conv = await Conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "websocket",
        // A phone call carries the caller's number. This phone tells Jordan its own, so "text this one" works.
        dynamicVariables: { caller_number: number, caller_last4: number.replace(/\D/g, "").slice(-4) },
        onConnect: () => { setCallState("active"); setTurns([{ role: "agent", text: OPENING }]); },
        onModeChange: ({ mode }) => setMode(mode),
        onMessage: ({ message, source }) => {
          if (source === "ai" && message.trim() === OPENING) return;
          setTurns((t) => [...t, { role: source === "ai" ? "agent" : "caller", text: message }]);
        },
        onDisconnect: () => { convRef.current = null; setMode(null); setCallState("ended"); },
        onError: (m) => setCallErr(String(m)),
      });
      convRef.current = conv;
    } catch (e) {
      setCallState("ended");
      setCallErr(e instanceof Error ? e.message : "Couldn't start the call");
    }
  }, [number]);
  const hangUp = async () => {
    const c = convRef.current; convRef.current = null;
    if (c) await c.endSession().catch(() => {});
    setCallState("ended");
  };
  const toggleMute = () => { const next = !muted; setMuted(next); convRef.current?.setMicMuted?.(next); };
  useEffect(() => {
    if (callState !== "ended") return;
    const t = setTimeout(() => { setCallState("idle"); setScreen((s) => (s === "call" ? "home" : s)); }, 2500);
    return () => clearTimeout(t);
  }, [callState]);

  // Jordan's call-back after delivery: show the incoming call over the thread while it's live, then briefly after it ends.
  const fu = latestReq?.followUp;
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const endedAgo = fu?.call?.endedAt && now ? now - new Date(fu.call.endedAt).getTime() : Infinity;
  // The call stays on screen after Jordan records the answer; it ends only when the session does (the resident hangs up).
  const showCall = fu && (fu.status === "calling" || (fu.call && !fu.call.endedAt) || (fu.call?.endedAt && endedAgo < 6000));

  const inCall = callState === "connecting" || callState === "active";
  const timer = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className={`bg-bg ${fit ? "origin-top-left overflow-hidden" : "min-h-screen"}`}
      style={fit ? { width: fit.w, height: fit.h, transform: `scale(${fit.scale})`, "--fit": fit.scale, "--fw": `${fit.w}px`, "--fh": `${fit.h}px` } as React.CSSProperties : undefined}>
      <div className="mx-auto hidden max-w-[1100px] items-center justify-between px-6 py-5 desk:flex">
        <Link href="/board" className="flex items-center gap-2.5" title="Back to Relay Board"><Logo /><div><div className="text-[14px] font-bold leading-tight">Relay MKE</div><div className="text-[11.5px] text-muted">Resident&apos;s phone</div></div></Link>
        <div className="flex items-center gap-2">
          <Link href="/board" className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"><ArrowLeft size={13} /> Board</Link>
          <button onClick={async () => { await fetch("/api/sms/log", { method: "DELETE" }); setMsgs([]); setReadCount(0); }} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2" title="Clear this thread"><Trash2 size={13} /> Clear</button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 desk:px-6 desk:pb-16 deskwide:grid-cols-[380px_1fr]">
        <Frame>
          {/* Jordan calling back (after delivery) — sits over everything */}
          <AnimatePresence>
            {showCall && fu && latestReq && (
              fu.mode === "live" && FOLLOWUP_AGENT_ID
                ? <LiveCallback key="live" req={latestReq} partner={snapshot?.partners.find((p) => p.id === latestReq.dispatch?.partnerId)} />
                : <SimulatedCallback key="sim" fu={fu} />
            )}
          </AnimatePresence>

          {/* Notification banner */}
          <AnimatePresence>
            {notif && (
              <motion.button key={notif.id} initial={{ y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -90, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
                onClick={() => { setNotif(null); openScreen("messages"); }}
                className="absolute left-2 right-2 top-9 z-30 flex items-start gap-2.5 rounded-2xl bg-white/95 p-3 text-left shadow-[0_10px_30px_-10px_rgba(0,0,0,.4)] backdrop-blur">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-green-500 text-white"><MessageCircle size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between text-[11px] text-muted"><b className="font-semibold uppercase tracking-wide">Messages</b><span>now</span></span>
                  <span className="block text-[13px] font-semibold text-ink">Relay MKE</span>
                  <span className="block truncate text-[12.5px] text-ink-2">{notif.body}</span>
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Return-to-call pill when the user leaves the call screen mid-call */}
          {inCall && screen !== "call" && (
            <button onClick={() => openScreen("call")} className="absolute left-1/2 top-1 z-20 -translate-x-1/2 rounded-full bg-green-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow"><span className="inline-block h-1.5 w-1.5 rounded-full bg-white blink mr-1.5 align-middle" />Jordan · {callState === "active" ? timer : "connecting…"}</button>
          )}

          {screen === "home" && (
            <HomeScreen unread={unread} onPhone={() => openScreen("phone")} onMessages={() => openScreen("messages")} />
          )}

          {screen === "phone" && (
            <PhoneApp number={number} onBack={() => openScreen("home")} onCall={startCall} canCall={!!AGENT_ID} onText={() => { openScreen("messages"); }} />
          )}

          {screen === "call" && (
            <CallScreen title="ComForce MKE" sub="Relay line · Jordan" status={callState === "connecting" ? "Calling…" : callState === "ended" ? "Call ended" : `${timer}${mode === "speaking" ? " · Jordan is speaking" : mode === "listening" ? " · listening" : ""}`}
              footer={callState === "ended"
                ? <span className="grid h-14 w-14 place-items-center rounded-full bg-white/20"><PhoneOff size={22} /></span>
                : <>
                    <button onClick={toggleMute} className="flex flex-col items-center gap-1.5 text-[11px] text-white/80"><span className={`grid h-14 w-14 place-items-center rounded-full ${muted ? "bg-white text-[#0f172a]" : "bg-white/15"}`}>{muted ? <MicOff size={22} /> : <Mic size={22} />}</span>{muted ? "Unmute" : "Mute"}</button>
                    <button onClick={hangUp} className="flex flex-col items-center gap-1.5 text-[11px] text-white/80"><span className="grid h-14 w-14 place-items-center rounded-full bg-red"><PhoneOff size={22} /></span>End</button>
                    <button onClick={() => openScreen("messages")} className="flex flex-col items-center gap-1.5 text-[11px] text-white/80"><span className="grid h-14 w-14 place-items-center rounded-full bg-white/15"><MessageCircle size={22} /></span>Messages</button>
                  </>}>
              {callState === "connecting" && <p className="mt-10 text-center text-[12px] text-white/50">Connecting you to Jordan — allow the microphone if asked.</p>}
              {callErr && <p className="rounded-lg bg-red/20 px-3 py-2 text-center text-[12px] text-red-200">{callErr}</p>}
              {turns.map((t, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${t.role === "caller" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${t.role === "caller" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white/10 text-white"}`}>{t.text}</div>
                </motion.div>
              ))}
              {mode === "speaking" && callState === "active" && <div className="flex"><div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5"><span className="dots"><i /><i /><i /></span></div></div>}
            </CallScreen>
          )}

          {screen === "messages" && (<>
            <div className="flex items-center gap-2 border-b border-line bg-surface/90 px-3 pb-2 pt-1 backdrop-blur">
              <button onClick={() => openScreen("home")} className="p-1 text-brand"><ChevronLeft size={22} /></button>
              <div className="flex flex-1 flex-col items-center">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">R</div>
                <div className="mt-0.5 text-[11px] font-medium">Relay MKE</div>
              </div>
              <Info size={18} className="text-brand" />
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3 text-[14px] leading-snug">
              {msgs.length === 0 && (
                <div className="mx-6 mt-16 text-center text-[12.5px] text-muted">
                  <p>No messages yet.</p>
                  <p className="mt-2">Call ComForce from the Phone app and give this number, or send a text to start a request.</p>
                </div>
              )}
              {groups.map(([day, list]) => (
                <div key={day}>
                  <div className="my-2 text-center text-[10.5px] font-medium text-muted">{day}</div>
                  <AnimatePresence initial={false}>
                    {list.map((m) => <Bubble key={m.id} m={m} />)}
                  </AnimatePresence>
                </div>
              ))}
              {typing && <div className="flex"><div className="rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5"><span className="dots"><i /><i /><i /></span></div></div>}
              <div ref={endRef} />
            </div>

            <div className="shrink-0 border-t border-line bg-surface px-2.5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {codes.map((c) => <Quick key={c} onClick={() => send(c)}>Check {c}</Quick>)}
                {latestReq?.status === "delivered" && <>
                  <Quick onClick={() => send("1")}>1 · yes it arrived</Quick>
                  <Quick onClick={() => send("3")}>3 · no, it didn&apos;t</Quick>
                </>}
                {msgs.length === 0 && <Quick onClick={() => send("Hi, we're out of food until Friday and I have 3 kids. We're near 35th and Burleigh.")}>Text a request</Quick>}
                {msgs.length === 0 && <Quick onClick={() => send("Hola, necesito ayuda. No tenemos comida hasta el viernes y tengo 3 niños. Estamos cerca de Cesar Chavez y National.")}>Enviar en español</Quick>}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex w-full items-center gap-2">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Text Message · SMS" className="h-9 min-w-0 flex-1 rounded-full border border-line bg-bg px-3.5 text-[14px] outline-none focus:border-brand" />
                <button disabled={!draft.trim() || busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-30"><ArrowUp size={16} strokeWidth={2.5} /></button>
              </form>
            </div>
          </>)}
        </Frame>

        <div className="hidden space-y-5 pt-2 deskwide:block">
          <div>
            <h1 className="text-[22px] font-bold leading-tight">The resident&apos;s phone</h1>
            <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-ink-2">
              Open this page on a real phone to run the demo from the audience&apos;s seat. Everything on the screen is driven by the live system.
            </p>
          </div>

          <ol className="card list-decimal space-y-2 p-4 pl-8 text-[13.5px] text-ink-2">
            <li><b className="text-ink">Phone → Call ComForce.</b> Jordan answers live; the transcript appears on the call screen and the card lands on the <Link href="/board" className="text-brand underline">Board</Link> while you&apos;re still talking.</li>
            <li><b className="text-ink">Give this number</b> when Jordan asks where to text. The tracking code arrives as a notification — tap it to open Messages.</li>
            <li><b className="text-ink">After delivery,</b> Jordan calls this phone back to ask whether the help arrived. Answer and say so.</li>
          </ol>

          <div className="card p-4">
            <div className="label mb-2">This phone&apos;s number</div>
            <input value={number} onChange={(e) => changeNumber(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] font-medium tabular-nums outline-none focus:border-brand" />
            <p className="mt-2 text-[12px] text-muted">Each phone in the demo should use a different number so threads stay separate — on a real phone open <code className="rounded bg-surface-2 px-1">/phone?number=4145550188</code>.</p>
          </div>

          {latestReq && (
            <div className="card p-4">
              <div className="label mb-2">Latest request from this phone</div>
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="font-semibold">{latestReq.shortCode}</span>
                <span className="chip chip-soft bg-brand-soft text-brand capitalize">{latestReq.status.replace("_", " ")}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{latestReq.summary}</p>
              <Link href={`/board?q=${latestReq.shortCode}`} className="mt-2 inline-block text-[12.5px] font-medium text-brand hover:underline">Open on the board →</Link>
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-muted">
            Texts shown here come from the server&apos;s SMS pipeline (Twilio adapter in <code className="rounded bg-surface-2 px-1">lib/sms</code>); this screen stands in for the carrier hop until A2P 10DLC registration clears.
          </p>
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ unread, onPhone, onMessages }: { unread: number; onPhone: () => void; onMessages: () => void }) {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => { setT(new Date()); const i = setInterval(() => setT(new Date()), 10000); return () => clearInterval(i); }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col bg-[radial-gradient(120%_80%_at_20%_0%,#1e3a8a_0%,#0f172a_55%,#020617_100%)] text-white">
      <div className="flex flex-col items-center pt-10">
        <div className="text-[64px] font-light leading-none tabular-nums">{t ? t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/, "") : ""}</div>
        <div className="mt-1 text-[14px] text-white/70">{t ? t.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : ""}</div>
      </div>
      <div className="mt-auto grid grid-cols-4 gap-4 px-6 pb-4">
        <AppIcon label="Relay" color="bg-brand" icon={<span className="text-[20px] font-bold">R</span>} />
        <AppIcon label="Maps" color="bg-emerald-600" icon={<MapIcon size={24} />} />
        <AppIcon label="Settings" color="bg-slate-500" icon={<SettingsIcon size={24} />} />
        <div />
      </div>
      <div className="mx-3 mb-3 grid grid-cols-4 gap-4 rounded-[26px] bg-white/15 px-4 py-3 backdrop-blur">
        <AppIcon label="Phone" color="bg-green-500" icon={<Phone size={24} />} onClick={onPhone} />
        <AppIcon label="Messages" color="bg-green-500" icon={<MessageCircle size={24} />} onClick={onMessages} badge={unread} />
        <AppIcon label="Camera" color="bg-slate-700" icon={<span className="h-4 w-4 rounded-full border-2 border-white" />} />
        <AppIcon label="Music" color="bg-rose-500" icon={<Volume2 size={24} />} />
      </div>
    </motion.div>
  );
}

function AppIcon({ label, color, icon, onClick, badge }: { label: string; color: string; icon: React.ReactNode; onClick?: () => void; badge?: number }) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 ${onClick ? "" : "cursor-default opacity-80"}`}>
      <span className={`relative grid h-14 w-14 place-items-center rounded-[16px] ${color} text-white shadow`}>
        {icon}
        {badge ? <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red px-1 text-[11px] font-bold">{badge}</span> : null}
      </span>
      <span className="text-[10.5px] text-white/90">{label}</span>
    </button>
  );
}

function PhoneApp({ number, onBack, onCall, canCall, onText }: { number: string; onBack: () => void; onCall: () => void; canCall: boolean; onText: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-1 flex-col bg-bg">
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <button onClick={onBack} className="flex items-center text-[14px] text-brand"><ChevronLeft size={20} /> Home</button>
        <span className="text-[14px] font-semibold">Contacts</span>
        <span className="w-14" />
      </div>
      <div className="flex flex-col items-center px-6 pt-6">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-brand text-[28px] font-bold text-white">C</div>
        <div className="mt-3 text-[20px] font-bold">ComForce MKE</div>
        <div className="text-[12.5px] text-muted">Community help line · answered by Jordan</div>
        <div className="mt-4 grid w-full grid-cols-3 gap-2">
          <button onClick={onCall} disabled={!canCall} className="flex flex-col items-center gap-1 rounded-xl bg-green-500 py-3 text-white disabled:opacity-40"><Phone size={18} /><span className="text-[11px] font-medium">call</span></button>
          <button onClick={onText} className="flex flex-col items-center gap-1 rounded-xl bg-surface py-3 text-brand shadow-sm"><MessageCircle size={18} /><span className="text-[11px] font-medium">message</span></button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-surface py-3 text-brand shadow-sm opacity-60"><Grid3X3 size={18} /><span className="text-[11px] font-medium">keypad</span></button>
        </div>
        <div className="mt-5 w-full rounded-xl bg-surface p-3 text-[13px] shadow-sm">
          <div className="text-[11px] text-muted">mobile</div>
          <div className="text-brand">(414) 555-0100</div>
        </div>
        <div className="mt-2 w-full rounded-xl bg-surface p-3 text-[13px] shadow-sm">
          <div className="text-[11px] text-muted">notes</div>
          <div className="text-ink-2">English · Español · Hmoob interpreter. Your number: {number}</div>
        </div>
        {!canCall && <p className="mt-4 text-center text-[12px] text-muted">Voice agent not configured on this build — use <b>message</b> to text a request instead.</p>}
      </div>
    </motion.div>
  );
}

function formatNumber(v: string) {
  const d = v.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
}

function callTimer(lastT?: number) {
  const s = Math.round((lastT ?? 0) + 8);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type FU = NonNullable<HelpRequest["followUp"]>;

function CallScreen({ title, sub, status, children, footer }: { title: string; sub: string; status: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute inset-0 z-10 flex flex-col bg-[#0f172a] text-white">
      <div className="flex flex-col items-center px-6 pt-10">
        <div className={`grid h-16 w-16 place-items-center rounded-full bg-brand ${status === "Incoming call…" ? "animate-pulse" : ""}`}><span className="text-[22px] font-bold">R</span></div>
        <div className="mt-3 text-[18px] font-bold">{title}</div>
        <div className="text-[12.5px] text-white/70">{sub}</div>
        <div className="mt-1 text-[12px] text-white/60">{status}</div>
      </div>
      <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-3 pb-3 text-[13px] leading-snug">{children}</div>
      <div className="flex justify-center gap-10 pb-8">{footer}</div>
    </motion.div>
  );
}

const langSub = (lang: string) => `Jordan · ComForce${lang === "es" ? " · Español" : lang === "hmn" ? " · Hmoob interpreter" : ""}`;

/** Scripted fallback when no follow-up agent is configured. */
function SimulatedCallback({ fu }: { fu: FU }) {
  return (
    <CallScreen title="Relay MKE" sub={langSub(fu.language)} status={fu.status === "calling" ? "Incoming call…" : fu.call?.endedAt ? "Call ended" : callTimer(fu.call?.transcript.at(-1)?.t)}
      footer={<span className={`grid h-12 w-12 place-items-center rounded-full ${fu.call?.endedAt ? "bg-white/20" : "bg-red"}`}><PhoneOff size={20} /></span>}>
      {fu.status === "calling" && <p className="mt-10 text-center text-[12px] text-white/50">Picking up automatically — this is the simulated line</p>}
      <Transcript fu={fu} />
      {fu.status === "answered" && !fu.call?.endedAt && <div className="flex"><div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5"><span className="dots"><i /><i /><i /></span></div></div>}
      {fu.call?.endedAt && <div className="mt-2 text-center text-[12px] text-green-300">✓ You told Jordan the help arrived</div>}
    </CallScreen>
  );
}

function Transcript({ fu }: { fu: FU }) {
  return <>{fu.call?.transcript.map((t, i) => (
    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${t.role === "caller" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${t.role === "caller" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-white/10 text-white"}`}>{t.text}</div>
    </motion.div>
  ))}</>;
}

/**
 * Jordan really calls this phone: the server marks the request "calling", the screen rings, and Answer opens a live
 * ElevenLabs conversation with the follow-up agent primed with this case. Turns are mirrored to the server so the
 * Board sees the transcript; the agent's `followup_result` tool closes the loop.
 */
function LiveCallback({ req, partner }: { req: HelpRequest; partner?: Partner }) {
  const fu = req.followUp!;
  const [mode, setMode] = useState<"speaking" | "listening" | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const convRef = useRef<Conversation | null>(null);
  const post = (body: Record<string, unknown>) => fetch("/api/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: req.id, ...body }) }).catch(() => {});

  const onCall = !!fu.call && !fu.call.endedAt;
  useEffect(() => {
    if (!onCall) return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [onCall]);

  // Hang up the live session if the overlay unmounts (e.g. the resident texted "1" meanwhile).
  useEffect(() => () => { convRef.current?.endSession().catch(() => {}); }, []);

  const answer = async () => {
    if (connecting || convRef.current) return;
    setConnecting(true);
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const need = NEED_LABEL[req.needs.find((n) => n !== "youth" && n !== "other") ?? req.needs[0] ?? "other"].toLowerCase();
      const lang = fu.language === "es" ? "es" : "en";
      const volunteer = req.ownerName ?? "A ComForce volunteer";
      // The agent's configured first message is spoken but not emitted through onMessage, so mirror it ourselves.
      const opening = lang === "es"
        ? `Hola, habla Jordan de ComForce Milwaukee. Le llamo por su solicitud ${req.shortCode}. ${volunteer} pasó a dejar ${need}. ¿Le llegó bien?`
        : `Hi, this is Jordan with ComForce Milwaukee — I'm calling about your request ${req.shortCode}. ${volunteer} came by with the ${need}. Did it get to you okay?`;
      const conv = await Conversation.startSession({
        agentId: FOLLOWUP_AGENT_ID!,
        connectionType: "websocket",
        overrides: { agent: { language: lang } },
        dynamicVariables: {
          request_id: req.id,
          request_code: req.shortCode,
          need_summary: need,
          volunteer,
          partner_name: partner?.name ?? "a partner organization",
          language_name: lang === "es" ? "Spanish" : fu.language === "hmn" ? "English (Hmong interpreter line)" : "English",
        },
        onConnect: () => setConnecting(false),
        onModeChange: ({ mode }) => setMode(mode),
        onMessage: ({ message, source }) => { post({ action: "turn", role: source === "ai" ? "agent" : "caller", text: message }); },
        onDisconnect: () => { convRef.current = null; setMode(null); post({ action: "end" }); },
        onError: (m) => setError(m),
      });
      convRef.current = conv;
      await post({ action: "answer", conversationId: conv.getId() });
      await post({ action: "turn", role: "agent", text: opening });
    } catch (e) {
      setConnecting(false);
      setError(e instanceof Error ? e.message : "Couldn't start the call");
    }
  };
  const hangUp = async () => { const c = convRef.current; convRef.current = null; if (c) await c.endSession().catch(() => {}); else await post({ action: "decline" }); };

  const ringing = fu.status === "calling";
  const ended = !!fu.call?.endedAt || (!ringing && !fu.call);
  const status = ringing ? (connecting ? "Connecting…" : "Incoming call…") : ended ? "Call ended" : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}${mode === "speaking" ? " · Jordan is speaking" : mode === "listening" ? " · listening" : ""}`;
  const outcome = fu.status === "confirmed" ? "✓ You told Jordan the help arrived" : fu.status === "partial" ? "You told Jordan part of it arrived" : fu.status === "reopened" ? "You told Jordan it didn't arrive · case reopened" : fu.status === "no_answer" ? "Jordan will try again later" : null;

  return (
    <CallScreen title="Relay MKE" sub={langSub(fu.language)} status={status}
      footer={ended
        ? <span className="grid h-12 w-12 place-items-center rounded-full bg-white/20"><PhoneOff size={20} /></span>
        : <>
            <button onClick={hangUp} className="flex flex-col items-center gap-1.5 text-[11px] text-white/80"><span className="grid h-14 w-14 place-items-center rounded-full bg-red"><PhoneOff size={22} /></span>{ringing ? "Decline" : "Hang up"}</button>
            {ringing && <button onClick={answer} disabled={connecting} className="flex flex-col items-center gap-1.5 text-[11px] text-white/80 disabled:opacity-60"><span className="grid h-14 w-14 place-items-center rounded-full bg-green-500 animate-bounce"><Phone size={22} /></span>Answer</button>}
          </>}>
      {ringing && <p className="mt-10 text-center text-[12px] text-white/50">Jordan is calling about {req.shortCode}. Tap Answer — this is a live voice call.</p>}
      {error && <p className="rounded-lg bg-red/20 px-3 py-2 text-center text-[12px] text-red-200">{error}</p>}
      <Transcript fu={fu} />
      {mode === "speaking" && <div className="flex"><div className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5"><span className="dots"><i /><i /><i /></span></div></div>}
      {ended && outcome && <div className="mt-2 text-center text-[12px] text-green-300">{outcome}</div>}
    </CallScreen>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full desk:w-[360px] desk:h-[720px] desk:rounded-[40px] desk:bg-[#111827] desk:p-[10px] desk:shadow-[0_30px_60px_-20px_rgba(0,0,0,.35)]">
      <div className="relative flex h-[var(--fh,100dvh)] w-full max-w-[var(--fw,100vw)] flex-col overflow-hidden bg-bg pt-[calc(env(safe-area-inset-top)/var(--fit,1))] desk:h-full desk:max-w-none desk:rounded-[32px] desk:pt-0">
        <div className="hidden items-center justify-between bg-surface/90 px-6 pb-1 pt-3 text-[11px] font-semibold desk:flex"><span>9:41</span><span className="flex items-center gap-1 text-ink-2"><Signal size={12} /><Wifi size={12} /><Battery size={14} /></span></div>
        {children}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const mine = m.dir === "in";
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${mine ? "justify-end" : "justify-start"} mb-1`}>
      <div className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 ${mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-surface-2 text-ink"}`}>
        {m.body}
        <div className={`mt-0.5 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      </div>
    </motion.div>
  );
}

function Quick({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2">{children}</button>;
}

function groupByDay(msgs: Msg[]): [string, Msg[]][] {
  const out = new Map<string, Msg[]>();
  for (const m of msgs) {
    const d = new Date(m.at);
    const key = d.toDateString() === new Date().toDateString() ? "Today" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    out.set(key, [...(out.get(key) ?? []), m]);
  }
  return Array.from(out.entries());
}
