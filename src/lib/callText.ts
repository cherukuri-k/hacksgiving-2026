// Where a caller's tracking code is texted. Pure, so it is unit-tested (lib/callText.test.mts).

/** Accepts "414 555 0123", "(414) 555-0123", "+1 414…", or spoken digits; returns E.164 or undefined. */
export function normalizePhone(v?: string): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length > 11 && v.trim().startsWith("+")) return `+${d}`;
  return undefined;
}

const yes = (v: unknown) => v === true || /^(true|yes|y|1)$/i.test(String(v ?? ""));

export interface CallNumbers {
  /** A number the caller dictated because they want the text somewhere else. */
  callback_number?: string;
  /** The caller agreed to be texted on the line they are calling from. */
  callback_ok?: boolean | string;
  /** The line the call is on, as the phone itself reports it (the demo phone, a softphone). */
  caller_line?: string;
  /** The line the call is on, as the carrier reports it (a real phone call). */
  caller_id?: string;
}

/**
 * A number the caller asked for wins: they may be on a borrowed phone, and the code must not go
 * to its owner. Otherwise the line they are calling from, but only if they agreed to texts on it.
 *
 * @returns `to` the number to text, if any; `line` the line the call is on, if known
 */
export function textDestination(input: CallNumbers): { to?: string; line?: string } {
  const line = normalizePhone(input.caller_line) ?? normalizePhone(input.caller_id);
  const spoken = normalizePhone(input.callback_number);
  return { to: spoken ?? (yes(input.callback_ok) ? line : undefined), line };
}
