/**
 * CHAINRAIDERS Anvil wrapper.
 * Talks to Clutch NFTAMMVault / BatchRouter / SoftStakingVault on Robinhood Chain.
 * Protocol + ~$2 ETH fees still go to Anvil; this is our frontend only.
 */
import { BrowserProvider, Contract, JsonRpcProvider, MaxUint256, formatEther, formatUnits, parseUnits } from "https://cdn.jsdelivr.net/npm/ethers@6/+esm";

export const CHAIN_ID = 4663;
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";

export const ADDRESSES = {
  nft: "0xe015961Fb36d99bca8592bA048f9c46983c63e8A",
  vault: "0xf29aa29804033d5fC9A16Ad6f864E495d950acB4",
  raid: "0x5829471cd0c63da8f7e0697600C8185e7AD61E64",
  stake: "0xe75C2b34AC34502924F54802Dea2e8182DAd8499",
  loan: "0x7C71a89625279664F5b16764cE87641BbEeD063c",
  escrow: "0x7716CD3cC44558ea3ECA93792B6c2Cf3F0abF8c1",
  router: "0x23fB0F997E05c5C43FB7FA8962E7D28349a16B5f",
  factory: "0x8b186717a20845b514344b17fd5e198aDCab9069",
};

const NFT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function setApprovalForAll(address,bool)",
  "function tokenURI(uint256) view returns (string)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
];

const RAID_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const VAULT_ABI = [
  "function tokensPerNFT() view returns (uint256)",
  "function randomFeeBps() view returns (uint16)",
  "function specificFeeBps() view returns (uint16)",
  "function robinhoodSwapFeeWei() view returns (uint256)",
  "function stakingVault() view returns (address)",
  "function quoteRandomBuy() view returns (uint256 totalCost, uint256 baseCost, uint256 fee, uint256 protocolFee, uint256 inventorySize, uint256 nextTokenId)",
  "function quoteSpecificBuy(uint256 tokenId) view returns (uint256 totalCost, uint256 baseCost, uint256 fee, uint256 protocolFee, uint256 available)",
  "function quoteSellNFT() view returns (uint256 netPayout, uint256 grossPayout, uint256 fee, uint256 protocolFee)",
  "function buyRandomNFT(uint256 maxCost) payable",
  "function buySpecificNFT(uint256 tokenId, uint256 maxCost) payable",
  "function sellNFT(uint256 tokenId, uint256 minPayout) payable",
  "function oldestTokenId() view returns (uint256)",
  "function newestTokenId() view returns (uint256)",
  "function getNextTokenId(uint256 tokenId) view returns (uint256)",
  "function inventoryLength() view returns (uint256)",
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 totalCost, uint256 baseCost, uint256 protocolFee, uint256 stakerFee, bool isSpecific)",
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 grossPayout, uint256 netPayout, uint256 protocolFee, uint256 stakerFee)",
];

const ROUTER_ABI = [
  "function MAX_BATCH_SIZE() view returns (uint256)",
  "function batchSellNFT(address ammVault, address collection, address token, uint256[] tokenIds, uint256[] minPayouts, uint256 minTotalPayout) payable",
];

const STAKE_ABI = [
  "function totalWeight() view returns (uint256)",
  "function tokensPerNFT() view returns (uint256)",
  "function tierFeeBps(uint8) view returns (uint256)",
  "function activationEthFeeWei() view returns (uint256)",
  "function activate(uint256 tokenId, uint8 tier) payable",
  "function claim(uint256 tokenId)",
  "function claimMany(uint256[] tokenIds)",
  "function kick(uint256 tokenId)",
  "function pendingRewards(uint256 tokenId) view returns (address[] tokens, uint256[] amounts)",
  "function activationOf(uint256 tokenId) view returns (bool active, address owner, uint8 tier, uint40 activatedAt, uint16 weightBps)",
];

const LOAN_ABI = [
  "function borrow(uint256 tokenId, uint256 duration) payable returns (uint256 loanId)",
  "function repay(uint256 loanId)",
  "function liquidate(uint256 loanId)",
  "function getLoanDetails(uint256 loanId) view returns (tuple(address borrower, uint256 tokenId, uint256 principal, uint16 interestRateBps, uint64 startTimestamp, uint64 maturityTimestamp, uint64 graceDeadline, uint8 status))",
  "function activeLoans(address) view returns (uint256)",
  "function loanCreationFeeWei() view returns (uint256)",
  "function borrowAPYBps() view returns (uint16)",
  "function minDuration() view returns (uint64)",
  "function maxDuration() view returns (uint64)",
  "function gracePeriod() view returns (uint64)",
  "function liquidationIncentiveBps() view returns (uint16)",
  "function isCollateralized(uint256 tokenId) view returns (bool)",
  "function nextLoanId() view returns (uint256)",
  "function tokensPerNFT() view returns (uint256)",
];

