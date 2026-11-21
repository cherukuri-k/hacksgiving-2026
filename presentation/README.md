# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| [slides/index.html](slides/index.html) | The deck. One HTML file plus `slides/img/`, 13 slides, 1920×1080, scales to any screen. Open in Chrome, press **F**. |
| [Relay-MKE-pitch.pdf](Relay-MKE-pitch.pdf) | Static export of the deck (13 pages, every slide in its final state). Backup if the laptop dies. |
| [pitch-script.md](pitch-script.md) | Word-for-word 2:00 script with beat timings matching the deck. |
| [demo-runbook.md](demo-runbook.md) | The 2:00 demo, second by second: who does what, pre-flight checklist, what to do when something breaks. |
| `slides/img/` | Real app screenshots used on slides; `slides/img/logos/` holds vendor logos for the stack slide. |

## Slide map

Slides 4–8 share one rhythm, shown by the pill top-right: **Today → With Relay → In the app**. The headline swaps from the problem to the fix, the diagram transforms, and the last press shrinks the diagram to a thumbnail while the real app screenshot slides in with pinned callouts.

| # | Slide | Beat | Presses | What happens |
| --- | --- | --- | --- | --- |
| 1 | Team V · Relay MKE | 0:00 | — | Request rail draws itself on load, a pulse rides it; Verify step in coral |
| 2 | About — one number, one board, one proof | 0:08 | 3 | Three real screens: phone, board, grants |
| 3 | Five problems, one thing missing | 0:18 | 1 | Five illustrated tiles flip from broken to solved and connect to "one shared record" |
| 4 | Problem 1 · Information sharing | 0:28 | 3 | Tangle + unanswerable questions → one hub → `/partners` |
| 5 | Problem 2 · Requests & referrals | 0:44 | 6 | Resident's phone + board: card moves through five lanes, "did it arrive?" text goes back, YES verifies → `/board` |
| 6 | Problem 3 · Data & impact | 1:02 | 4 | 203 dots, one per request: logged → delivered → resident-confirmed (67 %) → `/grants` |
| 7 | Problem 4 · Awareness & decisions | 1:16 | 3 | Anecdotes → cluster map → coral gaps + weekly brief → `/pulse` |
| 8 | Problem 5 · Training | 1:30 | 4 | Volunteers leave with their know-how → playbook + new volunteers → cited answer → `/guide` |
| 9 | Tech stack | 1:44 | 8 | Each press reveals the next logo + flowing arrow |
| 10 | Demo | 2:05 | — | Hand-off to live demo. **V** plays `demo-backup.mp4` if it exists |
| 11 | Benefits | after demo | 2 | Was/now columns |
| 12 | Cost — $1.66 | after demo | 2 | Price counts up, cost bar segments grow, findhelp comparison |
| 13 | Thank you | — | — | QR to the repo |

## Keys

| Key | Does |
| --- | --- |
| → Space Enter · click right half | Next step. **Nothing moves on its own** — every build (problem → solution, card moving lane, each stack connection) is one press. When a slide is fully revealed the next press changes slide. First press on slide 1 starts the 2:00 clock |
| ← · click left half | Previous slide (fully revealed) |
| Home / End | First / last slide |
| T · R | Start-stop / reset the clock |
| N | Speaker notes overlay |
| V | Play `../demo-backup.mp4` on slide 10 |
| F | Fullscreen |
| `#7` in the URL | Deep-link to a slide with everything revealed |

## Rebuilding the PDF

```
node pdf.mjs   # Playwright: opens slides/index.html?print, prints 12 pages at 1920×1080
```

(The script is three lines of `playwright-core`; `?print` reveals every fragment and freezes animations.)

## Screenshots

With the app running on `:3077`, capture `/board` and `/grants` at 1600×1000 and `/phone?number=4145550188` at 390×844 (2× scale) into `slides/img/` — `board.png`, `grants.png`, `phone-home.png`, `phone-messages.png`, `phone-dialer.png`; plus `/partners`, `/pulse`, `/guide`, `/impact` as `partners.png`, `pulse.png`, `guide.png`, `impact.png`.

Numbers used anywhere in the pitch come from `/grants` on the seeded 2026 data (203 requests · 186 delivered · 124 resident-confirmed = 67 % · 145/203 in clusters = 71 % · 21/26 clusters · median 2 h 05 m · $1.66 per request). If the seed changes, update the script and slides 5 and 11.
