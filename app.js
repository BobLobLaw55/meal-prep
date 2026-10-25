"use strict";
/* Prep Counter: meal prep recipes, weekly plans and shopping lists.
   All personal data (ratings, pantry, plan) lives in this browser's localStorage. */

const KEY = "prepcounter:v1";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SUNDAY_TRIP_DAYS = [0, 1, 2];       // dinners shopped for on Sunday
const WEDNESDAY_TRIP_DAYS = [3, 4, 5, 6]; // dinners shopped for on Wednesday
const PROTEIN_ORDER = ["Beef", "Chicken", "Turkey", "Dairy"];
const AISLES = ["Meat", "Produce", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Condiments", "Spices & Seasonings"];

let DATA = null;        // recipes.json
let R = {};             // recipes by id
let S = null;           // saved state
const ui = { q: "", meal: "all", protein: "all", quick: false, freezer: false, method: "all", sort: "default", trip: "sun" };

/* ---------------- State ---------------- */
function defaultState() {
  const pantry = {}, stock = {};
  for (const [k, v] of Object.entries(DATA.ingredients)) if (v.pantry) pantry[k] = v.pantry;
  for (const [k, v] of Object.entries(DATA.stock)) stock[k] = v.lb;
  return {
    settings: { nameA: "Tyler", nameB: "Wife", targetA: 180, targetB: 100, nights: [0, 1, 2, 3, 4] },
    ratings: {}, notes: {}, removed: [], pantry, stock,
    plan: null, history: [], checked: {}
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); return Object.assign(defaultState(), s); }
  } catch (e) { /* storage blocked or corrupt */ }
  return defaultState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Couldn't save on this device"); } }

