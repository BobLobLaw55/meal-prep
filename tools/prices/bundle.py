"""Build scrape.bundle.js = price_map.json inlined + scrape.js. Run after editing either file."""
import json, os
d = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(d, "price_map.json")))
m = {"postal": m["postal"], "items": [[i["k"], i["q"], i["need"], i["no"], i["unit"], i["g"], i["est"]] for i in m["items"]]}
src = open(os.path.join(d, "scrape.js")).read()
open(os.path.join(d, "scrape.bundle.js"), "w").write("var EMBEDDED_MAP = " + json.dumps(m, separators=(",", ":")) + ";\n" + src)
print("bundle", os.path.getsize(os.path.join(d, "scrape.bundle.js")), "bytes")
