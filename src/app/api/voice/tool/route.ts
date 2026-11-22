import { NextResponse } from "next/server";
import { createRequestFromCall, type CallToolInput } from "@/lib/voice";

/** Webhook tool for the ElevenLabs agent: creates the request mid-call and returns a code to read back. */
export async function POST(req: Request) {
  const secret = process.env.VOICE_TOOL_SECRET;
  if (secret && req.headers.get("x-relay-secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as CallToolInput;
  if (!body.what_they_need) return NextResponse.json({ error: "what_they_need is required" }, { status: 400 });
  const { shortCode, request, texted, textedTo, line, resent } = await createRequestFromCall(body);
  const spoken = shortCode.replace("R-", "").split("").join(", ");
  const to4 = textedTo?.slice(-4);
  const line4 = line?.slice(-4);
  // Jordan has to say where the text went, so a caller who gave another number is not left waiting on the wrong phone.
  const where = !textedTo ? "" : textedTo === line ? `the number they are calling from (ending ${to4})`
    : line ? `the number ending ${to4}, which is NOT the phone they are calling from (that one ends ${line4})`
    : `the number ending ${to4}`;
  return NextResponse.json({
    ok: true,
    short_code: shortCode,
    spoken_code: spoken,
    texted,
    texted_to_ending: to4 ?? null,
    calling_from_ending: line4 ?? null,
    neighborhood: request.neighborhood,
    message: texted && resent ? `Sent the code ${shortCode} again, to ${where}. Tell them which number it went to. This is the same request, not a new one.`
      : texted ? `Logged as ${shortCode}. The code has been texted to ${where}. Tell them which number it went to and to check their messages; no need to spell the code out unless they ask.`
      : resent ? `Could not text ${shortCode}: no number to send it to. Read it out slowly: R, ${spoken}.`
      : `Logged as ${shortCode}. No number to text, so read it back slowly: R, ${spoken}.`,
  });
}
