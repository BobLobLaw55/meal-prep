"""Build data/recipes.json from the Python sources. Run: python3 tools/build.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ingredients import DB, STOCK
from recipes_breakfast import B
from recipes_lunch import L
from recipes_dinner import D
from servings import DEFAULTS, LABELS, photo_url

out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(out_dir, exist_ok=True)

recipes, errors, ids = [], [], set()
for r in B + L + D:
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
    sv = dict(DEFAULTS[r["meal"]])
    sv["label"] = LABELS.get(r["id"], sv["label"])
    n = sv["servings"]
    per = {m: round(v / n) for m, v in tot.items()}
    rec = {k: v for k, v in r.items() if k not in ("ingredients", "source")}
    photo = photo_url(r["id"])
    if not photo: errors.append(f"{r['id']}: no photo")
    rec.update(ingredients=ings, servings=n, sA=sv["sA"], sB=sv["sB"], servingLabel=sv["label"],
               batch={m: round(v) for m, v in tot.items()}, perServing=per,
               macrosA={m: round(v / n * sv["sA"]) for m, v in tot.items()},
               macrosB={m: round(v / n * sv["sB"]) for m, v in tot.items()},
               cost=round(cost, 2), photo=photo, thumb=photo_url(r["id"], 240),
               source={"name": r["source"][0], "url": r["source"][1]})
    recipes.append(rec)

if errors:
    print("\n".join(errors)); sys.exit(1)

json.dump({"version": 2, "ingredients": DB, "stock": STOCK, "recipes": recipes},
          open(os.path.join(out_dir, "recipes.json"), "w"), ensure_ascii=False, indent=1)

print(f"{len(recipes)} recipes")
for r in recipes:
    s, A = r["perServing"], r["macrosA"]
    print(f"{r['meal'][:5]:6}{r['id'][:34]:35} serving {s['p']:>3}g P {s['kcal']:>4} cal | A {A['p']:>3}g | ${r['cost']:.0f}")
