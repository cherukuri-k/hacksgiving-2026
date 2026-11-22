import { NextResponse } from "next/server";
import { recordFollowUpResult, type FollowUpResultInput } from "@/lib/followup";

/** Webhook tool for the follow-up agent: records whether the help arrived while Jordan is still talking to the resident. */
export async function POST(req: Request) {
  const secret = process.env.VOICE_TOOL_SECRET;
  if (secret && req.headers.get("x-relay-secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as FollowUpResultInput;
  if (!body.arrived) return NextResponse.json({ error: "arrived is required" }, { status: 400 });
  const request = await recordFollowUpResult(body);
  if (!request) return NextResponse.json({ ok: false, message: "No open follow-up matched this call. Thank them and let them hang up when they are ready." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    status: request.status,
    message: body.arrived === "no"
      ? "Recorded. The case is reopened and the volunteer is notified. Apologize briefly and reassure them. Do not end the call: stay on the line until the resident hangs up."
      : "Recorded as delivered. Thank them warmly and remind them they can text their code any time. Do not end the call: stay on the line until the resident hangs up.",
  });
}
