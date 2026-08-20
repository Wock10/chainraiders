import {
  ADDRESSES,
  EXPLORER,
  fmtBps,
  fmtEth,
  fmtRaid,
  quoteSpecificCost,
} from "./js/anvil.js";
import { anvil, refreshConnect, short } from "./js/wallet.js";
import { pageUrl } from "./js/router.js";

const CHUNK = 48;
const ALL = "ALL";
const ALL_VAL = "All";
const POOL = "POOL";
const POOL_VAL = "In the AMM pool";
const OPENSEA = "OPENSEA";
const OS_SALE = "For sale";
const OS_HOLD = "Not for sale";
const TRAIT_LAYERS = ["DNA", "HEAD", "BODY", "FACE", "BG"];
const LAYERS = [POOL, OPENSEA, ...TRAIT_LAYERS];
const WHERE = [
  { layer: ALL, value: ALL_VAL },
  { layer: POOL, value: POOL_VAL },
  { layer: OPENSEA, value: OS_SALE },
  { layer: OPENSEA, value: OS_HOLD },
];
const OS_MARK = `<span class="os-mark" aria-hidden="true"></span>`;
const NFT = ADDRESSES.nft.toLowerCase();
const ART_CID = "QmW9YHW9RECKJrE4QvNud76yaWEiRUCbcsf5e913FyA4Tm";
const ART_GWS = [
  "https://gw.ipfs-lens.dev/ipfs/",
  "https://ipfs.io/ipfs/",
];

let catalog = null;
let market = null;
let filtered = [];
let shown = 0;
let selected = -1;
let appending = false;
let poolIds = new Set();
let poolReady = false;
let poolNext = null;
let buyId = 0;
let buyGen = 0;
let buyAvailable = false;
let busy = false;
let listings = {};
let sortBy = "id";
const picked = Object.fromEntries(LAYERS.map((layer) => [layer, new Set()]));
const openLayer = Object.fromEntries(TRAIT_LAYERS.map((layer) => [layer, false]));

const $ = (id) => document.getElementById(id);

function poolOn() {
  return picked[POOL].has(POOL_VAL);
}

function whereAll() {
  return !picked[POOL].size && !picked[OPENSEA].size;
}

function whereIcon(layer, value) {
  if (layer === ALL) return `<span class="where-ico is-all" aria-hidden="true"></span>`;
  if (layer === POOL) return `<span class="where-ico is-pool" aria-hidden="true"></span>`;
  if (value === OS_SALE) return OS_MARK;
  return `<span class="where-ico is-hold" aria-hidden="true"></span>`;
}

function osUrl(id) {
  return `https://opensea.io/item/robinhood/${NFT}/${id}`;
}

function osListing(id) {
  return listings[String(id)] || null;
}

function fmtOs(eth) {
  if (!Number.isFinite(eth)) return "-";
  const text = eth >= 0.01 ? eth.toFixed(4) : eth.toPrecision(4);
  return `${String(text).replace(/\.?0+$/, "")} ETH`;
}

function artSrc(id, gate = 0) {
  if (gate <= 0) return `raiders/${id}.png`;
  return `${ART_GWS[gate - 1]}${ART_CID}/${id}`;
}

function fallbackSnipeCost() {
  if (!market) return null;
  return quoteSpecificCost(market.tokensPerNFT, market.specificBps);
}

async function loadCatalog() {
  const res = await fetch("raiders.json");
  if (!res.ok) throw new Error("catalog missing");
  const data = await res.json();
  data.keepers.forEach((k) => {
    k.inPool = false;
  });
  attachRarity(data);
  return data;
}

async function loadListings() {
  try {
    const res = await fetch("listings.json");
    if (!res.ok) return;
    const data = await res.json();
    listings = data.items || {};
  } catch {
    listings = {};
  }
}

function attachRarity(data) {
  const n = data.keepers.length;
  const freq = Object.fromEntries(TRAIT_LAYERS.map((layer) => [layer, Object.create(null)]));
  for (const k of data.keepers) {
    for (const layer of TRAIT_LAYERS) {
      const val = k.attributes[layer] || "";
      freq[layer][val] = (freq[layer][val] || 0) + 1;
    }
  }
  for (const k of data.keepers) {
    let score = 0;
    for (const layer of TRAIT_LAYERS) {
      const val = k.attributes[layer] || "";
      score += n / (freq[layer][val] || n);
    }
    k.rarity = score;
  }
  const ranked = data.keepers.slice().sort((a, b) => b.rarity - a.rarity || a.id - b.id);
  ranked.forEach((k, i) => {
    k.rank = i + 1;
  });
}

