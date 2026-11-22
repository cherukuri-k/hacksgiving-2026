"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, ShieldCheck, Send, CheckCheck, HandHelping, MessageSquareReply, Bot, User, Cpu, RotateCcw, Phone, ChevronDown, PhoneOutgoing, Mail, Navigation, Check, XCircle, Clock, PackageCheck, Siren, Languages, PhoneIncoming, AlertTriangle, Clock3, Bell, UserCog } from "lucide-react";
import type { ActivityEvent, Partner } from "@/lib/types";
import { act, type SafeRequest } from "@/lib/client/useSnapshot";
import { STATUS_LABEL, LANGUAGE_LABEL } from "@/lib/types";
import { timeAgo } from "@/lib/stats";
import { COORDINATOR_ORG } from "@/lib/coordination";
import { lastNudge, nudgeCooldownRemainingMs } from "@/lib/nudge";
import { Avatar, NeedChip, UrgencyDot } from "../ui/Chip";
import { PartnerBadge, PartnerSources } from "../ui/PartnerProvenance";
import { DrawerTasks } from "./DrawerTasks";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const ACTOR_ICON = (actor: string, type?: string) =>
  type === "email_out" ? <Mail size={11} /> : type === "dispatch" ? <PhoneOutgoing size={11} /> : actor === "ai" ? <Cpu size={12} /> : actor === "system" ? <Bot size={12} /> : actor === "resident" ? <MessageSquareReply size={12} /> : <User size={12} />;

/** Need overlap first; a partner that speaks the resident's language outranks one that doesn't. */
function score(p: Partner, r: SafeRequest) {
  const overlap = p.needs.filter((n) => r.needs.includes(n)).length;
  const lang = r.language && r.language !== "en" ? (p.languages?.includes(r.language) ? 2 : -1) : 0;
  return overlap + lang;
}

