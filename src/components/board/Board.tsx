"use client";
import { AnimatePresence, motion } from "motion/react";
import { MessageSquareText, Mic, Globe, Users, User, MapPin, Home, UserCheck, Check, RotateCcw, AlertTriangle, Clock3, Clock, Info, Siren, Languages, ListChecks } from "lucide-react";
import type { SafeRequest } from "@/lib/client/useSnapshot";
import { boardTaskLine } from "@/lib/missions";
import { STATUSES, STATUS_LABEL, LANGUAGE_LABEL } from "@/lib/types";
import { timeAgo } from "@/lib/stats";
import { NeedChip, UrgencyChip } from "../ui/Chip";

const CHANNEL = { sms: ["SMS", MessageSquareText], voice: ["Voice", Mic], web: ["Web", Globe], partner: ["Partner", Users] } as const;
const COL_DOT: Record<string, string> = { new: "#0b93d5", claimed: "#7c3aed", in_progress: "#f59e0b", delivered: "#16a34a", verified: "#16a34a" };

const shortResources = (names: string[]) => names.map((n) => n === "911" ? "911" : n.includes("Missing") ? "Missing-child hotline" : n.startsWith("988") ? "988" : n.includes("County") ? "County crisis" : n.includes("Sojourner") ? "Sojourner" : n.includes("2-1-1") || n === "211" ? "211" : n).slice(0, 2).join(" / ");

function Row({ Icon, k, v, vClass = "text-ink" }: { Icon: typeof MapPin; k: string; v: React.ReactNode; vClass?: string }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 text-ink-2"><Icon size={11} /> {k}</span>
      <span className={`font-medium ${vClass}`}>{v}</span>
    </div>
  );
}

