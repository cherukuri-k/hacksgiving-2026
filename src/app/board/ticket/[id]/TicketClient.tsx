"use client";
// The full ticket page — the only new page. The ticket IS the mission.
// Mobile-first single column, ~70/30 from `lg`. Uses the existing AppShell and design tokens.
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft, ListChecks, Sparkles, Plus, Trash2, Loader2, ShieldCheck, MapPin, Clock,
  Building2, AlertTriangle, HandHelping, CircleHelp,
} from "lucide-react";
import { AppShell, Btn, useClock } from "@/components/AppShell";
import { NeedChip, UrgencyDot, Avatar } from "@/components/ui/Chip";
import { TaskCard } from "@/components/tasks/TaskCard";
import { AssignSheet, ReviewSheet, UpdateSheet } from "@/components/tasks/Sheets";
import { useSnapshot, act } from "@/lib/client/useSnapshot";
import { useMe } from "@/lib/client/me";
import { rollup, tasksAssignedTo, isAssignedTo, primaryAction, relTime, filterTasks, type TaskFilter } from "@/lib/missions";
import { COORDINATOR_ORG } from "@/lib/coordination";
import { timeAgo } from "@/lib/stats";
import { STATUS_LABEL, NEEDS, type Need, type Task } from "@/lib/types";
import type { TaskProposal } from "@/lib/ai/taskUpdate";

type SheetKind = null | { kind: "assign"; task: Task } | { kind: "update" } | { kind: "review"; task: Task };

