# Relay MKE — 2-minute pitch script

**Format:** 4 minutes, hard stop. 2:00 pitch (this script, slides 1–9) → 2:00 live demo ([demo-runbook.md](demo-runbook.md)) → slide 10 (cost + close) as the last thing on screen. Slides 11–13 are backup video and Q&A appendix.
**Pace:** ~300 spoken words ≈ 2:00 at a calm 145 wpm. Every beat has a slide in [slides/index.html](slides/index.html); press **P** to show the beat clock on the footer.
**Rule:** nothing on a slide that we can't also show live. Numbers below are the ones the Grants page shows today (synthetic 2026 data).

---

## 0:00 — Slide 1 · Title (5 s)

> Relay MKE. One shared record for ComForce — closed only when the resident says help arrived.

*(No more than that. Advance.)*

## 0:05 — Slide 2 · The problem (20 s)

> Friday night, a house fire on 35th Street. The family's cousin messages ComForce on Facebook. A neighbor calls Vaun. A pantry posts in a group chat.
>
> Three people try to help. Two duplicate each other. And a week later nobody can say whether that family got housed — because the only record lives in three phones.
>
> That's the problem. Not caring. Not capacity. **Coordination, and proof.**

## 0:25 — Slide 3 · The step everyone skips (15 s)

> Every program runs the same five steps: intake, coordinate, deliver, verify, report. We studied twenty — Cure Violence, CAHOOTS, Unite Us, findhelp, CompStat. Every one skips the fourth. Help gets marked "done" by the helper, and the resident is never asked.
>
> Relay MKE is built around that one step.

## 0:40 — Slide 4 · Five tracks, one record (20 s)

> The brief asked five things: share information, handle requests and referrals, measure impact, give neighbourhood awareness, and keep knowledge when staff turn over.
>
> We didn't build five tools. We built **one record** — and every module reads from it. A partner directory with live capacity. Jordan and the board. The Impact Studio that drafts grants. A neighbourhood pulse map. A volunteer guide that answers from ComForce's own playbooks.

## 1:00 — Slide 5 · Two screens (15 s)

> Here's what the resident sees and what the team sees. A resident calls; Jordan — our AI — answers in English or Spanish and logs the request **while they're still talking.** The resident gets a tracking code by text. The card lands on the board, triaged. One person claims it, so two people never chase the same family.

## 1:15 — Slide 6 · The stack (15 s)

> It's built on Twilio for the phone line, ElevenLabs voice agents and Claude for Jordan, Next.js and Postgres for the record. All pay-per-use, all current — 2025 and 2026 releases. No seats, no licences. A request is on the board before the caller finishes the sentence.

## 1:30 — Slide 7 · Proof (12 s)

> The City's *Countdown* tracks 26 clusters. Relay shows 71 percent of ComForce's work inside them, median time to help two hours, and **67 percent confirmed by the resident** — the one number the City itself doesn't measure. One click drafts the grant.

## 1:42 — Slide 8 · Guardrails (10 s)

> It never scores or predicts a person. PII is stripped before any AI sees it. Humans make every decision. A caller in crisis hears 988 and Sojourner on the first call.

## 1:52 — Slide 9 · Hand-off to demo (8 s)

> Watch for three things: the call, the dispatch, and the resident closing the loop. Koushik — call ComForce.

*(Demo runs 2:00. When it ends, press → once.)*

## After the demo — Slide 10 · Cost + close (10 s)

> Everything you just watched cost a dollar sixty-six. findhelp charges up to seventy-five thousand a year. One engine for all eight divisions, ComForce owns the data, ready Monday. Thank you.

---

## Delivery notes

- **Who speaks:** one presenter for the 2:00 pitch; a second teammate runs the phone in the demo. Don't trade the mic mid-pitch.
- **Judges:** Vaun Mayes (ComForce founder — slide 2 is his week), Brett Storoe (applied AI — slides 5, 6 and 8), Dr. Carriere (community data — slides 4 and 7). Make eye contact on the matching slide.
- **Non-technical audience:** no words like LLM, webhook, Next.js. Say "Jordan", "the board", "a text".
- **If running long:** cut the research names in slide 3 and the module list in slide 4. Never cut slide 7.
- **If the live call fails:** slide 11 is the recorded demo (`presentation/demo-backup.mp4`, press `V`). Narrate over it with the demo-runbook beats.
- **Q&A:** slides 12 (who touches it) and 13 (what's simulated, what's next) sit after the close — press `End` or jump to `#12` when a judge asks how it's built or what's simulated.
- **Pause** after "the resident is never asked" and after "the one number the City itself doesn't measure." Those are the two lines we want remembered.
