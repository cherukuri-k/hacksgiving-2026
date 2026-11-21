# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| [slides/index.html](slides/index.html) | The deck. Single HTML file, no network needed. Open in Chrome, press **F** for fullscreen. |
| [pitch-script.md](pitch-script.md) | Word-for-word 2:00 script, one beat per slide, with the two lines we want remembered. |
| [demo-runbook.md](demo-runbook.md) | The 2:00 demo, second by second: who does what, pre-flight checklist, what to do when something breaks. |
| [Relay-MKE-pitch.pdf](Relay-MKE-pitch.pdf) | Static export of the deck for the submission form / backup. |

## Driving the deck

| Key | Action |
| --- | --- |
| `→` `Space` `Enter` click right half | Next build step, then next slide. First press also starts the 2:00 clock. |
| `←` click left half | Previous |
| `T` / `R` | Pause-resume / reset the clock (bottom center; amber at 0:20, red when over) |
| `N` | Presenter notes overlay (the script for the current slide) |
| `F` | Fullscreen |
| `#3` in the URL | Jump straight to slide 3 |

Swipe works on a phone or tablet, so a teammate can advance from the front row if the laptop is busy with the demo.

## Slide → script map

1. Title (0:00) · 2. The story (0:05) · 3. The loop that breaks (0:30) · 4. What we built (0:50) · 5. Proof funders can audit (1:15) · 6. Responsible + cost (1:35) · 7. Close → demo (1:50)

Numbers on slides 5 and 6 come from `/grants` on the seeded 2026 data (71 % · 21/26 · 2 h 5 m · 67 % · $1.66 per request). If the seed changes, update both the deck and the script.

## Regenerate the PDF

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --print-to-pdf=presentation/Relay-MKE-pitch.pdf --no-pdf-header-footer \
  "file://$PWD/presentation/slides/index.html?print"
```
