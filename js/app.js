import {
  ADDRESSES,
  EXPLORER,
  LOAN_STATUS,
  TIERS,
  fmtBps,
  fmtEth,
  fmtRaid,
  parseIds,
  quoteLoanPayout,
  quoteSpecificCost,
} from "./anvil.js";
import { anvil, refreshConnect, short } from "./wallet.js";
import { pageUrl, TABS } from "./router.js";

const $ = (id) => document.getElementById(id);

const ui = {
  status: $("feed-status"),
  connect: $("connect"),
  bits: $("wallet-bits"),
  raid: $("wallet-raid"),
  nfts: $("wallet-nfts"),
  eth: $("wallet-eth"),
  inv: $("stat-inv"),
  next: $("stat-next"),
  random: $("stat-random"),
  sell: $("stat-sell"),
  fee: $("stat-fee"),
  fifoId: $("fifo-id"),
  fifoArt: $("fifo-art"),
  fifoNote: $("fifo-note"),
  snipeArt: $("snipe-art"),
  snipeHeading: $("snipe-heading"),
  snipeNote: $("snipe-note"),
  snipePrice: $("stat-snipe"),
  snipeId: $("snipe-id"),
  snipeAvail: $("snipe-avail"),
  snipeFee: $("snipe-fee"),
  poolInv: $("pool-inv"),
  poolNext: $("pool-next"),
  poolTpn: $("pool-tpn"),
  poolRandomBps: $("pool-random-bps"),
  poolSpecificBps: $("pool-specific-bps"),
  poolRandom: $("pool-random"),
  poolSell: $("pool-sell"),
  poolWeight: $("pool-weight"),
  poolApy: $("pool-apy"),
  weight: $("stake-weight"),
  tiers: $("tiers"),
  stakeCost: $("stake-cost"),
  sellIds: $("sell-ids"),
  actId: $("act-id"),
  actTier: $("act-tier"),
  stakeLookupId: $("stake-lookup-id"),
  stakeStatus: $("stake-status"),
  stakeOwner: $("stake-owner"),
  stakeTier: $("stake-tier"),
  stakePending: $("stake-pending"),
  claimIds: $("claim-ids"),
  kickId: $("kick-id"),
  loanNet: $("loan-net"),
  loanPrincipal: $("loan-principal"),
  loanInterest: $("loan-interest"),
  loanApy: $("loan-apy"),
  loanFee: $("loan-fee"),
  borrowId: $("borrow-id"),
  loanId: $("loan-id"),
  loanStatus: $("loan-status"),
  loanToken: $("loan-token"),
  loanBorrower: $("loan-borrower"),
  loanMaturity: $("loan-maturity"),
  log: $("log"),
};

let market = null;
let busy = false;
let snipeTimer = 0;

function artFor(id) {
  const n = ((Number(id) - 1) % 50) + 1;
  return `art/${String(n).padStart(2, "0")}.png`;
}

const artCache = new Map();
const HISTORY_PEEK = 2;
const HISTORY_PAGE = 8;
let historyAll = [];
let historyNext = null;
let historyPage = 0;
let historyBusy = false;
let historyOpen = false;
const SNIPE_PAGE = 24;
let snipeAll = [];
let snipeNext = null;
let snipePage = 0;
let snipeBusy = false;
let snipePicked = 0;

function ensureArtFallback(img, id) {
  if (img.dataset.artBound === "1") return;
  img.dataset.artBound = "1";
  img.addEventListener("error", () => {
    const token = Number(img.dataset.token || id);
    if (img.dataset.usingTeaser === "1" || !Number.isFinite(token)) return;
    img.dataset.usingTeaser = "1";
    artCache.set(token, null);
    img.src = artFor(token);
  });
}

async function setArt(img, id, standInNote) {
  if (!img || !Number.isFinite(id) || id < 1) return;
  img.dataset.token = String(id);
  ensureArtFallback(img, id);
  img.dataset.usingTeaser = "1";
  img.src = artFor(id);
  img.alt = standInNote
    ? `Stand-in art for raider ${id} on the shelf`
    : `Raider ${id}`;
  if (artCache.has(id)) {
    const cached = artCache.get(id);
    if (cached && img.dataset.token === String(id)) {
      img.dataset.usingTeaser = "0";
      img.src = cached;
      img.alt = `Raider ${id}`;
    }
    return;
  }
  try {
    const url = await anvil.tokenImage(id);
    artCache.set(id, url || null);
    if (url && img.dataset.token === String(id)) {
      img.dataset.usingTeaser = "0";
      img.src = url;
      img.alt = `Raider ${id}`;
    }
  } catch {
    artCache.set(id, null);
  }
}

