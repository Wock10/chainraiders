import { anvil } from "./wallet.js";

export async function paintLive() {
  const status = document.getElementById("feed-status");
  if (document.documentElement.classList.contains("is-gallery")) return;
  try {
    const data = await anvil.loadMarket();
    if (status) status.textContent = data.live ? "Live Anvil" : "Cached";
    const fact = document.getElementById("fact-anvil");
    if (fact && data.inventorySize != null) {
      fact.textContent = data.inventorySize.toLocaleString();
    }
  } catch {
    if (status) status.textContent = "Cached";
  }
}