export function RequestCard({ r, fresh, onClick, now }: { r: SafeRequest; fresh: boolean; onClick: () => void; now: number }) {
  const attn = r.attention;
  const flagged = attn.level !== "none";
  const overdue = attn.level === "needs_attention";
  const reopened = r.residentFeedback === "no" && r.status !== "verified";
  const [chLabel, ChIcon] = CHANNEL[r.channel];
  const border = reopened || overdue || r.urgency === "critical" ? "!border-[#f0a3a3]" : flagged || r.urgency === "high" ? "!border-[#f3cf95]" : fresh ? "!border-brand" : "";
  const d = r.dispatch;
  const dispatchLine = d && r.status !== "delivered" && r.status !== "verified"
    ? d.status === "calling" ? "Jordan is calling the partner…"
    : d.status === "accepted" ? `Partner accepted${d.outcome?.readyBy ? ` · ready ${d.outcome.readyBy}` : ""}`
    : d.status === "ready" ? `${r.ownerName ?? "Volunteer"} en route to pickup`
    : d.status === "picked_up" ? "Picked up · heading to resident"
    : d.status === "declined" ? "Partner declined · pick another" : d.status === "no_answer" ? "Partner didn't answer" : null
    : null;
  const taskLine = boardTaskLine(r);
  const next = dispatchLine ?? (r.status === "new" ? "Awaiting a partner to claim" : r.status === "claimed" ? `Claimed by ${r.ownerName ?? "partner"} · work starting` : r.status === "in_progress" ? "In progress · update resident when delivered" : r.status === "delivered" ? (r.followUp?.status === "calling" ? "No text reply · Jordan is calling the resident…" : r.followUp?.status === "answered" ? "Resident on the line with Jordan…" : r.followUp?.status === "no_answer" ? "Call-back unanswered · try the resident later" : "Verification text sent · awaiting resident reply") : r.residentFeedback === "partial" ? "Resident: partly helped" : (r.followUp?.call ? "Closed the loop · confirmed by phone" : "Closed the loop · resident confirmed"));
  return (
    <motion.button layout layoutId={r.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 34 }} onClick={onClick}
      className={`card w-full text-left overflow-hidden hover:shadow-[0_2px_8px_rgba(0,0,0,.06)] ${border}`}>
      {reopened && <div className="flex items-center gap-1.5 bg-red-soft px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-red"><RotateCcw size={11} /> Reopened by resident</div>}
      {!reopened && r.safety && <div className="flex items-center gap-1.5 bg-red px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-white"><Siren size={11} /> {r.safety.kind === "missing_person" ? "Missing person" : r.safety.level === "crisis" ? "Crisis" : "Safety"} · {shortResources(r.safety.resourcesShared)} shared · lead paged</div>}
      {!reopened && !r.safety && flagged && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide ${overdue ? "bg-red-soft text-red" : "bg-orange-soft text-[#b45309]"}`}>
          {overdue ? <AlertTriangle size={11} /> : <Clock3 size={11} />} {overdue ? "Needs attention" : "Follow-up needed"}
        </div>
      )}
      {!reopened && !r.safety && !flagged && r.urgency === "critical" && <div className="flex items-center gap-1.5 bg-red-soft px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-red"><AlertTriangle size={11} /> Critical priority</div>}
      {fresh && !flagged && r.urgency !== "critical" && r.urgency !== "high" && !reopened && <div className="flex items-center gap-1.5 bg-brand-soft px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand"><Info size={11} /> Just arrived</div>}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            <span className="chip shrink-0"><ChIcon size={10} /> {chLabel}</span>
            {r.needs.slice(0, r.urgency === "critical" || r.urgency === "high" ? 1 : 2).map((n) => <NeedChip key={n} need={n} />)}
            {r.language && r.language !== "en" && <span className="chip shrink-0 inline-flex items-center gap-1 bg-[#ede9fe] text-[#6d28d9]"><Languages size={10} /> {LANGUAGE_LABEL[r.language]?.split(" ")[0] ?? r.language}</span>}
          </div>
          <span className="shrink-0"><UrgencyChip urgency={r.urgency} /></span>
        </div>
        <div className="mt-2.5 flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><User size={13} /></span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold leading-snug text-ink line-clamp-2">{r.summary}</div>
            <div className="text-[11.5px] text-ink-2 mt-0.5">{r.shortCode} · {r.neighborhood}</div>
          </div>
        </div>
        <div className="mt-2.5 space-y-1.5 rounded-md bg-surface-3 px-2.5 py-2">
          <Row Icon={MapPin} k="Neighborhood" v={r.neighborhood} />
          {r.householdSize ? <Row Icon={Home} k="Household" v={`${r.householdSize} people`} /> : <Row Icon={Clock} k="Opened" v={timeAgo(r.createdAt, now)} />}
          <Row Icon={UserCheck} k="Owner" v={r.ownerName ?? "Unassigned"} vClass={r.ownerName ? "text-green" : "text-[#b45309]"} />
        </div>
        <div className={`mt-2 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium ${r.status === "verified" && r.residentFeedback !== "partial" ? "border-[#bfe7cf] bg-green-soft text-green" : "border-[#bfe0f3] bg-brand-soft text-brand"}`}>
          {r.status === "verified" && r.residentFeedback !== "partial" ? <span className="inline-flex items-center gap-1.5"><Check size={12} /> {next}</span> : (d?.status === "calling" && r.status !== "delivered" && r.status !== "verified") || r.followUp?.status === "calling" || r.followUp?.status === "answered" ? <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand blink" /> {next}</span> : next}
        </div>
        {/* Relay Missions: one quiet line. Legacy tickets with no tasks render exactly as before. */}
        {taskLine && (
          <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
            <ListChecks size={12} className="shrink-0 text-muted" />
            <span className="num">{taskLine}</span>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
          <span>Opened {timeAgo(r.createdAt, now)}</span>
          {r.ownerName && <span className="font-medium text-ink-2">{r.ownerName}</span>}
        </div>
      </div>
    </motion.button>
  );
}

export function Board({ requests, fresh, onOpen, now }: { requests: SafeRequest[]; fresh: Set<string>; onOpen: (id: string) => void; now: number }) {
  return (
    <div className="grid grid-cols-5 gap-3.5 min-w-[1180px]">
      {STATUSES.map((s) => {
        const items = requests.filter((r) => r.status === s);
        return (
          <section key={s} className="min-w-0">
            <header className="flex items-center justify-between px-1 pb-2.5">
              <h3 className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink"><span className="h-2 w-2 rounded-full" style={{ background: COL_DOT[s] }} />{STATUS_LABEL[s]}</h3>
              <span className="count">{items.length}</span>
            </header>
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.map((r) => <RequestCard key={r.id} r={r} fresh={fresh.has(r.id)} onClick={() => onOpen(r.id)} now={now} />)}
              </AnimatePresence>
              {items.length === 0 && (
                <div className="card border-dashed px-4 py-8 text-center">
                  <div className="text-[13px] font-medium text-ink-2">Column clear</div>
                  <div className="mt-1 text-[11.5px] text-muted">Nothing waiting here right now</div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