/* ---------------- Helpers ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nameA = () => S.settings.nameA || "Person 1";
const nameB = () => S.settings.nameB || "Person 2";
const fillNames = (s) => esc(s).replaceAll("{A}", esc(nameA())).replaceAll("{B}", esc(nameB()));
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
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
function fmtQty(q, unit, shopping = false) {
  let n;
  if (unit === "each" || unit === "can" || unit === "jar" || unit === "pint" || unit === "bunch" || unit === "slice" || unit === "stalk" || unit === "scoop") {
    n = shopping ? String(Math.ceil(q - 0.01)) : frac(q);
  } else if (unit === "lb") {
    n = frac(Math.round(q * 4) / 4 || 0.25);
  } else if (unit === "oz") {
    n = String(Math.round(q * 2) / 2).replace(".5", "½");
  } else n = frac(q);
  if (unit === "each") return n;
  const plural = parseFloat(q) > 1 && PLURAL[unit] ? PLURAL[unit] : unit;
  return `${n} ${plural}`;
}
function itemName(d, q) {
  const n = d.name;
  if (d.unit !== "each" || q <= 1 || /s$|\(|zucchini/i.test(n)) return n;
  return /tomato$/.test(n) ? n + "es" : n + "s";
}
function ingLine(i) {
  const d = DATA.ingredients[i.k];
  return { qty: fmtQty(i.q, d.unit), name: itemName(d, i.q), note: i.n, d };
}
function avgRating(id) {
  const r = S.ratings[id]; if (!r) return 0;
  const vals = [r.A, r.B].filter(Boolean); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function cookTime(r) {
  const t = r.total;
  if (t >= 120) return `${r.active} min hands-on, ${Math.round(t / 60)} hr total`;
  return t === r.active ? `${t} min` : `${r.active} min hands-on, ${t} min total`;
}
function methods(r) {
  const m = new Set();
  r.equipment.forEach((e) => m.add(e));
  r.tags.forEach((t) => m.add(t));
  return m;
}
const active = () => DATA.recipes.filter((r) => !S.removed.includes(r.id));

/* ---------------- Router ---------------- */
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("sync=")) return importFromLink(h.slice(5));
  if (h.startsWith("r/")) { const id = decodeURIComponent(h.slice(2)); render("recipes", false); return openRecipe(id); }
  const tab = ["recipes", "week", "list", "pantry", "more"].includes(h) ? h : "recipes";
  closeSheet(false);
  render(tab);
}
function render(tab, scroll = true) {
  document.querySelectorAll(".tabs a").forEach((a) => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  ({ recipes: viewRecipes, week: viewWeek, list: viewList, pantry: viewPantry, more: viewMore })[tab]();
  if (scroll) window.scrollTo(0, 0);
}
const view = () => $("#view");

/* ---------------- Recipes ---------------- */
function viewRecipes() {
  const cuisines = [...new Set(DATA.recipes.map((r) => r.cuisine))].sort();
  view().innerHTML = `
    <h2 class="view-title">Recipes</h2>
    <p class="lede">${active().length} high-protein meal preps. Each dinner makes tonight's dinner plus tomorrow's lunch for both of you, and each breakfast covers 4 mornings.</p>
    <label class="sr-only" for="q">Search recipes</label>
    <input id="q" class="search" type="search" placeholder="Search: tacos, sourdough, slow cooker…" value="${esc(ui.q)}" autocomplete="off">
    <div class="chips" role="group" aria-label="Meal">
      ${chip("meal", "all", "All meals")}${chip("meal", "breakfast", "Breakfast")}${chip("meal", "dinner", "Dinner")}
      <span aria-hidden="true" style="width:6px;flex:none"></span>
      ${PROTEIN_ORDER.map((p) => chip("protein", p, p === "Dairy" ? "Eggs & dairy" : p, p.toLowerCase())).join("")}
    </div>
    <div class="chips" role="group" aria-label="More filters">
      <button class="chip" data-toggle="quick" aria-pressed="${ui.quick}">30 min or less</button>
      <button class="chip" data-toggle="freezer" aria-pressed="${ui.freezer}">Freezer-friendly</button>
      ${["Slow cooker", "Air fryer", "Sheet pan", "One pot", "Pasta", "Bowl", "Sandwich"].map((m) => chip("method", m, m)).join("")}
    </div>
    <div class="row-controls">
      <span id="count"></span>
      <span>
        <label class="sr-only" for="cuisine">Cuisine</label>
        <select id="cuisine" class="inline"><option value="all">Any cuisine</option>${cuisines.map((c) => `<option ${ui.cuisine === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <label class="sr-only" for="sort">Sort</label>
        <select id="sort" class="inline">
          <option value="default">Sort: A–Z</option>
          <option value="rating" ${ui.sort === "rating" ? "selected" : ""}>Top rated</option>
          <option value="protein" ${ui.sort === "protein" ? "selected" : ""}>Most protein</option>
          <option value="time" ${ui.sort === "time" ? "selected" : ""}>Fastest</option>
          <option value="cost" ${ui.sort === "cost" ? "selected" : ""}>Cheapest</option>
        </select>
      </span>
    </div>
    <ul class="recipe-list" id="list"></ul>`;
  const q = $("#q");
  q.addEventListener("input", () => { ui.q = q.value; drawList(); });
  view().querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    const f = b.dataset.filter, v = b.dataset.value;
    ui[f] = ui[f] === v && v !== "all" ? "all" : v; viewRecipes(); $("#q").focus({ preventScroll: true });
  }));
  view().querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => { ui[b.dataset.toggle] = !ui[b.dataset.toggle]; viewRecipes(); }));
  $("#cuisine").addEventListener("change", (e) => { ui.cuisine = e.target.value; drawList(); });
  $("#sort").addEventListener("change", (e) => { ui.sort = e.target.value; drawList(); });
  drawList();
}
function chip(filter, value, label, cls = "") {
  return `<button class="chip ${cls}" data-filter="${filter}" data-value="${esc(value)}" aria-pressed="${ui[filter] === value}">${esc(label)}</button>`;
}
function filtered() {
  const words = ui.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = active().filter((r) => {
    if (ui.meal !== "all" && r.meal !== ui.meal) return false;
    if (ui.protein !== "all" && r.protein !== ui.protein) return false;
    if (ui.cuisine && ui.cuisine !== "all" && r.cuisine !== ui.cuisine) return false;
    if (ui.quick && r.total > 30) return false;
    if (ui.freezer && !r.freezer) return false;
    if (ui.method !== "all" && !methods(r).has(ui.method)) return false;
    if (words.length) {
      const hay = [r.title, r.blurb, r.cuisine, r.protein, r.meal, ...r.tags, ...r.equipment,
        ...r.ingredients.map((i) => DATA.ingredients[i.k].name)].join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const sorters = {
    default: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => avgRating(b.id) - avgRating(a.id) || a.title.localeCompare(b.title),
    protein: (a, b) => b.macrosA.p - a.macrosA.p,
    time: (a, b) => a.total - b.total,
    cost: (a, b) => a.cost - b.cost,
  };
  return list.sort(sorters[ui.sort] || sorters.default);
}
function drawList() {
  const list = filtered();
  $("#count").textContent = `${list.length} recipe${list.length === 1 ? "" : "s"}`;
  $("#list").innerHTML = list.length ? list.map(rowHTML).join("") :
    `<li class="empty">Nothing matches those filters. Try clearing a chip or searching a single ingredient.</li>`;
  $("#list").querySelectorAll("[data-id]").forEach((li) => {
    li.addEventListener("click", () => openRecipe(li.dataset.id));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRecipe(li.dataset.id); } });
  });
}
function rowHTML(r) {
  const rating = avgRating(r.id);
  return `<li class="recipe-row ${r.protein}" data-id="${r.id}" tabindex="0" role="button">
    <span class="stripe" aria-hidden="true"></span>
    <div>
      <p class="r-title">${esc(r.title)}</p>
      <div class="r-meta">
        <span>${r.meal === "breakfast" ? "Breakfast" : "Dinner"}</span>
        <span>${r.total >= 120 ? Math.round(r.total / 60) + " hr" : r.total + " min"}</span>
        <span>${esc(r.cuisine)}</span>
        ${r.freezer ? "<span>Freezes</span>" : ""}
        ${r.heat === "medium" ? "<span>Medium heat</span>" : ""}
        ${rating ? `<span class="stars-inline" aria-label="Rated ${rating.toFixed(1)} of 5">${"★".repeat(Math.round(rating))}</span>` : ""}
      </div>
    </div>
    <div class="r-protein">${r.macrosA.p}g<small>${esc(nameA())}'s portion</small></div>
  </li>`;
}

/* ---------------- Recipe sheet ---------------- */
function openRecipe(id) {
  const r = R[id]; if (!r) return toast("That recipe isn't here anymore");
  const removed = S.removed.includes(id);
  const rate = S.ratings[id] || {};
  const tag = (k) => {
    const st = S.pantry[k];
    return st === "have" ? `<span class="tag">in pantry</span>` : st === "check" ? `<span class="tag">usually have</span>` : "";
  };
  $("#sheetBody").innerHTML = `
    <div class="d-kicker"><span class="dot ${r.protein}" aria-hidden="true"></span>${r.protein === "Dairy" ? "Eggs & dairy" : r.protein}, ${r.meal}, ${esc(r.cuisine)}</div>
    <h2 class="d-title" id="sheetTitle">${esc(r.title)}</h2>
    <p class="d-blurb">${fillNames(r.blurb)}</p>
    <div class="tickets">
      ${ticket(nameA(), r.portion.A, r.macrosA, r.meal === "breakfast" ? "per breakfast" : "per meal")}
      ${ticket(nameB(), r.portion.B, r.macrosB, r.meal === "breakfast" ? "per breakfast" : "per meal")}
    </div>
    <div class="facts">
      <span><b>${cookTime(r)}</b></span>
      <span>${r.equipment.map(esc).join(", ")}</span>
      <span>About <b>$${Math.round(r.cost)}</b> a batch</span>
      ${r.freezer ? "<span><b>Freezes well</b></span>" : ""}
      ${r.heat === "medium" ? "<span>Medium heat</span>" : "<span>Mild</span>"}
    </div>
    <p class="source">Makes ${r.meal === "breakfast" ? "4 breakfasts each" : "dinner tonight and lunch tomorrow for both of you"}.</p>

    <h3>Ingredients</h3>
    <ul class="ing-list">${r.ingredients.map((i) => { const l = ingLine(i); return `<li><span><span class="qty">${esc(l.qty)}</span> ${esc(l.name)}${l.note ? `<span class="note">, ${esc(l.note)}</span>` : ""}</span>${tag(i.k)}</li>`; }).join("")}</ul>

    <h3>Steps</h3>
    <ol class="step-list">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>

    ${r.prep ? `<div class="callout"><p><b>Prep-day head start</b></p><p>${esc(r.prep)}</p></div>` : ""}
    <div class="callout"><p><b>Storage</b> ${esc(r.storage)}</p><p><b>Reheat</b> ${esc(r.reheat)}</p></div>
    ${r.notes ? `<div class="callout"><p>${fillNames(r.notes)}</p></div>` : ""}

    <h3>Portion it out</h3>
    <p class="lede">Weigh the finished batch (minus the container), and you'll get each portion in grams.</p>
    <div class="weigh">
      <label for="wt">Batch weight (g)</label>
      <input id="wt" type="number" inputmode="numeric" min="0" placeholder="e.g. 2400">
      <span id="wtOut" aria-live="polite"></span>
    </div>

    <h3>Your ratings</h3>
    ${starRow("A", nameA(), rate.A)}${starRow("B", nameB(), rate.B)}
    <label class="sr-only" for="note">Notes</label>
    <textarea id="note" placeholder="Notes for next time: more garlic, double the sauce…">${esc(S.notes[id] || "")}</textarea>

    <div class="btn-row">
      <button class="btn" id="addWeek">${r.meal === "breakfast" ? "Use for a breakfast batch" : "Add to this week"}</button>
      <button class="btn ghost" id="shareR">Share recipe</button>
      <button class="btn ${removed ? "ghost" : "danger"}" id="removeR">${removed ? "Put back in rotation" : "Remove from rotation"}</button>
    </div>
    <p class="source">Inspired by <a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.name)}</a>. This version is rewritten for your portions, pantry, and spice rack. Macros are estimates from the ingredients.</p>`;
  showSheet();
  history.replaceState(null, "", "#r/" + id);

  $("#wt").addEventListener("input", (e) => {
    const g = parseFloat(e.target.value);
    $("#wtOut").textContent = g > 0 ? `${nameA()}: ${Math.round(g * r.split[0])} g each  |  ${nameB()}: ${Math.round(g * r.split[1])} g each` : "";
  });
  $("#sheetBody").querySelectorAll(".star").forEach((b) => b.addEventListener("click", () => {
    const who = b.dataset.who, n = +b.dataset.n;
    S.ratings[id] = S.ratings[id] || {};
    S.ratings[id][who] = S.ratings[id][who] === n ? 0 : n; save();
    b.parentElement.querySelectorAll(".star").forEach((s) => { s.classList.toggle("on", +s.dataset.n <= S.ratings[id][who]); s.setAttribute("aria-pressed", +s.dataset.n === S.ratings[id][who]); });
    toast(S.ratings[id][who] ? `Rated ${S.ratings[id][who]} star${S.ratings[id][who] > 1 ? "s" : ""}` : "Rating cleared");
  }));
  $("#note").addEventListener("change", (e) => { S.notes[id] = e.target.value; save(); toast("Note saved"); });
  $("#shareR").addEventListener("click", () => share(r.title, appURL() + "#r/" + id));
  $("#removeR").addEventListener("click", () => {
    if (removed) { S.removed = S.removed.filter((x) => x !== id); toast("Back in rotation"); }
    else { S.removed.push(id); toast("Removed. Restore it anytime under More."); }
    save(); closeSheet(); refreshCurrent();
  });
  $("#addWeek").addEventListener("click", () => addToWeek(r));
}
function ticket(who, portion, m, per) {
  return `<div class="ticket">
    <div class="t-who">${esc(who)}</div>
    <div class="t-portion">${esc(portion)}</div>
    <div class="t-protein">${m.p}<span>g</span></div>
    <div class="t-label">protein ${per}</div>
    <div class="t-rest"><span><b>${m.kcal}</b>cal</span><span><b>${m.c}g</b>carb</span><span><b>${m.f}g</b>fat</span></div>
  </div>`;
}
function starRow(who, label, val = 0) {
  return `<div class="rate-row"><span>${esc(label)}</span><div class="stars" role="group" aria-label="${esc(label)}'s rating">
    ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= val ? "on" : ""}" data-who="${who}" data-n="${n}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n === val}">★</button>`).join("")}
  </div></div>`;
}
let lastFocus = null;
function showSheet() {
  lastFocus = document.activeElement;
  const s = $("#sheet"); s.hidden = false; document.body.style.overflow = "hidden";
  $(".sheet-panel").scrollTop = 0; $(".sheet-close").focus();
}
function closeSheet(fixHash = true) {
  const s = $("#sheet"); if (s.hidden) return;
  s.hidden = true; document.body.style.overflow = "";
  if (fixHash && location.hash.startsWith("#r/")) history.replaceState(null, "", "#" + currentTab());
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
const currentTab = () => (document.querySelector(".tabs a[aria-current]") || {}).dataset?.tab || "recipes";
const refreshCurrent = () => render(currentTab(), false);
function addToWeek(r) {
  if (!S.plan) S.plan = emptyPlan();
  if (r.meal === "breakfast") {
    const slot = S.plan.breakfasts[0] === r.id || S.plan.breakfasts[1] === r.id ? -1 : (S.plan.locked.b0 ? 1 : 0);
    if (slot === -1) return toast("Already in this week");
    S.plan.breakfasts[slot] = r.id; S.plan.locked["b" + slot] = true;
    toast(`Set as breakfast batch ${slot + 1}`);
  } else {
    const nights = S.settings.nights;
    const open = nights.find((d) => !S.plan.dinners[d]) ?? nights.find((d) => !S.plan.locked["d" + d]);
    if (open === undefined) return toast("Every night is locked. Unlock one in Week.");
    S.plan.dinners[open] = r.id; S.plan.locked["d" + open] = true;
    toast(`Added to ${DAYS[open]} dinner`);
  }
  save();
}

/* ---------------- Planner ---------------- */
function emptyPlan() { return { created: new Date().toISOString(), breakfasts: [null, null], dinners: {}, locked: {} }; }
function meatNeeds(r) {
  const out = {};
  r.ingredients.forEach((i) => { const g = DATA.ingredients[i.k].stock; if (g) out[g] = (out[g] || 0) + i.q; });
  return out;
}
function weightFor(r, chosen, stockLeft) {
  let w = 1;
  const avg = avgRating(r.id);
  if (avg) w *= avg >= 4.5 ? 2.2 : avg >= 4 ? 1.7 : avg >= 3 ? 1 : avg >= 2 ? 0.4 : 0.15;
  const recent = S.history.slice(-2).flat();
  if (recent.includes(r.id)) w *= 0.25;
  const needs = meatNeeds(r), groups = Object.keys(needs);
  if (groups.length && groups.every((g) => (stockLeft[g] || 0) >= needs[g])) w *= 1.8; // burn freezer stock first
  const proteins = chosen.map((c) => R[c].protein);
  w *= Math.pow(0.55, proteins.filter((p) => p === r.protein).length);
  const cuisines = chosen.map((c) => R[c].cuisine);
  w *= Math.pow(0.5, cuisines.filter((c) => c === r.cuisine).length);
  if (r.cuisine === "Asian" && cuisines.includes("Asian")) w *= 0.05;
  return w;
}
function pick(pool, chosen, stockLeft) {
  const cands = pool.filter((r) => !chosen.includes(r.id));
  if (!cands.length) return null;
  const ws = cands.map((r) => weightFor(r, chosen, stockLeft));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) return cands[i]; }
  return cands[cands.length - 1];
}
function spend(stockLeft, r) { for (const [g, lb] of Object.entries(meatNeeds(r))) stockLeft[g] = (stockLeft[g] || 0) - lb; }
function generate(onlySlot) {
  const prev = S.plan || emptyPlan();
  const plan = onlySlot ? prev : { ...emptyPlan(), locked: prev.locked, breakfasts: [...prev.breakfasts], dinners: { ...prev.dinners } };
  const stockLeft = { ...S.stock };
  const dinners = active().filter((r) => r.meal === "dinner"), bfasts = active().filter((r) => r.meal === "breakfast");
  const keepB = [0, 1].filter((i) => plan.locked["b" + i] || (onlySlot && onlySlot !== "b" + i));
  const keepD = S.settings.nights.filter((d) => plan.locked["d" + d] || (onlySlot && onlySlot !== "d" + d));
  const chosenD = keepD.map((d) => plan.dinners[d]).filter(Boolean);
  const chosenB = keepB.map((i) => plan.breakfasts[i]).filter(Boolean);
  [...chosenD, ...chosenB].forEach((id) => R[id] && spend(stockLeft, R[id]));
  for (const i of [0, 1]) {
    if (keepB.includes(i)) continue;
    const others = chosenB.concat(onlySlot ? [plan.breakfasts[i]] : []).filter(Boolean);
    const r = pick(bfasts, others, stockLeft) || pick(bfasts, chosenB, stockLeft);
    plan.breakfasts[i] = r ? r.id : null; if (r) { chosenB.push(r.id); spend(stockLeft, r); }
  }
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (!S.settings.nights.includes(d)) { delete plan.dinners[d]; continue; }
    if (keepD.includes(d)) continue;
    const avoid = chosenD.concat(onlySlot ? [plan.dinners[d]] : []).filter(Boolean);
    const r = pick(dinners, avoid, stockLeft) || pick(dinners, chosenD, stockLeft);
    plan.dinners[d] = r ? r.id : null; if (r) { chosenD.push(r.id); spend(stockLeft, r); }
  }
  S.plan = plan; S.checked = {}; save();
}
function breakfastFor(d) {
  if (!S.plan) return null;
  if (d >= 1 && d <= 4) return { id: S.plan.breakfasts[0], batch: 1 };
  if (d >= 5) return { id: S.plan.breakfasts[1], batch: 2 };
  return null; // Sunday: prep day
}
function dayMacros(d) {
  const b = breakfastFor(d), lunch = S.plan.dinners[(d + 6) % 7], dinner = S.plan.dinners[d];
  const parts = [b && b.id && R[b.id], d > 0 && lunch && R[lunch], dinner && R[dinner]].filter(Boolean);
  const sum = (who) => parts.reduce((a, r) => ({ p: a.p + r["macros" + who].p, kcal: a.kcal + r["macros" + who].kcal }), { p: 0, kcal: 0 });
  return { A: sum("A"), B: sum("B"), meals: parts.length };
}

function viewWeek() {
  const nights = S.settings.nights;
  if (!S.plan) {
    view().innerHTML = `
      <h2 class="view-title">This week</h2>
      <p class="lede">Pick which nights you're cooking, then generate. You'll get two breakfast batches (made Sunday and Wednesday) and a dinner for each night, and each dinner becomes the next day's lunch. Picks lean toward your top-rated recipes and what's already in the freezer.</p>
      ${nightsPicker()}
      <div class="btn-row"><button class="btn" id="gen">Generate my week</button></div>`;
    bindNights(); $("#gen").addEventListener("click", () => { generate(); viewWeek(); toast("Week planned"); });
    return;
  }
  const P = S.plan;
  const sunD = SUNDAY_TRIP_DAYS.filter((d) => P.dinners[d]), wedD = WEDNESDAY_TRIP_DAYS.filter((d) => P.dinners[d]);
  const prepList = (ds) => ds.map((d) => { const r = R[P.dinners[d]]; return r ? `<li><b>${DAYS[d]}:</b> <span class="slot-name" style="display:inline" data-open="${r.id}" role="button" tabindex="0">${esc(r.title)}</span>. ${esc(r.prep || "")}</li>` : ""; }).join("");
  const days = [0, 1, 2, 3, 4, 5, 6];
  const planned = days.filter((d) => d > 0 && dayMacros(d).meals >= 2);
  const avg = (who, k) => planned.length ? Math.round(planned.reduce((a, d) => a + dayMacros(d)[who][k], 0) / planned.length) : 0;
  const aP = avg("A", "p"), bP = avg("B", "p");
  const gapA = S.settings.targetA - aP, gapB = S.settings.targetB - bP;

  view().innerHTML = `
    <h2 class="view-title">This week</h2>
    ${nightsPicker()}
    <div class="btn-row">
      <button class="btn" id="regen">Reshuffle unlocked</button>
      <button class="btn ghost" id="cooked">We cooked this week</button>
    </div>

    <div class="meter" aria-label="Average daily protein from planned meals">
      ${meterRow(nameA(), aP, S.settings.targetA, avg("A", "kcal"))}
      ${meterRow(nameB(), bP, S.settings.targetB, avg("B", "kcal"))}
    </div>
    ${gapA > 5 || gapB > 5 ? `<div class="callout"><p><b>Closing the gap.</b> ${[gapA > 5 ? `${esc(nameA())} is about ${gapA}g short` : "", gapB > 5 ? `${esc(nameB())} is about ${gapB}g short` : ""].filter(Boolean).join(", and ")} on an average day. An easy fix is a daily snack: a Greek yogurt cup with a scoop of whey (about 40g), 1 cup of cottage cheese (25g), or 2 hard-boiled eggs and a cheese stick (19g). Snack ideas are under More.</p></div>` : ""}

    <section class="session">
      <h4>Sunday prep and shop</h4>
      <p class="sub">Covers breakfasts Mon to Thu and dinners Sun to Tue</p>
      <ul>
        ${P.breakfasts[0] ? `<li><b>Make breakfast batch 1:</b> <span class="slot-name" style="display:inline" data-open="${P.breakfasts[0]}" role="button" tabindex="0">${esc(R[P.breakfasts[0]]?.title)}</span></li>` : ""}
        ${prepList(sunD)}
      </ul>
    </section>
    <section class="session">
      <h4>Wednesday prep and shop</h4>
      <p class="sub">Covers breakfasts Fri to Sun and dinners Wed to Sat</p>
      <ul>
        ${P.breakfasts[1] ? `<li><b>Make breakfast batch 2:</b> <span class="slot-name" style="display:inline" data-open="${P.breakfasts[1]}" role="button" tabindex="0">${esc(R[P.breakfasts[1]]?.title)}</span></li>` : ""}
        ${prepList(wedD)}
      </ul>
    </section>

    <h3>Day by day</h3>
    <div class="slot"><span class="slot-label">Breakfasts</span><span></span><span></span></div>
    ${[0, 1].map((i) => slotHTML("b" + i, `Batch ${i + 1}`, P.breakfasts[i])).join("")}
    ${days.map((d) => {
      const b = breakfastFor(d), lunch = d > 0 ? P.dinners[d - 1] : null, din = P.dinners[d], m = dayMacros(d);
      return `<div class="day">
        <div class="day-name">${DAYS[d]}</div>
        <div>
          <div class="slot"><span class="slot-label">Breakfast</span><span class="slot-name muted">${b && b.id ? `Batch ${b.batch}: ${esc(R[b.id]?.title || "")}` : "Prep day: cook fresh"}</span><span></span></div>
          <div class="slot"><span class="slot-label">Lunch</span><span class="slot-name muted">${lunch ? `Leftover ${esc(R[lunch]?.title || "")}` : d === 0 ? "Off-plan" : "Leftovers or off-plan"}</span><span></span></div>
          ${nights.includes(d) ? slotHTML("d" + d, "Dinner", din, true) : `<div class="slot"><span class="slot-label">Dinner</span><span class="slot-name muted">Night off</span><span></span></div>`}
          ${m.meals >= 2 ? `<div class="day-protein">${esc(nameA())} about ${m.A.p}g protein, ${esc(nameB())} about ${m.B.p}g</div>` : ""}
        </div>
      </div>`;
    }).join("")}
    <p class="lede" style="margin-top:16px">Tap a recipe to open it. The lock keeps a pick when you reshuffle, and the arrows swap just that one.</p>`;
  bindNights();
  $("#regen").addEventListener("click", () => { generate(); viewWeek(); toast("Reshuffled. Locked picks stayed put."); });
  $("#cooked").addEventListener("click", cookedThisWeek);
  view().querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", () => openRecipe(el.dataset.open)));
  view().querySelectorAll("[data-swap]").forEach((el) => el.addEventListener("click", () => { generate(el.dataset.swap); viewWeek(); }));
  view().querySelectorAll("[data-lock]").forEach((el) => el.addEventListener("click", () => {
    const k = el.dataset.lock; S.plan.locked[k] = !S.plan.locked[k]; save(); viewWeek();
  }));
}
function slotHTML(key, label, id, isDinner = false) {
  const r = id && R[id], locked = S.plan.locked[key];
  return `<div class="slot">
    <span class="slot-label">${esc(label)}</span>
    ${r ? `<span class="slot-name" data-open="${r.id}" role="button" tabindex="0"><span class="dot ${r.protein}" aria-hidden="true"></span>${esc(r.title)}</span>` : `<span class="slot-name muted">Nothing picked</span>`}
    <span class="slot-actions">
      <button class="icon-btn ${locked ? "locked" : ""}" data-lock="${key}" aria-pressed="${!!locked}" aria-label="${locked ? "Unlock" : "Lock"} ${esc(label)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="${locked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 ${locked ? "8 0v3" : "7.5-1.5"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button class="icon-btn" data-swap="${key}" aria-label="Swap ${esc(label)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </span>
  </div>`;
}
function meterRow(name, p, target, kcal) {
  const pct = Math.min(100, Math.round((p / target) * 100));
  return `<div class="meter-row"><span><b>${esc(name)}</b> about ${p}g protein a day <span style="color:var(--ink-2)">(${kcal} cal from plan)</span></span><span>goal ${target}g</span>
    <div class="meter-bar"><span class="${pct < 90 ? "low" : ""}" style="width:${pct}%"></span></div></div>`;
}
function nightsPicker() {
  return `<p class="lede" style="margin:4px 0 6px">Cooking nights</p><div class="nights" role="group" aria-label="Cooking nights">
    ${DAYS.map((d, i) => `<button class="night" data-night="${i}" aria-pressed="${S.settings.nights.includes(i)}">${d}</button>`).join("")}</div>`;
}
function bindNights() {
  view().querySelectorAll("[data-night]").forEach((b) => b.addEventListener("click", () => {
    const n = +b.dataset.night, s = new Set(S.settings.nights);
    s.has(n) ? s.delete(n) : s.add(n);
    S.settings.nights = [...s].sort();
    if (S.plan) { if (!s.has(n)) { delete S.plan.dinners[n]; delete S.plan.locked["d" + n]; } else generate("d" + n); }
    save(); viewWeek();
  }));
}
function cookedThisWeek() {
  if (!S.plan) return;
  const used = {};
  [...S.plan.breakfasts, ...Object.values(S.plan.dinners)].filter(Boolean).forEach((id) => {
    for (const [g, lb] of Object.entries(meatNeeds(R[id]))) used[g] = (used[g] || 0) + lb;
  });
  const fromFreezer = {};
  for (const [g, lb] of Object.entries(used)) fromFreezer[g] = Math.min(lb, S.stock[g] || 0);
  const summary = Object.entries(fromFreezer).filter(([, lb]) => lb > 0).map(([g, lb]) => `${fmtQty(lb, "lb")} ${DATA.stock[g].name.toLowerCase()}`).join(", ");
  if (!confirm(`Wrap up this week?${summary ? `\n\nThis takes ${summary} out of the freezer count.` : ""}\n\nNext week's picks will avoid these recipes.`)) return;
  for (const [g, lb] of Object.entries(fromFreezer)) S.stock[g] = Math.max(0, Math.round(((S.stock[g] || 0) - lb) * 4) / 4);
  S.history.push([...S.plan.breakfasts, ...Object.values(S.plan.dinners)].filter(Boolean));
  S.history = S.history.slice(-6);
  S.plan = null; S.checked = {}; save();
  toast("Nice work. Freezer updated."); viewWeek();
}

/* ---------------- Shopping list ---------------- */
function tripRecipes(trip) {
  const P = S.plan; if (!P) return [];
  const ids = [];
  if (trip !== "wed" && P.breakfasts[0]) ids.push(P.breakfasts[0]);
  if (trip !== "sun" && P.breakfasts[1]) ids.push(P.breakfasts[1]);
  const days = trip === "sun" ? SUNDAY_TRIP_DAYS : trip === "wed" ? WEDNESDAY_TRIP_DAYS : [0, 1, 2, 3, 4, 5, 6];
  days.forEach((d) => P.dinners[d] && ids.push(P.dinners[d]));
  return ids.map((id) => R[id]).filter(Boolean);
}
function buildList(trip) {
  // freezer allocation runs in trip order so Sunday gets first claim on stock
  const stockLeft = { ...S.stock };
  if (trip === "wed") tripRecipes("sun").forEach((r) => r.ingredients.forEach((i) => {
    const g = DATA.ingredients[i.k].stock; if (g) stockLeft[g] = Math.max(0, (stockLeft[g] || 0) - i.q);
  }));
  const items = {};
  tripRecipes(trip).forEach((r) => r.ingredients.forEach((i) => {
    const it = items[i.k] || (items[i.k] = { k: i.k, q: 0, from: new Set() });
    it.q += i.q; it.from.add(r.title);
  }));
  const buy = [], check = [], have = [], freezer = [];
  for (const it of Object.values(items)) {
    const d = DATA.ingredients[it.k];
    if (d.stock) {
      const avail = stockLeft[d.stock] || 0, take = Math.min(avail, it.q);
      stockLeft[d.stock] = avail - take;
      if (take > 0) freezer.push({ ...it, q: take });
      if (it.q - take > 0.01) buy.push({ ...it, q: it.q - take });
      continue;
    }
    const st = S.pantry[it.k];
    (st === "have" ? have : st === "check" ? check : buy).push(it);
  }
  return { buy, check, have, freezer };
}
function viewList() {
  if (!S.plan) {
    view().innerHTML = `<h2 class="view-title">Shopping list</h2><p class="lede">Your list builds itself from this week's plan. Head to Week and generate one first.</p><div class="btn-row"><a class="btn" href="#week">Plan this week</a></div>`;
    return;
  }
  const L = buildList(ui.trip);
  const cost = L.buy.reduce((a, it) => a + it.q * DATA.ingredients[it.k].price, 0);
  const byAisle = {};
  L.buy.forEach((it) => (byAisle[DATA.ingredients[it.k].aisle] ||= []).push(it));
  const itemLI = (it, extra = "", free = false) => {
    const d = DATA.ingredients[it.k], key = ui.trip + ":" + it.k;
    const price = free ? 0 : d.price * it.q;
    return `<li><label>
      <input type="checkbox" data-check="${esc(key)}" ${S.checked[key] ? "checked" : ""}>
      <span class="what"><b>${esc(fmtQty(it.q, d.unit, true))}</b> ${esc(itemName(d, it.q))}${extra}
        <span class="why">${[...it.from].map(esc).join(", ")}${d.hint ? ` (${esc(d.hint)})` : ""}</span></span>
      <span class="price">${price >= 0.5 ? "$" + price.toFixed(0) : ""}</span>
    </label></li>`;
  };
  view().innerHTML = `
    <h2 class="view-title">Shopping list</h2>
    <div class="seg" role="group" aria-label="Which trip">
      <button data-trip="sun" aria-pressed="${ui.trip === "sun"}">Sunday</button>
      <button data-trip="wed" aria-pressed="${ui.trip === "wed"}">Wednesday</button>
      <button data-trip="all" aria-pressed="${ui.trip === "all"}">Whole week</button>
    </div>
    <div class="totals"><span>Estimated spend for what's left to buy</span><b>$${Math.round(cost)}</b></div>
    <div class="btn-row">
      <button class="btn small ghost" id="copyList">Copy as text</button>
      <button class="btn small ghost" id="clearChecks">Uncheck all</button>
    </div>
    ${L.freezer.length ? `<p class="aisle">From your freezer</p><ul class="check-list">${L.freezer.map((it) => itemLI(it, " (pull to thaw)", true)).join("")}</ul>` : ""}
    ${AISLES.filter((a) => byAisle[a]).map((a) => `<p class="aisle">${a}</p><ul class="check-list">${byAisle[a].sort((x, y) => DATA.ingredients[x.k].name.localeCompare(DATA.ingredients[y.k].name)).map((it) => itemLI(it)).join("")}</ul>`).join("")}
    ${L.check.length ? `<p class="aisle">Check before you go</p><p class="lede" style="margin:0">You usually have these. Make sure there's enough.</p><ul class="check-list">${L.check.map((it) => itemLI(it)).join("")}</ul>` : ""}
    ${L.have.length ? `<p class="lede" style="margin-top:18px">${L.have.length} pantry staples are hidden (spices, sauces, oils). Change what counts as stocked in Pantry.</p>` : ""}
    ${!L.buy.length && !L.check.length ? `<p class="empty">Nothing to buy for this trip.</p>` : ""}
    <p class="lede" style="font-size:14px">Prices are rough local estimates for budgeting. Weekly-ad pricing from Publix, Winn-Dixie, Aldi and Walmart is the next upgrade.</p>`;
  view().querySelectorAll("[data-trip]").forEach((b) => b.addEventListener("click", () => { ui.trip = b.dataset.trip; viewList(); }));
  view().querySelectorAll("[data-check]").forEach((c) => c.addEventListener("change", () => {
    c.checked ? (S.checked[c.dataset.check] = true) : delete S.checked[c.dataset.check]; save();
  }));
  $("#clearChecks").addEventListener("click", () => { Object.keys(S.checked).filter((k) => k.startsWith(ui.trip + ":")).forEach((k) => delete S.checked[k]); save(); viewList(); });
  $("#copyList").addEventListener("click", () => {
    const lines = [];
    const add = (title, arr) => { if (!arr.length) return; lines.push("", title); arr.forEach((it) => { const d = DATA.ingredients[it.k]; lines.push(`- ${fmtQty(it.q, d.unit, true)} ${itemName(d, it.q)}`); }); };
    AISLES.forEach((a) => byAisle[a] && add(a, byAisle[a]));
    add("Check first", L.check);
    const label = { sun: "Sunday", wed: "Wednesday", all: "This week" }[ui.trip];
    copyText(`${label} shopping list` + lines.join("\n"));
  });
}

/* ---------------- Pantry ---------------- */
function viewPantry() {
  const byAisle = {};
  for (const [k, d] of Object.entries(DATA.ingredients)) if (!d.stock) (byAisle[d.aisle] ||= []).push(k);
  view().innerHTML = `
    <h2 class="view-title">Pantry</h2>
    <p class="lede">Freezer meat gets used before the list tells you to buy more. Mark staples as stocked, and they drop off the shopping list.</p>
    <h3>Freezer</h3>
    <div class="stock-grid">
      ${Object.entries(DATA.stock).map(([g, s]) => `<div class="stock">
        <div class="stock-name">${esc(s.name)}</div>
        <div class="stock-ctl">
          <button data-step="${g}" data-d="-1" aria-label="Less ${esc(s.name)}">−</button>
          <label class="sr-only" for="st-${g}">${esc(s.name)} in pounds</label>
          <input id="st-${g}" data-stock="${g}" type="number" inputmode="decimal" min="0" step="0.5" value="${S.stock[g] ?? 0}">
          <span>lb</span>
          <button data-step="${g}" data-d="1" aria-label="More ${esc(s.name)}">+</button>
        </div></div>`).join("")}
    </div>
    <h3>Staples</h3>
    <input id="pq" class="search" type="search" placeholder="Find an ingredient" autocomplete="off">
    <p class="lede" style="margin-top:10px;font-size:14px"><b>Stocked</b> never shows on the list. <b>Usually</b> shows under "check before you go." <b>Buy</b> always shows.</p>
    <div id="plist">${AISLES.filter((a) => byAisle[a]).map((a) => `<p class="aisle">${a}</p>` + byAisle[a].sort((x, y) => DATA.ingredients[x].name.localeCompare(DATA.ingredients[y].name)).map((k) => {
      const st = S.pantry[k] || "buy";
      return `<div class="pantry-row" data-name="${esc(DATA.ingredients[k].name.toLowerCase())}"><span>${esc(DATA.ingredients[k].name)}</span>
        <span class="tri" role="group" aria-label="${esc(DATA.ingredients[k].name)}">
          ${["have", "check", "buy"].map((v) => `<button data-p="${k}" data-v="${v}" aria-pressed="${st === v}">${{ have: "Stocked", check: "Usually", buy: "Buy" }[v]}</button>`).join("")}
        </span></div>`;
    }).join("")).join("")}</div>`;
  view().querySelectorAll("[data-stock]").forEach((i) => i.addEventListener("change", () => { S.stock[i.dataset.stock] = Math.max(0, parseFloat(i.value) || 0); save(); }));
  view().querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const g = b.dataset.step; S.stock[g] = Math.max(0, (S.stock[g] || 0) + +b.dataset.d); save();
    $(`#st-${g}`).value = S.stock[g];
  }));
  view().querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.p, v = b.dataset.v;
    v === "buy" ? delete S.pantry[k] : (S.pantry[k] = v); save();
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === v));
  }));
  $("#pq").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    view().querySelectorAll(".pantry-row").forEach((r) => (r.hidden = q && !r.dataset.name.includes(q)));
  });
}