export function RequestDrawer({ request, partners, onClose, me, tailorsTasks = false, onChanged }: { request: SafeRequest | null; partners: Partner[]; onClose: () => void; me: { name: string; org: string; partnerId?: string }; tailorsTasks?: boolean; onChanged: () => void }) {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Partner | null>(null);

  useEffect(() => {
    if (!request) return;
    let alive = true;
    const load = () => fetch(`/api/requests/${request.id}`).then((r) => r.json()).then((j) => alive && setActivity(j.activity ?? []));
    load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [request]);

  const run = async (body: Record<string, unknown>) => {
    if (!request) return;
    setBusy(true);
    try {
      await act(request.id, body);
    } finally {
      setBusy(false);
    }
  };

  const suggested = request
    ? partners
        .filter((p) => p.id !== me.partnerId && p.name !== me.org && p.capacity > 0 && p.needs.some((n) => request.needs.includes(n)))
        .sort((a, b) => score(b, request) - score(a, request) || b.capacity - a.capacity)
        .slice(0, 3)
    : [];

  return (
    <AnimatePresence>
      {request && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
          <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-[500px] bg-bg border-l border-line flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-line bg-surface">
              <div>
                <div className="flex items-center gap-2 text-[11.5px] text-muted">
                  <span>{request.shortCode}</span>·<span className="uppercase">{STATUS_LABEL[request.status]}</span>·<UrgencyDot urgency={request.urgency} withLabel />
                </div>
                <h2 className="text-[19px] font-bold leading-snug mt-1.5">{request.summary}</h2>
                <Link href={`/board/ticket/${request.id}`} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
                  View Full Ticket <ChevronRight size={13} />
                </Link>
                <div className="mt-2 flex flex-wrap gap-1">{request.needs.map((n) => <NeedChip key={n} need={n} />)}{request.language && request.language !== "en" && <span className="chip inline-flex items-center gap-1 bg-[#ede9fe] text-[#6d28d9]"><Languages size={10} /> {LANGUAGE_LABEL[request.language] ?? request.language}</span>}</div>
              </div>
              <button onClick={onClose} className="p-1.5 text-muted hover:text-ink"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {request.attention.level !== "none" && <AttentionAlert attn={request.attention} />}
              <section className="card p-4">
                <div className="label mb-2">Resident's words · redacted</div>
                <p className="text-[14.5px] leading-[1.55] text-ink">{highlight(request.redactedText)}</p>
                <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-brand"><ShieldCheck size={13} /> Identifiers removed before AI. Contact details {request.hasContact ? "held in the ComForce-only tier" : "not provided"}.</div>
              </section>

              {request.safety && (
                <section className="card p-4 !border-red/40 bg-red/5">
                  <div className="flex items-center justify-between">
                    <div className="label flex items-center gap-1.5 text-red"><Siren size={12} /> {request.safety.kind === "missing_person" ? "Missing person" : request.safety.level === "crisis" ? "Crisis" : "Safety concern"} · ComForce-only</div>
                    {request.safety.leadPagedAt && <span className="text-[11px] font-semibold text-red">On-call lead paged</span>}
                  </div>
                  {request.safety.note && <p className="mt-2 text-[13.5px] leading-snug text-ink">{highlight(request.safety.note)}</p>}
                  <div className="mt-2 text-[12.5px] text-ink-2">{request.channel === "voice" ? "Jordan shared on the call" : "Resources texted back"}: <b className="text-ink">{request.safety.resourcesShared.join(" · ")}</b></div>
                  <div className="mt-1.5 text-[11.5px] text-muted">Partners see the need and neighborhood only. Follow ComForce's safety protocol before any visit.</div>
                </section>
              )}

              {request.call && <CallSection call={request.call} />}

              <section className="card grid grid-cols-2 gap-3 p-4 text-[13px]">
                <Field k="Neighborhood" v={request.neighborhood} />
                <Field k="Household" v={request.householdSize ? `${request.householdSize} people` : "—"} />
                <Field k="Channel" v={request.channel.toUpperCase()} />
                <Field k="Language" v={LANGUAGE_LABEL[request.language ?? "en"] ?? request.language ?? "English"} />
                <Field k="Owner" v={request.ownerName ? `${request.ownerName} · ${request.ownerOrg}` : "Unclaimed"} />
                <Field k="Consent to share" v={request.consentToShare ? "Yes, with partners" : "ComForce only"} />
              </section>

              {/* Draft tasks are already on the ticket; a coordinator approves them here. */}
              <DrawerTasks key={`${request.id}:${request.taskSuggestions?.generatedAt ?? ""}`} request={request} me={me} tailors={tailorsTasks} onChanged={onChanged} />

              {request.dispatch && <DispatchSection request={request} partner={partners.find((p) => p.id === request.dispatch!.partnerId)} />}
              {request.followUp && <FollowUpSection request={request} />}

              {(!request.dispatch || request.dispatch.status === "declined" || request.dispatch.status === "no_answer") && (request.status === "new" || request.status === "claimed") && suggested.length > 0 && (
                <section>
                  <div className="text-[13.5px] font-semibold mb-0.5">Connect to a partner</div>
                  <div className="text-[12px] text-muted mb-2">Jordan calls their line and emails a name-free brief. You pick up and deliver.{request.language && request.language !== "en" ? ` Partners who speak ${LANGUAGE_LABEL[request.language] ?? request.language} are listed first.` : ""}</div>
                  <div className="space-y-2">
                    {suggested.map((p) => (
                      <div key={p.id} className="card flex items-center justify-between p-3">
                        <div>
                          <div className="text-[13.5px] font-semibold">{p.name}</div>
                          <div className="mt-0.5"><PartnerBadge partner={p} size="sm" /></div>
                          <div className="mt-0.5 text-[11.5px] text-muted">{[p.hours, `${p.capacity} open slots${p.capacitySimulated ? " (simulated)" : ""}`, p.address].filter(Boolean).join(" · ")}</div>
                          {request.language && request.language !== "en" && p.languages?.includes(request.language) && <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#6d28d9]"><Languages size={10} /> Speaks {LANGUAGE_LABEL[request.language]}</div>}
                        </div>
                        <button disabled={busy} onClick={() => setConfirm(p)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-2 disabled:opacity-50"><PhoneOutgoing size={13} /> Connect</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <AnimatePresence>
                {confirm && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-[500px] rounded-t-2xl border border-line bg-surface p-5 shadow-2xl">
                    <div className="text-[15px] font-bold">Connect {request.shortCode} to {confirm.name}?</div>
                    <div className="mt-1.5"><PartnerBadge partner={confirm} size="sm" /></div>
                    {confirm.isReal ? (
                    <>
                    <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
                      <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" /> <span><b>Simulated handoff.</b> {confirm.name} is a real organization, so nothing is sent: no email, no phone call. Jordan&apos;s call plays out on the partner-line demo screen.</span></li>
                      <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" /> <span>You become the owner. To reach them for real, ComForce staff use their own channels.</span></li>
                    </ul>
                    <div className="mt-3"><PartnerSources partner={confirm} compact /></div>
                    </>
                    ) : (
                    <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
                      <li className="flex gap-2"><PhoneOutgoing size={15} className="mt-0.5 shrink-0 text-brand" /> <span>Jordan calls <b>{confirm.contactName ?? "their line"}</b>{confirm.phone ? ` at ${confirm.phone}` : ""}, briefs them, and asks when it'll be ready.</span></li>
                      <li className="flex gap-2"><Mail size={15} className="mt-0.5 shrink-0 text-brand" /> <span>A written brief goes to <b>{confirm.email ?? "their inbox"}</b> — need, household, area, urgency. No names, numbers or addresses.</span></li>
                      <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" /> <span>You become the owner. Once they accept, you get a pickup → delivery route.</span></li>
                    </ul>
                    )}
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => setConfirm(null)} className="flex-1 rounded-lg border border-line py-2.5 text-[13.5px] font-medium hover:bg-surface-2">Cancel</button>
                      <button disabled={busy} onClick={async () => { const p = confirm; setConfirm(null); await run({ action: "dispatch", partnerId: p.id, actorName: me.name, actorOrg: me.org }); }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-[13.5px] font-medium text-white hover:bg-brand-2 disabled:opacity-50"><PhoneOutgoing size={15} /> {confirm.isReal ? "Confirm · simulated handoff" : <>Confirm · call &amp; email</>}</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <section>
                <div className="text-[13.5px] font-semibold mb-3">Timeline</div>
                <ol className="relative border-l border-line ml-2 space-y-3">
                  {activity.map((a) => (
                    <li key={a.id} className="ml-4">
                      <span className={`absolute -left-[9px] mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border ${a.type === "verified" ? "bg-green border-green text-white" : a.type === "reopened" ? "bg-red border-red text-white" : "bg-surface border-line text-muted"}`}>{ACTOR_ICON(a.actor, a.type)}</span>
                      <div className="text-[12.5px] leading-snug">{a.text}</div>
                      <div className="text-[11px] text-muted">{a.actor} · {new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <div className="border-t border-line p-4 space-y-2.5 bg-bg">
              {request.status === "new" && (
                <button disabled={busy} onClick={() => run({ action: "claim", ownerName: me.name, ownerOrg: me.org, partnerId: me.partnerId })} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-[13.5px] font-medium text-white hover:bg-brand-2 disabled:opacity-50"><HandHelping size={16} /> Claim as {me.name}</button>
              )}
              {(request.status === "claimed" || request.status === "in_progress") && (
                <>
                  {request.dispatch && (request.dispatch.status === "accepted" || request.dispatch.status === "ready" || request.dispatch.status === "picked_up") && (
                    <a href={`/route/${request.id}`} onClick={() => { if (request.dispatch!.status === "accepted") run({ action: "ready", actor: me.name }); }} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-ink py-2.5 text-[13.5px] font-medium text-white hover:opacity-90"><Navigation size={16} /> {request.dispatch.status === "accepted" ? "Ready to go · get the route" : "Open route"}</a>
                  )}
                  <div className="flex gap-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an update…" className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13.5px] outline-none focus:border-brand" />
                    <button disabled={busy || !note} onClick={() => { run({ action: "note", actor: me.name, text: note }); setNote(""); }} className="rounded-lg border border-line bg-surface px-3 hover:bg-surface-2 disabled:opacity-50"><Send size={16} /></button>
                  </div>
                  <button disabled={busy} onClick={() => run({ action: "delivered", actor: me.name })} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green py-2.5 text-[13.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"><CheckCheck size={16} /> Mark delivered &amp; ask resident to confirm</button>
                </>
              )}
              {request.status === "delivered" && (
                <div className="card p-3">
                  <div className="label mb-2">Awaiting resident reply · simulate</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button disabled={busy} onClick={() => run({ action: "resident_reply", reply: "1" })} className="rounded-lg border border-green text-green py-2 text-[12px] font-medium hover:bg-green hover:text-white">1 · Yes</button>
                    <button disabled={busy} onClick={() => run({ action: "resident_reply", reply: "2" })} className="rounded-lg border border-amber-500 text-amber-600 py-2 text-[12px] font-medium hover:bg-amber-500 hover:text-white">2 · Partly</button>
                    <button disabled={busy} onClick={() => run({ action: "resident_reply", reply: "3" })} className="rounded-lg border border-red text-red py-2 text-[12px] font-medium inline-flex items-center justify-center gap-1 hover:bg-red hover:text-white"><RotateCcw size={12} /> 3 · No</button>
                  </div>
                </div>
              )}
              {request.status === "verified" && (
                <div className="flex items-center gap-2 rounded-lg border border-[#bfe7cf] bg-green-soft p-3 text-[13px] font-medium text-green"><ShieldCheck size={16} /> Loop closed. Confirmed by the resident, credited to {request.ownerOrg}.</div>
              )}
              {request.status !== "verified" && <CoordinatorTools request={request} me={me} partners={partners} activity={activity} />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function AttentionAlert({ attn }: { attn: SafeRequest["attention"] }) {
  const overdue = attn.level === "needs_attention";
  return (
    <section className={`rounded-lg border p-4 ${overdue ? "border-[#f3c4c4] bg-red-soft" : "border-[#f6dcb0] bg-orange-soft"}`}>
      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
        {overdue ? <AlertTriangle size={15} className="text-red" /> : <Clock3 size={15} className="text-[#b45309]" />}
        <span className={overdue ? "text-red" : "text-[#b45309]"}>{overdue ? "Needs attention" : "Follow-up needed"}</span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-snug text-ink">{attn.reason}</p>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-2">
        <span>Owner: <b className="font-semibold text-ink">{attn.owner ?? "Unassigned"}</b></span>
        <span>Last meaningful update: <b className="font-semibold text-ink">{timeAgo(attn.lastMeaningfulAt)}</b></span>
      </div>
    </section>
  );
}

function CoordinatorTools({ request, me, partners, activity }: { request: SafeRequest; me: { name: string; org: string; partnerId?: string }; partners: Partner[]; activity: ActivityEvent[] }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("release");
  const [reason, setReason] = useState("");
  const [confirmUnowned, setConfirmUnowned] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Read the clock in an effect, not during render (render must stay pure), so the cooldown
  // countdown stays live without calling Date.now() inline.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);

  // Nothing to nudge or reassign until someone owns the request.
  if (!request.ownerName) return null;
  const isCoordinator = me.org === COORDINATOR_ORG;
  const urgent = request.urgency === "critical" || request.urgency === "high";
  const releasing = target === "release";
  const last = lastNudge(activity);
  const cooldownLeftMs = now > 0 ? nudgeCooldownRemainingMs(activity, now) : 0;
  const onCooldown = cooldownLeftMs > 0;

  const call = async (body: Record<string, unknown>, onOk?: () => void) => {
    setBusy(true);
    setErr(null);
    try {
      await act(request.id, body);
      onOk?.();
    } catch (e) {
      let msg = (e as Error).message;
      try { msg = JSON.parse(msg).error ?? msg; } catch {}
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const submitReassign = () => {
    const partner = partners.find((p) => p.id === target);
    const body: Record<string, unknown> = { action: "reassign", actorName: me.name, actorOrg: me.org, reason };
    if (partner) {
      body.newOwnerName = partner.name;
      body.newOwnerOrg = partner.name;
      body.newPartnerId = partner.id;
    }
    if (confirmUnowned) body.confirmUnownedUrgent = true;
    call(body, () => { setOpen(false); setReason(""); setTarget("release"); setConfirmUnowned(false); });
  };

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="label">Coordinator tools</span>
        {!isCoordinator && <span className="text-[11px] text-muted">Nudge only</span>}
      </div>
      <button disabled={busy || onCooldown} onClick={() => call({ action: "nudge", actor: me.name })} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface py-2 text-[13px] font-medium hover:bg-surface-3 disabled:opacity-50">
        <Bell size={15} /> Nudge {request.ownerName} to follow up
      </button>
      {last && (
        <div className="text-[11px] text-muted">
          Nudged {timeAgo(last.at)} by {last.actor}{onCooldown ? `. Wait ${Math.ceil(cooldownLeftMs / 60000)} min to nudge again.` : ""}
        </div>
      )}
      {isCoordinator && !open && (
        <button disabled={busy} onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface py-2 text-[13px] font-medium hover:bg-surface-3 disabled:opacity-50">
          <UserCog size={15} /> Reassign or release
        </button>
      )}
      {isCoordinator && open && (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="select w-full">
            <option value="release">Release to the unclaimed queue</option>
            {partners.map((p) => <option key={p.id} value={p.id}>Reassign to {p.name} ({p.isReal ? "real org, simulated handoff" : "fictional demo partner"})</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand" />
          {releasing && urgent && (
            <label className="flex items-start gap-2 text-[12px] text-ink-2">
              <input type="checkbox" checked={confirmUnowned} onChange={(e) => setConfirmUnowned(e.target.checked)} className="mt-0.5" />
              This is an urgent request. I confirm leaving it with no owner.
            </label>
          )}
          <div className="flex gap-2">
            <button disabled={busy || !reason.trim() || (releasing && urgent && !confirmUnowned)} onClick={submitReassign} className="flex-1 rounded-lg bg-brand py-2 text-[13px] font-medium text-white hover:bg-brand-2 disabled:opacity-50">Confirm</button>
            <button disabled={busy} onClick={() => { setOpen(false); setErr(null); }} className="rounded-lg border border-line bg-surface px-3 text-[13px] hover:bg-surface-2">Cancel</button>
          </div>
        </div>
      )}
      {err && <div className="rounded-lg border border-[#f3c4c4] bg-red-soft px-3 py-2 text-[12px] text-red">{err}</div>}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="mt-0.5 text-[13px] font-medium">{v}</div>
    </div>
  );
}

/** Renders [name]/[phone]/[address] placeholders as visible redaction tokens. */
export function highlight(text: string) {
  const parts = text.split(/(\[(?:name|phone|address|email)\])/g);
  return parts.map((p, i) =>
    /^\[(name|phone|address|email)\]$/.test(p) ? (
      <span key={i} className="inline-block rounded bg-surface-3 text-ink-2 px-1.5 text-[11px] font-medium align-middle mx-0.5">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export { Avatar };

function CallSection({ call }: { call: NonNullable<SafeRequest["call"]> }) {
  const [open, setOpen] = useState(false);
  const live = !call.endedAt;
  const dur = call.durationSec ? `${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s` : null;
  return (
    <section className="card p-4 !border-brand/30">
      <div className="flex items-center justify-between">
        <div className="label flex items-center gap-1.5"><Phone size={12} className="text-brand" /> Phone call{dur ? ` · ${dur}` : ""}</div>
        {live ? <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red"><span className="h-2 w-2 rounded-full bg-red blink" /> Live</span> : <span className="text-[11px] text-muted">Summarized by AI after the call</span>}
      </div>
      {live && <p className="mt-2 text-[13.5px] text-ink-2">The resident is still on the line. Details and the transcript arrive when the call ends.</p>}
      {call.summary && <p className="mt-2 text-[14px] leading-[1.55] text-ink">{call.summary}</p>}
      {call.transcript.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} /> {open ? "Hide" : "Show"} transcript · {call.transcript.length} turns · redacted</button>
          {open && (
            <ol className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-[12.5px] leading-snug">
              {call.transcript.map((t, i) => (
                <li key={i} className="flex gap-2"><span className={`w-[58px] shrink-0 font-semibold ${t.role === "agent" ? "text-brand" : "text-ink"}`}>{t.role === "agent" ? "Relay" : "Resident"}</span><span className="text-ink-2">{highlight(t.text)}</span></li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}


function FollowUpSection({ request }: { request: SafeRequest }) {
  const f = request.followUp!;
  const [open, setOpen] = useState(false);
  const live = f.status === "calling" || f.status === "answered";
  const lang = LANGUAGE_LABEL[f.language] ?? f.language;
  const closed = f.status === "confirmed" || f.status === "partial" || f.status === "reopened";
  return (
    <section className={`card p-4 ${live ? "!border-brand/30" : closed ? "!border-green/40" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="label flex items-center gap-1.5"><PhoneIncoming size={12} className="text-brand" /> Closing the loop · resident</div>
        {live && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand"><span className="h-2 w-2 rounded-full bg-brand blink" /> Jordan is calling back</span>}
        {f.status === "waiting_sms" && <span className="text-[11px] font-semibold text-muted">Waiting for a text reply</span>}
        {f.status === "no_answer" && <span className="text-[11px] font-semibold text-muted">Call-back unanswered</span>}
      </div>
      <div className="mt-3 space-y-2 text-[13px]">
        {f.status === "waiting_sms" && <p className="text-ink-2">"Did it arrive?" text sent{f.language !== "en" ? ` in ${lang}` : ""}. If there's no reply, Jordan calls the resident back automatically.</p>}
        {f.status === "no_answer" && <p className="text-ink-2">Jordan's call-back wasn't answered{f.call?.summary ? ` · ${f.call.summary}` : ""}. Try the resident again later.</p>}
        {f.status === "calling" && <p className="text-ink-2 inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand blink" /> No reply by text · ringing the resident{f.language !== "en" ? ` · ${lang}` : ""}…</p>}
        {f.status === "answered" && <p className="text-ink-2 inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red blink" /> <span>Resident picked up · Jordan is asking{f.language !== "en" ? ` in ${lang}` : ""} whether the help arrived</span></p>}
        {f.call && !f.call.endedAt && f.call.transcript.length > 0 && (
          <ol className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-[12.5px] leading-snug">
            {f.call.transcript.map((t, i) => (
              <li key={i} className="flex gap-2"><span className={`w-[62px] shrink-0 font-semibold ${t.role === "agent" ? "text-brand" : "text-ink"}`}>{t.role === "agent" ? "Jordan" : "Resident"}</span><span className="text-ink-2">{t.text}</span></li>
            ))}
            <li className="flex gap-2 text-muted"><span className="w-[62px] shrink-0" /><span className="blink">…</span></li>
          </ol>
        )}
        {closed && (
          <div className={`flex items-center gap-1.5 rounded-lg p-3 text-[13px] font-semibold ${f.status === "reopened" ? "bg-red/5 text-red" : "bg-green-soft text-green"}`}>
            {f.status === "reopened" ? <RotateCcw size={14} /> : <Check size={14} />} {f.status === "confirmed" ? "Resident confirmed the help arrived" : f.status === "partial" ? "Resident: partly arrived" : "Resident: it did not arrive · reopened"}{f.call ? ` · by phone${f.language !== "en" ? ` in ${lang}` : ""}` : " · by text"}
          </div>
        )}
        {f.call?.summary && <p className="text-[13.5px] leading-[1.5] text-ink">{f.call.summary}</p>}
        {f.call?.endedAt && f.call.transcript.length > 0 && (
          <div>
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} /> {open ? "Hide" : "Show"} call-back · {f.call.transcript.length} turns</button>
            {open && (
              <ol className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-[12.5px] leading-snug">
                {f.call.transcript.map((t, i) => (
                  <li key={i} className="flex gap-2"><span className={`w-[62px] shrink-0 font-semibold ${t.role === "agent" ? "text-brand" : "text-ink"}`}>{t.role === "agent" ? "Jordan" : "Resident"}</span><span className="text-ink-2">{t.text}</span></li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const DISPATCH_STEPS = ["calling", "accepted", "ready", "picked_up"] as const;

function DispatchSection({ request, partner }: { request: SafeRequest; partner?: Partner }) {
  const d = request.dispatch!;
  const [open, setOpen] = useState(false);
  const declined = d.status === "declined" || d.status === "no_answer";
  const idx = declined ? 0 : DISPATCH_STEPS.indexOf(d.status as (typeof DISPATCH_STEPS)[number]);
  const calling = d.status === "calling";
  return (
    <section className={`card p-4 ${declined ? "!border-red/40" : "!border-brand/30"}`}>
      <div className="flex items-center justify-between">
        <div className="label flex items-center gap-1.5"><PhoneOutgoing size={12} className="text-brand" /> Handoff · {partner?.name ?? "Partner"}{partner && <span className="ml-1 normal-case tracking-normal"><PartnerBadge partner={partner} size="sm" /></span>}</div>
        {calling && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand"><span className="h-2 w-2 rounded-full bg-brand blink" /> Jordan is on the line</span>}
        {declined && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red"><XCircle size={12} /> {d.status === "no_answer" ? "No answer" : "Declined"}</span>}
      </div>

      {!declined && (
        <ol className="mt-3 grid grid-cols-4 gap-1.5">
          {DISPATCH_STEPS.map((st, i) => {
            const done = i < idx || (i === idx && !calling);
            const active = i === idx;
            const label = st === "calling" ? "Calling" : st === "accepted" ? "Accepted" : st === "ready" ? "En route" : "Picked up";
            return (
              <li key={st} className="flex flex-col gap-1.5">
                <span className={`h-1.5 rounded-full ${done ? "bg-brand" : active ? "bg-brand/50 blink" : "bg-surface-3"}`} />
                <span className={`text-[11px] font-medium ${done || active ? "text-ink" : "text-muted"}`}>{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 space-y-2 text-[13px]">
        {partner?.isReal && <div className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2"><ShieldCheck size={12} className="mr-1 inline text-brand" />Simulated handoff: this real organization was not contacted. Capacity shown is simulated.</div>}
        {d.emailSentAt && <div className="flex items-center gap-2 text-ink-2"><Mail size={13} className="text-brand" /> Brief emailed to {partner?.email ?? "partner"}{d.emailMocked ? <span className="text-[11px] text-muted">· shown in partner inbox</span> : null}</div>}
        {calling && !d.answeredAt && <p className="text-ink-2 inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand blink" /> Ringing {partner?.name}{partner?.phone ? ` · ${partner.phone}` : ""}…</p>}
        {d.answeredAt && !d.call?.endedAt && <p className="text-ink-2 inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red blink" /> <span><b className="text-ink">{d.outcome?.contactName ?? partner?.contactName ?? "Partner"}</b> picked up · Jordan is briefing them live</span></p>}
        {d.call && !d.call.endedAt && d.call.transcript.length > 0 && (
          <ol className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-[12.5px] leading-snug">
            {d.call.transcript.map((t, i) => (
              <li key={i} className="flex gap-2"><span className={`w-[58px] shrink-0 font-semibold ${t.role === "agent" ? "text-brand" : "text-ink"}`}>{t.role === "agent" ? "Jordan" : (d.outcome?.contactName ?? "Partner")}</span><span className="text-ink-2">{t.text}</span></li>
            ))}
            <li className="flex gap-2 text-muted"><span className="w-[58px] shrink-0" /><span className="blink">…</span></li>
          </ol>
        )}
        {d.outcome && (
          <div className={`rounded-lg p-3 ${d.outcome.accepted ? "bg-green-soft" : "bg-red/5"}`}>
            <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${d.outcome.accepted ? "text-green" : "text-red"}`}>{d.outcome.accepted ? <Check size={14} /> : <XCircle size={14} />} {partner?.name} {d.outcome.accepted ? "accepted" : "can't take this right now"}{d.outcome.contactName ? ` · spoke with ${d.outcome.contactName}` : ""}</div>
            {d.outcome.readyBy && <div className="mt-1 flex items-center gap-1.5 text-ink"><Clock size={13} className="text-muted" /> Ready {d.outcome.readyBy}</div>}
            {d.outcome.notes && <div className="mt-1 text-ink-2">"{d.outcome.notes}"</div>}
          </div>
        )}
        {d.call?.summary && <p className="text-[13.5px] leading-[1.5] text-ink">{d.call.summary}</p>}
        {d.call?.endedAt && d.call.transcript.length > 0 && (
          <div>
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} /> {open ? "Hide" : "Show"} partner call · {d.call.transcript.length} turns</button>
            {open && (
              <ol className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-[12.5px] leading-snug">
                {d.call.transcript.map((t, i) => (
                  <li key={i} className="flex gap-2"><span className={`w-[58px] shrink-0 font-semibold ${t.role === "agent" ? "text-brand" : "text-ink"}`}>{t.role === "agent" ? "Jordan" : "Partner"}</span><span className="text-ink-2">{highlight(t.text)}</span></li>
                ))}
              </ol>
            )}
          </div>
        )}
        {d.status === "picked_up" && <div className="flex items-center gap-2 text-[13px] font-medium text-green"><PackageCheck size={15} /> Picked up · on the way to the resident</div>}
        {declined && <p className="text-ink-2">Pick another partner below, or claim and handle it directly.</p>}
      </div>
    </section>
  );
}