function paintHeld(ids, expected = 0) {
  const boxes = document.querySelectorAll("[data-held]");
  boxes.forEach((box) => {
    const list = box.querySelector(".held-list");
    const target = $(box.dataset.held);
    list.innerHTML = "";
    if (!ids.length) {
      if (expected > 0) {
        box.hidden = false;
        const note = document.createElement("p");
        note.className = "hint tight";
        note.textContent = "Token IDs did not load. Enter one to continue.";
        list.append(note);
        return;
      }
      box.hidden = true;
      return;
    }
    box.hidden = false;
    ids.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `#${id}`;
      btn.addEventListener("click", () => {
        if (!target) return;
        if (target.id === "sell-ids" || target.id === "claim-ids") {
          const cur = parseIds(target.value);
          if (cur.includes(id)) target.value = cur.filter((n) => n !== id).join(", ");
          else target.value = [...cur, id].join(", ");
        } else {
          target.value = String(id);
          target.dispatchEvent(new Event("input"));
        }
        list.querySelectorAll("button").forEach((el) => {
          el.classList.toggle("is-on", el === btn);
        });
      });
      list.append(btn);
    });
  });
}

function asBig(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

function hydrateDemo(raw) {
  return {
    ...raw,
    live: false,
    totalCost: asBig(raw.totalCost),
    baseCost: asBig(raw.baseCost),
    fee: asBig(raw.fee),
    protocolFee: asBig(raw.protocolFee),
    netPayout: asBig(raw.netPayout),
    grossPayout: asBig(raw.grossPayout),
    sellFee: asBig(raw.sellFee),
    sellProtocol: asBig(raw.sellProtocol),
    tokensPerNFT: asBig(raw.tokensPerNFT),
    feeWei: asBig(raw.feeWei),
    loanFeeWei: asBig(raw.loanFeeWei ?? raw.feeWei),
    totalWeight: asBig(raw.totalWeight),
    tiers: raw.tiers.map((t) => ({ ...t, raid: asBig(t.raid) })),
  };
}

function log(msg) {
  const line = `${new Date().toLocaleTimeString()}  ${msg}`;
  const prev = ui.log.textContent.split("\n").filter(Boolean);
  ui.log.textContent = [line, ...prev].slice(0, 3).join("\n");
}

function parseWhen(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function relativeWhen(d) {
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 0) return absoluteWhen(d);
  if (sec < 45) return "Just now";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min ago`;
  if (sec < 86400) return `${Math.max(1, Math.round(sec / 3600))}h ago`;
  if (sec < 86400 * 7) return `${Math.max(1, Math.round(sec / 86400))}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function absoluteWhen(d) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function addWhenCells(tr, value) {
  const rel = document.createElement("td");
  const abs = document.createElement("td");
  abs.className = "when-abs";
  const d = parseWhen(value);
  if (!d) {
    rel.textContent = "-";
    abs.textContent = "-";
  } else {
    rel.textContent = relativeWhen(d);
    rel.title = d.toLocaleString();
    abs.textContent = absoluteWhen(d);
  }
  tr.append(rel, abs);
}

function eventMeta(side) {
  if (side === "Sell") return { label: "NFT sold", cls: "side-sold" };
  if (side === "Snipe") return { label: "Snipe", cls: "side-snipe" };
  return { label: "Swap", cls: "side-swap" };
}

function eventVerb(side) {
  if (side === "Sell") return "sold";
  if (side === "Snipe") return "sniped";
  return "bought";
}

function shortHash(value) {
  if (!value) return "-";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.append(td);
  return td;
}

function addLinkCell(tr, href, label) {
  const td = document.createElement("td");
  if (!href) {
    td.textContent = "-";
    tr.append(td);
    return;
  }
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label;
  td.append(a);
  tr.append(td);
}

function paintHistory(rows) {
  const body = $("history-rows");
  body.replaceChildren();
  if (!rows?.length) {
    const tr = document.createElement("tr");
    const td = addCell(tr, "No vault swaps yet.");
    td.colSpan = 8;
    body.append(tr);
    return;
  }
  const marketHref = `${EXPLORER}/address/${ADDRESSES.vault}`;
  const marketLabel = short(ADDRESSES.vault);
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const side = row.side || "Buy";
    const meta = eventMeta(side);
    const id = Number(row.tokenId);
    addWhenCells(tr, row.time);

    const raider = document.createElement("td");
    raider.className = "raider";
    const img = document.createElement("img");
    img.className = "pixel thumb";
    img.width = 48;
    img.height = 48;
    img.alt = `Raider ${id}`;
    raider.append(img);
    const tag = document.createElement("span");
    tag.textContent = `#${id}`;
    raider.append(tag);
    raider.title = `Snipe #${id}`;
    raider.addEventListener("click", () => {
      showTab("snipe");
      pickSnipe(id);
    });
    tr.append(raider);
    setArt(img, id, true);

    const eventTd = addCell(tr, "");
    const mark = document.createElement("span");
    mark.className = `side ${meta.cls}`;
    mark.textContent = meta.label;
    eventTd.append(mark);

    const details = document.createElement("td");
    if (row.wallet) {
      const who = document.createElement("a");
      who.href = `${EXPLORER}/address/${row.wallet}`;
      who.target = "_blank";
      who.rel = "noopener noreferrer";
      who.textContent = short(row.wallet);
      details.append(who);
    }
    details.append(document.createTextNode(` ${eventVerb(side)}`));
    tr.append(details);

    addLinkCell(tr, marketHref, marketLabel);
    addCell(tr, row.block ? `#${row.block}` : "-");
    addLinkCell(
      tr,
      row.hash ? `${EXPLORER}/tx/${row.hash}` : "",
      row.hash ? shortHash(row.hash) : "-",
    );
    body.append(tr);
  });
}

