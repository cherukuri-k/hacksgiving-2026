"use client";
// The drawer's Tasks block. Draft tasks are already on the ticket when it opens (the planner
// drafts them at intake, and for older tickets when the board loads), so a coordinator reads
// and approves them right here. Assigning and progress updates stay on the full ticket.
//
// Mount with a key of request id + draft time, so a different draft starts with clean state.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { SafeRequest } from "@/lib/client/useSnapshot";
import type { Me } from "@/lib/client/me";
import { COORDINATOR_ORG } from "@/lib/coordination";
import { isLockedStep, rollup, stateLabel, TASK_TONE } from "@/lib/missions";

const TONE_CLASS: Record<string, string> = {
  neutral: "text-muted",
  brand: "text-brand",
  amber: "text-[#b45309]",
  green: "text-green",
  red: "text-red",
};

async function post(id: string, me: Me, body: Record<string, unknown>) {
  const r = await fetch(`/api/requests/${id}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, actorName: me.name, actorOrg: me.org, actorPartnerId: me.partnerId }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(typeof j?.error === "string" ? j.error : "That did not save. Try again.");
  }
}

export function DrawerTasks({ request, me, tailors, onChanged }: { request: SafeRequest; me: Me; tailors: boolean; onChanged: () => void }) {
  const suggestions = request.taskSuggestions;
  const drafts = suggestions?.status === "draft" ? suggestions.items : [];
  const isCoordinator = me.org === COORDINATOR_ORG;
  const r = rollup(request);

  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tailorAnswered, setTailorAnswered] = useState(false);
  const asked = useRef(false);

  // Ask for the tailored wording when a draft is first shown. The planner's draft is already on
  // screen; the tailored one replaces it a few seconds later. The server sends one draft to the
  // model once, however many people open the ticket. A missing person follows a fixed protocol
  // that no model rewrites.
  const wantsTailoring = tailors && drafts.some((d) => !isLockedStep(d)) && !suggestions?.refinedAt && request.safety?.kind !== "missing_person";
  useEffect(() => {
    if (!wantsTailoring || asked.current) return;
    asked.current = true;
    post(request.id, me, { action: "tailor_suggestions" })
      .catch(() => {})
      .finally(() => { setTailorAnswered(true); onChanged(); });
  }, [wantsTailoring, request.id, me, onChanged]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await post(request.id, me, body);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const kept = drafts.filter((d) => !dropped.has(d.id));
  const isTailoring = wantsTailoring && !tailorAnswered;

  if (drafts.length > 0) {
    return (
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="label">Tasks</div>
          <div className="text-[11.5px] text-muted" aria-live="polite">
            {isTailoring ? "Tailoring to this request…" : suggestions?.refinedAt ? "Planner draft · wording tailored by AI" : "Drafted by Relay's planner"}
          </div>
        </div>

        <ol className="mt-2 divide-y divide-line">
          {kept.map((d, i) => {
            const locked = isLockedStep(d);
            return (
              <li key={d.id} className="flex gap-3 py-2.5 first:pt-1">
                <span className="num w-4 shrink-0 pt-px text-[12.5px] text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-snug text-ink">{d.title}</div>
                  {d.description && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{d.description}</p>}
                  {locked && <div className="mt-1 text-[11.5px] text-muted">{/consent/i.test(d.title) ? "Consent step" : "Safety step"} · fixed wording, comes first</div>}
                </div>
                {isCoordinator && !locked && kept.length > 1 && (
                  <button type="button" onClick={() => setDropped((s) => new Set(s).add(d.id))} disabled={busy} aria-label={`Leave out: ${d.title}`} title="Leave this one out" className="-mr-1 h-6 shrink-0 px-1 text-muted hover:text-ink">
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {err && <p className="mt-2 text-[12.5px] text-red">{err}</p>}

        {isCoordinator ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" disabled={busy} onClick={() => run({ action: "approve_suggestions", items: kept.map(({ id, title, description, category }) => ({ id, title, description, category })) })} className="inline-flex h-[36px] items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-2 disabled:opacity-60">
              {busy ? "Saving…" : `Approve ${kept.length} task${kept.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" disabled={busy} onClick={() => run({ action: "dismiss_suggestions" })} className="text-[13px] font-medium text-ink-2 hover:text-ink disabled:opacity-60">Dismiss</button>
            <Link href={`/board/ticket/${request.id}`} className="ml-auto text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">Edit wording</Link>
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] text-ink-2">A ComForce coordinator reviews these before anyone is assigned.</p>
        )}
      </section>
    );
  }

  if (r.total > 0) {
    return (
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="label">Tasks</div>
          <div className="text-[11.5px] text-muted">
            <span className="num">{r.done} of {r.total}</span> done{r.inReview > 0 && <> · <span className="num">{r.inReview}</span> in review</>}
          </div>
        </div>
        <ol className="mt-2 divide-y divide-line">
          {(request.tasks ?? []).map((t, i) => (
            <li key={t.id} className="flex gap-3 py-2.5 first:pt-1">
              <span className="num w-4 shrink-0 pt-px text-[12.5px] text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug">
                <span className={t.state === "done" ? "text-ink-2" : "text-ink"}>{t.title}</span>
                {t.assignee && t.state !== "awaiting_partner" && <span className="mt-0.5 block text-[12px] font-normal text-ink-2">{t.assignee.name}</span>}
              </div>
              <span className={`shrink-0 pt-px text-[11.5px] font-medium ${TONE_CLASS[TASK_TONE[t.state]] ?? "text-muted"}`}>{stateLabel(t)}</span>
            </li>
          ))}
        </ol>
        <Link href={`/board/ticket/${request.id}`} className="mt-3 inline-block text-[12.5px] font-medium text-brand hover:underline">
          {isCoordinator && r.needsAssignment > 0 ? "Assign these tasks" : "Open the full ticket"}
        </Link>
      </section>
    );
  }

  // Finished tickets, and tickets whose drafts a coordinator dismissed.
  return (
    <section className="card p-4">
      <div className="label">Tasks</div>
      <p className="mt-1.5 text-[13px] text-ink-2">No tasks on this ticket.</p>
    </section>
  );
}
