# Pitch script — 2:00 of talking, spoken slowly

245 spoken words. At a slow, clear pace (around 115 words a minute) that is 2:08 of talking, plus about 10 seconds for the builds and slide changes to play: **about 2:18, which is roughly 18 seconds over your two minutes.** Not yet timed aloud. The three journey slides added about 40 words; to get back under, cut slides 5, 4 and 2 (see the end), which brings it to about 1:45.

**→** = one press. Nothing moves until you press; some presses play a short sequence, and pressing again finishes it at once.

**Rehearse in the presenter view.** Open `slides/index.html?presenter`: the deck on the left, this script on the right with the line to say now in white, the clock, and how much time you should have left when you leave each slide. On the day, open the deck full screen on the projector and press **P**: the presenter view opens in a second window on your laptop and the two stay in step. The words below live in one place in the deck (`const SCRIPT` in `slides/index.html`); change them there and here together.

---

## What the judges asked for, and where you say it

| They asked | You say | Slide |
| --- | --- | --- |
| "Track whether people receive the help they need, while also noting who that help was delivered by" | "closed only when the resident says help arrived" · "who asked, who delivered, and the resident's own answer" | 1, 10 |
| Accessibility: "can frontline workers and community members use it easily?" | "One number to call or text, in English or Spanish, no app." | 2 |
| Responsible technology; never identify or predict individuals; synthetic data only | "names, addresses and phone numbers are removed… A person makes every decision. We never score or predict anyone, and all the data here is synthetic." | 6 |
| "Retain access to their own data" | "…and ComForce owns the data." | 11 |
| Cost, "a heavy consideration" | "$1.68… $336… two hundred times more." | 11 |
| "Explain how your solution works to non-technical audiences" | No product names, no stack talk. Every line is something a volunteer would say. | all |

---

## Before the demo

**Slide 1 — Title**

We are Team V. This is Relay MKE: one shared record for every request ComForce receives, closed only when the resident says help arrived.

**Slide 2 — About** *(→ ×1)*

**→** One number to call or text, in English or Spanish, no app. One board for every division. One proof for funders.

**Slide 3 — Five problems** *(→ ×2)*

You gave us five problems. **→** We built a screen for each. **→** All five run on one shared record. That was the one thing missing.

**Slide 4 — Problem 4 · the map** *(→ map · → real screen)*

Leaders decided from anecdote. **→** Now the map shows where help arrived, and where it's still missing. **→** *(the real screen: say nothing, move on)*

**Slide 5 — Problem 5 · training** *(→ playbook · → real screen)*

Know-how left with each volunteer. **→** Now it's written once, and the guide answers from it. **→** *(the real screen: move on)*

**Slide 6 — Guardrails** *(→ redaction · → four rules)*

Before any AI sees a message, **→** names, addresses and phone numbers are removed. **→** A person makes every decision. We never score or predict anyone, and all the data here is synthetic.

**Slides 7, 8, 9 — The journey: the call, the work, the proof** *(no presses on the slides; each plays by itself when you arrive, about four seconds)*

One request in twelve drawn scenes on a line that runs across all three slides. Talk over them; do not wait for them to finish.

*Slide 7, the call:* A resident calls. Jordan, our AI, answers, logs the request, and texts a tracking code.

*Slide 8, the work:* A worker sees the card, with tasks already drafted. Jordan phones a partner, and the run sheet says exactly where to go.

*Slide 9, the proof:* Delivered is not the end. Relay asks the resident, and Jordan calls back if they don't answer.

**Slide 10 — Demo**

Watch one request: who asked, who delivered, and the resident's own answer. *(play the demo; the clock pauses by itself on this slide and starts again when you move on)*

---

## After the demo

**Slide 11 — Cost** *(→ ×2)*

**→** Everything you watched cost one dollar sixty-eight. **→** The whole year, three hundred and thirty-six dollars, and ComForce owns the data. The commercial option costs two hundred times more.

**Slide 12 — Closing** *(leave it up)*

**→** Two hands meet and the view moves through them into this slide, about three and a half seconds. Say the line over them; do not wait in silence. A second press skips the hands.

Care is not measured by how many we reach. It is measured by how many we don't lose. Thank you.

---

## If you run long

Cut in this order; each is one slide and the deck still makes sense without it:

1. Slide 5, Problem 5 · training — not one of the four criteria. Saves about 12 seconds.
2. Slide 4, Problem 4 · the map — the title already shows Milwaukee and slide 3 already shows this problem solved. Saves about 11 seconds.
3. Slide 2, About — its three points (one number, one board, one proof) are now the three journey slides. Before you cut it, add "in English or Spanish" to the call slide's line, because nothing else says it.

To hide a slide, add `data-skip` to its `<section>` tag in `slides/index.html`. To bring back the three hidden problem slides, the tech stack slide or the Benefits slide (it sat between the demo and Cost), delete `data-skip` from them.