function paintHistoryPager() {
  const pager = $("history-pager");
  const more = $("history-more");
  pager.hidden = !historyOpen;
  more.textContent = historyOpen ? "Show less" : "Show more";
  more.setAttribute("aria-expanded", historyOpen ? "true" : "false");
  if (!historyOpen) {
    const n = Math.min(HISTORY_PEEK, historyAll.length);
    $("history-range").textContent = historyAll.length
      ? `${n} of ${historyNext ? `${historyAll.length}+` : historyAll.length}`
      : "No rows";
    return;
  }
  const start = historyPage * HISTORY_PAGE;
  const shown = Math.min(HISTORY_PAGE, Math.max(0, historyAll.length - start));
  const lo = historyAll.length ? start + 1 : 0;
  const hi = start + shown;
  const total = historyNext ? `${historyAll.length}+` : String(historyAll.length);
  $("history-range").textContent = historyAll.length
    ? `${lo}-${hi} of ${total}`
    : "No rows";
  $("history-prev").disabled = historyBusy || historyPage <= 0;
  $("history-next").disabled =
    historyBusy || (!historyNext && start + HISTORY_PAGE >= historyAll.length);
}

async function fillHistoryPage() {
  const need = (historyPage + 1) * HISTORY_PAGE;
  while (historyAll.length < need && historyNext) {
    const cursor = historyNext;
    const more = await anvil.fetchHistoryLogs(cursor);
    historyAll.push(...more.rows);
    historyNext = more.next || null;
    if (historyNext && JSON.stringify(historyNext) === JSON.stringify(cursor)) {
      historyNext = null;
      break;
    }
  }
}

async function showHistoryPage(page) {
  if (historyBusy) return;
  historyBusy = true;
  historyPage = Math.max(0, page);
  paintHistoryPager();
  try {
    await fillHistoryPage();
    if (!historyOpen) {
      paintHistory(historyAll.slice(0, HISTORY_PEEK));
      return;
    }
    const maxPage = Math.max(0, Math.ceil(historyAll.length / HISTORY_PAGE) - 1);
    if (historyPage > maxPage) historyPage = maxPage;
    const start = historyPage * HISTORY_PAGE;
    paintHistory(historyAll.slice(start, start + HISTORY_PAGE));
  } catch (err) {
    log(`History page failed. ${err?.shortMessage || err?.message || err}`);
  } finally {
    historyBusy = false;
    paintHistoryPager();
  }
}