function rarityTone(rank, total) {
  const pct = rank / total;
  if (pct <= 0.01) return "legendary";
  if (pct <= 0.05) return "epic";
  if (pct <= 0.1) return "rare";
  if (pct <= 0.25) return "uncommon";
  return "common";
}

function listingPrice(k) {
  const row = osListing(k.id);
  return row && Number.isFinite(row.eth) ? row.eth : null;
}

function sortKeepers(rows) {
  const list = rows.slice();
  const byId = (a, b) => a.id - b.id;
  if (sortBy === "price-asc" || sortBy === "price-desc") {
    const dir = sortBy === "price-asc" ? 1 : -1;
    list.sort((a, b) => {
      const pa = listingPrice(a);
      const pb = listingPrice(b);
      if (pa == null && pb == null) return byId(a, b);
      if (pa == null) return 1;
      if (pb == null) return -1;
      if (pa !== pb) return (pa - pb) * dir;
      return byId(a, b);
    });
    return list;
  }
  if (sortBy === "rarity-asc" || sortBy === "rarity-desc") {
    const dir = sortBy === "rarity-desc" ? -1 : 1;
    list.sort((a, b) => {
      if (a.rarity !== b.rarity) return (a.rarity - b.rarity) * dir;
      return byId(a, b);
    });
    return list;
  }
  list.sort(byId);
  return list;
}

function matchesPicked(k) {
  if (poolOn() && !k.inPool) return false;
  if (picked[OPENSEA].size) {
    const val = osListing(k.id) ? OS_SALE : OS_HOLD;
    if (!picked[OPENSEA].has(val)) return false;
  }
  for (const layer of TRAIT_LAYERS) {
    const set = picked[layer];
    if (set.size && !set.has(k.attributes[layer])) return false;
  }
  return true;
}

function matchesSearch(k) {
  const q = ($("tsearch").value || "").trim().toLowerCase();
  if (!q) return true;
  if (`#${k.id}`.includes(q) || String(k.id).includes(q)) return true;
  return TRAIT_LAYERS.some((layer) => String(k.attributes[layer] || "").toLowerCase().includes(q));
}

function toggleVal(layer, value) {
  if (layer === ALL || layer === POOL || layer === OPENSEA) {
    const on = layer !== ALL && picked[layer].has(value);
    picked[POOL].clear();
    picked[OPENSEA].clear();
    if (layer !== ALL && !on) picked[layer].add(value);
    renderSidebar();
    applyFilter();
    return;
  }
  const set = picked[layer];
  if (set.has(value)) set.delete(value);
  else set.add(value);
  renderSidebar();
  applyFilter();
}

function writeHash() {
  const hash = poolOn() ? (buyId ? `pool/${buyId}` : "pool") : "";
  const next = new URL(pageUrl("gallery.html", hash), location.href);
  if (`${location.pathname}${location.hash}` !== `${next.pathname}${next.hash}`) {
    history.replaceState({ view: "gallery", hash }, "", next);
  }
}

function log(msg) {
  $("buy-log").textContent = msg;
}

function paintBuyChrome() {
  $("buy-snipe").hidden = !buyId || !buyAvailable;
  $("buy-snipe").disabled = busy || !buyId || !buyAvailable;
  const os = $("buy-os");
  os.hidden = !buyId;
  if (buyId) os.href = osUrl(buyId);
}

