"""Turn the scraper's tab-separated dumps into data/prices.json.

Usage: python3 tools/prices/assemble.py walmart.tsv aldi.tsv deals.tsv [YYYY-MM-DD]
  walmart.tsv / aldi.tsv lines:  key <tab> price-per-app-unit <tab> package price <tab> product name
  deals.tsv lines:               key <tab> store <tab> price-per-app-unit (may be blank) <tab> ad text <tab> product <tab> valid-through
A missing or empty file is fine (that store just has no prices this week); last week's prices for that
store are kept, marked with their older date, so one failed scrape doesn't wipe the comparison.
"""
import json, os, sys, datetime

here = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(here, "..", "..", "data", "prices.json")
stores = json.load(open(os.path.join(here, "price_map.json")))["stores"]

def rows(path):
    if not path or not os.path.exists(path):
        return []
    return [l.rstrip("\n").split("\t") for l in open(path, encoding="utf-8") if l.strip()]

today = sys.argv[4] if len(sys.argv) > 4 else datetime.date.today().isoformat()
old = json.load(open(out_path)) if os.path.exists(out_path) else {"items": {}}
items = {}

for store, path in (("walmart", sys.argv[1] if len(sys.argv) > 1 else None), ("aldi", sys.argv[2] if len(sys.argv) > 2 else None)):
    got = rows(path)
    for r in got:
        if len(r) < 4: continue
        k, u, p, n = r[0], float(r[1]), float(r[2]), r[3]
        items.setdefault(k, {})[store] = {"u": round(u, 3), "p": p, "n": n, "d": today}
    if not got:  # keep last week's prices for a store that failed this week
        for k, v in old.get("items", {}).items():
            if store in v:
                items.setdefault(k, {})[store] = v[store]

for r in rows(sys.argv[3] if len(sys.argv) > 3 else None):
    if len(r) < 6: continue
    k, s, u, t, n, to = r[:6]
    items.setdefault(k, {}).setdefault("deals", []).append({"s": s, "u": float(u) if u else None, "t": t, "n": n, "to": to})

json.dump({"updated": today, "stores": stores, "items": items}, open(out_path, "w"), indent=1, ensure_ascii=False)
w = sum(1 for v in items.values() if "walmart" in v); a = sum(1 for v in items.values() if "aldi" in v)
d = sum(len(v.get("deals", [])) for v in items.values())
print(f"prices.json: {len(items)} ingredients, walmart {w}, aldi {a}, {d} deals")