async function loadHistory() {
  historyAll = [];
  historyNext = null;
  historyPage = 0;
  try {
    const pack = await anvil.loadHistory();
    const rows = pack?.rows || [];
    if (rows.length) {
      historyAll = rows;
      historyNext = pack.next || null;
      await showHistoryPage(0);
      return;
    }
  } catch {
    /* Cached snapshot below. */
  }
  try {
    const res = await fetch("app/demo-state.json");
    const data = await res.json();
    historyAll = data.history || [];
    historyNext = null;
    await showHistoryPage(0);
  } catch {
    historyAll = [];
    paintHistory([]);
    paintHistoryPager();
  }
}

function setBusy(on) {
  busy = on;
  document.querySelectorAll("[data-write]").forEach((el) => {
    el.disabled = on;
  });
  refreshConnect();
}

function selectedTier() {
  if (!market) return null;
  const id = Number.parseInt(ui.actTier.value, 10);
  return market.tiers.find((t) => t.id === id) || market.tiers[0];
}

function paintStakeCost() {
  const tier = selectedTier();
  if (!tier) return;
  ui.stakeCost.textContent = `${fmtRaid(tier.raid)} RAID to activate ${tier.name}`;
}

function sellPayout(data) {
  if (data.netPayout != null) return data.netPayout;
  const tpn = data.tokensPerNFT;
  return tpn - (tpn * BigInt(data.randomBps)) / 10000n - (tpn * 50n) / 10000n;
}

function paintSnipeFallback() {
  if (!market) return;
  const cost = quoteSpecificCost(market.tokensPerNFT, market.specificBps);
  ui.snipePrice.textContent = `${fmtRaid(cost)} RAID`;
  ui.snipeFee.textContent = fmtBps(market.specificBps);
}