function paintDesk(id) {
  buyId = id;
  buyAvailable = Boolean(id) && poolIds.has(id);
  const listing = id ? osListing(id) : null;
  if (!id) {
    $("buy-eyebrow").textContent = "Raider";
    $("buy-heading").textContent = "Pick a raider";
    $("buy-price").textContent = fallbackSnipeCost() != null ? `${fmtRaid(fallbackSnipeCost())} RAID` : "-";
    $("buy-avail").textContent = "Pick a raider";
    $("buy-os-price").textContent = "-";
    $("buy-note").textContent = "Click a raider to see the vault quote and OpenSea listing.";
    paintQuoteFallback();
    paintBuyChrome();
    return;
  }
  $("buy-heading").textContent = `#${id}`;
  $("buy-os-price").textContent = listing
    ? `${fmtOs(listing.eth)}${listing.usd ? ` · $${Math.round(listing.usd)}` : ""}`
    : "Not listed";
  if (buyAvailable) {
    $("buy-eyebrow").textContent = "Snipe";
    $("buy-avail").textContent = "In vault";
    $("buy-note").textContent = "Snipe pays 15% extra versus a shelf buy.";
    const cost = fallbackSnipeCost();
    $("buy-price").textContent = cost != null ? `${fmtRaid(cost)} RAID` : "-";
  } else if (listing) {
    $("buy-eyebrow").textContent = "OpenSea";
    $("buy-avail").textContent = "Not in vault";
    $("buy-note").textContent = "Listed on OpenSea.";
    $("buy-price").textContent = fmtOs(listing.eth);
  } else {
    $("buy-eyebrow").textContent = "Raider";
    $("buy-avail").textContent = "Not in vault";
    $("buy-note").textContent = "Not in the vault right now.";
    const cost = fallbackSnipeCost();
    $("buy-price").textContent = cost != null ? `${fmtRaid(cost)} RAID` : "-";
  }
  if (market) {
    $("buy-fee").textContent = fmtBps(market.specificBps);
    $("buy-eth").textContent = fmtEth(market.feeWei);
  }
  paintBuyChrome();
}

async function paintWallet() {
  if (!anvil.account) {
    $("buy-raid").textContent = "-";
    paintBuyChrome();
    return;
  }
  paintBuyChrome();
  try {
    const w = await anvil.walletState();
    $("buy-raid").textContent = fmtRaid(w.raid);
  } catch {
    /* Keep the header chrome. */
  }
  paintBuyChrome();
}

function paintQuoteFallback() {
  const listing = osListing(buyId);
  if (buyId && listing && !buyAvailable) {
    $("buy-price").textContent = fmtOs(listing.eth);
  } else {
    const cost = fallbackSnipeCost();
    $("buy-price").textContent = cost != null ? `${fmtRaid(cost)} RAID` : "-";
  }
  if (market) {
    $("buy-fee").textContent = fmtBps(market.specificBps);
    $("buy-eth").textContent = fmtEth(market.feeWei);
  }
}

function markPoolKeepers() {
  for (const k of catalog.keepers) k.inPool = poolIds.has(k.id);
}

async function ensureVaultIds() {
  if (poolReady) return;
  if (document.documentElement.classList.contains("is-gallery")) {
    $("feed-status").textContent = "Loading pool";
  }
  poolIds = new Set();
  poolNext = null;
  let cursor = null;
  for (;;) {
    const more = await anvil.vaultTokens(cursor);
    for (const row of more.rows || []) {
      if (Number.isFinite(row.id)) poolIds.add(row.id);
    }
    const next = more.next || null;
    if (!next || JSON.stringify(next) === JSON.stringify(cursor)) break;
    cursor = next;
  }
  markPoolKeepers();
  poolReady = true;
}

async function showBuy(id, force = false) {
  const next = Number.isFinite(id) && id > 0 ? id : 0;
  const inVault = Boolean(next) && poolIds.has(next);
  if (!force && next === buyId && inVault === buyAvailable) return;
  if (next !== buyId) log("");
  const gen = ++buyGen;
  paintDesk(next);
  writeHash();
  if (!next || !inVault) return;
  try {
    const q = await anvil.quoteSpecific(next);
    if (gen !== buyGen) return;
    const totalCost = q.totalCost ?? q[0];
    const available = Boolean(q.available ?? q[4]);
    if (available) {
      buyAvailable = true;
      $("buy-price").textContent = `${fmtRaid(totalCost)} RAID`;
      paintBuyChrome();
      return;
    }
    buyAvailable = false;
    const listing = osListing(next);
    $("buy-eyebrow").textContent = listing ? "OpenSea" : "Raider";
    $("buy-avail").textContent = "Not in vault";
    $("buy-note").textContent = listing ? "Listed on OpenSea." : "Not in the vault right now.";
    $("buy-price").textContent = listing ? fmtOs(listing.eth) : `${fmtRaid(totalCost)} RAID`;
    paintBuyChrome();
  } catch {
    /* Keep the local vault state. */
  }
}

