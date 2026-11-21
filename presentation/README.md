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
| `P` | Presenter cue line in the footer — current beat and next beat; turns amber if you're 5 s behind |
| `V` | Play / pause the backup demo video (slide 11) |
| `F` | Fullscreen |
| `#3` in the URL | Jump straight to slide 3 |

Swipe works on a phone or tablet, so a teammate can advance from the front row if the laptop is busy with the demo.

## Slide → script map

1. Title (0:00) · 2. The problem — Friday-night timeline (0:05) · 3. Five steps, the fourth skipped (0:25) · 4. The five hackathon tracks → five Relay modules (0:40) · 5. One record, two screens — phone + board (1:00) · 6. Architecture diagram — channels → Jordan (ElevenLabs + Claude) → the record → outputs (1:15) · 7. Proof — the ledger + 67 % / 71 % / 21 of 26 (1:30) · 8. Guardrails (1:42) · 9. Demo hand-off (1:52) · **demo** · 10. Cost $1.66 + close + QR · 11. Backup video · 12–13. Appendix for Q&A

9. **Demo video (backup only)** — placeholder until `presentation/demo-backup.mp4` exists; then it plays that file, `V` = play/pause. Skip it when the live demo works.

Appendix for Q&A, not part of the 2:00: 10. Tech stack · 11. Limits & next steps.

### Visual language

White stage, one sans typeface, near-black text and a single blue accent. Red appears once — for the step every program skips; green for resident-verified; amber for anything simulated. No decoration: thin rules, numbered lists, plain tables, full-sentence headlines, and large real screenshots. Motion is purposeful, never ornamental: slides rise in, the five-step connector draws itself and breaks red at Verify, stat numbers count up, the proof table rows cascade, the cost bars grow from zero, the board slides in from the right and the phone from below. Fragments cascade in automatically after a slide change, so one press per slide is enough; `←` goes back to the previous slide fully revealed; loading `#n` shows that slide fully revealed. `LIVE IN THE DEMO` / `SIMULATED` / `SYNTHETIC 2026 DATA` tags sit on anything a judge might question. Footer: left = deck name, centre = 2:00 timer (+ beat cue with `P`), right = slide counter and a thin top progress bar.

Numbers on slides 7 and 10 come from `/grants` on the seeded 2026 data (71 % · 21/26 · 2 h 5 m · 67 % · $1.66 per request). If the seed changes, update both the deck and the script.

## Regenerate screenshots and the PDF

Screenshots: with the app running on `:3077`, capture `/board` and `/grants` at 1600×1000 and `/phone?number=4145550188` at 390×844 (2× scale) into `slides/img/` — `board.png`, `grants.png`, `phone-home.png`, `phone-messages.png`, `phone-dialer.png`; plus `/partners`, `/pulse`, `/guide`, `/impact` as `partners.png`, `pulse.png`, `guide.png`, `impact.png` for the tracks slide.

PDF (one page per slide, all build steps revealed):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --print-to-pdf=presentation/Relay-MKE-pitch.pdf --no-pdf-header-footer \
  "file://$PWD/presentation/slides/index.html?print"
```