function paintMarket(data) {
  market = data;
  const sell = sellPayout(data);
  const loan = quoteLoanPayout(data.tokensPerNFT, data.borrowApy);
  ui.status.textContent = data.live ? "Live Anvil" : "Cached";
  ui.inv.textContent = data.inventorySize.toLocaleString();
  ui.next.textContent = `#${data.nextTokenId}`;
  ui.random.textContent = `${fmtRaid(data.totalCost)} RAID`;
  ui.sell.textContent = `${fmtRaid(sell)} RAID`;
  ui.fee.textContent = fmtEth(data.feeWei);
  ui.fifoId.textContent = `#${data.nextTokenId}`;
  ui.fifoArt.alt = `Stand-in art for raider ${data.nextTokenId} on the shelf`;
  setArt(ui.fifoArt, data.nextTokenId, true);
  ui.fifoNote.textContent = `You get the oldest raider in the vault. Next out is #${data.nextTokenId}. Art uses the on-chain token when the URI loads.`;
  paintSnipeFallback();
  if (!ui.snipeId.value) {
    ui.snipeHeading.textContent = "Pick a raider";
    ui.snipeAvail.textContent = "Pick a raider";
  }
  ui.poolInv.textContent = data.inventorySize.toLocaleString();
  ui.poolNext.textContent = `#${data.nextTokenId}`;
  ui.poolTpn.textContent = `${fmtRaid(data.tokensPerNFT)} RAID`;
  ui.poolRandomBps.textContent = fmtBps(data.randomBps);
  ui.poolSpecificBps.textContent = fmtBps(data.specificBps);
  ui.poolRandom.textContent = `${fmtRaid(data.totalCost)} RAID`;
  ui.poolSell.textContent = `${fmtRaid(sell)} RAID`;
  ui.poolWeight.textContent = data.totalWeight.toString();
  ui.poolApy.textContent = fmtBps(data.borrowApy);
  ui.weight.textContent = data.totalWeight.toString();
  ui.loanNet.textContent = `${fmtRaid(loan.net)} RAID`;
  ui.loanPrincipal.textContent = `${fmtRaid(loan.principal)} RAID`;
  ui.loanInterest.textContent = `${fmtRaid(loan.interest)} RAID`;
  ui.loanApy.textContent = fmtBps(data.borrowApy);
  ui.loanFee.textContent = fmtEth(data.loanFeeWei ?? data.feeWei);
  ui.tiers.innerHTML = "";
  const head = document.createElement("li");
  head.className = "head";
  head.innerHTML = "<span>Tier</span><span>Weight</span><span>Burn</span><span>RAID</span>";
  ui.tiers.append(head);
  data.tiers.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${t.name}</span><span>${t.weight}</span><span>${fmtBps(t.bps)}</span><span>${fmtRaid(t.raid)}</span>`;
    ui.tiers.append(li);
  });
  paintStakeCost();
}

function raidReward(rewards) {
  const hit = (rewards || []).find(
    (row) => row.token.toLowerCase() === ADDRESSES.raid.toLowerCase(),
  );
  if (!hit) return "0 RAID";
  return `${fmtRaid(hit.amount)} RAID`;
}

function when(ts) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleDateString();
}

function paintWalletChrome() {
  const on = Boolean(anvil.account);
  ui.bits.hidden = !on;
  if (!on) {
    ui.raid.textContent = "-";
    ui.nfts.textContent = "-";
    ui.eth.textContent = "-";
    return;
  }
  if (ui.raid.textContent === "-") ui.raid.textContent = "…";
  if (ui.nfts.textContent === "-") ui.nfts.textContent = "…";
  if (ui.eth.textContent === "-") ui.eth.textContent = "…";
}

async function refreshWallet() {
  if (!anvil.account) {
    refreshConnect();
    paintHeld([]);
    return;
  }
  refreshConnect();
  let expected = 0;
  try {
    const w = await anvil.walletState();
    if (w) {
      ui.raid.textContent = fmtRaid(w.raid);
      ui.nfts.textContent = w.nfts.toString();
      ui.eth.textContent = fmtEth(w.eth);
      expected = Number(w.nfts) || 0;
      if (w.activeLoan && !ui.loanId.value) {
        ui.loanId.value = String(w.activeLoan);
        await lookupLoan(w.activeLoan, true);
      }
    }
  } catch {
    /* Keep the address chrome. */
  }
  try {
    paintHeld(await anvil.ownedIds(), expected);
  } catch {
    paintHeld([], expected);
  }
  document.querySelectorAll("[data-write]").forEach((el) => {
    el.disabled = busy;
  });
}

async function loadMarket() {
  try {
    const data = await anvil.loadMarket();
    paintMarket(data);
    log(`Vault live. ${data.inventorySize} in pool. Next #${data.nextTokenId}.`);
  } catch (err) {
    const res = await fetch("app/demo-state.json");
    const data = hydrateDemo(await res.json());
    paintMarket(data);
    log("Public RPC blocked. Showing cached quotes. Connect a wallet for live reads and writes.");
  }
}