function syncDesk() {
  const k = selected >= 0 ? filtered[selected] : null;
  const show = Boolean(k) || poolOn();
  $("buy-desk").hidden = !show;
  document.querySelector(".layout").classList.toggle("is-desk", show);
  if (k) showBuy(k.id);
  else if (poolOn()) showBuy(0);
  else {
    buyId = 0;
    buyAvailable = false;
    writeHash();
  }
}

async function loadQuotes() {
  try {
    market = await anvil.loadMarket();
  } catch {
    const res = await fetch("app/demo-state.json");
    const raw = await res.json();
    market = {
      live: false,
      tokensPerNFT: BigInt(raw.tokensPerNFT),
      specificBps: raw.specificBps,
      feeWei: BigInt(raw.feeWei),
    };
  }
  paintQuoteFallback();
}

async function run(label, fn) {
  if (busy) return;
  const id = buyId;
  busy = true;
  refreshConnect();
  paintBuyChrome();
  log(`${label}…`);
  try {
    if (!anvil.account) await anvil.connect();
    refreshConnect();
    await paintWallet();
    const receipt = await fn();
    const hash = receipt?.hash || receipt?.transactionHash;
    log(hash ? `${label} ok. ${EXPLORER}/tx/${hash}` : `${label} ok.`);
    if (id) {
      poolIds.delete(id);
      markPoolKeepers();
      buyId = 0;
      buyAvailable = false;
      await applyFilter();
    }
    await loadQuotes();
    await paintWallet();
  } catch (err) {
    const msg = err?.shortMessage || err?.reason || err?.message || String(err);
    log(`${label} failed. ${msg}`);
  } finally {
    busy = false;
    refreshConnect();
    paintBuyChrome();
  }
}

async function applyFilter() {
  if (poolOn() && !poolReady) {
    try {
      await ensureVaultIds();
    } catch {
      $("feed-status").textContent = "Pool could not load.";
      filtered = [];
      renderSidebar();
      render(true);
      return;
    }
  }
  filtered = sortKeepers(catalog.keepers.filter((k) => matchesPicked(k) && matchesSearch(k)));
  if (buyId) {
    const i = filtered.findIndex((k) => k.id === buyId);
    selected = i;
  } else {
    selected = -1;
  }
  renderSidebar();
  render(true);
  syncDesk();
}

function whereCount(layer, value) {
  if (layer === ALL) return String(catalog.keepers.length);
  if (layer === POOL) return poolReady ? String(poolIds.size) : "";
  const listedN = Object.keys(listings).length;
  const n = value === OS_SALE ? listedN : catalog.keepers.length - listedN;
  return String(n);
}

function renderSidebar() {
  const q = ($("tsearch").value || "").trim().toLowerCase();
  const chips = [];
  for (const layer of LAYERS) {
    for (const value of picked[layer]) {
      const label = layer === POOL || layer === OPENSEA ? value : `${layer} ${value}`;
      chips.push(
        `<button type="button" class="filter-chip" data-t="${layer}" data-v="${value}">${label} ×</button>`
      );
    }
  }
  $("chips").innerHTML = chips.join("");

  $("where").innerHTML = WHERE.map(({ layer, value }) => {
    const on = layer === ALL ? whereAll() : picked[layer].has(value);
    const n = whereCount(layer, value);
    const count = n ? ` <span class="n">${n}</span>` : "";
    return `<button type="button" class="val ${on ? "is-on" : ""}" role="radio" aria-checked="${on}" data-t="${layer}" data-v="${value}">
        <span class="name">${whereIcon(layer, value)}${value}</span>${count}
      </button>`;
  }).join("");

  $("layers").innerHTML = TRAIT_LAYERS.map((layer) => {
    const rows = (catalog.traits[layer] || []).filter(
      (r) =>
        !q ||
        layer.toLowerCase().includes(q) ||
        String(r.value).toLowerCase().includes(q)
    );
    const selectedN = picked[layer].size;
    const totalN = (catalog.traits[layer] || []).length;
    const open = openLayer[layer] || Boolean(q && rows.length);
    const body = open
      ? `<div class="vals">${rows
          .map((r) => {
            const on = picked[layer].has(r.value) ? "is-on" : "";
            return `<button type="button" class="val ${on}" data-t="${layer}" data-v="${r.value}">
                <span class="name">${r.value}</span>
              </button>`;
          })
          .join("")}</div>`
      : "";
    return `<section class="layer">
        <button type="button" class="layer-h" data-layer="${layer}">
          <span>${layer}</span>
          <span class="layer-meta">${
            selectedN ? `<span class="picked">${selectedN}</span>` : ""
          }<span class="n">${totalN}</span></span>
        </button>
        ${body}
      </section>`;
  }).join("");
}

