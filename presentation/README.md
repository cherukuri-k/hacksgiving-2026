# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| `slides/` | The deck — being rebuilt from scratch. `slides/img/` holds real app screenshots and vendor logos (`slides/img/logos/`) for reuse. |
| [pitch-script.md](pitch-script.md) | Word-for-word 2:00 script with beat timings. Slide numbers in it refer to the previous deck and will be re-mapped when the new one lands. |
| [demo-runbook.md](demo-runbook.md) | The 2:00 demo, second by second: who does what, pre-flight checklist, what to do when something breaks. |

Previous decks are in git history (`git log -- presentation/slides/index.html`): v3 ring-motif `366c4d2`, v5 professional restyle `80e3fd4`, architecture-diagram version `7e29c6f`.

## Screenshots

With the app running on `:3077`, capture `/board` and `/grants` at 1600×1000 and `/phone?number=4145550188` at 390×844 (2× scale) into `slides/img/` — `board.png`, `grants.png`, `phone-home.png`, `phone-messages.png`, `phone-dialer.png`; plus `/partners`, `/pulse`, `/guide`, `/impact` as `partners.png`, `pulse.png`, `guide.png`, `impact.png`.

Numbers used anywhere in the pitch come from `/grants` on the seeded 2026 data (203 requests · 186 delivered · 124 resident-confirmed = 67 % · 145/203 in clusters = 71 % · 21/26 clusters · median 2 h 05 m · $1.66 per request). If the seed changes, update the script.