function showTab(name, push = true) {
  const tab = TABS.includes(name) ? name : "trade";
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.tab === tab);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-on", panel.dataset.panel === tab);
  });
  if (push) {
    const next = new URL(pageUrl("app.html", tab === "trade" ? "" : tab), location.href);
    if (`${location.pathname}${location.hash}` !== `${next.pathname}${next.hash}`) {
      history.replaceState({ view: "market", tab, hash: next.hash.replace(/^#/, "") }, "", next);
    }
  }
  if (tab === "snipe") ensureSnipeShelf();
}

async function run(label, fn) {
  if (busy) return;
  setBusy(true);
  log(`${label}…`);
  try {
    if (!anvil.account) await anvil.connect();
    await refreshWallet();
    const receipt = await fn();
    const hash = receipt?.hash || receipt?.transactionHash;
    log(hash ? `${label} ok. ${EXPLORER}/tx/${hash}` : `${label} ok.`);
    await loadMarket();
    await refreshWallet();
    await loadHistory();
    snipeAll = [];
    snipeNext = null;
    if (document.querySelector('[data-panel="snipe"].is-on')) await ensureSnipeShelf();
  } catch (err) {
    const msg = err?.shortMessage || err?.reason || err?.message || String(err);
    log(`${label} failed. ${msg}`);
  } finally {
    setBusy(false);
  }
}

async function checkSnipe(id) {
  if (!Number.isFinite(id) || id < 1) {
    paintSnipeFallback();
    snipePicked = 0;
    ui.snipeHeading.textContent = "Pick a raider";
    ui.snipeAvail.textContent = "Pick a raider";
    ui.snipeNote.textContent = "Click a raider in the vault, or enter a token ID.";
    markSnipePick(0);
    return;
  }
  snipePicked = id;
  ui.snipeHeading.textContent = `#${id}`;
  markSnipePick(id);
  await setArt(ui.snipeArt, id, true);
  const fallback = market
    ? quoteSpecificCost(market.tokensPerNFT, market.specificBps)
    : null;
  try {
    const q = await anvil.quoteSpecific(id);
    const totalCost = q.totalCost ?? q[0];
    const available = q.available ?? q[4];
    ui.snipePrice.textContent = `${fmtRaid(totalCost)} RAID`;
    ui.snipeAvail.textContent = available ? "In vault" : "Not in vault";
    ui.snipeNote.textContent = available
      ? `This raider is in the vault. Snipe pays 15% extra versus a shelf buy.`
      : `Not in the vault right now. A shelf buy still takes the next one out.`;
    return;
  } catch {
    /* Explorer owner check if public RPC is blocked. */
  }
  if (fallback) ui.snipePrice.textContent = `${fmtRaid(fallback)} RAID`;
  try {
    const owner = await anvil.tokenOwner(id);
    const inVault = String(owner || "").toLowerCase() === ADDRESSES.vault.toLowerCase();
    ui.snipeAvail.textContent = inVault ? "In vault" : owner ? "Not in vault" : "Stock unknown";
    ui.snipeNote.textContent = inVault
      ? `This raider is in the vault. Connect to snipe it.`
      : owner
        ? `Not in the vault right now. A shelf buy still takes the next one out.`
        : `Cached snipe quote. Connect a wallet to confirm stock and buy.`;
  } catch {
    ui.snipeAvail.textContent = "Connect for live stock";
    ui.snipeNote.textContent = "Cached snipe quote. Connect a wallet to check if this ID is in the vault.";
  }
}

function markSnipePick(id) {
  document.querySelectorAll(".snipe-grid button").forEach((btn) => {
    btn.classList.toggle("is-on", Number(btn.dataset.id) === id);
  });
}

function pickSnipe(id) {
  if (!Number.isFinite(id) || id < 1) return;
  ui.snipeId.value = String(id);
  checkSnipe(id);
}

function paintSnipePager() {
  const start = snipePage * SNIPE_PAGE;
  const shown = Math.min(SNIPE_PAGE, Math.max(0, snipeAll.length - start));
  const lo = snipeAll.length ? start + 1 : 0;
  const hi = start + shown;
  const total = snipeNext ? `${snipeAll.length}+` : String(snipeAll.length);
  const count = $("snipe-count");
  if (count) {
    count.textContent = snipeAll.length
      ? `Click a raider to snipe it. Showing ${lo}-${hi} of ${total}.`
      : "Loading raiders in the vault.";
  }
  $("snipe-range").textContent = snipeAll.length ? `${lo}-${hi} of ${total}` : "No rows";
  $("snipe-prev").disabled = snipeBusy || snipePage <= 0;
  $("snipe-next").disabled =
    snipeBusy || (!snipeNext && start + SNIPE_PAGE >= snipeAll.length);
}

function paintSnipeGrid(rows) {
  const grid = $("snipe-grid");
  grid.replaceChildren();
  rows.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = String(row.id);
    btn.title = `Snipe #${row.id}`;
    btn.classList.toggle("is-on", row.id === snipePicked);
    const img = document.createElement("img");
    img.className = "pixel";
    img.alt = `Raider ${row.id}`;
    img.width = 48;
    img.height = 48;
    btn.append(img);
    btn.addEventListener("click", () => pickSnipe(row.id));
    grid.append(btn);
    if (row.image) artCache.set(row.id, row.image);
    setArt(img, row.id, true);
  });
}

async function fillSnipePage() {
  const need = (snipePage + 1) * SNIPE_PAGE;
  while (snipeAll.length < need && snipeNext) {
    const cursor = snipeNext;
    const more = await anvil.vaultTokens(cursor);
    snipeAll.push(...more.rows);
    snipeNext = more.next || null;
    if (snipeNext && JSON.stringify(snipeNext) === JSON.stringify(cursor)) {
      snipeNext = null;
      break;
    }
  }
}

