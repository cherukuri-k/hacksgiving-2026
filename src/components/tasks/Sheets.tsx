"use client";
// The three task sheets: Assign, Send update (voice or text, AI proposes, human confirms), Review.
// Bottom sheet on mobile, centred panel on desktop.
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  X, Mic, Square, Send, Loader2, Building2, Check, AlertTriangle, ShieldAlert, Pencil,
} from "lucide-react";
import type { Partner, Task } from "@/lib/types";
import { Avatar } from "../ui/Chip";
import { UpdateLists } from "./TaskCard";
import { scopeComplete } from "@/lib/taskRules";
import type { ProposedState, TaskProposal } from "@/lib/ai/taskUpdate";

export function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center" onClick={onClose}>
      <motion.div
        initial={reduce ? false : { y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 sm:max-w-[480px] sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-ink">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-medium transition-colors disabled:opacity-40";
const primary = `${btn} bg-brand text-white hover:bg-brand-2`;
const ghost = `${btn} border border-line bg-surface text-ink hover:bg-surface-2`;

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------
export function AssignSheet({ task, partners, people, onClose, onAssign, busy }: {
  task: Task;
  partners: Partner[];
  people: { id: string; name: string }[];
  onClose: () => void;
  onAssign: (to: { kind: "person" | "partner"; id: string; name: string }) => void;
  busy: boolean;
}) {
  // Only partners whose recorded categories cover this need. We never invent availability.
  const fits = partners.filter((p) => p.needs.includes(task.category));
  return (
    <Sheet title={`Assign "${task.title}"`} onClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-2">Pick a team member, or refer the task to a partner organisation.</p>

      <div className="label mb-1.5">Team members</div>
      <div className="space-y-1.5">
        {people.map((p) => (
          <button key={p.id} disabled={busy} onClick={() => onAssign({ kind: "person", id: p.id, name: p.name })}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-left hover:border-brand hover:bg-brand-soft/40">
            <Avatar name={p.name} size={24} />
            <span className="text-[13.5px] font-medium text-ink">{p.name}</span>
          </button>
        ))}
        {!people.length && <p className="text-[12.5px] text-muted">No team members in this view yet.</p>}
      </div>

      <div className="label mb-1.5 mt-4">Partner organisations</div>
      <div className="space-y-1.5">
        {fits.map((p) => (
          <button key={p.id} disabled={busy} onClick={() => onAssign({ kind: "partner", id: p.id, name: p.name })}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-brand hover:bg-brand-soft/40">
            <Building2 size={15} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span>
              <span className="block text-[11.5px] text-muted">Recorded capacity {p.capacity}</span>
            </span>
          </button>
        ))}
        {!fits.length && <p className="text-[12.5px] text-muted">No partner in the directory is recorded for this service.</p>}
      </div>

      <p className="mt-3 text-[11.5px] leading-snug text-muted">
        Referring a partner records the referral only. It does not mean they accepted, and Relay does not contact them automatically.
      </p>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Send update — voice or text, AI proposes, the volunteer confirms
// ---------------------------------------------------------------------------
type Stage = "compose" | "proposed" | "saved";

export function UpdateSheet({ tasks, onClose, onPropose, onConfirm, busy, now }: {
  tasks: Task[];
  onClose: () => void;
  onPropose: (text: string) => Promise<{ proposals: TaskProposal[]; needsManualPick: boolean; usedFallback: boolean; safety: { level: string; resources: string[] } | null }>;
  onConfirm: (p: TaskProposal & { noteText: string }) => Promise<void>;
  busy: boolean;
  /** Clock from the page, so nothing impure is called during render. */
  now: number;
}) {
  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof onPropose>> | null>(null);
  const [edited, setEdited] = useState<Record<string, TaskProposal>>({});
  const [manualTaskId, setManualTaskId] = useState(tasks[0]?.id ?? "");
  const [manualState, setManualState] = useState<ProposedState>("started");
  const recorder = useRef<MediaRecorder | null>(null);

  const startVoice = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      recorder.current = mr;
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const fd = new FormData();
        fd.append("audio", new File(chunks, "update.webm", { type: chunks[0]?.type || "audio/webm" }));
        try {
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "Could not transcribe that.");
          setText((t) => (t ? `${t} ${j.text}` : j.text));
        } catch (e) { setErr((e as Error).message); }
      };
      mr.start();
      setRecording(true);
    } catch { setErr("Microphone is not available. Typing works the same way."); }
  };
  const stopVoice = () => { recorder.current?.stop(); setRecording(false); };

  const propose = async () => {
    setErr(null);
    try {
      const r = await onPropose(text);
      setResult(r);
      setEdited(Object.fromEntries(r.proposals.map((p) => [p.taskId, p])));
      setStage("proposed");
    } catch (e) { setErr((e as Error).message); }
  };

  const confirmAll = async () => {
    setErr(null);
    try {
      const list = Object.values(edited);
      if (list.length) {
        for (const p of list) await onConfirm({ ...p, noteText: text });
      } else {
        // Manual path: no model, or nothing matched.
        await onConfirm({ taskId: manualTaskId, proposedState: manualState, doneItems: [], remainingItems: [], outOfScopeItems: [], evidence: text, noteText: text });
      }
      setStage("saved");
    } catch (e) { setErr((e as Error).message); }
  };

  if (stage === "saved") {
    return (
      <Sheet title="Update sent" onClose={onClose}>
        <p className="flex items-center gap-2 text-[14px] font-medium text-green"><Check size={18} /> Saved.</p>
        <p className="mt-1.5 text-[13px] text-ink-2">The coordinator can see what happened. You can get back to your work.</p>
        <button className={`${primary} mt-4 w-full`} onClick={onClose}>Back to the ticket</button>
      </Sheet>
    );
  }

  if (stage === "proposed" && result) {
    const list = Object.values(edited);
    return (
      <Sheet title="Check your update" onClose={onClose}>
        {result.safety && (
          <div className="mb-3 rounded-lg border border-[#f3c4c4] bg-red-soft p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-red"><ShieldAlert size={14} /> This sounds urgent</p>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-2">If anyone is in danger right now, call 911. {result.safety.resources.join(" · ")}</p>
            <p className="mt-1 text-[12.5px] text-ink-2">A coordinator has been flagged. The task has not been changed.</p>
          </div>
        )}

        <p className="mb-2 text-[13px] text-ink-2">
          {list.length ? "Here is what I understood. Nothing is saved yet." : "I could not match that to one of your tasks. Pick the task and what happened."}
        </p>

        {list.map((p) => {
          const t = tasks.find((x) => x.id === p.taskId);
          return (
            <div key={p.taskId} className="mb-2.5 rounded-lg border border-line p-3">
              <div className="text-[13.5px] font-semibold text-ink">{t?.title ?? "Task"}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">“{p.evidence}”</div>
              <div className="mt-2"><UpdateLists update={{ doneItems: p.doneItems, remainingItems: p.remainingItems, outOfScopeItems: p.outOfScopeItems, blocker: p.blockerReason, at: new Date(now).toISOString(), by: "you" }} now={now} /></div>
              {scopeComplete(p) && (
                <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">
                  Everything this task asked for is done. The other need is kept separate, so a coordinator can decide whether it becomes its own task.
                </p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="chip chip-soft bg-brand-soft text-brand">{LABEL[p.proposedState]}</span>
                <button onClick={() => setEdited((e) => { const n = { ...e }; delete n[p.taskId]; return n; })}
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink"><Pencil size={12} /> Fix it</button>
              </div>
            </div>
          );
        })}

        {!list.length && (
          <div className="space-y-2">
            <select value={manualTaskId} onChange={(e) => setManualTaskId(e.target.value)} className="select h-11 w-full">
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              {(["started", "mostly_done", "finished_work", "cannot_finish"] as ProposedState[]).map((s) => (
                <button key={s} onClick={() => setManualState(s)} aria-pressed={manualState === s}
                  className={`min-h-11 rounded-lg border px-2 text-[13px] font-medium ${manualState === s ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink hover:bg-surface-2"}`}>
                  {LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="mt-2 text-[13px] text-red">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button className={`${primary} flex-1`} disabled={busy} onClick={confirmAll}>
            {busy && <Loader2 size={15} className="animate-spin" />} Looks right
          </button>
          <button className={ghost} onClick={() => setStage("compose")}>Edit message</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Send update" onClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-2">One sentence is enough. Say what you finished and what is still left.</p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus
        placeholder="Example: Dropped off the food, still need to sort the clothing."
        className="w-full rounded-xl border border-line bg-surface p-3 text-[14px] leading-snug text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button onClick={recording ? stopVoice : startVoice} aria-label={recording ? "Stop recording" : "Record a voice update"}
          className={`${ghost} w-[52px] !px-0 ${recording ? "!border-red !text-red" : ""}`}>
          {recording ? <Square size={16} /> : <Mic size={16} />}
        </button>
        <button className={`${primary} flex-1`} disabled={!text.trim() || busy} onClick={propose}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Review update
        </button>
      </div>
      {recording && <p className="mt-2 text-[12.5px] text-red">Recording… tap the square to stop.</p>}
      {err && <p className="mt-2 text-[13px] text-red">{err}</p>}
      <p className="mt-3 text-[11.5px] leading-snug text-muted">Typing always works. Nothing is saved until you confirm it on the next screen.</p>
    </Sheet>
  );
}

const LABEL: Record<ProposedState, string> = {
  no_change: "No change",
  started: "Started",
  mostly_done: "Mostly done",
  finished_work: "Finished work",
  cannot_finish: "Can't finish",
};

// ---------------------------------------------------------------------------
// Review — the only route to Done
// ---------------------------------------------------------------------------
export function ReviewSheet({ task, onClose, onReview, busy, now }: {
  task: Task;
  onClose: () => void;
  onReview: (outcome: "done" | "partly" | "not_done", reason?: string) => Promise<void>;
  busy: boolean;
  now: number;
}) {
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<"partly" | "not_done" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (outcome: "done" | "partly" | "not_done") => {
    setErr(null);
    try { await onReview(outcome, reason); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <Sheet title={`Review "${task.title}"`} onClose={onClose}>
      {task.lastUpdate
        ? <UpdateLists update={task.lastUpdate} now={now} />
        : <p className="text-[13px] text-ink-2">No volunteer update was recorded for this task.</p>}

      <p className="mt-3 text-[13px] text-ink-2">Did the household actually get this?</p>

      {!picked ? (
        <div className="mt-2.5 space-y-2">
          <button disabled={busy} onClick={() => run("done")} className={`${btn} w-full bg-green text-white hover:opacity-90`}><Check size={16} /> Done</button>
          <button disabled={busy} onClick={() => setPicked("partly")} className={`${btn} w-full bg-orange-soft text-[#b45309] hover:opacity-90`}><AlertTriangle size={16} /> Partly done</button>
          <button disabled={busy} onClick={() => setPicked("not_done")} className={`${btn} w-full bg-red-soft text-red hover:opacity-90`}><X size={16} /> Not done</button>
        </div>
      ) : (
        <div className="mt-2.5">
          <label className="label mb-1 block" htmlFor="review-reason">What is still left?</label>
          <textarea id="review-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            className="w-full rounded-xl border border-line bg-surface p-3 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft" />
          <p className="mt-1 text-[11.5px] text-muted">This reopens the task as “Needs follow-up” so it can be assigned again.</p>
          <div className="mt-3 flex gap-2">
            <button disabled={busy || !reason.trim()} onClick={() => run(picked)} className={`${primary} flex-1`}>
              {busy && <Loader2 size={15} className="animate-spin" />} Save
            </button>
            <button className={ghost} onClick={() => setPicked(null)}>Back</button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-[13px] text-red">{err}</p>}
    </Sheet>
  );
}
