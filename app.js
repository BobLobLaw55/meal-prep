"use strict";
/* Prep Counter: meal prep recipes, weekly plans and shopping lists.
   Ratings, pantry, freezer counts and the plan live in this browser's localStorage.
   Your own recipe photos live in IndexedDB on this phone. */

const KEY = "prepcounter:v1";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SUNDAY_TRIP_DAYS = [0, 1, 2];
const WEDNESDAY_TRIP_DAYS = [3, 4, 5, 6];
const PROTEINS = [["Beef", "Beef"], ["Chicken", "Chicken"], ["Turkey", "Turkey"], ["Dairy", "Eggs & dairy"]];
const PROTEIN_LABEL = Object.fromEntries(PROTEINS);
const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const AISLES = ["Meat", "Produce", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Condiments", "Spices & Seasonings"];
const HANDY = [["quick", "30 min or less"], ["freezer", "Freezer-friendly"], ["Slow cooker", "Slow cooker"], ["Air fryer", "Air fryer"],
  ["Sheet pan", "Sheet pan"], ["One pot", "One pot"], ["Wrap", "Wraps"], ["Sandwich", "Sandwiches"], ["Pasta", "Pasta"], ["Bowl", "Bowls"], ["No reheat", "No reheating"]];

let DATA = null, R = {}, S = null;
const PHOTOS = {}; // recipe id -> object URL of the user's own photo
const ui = { q: "", meal: "all", protein: "all", handy: new Set(), cuisine: "all", sort: "default", trip: "sun" };

/* ---------------- State ---------------- */
function defaultState() {
  const pantry = {}, stock = {};
  for (const [k, v] of Object.entries(DATA.ingredients)) if (v.pantry) pantry[k] = v.pantry;
  for (const [k, v] of Object.entries(DATA.stock)) stock[k] = v.lb;
  return { settings: { nameA: "Tyler", nameB: "Alisha", targetA: 180, targetB: 100, nights: [0, 1, 2, 3, 4] },
    ratings: {}, notes: {}, removed: [], pantry, stock, plan: null, history: [], checked: {} };
}
function load() {
  let s = null;
  try { const raw = localStorage.getItem(KEY); if (raw) s = Object.assign(defaultState(), JSON.parse(raw)); } catch (e) {}
  s = s || defaultState();
  if (s.settings.nameB === "Wife") s.settings.nameB = "Alisha";
  for (const [k, v] of Object.entries(DATA.ingredients)) if (v.pantry && !(k in s.pantry) && !s.pantrySeen?.includes(k)) s.pantry[k] = v.pantry;
  s.pantrySeen = Object.keys(DATA.ingredients);
  if (s.plan) {
    s.plan.lunches = s.plan.lunches || [null, null];
    s.plan.breakfasts = s.plan.breakfasts.map((id) => (R[id] ? id : null));
    s.plan.lunches = s.plan.lunches.map((id) => (R[id] ? id : null));
    for (const d of Object.keys(s.plan.dinners)) if (!R[s.plan.dinners[d]]) delete s.plan.dinners[d];
  }
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Couldn't save on this device"); } }

/* ---------------- Your photos (IndexedDB) ---------------- */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open("prepcounter-photos", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("photos");
      r.onsuccess = () => res((this.db = r.result));
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("photos", mode); const out = fn(t.objectStore("photos")); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); },
  put(id, blob) { return this.tx("readwrite", (s) => s.put(blob, id)); },
  del(id) { return this.tx("readwrite", (s) => s.delete(id)); },
  async all() {
    const db = await this.open();
    return new Promise((res) => {
      const out = {}, req = db.transaction("photos").objectStore("photos").openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      req.onerror = () => res(out);
    });
  },
};
async function loadPhotos() { try { const all = await idb.all(); for (const [id, blob] of Object.entries(all)) PHOTOS[id] = URL.createObjectURL(blob); } catch (e) {} }
function shrink(file, max = 1200) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.82);
    };
    img.onerror = rej; img.src = url;
  });
}