function cardHtml(k, i) {
  const on = i === selected ? "is-on" : "";
  const listing = osListing(k.id);
  const total = catalog.keepers.length;
  const tone = rarityTone(k.rank || total, total);
  const price = listing ? `<span class="card-price">${fmtOs(listing.eth)}</span>` : "";
  const os = listing
    ? `<a class="card-os" href="${osUrl(k.id)}" target="_blank" rel="noopener noreferrer" aria-label="OpenSea">${OS_MARK}</a>`
    : "";
  return `<article class="card ${on} is-${tone}" data-i="${i}" data-id="${k.id}">
      <img
        class="card-art"
        src="${artSrc(k.id)}"
        data-gate="0"
        data-id="${k.id}"
        width="70"
        height="70"
        alt="Raider ${k.id}"
        loading="lazy"
        decoding="async"
      />
      <span class="card-rank" title="Rarity ${k.rank.toLocaleString()} of ${total.toLocaleString()}">${k.rank.toLocaleString()}</span>
      ${os}
      <span class="card-id">#${k.id}</span>
      ${price}
    </article>`;
}

function bindArtFallback(img) {
  if (img.dataset.bound === "1") return;
  img.dataset.bound = "1";
  img.addEventListener("error", () => {
    const id = Number(img.dataset.id);
    const gate = Number(img.dataset.gate || 0) + 1;
    if (gate <= ART_GWS.length) {
      img.dataset.gate = String(gate);
      img.src = artSrc(id, gate);
      return;
    }
    img.src = `art/${String(((id - 1) % 50) + 1).padStart(2, "0")}.png`;
  });
}

function pickCard(i) {
  selected = i;
  $("grid").querySelectorAll(".card.is-on").forEach((c) => c.classList.remove("is-on"));
  const el = $("grid").querySelector(`.card[data-i="${i}"]`);
  if (el) el.classList.add("is-on");
  syncDesk();
}

function bindNewCards(start) {
  const nodes = $("grid").children;
  for (let n = start; n < nodes.length; n += 1) {
    const el = nodes[n];
    const i = Number(el.dataset.i);
    el.addEventListener("click", () => pickCard(i));
    el.querySelectorAll(".card-os").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });
    const img = el.querySelector("img");
    if (img) bindArtFallback(img);
  }
}

function appendMore() {
  if (appending || shown >= filtered.length) return;
  appending = true;
  try {
    const start = shown;
    const next = filtered.slice(shown, shown + CHUNK);
    $("grid").insertAdjacentHTML(
      "beforeend",
      next.map((k, i) => cardHtml(k, start + i)).join("")
    );
    shown += next.length;
    bindNewCards(start);
    paintStatus();
  } finally {
    appending = false;
  }
}

function fillView() {
  const el = $("main");
  if (!el) return;
  for (let i = 0; i < 20; i += 1) {
    if (shown >= filtered.length) break;
    const short = el.scrollHeight <= el.clientHeight + 320;
    const low = el.scrollTop + el.clientHeight > el.scrollHeight - 720;
    if (!short && !low) break;
    const before = shown;
    appendMore();
    if (shown === before) break;
  }
}

function paintStatus() {
  if (!document.documentElement.classList.contains("is-gallery")) return;  if (poolOn()) {
    $("feed-status").textContent = poolReady
      ? `${filtered.length.toLocaleString()} in pool`
      : "Loading pool";
    return;
  }
  if (picked[OPENSEA].has(OS_SALE) && !picked[OPENSEA].has(OS_HOLD)) {
    $("feed-status").textContent = `${filtered.length.toLocaleString()} for sale`;
    return;
  }
  $("feed-status").textContent = `${filtered.length.toLocaleString()} raiders`;
}

