"use client";
// One task. 4px left accent in the status colour, an icon tile in the need colour, a plain-words
// status chip, and exactly ONE primary button chosen by state. Everything else sits behind "More".
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ChevronDown, MoreHorizontal, CheckCircle2, CircleAlert, Clock3, CircleDot, UserPlus,
  MessageSquarePlus, ClipboardCheck, Building2, Trash2, Pencil, CircleHelp,
} from "lucide-react";
import { NEED_COLOR, Avatar } from "../ui/Chip";
import { PRIMARY_ACTION_LABEL, lastActivityAt, primaryAction, quietFor, relTime, stateLabel, TASK_TONE } from "@/lib/missions";
import type { Task, TaskState } from "@/lib/types";

const TONE: Record<string, { text: string; bg: string; bar: string }> = {
  neutral: { text: "text-muted", bg: "bg-surface-2", bar: "#9aa3af" },
  brand: { text: "text-brand", bg: "bg-brand-soft", bar: "#0b93d5" },
  amber: { text: "text-[#b45309]", bg: "bg-orange-soft", bar: "#f59e0b" },
  green: { text: "text-green", bg: "bg-green-soft", bar: "#16a34a" },
  red: { text: "text-red", bg: "bg-red-soft", bar: "#dc2626" },
};

function StateIcon({ state, className = "" }: { state: TaskState; className?: string }) {
  const Icon = state === "done" ? CheckCircle2 : state === "needs_followup" ? CircleAlert : state === "in_review" ? Clock3 : CircleDot;
  return <Icon size={12} className={className} />;
}

