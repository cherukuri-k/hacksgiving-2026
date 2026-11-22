"""Train the Relay MKE need detector and export it as JSON for TypeScript.

Model: TF-IDF (word 1-2 grams, sublinear tf, l2 norm) + one-vs-rest logistic regression.
The TypeScript side (src/needs.ts) re-implements the exact same tokenizer and math.

Usage: python3 train_needs.py <unified.jsonl> <out_dir> [generated_or_judged.jsonl ...]
"""
import json, re, sys, random, math
from collections import Counter
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score

unified, out_dir, extra = sys.argv[1], sys.argv[2], sys.argv[3:]
NEEDS = ["food", "water", "housing", "utilities", "medical", "home_repair", "disaster_cleanup", "disaster_recovery",
         "transportation", "household_goods", "clothing", "financial", "legal_aid", "language_access",
         "internet_access", "employment", "mental_health", "safety"]
TOKEN = r"[a-z0-9']+"  # must match src/needs.ts


def norm(t):
    t = t.lower().replace("’", "'")
    return t


rows = [json.loads(l) for l in open(unified, encoding="utf-8")]
public = [r for r in rows if r["record_type"] == "public_real_message"]
handwritten = [r for r in rows if r["record_type"] == "synthetic_mke"]
generated = []
for p in extra:
    for l in open(p, encoding="utf-8"):
        if l.strip():
            r = json.loads(l)
            generated.append(r)  # need labels come from the call text; rejected TASK plans are not used here