function render(reset) {
  if (reset) {
    shown = 0;
    $("grid").innerHTML = "";
    $("main").scrollTop = 0;
  }
  fillView();
  paintStatus();
}

$("tsearch").addEventListener("input", applyFilter);
$("sort").addEventListener("change", () => {
  sortBy = $("sort").value;
  applyFilter();
});
$("clear").addEventListener("click", () => {
  for (const layer of LAYERS) picked[layer].clear();
  $("tsearch").value = "";
  buyId = 0;
  applyFilter();
});
$("chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-t]");
  if (chip) toggleVal(chip.dataset.t, chip.dataset.v);
});
$("where").addEventListener("click", (event) => {
  const val = event.target.closest(".val");
  if (val) toggleVal(val.dataset.t, val.dataset.v);
});
$("layers").addEventListener("click", (event) => {
  const val = event.target.closest(".val");
  if (val) {
    toggleVal(val.dataset.t, val.dataset.v);
    return;
  }
  const head = event.target.closest(".layer-h");
  if (!head) return;
  openLayer[head.dataset.layer] = !openLayer[head.dataset.layer];
  renderSidebar();
});
$("main").addEventListener("scroll", fillView);
window.addEventListener("resize", fillView);
$("buy-snipe").addEventListener("click", () => {
  const id = buyId;
  if (!id) {
    log("Pick a raider to snipe.");
    return;
  }
  run(`Snipe #${id}`, () => anvil.buySpecific(id));
});

document.addEventListener("keydown", (event) => {
  if (!document.documentElement.classList.contains("is-gallery")) return;
  if (event.target.closest("input, button")) return;
  if (!filtered.length) return;
  const cols = Math.max(1, Math.floor($("grid").clientWidth / 180));
  let next = selected < 0 ? 0 : selected;
  if (event.key === "ArrowRight") next = Math.min(filtered.length - 1, next + (selected < 0 ? 0 : 1));
  else if (event.key === "ArrowLeft") next = Math.max(0, next - 1);
  else if (event.key === "ArrowDown") next = Math.min(filtered.length - 1, next + cols);
  else if (event.key === "ArrowUp") next = Math.max(0, next - cols);
  else return;
  event.preventDefault();
  pickCard(next);
  while (shown <= selected) appendMore();
  const el = $("grid").querySelector(`.card[data-i="${selected}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
});

function readPoolHash() {
  const raw = location.hash.replace(/^#/, "");
  if (raw !== "pool" && !raw.startsWith("pool/")) return 0;
  picked[POOL].add(POOL_VAL);
  const id = Number.parseInt(raw.split("/")[1], 10);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

export function galleryBusy() {
  return busy;
}

export function paintGalleryChrome() {
  paintBuyChrome();
}

export async function onGalleryConnect({ source, err } = {}) {
  if (source === "error") {
    log(`Wallet update failed. ${err?.shortMessage || err?.reason || err?.message || err}`);
    return;
  }
  if (source === "click" && anvil.account) log(`Wallet ${short(anvil.account)}.`);
  await paintWallet();
  await loadQuotes();
  if (buyId) await showBuy(buyId, true);
}

export async function onGalleryDisconnect() {
  await paintWallet();
}

export function syncGalleryView() {
  paintStatus();
  fillView();
}

export function startGallery() {
  loadCatalog()
    .then(async (data) => {
      catalog = data;
      await loadListings();
      const pending = readPoolHash();
      if (pending) buyId = pending;
      await loadQuotes();
      paintBuyChrome();
      await applyFilter();
      ensureVaultIds()
        .then(() => {
          renderSidebar();
          if (poolOn()) applyFilter();
          else if (selected >= 0) syncDesk();
        })
        .catch(() => {});
      if (pending) {
        selected = filtered.findIndex((k) => k.id === pending);
        if (selected < 0) selected = -1;
        syncDesk();
      }
    })
    .catch(() => {
      const status = $("feed-status");
      if (status && document.documentElement.classList.contains("is-gallery")) {
        status.textContent = "Gallery could not load. Catalog is missing.";
      }
    });
}
