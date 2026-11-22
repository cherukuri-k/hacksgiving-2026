"use client";
// The drawer's "Tasks & Assistance" block. A PREVIEW only — every control that changes a task
// lives on the full ticket page, so the narrow drawer never becomes a task manager.
import Link from "next/link";
import { ListChecks, Sparkles, ChevronRight, CircleDot, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import type { SafeRequest } from "@/lib/client/useSnapshot";
import { rollup, stateLabel, TASK_TONE } from "@/lib/missions";
import type { TaskState } from "@/lib/types";

const TONE_CLASS: Record<string, string> = {
  neutral: "text-muted",
  brand: "text-brand",
  amber: "text-[#b45309]",
  green: "text-green",
  red: "text-red",
};

function StateIcon({ state }: { state: TaskState }) {
  const cls = TONE_CLASS[TASK_TONE[state]] ?? "text-muted";
  const Icon = state === "done" ? CheckCircle2 : state === "needs_followup" ? CircleAlert : state === "in_review" ? Clock3 : CircleDot;
  return <Icon size={13} className={`shrink-0 ${cls}`} />;
}

export function TaskPreview({ request }: { request: SafeRequest }) {
  const r = rollup(request);
  const drafts = request.taskSuggestions?.status === "draft" ? request.taskSuggestions.items : [];
  const href = `/board/ticket/${request.id}`;

  // Legacy ticket: nothing to show, and nothing changes in the drawer.
  if (!r.total && !drafts.length) {
    return (
      <section className="card p-4">
        <div className="label mb-2 flex items-center gap-1.5"><ListChecks size={12} /> Tasks &amp; Assistance</div>
        <p className="text-[13px] text-ink-2">No tasks on this ticket yet.</p>
        <Link href={href} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
          View Full Ticket <ChevronRight size={13} />
        </Link>
      </section>
    );
  }

  return (
    <section className="card p-4">
      <div className="label mb-2 flex items-center gap-1.5"><ListChecks size={12} /> Tasks &amp; Assistance</div>

      {drafts.length > 0 ? (
        <>
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
            <Sparkles size={13} className="text-brand" /> AI prepared {drafts.length} task{drafts.length === 1 ? "" : "s"} for this request.
          </p>
          <ul className="mt-2 space-y-1">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-start gap-1.5 text-[13px] text-ink-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
                <span className="leading-snug">{d.title}</span>
              </li>
            ))}
          </ul>
          <Link href={href} className="mt-3 inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-2">
            Review tasks <ChevronRight size={14} />
          </Link>
        </>
      ) : (
        <>
          <div className="mb-2 text-[12.5px] text-ink-2">
            <span className="num font-semibold text-ink">{r.done}/{r.total}</span> done
            {r.inReview > 0 && <> · <span className="num font-semibold text-[#b45309]">{r.inReview}</span> in review</>}
          </div>
          <ul className="space-y-1.5">
            {(request.tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <StateIcon state={t.state} />
                  <span className="truncate text-ink">{t.title}</span>
                </span>
                <span className={`shrink-0 text-[11.5px] font-medium ${TONE_CLASS[TASK_TONE[t.state]] ?? "text-muted"}`}>{stateLabel(t)}</span>
              </li>
            ))}
          </ul>
          <Link href={href} className="mt-3 inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-surface-2">
            View Full Ticket <ChevronRight size={14} />
          </Link>
        </>
      )}
    </section>
  );
}
