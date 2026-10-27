/* Prep Counter weekly price scraper. Paste tools/prices/scrape.bundle.js (this file with the map built in; run
   python3 tools/prices/bundle.py after changing either) — store sites block fetching the map from GitHub. Paste the whole bundle into the browser (javascript_tool) on the page named
   in each step; it reads tools/prices/price_map.json from GitHub and stores results on window.__px.
   Steps:  1) on https://www.walmart.com/  -> await PX.walmart()
           2) on https://www.aldi.us/store/aldi/storefront -> PX.aldi() (runs in the background; poll PX.status())
           3) on https://backflipp.wishabi.com/flipp/items/search?locale=en-us&postal_code=32615&q=eggs -> await PX.flipp()
           Read results with PX.dump("walmart"|"aldi"|"deals", start, count). Each line is tab-separated. */
(() => {
  const MAP_URL = "https://raw.githubusercontent.com/BobLobLaw55/meal-prep/main/tools/prices/price_map.json";
  const G = { lb: 453.6, oz: 28.35, floz: 29.57, gal: 3785, qt: 946, pt: 473, l: 1000, ml: 1, g: 1, kg: 1000 };
  const COUNT_UNITS = ["each", "slice", "scoop", "bunch", "stalk", "pint", "can", "jar"];
  const px = (window.__px = window.__px || { walmart: {}, aldi: {}, deals: {}, log: [] });
  let MAP = null;
  async function map() {
    if (MAP) return MAP;
    MAP = window.__pxmap || (typeof EMBEDDED_MAP !== "undefined" && EMBEDDED_MAP) || await (await fetch(MAP_URL + "?t=" + Date.now())).json();
    MAP.items = MAP.items.map((i) => (Array.isArray(i) ? { k: i[0], q: i[1], need: i[2], no: i[3], unit: i[4], g: i[5], est: i[6] } : i));
    return MAP;
  }
  const lc = (s) => (s || "").toLowerCase();
  function matches(it, name) {
    const n = lc(name);
    return it.need.every((w) => w.split("|").some((a) => n.includes(a))) && !it.no.some((w) => n.includes(w));
  }
  // grams (or count) contained in a package, read from the product name / size text
  function size(text) {
    const t = lc(text).replace(/,/g, "");
    let m;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*lb/))) return { g: ((+m[1] + +m[2]) / 2) * G.lb };
    if ((m = t.match(/about\s*(\d+(?:\.\d+)?)\s*lb/))) return { g: +m[1] * G.lb };
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*fl\.?\s*oz/))) return { g: +m[1] * G.floz };
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)\b/))) return { g: +m[1] * G.lb, c: cnt(t) };
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*oz\b/))) return { g: +m[1] * G.oz, c: cnt(t) };
    if (/half gallon/.test(t)) return { g: G.gal / 2 };
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*gal/))) return { g: +m[1] * G.gal };
    if (/\bgallon\b/.test(t)) return { g: G.gal };
    const c = cnt(t); return c ? { c } : null;
  }
  function cnt(t) {
    let m;
    if ((m = t.match(/(\d+)\s*(?:count|ct|pk|pack|pieces|slices|eggs)\b/))) return +m[1];
    if (/\b(1\s*)?dozen\b/.test(t)) return 12;
    return 0;
  }
  // convert a store unit price string ("$2.57/lb", "17.1 ¢/oz", "$0.14/count") to price per DB unit
  function fromUnitPrice(it, s) {
    if (!s) return null;
    const m = lc(s).replace(/\s/g, "").match(/(\$)?(\d+(?:\.\d+)?)(¢)?\/(lb|oz|floz|fl\.oz|ct|count|each|ea|gal|qt|l)/);
    if (!m) return null;
    const val = m[3] ? +m[2] / 100 : +m[2], u = m[4].replace("fl.oz", "floz");
    if (["ct", "count", "each", "ea"].includes(u)) return ["each", "slice", "scoop"].includes(it.unit) ? val : null;
    const perG = val / G[u];
    return perG * it.g;
  }
  function perUnit(it, price, name, unitStr) {
    const fromU = fromUnitPrice(it, unitStr);
    if (fromU) return fromU;
    const sz = size(name);
    if (it.unit === "each" && sz && sz.c) return price / sz.c;
    if (it.unit === "can" || it.unit === "jar" || it.unit === "pint") return sz && sz.g && sz.c ? price / sz.c : price; // one container
    if (sz && sz.g) return price / (sz.g / it.g);
    if (sz && sz.c && COUNT_UNITS.includes(it.unit)) return price / sz.c;
    if (it.unit === "each" || it.unit === "bunch" || it.unit === "stalk") return price; // priced per piece
    return null;
  }
  function best(it, cands) {
    let out = null;
    for (const c of cands) {
      if (!c.n || !(c.p > 0) || !matches(it, c.n)) continue;
      const u = perUnit(it, c.p, c.n + " " + (c.sz || ""), c.unit);
      if (!u || u < it.est * 0.2 || u > it.est * 5) continue; // sanity check against the app's estimate
      if (!out || u < out.u) out = { u: +u.toFixed(3), p: c.p, n: c.n.slice(0, 80) };
    }
    return out;
  }

  async function walmart() {
    const M = await map(); let ok = 0;
    for (const it of M.items) {
      try {
        const h = await (await fetch("/search?q=" + encodeURIComponent(it.q), { credentials: "include" })).text();
        const d = JSON.parse(h.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)[1]);
        const items = d.props.pageProps.initialData.searchResult.itemStacks.flatMap((s) => s.items || []).filter((i) => i.name && i.price != null).slice(0, 10);
        const cands = items.map((i) => {
          const lines = (i.priceInfo && i.priceInfo.priceDetails && i.priceInfo.priceDetails.priceLines) || [];
          const up = lines.find((l) => l.lineType === "UNIT_PRICE");
          return { n: i.name, p: +i.price, unit: up && up.values[0] && up.values[0].value };
        });
        const b = best(it, cands); if (b) { px.walmart[it.k] = b; ok++; } else px.log.push("walmart miss " + it.k);
      } catch (e) { px.log.push("walmart err " + it.k + " " + e.message); }
      await new Promise((r) => setTimeout(r, 400));
    }
    return `walmart: ${ok}/${M.items.length}`;
  }

  // Aldi's site renders client-side, so each search loads in a hidden same-origin frame and is read as text.
  function parseAldi(txt) {
    return txt.split("Current price:").slice(1, 9).map((b) => {
      const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
      const p = +((lines[0].match(/\$(\d+(?:\.\d+)?)/) || [])[1] || 0);
      const junk = /^\$|^\/pkg|^each|^add$|best seller|in stock|out of stock|^organic$|gluten|original price|% off|^sp$|onsored|low fat|trans fat|^vegan|show similar|•|flavors/i;
      const name = lines.slice(1).find((l) => !junk.test(l) && /[a-z]{3}/i.test(l)) || "";
      const per = lines.find((l) => /^\$\d+(?:\.\d+)?\s*\/\s*(lb|oz|ct|each)/i.test(l));
      const sz = lines.find((l) => /^(about\s)?\d+(\.\d+)?\s*(oz|lb|fl oz|ct|count|gal)/i.test(l)) || "";
      const out = /out of stock/i.test(b) && !/many in stock/i.test(b);
      return { n: name, p, unit: per ? per.replace(/\s/g, "") : null, sz, out };
    }).filter((c) => !c.out);
  }
  let aldiState = "idle";
  async function aldiRun() {
    const M = await map(); aldiState = "running 0/" + M.items.length;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;left:0;top:0;width:1200px;height:900px;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(f);
    let i = 0, ok = 0;
    for (const it of M.items) {
      i++; if (px.aldi[it.k]) { ok++; continue; }
      for (let attempt = 0; attempt < 2; attempt++) {
        await new Promise((r) => { f.onload = r; f.src = "/store/aldi/s?k=" + encodeURIComponent(it.q); setTimeout(r, 15000); });
        let txt = "";
        for (let w = 0; w < 24; w++) {
          await new Promise((r) => setTimeout(r, 500));
          try { txt = f.contentDocument.body.innerText; } catch (e) { break; }
          if (/Current price|No results/.test(txt)) break;
        }
        if (/No results/.test(txt) && !/Current price/.test(txt)) break;
        const b = best(it, parseAldi(txt));
        if (b) { px.aldi[it.k] = b; ok++; break; }
      }
      if (!px.aldi[it.k]) px.log.push("aldi miss " + it.k);
      aldiState = `running ${i}/${M.items.length} (${ok} found)`;
    }
    f.remove(); aldiState = `done: ${ok}/${M.items.length}`;
  }

  // Weekly-ad specials for Publix, Winn-Dixie, Aldi and Walmart near the postal code (Flipp).
  async function flipp() {
    const M = await map(); const STORES = { "Publix": "publix", "Winn-Dixie": "winndixie", "ALDI": "aldi", "Walmart": "walmart" }; let n = 0;
    for (const it of M.items) {
      try {
        const q = it.q.replace(/\b\d+(\.\d+)?\s*(oz|lb|count|ct)\b/gi, "").replace(/\b(half gallon|gallon|can|bag|loaf)\b/gi, "").trim();
        const j = await (await fetch(`/flipp/items/search?locale=en-us&postal_code=${M.postal}&q=${encodeURIComponent(q)}`)).json();
        const deals = (j.items || []).filter((x) => STORES[x.merchant_name] && matches({ need: it.need.map((w) => w.split("|").map((a) => a.replace(/\d+%?/g, "").trim()).filter(Boolean).join("|")).filter(Boolean), no: it.no }, x.name)).slice(0, 4).map((x) => {
          const post = lc(x.post_price_text), pre = x.pre_price_text || "";
          let u = null, price = x.current_price;
          const multi = (pre + " " + (x.current_price || "")).match(/(\d+)\s*\/\s*\$?(\d+(?:\.\d+)?)/);
          if (multi) price = +multi[2] / +multi[1];
          if (price && /lb/.test(post) && it.unit === "lb") u = price;
          else if (price && /lb/.test(post)) u = (price / G.lb) * it.g;
          else if (price && !/bogo|off|free/i.test(pre + post)) { const v = perUnit(it, price, x.name, null); if (v && v > it.est * 0.2 && v < it.est * 5) u = v; }
          const txt = [pre, x.current_price != null ? "$" + x.current_price : "", x.post_price_text || ""].join(" ").replace(/\s+/g, " ").trim();
          return { s: STORES[x.merchant_name], n: x.name.slice(0, 70), t: txt, u: u ? +u.toFixed(3) : null, to: (x.valid_to || "").slice(0, 10) };
        });
        if (deals.length) { px.deals[it.k] = deals; n++; }
      } catch (e) { px.log.push("flipp err " + it.k + " " + e.message); }
    }
    return `deals found for ${n} items`;
  }
  function dump(store, start = 0, count = 30) {
    const src = px[store] || {}, keys = Object.keys(src).slice(start, start + count);
    if (store === "deals") return keys.map((k) => src[k].map((d) => [k, d.s, d.u ?? "", d.t, d.n, d.to].join("\t")).join("\n")).join("\n");
    return keys.map((k) => [k, src[k].u, src[k].p, src[k].n].join("\t")).join("\n");
  }
  window.PX = { walmart, aldi: () => { aldiRun(); return "started"; }, flipp, status: () => aldiState, dump, log: () => px.log.join("\n"), counts: () => Object.fromEntries(Object.entries(px).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])) };
  return "PX ready";
})();