/* ---------------- Helpers ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nameA = () => S.settings.nameA || "Person 1";
const nameB = () => S.settings.nameB || "Person 2";
const fillNames = (s) => esc(s).replaceAll("{A}", esc(nameA())).replaceAll("{B}", esc(nameB()));
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2300); }
const FRACS = [[0, ""], [0.125, "⅛"], [0.25, "¼"], [0.333, "⅓"], [0.5, "½"], [0.667, "⅔"], [0.75, "¾"], [1, ""]];
function frac(x) {
  if (x <= 0) return "0";
  let whole = Math.floor(x), rem = x - whole, best = FRACS[0];
  for (const f of FRACS) if (Math.abs(rem - f[0]) < Math.abs(rem - best[0])) best = f;
  if (best[0] === 1) { whole += 1; best = FRACS[0]; }
  if (whole === 0 && !best[1]) return "⅛";
  return (whole ? whole : "") + best[1];
}
const PLURAL = { cup: "cups", slice: "slices", can: "cans", jar: "jars", scoop: "scoops", pint: "pints", bunch: "bunches", stalk: "stalks" };
const COUNTED = ["each", "can", "jar", "pint", "bunch", "slice", "stalk", "scoop"];
function fmtQty(q, unit, shopping = false) {
  let n;
  if (COUNTED.includes(unit)) n = shopping ? String(Math.ceil(q - 0.01)) : frac(q);
  else if (unit === "lb") n = frac(Math.round(q * 4) / 4 || 0.25);
  else if (unit === "oz") n = String(Math.round(q * 2) / 2).replace(".5", "½");
  else n = frac(q);
  if (unit === "each") return n;
  return `${n} ${q > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`;
}
function itemName(d, q) {
  const n = d.name;
  if (d.unit !== "each" || q <= 1 || /s$|\(|zucchini/i.test(n)) return n;
  return /tomato$/.test(n) ? n + "es" : n + "s";
}
function avgRating(id) { const r = S.ratings[id]; if (!r) return 0; const v = [r.A, r.B].filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
const fmtTime = (t) => (t >= 120 ? `${Math.round(t / 60)} hr` : `${t} min`);
function cookTime(r) { return r.total >= 120 ? `${r.active} min hands-on, ${Math.round(r.total / 60)} hr total` : r.total === r.active ? `${r.total} min` : `${r.active} min hands-on, ${r.total} total`; }
const active = () => DATA.recipes.filter((r) => !S.removed.includes(r.id));
const servingsWord = (n) => `${n} serving${n === 1 ? "" : "s"}`;
function photoHTML(r, size = "thumb") {
  const src = PHOTOS[r.id] || (size === "thumb" ? r.thumb : r.photo);
  const initial = esc(r.title.charAt(0));
  return `<div class="ph">${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span class=&quot;ph-fallback&quot;>${initial}</span>'">` : `<span class="ph-fallback">${initial}</span>`}</div>`;
}
const legendHTML = () => `<div class="legend" aria-label="Color key"><span>Color shows the main protein:</span>${PROTEINS.map(([k, l]) => `<span><i class="dot ${k}"></i>${l}</span>`).join("")}</div>`;

/* ---------------- Router ---------------- */
const TABS = ["recipes", "week", "list", "pantry", "more"];
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("sync=")) return importFromLink(h.slice(5));
  if (h.startsWith("r/")) { if (!view().innerHTML) render("recipes", false); return openRecipe(decodeURIComponent(h.slice(2))); }
  closeSheet(false);
  render(TABS.includes(h) ? h : "recipes");
}
function render(tab, scroll = true) {
  document.querySelectorAll(".tabs a").forEach((a) => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("#view").dataset.tab = tab;
  ({ recipes: viewRecipes, week: viewWeek, list: viewList, pantry: viewPantry, more: viewMore })[tab]();
  if (scroll) window.scrollTo(0, 0);
}
const view = () => $("#view");
const currentTab = () => $("#view").dataset.tab || "recipes";
const refreshCurrent = () => render(currentTab(), false);

/* ---------------- Recipes ---------------- */
function viewRecipes() {
  const cuisines = [...new Set(DATA.recipes.map((r) => r.cuisine))].sort();
  view().innerHTML = `
    <h1 class="hello">What are we eating, ${esc(nameA())} &amp; ${esc(nameB())}?</h1>
    <p class="lede">${active().length} high-protein recipes. Breakfasts make 4 mornings, lunches make 2 days, and each dinner covers tonight plus tomorrow's lunch.</p>
    <label class="sr-only" for="q">Search recipes</label>
    <input id="q" class="search" type="search" placeholder="Search a dish or ingredient, like tacos or sourdough" value="${esc(ui.q)}" autocomplete="off">
    <div class="filters">
      <div class="fgroup"><span class="flabel" id="lMeal">Meal</span><div class="chips" role="group" aria-labelledby="lMeal">
        ${[["all", "All"], ["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"]].map(([v, l]) => chip("meal", v, l)).join("")}
      </div></div>
      <div class="fgroup"><span class="flabel" id="lProt">Main protein (the card's color)</span><div class="chips" role="group" aria-labelledby="lProt">
        ${chip("protein", "all", "Any")}${PROTEINS.map(([v, l]) => chip("protein", v, l, `<i class="dot ${v}"></i>`)).join("")}
      </div></div>
      <div class="fgroup"><span class="flabel" id="lHandy">Handy filters</span><div class="chips" role="group" aria-labelledby="lHandy">
        ${HANDY.map(([v, l]) => `<button class="chip" data-handy="${esc(v)}" aria-pressed="${ui.handy.has(v)}">${esc(l)}</button>`).join("")}
      </div></div>
      <div class="frow">
        <label>Cuisine<select id="cuisine" class="inline"><option value="all">Any cuisine</option>${cuisines.map((c) => `<option ${ui.cuisine === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label>Sort by<select id="sort" class="inline">
          ${[["default", "Name"], ["rating", "Our ratings"], ["protein", "Most protein"], ["time", "Fastest"], ["cost", "Cheapest"]].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
      </div>
    </div>
    <p class="count" id="count"></p>
    <ul class="recipe-list" id="list"></ul>`;
  const q = $("#q");
  q.addEventListener("input", () => { ui.q = q.value; drawList(); });
  view().querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    ui[b.dataset.filter] = b.dataset.value;
    b.parentElement.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    drawList();
  }));
  view().querySelectorAll("[data-handy]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.handy; ui.handy.has(v) ? ui.handy.delete(v) : ui.handy.add(v);
    b.setAttribute("aria-pressed", ui.handy.has(v)); drawList();
  }));
  $("#cuisine").addEventListener("change", (e) => { ui.cuisine = e.target.value; drawList(); });
  $("#sort").addEventListener("change", (e) => { ui.sort = e.target.value; drawList(); });
  drawList();
}
function chip(filter, value, label, prefix = "") {
  return `<button class="chip" data-filter="${filter}" data-value="${esc(value)}" aria-pressed="${ui[filter] === value}">${prefix}${esc(label)}</button>`;
}
function matchesHandy(r, h) {
  if (h === "quick") return r.total <= 30;
  if (h === "freezer") return r.freezer;
  return r.tags.includes(h) || r.equipment.includes(h);
}
function filtered() {
  const words = ui.q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = active().filter((r) => {
    if (ui.meal !== "all" && r.meal !== ui.meal) return false;
    if (ui.protein !== "all" && r.protein !== ui.protein) return false;
    if (ui.cuisine !== "all" && r.cuisine !== ui.cuisine) return false;
    for (const h of ui.handy) if (!matchesHandy(r, h)) return false;
    if (words.length) {
      const hay = [r.title, r.blurb, r.cuisine, r.protein, r.meal, ...r.tags, ...r.equipment, ...r.ingredients.map((i) => DATA.ingredients[i.k].name)].join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const sorters = {
    default: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => avgRating(b.id) - avgRating(a.id) || a.title.localeCompare(b.title),
    protein: (a, b) => b.perServing.p - a.perServing.p,
    time: (a, b) => a.total - b.total,
    cost: (a, b) => a.cost - b.cost,
  };
  return list.sort(sorters[ui.sort] || sorters.default);
}
function drawList() {
  const list = filtered();
  $("#count").textContent = `Showing ${list.length} recipe${list.length === 1 ? "" : "s"}`;
  $("#list").innerHTML = list.length ? list.map(cardHTML).join("") : `<li class="empty">Nothing matches those filters. Try turning one off or searching a single ingredient.</li>`;
  $("#list").querySelectorAll("[data-id]").forEach((li) => {
    li.addEventListener("click", () => openRecipe(li.dataset.id));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRecipe(li.dataset.id); } });
  });
}
function cardHTML(r) {
  const rating = avgRating(r.id);
  return `<li class="card ${r.protein}" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(r.title)}">
    ${photoHTML(r)}
    <div>
      <p class="c-title">${esc(r.title)}</p>
      <div class="c-meta">
        <span>${MEAL_LABEL[r.meal]}</span><span>${fmtTime(r.total)}</span><span>${esc(r.cuisine)}</span>
        ${r.freezer ? "<span>Freezes</span>" : ""}${r.heat === "medium" ? "<span>Medium heat</span>" : ""}
        ${rating ? `<span class="stars-inline" aria-label="Rated ${rating.toFixed(1)} of 5">${"★".repeat(Math.round(rating))}</span>` : ""}
      </div>
      <span class="c-protein">${r.perServing.p}g protein per serving</span>
    </div>
  </li>`;
}

/* ---------------- Recipe sheet ---------------- */
function openRecipe(id) {
  const r = R[id]; if (!r) return toast("That recipe isn't here anymore");
  const removed = S.removed.includes(id), rate = S.ratings[id] || {}, own = !!PHOTOS[id];
  const tag = (k) => (S.pantry[k] === "have" ? `<span class="tag">in pantry</span>` : S.pantry[k] === "check" ? `<span class="tag">usually have</span>` : DATA.ingredients[k].stock ? `<span class="tag">freezer</span>` : "");
  const ps = r.perServing;
  const who = (name, n, m) => `<div class="who-row"><b>${esc(name)}</b><span class="amt">${servingsWord(n)}</span><span class="tot">${m.p}g protein, ${m.kcal} cal, ${m.c}g carbs, ${m.f}g fat</span></div>`;
  $("#sheetBody").innerHTML = `
    <div class="hero">${photoHTML(r, "full")}
      <div class="photo-actions">
        <button id="addPhoto">${own ? "Replace our photo" : "Add our photo"}</button>
        ${own ? `<button id="delPhoto">Use stock photo</button>` : ""}
      </div>
      ${own ? "" : `<span class="photo-credit">Sample photo, Unsplash</span>`}
    </div>
    <div class="sheet-inner">
      <div class="d-kicker"><span class="dot ${r.protein}" aria-hidden="true"></span>${PROTEIN_LABEL[r.protein]}, ${MEAL_LABEL[r.meal].toLowerCase()}, ${esc(r.cuisine)}</div>
      <h2 class="d-title" id="sheetTitle">${esc(r.title)}</h2>

      <div class="ticket">
        <div class="t-head"><b>Per serving</b><span>1 serving = ${esc(r.servingLabel)}</span></div>
        <div class="t-macros">
          <div class="big"><strong>${ps.p}g</strong><small>protein</small></div>
          <div><strong>${ps.kcal}</strong><small>calories</small></div>
          <div><strong>${ps.c}g</strong><small>carbs</small></div>
          <div><strong>${ps.f}g</strong><small>fat</small></div>
        </div>
        <div class="who">
          ${who(nameA(), r.sA, r.macrosA)}
          ${who(nameB(), r.sB, r.macrosB)}
        </div>
      </div>

      <p class="d-blurb">${fillNames(r.blurb)}</p>
      <div class="facts">
        <span class="fact">${cookTime(r)}</span>
        <span class="fact">Makes ${r.servings} servings: ${r.meal === "breakfast" ? "4 mornings each" : r.meal === "lunch" ? "2 lunches each" : "dinner tonight + lunch tomorrow"}</span>
        <span class="fact">About $${Math.round(r.cost)} a batch</span>
        <span class="fact">${r.equipment.map(esc).join(", ")}</span>
        ${r.freezer ? `<span class="fact">Freezes well</span>` : ""}
        <span class="fact">${r.heat === "medium" ? "Medium heat" : "Mild"}</span>
      </div>

      <h3>Ingredients</h3>
      <ul class="ing-list">${r.ingredients.map((i) => { const d = DATA.ingredients[i.k]; return `<li><span><span class="qty">${esc(fmtQty(i.q, d.unit))}</span> ${esc(itemName(d, i.q))}${i.n ? `<span class="note">, ${esc(i.n)}</span>` : ""}</span>${tag(i.k)}</li>`; }).join("")}</ul>

      <h3>Steps</h3>
      <ol class="step-list">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>

      ${r.prep ? `<div class="callout"><p><b>Prep-day head start</b></p><p>${esc(r.prep)}</p></div>` : ""}
      <div class="callout"><p><b>Storage:</b> ${esc(r.storage)}</p><p><b>Reheat:</b> ${esc(r.reheat)}</p></div>
      ${r.notes ? `<div class="callout"><p>${fillNames(r.notes)}</p></div>` : ""}

      <h3>Split it exactly</h3>
      <p class="lede">Weigh the finished batch (without the container) for exact portions.</p>
      <div class="weigh">
        <label for="wt">Batch weight in grams</label>
        <input id="wt" type="number" inputmode="numeric" min="0" placeholder="e.g. 2400">
      </div>
      <p id="wtOut" class="lede" aria-live="polite" style="margin-top:8px"></p>

      <h3>How did we like it?</h3>
      ${starRow("A", nameA(), rate.A)}${starRow("B", nameB(), rate.B)}
      <label class="sr-only" for="note">Notes</label>
      <textarea id="note" placeholder="Notes for next time: more garlic, double the sauce…">${esc(S.notes[id] || "")}</textarea>

      <div class="btn-row">
        <button class="btn" id="addWeek">Add to this week</button>
        <button class="btn ghost" id="shareR">Share recipe</button>
        <button class="btn ${removed ? "ghost" : "danger"}" id="removeR">${removed ? "Put back in rotation" : "Remove from rotation"}</button>
      </div>
      <p class="source">Inspired by <a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.name)}</a>. This version is rewritten for your servings, pantry, and spice rack. Macros are estimates from the ingredients.</p>
    </div>`;
  showSheet();
  if (location.hash !== "#r/" + id) history.replaceState(null, "", "#r/" + id);

  $("#wt").addEventListener("input", (e) => {
    const g = parseFloat(e.target.value), one = g / r.servings;
    $("#wtOut").textContent = g > 0 ? `1 serving is ${Math.round(one)} g. ${nameA()}: ${Math.round(one * r.sA)} g per meal. ${nameB()}: ${Math.round(one * r.sB)} g per meal.` : "";
  });
  $("#sheetBody").querySelectorAll(".star").forEach((b) => b.addEventListener("click", () => {
    const w = b.dataset.who, n = +b.dataset.n;
    S.ratings[id] = S.ratings[id] || {};
    S.ratings[id][w] = S.ratings[id][w] === n ? 0 : n; save();
    b.parentElement.querySelectorAll(".star").forEach((s) => { s.classList.toggle("on", +s.dataset.n <= S.ratings[id][w]); s.setAttribute("aria-pressed", +s.dataset.n === S.ratings[id][w]); });
    toast(S.ratings[id][w] ? `${w === "A" ? nameA() : nameB()} gave it ${S.ratings[id][w]} star${S.ratings[id][w] > 1 ? "s" : ""}` : "Rating cleared");
  }));
  $("#note").addEventListener("change", (e) => { S.notes[id] = e.target.value; save(); toast("Note saved"); });
  $("#shareR").addEventListener("click", () => share(r.title, appURL() + "#r/" + id));
  $("#removeR").addEventListener("click", () => {
    if (removed) { S.removed = S.removed.filter((x) => x !== id); toast("Back in rotation"); }
    else { S.removed.push(id); toast("Removed. Bring it back anytime in Settings."); }
    save(); closeSheet(); refreshCurrent();
  });
  $("#addWeek").addEventListener("click", () => addToWeek(r));
  $("#addPhoto").addEventListener("click", () => {
    const inp = $("#photoInput"); inp.value = "";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const blob = await shrink(f); await idb.put(id, blob);
        if (PHOTOS[id]) URL.revokeObjectURL(PHOTOS[id]);
        PHOTOS[id] = URL.createObjectURL(blob); toast("Photo saved"); openRecipe(id); refreshCurrent();
      } catch (e) { toast("Couldn't save that photo. Try a different one."); }
    };
    inp.click();
  });
  if (own) $("#delPhoto").addEventListener("click", async () => {
    await idb.del(id).catch(() => {}); URL.revokeObjectURL(PHOTOS[id]); delete PHOTOS[id];
    toast("Back to the stock photo"); openRecipe(id); refreshCurrent();
  });
}
function starRow(w, label, val = 0) {
  return `<div class="rate-row"><span>${esc(label)}</span><div class="stars" role="group" aria-label="${esc(label)}'s rating">
    ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= val ? "on" : ""}" data-who="${w}" data-n="${n}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n === val}">★</button>`).join("")}
  </div></div>`;
}
let lastFocus = null;
function showSheet() {
  const s = $("#sheet");
  if (s.hidden) { lastFocus = document.activeElement; s.hidden = false; document.body.style.overflow = "hidden"; }
  $(".sheet-panel").scrollTop = 0; $(".sheet-close").focus({ preventScroll: true });
}
function closeSheet(fixHash = true) {
  const s = $("#sheet"); if (s.hidden) return;
  s.hidden = true; document.body.style.overflow = "";
  if (fixHash && location.hash.startsWith("#r/")) history.replaceState(null, "", "#" + currentTab());
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
function addToWeek(r) {
  if (!S.plan) S.plan = emptyPlan();
  const P = S.plan;
  if (r.meal === "dinner") {
    const nights = S.settings.nights;
    const open = nights.find((d) => !P.dinners[d]) ?? nights.find((d) => !P.locked["d" + d]);
    if (open === undefined) return toast("Every night is locked. Unlock one in This week.");
    P.dinners[open] = r.id; P.locked["d" + open] = true; toast(`Added for ${DAY_FULL[open]} dinner`);
  } else {
    const arr = r.meal === "breakfast" ? P.breakfasts : P.lunches, pre = r.meal === "breakfast" ? "b" : "l";
    if (arr.includes(r.id)) return toast("Already in this week");
    const slot = !arr[0] ? 0 : !arr[1] ? 1 : !P.locked[pre + "0"] ? 0 : !P.locked[pre + "1"] ? 1 : -1;
    if (slot === -1) return toast("Both slots are locked. Unlock one in This week.");
    arr[slot] = r.id; P.locked[pre + slot] = true;
    toast(`Set as ${r.meal} batch ${slot + 1}`);
  }
  save();
}

/* ---------------- Planner ---------------- */
function emptyPlan() { return { created: new Date().toISOString(), breakfasts: [null, null], lunches: [null, null], dinners: {}, locked: {} }; }
function meatNeeds(r) { const out = {}; r.ingredients.forEach((i) => { const g = DATA.ingredients[i.k].stock; if (g) out[g] = (out[g] || 0) + i.q; }); return out; }
function weightFor(r, chosen, stockLeft) {
  let w = 1;
  const avg = avgRating(r.id);
  if (avg) w *= avg >= 4.5 ? 2.2 : avg >= 4 ? 1.7 : avg >= 3 ? 1 : avg >= 2 ? 0.4 : 0.15;
  if (S.history.slice(-2).flat().includes(r.id)) w *= 0.25;
  const needs = meatNeeds(r), groups = Object.keys(needs);
  if (groups.length && groups.every((g) => (stockLeft[g] || 0) >= needs[g])) w *= 1.8;
  const same = (k) => chosen.filter((c) => R[c] && R[c][k] === r[k]).length;
  w *= Math.pow(0.55, same("protein")) * Math.pow(0.5, same("cuisine"));
  if (r.cuisine === "Asian" && same("cuisine")) w *= 0.05;
  return w;
}
function pick(pool, avoid, chosen, stockLeft) {
  const cands = pool.filter((r) => !avoid.includes(r.id));
  if (!cands.length) return null;
  const ws = cands.map((r) => weightFor(r, chosen, stockLeft));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) return cands[i]; }
  return cands[cands.length - 1];
}
function spend(stockLeft, r) { for (const [g, lb] of Object.entries(meatNeeds(r))) stockLeft[g] = (stockLeft[g] || 0) - lb; }
function lunchGaps(P) { return [1, 2, 3, 4, 5, 6].filter((d) => !P.dinners[d - 1]); }
function generate(onlySlot) {
  const P = S.plan || emptyPlan();
  P.lunches = P.lunches || [null, null];
  const nights = S.settings.nights;
  for (const d of [0, 1, 2, 3, 4, 5, 6]) if (!nights.includes(d)) { delete P.dinners[d]; delete P.locked["d" + d]; }
  const slots = [...[0, 1].map((i) => "b" + i), ...nights.map((d) => "d" + d), "l0", "l1"];
  const redo = slots.filter((k) => (onlySlot ? k === onlySlot : !P.locked[k]));
  const get = (k) => (k[0] === "b" ? P.breakfasts[+k[1]] : k[0] === "l" ? P.lunches[+k[1]] : P.dinners[+k.slice(1)]);
  const set = (k, v) => { if (k[0] === "b") P.breakfasts[+k[1]] = v; else if (k[0] === "l") P.lunches[+k[1]] = v; else P.dinners[+k.slice(1)] = v; };
  const stockLeft = { ...S.stock }, chosen = [];
  slots.filter((k) => !redo.includes(k)).forEach((k) => { const id = get(k); if (id && R[id]) { chosen.push(id); spend(stockLeft, R[id]); } });
  const pools = { b: active().filter((r) => r.meal === "breakfast"), d: active().filter((r) => r.meal === "dinner"), l: active().filter((r) => r.meal === "lunch") };
  // dinners first (they decide which days need a lunch batch), then breakfasts, then lunches
  const order = redo.sort((a, b) => "dbl".indexOf(a[0]) - "dbl".indexOf(b[0]));
  for (const k of order) {
    if (k[0] === "l") {
      const need = Math.min(2, Math.ceil(lunchGaps(P).length / 2));
      if (+k[1] >= need && !onlySlot) { set(k, null); continue; }
    }
    const old = get(k);
    const r = pick(pools[k[0]], chosen.concat(onlySlot && old ? [old] : []), chosen, stockLeft);
    set(k, r ? r.id : null); if (r) { chosen.push(r.id); spend(stockLeft, r); }
  }
  S.plan = P; if (!onlySlot) S.checked = {}; save();
}
function fixLunches() {
  const P = S.plan, need = Math.min(2, Math.ceil(lunchGaps(P).length / 2));
  [0, 1].forEach((b) => { if (b >= need && !P.locked["l" + b]) P.lunches[b] = null; else if (b < need && !P.lunches[b]) generate("l" + b); });
}
function breakfastFor(d) { if (!S.plan) return null; if (d >= 1 && d <= 4) return { id: S.plan.breakfasts[0], batch: 1 }; if (d >= 5) return { id: S.plan.breakfasts[1], batch: 2 }; return null; }
function lunchFor(d) {
  const P = S.plan;
  if (d === 0) return { kind: "prep" };
  if (P.dinners[d - 1]) return { kind: "leftover", id: P.dinners[d - 1] };
  const i = lunchGaps(P).indexOf(d), b = Math.floor(i / 2);
  if (i >= 0 && b < 2 && P.lunches[b]) return { kind: "batch", id: P.lunches[b], batch: b + 1 };
  return { kind: "none" };
}
function lunchBatchDays(b) { return lunchGaps(S.plan).slice(b * 2, b * 2 + 2); }
function dayMacros(d) {
  const b = breakfastFor(d), l = lunchFor(d), dn = S.plan.dinners[d];
  const parts = [b && b.id && R[b.id], l.id && R[l.id], dn && R[dn]].filter(Boolean);
  const sum = (w) => parts.reduce((a, r) => ({ p: a.p + r["macros" + w].p, kcal: a.kcal + r["macros" + w].kcal }), { p: 0, kcal: 0 });
  return { A: sum("A"), B: sum("B"), meals: parts.length };
}
const ICON_LOCK = (on) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 ${on ? "8 0v3" : "7.5-1.5"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_SWAP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function batchRow(key, label, id) {
  const r = id && R[id], locked = !!S.plan.locked[key];
  return `<div class="batch">
    ${r ? photoHTML(r) : `<div class="ph"></div>`}
    <div><span class="batch-label">${esc(label)}</span>
      ${r ? `<button class="linkish batch-name" data-open="${r.id}"><i class="dot ${r.protein}" aria-hidden="true"></i> ${esc(r.title)}</button>` : `<span class="batch-name" style="color:var(--ink-2)">Nothing picked yet</span>`}
    </div>
    <div class="slot-actions">
      <button class="tool" data-lock="${key}" aria-pressed="${locked}" aria-label="${locked ? "Unlock" : "Keep"} ${esc(label)}">${ICON_LOCK(locked)}${locked ? "Kept" : "Keep"}</button>
      <button class="tool" data-swap="${key}" aria-label="Swap ${esc(label)}">${ICON_SWAP}Swap</button>
    </div>
  </div>`;
}
function viewWeek() {
  if (!S.plan) {
    view().innerHTML = `
      <h1 class="hello">Plan this week</h1>
      <p class="lede">Pick your cooking nights, then generate. You'll get two breakfast batches (made Sunday and Wednesday), a dinner for each night that becomes the next day's lunch, and a quick lunch batch for any day without leftovers. Picks lean toward your top-rated recipes and what's already in the freezer.</p>
      ${nightsPicker()}
      <div class="btn-row"><button class="btn" id="gen">Generate my week</button></div>`;
    bindNights(); $("#gen").addEventListener("click", () => { generate(); viewWeek(); toast("Week planned"); });
    return;
  }
  const P = S.plan, nights = S.settings.nights;
  const planned = [1, 2, 3, 4, 5, 6].filter((d) => dayMacros(d).meals >= 2);
  const avg = (w, k) => (planned.length ? Math.round(planned.reduce((a, d) => a + dayMacros(d)[w][k], 0) / planned.length) : 0);
  const aP = avg("A", "p"), bP = avg("B", "p"), gapA = S.settings.targetA - aP, gapB = S.settings.targetB - bP;
  const prepItems = (days) => days.filter((d) => P.dinners[d]).map((d) => { const r = R[P.dinners[d]]; return `<li><b>${DAYS[d]} dinner:</b> <button class="linkish" data-open="${r.id}">${esc(r.title)}</button>. ${esc(r.prep || "")}</li>`; }).join("");
  const lunchTrip = (b) => { const ds = lunchBatchDays(b); return ds.length ? (ds[0] <= 3 ? "sun" : "wed") : null; };
  const lunchLi = (trip) => [0, 1].filter((b) => P.lunches[b] && lunchTrip(b) === trip).map((b) => `<li><b>Lunch batch ${b + 1}</b> (${lunchBatchDays(b).map((d) => DAYS[d]).join(" and ")}): <button class="linkish" data-open="${P.lunches[b]}">${esc(R[P.lunches[b]].title)}</button></li>`).join("");
  const lunchSlots = [0, 1].filter((b) => P.lunches[b] || lunchBatchDays(b).length);

  view().innerHTML = `
    <h1 class="hello">This week</h1>
    ${nightsPicker()}
    <div class="btn-row">
      <button class="btn" id="regen">Reshuffle what's not kept</button>
      <button class="btn ghost" id="cooked">We cooked this week</button>
    </div>

    <section class="panel">
      <h4>Average protein per day</h4>
      <p class="sub">From planned breakfasts, lunches, and dinners</p>
      <div class="meter">${meterRow(nameA(), aP, S.settings.targetA, avg("A", "kcal"))}${meterRow(nameB(), bP, S.settings.targetB, avg("B", "kcal"))}</div>
      ${gapA > 5 || gapB > 5 ? `<p class="small" style="margin:12px 0 0">${[gapA > 5 ? `${esc(nameA())} is about ${gapA}g short` : "", gapB > 5 ? `${esc(nameB())} is about ${gapB}g short` : ""].filter(Boolean).join(", and ")} on an average day. A Greek yogurt with a scoop of whey (about 40g) or a cup of cottage cheese (about 25g) closes it. More ideas are in Settings.</p>` : ""}
    </section>

    <section class="panel">
      <h4>The batches</h4>
      <p class="sub">"Keep" holds a pick when you reshuffle. "Swap" trades just that one.</p>
      ${batchRow("b0", "Breakfast batch 1, made Sunday (Mon to Thu)", P.breakfasts[0])}
      ${batchRow("b1", "Breakfast batch 2, made Wednesday (Fri to Sun)", P.breakfasts[1])}
      ${lunchSlots.map((b) => batchRow("l" + b, `Lunch batch ${b + 1}${lunchBatchDays(b).length ? ` (${lunchBatchDays(b).map((d) => DAYS[d]).join(" and ")})` : ""}`, P.lunches[b])).join("")}
      ${nights.map((d) => batchRow("d" + d, `${DAY_FULL[d]} dinner, plus ${DAYS[(d + 1) % 7]} lunch`, P.dinners[d])).join("")}
    </section>

    <section class="panel">
      <h4>Sunday: shop and prep</h4>
      <p class="sub">Covers breakfasts Mon to Thu and dinners Sun to Tue</p>
      <ul>${P.breakfasts[0] ? `<li><b>Make breakfast batch 1:</b> <button class="linkish" data-open="${P.breakfasts[0]}">${esc(R[P.breakfasts[0]].title)}</button></li>` : ""}${lunchLi("sun")}${prepItems(SUNDAY_TRIP_DAYS)}</ul>
    </section>
    <section class="panel">
      <h4>Wednesday: shop and prep</h4>
      <p class="sub">Covers breakfasts Fri to Sun and dinners Wed to Sat</p>
      <ul>${P.breakfasts[1] ? `<li><b>Make breakfast batch 2:</b> <button class="linkish" data-open="${P.breakfasts[1]}">${esc(R[P.breakfasts[1]].title)}</button></li>` : ""}${lunchLi("wed")}${prepItems(WEDNESDAY_TRIP_DAYS)}</ul>
    </section>

    <section class="panel">
      <h4>Day by day</h4>
      ${[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const b = breakfastFor(d), l = lunchFor(d), dn = P.dinners[d], m = dayMacros(d);
        const lunchText = l.kind === "prep" ? "Prep day, so eat fresh or grab a spare" : l.kind === "leftover" ? `Leftover ${esc(R[l.id].title)}` : l.kind === "batch" ? `Lunch batch ${l.batch}: ${esc(R[l.id].title)}` : "Off-plan";
        return `<div class="day">
          <div class="day-name">${DAY_FULL[d]}</div>
          <div class="day-line"><span class="k">Breakfast</span><span>${b && b.id ? `Batch ${b.batch}: ${esc(R[b.id].title)}` : "Prep day, so cook fresh"}</span></div>
          <div class="day-line"><span class="k">Lunch</span><span>${lunchText}</span></div>
          <div class="day-line"><span class="k">Dinner</span><span>${dn ? `<button class="linkish" data-open="${dn}">${esc(R[dn].title)}</button>` : "Night off"}</span></div>
          ${m.meals >= 2 ? `<div class="day-protein">${esc(nameA())} about ${m.A.p}g protein, ${esc(nameB())} about ${m.B.p}g</div>` : ""}
        </div>`;
      }).join("")}
    </section>`;
  bindNights();
  $("#regen").addEventListener("click", () => { generate(); viewWeek(); toast("Reshuffled. Kept picks stayed put."); });
  $("#cooked").addEventListener("click", cookedThisWeek);
  view().querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", () => openRecipe(el.dataset.open)));
  view().querySelectorAll("[data-swap]").forEach((el) => el.addEventListener("click", () => { generate(el.dataset.swap); viewWeek(); toast("Swapped"); }));
  view().querySelectorAll("[data-lock]").forEach((el) => el.addEventListener("click", () => { const k = el.dataset.lock; S.plan.locked[k] = !S.plan.locked[k]; save(); viewWeek(); }));
}
function meterRow(name, p, target, kcal) {
  const pct = Math.min(100, Math.round((p / target) * 100));
  return `<div class="meter-row"><span><b>${esc(name)}</b> about ${p}g a day <span class="small" style="color:var(--ink-2)">(${kcal} cal)</span></span><span class="small">goal ${target}g</span>
    <div class="meter-bar"><span class="${pct < 90 ? "low" : ""}" style="width:${pct}%"></span></div></div>`;
}
function nightsPicker() {
  return `<p class="lede" style="margin:6px 0">Which nights are we cooking?</p><div class="nights" role="group" aria-label="Cooking nights">
    ${DAYS.map((d, i) => `<button class="night" data-night="${i}" aria-pressed="${S.settings.nights.includes(i)}" aria-label="${DAY_FULL[i]}">${d}</button>`).join("")}</div>`;
}
function bindNights() {
  view().querySelectorAll("[data-night]").forEach((b) => b.addEventListener("click", () => {
    const n = +b.dataset.night, s = new Set(S.settings.nights);
    s.has(n) ? s.delete(n) : s.add(n);
    S.settings.nights = [...s].sort();
    if (S.plan) { if (!s.has(n)) { delete S.plan.dinners[n]; delete S.plan.locked["d" + n]; } else generate("d" + n); fixLunches(); }
    save(); viewWeek();
  }));
}
function cookedThisWeek() {
  if (!S.plan) return;
  const ids = planIds(), used = {};
  ids.forEach((id) => { for (const [g, lb] of Object.entries(meatNeeds(R[id]))) used[g] = (used[g] || 0) + lb; });
  const take = {}; for (const [g, lb] of Object.entries(used)) take[g] = Math.min(lb, S.stock[g] || 0);
  const summary = Object.entries(take).filter(([, lb]) => lb > 0).map(([g, lb]) => `${fmtQty(lb, "lb")} ${DATA.stock[g].name.toLowerCase()}`).join(", ");
  if (!confirm(`Wrap up this week?${summary ? `\n\nThis takes ${summary} off the freezer count.` : ""}\n\nNext week's picks will avoid repeating these.`)) return;
  for (const [g, lb] of Object.entries(take)) S.stock[g] = Math.max(0, Math.round(((S.stock[g] || 0) - lb) * 4) / 4);
  S.history.push(ids); S.history = S.history.slice(-6);
  S.plan = null; S.checked = {}; save(); toast("Nice work. Freezer count updated."); viewWeek();
}
const planIds = () => [...S.plan.breakfasts, ...(S.plan.lunches || []), ...Object.values(S.plan.dinners)].filter((id) => id && R[id]);