export function TaskCard({
  task, canCoordinate, canUpdate, onPrimary, onMore, highlight, now,
}: {
  task: Task;
  canCoordinate: boolean;
  canUpdate: boolean;
  onPrimary: () => void;
  onMore: (action: "edit" | "remove" | "note" | "assign") => void;
  /** Briefly outlined when the poll brings in a change. */
  highlight?: boolean;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the ⋯ menu on an outside click, like the rest of the app's menus.
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);
  const reduce = useReducedMotion();
  const tone = TONE[TASK_TONE[task.state]];
  const action = primaryAction(task.state);
  const quiet = quietFor(task, now);

  // A volunteer may only act on their own task; a coordinator on anything.
  const allowPrimary =
    action === "send_update" ? canUpdate
    : action === "none" ? false
    : canCoordinate;

  return (
    <motion.article
      layout
      animate={highlight && !reduce ? { boxShadow: ["0 0 0 0px rgba(11,147,213,0)", "0 0 0 3px rgba(11,147,213,.25)", "0 0 0 0px rgba(11,147,213,0)"] } : undefined}
      transition={{ duration: 0.9 }}
      className="card relative overflow-hidden"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone.bar }} />

      <div className="py-3 pl-4 pr-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${NEED_COLOR[task.category]}1a`, color: NEED_COLOR[task.category] }}>
            <ClipboardCheck size={15} />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-[14.5px] font-semibold leading-snug text-ink">{task.title}</h3>
            {task.description && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-2">{task.description}</p>}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`chip chip-soft font-semibold ${tone.bg} ${tone.text}`}>
                <StateIcon state={task.state} /> {stateLabel(task)}
              </span>
              {task.assignee && (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2">
                  {task.assignee.kind === "partner" ? <Building2 size={11} className="text-muted" /> : <Avatar name={task.assignee.name} size={18} />}
                  {task.assignee.name}
                </span>
              )}
              {task.lastUpdate && <span className="text-[11.5px] text-muted">Updated {relTime(task.lastUpdate.at, now)}</span>}
              {/* Open work nobody has touched for a day: say so rather than let it sit silently. */}
              {quiet > 0 && (
                <span className="chip chip-soft bg-orange-soft font-semibold text-[#b45309]" title="No update on this task recently">
                  <Clock3 size={10} /> No update in {relTime(lastActivityAt(task), now).replace(" ago", "")}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {allowPrimary && (
              <button onClick={onPrimary} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-2 sm:h-9">
                {action === "assign" || action === "assign_again" ? <UserPlus size={14} /> : action === "send_update" ? <MessageSquarePlus size={14} /> : <ClipboardCheck size={14} />}
                <span className="hidden sm:inline">{PRIMARY_ACTION_LABEL[action]}</span>
              </button>
            )}
            {canCoordinate && (
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenu((v) => !v)} aria-label="More actions" aria-expanded={menu} className="flex h-11 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink sm:h-9">
                  <MoreHorizontal size={16} />
                </button>
                {menu && (
                  <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[180px] rounded-lg border border-line bg-surface p-1.5 shadow-[0_8px_30px_rgba(16,24,40,.12)]">
                    {([["assign", "Assign / reassign", UserPlus], ["note", "Add a note", MessageSquarePlus], ["edit", "Edit", Pencil]] as const).map(([k, label, Icon]) => (
                      <button key={k} onClick={() => { setMenu(false); onMore(k); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-surface-2">
                        <Icon size={13} className="text-muted" /> {label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-line" />
                    <button onClick={() => { setMenu(false); onMore("remove"); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-red hover:bg-red-soft">
                      <Trash2 size={13} /> Delete task
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink">
          <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          {open ? "Hide details" : "Details"}
        </button>

        {open && (
          <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-2 space-y-3 border-t border-line pt-3">
              {task.description && <p className="text-[13px] leading-relaxed text-ink-2">{task.description}</p>}

              {task.lastUpdate && <UpdateLists update={task.lastUpdate} now={now} />}

              {task.review && (
                <div className="text-[12.5px]">
                  <span className="label">Review</span>
                  <p className="mt-0.5 text-ink-2">
                    {task.review.by} marked this {task.review.outcome === "done" ? "done" : task.review.outcome === "partly" ? "partly done" : "not done"}
                    {task.review.reason ? ` — ${task.review.reason}` : ""}.
                  </p>
                </div>
              )}

              {!!task.handoffs?.length && (
                <div className="text-[12.5px]">
                  <span className="label">Partner handoffs</span>
                  <ul className="mt-1 space-y-1">
                    {task.handoffs.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-ink-2">
                        <span>{h.partnerName}</span>
                        <span className={h.status === "accepted" ? "text-green" : h.status === "declined" ? "text-red" : "text-brand"}>
                          {h.status}{h.reason ? ` · ${h.reason}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!task.notes.length && (
                <div className="text-[12.5px]">
                  <span className="label">Notes</span>
                  <ul className="mt-1 space-y-1.5">
                    {task.notes.map((n, i) => (
                      <li key={i} className="text-ink-2">
                        <span className="font-medium text-ink">{n.by}</span> · {relTime(n.at, now)}
                        <p className="leading-snug">{n.text.replace(/^\[[^\]]+\]\s*/, "")}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.article>
  );
}

/** The volunteer's confirmed Done / Still-left lists, shown wherever the update matters. */
export function UpdateLists({ update, now }: { update: NonNullable<Task["lastUpdate"]>; now: number }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3 text-[12.5px]">
      <div className="mb-1.5 text-[11.5px] text-muted">{update.by} · {relTime(update.at, now)}</div>
      {update.doneItems.length > 0 && (
        <div className="mb-1.5">
          <span className="font-semibold text-green">Done</span>
          <ul className="mt-0.5 space-y-0.5">
            {update.doneItems.map((d, i) => <li key={i} className="flex gap-1.5 text-ink-2"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-green" />{d}</li>)}
          </ul>
        </div>
      )}
      {update.remainingItems.length > 0 && (
        <div className="mb-1.5">
          <span className="font-semibold text-[#b45309]">Still left</span>
          <ul className="mt-0.5 space-y-0.5">
            {update.remainingItems.map((d, i) => <li key={i} className="flex gap-1.5 text-ink-2"><CircleDot size={12} className="mt-0.5 shrink-0 text-[#b45309]" />{d}</li>)}
          </ul>
        </div>
      )}
      {update.blocker && (
        <div className="mb-1.5">
          <span className="font-semibold text-red">Blocker</span>
          <p className="mt-0.5 flex gap-1.5 text-ink-2"><CircleAlert size={12} className="mt-0.5 shrink-0 text-red" />{update.blocker}</p>
        </div>
      )}
      {/* A need the volunteer mentioned that this task never covered. It does NOT hold the task open. */}
      {!!update.outOfScopeItems?.length && (
        <div className="mt-1.5 border-t border-line pt-1.5">
          <span className="font-semibold text-[#6d28d9]">Not part of this task</span>
          <ul className="mt-0.5 space-y-0.5">
            {update.outOfScopeItems.map((d, i) => (
              <li key={i} className="flex gap-1.5 text-ink-2"><CircleHelp size={12} className="mt-0.5 shrink-0 text-[#6d28d9]" />{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
