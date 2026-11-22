# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| [slides/index.html](slides/index.html) | The deck. One HTML file plus `slides/img/` and `slides/fonts/`, 12 slides, 1920×1080, scales to any screen. Works offline. Open in Chrome, press **F**. |
| [Relay-MKE-pitch.pdf](Relay-MKE-pitch.pdf) | Static export of the deck (11 pages, every slide in its final state). Backup if the laptop dies. |
| [pitch-script.md](pitch-script.md) | Word-for-word 2:00 script with beat timings matching the deck. |
| [demo-runbook.md](demo-runbook.md) | The 2:00 demo, second by second: who does what, pre-flight checklist, what to do when something breaks. |
| `slides/img/` | Real app screenshots used on slides; `slides/img/logos/` holds vendor logos for the stack slide. |

## Slide map

Slides 4–5 share one rhythm, shown by the pill top-right: **Today → With Relay → In the app**. The headline swaps from the problem to the fix, the diagram transforms, and the last press shrinks the diagram to a thumbnail while the real app screenshot slides in with pinned callouts.

| # | Slide | Presses | What happens |
| --- | --- | --- | --- |
| 1 | Team V · Relay MKE | — | "Relay MKE" on one line with the tagline under it. On the right, Milwaukee's neighbourhoods wipe in and the last two months of requests replay the way Relay works: a request comes in, a line runs to the partner that took it and back, and the dot turns teal when the resident said the help arrived |
| 2 | About — one number, one board, one proof | 1 | Three real screens: phone, board, grants |
| 3 | Five problems, one thing missing | 2 | The five problems sit in a row. First press: a solution card drops in under each, joined by a wire that draws itself. Second press: five wires curve down from the solution cards into "One shared record", which lights up. A dot keeps travelling along every wire |
| 4 | Problem 4 · Awareness & decisions | 2 | Anecdotes over a map of Milwaukee → the City's 26 clusters appear, sized by requests; coral hotspots are called out; weekly brief → `/pulse` |
| 5 | Problem 5 · Training | 2 | Volunteers leave with their know-how → playbook, new volunteers, cited answer → `/guide` |
| 6 | Guardrails | 2 | Name, address and phone are redacted before the AI sees the message; four rules |
| 7 | The journey · the call | — | Four drawn scenes on one line: the resident's phone calling, Jordan answering, the tracking-code text, the status reply. Plays on arrival |
| 8 | The journey · the work | — | The card landing on the board, the drafted tasks, Jordan's call to a partner, the run sheet with its map and pickup note ("side door on W Lisbon Ave · ask for Denise") |
| 9 | The journey · the proof | — | "Mark delivered", the "did the help arrive?" text, Jordan's call-back, and the card turning teal: verified by the resident. The scenes are drawings of the app's screens; the quoted texts and the pickup note are the app's own wording. The line runs off one slide and onto the next, and a stepper at the top right shows which of the three you are on |
| 10 | Demo | — | Hand-off to live demo. **V** plays `demo-backup.mp4` if it exists |
| 11 | Cost — $1.68 | 2 | Price counts up with the real cost split; then 223 squares fill in, one per year of Relay that a year of findhelp enterprise ($75,000) would pay for |
| 12 | Closing | — | Arrives through a hand-off: two hands draw in from either side (one coral, one white), clasp, turn teal, and the view moves through the grip into the slide (about 3.5 s; a press skips it, back cancels it). Left half: "Thank you." in the title slide's two typefaces. Right half: "Care is not measured by how many we reach. It is measured by how many we don't lose.", and beneath it the challenge answered in three lines (one record, coordinated action, measurable impact) |

19 presses reach the demo. Some presses play a short sequence; pressing again mid-sequence skips to its end.

**The Milwaukee map (slide 4).** `slides/img/milwaukee.svg` is the City of Milwaukee's 190 neighbourhood polygons from `data/public/milwaukee-neighborhoods.geojson`, simplified and drawn at 20 px per km. Each circle sits at its cluster's coordinates from `src/lib/clusters.ts`; its size and the call-out numbers were read from the `/grants` table (2026, synthetic data) when the slide was built, so update them if the seed changes.

**Hidden slides.** Problems 1 (information sharing), 2 (requests) and 3 (data and impact) each have a full slide that is switched off, because the live demo shows all three. The Benefits slide (was/now cards, between the demo and Cost) is switched off too, to save time, as is the tech stack slide (vendor logos and how the parts connect), which the journey slide replaced. A `<section>` with `data-skip` is left out of the deck, the counter and the PDF; delete the attribute to bring a slide back, or add it to hide one.

Type: Inter Tight (display) and Instrument Serif Italic (emphasis), both SIL Open Font License, bundled in `slides/fonts/`.

## Keys

| Key | Does |
| --- | --- |
| → Space Enter · click right half | Next step. **Nothing moves on its own** — every build (problem → solution, card moving lane, each stack connection) is one press. When a slide is fully revealed the next press changes slide. First press on slide 1 starts the 2:00 clock |
| ← · click left half | Previous slide (fully revealed) |
| Home / End | First / last slide |
| T · R | Start-stop / reset the clock. The clock counts talking time: it pauses by itself on the demo slide and starts again when you move on |
| N | Speaker notes overlay (the script for this slide) |
| P | Open the presenter view in a second window. The two windows stay in step: a press in either one moves both |
| `?presenter` in the URL | The presenter view on its own, for rehearsing: deck on the left with the **speaker notes** under it (the whole script for that slide, the part to say now in white, then the next slide's script); on the right the same line in large type, the clock, and the time you should have left when you leave each slide |
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

**The title map (slide 1).** `slides/img/milwaukee-dark.svg` is the slide-4 basemap restyled for a dark slide. The map replays the requests logged in October and November 2026 on a freshly reset board (synthetic archive plus the seeded board), 47 of them, in the order they came in. Each one appears coral; a line runs to the partner that took it in the data and back; the dot turns teal if the resident's own answer was "yes, the help arrived", and stays coral otherwise. The five nobody has taken yet get no line. Afterwards the coral ones take turns to pulse. Each dot sits within about 850 m of its neighbourhood's centroid, because the app stores the area and never an address; the diamonds are the seed's partner organisations, which are fictional. `python3 presentation/titlemap.py` rebuilds the basemap and prints the four constants (`DOTS`, `PARTNERS`, `TOOK`, `MONTH`) to paste into the deck; rerun it if the seed changes. The data covers all of 2026; `FROM_MONTH` in the deck's script sets how much of it is shown (0 shows the whole year, which is busy).

Numbers on the visible slides come from the app on a **freshly reset board**, 2026, synthetic data: 200 requests · $336 platform cost for the year · $1.68 per request · $2.73 per resident-verified outcome (Grants → application tab → Platform cost), and the cluster counts on the map (Grants → cluster table). Each live demo request adds one. The hidden data slide still shows 203 / 186 / 124, captured when three demo requests were on the board. If the seed changes, update the script, the map on slide 4, the cost on slide 10, the scorecard and the hidden data slide.
