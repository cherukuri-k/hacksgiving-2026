# Relay MKE local planner

Turns a resident's request into needs, a priority, and DRAFT tasks for a coordinator to approve.
Runs inside the Relay Next.js server: no API key, no GPU, no internet, about 1 to 15 ms per request, 2 MB on disk.

## How it was built
1. Public data (26 sources reviewed) plus 30 hand-written Milwaukee scenarios.
2. A 32B open model (Qwen 2.5, AWQ) on one H100 on MSOE's Rosie generated 500 Milwaukee scenarios (702 drafts, 500 passed rule checks).
3. The same model, as a judge, reviewed all 500: 29 pass, 411 revise, 60 reject (59 sent volunteers into unsafe work).
4. A small need classifier (TF-IDF + logistic regression) was trained on 4,006 public requests + 520 generated scenarios and exported to JSON.
   The TypeScript port matches the scikit-learn probabilities (tested).

## How it decides
| Step | What it does |
|---|---|
| Need detection | Classifier + keyword layer. Weak model-only guesses (< 0.55) do not create tasks; they appear under `possibleExtraNeeds`. |
| Signals | Crisis, safety concern, hazards (flood, no heat, power outage, medical equipment, gas...), calling for someone else, deadlines, vulnerable person. |
| Tasks | Safe templates per need ("refer / request / offer", never "secured / delivered"). Crisis or hazard: coordinator task first. Third-party caller: consent task. Always a final follow-up. |
| Priority | `safety_review` for crisis, a caller who feels unsafe, critical hazards, or no heat / extreme heat with a vulnerable person. `time_sensitive` for deadlines and other hazards. Else `normal`. |
| Self-check | Same rules as the Rosie judge: every need has a task, no outcome claims, crisis starts with a coordinator, consent when needed. |
| Similar cases | Top 3 approved scenarios from a bank of 470. |

## Results (honest)
| Test | Precision | Recall | F1 | At least one need right | Plans passing self-check | Crisis to coordinator first |
|---|---|---|---|---|---|---|
| 30 hand-written gold scenarios (never trained on)* | 0.85 | 0.81 | 0.83 | 100% | 30/30 | 3/3 |
| 104 held-out generated scenarios | 0.59 | 0.69 | 0.64 | 94% | 104/104 | 1/1 |

*Keyword gaps were found by looking at the gold set, so its numbers are optimistic. The generated set's labels are noisy (often incomplete), which lowers its precision.
Safety across all 500 generated scenarios: all 13 safety cases get a coordinator first (10 of 13 at `safety_review`); 17 of 487 ordinary cases (3%) are flagged `safety_review`.

## Limits
- Not a language model: it cannot read unusual phrasing as well as Claude. Keep a human coordinator approval step (already in Relay).
- Templates are generic roles, never real partners. Assigning a partner still means "awaiting partner".
- Labels came from synthetic data. Every coordinator edit in Relay is the best future training data: retrain with `training/train_needs.py`.

## Files
- `lib/planner/` code (`index.ts` entry), `model/need-model.json`, `model/case-bank.json`
- `lib/planner/planner.test.mts` (13 tests), `demo.mts`, `eval.mts`
- `training/train_needs.py` to retrain from new data

Run: `node --test lib/planner/planner.test.mts` and `node lib/planner/demo.mts "your request text"` (Node 22.18+).
