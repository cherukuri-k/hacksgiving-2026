# Relay MKE — 2-minute live demo runbook

Starts the moment slide 10 (the demo slide) is on screen; slides 11–12 (cost, closing) are shown after the demo. Two people: **Presenter** (laptop, projected) and **Resident** (teammate, real phone). Target 1:50; hard cap 2:00.

## Screen layout (projected)

- Left ⅔: browser at `/board`, zoomed to 110 %.
- Right ⅓: the Resident's iPhone mirrored (QuickTime → File → New Movie Recording → camera dropdown → the iPhone) so the audience sees the call, the notification and the texts. If mirroring isn't possible, the Resident stands up and says their lines into the phone — the board tells the story on its own.

## Beat sheet

| Clock | Who | Action | What the room sees |
| --- | --- | --- | --- |
| 0:00 | Resident | On `/phone?number=4145550188` tap **Phone → Call**. Allow mic. | Call screen, "Calling…" then Jordan: *"Hey, this is Jordan with ComForce. What's going on today?"* |
| 0:05 | Resident | Say it all in one go: *"Hi — we had a fire last night at our house near 35th and Burleigh. There's five of us, two kids. We've got nowhere to sleep tonight and no food. You can text me on this phone."* | Transcript bubbles on the phone. Jordan asks nothing more: *"I'm so sorry. Getting this in right now."* |
| 0:22 | — | Jordan logs it and texts the code (about 20 s after the call starts; about 28 s if you leave out the last sentence and answer **"Yes, this one"** when he asks). | **Board:** new card slides in at the top — Housing + Food, critical, Sherman Park. **Phone:** notification drops from the top — *"Relay MKE: your request is logged as R-XXXX…"* |
| 0:35 | Resident | Jordan says the code and signs off in one sentence. Tap **End**; you can end as soon as the notification shows. | Resident taps the notification → Messages. |
| 0:45 | Presenter | Click the new card. The drawer opens with the **Tasks** already drafted and tailored to the call (optional: **Approve N tasks**, one click, stays on the board). Scroll to **Connect to a partner** → **Connect** on the suggested partner. | Drawer: numbered tasks for this household, then *"Jordan is calling the partner…"* and the partner-call transcript streams in; partner accepts; **run sheet** appears (pickup → resident). |
| 1:05 | Presenter | Click **Delivered**. | Timeline: *verification text sent*. **Phone:** text *"Did the help for R-XXXX arrive? Reply 1…"*. Resident does **not** reply. |
| 1:20 | Resident | Phone rings (Jordan's call-back). Tap **Answer**. *"Yes — everything came, thank you."* | Call transcript live on the phone and in the drawer. |
| 1:35 | Resident | Jordan thanks them and stays on the line. **Tap Hang up.** | **Board:** card flips to **Verified** (green) as soon as the resident says yes. **Phone:** the closing text *"We've recorded that the help for R-XXXX arrived…"* arrives only after the hang-up. |
| 1:40 | Presenter | Sidebar → **Grants** → Cluster evidence (already loaded in a second tab). | 71 % inside Countdown clusters · 21/26 · 67 % resident-confirmed · 2 h 5 m. |
| 1:50 | Presenter | Tab **Application** → **Draft application**. | Statement of need streams in, in the funder's vocabulary. *"Every number in there came from a request you just watched happen."* Stop. |

## Pre-flight (do this 30 minutes before, in order)

1. **Network.** Laptop on a hotspot, not venue Wi-Fi. Phone on cellular.
2. **Server.** `cd src && npx next build && npx next start -p 3077` (production build — the dev server white-screens over the tunnel).
3. **Tunnel.** Run `tools/voice/retunnel.sh`. It starts a fresh tunnel, writes the URL into `src/.env.local`, re-points Jordan's three agents, rebuilds, restarts the server and checks the result from outside (about 2 minutes; it resets the board). Then do the one step it prints: in ElevenLabs → Agents → Settings → Post-call webhook, paste `<tunnel>/api/voice/elevenlabs`. **The tunnel dies silently whenever the laptop sleeps or changes network**, so run `tools/voice/retunnel.sh --check` again right before you walk up — it changes nothing and must say OK.
4. **Demo timing.** In `src/.env.local`: `FOLLOWUP_SMS_WAIT_MS=8000` (Jordan calls back 8 s after Delivered). Default is 15 s; don't go below 6 s or the verification text and the ring overlap.
5. **Fresh board.** On `/board`, press the circular-arrow button at the top right (it no longer has a label; hover says "Reset demo data") so the live request is the top card. Confirm the **New** column shows **5**.
6. **Phones.** Open `<tunnel>/phone?number=4145550188` on the Resident's phone, tap Phone → Call once to grant the mic, hang up, then **Clear** the thread from the laptop (`/phone` → Clear) so no stale texts show. Screen auto-lock off. Volume up. Do Not Disturb **on** (so a real text doesn't pop over the demo).
7. **Tabs on the laptop**, left to right: `/board`, `/grants`, `/phone?number=4145550199` (hidden backup resident), `presentation/slides/index.html`. Close everything else. Browser zoom 110 %. Hide bookmarks bar.
8. **Dry run** the whole beat sheet once, with the clock. Then Reset demo again.

## If something breaks

| Symptom | Do this | Cost |
| --- | --- | --- |
| Jordan doesn't pick up / mic denied | Resident taps **Messages → "Text a request"** instead. Same card lands on the board. Say: *"Same intake, by text."* | 0 s |
| Jordan says he's "having trouble" logging the request | The tunnel is dead, so his tool can't reach the app. On stage: use the text fallback above. Before the demo: `tools/voice/retunnel.sh`. | 0 s |
| Card doesn't appear on the board within 10 s | Presenter opens `/r` and pastes the request text. Keep talking. | 10 s |
| Code text doesn't arrive on the phone | First check the page was reloaded since the last restart. Then say *"I didn't get it, send it to this phone."* Jordan re-sends the same code; no second card. | 8 s |
| Closing text doesn't appear | The resident hasn't hung up yet. Jordan never ends the call-back himself; tap **Hang up**. | 0 s |
| Call-back doesn't ring | Resident taps **"1 · yes it arrived"** in Messages. Card still flips to Verified. | 0 s |
| Tunnel dies mid-demo | Resident's phone is dead; laptop tab `/phone?number=4145550199` (localhost) becomes the resident. Presenter drives both. | 5 s |
| Everything dies | Play `presentation/demo-backup.mp4` (deck slide 10, press **V**) (record it in the dry run with QuickTime screen recording, 1:50). | — |

## Lines to say over the quiet moments

- While Jordan is calling the partner: *"That's a real call to the partner's phone — Jordan asks if they can take it, and writes down the answer. No volunteer is on hold."*
- While waiting for the call-back: *"We texted. No reply. In eight seconds Jordan calls — in the language the resident called in."*
- When the card flips green: *"That's the only green in the system. The helper didn't mark it. The resident did."*
