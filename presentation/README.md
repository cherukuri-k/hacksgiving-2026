# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| [slides/index.html](slides/index.html) | The deck. One HTML file plus `slides/img/` and `slides/fonts/`, 11 slides, 1920×1080, scales to any screen. Works offline. Open in Chrome, press **F**. |
| [Relay-MKE-pitch.pdf](Relay-MKE-pitch.pdf) | Static export of the deck (11 pages, every slide in its final state). Backup if the laptop dies. |
| [pitch-script.md](pitch-script.md) | Word-for-word 2:00 script with beat timings matching the deck. |
| [demo-runbook.md](demo-runbook.md) | The 2:00 demo, second by second: who does what, pre-flight checklist, what to do when something breaks. |
| `slides/img/` | Real app screenshots used on slides; `slides/img/logos/` holds vendor logos for the stack slide. |

## Slide map

Slides 4–5 share one rhythm, shown by the pill top-right: **Today → With Relay → In the app**. The headline swaps from the problem to the fix, the diagram transforms, and the last press shrinks the diagram to a thumbnail while the real app screenshot slides in with pinned callouts.

| # | Slide | Presses | What happens |
| --- | --- | --- | --- |
| 1 | Team V · Relay MKE | — | Request rail draws itself on load, a pulse rides it; Verify step in coral. On the right, the resident's phone with a real thread from a recorded demo call; the text that closes the request is outlined in the same coral |
| 2 | About — one number, one board, one proof | 1 | Three real screens: phone, board, grants |
| 3 | Five problems, one thing missing | 2 | Five tiles flip from broken to solved and connect to "one shared record"; then 01–03 are tagged "live in the demo" and 04–05 "next" |
| 4 | Problem 4 · Awareness & decisions | 2 | Anecdotes over a map of Milwaukee → the City's 26 clusters appear, sized by requests; coral hotspots are called out; weekly brief → `/pulse` |
| 5 | Problem 5 · Training | 2 | Volunteers leave with their know-how → playbook, new volunteers, cited answer → `/guide` |
| 6 | Guardrails | 2 | Name, address and phone are redacted before the AI sees the message; four rules |
| 7 | Tech stack | 3 | Three numbered zones, one per press: the call becomes a record → every screen reads it → the resident closes the loop |
| 8 | Demo | — | Hand-off to live demo. **V** plays `demo-backup.mp4` if it exists |
| 9 | Benefits | 2 | Was/now cards, audience band |
| 10 | Cost — $1.68 | 2 | Price counts up with the real cost split; then 223 squares fill in, one per year of Relay that a year of findhelp enterprise ($75,000) would pay for |
| 11 | Closing caption + scorecard | — | "Care is not measured by how many we reach. It is measured by how many we don't lose." with thank-you and the QR to the repo on the left; the four criteria, each with where it was shown, and the three bonuses in one strip on the right; along the bottom, the challenge answered in one sentence |

19 presses reach the demo. Some presses play a short sequence; pressing again mid-sequence skips to its end.

**The Milwaukee map (slide 4).** `slides/img/milwaukee.svg` is the City of Milwaukee's 190 neighbourhood polygons from `data/public/milwaukee-neighborhoods.geojson`, simplified and drawn at 20 px per km. Each circle sits at its cluster's coordinates from `src/lib/clusters.ts`; its size and the call-out numbers were read from the `/grants` table (2026, synthetic data) when the slide was built, so update them if the seed changes.

**Hidden slides.** Problems 1 (information sharing), 2 (requests) and 3 (data and impact) each have a full slide that is switched off, because the live demo shows all three. A `<section>` with `data-skip` is left out of the deck, the counter and the PDF; delete the attribute to bring a slide back, or add it to hide one.

Type: Inter Tight (display) and Instrument Serif Italic (emphasis), both SIL Open Font License, bundled in `slides/fonts/`.

## Keys

| Key | Does |
| --- | --- |
| → Space Enter · click right half | Next step. **Nothing moves on its own** — every build (problem → solution, card moving lane, each stack connection) is one press. When a slide is fully revealed the next press changes slide. First press on slide 1 starts the 2:00 clock |
| ← · click left half | Previous slide (fully revealed) |
| Home / End | First / last slide |
| T · R | Start-stop / reset the clock |
| N | Speaker notes overlay |
| V | Play `../demo-backup.mp4` on slide 8 |
| F | Fullscreen |
| `#7` in the URL | Deep-link to a slide with everything revealed |

## Rebuilding the PDF

```
node pdf.mjs   # Playwright: opens slides/index.html?print, prints 12 pages at 1920×1080
```

(The script is three lines of `playwright-core`; `?print` reveals every fragment and freezes animations.)

## Screenshots

With the app running on `:3077`, capture `/board` and `/grants` at 1600×1000 and `/phone?number=4145550188` at 390×844 (2× scale) into `slides/img/` — `board.png`, `grants.png`, `phone-home.png`, `phone-messages.png`, `phone-dialer.png`; plus `/partners`, `/pulse`, `/guide`, `/impact` as `partners.png`, `pulse.png`, `guide.png`, `impact.png`.

`phone-loop.png` (title slide) is the Messages screen of the phone after a full demo run: the code text, "did the help arrive?", and the closing text. Capture it at 390×640 (3× scale) once a request from that phone has been verified. The coral outline on the slide is positioned over the third text; if the thread's wording or length changes, adjust `.title .ph .mark` in the deck's CSS.

Numbers on the visible slides come from the app on a **freshly reset board**, 2026, synthetic data: 200 requests · $336 platform cost for the year · $1.68 per request · $2.73 per resident-verified outcome (Grants → application tab → Platform cost), and the cluster counts on the map (Grants → cluster table). Each live demo request adds one. The hidden data slide still shows 203 / 186 / 124, captured when three demo requests were on the board. If the seed changes, update the script, the map on slide 4, the cost on slide 10, the scorecard and the hidden data slide.
