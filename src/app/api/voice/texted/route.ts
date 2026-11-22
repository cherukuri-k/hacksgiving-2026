import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Only a call that has just happened can be asked about. */
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Which number a call's tracking code was texted to.
 *
 * For the resident's phone simulator on /phone only. A simulated phone has no number of its own
 * beyond a setting, so when the resident tells Jordan a different number it takes that number
 * and the text arrives on it. The call's id is known only to the device that made the call, and
 * only that caller's own number is returned.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("conversation");
  if (!id) return NextResponse.json({ error: "conversation is required" }, { status: 400 });
  const request = (await db.snapshot()).requests.find((r) => r.call?.conversationId === id);
  const recent = request && Date.now() - Date.parse(request.createdAt) < WINDOW_MS;
  return NextResponse.json({ logged: Boolean(request), number: recent ? request.contactRef ?? null : null });
}
