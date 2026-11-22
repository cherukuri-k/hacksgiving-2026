// Public entry point for the Relay local planner (server-side only: it reads two JSON files once).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RelayPlanner, type BankCase } from "./plan.ts";
import type { NeedModel } from "./needs.ts";

export { RelayPlanner, checkPlan, ENGINE } from "./plan.ts";
export type { Plan, PlanOptions, DraftTask, BankCase } from "./plan.ts";
export type { NeedId, DetectedNeed } from "./needs.ts";

let cached: RelayPlanner | null = null;

/** Load once per server process. modelDir defaults to <this folder>/model. */
export function getPlanner(modelDir = join(import.meta.dirname ?? ".", "model")): RelayPlanner {
  if (cached) return cached;
  const model = JSON.parse(readFileSync(join(modelDir, "need-model.json"), "utf8")) as NeedModel;
  const bank = JSON.parse(readFileSync(join(modelDir, "case-bank.json"), "utf8")) as BankCase[];
  cached = new RelayPlanner(model, bank);
  return cached;
}
