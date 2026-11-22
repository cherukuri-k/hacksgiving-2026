/**
 * One chat-completion door for the whole app. Picks a provider from env:
 *   ANTHROPIC_API_KEY → Claude (preferred when both are set)
 *   OPENAI_API_KEY    → OpenAI
 * Returns null when no provider is configured so callers can use their rule-based fallbacks.
 */

export interface CompleteOpts {
  system: string;
  user: string;
  temperature?: number;
  /** Ask for a single JSON object; the result is still a string — parse with `parseJson`. */
  json?: boolean;
  maxTokens?: number;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

export function llmProvider(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/** The model `complete()` will call, for audit trails. Null when no provider is configured. */
export function llmModel(): string | null {
  const provider = llmProvider();
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
  if (provider === "openai") return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return null;
}

export async function complete(opts: CompleteOpts): Promise<string | null> {
  const provider = llmProvider();
  if (!provider) return null;
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 600;

  if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = opts.json ? `${opts.system}\nRespond with exactly one JSON object and nothing else — no prose, no code fences.` : opts.system;
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: opts.user }],
    });
    return res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature,
    max_tokens: maxTokens,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/** Tolerant JSON extraction: strips code fences and anything around the outermost braces. */
export function parseJson(text: string | null): Record<string, unknown> {
  if (!text) return {};
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}
