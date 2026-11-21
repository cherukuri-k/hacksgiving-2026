# Presentation

4 minutes, hard stop: **2:00 pitch → 2:00 live demo.**

| File | What it is |
| --- | --- |
| [slides/index.html](slides/index.html) | The deck. Single HTML file + `slides/img/` (real app screenshots), no network needed. Open in Chrome, press **F** for fullscreen. |
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
| `V` | Play / pause the backup demo video (slide 9) |
| `F` | Fullscreen |
| `#3` in the URL | Jump straight to slide 3 |

Swipe works on a phone or tablet, so a teammate can advance from the front row if the laptop is busy with the demo.

## Slide → script map

1. Title (0:00) · 2. The story — Friday-night timeline (0:05) · 3. The ring breaks — Verify falls out (0:30) · 4. One record, two screens — phone + board (0:50) · 5. The ring closes — seven stations, first ring → "yes, it arrived" (1:00) · 6. Evidence ledger + gauges (1:15) · 7. Guardrails, then the price tag (1:35) · 8. Close → demo (1:50)

9. **Demo video (backup only)** — placeholder until `presentation/demo-backup.mp4` exists; then it plays that file, `V` = play/pause. Skip it when the live demo works.

Appendix for Q&A, not part of the 2:00: 10. Tech stack · 11. Limits & next steps.

### Visual language

White stage, near-black serif headlines, two accents — **orange = the resident / human**, **blue = Relay / Jordan**. The recurring motif is the **ring**: the loop that breaks on slide 3 (Verify crumbles) and closes on slide 5 (seven stations, a dot travelling the circuit); gauges on slide 6, the seal on slide 8 and the top-right progress ring all reuse it. Slides wipe in like a curtain; fragments wipe left→right. `LIVE` / `SIMULATED` / `SYNTHETIC 2026 DATA` tags sit on anything a judge might question. Every screenshot is the real app (`slides/img/`, captured from `localhost:3077`). Top-right ring is slide progress + number; bottom-left is the 2:00 timer.

Numbers on slides 6 and 7 come from `/grants` on the seeded 2026 data (71 % · 21/26 · 2 h 5 m · 67 % · $1.66 per request). If the seed changes, update both the deck and the script.

## Regenerate screenshots and the PDF

Screenshots: with the app running on `:3077`, capture `/board` and `/grants` at 1600×1000 and `/phone?number=4145550188` at 390×844 (2× scale) into `slides/img/` — `board.png`, `grants.png`, `phone-home.png`, `phone-messages.png`, `phone-dialer.png`.

PDF (one page per slide, all build steps revealed):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --print-to-pdf=presentation/Relay-MKE-pitch.pdf --no-pdf-header-footer \
  "file://$PWD/presentation/slides/index.html?print"
```