export default function TicketClient({ id }: { id: string }) {
  const { data, reload } = useSnapshot();
  const [me] = useMe();
  const now = useClock();
  const reduce = useReducedMotion();

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [newTask, setNewTask] = useState({ title: "", description: "", category: "other" as Need });

  const request = data?.requests.find((r) => r.id === id) ?? null;
  const partners = data?.partners ?? [];
  const isCoordinator = me.org === COORDINATOR_ORG;

  // Team members: the current identity plus distinct owners already in the snapshot. No invented staff.
  const people = useMemo(() => {
    const names = new Set<string>([me.name]);
    for (const r of data?.requests ?? []) if (r.ownerName) names.add(r.ownerName);
    return [...names].map((n) => ({ id: n, name: n }));
  }, [data, me.name]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/requests/${id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, actorName: me.name, actorOrg: me.org, actorPartnerId: me.partnerId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "That did not work.");
    return j;
  };

  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try { await post(body); await reload(); setSheet(null); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!data) {
    return (
      <AppShell title="Ticket" me={me.name}>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="card h-24 animate-pulse bg-surface-2" />)}
        </div>
      </AppShell>
    );
  }
  if (!request) {
    return (
      <AppShell title="Ticket" me={me.name}>
        <div className="card p-8 text-center">
          <p className="text-[15px] font-semibold text-ink">This ticket could not be found.</p>
          <p className="mt-1 text-[13px] text-ink-2">It may have been reset.</p>
          <div className="mt-4"><Btn href="/board" variant="solid"><ArrowLeft size={15} /> Back to Board</Btn></div>
        </div>
      </AppShell>
    );
  }

  const tasks = request.tasks ?? [];
  const suggestions = request.taskSuggestions?.status === "draft" ? request.taskSuggestions.items : [];
  const r = rollup(request);
  const mine = tasksAssignedTo(tasks, { name: me.name, partnerId: me.partnerId });
  const others = tasks.filter((t) => !isAssignedTo(t, { name: me.name, partnerId: me.partnerId }));
  // A volunteer's own tasks are listed above, so "all" shows the rest for them.
  const base = !isCoordinator && filter === "all" ? others : tasks;
  const visible = filterTasks(base, filter, { name: me.name, partnerId: me.partnerId });

  // Out-of-scope needs raised across every task, minus anything already covered by a task title.
  const mentioned = tasks.flatMap((t) =>
    (t.lastUpdate?.outOfScopeItems ?? []).map((text) => ({ text, from: t.title })),
  ).filter((m, i, all) =>
    all.findIndex((x) => x.text.toLowerCase() === m.text.toLowerCase()) === i &&
    !tasks.some((t) => t.title.toLowerCase().includes(m.text.toLowerCase().slice(0, 18))),
  );
  const canUpdateAny = mine.some((t) => t.state !== "done") || (isCoordinator && tasks.some((t) => t.state !== "done"));
  const updatable = (isCoordinator ? tasks : mine).filter((t) => t.state !== "done");

  const approve = () => {
    const items = suggestions
      .filter((s) => !removed.has(s.id))
      .map((s) => ({ id: s.id, title: drafts[s.id]?.title ?? s.title, description: drafts[s.id]?.description ?? s.description, category: s.category }));
    if (!items.length) { setErr("Keep at least one task, or dismiss them all."); return; }
    return run({ action: "approve_suggestions", items });
  };

  return (
    <AppShell
      title={<>Ticket {request.shortCode}</>}
      subtitle={request.summary}
      me={me.name}
      actions={<>
        <Btn href="/board" className="whitespace-nowrap"><ArrowLeft size={15} /> Back to Board</Btn>
        {request.status === "new" && (
          <Btn variant="solid" onClick={async () => { await act(request.id, { action: "claim", ownerName: me.name, ownerOrg: me.org, partnerId: me.partnerId }); reload(); }}>
            <HandHelping size={15} /> Claim
          </Btn>
        )}
      </>}
    >
      {/* Header strip */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
          <span className="font-semibold text-ink">{request.shortCode}</span>
          <span className="chip chip-soft bg-surface-2 text-ink-2">{STATUS_LABEL[request.status]}</span>
          <UrgencyDot urgency={request.urgency} withLabel />
          <span className="inline-flex items-center gap-1"><MapPin size={11} /> {request.neighborhood}</span>
          <span className="inline-flex items-center gap-1"><Clock size={11} /> Opened {timeAgo(request.createdAt, now)}</span>
          {request.ownerName && <span className="inline-flex items-center gap-1.5"><Avatar name={request.ownerName} size={18} /> {request.ownerName}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">{request.needs.map((n) => <NeedChip key={n} need={n} />)}</div>

        {r.total > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[12.5px]">
              <span className="font-medium text-ink"><span className="num">{r.done}</span> of <span className="num">{r.total}</span> tasks done</span>
              <span className="text-muted">{r.inReview > 0 && `${r.inReview} in review`}{r.needsFollowUp > 0 && `${r.inReview > 0 ? " · " : ""}${r.needsFollowUp} needs follow-up`}</span>
            </div>
            <div className="bar !bg-surface-3">
              <motion.span initial={reduce ? false : { width: 0 }} animate={{ width: `${r.pct}%` }} transition={{ duration: 0.3 }} className="!bg-green" style={{ width: `${r.pct}%` }} />
            </div>
            {r.outstanding > 0 && (request.status === "delivered" || request.status === "verified") && (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-[#b45309]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                This ticket is marked {STATUS_LABEL[request.status].toLowerCase()}, but {r.outstanding} task{r.outstanding === 1 ? " is" : "s are"} still unfinished.
              </p>
            )}
          </div>
        )}
      </div>

      {err && <div className="mt-3 rounded-lg border border-[#f3c4c4] bg-red-soft p-3 text-[13px] text-red">{err}</div>}

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        {/* Left ~70% */}
        <div className="min-w-0 flex-1 space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink"><ListChecks size={16} className="text-brand" /> Tasks &amp; Assistance</h2>
              {isCoordinator && r.total > 0 && !adding && (
                <button onClick={() => setAdding(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-ink hover:bg-surface-2"><Plus size={13} /> Add task</button>
              )}
            </div>

            {/* Drafts awaiting review */}
            {suggestions.length > 0 && (
              <div className="mb-4 rounded-lg border border-[#bfe0f3] bg-brand-soft/40 p-3">
                <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink"><Sparkles size={14} className="text-brand" /> Suggested tasks</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  {!isCoordinator ? "Waiting for a coordinator to approve."
                    : request.taskSuggestions?.refinedAt ? "Relay's planner drafted these and AI tailored the wording to this request. Safety steps are the planner's own. Review them before assigning."
                    : "Relay's planner drafted these from the request. Review them before assigning."}
                </p>

                <div className="mt-2.5 space-y-2">
                  {suggestions.filter((s) => !removed.has(s.id)).map((s) => (
                    <div key={s.id} className="rounded-lg border border-line bg-surface p-2.5">
                      {isCoordinator ? (
                        <>
                          <div className="flex items-start gap-2">
                            <input
                              aria-label="Task title"
                              value={drafts[s.id]?.title ?? s.title}
                              onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: { title: e.target.value, description: d[s.id]?.description ?? s.description } }))}
                              className="min-h-11 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13.5px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
                            />
                            <button onClick={() => setRemoved((p) => new Set(p).add(s.id))} aria-label={`Remove ${s.title}`} className="flex h-11 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-red"><Trash2 size={14} /></button>
                          </div>
                          <textarea
                            aria-label="Task description" rows={2}
                            value={drafts[s.id]?.description ?? s.description}
                            onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: { title: d[s.id]?.title ?? s.title, description: e.target.value } }))}
                            className="mt-1.5 w-full rounded-md border border-line bg-surface p-2 text-[12.5px] text-ink-2 outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
                          />
                        </>
                      ) : (
                        <>
                          <div className="text-[13.5px] font-medium text-ink">{s.title}</div>
                          <p className="mt-0.5 text-[12.5px] text-ink-2">{s.description}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {isCoordinator && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={approve} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-2 disabled:opacity-40">
                      {busy && <Loader2 size={15} className="animate-spin" />} Approve tasks
                    </button>
                    <button onClick={() => setAdding(true)} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink hover:bg-surface-2"><Plus size={14} /> Add task</button>
                    <button onClick={() => run({ action: "dismiss_suggestions" })} disabled={busy} className="inline-flex h-11 items-center rounded-lg px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">Dismiss</button>
                  </div>
                )}
              </div>
            )}

            {adding && isCoordinator && (
              <div className="mb-3 rounded-lg border border-line p-3">
                <input placeholder="Task title" aria-label="New task title" value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
                  className="min-h-11 w-full rounded-md border border-line px-2.5 text-[13.5px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft" />
                <textarea placeholder="One sentence on what has to happen" aria-label="New task description" rows={2} value={newTask.description} onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))}
                  className="mt-1.5 w-full rounded-md border border-line p-2 text-[12.5px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft" />
                <div className="mt-1.5 flex gap-2">
                  <select aria-label="Service category" value={newTask.category} onChange={(e) => setNewTask((t) => ({ ...t, category: e.target.value as Need }))} className="select h-11">
                    {NEEDS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button disabled={!newTask.title.trim() || busy} onClick={async () => { await run({ action: "add_task", ...newTask }); setNewTask({ title: "", description: "", category: "other" }); setAdding(false); }}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-2 disabled:opacity-40">Add</button>
                  <button onClick={() => setAdding(false)} className="inline-flex h-11 items-center rounded-lg border border-line px-3 text-[13.5px] text-ink hover:bg-surface-2">Cancel</button>
                </div>
              </div>
            )}

            {/* Filters: on a busy ticket, "what still needs doing" is one tap away. */}
            {tasks.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(["needs_action", "mine", "all", "done"] as TaskFilter[]).map((f) => {
                  const n = filterTasks(tasks, f, { name: me.name, partnerId: me.partnerId }).length;
                  const label = f === "needs_action" ? "Needs action" : f === "mine" ? "Mine" : f === "done" ? "Done" : "All";
                  const on = filter === f;
                  return (
                    <button key={f} onClick={() => setFilter(f)} aria-pressed={on}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium ${on ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:bg-surface-2"}`}>
                      {label} <span className="num opacity-70">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* A volunteer sees their own tasks first. */}
            {!isCoordinator && mine.length > 0 && filter === "all" && (
              <>
                <h3 className="label mb-2">Your tasks</h3>
                <div className="space-y-2.5">
                  {mine.map(renderTask)}
                </div>
                {others.length > 0 && <h3 className="label mb-2 mt-4">Other tasks on this ticket</h3>}
              </>
            )}

            <div className="space-y-2.5">
              {visible.map(renderTask)}
            </div>

            {tasks.length > 0 && visible.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                {filter === "needs_action" ? "Nothing is waiting on anyone right now." : filter === "mine" ? "None of these tasks are assigned to you." : "Nothing here yet."}
              </p>
            )}

            {!tasks.length && !suggestions.length && (
              <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
                <p className="text-[13.5px] font-medium text-ink-2">No tasks on this ticket yet.</p>
                <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] leading-snug text-muted">
                  {isCoordinator
                    ? "Relay can read the resident's description and draft the tasks this household needs. You review them before anything is assigned."
                    : "A coordinator has not added any yet."}
                </p>
                {isCoordinator && (
                  <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => run({ action: "generate_suggestions" })} disabled={busy}
                      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-2 disabled:opacity-40">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                      {busy ? "Reading the request…" : "Generate tasks with AI"}
                    </button>
                    <button onClick={() => setAdding(true)} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink hover:bg-surface-2"><Plus size={14} /> Add task manually</button>
                  </div>
                )}
              </div>
            )}

            {/*
              Needs volunteers mentioned that no task covers. They never held a task open, and they
              are not tasks until a coordinator says so — this is where that decision gets made.
            */}
            {isCoordinator && mentioned.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#ded0fb] bg-[#f6f2fe] p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#6d28d9]">
                  <CircleHelp size={14} /> Mentioned, but not tracked yet
                </p>
                <p className="mt-0.5 text-[12px] text-ink-2">
                  A volunteer raised {mentioned.length === 1 ? "this" : "these"} while working on another task. Add {mentioned.length === 1 ? "it" : "them"} only if the household actually needs {mentioned.length === 1 ? "it" : "them"}.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {mentioned.map((m) => (
                    <li key={`${m.from}-${m.text}`} className="flex items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-2">
                      <span className="min-w-0 text-[13px] text-ink">
                        {m.text}
                        <span className="block text-[11px] text-muted">from “{m.from}”</span>
                      </span>
                      <button
                        onClick={() => { setNewTask({ title: m.text.slice(0, 90), description: `Raised by a volunteer while working on "${m.from}".`, category: "other" }); setAdding(true); }}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] font-medium text-ink hover:bg-surface-2">
                        <Plus size={13} /> Add as task
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canUpdateAny && updatable.length > 0 && (
              <button onClick={() => setSheet({ kind: "update" })} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface text-[14px] font-medium text-ink hover:bg-surface-2 sm:w-auto sm:px-4">
                Send update
              </button>
            )}
          </section>

          {/* Original request */}
          <section className="card p-4">
            <div className="label mb-2">Resident&rsquo;s words · redacted</div>
            <p className="text-[14px] leading-[1.55] text-ink">{request.redactedText}</p>
            <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-brand"><ShieldCheck size={13} /> Identifiers removed before AI. Contact details {request.hasContact ? "held in the ComForce-only tier" : "not provided"}.</div>
          </section>

          {/* Activity */}
          <section className="card p-4">
            <div className="label mb-2">Activity</div>
            <Activity requestId={request.id} now={now} />
          </section>
        </div>

        {/* Right ~30% */}
        <aside className="w-full space-y-4 lg:w-[320px] lg:shrink-0">
          <section className="card p-4">
            <div className="label mb-2">Ticket</div>
            <dl className="space-y-2 text-[13px]">
              <Row k="Status" v={STATUS_LABEL[request.status]} />
              <Row k="Owner" v={request.ownerName ? `${request.ownerName}${request.ownerOrg ? ` · ${request.ownerOrg}` : ""}` : "Unclaimed"} />
              <Row k="Neighborhood" v={request.neighborhood} />
              <Row k="Household" v={request.householdSize ? `${request.householdSize} people` : "—"} />
            </dl>
          </section>

          <section className="card p-4">
            <div className="label mb-2">Next action</div>
            <p className="text-[13px] leading-snug text-ink-2">{nextAction(r, suggestions.length, isCoordinator)}</p>
          </section>

          {!!tasks.filter((t) => t.assignee?.kind === "partner").length && (
            <section className="card p-4">
              <div className="label mb-2">Partners on this ticket</div>
              <ul className="space-y-1.5">
                {tasks.filter((t) => t.assignee?.kind === "partner").map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                    <Building2 size={13} className="shrink-0 text-muted" />
                    <span className="truncate">{t.assignee!.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* Sheets */}
      {sheet?.kind === "assign" && (
        <AssignSheet task={sheet.task} partners={partners} people={people} busy={busy}
          onClose={() => setSheet(null)}
          onAssign={(to) => run({ action: "assign", taskId: sheet.task.id, to })} />
      )}
      {sheet?.kind === "review" && (
        <ReviewSheet task={sheet.task} busy={busy} now={now}
          onClose={() => setSheet(null)}
          onReview={async (outcome, reason) => { await run({ action: "review", taskId: sheet.task.id, outcome, reason }); }} />
      )}
      {sheet?.kind === "update" && (
        <UpdateSheet tasks={updatable} busy={busy} now={now}
          onClose={() => setSheet(null)}
          onPropose={async (text) => post({ action: "propose_update", updateText: text })}
          onConfirm={async (p: TaskProposal & { noteText: string }) => {
            await run({
              action: "confirm_update", taskId: p.taskId, doneItems: p.doneItems, remainingItems: p.remainingItems,
              outOfScopeItems: p.outOfScopeItems, blocker: p.blockerReason, proposedState: p.proposedState, noteText: p.noteText,
              idempotencyKey: `${me.name}-${p.taskId}-${p.noteText.slice(0, 24)}`,
            });
          }} />
      )}
    </AppShell>
  );

  /**
   * Returns a <TaskCard> element rather than being a nested component.
   * A component declared inside TicketClient would be a NEW type on every render, so the 2s
   * snapshot poll would remount every card and slam shut any open Details or ⋯ menu.
   */
  function renderTask(t: Task) {
    return (
      <TaskCard
        key={t.id} task={t} now={now}
        canCoordinate={isCoordinator}
        canUpdate={isCoordinator || isAssignedTo(t, { name: me.name, partnerId: me.partnerId })}
        onPrimary={() => {
          const a = primaryAction(t.state);
          if (a === "assign" || a === "assign_again") setSheet({ kind: "assign", task: t });
          else if (a === "review") setSheet({ kind: "review", task: t });
          else if (a === "send_update") setSheet({ kind: "update" });
          else if (a === "partner_answer") setSheet({ kind: "assign", task: t });
        }}
        onMore={(action) => {
          if (action === "assign") setSheet({ kind: "assign", task: t });
          else if (action === "remove") {
            if (window.confirm(`Delete "${t.title}"? Its notes and updates go with it. This cannot be undone.`)) {
              run({ action: "remove_task", taskId: t.id });
            }
          }
          else if (action === "note") {
            const note = window.prompt(`Add a note to "${t.title}"`);
            if (note?.trim()) run({ action: "note", taskId: t.id, noteText: note.trim() });
          } else if (action === "edit") {
            const title = window.prompt("Task title", t.title);
            if (title?.trim()) run({ action: "edit_task", taskId: t.id, title: title.trim(), description: t.description });
          }
        }}
      />
    );
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-2">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}

function nextAction(r: ReturnType<typeof rollup>, drafts: number, isCoordinator: boolean): string {
  if (drafts > 0) return isCoordinator ? "Review the suggested tasks and approve the ones that fit." : "A coordinator is reviewing the suggested tasks.";
  if (r.inReview > 0) return "A volunteer finished their part. Review it and mark it done, partly done or not done.";
  if (r.needsAssignment > 0) return "Assign the remaining tasks to a person or a partner.";
  if (r.needsFollowUp > 0) return "A task needs following up. Assign it again.";
  if (r.total > 0 && r.outstanding === 0) return "Every task on this ticket is done.";
  return "Add the tasks this household needs.";
}

/** The ticket's existing activity history, including the new task events. */
function Activity({ requestId, now }: { requestId: string; now: number }) {
  const [events, setEvents] = useState<{ id: string; at: string; actor: string; text: string; type: string }[] | null>(null);
  // Same shape as the drawer's activity poll, so task events show up here within ~2s too.
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/requests/${requestId}`).then((r) => r.json()).then((j) => alive && setEvents(j.activity ?? []));
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [requestId]);

  const loaded = events !== null;
  if (!loaded) return <div className="h-16 animate-pulse rounded-lg bg-surface-2" />;
  if (!events.length) return <p className="text-[13px] text-muted">Nothing recorded yet.</p>;

  return (
    <ol className="space-y-2.5 border-l border-line pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${e.type === "task" ? "bg-brand" : "bg-surface-3"}`} />
          <p className="text-[13px] leading-snug text-ink">{e.text}</p>
          <p className="text-[11.5px] text-muted">{e.actor} · {relTime(e.at, now)}</p>
        </li>
      ))}
    </ol>
  );
}
