# Relay MKE — 2-minute pitch script

**Format:** 4 minutes, hard stop. 2:00 pitch (this script, 8 slides + a backup demo-video slide + 2 appendix slides for Q&A) → 2:00 live demo ([demo-runbook.md](demo-runbook.md)).
**Pace:** ~290 spoken words ≈ 2:00 at a calm 145 wpm. Every beat has a slide in [slides/index.html](slides/index.html).
**Rule:** nothing on a slide that we can't also show live. Numbers below are the ones the Grants page shows today (synthetic 2026 data).

---

## 0:00 — Slide 1 · Title (5 s)

> Relay MKE. Every request, every responder, every outcome — verified.

*(No more than that. Advance.)*

## 0:05 — Slide 2 · The story (25 s)

> Friday night, a house fire on 35th Street. The family's cousin messages ComForce on Facebook. A neighbor calls Vaun. A pantry posts in a group chat.
>
> Three people try to help. Two duplicate each other. And a week later nobody can say whether that family got housed — because the only record of it lives in three phones.
>
> That's the problem. Not caring. Not capacity. **Coordination, and proof.**

## 0:30 — Slide 3 · The loop that breaks (20 s)

> Every one of ComForce's eight divisions runs the same loop: intake, coordinate, deliver, verify, report.
>
> We studied twenty programs — Cure Violence, CAHOOTS, Unite Us, findhelp, CompStat. Every one of them breaks at the same place: **verify.** Help gets marked "done" by the helper, and the resident is never asked.
>
> Relay MKE is built around that one missing step.

## 0:50 — Slides 4–5 · What we built (25 s)

*Slide 4 (annotated board + phone) for the first paragraph; advance to slide 5 (the data-flow thread) at "A coordinator taps Dispatch."*

> A resident calls ComForce. Jordan — our AI — answers in English or Spanish, listens, and logs the request on the shared board **while they're still talking.** The resident gets a tracking code by text.
>
> A coordinator taps Dispatch. Jordan calls the partner, records their answer, and hands the volunteer a run sheet.
>
> After delivery, Relay texts the resident: *did it arrive?* No reply? **Jordan calls them back, in their language.** Only the resident's "yes" counts.

## 1:15 — Slide 6 · Proof funders can audit (20 s)

> That verified loop is what turns stories into evidence.
>
> ComForce's main funder, the City's wellness office, just launched the *Countdown*: 26 clusters, 88 percent of homicide victims. Relay shows 71 percent of ComForce's work landing inside those clusters, median time to help two hours, and **67 percent confirmed by the resident** — the one number the City itself doesn't measure.
>
> One click drafts the grant application, in the funder's own vocabulary.

## 1:35 — Slide 7 · Responsible, and nearly free (15 s)

> Guardrails are built in: it never scores or predicts a person, PII is stripped before any AI sees it, humans make every decision, and a caller in crisis hears 988 and Sojourner on the first call.
>
> It runs on volunteers' own phones for about a dollar sixty-six a request. findhelp charges up to seventy-five thousand a year.

## 1:50 — Slide 8 · Close → demo (10 s)

> One engine for all eight divisions. ComForce owns the data. Deployable Monday.
>
> Now — Koushik is going to call ComForce from his seat. Watch the board.

*(Hand off. Demo starts on the next click.)*

---

## Delivery notes

- **Who speaks:** one presenter for the 2:00 pitch; a second teammate runs the phone in the demo. Don't trade the mic mid-pitch.
- **Judges:** Vaun Mayes (ComForce founder — slide 2 is his week), Brett Storoe (applied AI — slides 4, 5 and 7), Dr. Carriere (community data — slides 6 and 7). Make eye contact on the matching slide.
- **Non-technical audience:** no words like LLM, webhook, Next.js. Say "Jordan", "the board", "a text".
- **If running long:** cut the research sentence in slide 3 and the findhelp comparison in slide 7. Never cut slide 6.
- **If the live call fails:** slide 9 is the recorded demo (`presentation/demo-backup.mp4`, press `V`). Narrate over it with the demo-runbook beats.
- **Q&A:** slides 10 (tech stack) and 11 (limits & next steps) sit after the close — press `End` or jump to `#10` when a judge asks how it's built or what's simulated.
- **Pause** after "the resident is never asked" and after "the one number the City itself doesn't measure." Those are the two lines we want remembered.
