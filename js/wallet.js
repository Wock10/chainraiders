import { AnvilMarket } from "./anvil.js";

export const anvil = new AnvilMarket();

let paintConnect = () => {};

export function refreshConnect() {
  paintConnect();
}

export function short(addr) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "-";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function bindConnect(hooks = {}) {
  const connect = document.getElementById("connect");
  let connecting = false;
  let tick = 0;

  function paint() {
    const on = Boolean(anvil.account);
    if (connect) {
      connect.textContent = on ? short(anvil.account) : "Connect wallet";
      connect.disabled = connecting || Boolean(hooks.busy?.());
    }
    hooks.onChrome?.(on);
  }

  async function onSession() {
    const n = ++tick;
    try {
      const accounts = window.ethereum
        ? await window.ethereum.request({ method: "eth_accounts" })
        : [];
      if (n !== tick) return;
      if (!accounts?.length) {
        anvil.dropAccount();
        paint();
        await hooks.onDisconnect?.();
        return;
      }
      await anvil.reconnect();
      if (n !== tick) return;
      paint();
      await hooks.onConnect?.({ source: "session" });
    } catch (err) {
      await hooks.onError?.(err);
    }
  }

  connect?.addEventListener("click", async () => {
    if (connecting || hooks.busy?.()) return;
    if (anvil.account) {
      paint();
      await hooks.onConnect?.({ source: "click" });
      return;
    }
    connecting = true;
    paint();
    try {
      await anvil.connect();
      paint();
      await hooks.onConnect?.({ source: "click" });
    } catch (err) {
      await hooks.onError?.(err);
    } finally {
      connecting = false;
      paint();
    }
  });

  window.addEventListener("anvil-session", () => {
    onSession();
  });
  onSession();

  paintConnect = paint;
  return { paint, onSession };
}
