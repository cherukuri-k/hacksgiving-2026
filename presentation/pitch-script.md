# Pitch script — word for word

This is the script to say aloud, in full sentences. The same words are in the deck: press **N** on any slide to see that slide's lines, or open the presenter view.

**Length: 302 words. That is 2:37 at a slow pace (115 words a minute) and 2:09 at a normal speaking pace (140), before the slides' own animations. Your limit is 2:00, so as written this runs over.** Without slides 2, 4 and 5 it is 230 words: 2:00 slow, 1:38 normal. See "If you run long" at the end. Not yet timed aloud.

**→** means press once. Say the words before a **→**, press, then say the words after it. Slides 7, 8 and 9 play by themselves when you arrive, so there is nothing to press on them.

**Rehearse in the presenter view.** Open `slides/index.html?presenter`: the deck on the left, this script on the right with the line to say now in white, the clock, and how much time you should have left when you leave each slide. On the day, open the deck full screen on the projector and press **P**: the presenter view opens in a second window on your laptop and the two stay in step. The words live in one place in the deck (`const SCRIPT` in `slides/index.html`); change them there and here together.

---

## Before the demo

**Slide 1 — Title**

We're Team V, and this is Relay MKE. It gives ComForce one shared record for every request, and it only closes when the resident says help arrived.

**Slide 2 — About** *(press once, then speak)*

**→** Relay is one phone number, answered by Jordan, our AI agent, in English or Spanish. One board for every division. And one proof funders can check.

**Slide 3 — Five problems**

You gave us five problem areas. **→** We built a screen for each one. **→** And all five run on one shared record, which was the one thing missing.

**Slide 4 — Problem 4 · the map**

Take awareness. Leaders used to decide from what they happened to hear. **→** Now the map shows where help arrived, and where it is still missing. **→** *(this is the real screen; say nothing and move on)*

**Slide 5 — Problem 5 · training**

Or training. Know-how used to leave with each volunteer. **→** Now it is written down once, and the guide answers from it. **→** *(the real screen; move on)*

**Slide 6 — Guardrails**

And it is safe. Before any AI sees a message, **→** names, addresses and phone numbers are removed. **→** A person makes every decision. We never score or predict anyone, and all our data is synthetic.

**Slide 7 — The call** *(plays by itself)*

Here is one request, start to finish. A resident calls from any phone. Jordan answers, logs it, and texts them a tracking code.

**Slide 8 — The work** *(plays by itself)*

A ComForce worker sees the card, with tasks already drafted. Jordan phones a partner, and the run sheet says exactly where to go and who to ask for.

**Slide 9 — The proof** *(plays by itself)*

But delivered is not the end. Relay asks the resident if the help came, and if they don't reply, Jordan calls back. Only their yes closes it.

**Slide 10 — Demo**

Now watch it for real: who asked, who delivered, and the resident's own answer. *(play the demo; the clock pauses by itself on this slide and starts again when you move on)*

---

## After the demo

**Slide 11 — Cost** *(press once, then speak)*

**→** Everything you just watched cost one dollar sixty-eight. **→** A whole year costs three hundred and thirty-six dollars, and ComForce owns its data. The commercial option costs two hundred times more.

**Slide 12 — Closing** *(leave it up)*

**→** *(two hands meet and the view moves through them, about three and a half seconds; say the line over them, do not wait in silence)*

Care is not measured by how many we reach. It is measured by how many we don't lose. Thank you.

---

## What the judges asked for, and where you say it

| They asked | You say | Slide |
| --- | --- | --- |
| "Track whether people receive the help they need, while also noting who that help was delivered by" | "it only closes when the resident says help arrived" · "Only their yes closes it" · "who asked, who delivered, and the resident's own answer" | 1, 9, 10 |
| Accessibility: "can frontline workers and community members use it easily?" | "one phone number… in English or Spanish" · "A resident calls from any phone" | 2, 7 |
| Responsible technology; never identify or predict individuals; synthetic data only | "names, addresses and phone numbers are removed. A person makes every decision. We never score or predict anyone, and all our data is synthetic." | 6 |
| "Retain access to their own data" | "…and ComForce owns its data." | 11 |
| Cost, "a heavy consideration" | "one dollar sixty-eight… three hundred and thirty-six dollars… two hundred times more" | 11 |
| "Explain how your solution works to non-technical audiences" | No product names and no stack talk. Every line is something a volunteer would say. | all |

---

## If you run long

Cut in this order; each is one slide and the deck still makes sense without it:

1. Slide 5, Problem 5 · training — not one of the four criteria. Saves 21 words and two presses.
2. Slide 4, Problem 4 · the map — the title already shows Milwaukee and slide 3 already shows this problem solved. Saves 25 words and two presses.
3. Slide 2, About — its three points (one number, one board, one proof) are now the three journey slides. Saves 26 words. Before you cut it, add "in English or Spanish" to slide 7's line ("Jordan answers in English or Spanish, logs it…"), because nothing else says it.

To hide a slide, add `data-skip` to its `<section>` tag in `slides/index.html`. To bring back the three hidden problem slides, the tech stack slide or the Benefits slide (it sat between the demo and Cost), delete `data-skip` from them.
