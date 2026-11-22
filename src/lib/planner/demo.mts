// Demo: node demo.mts "resident request text"   (or no argument for built-in examples)
import { join } from "node:path";
import { getPlanner } from "./index.ts";

const planner = getPlanner(join(import.meta.dirname, "model"));
const examples = process.argv.slice(2).length ? process.argv.slice(2) : [
  "Our basement flooded during the storm and ruined the food in our freezer. We have two kids and might need somewhere to stay.",
  "My mom is 80 and lives alone. Her furnace stopped working and it's freezing this week. She also needs a ride to her doctor on Tuesday.",
  "I got an eviction notice and my court date is Monday. I'm also behind on the electric bill.",
];
for (const text of examples) {
  const t0 = performance.now();
  const p = planner.plan(text);
  const ms = (performance.now() - t0).toFixed(1);
  console.log("\n" + "=".repeat(90));
  console.log(`CALL: ${text}`);
  console.log(`NEEDS: ${p.needs.map((n) => `${n.need} [${n.evidence}]`).join(", ") || "none (ask the caller)"}`);
  console.log(`PRIORITY: ${p.priority}${p.signals.notes.length ? "   NOTES: " + p.signals.notes.join("; ") : ""}`);
  console.log("DRAFT TASKS (a coordinator approves before anything happens):");
  for (const t of p.tasks) console.log(`  ${t.order}. [${t.helperType}] ${t.title}${t.heldUntilCoordinatorClears ? "  (held)" : ""}`);
  console.log(`ASK THE CALLER: ${p.followUpQuestions.join(" | ")}`);
  console.log(`SIMILAR CASES: ${p.similarCases.map((c) => `${c.theme} (${c.similarity})`).join("; ") || "none"}`);
  console.log(`SELF-CHECK: ${p.check.passed ? "passed" : "FAILED: " + p.check.issues.join("; ")}   (${ms} ms, no API, no GPU)`);
}