async function showSnipePage(page) {
  if (snipeBusy) return;
  snipeBusy = true;
  snipePage = Math.max(0, page);
  paintSnipePager();
  try {
    await fillSnipePage();
    const maxPage = Math.max(0, Math.ceil(snipeAll.length / SNIPE_PAGE) - 1);
    if (snipePage > maxPage) snipePage = maxPage;
    const start = snipePage * SNIPE_PAGE;
    paintSnipeGrid(snipeAll.slice(start, start + SNIPE_PAGE));
    markSnipePick(snipePicked);
  } catch (err) {
    log(`Vault list failed. ${err?.shortMessage || err?.message || err}`);
  } finally {
    snipeBusy = false;
    paintSnipePager();
  }
}

async function ensureSnipeShelf() {
  if (snipeAll.length || snipeBusy) {
    markSnipePick(snipePicked);
    return;
  }
  try {
    const pack = await anvil.vaultTokens(null);
    snipeAll = pack.rows || [];
    snipeNext = pack.next || null;
    await showSnipePage(0);
  } catch (err) {
    log(`Vault list failed. ${err?.shortMessage || err?.message || err}`);
    paintSnipeGrid([]);
    paintSnipePager();
  }
}

async function lookupStake(id) {
  const info = await anvil.lookupStake(id);
  ui.stakeStatus.textContent = info.active ? "Active" : "Inactive";
  ui.stakeOwner.textContent = short(info.owner);
  ui.stakeTier.textContent = info.active ? (TIERS[info.tier]?.name || `T${info.tier}`) : "-";
  ui.stakePending.textContent = raidReward(info.rewards);
  if (!ui.claimIds.value) ui.claimIds.value = String(id);
  if (!ui.kickId.value) ui.kickId.value = String(id);
  log(`Stake #${id}: ${info.active ? "active" : "inactive"}.`);
}

async function lookupLoan(id, quiet = false) {
  const info = await anvil.lookupLoan(id);
  ui.loanStatus.textContent = LOAN_STATUS[info.status] || String(info.status);
  ui.loanToken.textContent = info.tokenId ? `#${info.tokenId}` : "-";
  ui.loanBorrower.textContent = short(info.borrower);
  ui.loanMaturity.textContent = when(info.maturity);
  if (!quiet) log(`Loan ${id}: ${ui.loanStatus.textContent}.`);
}

$("buy-random").addEventListener("click", () => {
  run("Buy from the shelf", () => anvil.buyRandom());
});

$("buy-specific").addEventListener("click", () => {
  const id = Number.parseInt(ui.snipeId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a token ID to snipe.");
    return;
  }
  run(`Snipe #${id}`, () => anvil.buySpecific(id));
});

$("snipe-check").addEventListener("click", () => {
  checkSnipe(Number.parseInt(ui.snipeId.value, 10));
});

$("snipe-prev").addEventListener("click", () => {
  showSnipePage(snipePage - 1);
});
$("snipe-next").addEventListener("click", () => {
  showSnipePage(snipePage + 1);
});

ui.snipeId.addEventListener("input", () => {
  window.clearTimeout(snipeTimer);
  snipeTimer = window.setTimeout(() => {
    checkSnipe(Number.parseInt(ui.snipeId.value, 10));
  }, 280);
});

$("sell").addEventListener("click", () => {
  const ids = parseIds(ui.sellIds.value);
  if (!ids.length) {
    log("Enter token IDs to sell. Use commas or ranges, e.g. 12, 40-44.");
    return;
  }
  run(`Sell ${ids.length}`, () => anvil.sell(ids));
});

$("activate").addEventListener("click", () => {
  const id = Number.parseInt(ui.actId.value, 10);
  const tier = Number.parseInt(ui.actTier.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a token ID to activate.");
    return;
  }
  run(`Activate #${id} ${TIERS[tier]?.name || tier}`, () => anvil.activate(id, tier));
});

ui.actTier.addEventListener("change", paintStakeCost);

$("stake-lookup").addEventListener("click", async () => {
  const id = Number.parseInt(ui.stakeLookupId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a token ID to check stake.");
    return;
  }
  try {
    await lookupStake(id);
  } catch (err) {
    log(`Stake lookup failed. ${err?.shortMessage || err?.message || err}`);
  }
});