export const LOAN_STATUS = ["None", "Active", "Repaid", "Liquidated"];
export const YEAR_SECS = 365 * 86400;

const TIERS = [
  { id: 0, name: "Base", weight: "1.00x" },
  { id: 1, name: "T1", weight: "1.25x" },
  { id: 2, name: "T2", weight: "1.60x" },
  { id: 3, name: "T3", weight: "2.00x" },
  { id: 4, name: "T4", weight: "3.33x" },
];

export function parseIds(spec) {
  const out = new Set();
  for (const part of String(spec).split(",")) {
    const chunk = part.trim();
    if (!chunk) continue;
    if (chunk.includes("-")) {
      const [a, b] = chunk.split("-", 2).map((n) => Number.parseInt(n, 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i += 1) out.add(i);
    } else {
      const n = Number.parseInt(chunk, 10);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function rpcProvider() {
  return new JsonRpcProvider(RPC_URL, CHAIN_ID);
}

export class AnvilMarket {
  constructor() {
    this.account = null;
    this.browser = null;
    this.signer = null;
    this.live = false;
    this.read = rpcProvider();
    this._bind(this.read);
  }

  _bind(runner) {
    this.nft = new Contract(ADDRESSES.nft, NFT_ABI, runner);
    this.raid = new Contract(ADDRESSES.raid, RAID_ABI, runner);
    this.vault = new Contract(ADDRESSES.vault, VAULT_ABI, runner);
    this.router = new Contract(ADDRESSES.router, ROUTER_ABI, runner);
    this.stake = new Contract(ADDRESSES.stake, STAKE_ABI, runner);
    this.loan = new Contract(ADDRESSES.loan, LOAN_ABI, runner);
  }

  async loadMarket() {
    const [quote, sell, tpn, randomBps, specificBps, feeWei, weight] = await Promise.all([
      this.vault.quoteRandomBuy(),
      this.vault.quoteSellNFT(),
      this.vault.tokensPerNFT(),
      this.vault.randomFeeBps(),
      this.vault.specificFeeBps(),
      this.vault.robinhoodSwapFeeWei(),
      this.stake.totalWeight(),
    ]);
    const [totalCost, baseCost, fee, protocolFee, inventorySize, nextTokenId] = quote;
    const [netPayout, grossPayout, sellFee, sellProtocol] = sell;
    const tiers = [];
    for (let i = 0; i < TIERS.length; i += 1) {
      const bps = await this.stake.tierFeeBps(i);
      tiers.push({ ...TIERS[i], bps: Number(bps), raid: (tpn * bps) / 10000n });
    }
    let loan = {
      borrowApy: Number(randomBps),
      loanFeeWei: feeWei,
      minDuration: YEAR_SECS,
      maxDuration: YEAR_SECS,
      gracePeriod: 7 * 86400,
      liqIncentive: 200,
    };
    try {
      const [apy, loanFee, minDur, maxDur, grace, liq] = await Promise.all([
        this.loan.borrowAPYBps(),
        this.loan.loanCreationFeeWei(),
        this.loan.minDuration(),
        this.loan.maxDuration(),
        this.loan.gracePeriod(),
        this.loan.liquidationIncentiveBps(),
      ]);
      loan = {
        borrowApy: Number(apy),
        loanFeeWei: loanFee,
        minDuration: Number(minDur),
        maxDuration: Number(maxDur),
        gracePeriod: Number(grace),
        liqIncentive: Number(liq),
      };
    } catch {
      /* Loan reads are optional if RPC is flaky. */
    }
    this.live = true;
    return {
      live: true,
      totalCost,
      baseCost,
      fee,
      protocolFee,
      netPayout,
      grossPayout,
      sellFee,
      sellProtocol,
      inventorySize: Number(inventorySize),
      nextTokenId: Number(nextTokenId),
      tokensPerNFT: tpn,
      randomBps: Number(randomBps),
      specificBps: Number(specificBps),
      feeWei,
      totalWeight: weight,
      tiers,
      ...loan,
    };
  }

  async quoteSpecific(tokenId) {
    return this.vault.quoteSpecificBuy(tokenId);
  }

  async reconnect() {
    const eth = window.ethereum;
    if (!eth) return null;
    const accounts = await eth.request({ method: "eth_accounts" });
    if (!accounts?.length) return null;
    this.browser = new BrowserProvider(eth, "any");
    await this.ensureChain();
    this.signer = await this.browser.getSigner();
    this.account = await this.signer.getAddress();
    this._bind(this.signer);
    this.watch();
    return this.account;
  }

  async connect() {
    const eth = window.ethereum;
    if (!eth) throw new Error("No wallet. Install one that supports Robinhood Chain.");
    this.browser = new BrowserProvider(eth, "any");
    await this.browser.send("eth_requestAccounts", []);
    await this.ensureChain();
    this.signer = await this.browser.getSigner();
    this.account = await this.signer.getAddress();
    this._bind(this.signer);
    this.watch();
    return this.account;
  }

  dropAccount() {
    this.account = null;
    this.signer = null;
    this._bind(this.read);
  }

  watch() {
    if (!window.ethereum || this._watching) return;
    this._watching = true;
    const ping = () => window.dispatchEvent(new Event("anvil-session"));
    window.ethereum.on("accountsChanged", ping);
    window.ethereum.on("chainChanged", ping);
  }

  async ensureChain() {
    const hex = `0x${CHAIN_ID.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (err) {
      if (err && (err.code === 4902 || err.data?.originalError?.code === 4902)) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: "Robinhood Chain",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
      } else {
        throw err;
      }
    }
  }

  async walletState() {
    if (!this.account) return null;
    const fallback = async (promise, value) => {
      try {
        return await promise;
      } catch {
        return value;
      }
    };
    const [raid, nfts, eth, nftOk, nftLoanOk, raidBuy, raidStake, raidLoan, activeLoan] = await Promise.all([
      fallback(this.raid.balanceOf(this.account), 0n),
      fallback(this.nft.balanceOf(this.account), 0n),
      fallback(this.signer?.provider?.getBalance(this.account) ?? Promise.resolve(0n), 0n),
      fallback(this.nft.isApprovedForAll(this.account, ADDRESSES.router), false),
      fallback(this.nft.isApprovedForAll(this.account, ADDRESSES.loan), false),
      fallback(this.raid.allowance(this.account, ADDRESSES.vault), 0n),
      fallback(this.raid.allowance(this.account, ADDRESSES.stake), 0n),
      fallback(this.raid.allowance(this.account, ADDRESSES.loan), 0n),
      fallback(this.loan.activeLoans(this.account), 0n),
    ]);
    return {
      raid,
      nfts,
      eth,
      nftOk,
      nftLoanOk,
      raidBuy,
      raidStake,
      raidLoan,
      activeLoan: Number(activeLoan),
    };
  }

  async ensureNftApproval(spender = ADDRESSES.router) {
    const ok = await this.nft.isApprovedForAll(this.account, spender);
    if (ok) return null;
    const tx = await this.nft.setApprovalForAll(spender, true);
    return tx.wait();
  }

  async ensureRaid(spender, amount) {
    const have = await this.raid.allowance(this.account, spender);
    if (have >= amount) return null;
    const tx = await this.raid.approve(spender, MaxUint256);
    return tx.wait();
  }

  async buyRandom(slipBps = 100) {
    const q = await this.vault.quoteRandomBuy();
    const [totalCost, , , , inventorySize] = q;
    if (inventorySize === 0n) throw new Error("Vault is empty.");
    const maxCost = totalCost + (totalCost * BigInt(slipBps)) / 10000n;
    await this.ensureRaid(ADDRESSES.vault, maxCost);
    const fee = await this.vault.robinhoodSwapFeeWei();
    const tx = await this.vault.buyRandomNFT(maxCost, { value: fee });
    return tx.wait();
  }

  async buySpecific(tokenId, slipBps = 100) {
    const q = await this.vault.quoteSpecificBuy(tokenId);
    const [totalCost] = q;
    const maxCost = totalCost + (totalCost * BigInt(slipBps)) / 10000n;
    await this.ensureRaid(ADDRESSES.vault, maxCost);
    const fee = await this.vault.robinhoodSwapFeeWei();
    const tx = await this.vault.buySpecificNFT(tokenId, maxCost, { value: fee });
    return tx.wait();
  }

  async sell(ids, slipBps = 100) {
    if (!ids.length) throw new Error("No token IDs.");
    let max = 20;
    try {
      max = Number(await this.router.MAX_BATCH_SIZE());
    } catch {
      max = 20;
    }
    const q = await this.vault.quoteSellNFT();
    const net = q.netPayout ?? q[0];
    const minEach = net - (net * BigInt(slipBps)) / 10000n;
    await this.ensureNftApproval(ADDRESSES.router);
    const fee = await this.vault.robinhoodSwapFeeWei();
    let last = null;
    for (let i = 0; i < ids.length; i += max) {
      const chunk = ids.slice(i, i + max);
      const minPayouts = chunk.map(() => minEach);
      const tx = await this.router.batchSellNFT(
        ADDRESSES.vault,
        ADDRESSES.nft,
        ADDRESSES.raid,
        chunk,
        minPayouts,
        minEach * BigInt(chunk.length),
        { value: fee * BigInt(chunk.length) },
      );
      last = await tx.wait();
    }
    return last;
  }

  async activate(tokenId, tier) {
    const tpn = await this.stake.tokensPerNFT();
    const bps = await this.stake.tierFeeBps(tier);
    await this.ensureRaid(ADDRESSES.stake, (tpn * bps) / 10000n);
    let value = 0n;
    try {
      value = await this.stake.activationEthFeeWei();
    } catch {
      value = 0n;
    }
    const tx = await this.stake.activate(tokenId, tier, { value });
    return tx.wait();
  }

  async claim(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) throw new Error("No token IDs.");
    if (list.length === 1) {
      const tx = await this.stake.claim(list[0]);
      return tx.wait();
    }
    const tx = await this.stake.claimMany(list);
    return tx.wait();
  }

  async kick(tokenId) {
    const tx = await this.stake.kick(tokenId);
    return tx.wait();
  }

  async lookupStake(tokenId) {
    const [info, pending] = await Promise.all([
      this.stake.activationOf(tokenId),
      this.stake.pendingRewards(tokenId),
    ]);
    const [tokens, amounts] = pending;
    return {
      active: info.active ?? info[0],
      owner: info.owner ?? info[1],
      tier: Number(info.tier ?? info[2]),
      activatedAt: Number(info.activatedAt ?? info[3]),
      weightBps: Number(info.weightBps ?? info[4]),
      rewards: tokens.map((token, i) => ({ token, amount: amounts[i] })),
    };
  }

  async borrow(tokenId) {
    const locked = await this.loan.isCollateralized(tokenId);
    if (locked) throw new Error(`#${tokenId} is already locked in a loan.`);
    await this.ensureNftApproval(ADDRESSES.loan);
    const duration = await this.loan.maxDuration();
    const fee = await this.loan.loanCreationFeeWei();
    const tx = await this.loan.borrow(tokenId, duration, { value: fee });
    return tx.wait();
  }

  async repay(loanId) {
    const detail = await this.loan.getLoanDetails(loanId);
    const principal = detail.principal ?? detail[2];
    await this.ensureRaid(ADDRESSES.loan, principal);
    const tx = await this.loan.repay(loanId);
    return tx.wait();
  }

  async liquidate(loanId) {
    const tx = await this.loan.liquidate(loanId);
    return tx.wait();
  }

  async lookupLoan(loanId) {
    const d = await this.loan.getLoanDetails(loanId);
    return {
      borrower: d.borrower ?? d[0],
      tokenId: Number(d.tokenId ?? d[1]),
      principal: d.principal ?? d[2],
      interestRateBps: Number(d.interestRateBps ?? d[3]),
      start: Number(d.startTimestamp ?? d[4]),
      maturity: Number(d.maturityTimestamp ?? d[5]),
      grace: Number(d.graceDeadline ?? d[6]),
      status: Number(d.status ?? d[7]),
    };
  }

  async ownedIds(limit = 80) {
    if (!this.account) return [];
    const n = Number(await this.nft.balanceOf(this.account).catch(() => 0n));
    if (!n) return [];
    const cap = Math.min(n, limit);
    try {
      const ids = [];
      for (let i = 0; i < cap; i += 8) {
        const batch = [];
        for (let j = i; j < Math.min(cap, i + 8); j += 1) {
          batch.push(this.nft.tokenOfOwnerByIndex(this.account, j));
        }
        ids.push(...(await Promise.all(batch)).map((id) => Number(id)));
      }
      return ids.sort((a, b) => a - b);
    } catch {
      return this.ownedIdsExplorer(cap);
    }
  }

  async ownedIdsExplorer(cap) {
    const url = `${EXPLORER}/api/v2/addresses/${this.account}/nft?type=ERC-721`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || [];
    const mine = [];
    for (const item of items) {
      const addr = String(item.token?.address_hash || item.token?.address || "").toLowerCase();
      if (addr !== ADDRESSES.nft.toLowerCase()) continue;
      const id = Number(item.id ?? item.token_id);
      if (Number.isFinite(id)) mine.push(id);
      if (mine.length >= cap) break;
    }
    return mine.sort((a, b) => a - b);
  }

  ipfsCid(url) {
    if (!url) return null;
    const text = String(url);
    const hit = text.match(/\/ipfs\/([^/?#]+)/i) || text.match(/^ipfs:\/\/([^/?#]+)/i);
    return hit ? hit[1] : null;
  }

  ipfsUrl(url) {
    const cid = this.ipfsCid(url);
    if (cid) return `https://ipfs.io/ipfs/${cid}`;
    if (!url || String(url).startsWith("ipfs://")) return null;
    return url;
  }

  isPreReveal(meta) {
    return /pre-reveal/i.test(String(meta?.name || ""));
  }

  remoteArt(meta, image) {
    if (this.isPreReveal(meta)) return null;
    return this.ipfsUrl(image);
  }

  parseVaultNfts(items) {
    const rows = [];
    for (const item of items || []) {
      const addr = String(item.token?.address_hash || item.token?.address || "").toLowerCase();
      if (addr && addr !== ADDRESSES.nft.toLowerCase()) continue;
      const id = Number(item.id ?? item.token_id);
      if (!Number.isFinite(id)) continue;
      rows.push({
        id,
        image: this.remoteArt(
          item.metadata,
          item.image_url || item.metadata?.image || item.media_url,
        ),
      });
    }
    return rows;
  }

  async vaultTokens(cursor) {
    let url = `${EXPLORER}/api/v2/addresses/${ADDRESSES.vault}/nft?type=ERC-721`;
    if (cursor) url = `${EXPLORER}/api/v2/addresses/${ADDRESSES.vault}/nft?${new URLSearchParams(cursor)}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rows = this.parseVaultNfts(data.items);
        if (rows.length) return { rows, next: data.next_page_params || null };
      }
    } catch {
      /* Fall through to a short on-chain walk. */
    }
    if (cursor) return { rows: [], next: null };
    return this.vaultTokensChain();
  }

  async vaultTokensChain(limit = 24) {
    try {
      let id = Number(await this.vault.oldestTokenId());
      const rows = [];
      const seen = new Set();
      while (id && rows.length < limit && !seen.has(id)) {
        seen.add(id);
        rows.push({ id, image: null });
        id = Number(await this.vault.getNextTokenId(id));
      }
      return { rows, next: null };
    } catch {
      return { rows: [], next: null };
    }
  }

  async tokenOwner(id) {
    try {
      const res = await fetch(`${EXPLORER}/api/v2/tokens/${ADDRESSES.nft}/instances/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.owner?.hash || data.owner?.address_hash || data.owner || null;
    } catch {
      return null;
    }
  }

  async tokenImage(id) {
    try {
      const res = await fetch(`${EXPLORER}/api/v2/tokens/${ADDRESSES.nft}/instances/${id}`);
      if (res.ok) {
        const data = await res.json();
        const image = this.remoteArt(
          data.metadata,
          data.image_url || data.metadata?.image || data.metadata?.image_url,
        );
        if (image) return image;
        if (this.isPreReveal(data.metadata)) return null;
      }
    } catch {
      /* Fall through to tokenURI. */
    }
    try {
      let uri = await this.nft.tokenURI(id);
      if (!uri) return null;
      uri = this.ipfsUrl(uri) || uri;
      let meta = null;
      let image = null;
      if (uri.startsWith("data:application/json")) {
        const raw = uri.split(",")[1] || "";
        meta = JSON.parse(atob(raw));
      } else {
        const res = await fetch(uri);
        if (!res.ok) return null;
        meta = await res.json();
      }
      image = meta?.image || meta?.image_url;
      return this.remoteArt(meta, image);
    } catch {
      return null;
    }
  }

  async loadHistory() {
    try {
      const pack = await this.fetchHistoryLogs(null);
      if (pack.rows.length) return pack;
    } catch {
      /* Fall through to provider logs. */
    }
    try {
      return { rows: await this.loadHistoryChain(), next: null };
    } catch {
      return { rows: [], next: null };
    }
  }

  parseHistoryLogs(items) {
    const rows = [];
    for (const item of items || []) {
      const name = String(item.decoded?.method_call || "").split("(")[0];
      if (name !== "NFTBought" && name !== "NFTSold") continue;
      const p = Object.fromEntries((item.decoded.parameters || []).map((x) => [x.name, x.value]));
      const specific = p.isSpecific === true || p.isSpecific === "true";
      rows.push({
        side: name === "NFTSold" ? "Sell" : specific ? "Snipe" : "Buy",
        tokenId: Number(p.tokenId),
        raid: name === "NFTSold" ? p.netPayout : p.totalCost,
        wallet: p.seller || p.buyer,
        hash: item.transaction_hash,
        time: item.block_timestamp,
        block: item.block_number,
      });
    }
    return rows;
  }

  async fetchHistoryLogs(cursor) {
    let url = `${EXPLORER}/api/v2/addresses/${ADDRESSES.vault}/logs`;
    if (cursor) url += `?${new URLSearchParams(cursor)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("History request failed.");
    const data = await res.json();
    return {
      rows: this.parseHistoryLogs(data.items),
      next: data.next_page_params || null,
    };
  }

  async loadHistoryExplorer() {
    return this.fetchHistoryLogs(null);
  }

  async loadHistoryChain() {
    const bought = await this.vault.queryFilter(this.vault.filters.NFTBought(), -4000);
    const sold = await this.vault.queryFilter(this.vault.filters.NFTSold(), -4000);
    const rows = [];
    for (const ev of bought) {
      rows.push({
        side: ev.args.isSpecific ? "Snipe" : "Buy",
        tokenId: Number(ev.args.tokenId),
        raid: ev.args.totalCost,
        wallet: ev.args.buyer,
        hash: ev.transactionHash,
        time: null,
        block: ev.blockNumber,
      });
    }
    for (const ev of sold) {
      rows.push({
        side: "Sell",
        tokenId: Number(ev.args.tokenId),
        raid: ev.args.netPayout,
        wallet: ev.args.seller,
        hash: ev.transactionHash,
        time: null,
        block: ev.blockNumber,
      });
    }
    rows.sort((a, b) => (b.block || 0) - (a.block || 0));
    const sliced = rows.slice(0, 32);
    const ids = [...new Set(sliced.map((row) => row.block).filter(Boolean))];
    const times = new Map();
    await Promise.all(
      ids.map(async (n) => {
        try {
          const block = await this.read.getBlock(n);
          if (block?.timestamp != null) {
            times.set(n, new Date(Number(block.timestamp) * 1000).toISOString());
          }
        } catch {
          /* Leave the row without a clock if the block read fails. */
        }
      }),
    );
    for (const row of sliced) {
      if (!row.time && times.has(row.block)) row.time = times.get(row.block);
    }
    return sliced;
  }
}

export function fmtRaid(wei) {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n)) return formatUnits(wei, 18);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function fmtEth(wei) {
  const n = Number(formatEther(wei));
  return `${n.toFixed(6)} ETH`;
}

export function fmtBps(bps) {
  return `${(Number(bps) / 100).toFixed(Number(bps) % 100 === 0 ? 0 : 1)}%`;
}

export function quoteSpecificCost(tokensPerNFT, specificBps, protocolBps = 50) {
  const tpn = typeof tokensPerNFT === "bigint" ? tokensPerNFT : BigInt(tokensPerNFT);
  const fee = (tpn * BigInt(specificBps)) / 10000n;
  const proto = (tpn * BigInt(protocolBps)) / 10000n;
  return tpn + fee + proto;
}

export function quoteLoanPayout(tokensPerNFT, apyBps) {
  const principal = typeof tokensPerNFT === "bigint" ? tokensPerNFT : BigInt(tokensPerNFT);
  const interest = (principal * BigInt(apyBps)) / 10000n;
  return { principal, interest, net: principal - interest };
}

export { formatEther, formatUnits, parseUnits, TIERS };
