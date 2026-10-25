"""Build data/recipes.json from the Python sources. Run: python3 tools/build.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ingredients import DB, STOCK
from recipes_breakfast import B
from recipes_dinner import D

out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(out_dir, exist_ok=True)

recipes, errors, ids = [], [], set()
for r in B + D:
    if r["id"] in ids: errors.append(f"dup id {r['id']}")
    ids.add(r["id"])
    tot = dict(kcal=0, p=0, c=0, f=0); cost = 0; ings = []
    for item in r["ingredients"]:
        key, qty = item[0], item[1]
        note = item[2] if len(item) > 2 else ""
        if key not in DB: errors.append(f"{r['id']}: unknown ingredient {key}"); continue
        d = DB[key]; grams = qty * d["g"]
        for m in tot: tot[m] += grams * d[m] / 100
        cost += qty * d["price"]
        ings.append({"k": key, "q": qty, "n": note})
    a, b = r["split"]
    share_total = r["nA"] * a + r["nB"] * b
    if abs(share_total - 1) > 0.03: errors.append(f"{r['id']}: shares sum to {share_total:.2f}")
    per = lambda s: {m: round(v * s) for m, v in tot.items()}
    rec = {k: v for k, v in r.items() if k not in ("ingredients", "split", "source")}
    rec.update(ingredients=ings, split=[a, b], batch={m: round(v) for m, v in tot.items()},
               macrosA=per(a), macrosB=per(b), cost=round(cost, 2),
               source={"name": r["source"][0], "url": r["source"][1]})
    recipes.append(rec)

if errors:
    print("\n".join(errors)); sys.exit(1)

json.dump({"version": 1, "ingredients": DB, "stock": STOCK, "recipes": recipes},
          open(os.path.join(out_dir, "recipes.json"), "w"), ensure_ascii=False, indent=1)

print(f"{len(recipes)} recipes")
for r in recipes:
    A, Bm = r["macrosA"], r["macrosB"]
    print(f"{r['meal'][:5]:6}{r['id'][:34]:35} A {A['p']:>3}g P {A['kcal']:>4} kcal | B {Bm['p']:>3}g P {Bm['kcal']:>4} kcal | ${r['cost']:.0f}")
