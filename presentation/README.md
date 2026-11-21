# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| [slides/index.html](slides/index.html) | The deck. Single self-contained HTML file, 12 slides, 1920×1080, scales to any screen. Open in Chrome, press **F**. |
| [Relay-MKE-pitch.pdf](Relay-MKE-pitch.pdf) | Static export of the deck (12 pages, every animation in its final state). Backup if the laptop dies. |
| [pitch-script.md](pitch-script.md) | Word-for-word 2:00 script with beat timings matching the deck. |
| [demo-runbook.md](demo-runbook.md) | The 2:00 demo, second by second: who does what, pre-flight checklist, what to do when something breaks. |
| `slides/img/` | Real app screenshots used on slides; `slides/img/logos/` holds vendor logos for the stack slide. |

## Slide map

| # | Slide | Beat | What animates |
| --- | --- | --- | --- |
| 1 | Team V · Relay MKE | 0:00 | Five-step request loop draws itself; Verify step in coral |
| 2 | About — one number, one board, one proof | 0:08 | Points cascade, board screenshot |
| 3 | Problem 1 · Information sharing | 0:20 | Tangle of 17 phone lines fades, one hub + spokes replaces it |
| 4 | Problem 2 · Requests & referrals | 0:38 | One card moves New → Claimed → In progress → Delivered → Verified |
| 5 | Problem 3 · Data & impact | 0:56 | Bars grow, 67 % donut counts up, “City: not measured” |
| 6 | Problem 4 · Awareness & decisions | 1:14 | Dot-matrix map; three coral gap clusters pulse; weekly brief |
| 7 | Problem 5 · Training | 1:30 | Volunteers fade out / join; playbook Q&A with source line |
| 8 | Tech stack | 1:45 | **Manual:** each → reveals the next logo + flowing arrow (8 clicks) |
| 9 | Demo | 2:05 | Hand-off to live demo. **V** plays `demo-backup.mp4` if it exists |
| 10 | Benefits | after demo | Was/now columns |
| 11 | Cost — $1.66 | after demo | Price counts up, cost bar segments grow, findhelp comparison |
| 12 | Thank you | — | QR to the repo |

## Keys

| Key | Does |
| --- | --- |
| → Space Enter · click right half | Next fragment / slide. First advance from slide 1 starts the 2:00 clock |
| ← · click left half | Previous slide (fully revealed) |
| Home / End | First / last slide |
| T · R | Start-stop / reset the clock |
| N | Speaker notes overlay |
| V | Play `../demo-backup.mp4` on slide 9 |
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