$("claim").addEventListener("click", () => {
  const ids = parseIds(ui.claimIds.value);
  if (!ids.length) {
    log("Enter token IDs to claim.");
    return;
  }
  run(`Claim ${ids.length}`, () => anvil.claim(ids));
});

$("kick").addEventListener("click", () => {
  const id = Number.parseInt(ui.kickId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a token ID to kick.");
    return;
  }
  run(`Kick #${id}`, () => anvil.kick(id));
});

$("borrow").addEventListener("click", () => {
  const id = Number.parseInt(ui.borrowId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a token ID to borrow against.");
    return;
  }
  run(`Borrow #${id}`, () => anvil.borrow(id));
});

$("loan-lookup").addEventListener("click", async () => {
  const id = Number.parseInt(ui.loanId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a loan ID to check.");
    return;
  }
  try {
    await lookupLoan(id);
  } catch (err) {
    log(`Loan lookup failed. ${err?.shortMessage || err?.message || err}`);
  }
});

$("repay").addEventListener("click", () => {
  const id = Number.parseInt(ui.loanId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a loan ID to repay.");
    return;
  }
  run(`Repay loan ${id}`, () => anvil.repay(id));
});

$("liquidate").addEventListener("click", () => {
  const id = Number.parseInt(ui.loanId.value, 10);
  if (!Number.isFinite(id)) {
    log("Enter a loan ID to liquidate.");
    return;
  }
  run(`Liquidate loan ${id}`, () => anvil.liquidate(id));
});

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

window.addEventListener("hashchange", () => {
  if (!document.documentElement.classList.contains("is-app")) return;
  showTab(location.hash.slice(1), false);
});

TIERS.forEach((t) => {
  const opt = document.createElement("option");
  opt.value = String(t.id);
  opt.textContent = `${t.name} · ${t.weight}`;
  ui.actTier.append(opt);
});

$("raid-link").href = `${EXPLORER}/token/${ADDRESSES.raid}`;
$("vault-link").href = `${EXPLORER}/address/${ADDRESSES.vault}`;
$("nft-link").href = `${EXPLORER}/token/${ADDRESSES.nft}`;
$("stake-link").href = `${EXPLORER}/address/${ADDRESSES.stake}`;
$("loan-link").href = `${EXPLORER}/address/${ADDRESSES.loan}`;
$("escrow-link").href = `${EXPLORER}/address/${ADDRESSES.escrow}`;
$("router-link").href = `${EXPLORER}/address/${ADDRESSES.router}`;
$("factory-link").href = `${EXPLORER}/address/${ADDRESSES.factory}`;
$("anvil-ext").href = `https://anvil.clutch.market/market/${ADDRESSES.vault}`;
$("history-ext").href = `${EXPLORER}/address/${ADDRESSES.vault}`;
$("history-more").addEventListener("click", () => {
  historyOpen = !historyOpen;
  $("history").classList.toggle("is-open", historyOpen);
  document.querySelector(".shell").classList.toggle("is-log", historyOpen);
  if (historyOpen) showHistoryPage(historyPage);
  else {
    historyPage = 0;
    paintHistory(historyAll.slice(0, HISTORY_PEEK));
    paintHistoryPager();
  }
});
$("history-prev").addEventListener("click", () => {
  showHistoryPage(historyPage - 1);
});
$("history-next").addEventListener("click", () => {
  showHistoryPage(historyPage + 1);
});

export function marketBusy() {
  return busy;
}

export function paintMarketChrome() {
  paintWalletChrome();
}

export async function onMarketConnect({ source, err } = {}) {
  if (source === "error") {
    log(`Wallet update failed. ${err?.shortMessage || err?.reason || err?.message || err}`);
    return;
  }
  if (source === "click" && anvil.account) log(`Wallet ${short(anvil.account)}.`);
  await Promise.all([
    refreshWallet(),
    loadMarket().catch((error) => {
      log(`Quotes failed. ${error?.shortMessage || error?.reason || error?.message || error}`);
    }),
  ]);
}

export async function onMarketDisconnect() {
  paintHeld([]);
  if (!market) await loadMarket();
}

export function startMarket() {
  setBusy(false);
  showTab(location.hash.slice(1) || "trade", false);
  loadHistory();
}

export { showTab };