/* ---------------- Shopping list ---------------- */
function tripRecipes(trip) {
  const P = S.plan; if (!P) return [];
  const ids = [];
  if (trip !== "wed" && P.breakfasts[0]) ids.push(P.breakfasts[0]);
  if (trip !== "sun" && P.breakfasts[1]) ids.push(P.breakfasts[1]);
  [0, 1].forEach((b) => { const ds = lunchBatchDays(b); if (!P.lunches[b] || !ds.length) return; const t = ds[0] <= 3 ? "sun" : "wed"; if (trip === "all" || trip === t) ids.push(P.lunches[b]); });
  (trip === "sun" ? SUNDAY_TRIP_DAYS : trip === "wed" ? WEDNESDAY_TRIP_DAYS : [0, 1, 2, 3, 4, 5, 6]).forEach((d) => P.dinners[d] && ids.push(P.dinners[d]));
  return ids.map((id) => R[id]).filter(Boolean);
}
function buildList(trip) {
  const stockLeft = { ...S.stock };
  if (trip === "wed") tripRecipes("sun").forEach((r) => r.ingredients.forEach((i) => { const g = DATA.ingredients[i.k].stock; if (g) stockLeft[g] = Math.max(0, (stockLeft[g] || 0) - i.q); }));
  const items = {};
  tripRecipes(trip).forEach((r) => r.ingredients.forEach((i) => { const it = items[i.k] || (items[i.k] = { k: i.k, q: 0, from: new Set() }); it.q += i.q; it.from.add(r.title); }));
  const buy = [], check = [], have = [], freezer = [];
  for (const it of Object.values(items)) {
    const d = DATA.ingredients[it.k];
    if (d.stock) {
      const avail = stockLeft[d.stock] || 0, t = Math.min(avail, it.q);
      stockLeft[d.stock] = avail - t;
      if (t > 0) freezer.push({ ...it, q: t });
      if (it.q - t > 0.01) buy.push({ ...it, q: it.q - t });
      continue;
    }
    const st = S.pantry[it.k];
    (st === "have" ? have : st === "check" ? check : buy).push(it);
  }
  return { buy, check, have, freezer };
}
function viewList() {
  if (!S.plan) { view().innerHTML = `<h1 class="hello">Shopping list</h1><p class="lede">Your list builds itself from this week's plan. Generate a week first.</p><div class="btn-row"><a class="btn" href="#week">Plan this week</a></div>`; return; }
  const L = buildList(ui.trip);
  const cost = L.buy.reduce((a, it) => a + it.q * DATA.ingredients[it.k].price, 0);
  const byAisle = {}; L.buy.forEach((it) => (byAisle[DATA.ingredients[it.k].aisle] ||= []).push(it));
  const li = (it, extra = "", free = false) => {
    const d = DATA.ingredients[it.k], key = ui.trip + ":" + it.k, price = free ? 0 : d.price * it.q;
    return `<li><label><input type="checkbox" data-check="${esc(key)}" ${S.checked[key] ? "checked" : ""}>
      <span class="what"><b>${esc(fmtQty(it.q, d.unit, true))}</b> ${esc(itemName(d, it.q))}${extra}
      <span class="why">For ${[...it.from].map(esc).join(", ")}${d.hint ? `. Tip: ${esc(d.hint)}` : ""}</span></span>
      <span class="price">${price >= 0.5 ? "$" + price.toFixed(0) : ""}</span></label></li>`;
  };
  view().innerHTML = `
    <h1 class="hello">Shopping list</h1>
    <div class="seg" role="group" aria-label="Which trip">
      <button data-trip="sun" aria-pressed="${ui.trip === "sun"}">Sunday trip</button>
      <button data-trip="wed" aria-pressed="${ui.trip === "wed"}">Wednesday trip</button>
      <button data-trip="all" aria-pressed="${ui.trip === "all"}">Whole week</button>
    </div>
    <div class="totals"><span>Estimated spend for what's left to buy</span><b>$${Math.round(cost)}</b></div>
    <div class="btn-row"><button class="btn small ghost" id="copyList">Copy as text</button><button class="btn small ghost" id="clearChecks">Uncheck all</button></div>
    ${L.freezer.length ? `<p class="aisle">Pull from the freezer to thaw</p><ul class="check-list">${L.freezer.map((it) => li(it, "", true)).join("")}</ul>` : ""}
    ${AISLES.filter((a) => byAisle[a]).map((a) => `<p class="aisle">${a}</p><ul class="check-list">${byAisle[a].sort((x, y) => DATA.ingredients[x.k].name.localeCompare(DATA.ingredients[y.k].name)).map((it) => li(it)).join("")}</ul>`).join("")}
    ${L.check.length ? `<p class="aisle">Check you have enough</p><p class="lede small" style="margin:0 0 6px">You usually keep these around.</p><ul class="check-list">${L.check.map((it) => li(it)).join("")}</ul>` : ""}
    ${L.have.length ? `<p class="lede small" style="margin-top:18px">${L.have.length} pantry staples are hidden (spices, sauces, oils). Change what counts as stocked in Pantry.</p>` : ""}
    ${!L.buy.length && !L.check.length ? `<p class="empty">Nothing to buy for this trip.</p>` : ""}
    <p class="lede small">Prices are rough local estimates for budgeting.</p>`;
  view().querySelectorAll("[data-trip]").forEach((b) => b.addEventListener("click", () => { ui.trip = b.dataset.trip; viewList(); }));
  view().querySelectorAll("[data-check]").forEach((c) => c.addEventListener("change", () => { c.checked ? (S.checked[c.dataset.check] = true) : delete S.checked[c.dataset.check]; save(); }));
  $("#clearChecks").addEventListener("click", () => { Object.keys(S.checked).filter((k) => k.startsWith(ui.trip + ":")).forEach((k) => delete S.checked[k]); save(); viewList(); });
  $("#copyList").addEventListener("click", () => {
    const lines = [], add = (title, arr) => { if (!arr.length) return; lines.push("", title); arr.forEach((it) => { const d = DATA.ingredients[it.k]; lines.push(`- ${fmtQty(it.q, d.unit, true)} ${itemName(d, it.q)}`); }); };
    AISLES.forEach((a) => byAisle[a] && add(a, byAisle[a])); add("Check you have enough", L.check);
    copyText(`${{ sun: "Sunday", wed: "Wednesday", all: "This week's" }[ui.trip]} shopping list` + lines.join("\n"), "List copied");
  });
}