/* ---------------- More ---------------- */
function viewMore() {
  const removed = S.removed.map((id) => R[id]).filter(Boolean);
  view().innerHTML = `
    <h2 class="view-title">More</h2>
    <h3>The two of you</h3>
    <div class="two">
      <label class="field">Name<input data-set="nameA" value="${esc(S.settings.nameA)}"></label>
      <label class="field">Daily protein goal (g)<input data-set="targetA" type="number" inputmode="numeric" value="${S.settings.targetA}"></label>
      <label class="field">Name<input data-set="nameB" value="${esc(S.settings.nameB)}"></label>
      <label class="field">Daily protein goal (g)<input data-set="targetB" type="number" inputmode="numeric" value="${S.settings.targetB}"></label>
    </div>

    <h3>Snacks that close a protein gap</h3>
    <ul class="tips">
      <li>Greek yogurt (1 cup) with a scoop of whey and a few berries: about 45g</li>
      <li>Blender shake: almond milk, whey, a banana, and a spoon of peanut butter: about 30g</li>
      <li>Cottage cheese (1 cup) with everything seasoning or fruit: about 25g</li>
      <li>2 hard-boiled eggs and a cheese stick: about 19g</li>
      <li>Leftover shredded chicken or barbacoa straight from the fridge: 25–30g per 4 oz</li>
    </ul>

    <h3>Share</h3>
    <div class="btn-row">
      <button class="btn" id="shareApp2">Share app with friends</button>
      <button class="btn ghost" id="syncOut">Send my data to another phone</button>
    </div>
    <p class="lede" style="font-size:15px">Friends get the recipes with their own blank ratings and pantry. "Send my data" makes a one-time link that copies your ratings, pantry, freezer counts, and this week's plan onto the other phone. Use it to sync to your wife's phone.</p>

    <h3>Removed recipes</h3>
    ${removed.length ? `<ul class="recipe-list">${removed.map((r) => `<li class="pantry-row"><span>${esc(r.title)}</span><button class="btn small ghost" data-restore="${r.id}">Put back</button></li>`).join("")}</ul>` : `<p class="lede">Nothing removed. If a recipe isn't your thing, open it and tap "Remove from rotation."</p>`}

    <h3>Sources</h3>
    <p class="lede" style="font-size:15px">Every recipe is our own version built from a well-reviewed original. The link is at the bottom of each recipe. Macros and prices are estimates.</p>
    <div class="btn-row"><button class="btn small danger" id="reset">Reset everything on this phone</button></div>`;
  view().querySelectorAll("[data-set]").forEach((i) => i.addEventListener("change", () => {
    const k = i.dataset.set; S.settings[k] = k.startsWith("target") ? Math.max(1, parseInt(i.value) || 1) : i.value.trim(); save(); toast("Saved");
  }));
  view().querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", () => { S.removed = S.removed.filter((x) => x !== b.dataset.restore); save(); viewMore(); toast("Back in rotation"); }));
  $("#shareApp2").addEventListener("click", shareApp);
  $("#syncOut").addEventListener("click", () => {
    const payload = { ...S, checked: {} };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    share("Prep Counter data", appURL() + "#sync=" + encodeURIComponent(b64), "Link copied. Open it on the other phone.");
  });
  $("#reset").addEventListener("click", () => { if (confirm("Erase ratings, pantry, freezer counts, and the plan on this phone?")) { localStorage.removeItem(KEY); S = defaultState(); viewMore(); toast("Reset"); } });
}
function importFromLink(enc) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(enc)))));
    history.replaceState(null, "", location.pathname + "#week");
    if (confirm("Load ratings, pantry, freezer counts, and plan from this link? It replaces what's on this phone.")) {
      S = Object.assign(defaultState(), data); save(); toast("Synced");
    }
  } catch (e) { toast("That sync link looks broken. Make a new one."); history.replaceState(null, "", location.pathname); }
  render(location.hash.slice(1) || "recipes");
}

/* ---------------- Sharing ---------------- */
const appURL = () => location.origin + location.pathname;
async function share(title, url, copiedMsg = "Link copied") {
  if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
  copyText(url, copiedMsg);
}
function shareApp() { share("Prep Counter: high-protein meal prep", appURL()); }
async function copyText(text, msg = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch (e) { prompt("Copy this:", text); }
}

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    DATA = await (await fetch("data/recipes.json", { cache: "no-cache" })).json();
  } catch (e) {
    view().innerHTML = `<p class="empty">Couldn't load the recipes. Check your connection and refresh.</p>`; return;
  }
  DATA.recipes.forEach((r) => (R[r.id] = r));
  S = load();
  // drop references to recipes that no longer exist
  if (S.plan) {
    S.plan.breakfasts = S.plan.breakfasts.map((id) => (R[id] ? id : null));
    for (const d of Object.keys(S.plan.dinners)) if (!R[S.plan.dinners[d]]) delete S.plan.dinners[d];
  }
  $("#shareApp").addEventListener("click", shareApp);
  $("#sheet").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) { e.preventDefault(); openRecipe(e.target.dataset.open); }
  });
  window.addEventListener("hashchange", route);
  route();
}
boot();