rng = random.Random(7)
rng.shuffle(generated)
n_val = max(1, len(generated) // 5) if generated else 0
gen_val, gen_train = generated[:n_val], generated[n_val:]

PUBLIC_SKIP = {"safety"}  # disaster 'search and rescue/security' labels differ from our crisis meaning


def xy(recs, skip=()):
    X, Y = [], []
    for r in recs:
        X.append(norm(r["resident_text"]))
        Y.append([1 if (n in r["need_categories"] and n not in skip) else 0 for n in NEEDS])
    return X, np.array(Y)


Xp, Yp = xy(public, PUBLIC_SKIP)
Xg, Yg = xy(gen_train)
# Milwaukee-style synthetic text is closer to real Relay calls: repeat it so it outweighs the disaster messages
REP = 3
X_train = Xp + Xg * REP
Y_train = np.vstack([Yp] + [Yg] * REP) if len(Xg) else Yp

vec = TfidfVectorizer(token_pattern=TOKEN, ngram_range=(1, 2), min_df=2, max_features=20000,
                      sublinear_tf=True, norm="l2", smooth_idf=True, lowercase=False)
Xt = vec.fit_transform(X_train)

models = []
for j, need in enumerate(NEEDS):
    y = Y_train[:, j]
    if y.sum() < 3:
        models.append(None)
        print(f"  {need:18s} too few positives ({y.sum()}), keyword rules only")
        continue
    m = LogisticRegression(C=4.0, class_weight="balanced", max_iter=2000)
    m.fit(Xt, y)
    models.append(m)


def probs(texts):
    X = vec.transform([norm(t) for t in texts])
    P = np.zeros((len(texts), len(NEEDS)))
    for j, m in enumerate(models):
        if m is not None:
            P[:, j] = m.predict_proba(X)[:, 1]
    return P


# Tune one threshold per need on the generated validation split (fallback 0.5)
thr = {n: 0.5 for n in NEEDS}  # floor 0.35 below: a weak score never creates a need
if gen_val:
    Xv, Yv = xy(gen_val)
    Pv = probs(Xv)
    for j, n in enumerate(NEEDS):
        if models[j] is None or Yv[:, j].sum() == 0:
            continue
        best = max(np.arange(0.35, 0.86, 0.05), key=lambda t: f1_score(Yv[:, j], Pv[:, j] >= t, zero_division=0))
        thr[n] = round(float(best), 2)


def report(name, recs):
    if not recs:
        return {}
    X, Y = xy(recs)
    P = probs(X)
    pred = np.array([[1 if P[i, j] >= thr[n] else 0 for j, n in enumerate(NEEDS)] for i in range(len(X))])
    cols = [j for j in range(len(NEEDS)) if Y[:, j].sum() > 0]
    micro_f1 = f1_score(Y[:, cols], pred[:, cols], average="micro", zero_division=0)
    exact = float(np.mean([(Y[i, cols] == pred[i, cols]).all() for i in range(len(X))]))
    any_hit = float(np.mean([bool((Y[i] & pred[i]).any()) for i in range(len(X))]))
    print(f"\n[{name}] n={len(X)} micro-F1={micro_f1:.3f}  exact-match={exact:.2f}  at-least-one-need-right={any_hit:.2f}")
    per = {}
    for j in cols:
        p = precision_score(Y[:, j], pred[:, j], zero_division=0); r = recall_score(Y[:, j], pred[:, j], zero_division=0)
        per[NEEDS[j]] = {"precision": round(p, 2), "recall": round(r, 2), "support": int(Y[:, j].sum())}
        print(f"  {NEEDS[j]:18s} P={p:.2f} R={r:.2f} n={int(Y[:, j].sum())}")
    return {"n": len(X), "micro_f1": round(micro_f1, 3), "exact_match": round(exact, 2), "at_least_one": round(any_hit, 2), "per_need": per}


metrics = {"handwritten_gold": report("hand-written Milwaukee gold set (never trained on)", handwritten),
           "generated_validation": report("generated validation split", gen_val)}

# Export: vocabulary -> [index, idf]; per need: sparse weights (pruned), intercept, threshold
vocab = vec.vocabulary_
idf = vec.idf_
keep_terms = set()
need_out = {}
for j, n in enumerate(NEEDS):
    m = models[j]
    if m is None:
        need_out[n] = None
        continue
    w = m.coef_[0]
    idx = np.where(np.abs(w) >= 0.15)[0]
    keep_terms.update(int(i) for i in idx)
    need_out[n] = {"intercept": round(float(m.intercept_[0]), 5), "threshold": thr[n],
                   "weights": {int(i): round(float(w[i]), 4) for i in idx}}
inv = {i: t for t, i in vocab.items()}
# Note: idf for ALL vocab terms is needed for correct l2 normalisation, so export every term's idf compactly.
terms = [inv[i] for i in range(len(inv))]
model = {"version": 1, "token_pattern": TOKEN, "ngram_range": [1, 2], "sublinear_tf": True,
         "needs": NEEDS, "terms": terms, "idf": [round(float(x), 5) for x in idf],
         "classifiers": {n: (None if v is None else {"intercept": v["intercept"], "threshold": v["threshold"],
                                                       "weights": {str(k): x for k, x in v["weights"].items()}})
                         for n, v in need_out.items()},
         "training": {"public_messages": len(public), "generated_train": len(gen_train), "generated_val": len(gen_val),
                      "handwritten_gold": len(handwritten), "synthetic_repeat": REP},
         "metrics": metrics}
json.dump(model, open(f"{out_dir}/need-model.json", "w"), separators=(",", ":"))

# Parity fixture: a few texts with sklearn probabilities, so the TypeScript port can be checked exactly
fx = [r["resident_text"] for r in (handwritten[:6] + gen_val[:6])]
P = probs(fx)
json.dump([{"text": t, "probs": {n: round(float(P[i, j]), 6) for j, n in enumerate(NEEDS) if models[j] is not None}}
           for i, t in enumerate(fx)], open(f"{out_dir}/parity-fixture.json", "w"), indent=1)
print(f"\nexported {len(terms)} terms; nonzero weights kept: {sum(len(v['weights']) for v in need_out.values() if v)}")
json.dump([r["scenario_id"] for r in gen_val], open(f"{out_dir}/val-ids.json", "w"))
