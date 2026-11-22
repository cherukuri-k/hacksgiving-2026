// Evaluate the FULL planner (model + keywords + signals) on the hand-written gold set it never trained on.
import { readFileSync } from "node:fs";
import { RelayPlanner } from "./plan.ts";
const [modelPath, goldPath] = process.argv.slice(2);
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const planner = new RelayPlanner(model, []);
const gold = readFileSync(goldPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.record_type === "synthetic_mke");
let tp = 0, fp = 0, fn = 0, anyRight = 0, allFound = 0, checksPassed = 0, crisisOk = 0, crisisN = 0;
const misses: string[] = [];
for (const g of gold) {
  const p = planner.plan(g.resident_text);
  const want = new Set<string>(g.need_categories.filter((n: string) => n !== "other"));
  const got = new Set<string>(p.needs.map((n) => n.need));
  for (const n of got) want.has(n) ? tp++ : fp++;
  for (const n of want) if (!got.has(n)) { fn++; misses.push(`${g.scenario_id} missed ${n}`); }
  if ([...got].some((n) => want.has(n)) || (want.size === 0 && got.size === 0)) anyRight++;
  if ([...want].every((n) => got.has(n))) allFound++;
  if (p.check.passed) checksPassed++;
  if (want.has("safety") || want.has("mental_health")) { crisisN++; if (p.priority === "safety_review" && p.tasks[0].helperType === "coordinator_only") crisisOk++; }
}
const P = tp / (tp + fp), R = tp / (tp + fn);
console.log(JSON.stringify({ n: gold.length, precision: +P.toFixed(2), recall: +R.toFixed(2), f1: +(2 * P * R / (P + R)).toFixed(2),
  at_least_one_need_right: +(anyRight / gold.length).toFixed(2), all_needs_found: +(allFound / gold.length).toFixed(2),
  plans_passing_checker: `${checksPassed}/${gold.length}`, crisis_cases_routed_to_coordinator: `${crisisOk}/${crisisN}` }, null, 1));
console.log("misses:", misses.join("; "));