/* ---------------- Pantry ---------------- */
function viewPantry() {
  const byAisle = {};
  for (const [k, d] of Object.entries(DATA.ingredients)) if (!d.stock) (byAisle[d.aisle] ||= []).push(k);
  view().innerHTML = `
    <h1 class="hello">Pantry and freezer</h1>
    <p class="lede">Freezer meat gets used before the list tells you to buy more. Mark staples as stocked and they drop off the shopping list.</p>
    <h3>In the freezer</h3>
    <div class="stock-grid">
      ${Object.entries(DATA.stock).map(([g, s]) => `<div class="stock"><div class="stock-name">${esc(s.name)} (lb)</div><div class="stock-ctl">
        <button data-step="${g}" data-d="-1" aria-label="Less ${esc(s.name)}">−</button>
        <label class="sr-only" for="st-${g}">${esc(s.name)} in pounds</label>
        <input id="st-${g}" data-stock="${g}" type="number" inputmode="decimal" min="0" step="0.5" value="${S.stock[g] ?? 0}">
        <button data-step="${g}" data-d="1" aria-label="More ${esc(s.name)}">+</button></div></div>`).join("")}
    </div>
    <h3>Staples</h3>
    <input id="pq" class="search" type="search" placeholder="Find an ingredient" autocomplete="off">
    <p class="lede small" style="margin-top:10px"><b>Stocked</b> never shows on the list. <b>Usually</b> shows under "check you have enough." <b>Buy</b> always shows.</p>
    <div id="plist">${AISLES.filter((a) => byAisle[a]).map((a) => `<p class="aisle">${a}</p><div class="pantry-box">` + byAisle[a].sort((x, y) => DATA.ingredients[x].name.localeCompare(DATA.ingredients[y].name)).map((k) => {
      const st = S.pantry[k] || "buy", n = DATA.ingredients[k].name;
      return `<div class="pantry-row" data-name="${esc(n.toLowerCase())}"><span>${esc(n.charAt(0).toUpperCase() + n.slice(1))}</span>
        <span class="tri" role="group" aria-label="${esc(n)}">${["have", "check", "buy"].map((v) => `<button data-p="${k}" data-v="${v}" aria-pressed="${st === v}">${{ have: "Stocked", check: "Usually", buy: "Buy" }[v]}</button>`).join("")}</span></div>`;
    }).join("") + `</div>`).join("")}</div>`;
  view().querySelectorAll("[data-stock]").forEach((i) => i.addEventListener("change", () => { S.stock[i.dataset.stock] = Math.max(0, parseFloat(i.value) || 0); save(); }));
  view().querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => { const g = b.dataset.step; S.stock[g] = Math.max(0, (S.stock[g] || 0) + +b.dataset.d); save(); $(`#st-${g}`).value = S.stock[g]; }));
  view().querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.p, v = b.dataset.v; S.pantry[k] = v; save();
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === v));
  }));
  $("#pq").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    view().querySelectorAll(".pantry-row").forEach((r) => (r.hidden = q && !r.dataset.name.includes(q)));
  });
}

