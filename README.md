# Relay MKE — Hacksgiving 2026 × ComForce MKE

> **Every request. Every responder. Every outcome — verified.**
> A near-free, privacy-first system that helps [ComForce MKE](https://comforcemilwaukee.com/) and its partners turn scattered requests for help into coordinated action and **resident-verified, funder-ready impact**.

**Event:** [Hacksgiving 2026: AI for Good](https://msoe-maic.com/library/?nav=Competitions&article=HacksGiving-ComForce-MKE-2026) · MSOE AI Club × ComForce MKE · Nov 19–22, 2026
**Status:** 🚀 Working prototype — all seven surfaces built on synthetic data ([run it](src/README.md))

---

## The challenge

> *How can technology help ComForce MKE and its partners turn fragmented information into coordinated action and measurable community impact?*

Full brief: [docs/challenge/original-brief.md](docs/challenge/original-brief.md) · Judging decoded: [docs/challenge/judging-criteria.md](docs/challenge/judging-criteria.md)

## Our approach: one spine, five tracks

Every one of ComForce's eight divisions runs the same loop: **intake → coordinate → deliver → verify → report**. Relay MKE is one shared record of that work, with a module for each hackathon track:

| Hackathon track | Relay module |
| --- | --- |
| Information Sharing & Coordination | **Partner Network + Dispatch**: shared directory, live capacity, consent-scoped handoffs — one click and the AI agent **calls and emails the partner**, records their answer live, then hands the volunteer a **GPS run sheet** (pickup → resident) |
| Community Requests & Referrals | **Smart Intake → Relay Board → Verified Loop**: SMS/web intake **and a phone line answered by a human-sounding AI agent** (English + Spanish; Hmong routed to a Hmong-speaking partner) that logs the request live and reads back a tracking code; claim-to-own; *resident confirms help arrived* — by text, or **Jordan calls them back in their language** if they don't reply |
| Data Collection & Impact Measurement | **Field Log + Impact Studio**: voice-note activity logs, live dashboard, one-click funder report, full export |
| Community Awareness & Decision Support | **Neighborhood Pulse**: map of needs and unmet needs, never people |
| Training & Knowledge Sharing | **Rapid Response Rooms + Field Guide**: per-case responder chat, direct service requests, AI over ComForce playbooks |

📕 **Full playbook (PDF, 41 pages):** [docs/Relay-MKE-Playbook.pdf](docs/Relay-MKE-Playbook.pdf) · 📄 Product spec → [docs/product/spec.md](docs/product/spec.md) · 🗓 Build schedule → [docs/product/build-schedule.md](docs/product/build-schedule.md) · 🧠 Why this concept → [docs/brainstorm/recommended-concept.md](docs/brainstorm/recommended-concept.md)

## The product

Light, fast, one design system across every surface. Live data polls every two seconds, so a request texted in on stage appears on the board before the sentence is finished.

| | |
| --- | --- |
| **Relay Board** — queue, claim-to-own, verified loop<br>![Board](docs/assets/screenshots/board.png) | **Request detail** — redacted intake, timeline, actions<br>![Drawer](docs/assets/screenshots/board-drawer.png) |
| **Partner Network** — capacity and load, live<br>![Partners](docs/assets/screenshots/partners.png) | **Impact Studio** — KPIs and one-click funder narrative<br>![Impact](docs/assets/screenshots/impact.png) |
| **Neighborhood Pulse** — needs by area, never people<br>![Pulse](docs/assets/screenshots/pulse.png) | **Field Guide** — playbooks + grounded Q&A<br>![Guide](docs/assets/screenshots/guide.png) |
| **Phone view + SMS** — responders in the field<br>![Mobile](docs/assets/screenshots/mobile.png) | **Resident intake** — text or voice, get a code<br>![Intake](docs/assets/screenshots/intake.png) |

Run locally: `cd src && npm install && npm run dev`. No keys required; OpenAI, Supabase and Twilio are optional upgrades (see [src/README.md](src/README.md)).

## Research behind it

We studied about 20 programs and platforms (Cure Violence, Advance Peace, READI Chicago, Oakland Ceasefire, Glasgow VRU, the Cardiff Model, Unite Us, findhelp, CAHOOTS, Denver STAR, Ushahidi, Crisis Cleanup, and others), as well as police systems: NYPD CompStat, CAD/RMS, ShotSpotter, and Chicago's discontinued "heat list." The analysis covers what they got right and where they failed. A ninth study traces how ComForce is actually funded (a City DCWS contract via MKE Promise Keepers) and what that funder is now being asked to prove — which is what the **Grants & Evidence** page answers.

→ [docs/research/](docs/research/README.md) · **[Consolidated lessons](docs/research/lessons-learned.md)**

## Responsible technology

- 🚫 Never identifies, scores, or predicts individuals
- 🔒 PII redacted before AI. Contact data is separated from case data.
- 🧑‍⚖️ AI drafts, humans decide
- 📦 ComForce owns and can export all of its data
- 🧪 Synthetic data only
- 🆘 Safety first: when a caller describes abuse, a weapon or thoughts of self-harm, the agent shares 988 / Milwaukee County Crisis Line / Sojourner / 2-1-1, flags the case **Crisis** and pages the ComForce lead — partners see the need, never the details
- 🌐 Serves Milwaukee in English and Spanish today; Hmong callers are handled honestly (no fake fluency) and routed to Hmong-speaking partners

## Repository structure

```
.
├── README.md                     ← you are here
├── docs/
│   ├── challenge/                ← official brief, ComForce profile, judging criteria
│   ├── research/                 ← prior-art analysis (9 topics + lessons learned)
│   ├── brainstorm/               ← idea longlist, scoring matrix, recommended concept
│   ├── product/                  ← product spec & build schedule
│   ├── assets/                   ← diagrams (SVG) and app screenshots
│   ├── decisions/                ← architecture decision records (ADRs)
│   └── Relay-MKE-Playbook.pdf    ← everything above, as one PDF
├── src/                          ← Next.js app (see src/README.md)
│   ├── app/                      ← 7 surfaces + API routes
│   ├── components/               ← AppShell, board, ui
│   └── lib/                      ← ai (structure/redact/guide), db (store/seed), actions
├── tools/
│   ├── build-pdf.sh              ← builds the playbook PDF
│   └── voice/                    ← Jordan persona prompts (intake + partner dispatch) + ElevenLabs agent setup script
├── data/
│   └── synthetic/                ← synthetic demo data only
└── presentation/                 ← 2:00 pitch: animated HTML deck, script, demo runbook, PDF
```

## Team

| Name | Role |
| --- | --- |
| _TBD_ | |

## License

To be decided. An OSI-approved open-source license is planned so ComForce MKE and partners can adopt it freely.
