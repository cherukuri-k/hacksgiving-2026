// Pure helpers for "Ask the Guide": which playbooks a question is about, and plain-text answers.

/** Words that appear in almost any question and say nothing about which playbook it concerns. */
const COMMON = new Set(["what", "when", "where", "which", "with", "from", "that", "this", "have", "does", "should", "about", "they", "them", "there", "their", "will", "would", "could", "your", "first", "step", "steps", "call", "into", "been", "just", "need", "help", "want", "someone", "anyone", "says", "said", "next", "then", "after", "before"]);

const words = (text: string) => new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !COMMON.has(w)));

/**
 * The playbooks a question is about, best first: at most two, and a second one only when it shares
 * at least half as many distinctive words as the best. An answer should not cite a playbook it did not use.
 */
export function rankPlaybooks<P extends { title: string; body: string; tags: string[] }>(question: string, playbooks: P[]): P[] {
  const q = words(question);
  const scored = playbooks
    .map((p) => ({ p, score: [...words(`${p.title} ${p.body} ${p.tags.join(" ")}`)].filter((w) => q.has(w)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.filter((s, i) => i === 0 || (i === 1 && s.score * 2 >= scored[0].score)).map((s) => s.p);
}

/** Models like to answer in Markdown; the Guide shows plain text, so drop the markup and keep the words. */
export function plainText(answer: string): string {
  return answer
    .replace(/^[ \t]*#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/^[ \t]*[*-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