/* ---------------- Settings ---------------- */
function viewMore() {
  const removed = S.removed.map((id) => R[id]).filter(Boolean);
  view().innerHTML = `
    <h1 class="hello">Settings</h1>
    <section class="panel">
      <h4>The two of you</h4>
      <p class="sub">${esc(nameA())} eats 2 servings per meal and ${esc(nameB())} eats 1. Protein goals drive the weekly meter.</p>
      <div class="two">
        <label class="field">Name<input data-set="nameA" value="${esc(S.settings.nameA)}"></label>
        <label class="field">Daily protein goal (g)<input data-set="targetA" type="number" inputmode="numeric" value="${S.settings.targetA}"></label>
        <label class="field">Name<input data-set="nameB" value="${esc(S.settings.nameB)}"></label>
        <label class="field">Daily protein goal (g)<input data-set="targetB" type="number" inputmode="numeric" value="${S.settings.targetB}"></label>
      </div>
    </section>
    <section class="panel">
      <h4>Color key</h4>
      <p class="sub">The stripe on each recipe card and the dot next to its name show the main protein.</p>
      ${legendHTML()}
    </section>
    <section class="panel">
      <h4>Snacks that close a protein gap</h4>
      <ul class="tips">
        <li>Greek yogurt (1 cup) with a scoop of whey and berries: about 45g</li>
        <li>Blender shake: almond milk, whey, a banana, and a spoon of peanut butter: about 30g</li>
        <li>Cottage cheese (1 cup) with fruit or everything seasoning: about 25g</li>
        <li>2 hard-boiled eggs and a cheese stick: about 19g</li>
        <li>Leftover shredded chicken or barbacoa straight from the fridge: about 25g per 4 oz</li>
      </ul>
    </section>
    <section class="panel">
      <h4>Share</h4>
      <div class="btn-row">
        <button class="btn" id="shareApp2">Share the app with friends</button>
        <button class="btn ghost" id="syncOut">Send our data to another phone</button>
      </div>
      <p class="sub">Friends get every recipe, with their own blank ratings and pantry. "Send our data" makes a one-time link that copies ratings, notes, pantry, freezer counts, and this week's plan to another phone, like ${esc(nameB())}'s. Your own recipe photos stay on the phone that took them.</p>
    </section>
    <section class="panel">
      <h4>Removed recipes</h4>
      ${removed.length ? removed.map((r) => `<div class="pantry-row"><span>${esc(r.title)}</span><button class="btn small ghost" data-restore="${r.id}">Put back</button></div>`).join("") : `<p class="sub">Nothing removed. If a recipe isn't your thing, open it and tap "Remove from rotation."</p>`}
    </section>
    <section class="panel">
      <h4>About the recipes</h4>
      <p class="sub">Each recipe is our own version of a well-reviewed original, linked at the bottom of the recipe. Sample photos come from Unsplash and show a similar dish, not the exact recipe. Add your own photo from any recipe. Macros and prices are estimates.</p>
      <button class="btn small danger" id="reset">Reset everything on this phone</button>
    </section>`;
  view().querySelectorAll("[data-set]").forEach((i) => i.addEventListener("change", () => { const k = i.dataset.set; S.settings[k] = k.startsWith("target") ? Math.max(1, parseInt(i.value) || 1) : i.value.trim(); save(); toast("Saved"); }));
  view().querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", () => { S.removed = S.removed.filter((x) => x !== b.dataset.restore); save(); viewMore(); toast("Back in rotation"); }));
  $("#shareApp2").addEventListener("click", shareApp);
  $("#syncOut").addEventListener("click", () => {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ ...S, checked: {} }))));
    share("Prep Counter data", appURL() + "#sync=" + encodeURIComponent(b64), "Link copied. Open it on the other phone.");
  });
  $("#reset").addEventListener("click", () => { if (confirm("Erase ratings, notes, pantry, freezer counts, and the plan on this phone?")) { localStorage.removeItem(KEY); S = defaultState(); viewMore(); toast("Reset"); } });
}
function importFromLink(enc) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(enc)))));
    history.replaceState(null, "", location.pathname + "#week");
    if (confirm("Load ratings, notes, pantry, freezer counts, and plan from this link? It replaces what's on this phone.")) {
      localStorage.setItem(KEY, JSON.stringify(data)); S = load(); save(); toast("Synced");
    }
  } catch (e) { toast("That sync link looks broken. Make a new one."); history.replaceState(null, "", location.pathname); }
  render("week");
}

/* ---------------- Sharing ---------------- */
const appURL = () => location.origin + location.pathname;
async function share(title, url, copiedMsg = "Link copied") {
  if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
  copyText(url, copiedMsg);
}
function shareApp() { share("Prep Counter: high-protein meal prep", appURL()); }
async function copyText(text, msg = "Copied") { try { await navigator.clipboard.writeText(text); toast(msg); } catch (e) { prompt("Copy this:", text); } }

/* ---------------- Boot ---------------- */
async function boot() {
  try { DATA = await (await fetch("data/recipes.json", { cache: "no-cache" })).json(); }
  catch (e) { view().innerHTML = `<p class="empty">Couldn't load the recipes. Check your connection and refresh.</p>`; return; }
  DATA.recipes.forEach((r) => (R[r.id] = r));
  S = load(); save();
  await loadPhotos();
  $("#shareApp").addEventListener("click", shareApp);
  $("#sheet").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("hashchange", route);
  route();
}
boot();
