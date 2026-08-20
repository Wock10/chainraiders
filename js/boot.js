import { bindConnect } from "./wallet.js";
import { paintLive } from "./home.js";
import {
  startMarket,
  showTab,
  marketBusy,
  onMarketConnect,
  onMarketDisconnect,
  paintMarketChrome,
} from "./app.js";
import {
  startGallery,
  galleryBusy,
  onGalleryConnect,
  onGalleryDisconnect,
  paintGalleryChrome,
  syncGalleryView,
} from "../gallery.js";
import { applyChrome, isInternalHref, readRoute, routeFromHref, routeUrl } from "./router.js";

const started = { market: false, gallery: false };

async function apply(route) {
  applyChrome(route.view);
  if (route.view === "home") await paintLive();
  if (route.view === "market") {
    if (!started.market) {
      startMarket();
      started.market = true;
    }
    showTab(route.tab || "trade", false);
  }
  if (route.view === "gallery") {
    if (!started.gallery) {
      startGallery();
      started.gallery = true;
    }
    syncGalleryView();
  }
}

export function go(route, { replace = false } = {}) {
  const next = new URL(routeUrl(route.view, route), location.href);
  const same = next.pathname === location.pathname && next.hash === location.hash;
  if (!same) {
    if (replace) history.replaceState(route, "", next);
    else history.pushState(route, "", next);
  }
  return apply(route);
}

function boot() {
  const route = readRoute();
  applyChrome(route.view);
  history.replaceState(route, "", routeUrl(route.view, route));

  document.addEventListener("click", (event) => {
    const a = event.target.closest("a[href]");
    if (!a || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (a.target && a.target !== "_self") return;
    const href = a.getAttribute("href");
    if (!href || !isInternalHref(href)) return;
    event.preventDefault();
    go(routeFromHref(href));
  });

  window.addEventListener("popstate", () => {
    apply(readRoute());
  });

  bindConnect({
    busy: () => marketBusy() || galleryBusy(),
    onChrome() {
      paintMarketChrome();
      paintGalleryChrome();
    },
    async onConnect(e) {
      await paintLive();
      await onMarketConnect(e);
      await onGalleryConnect(e);
    },
    async onDisconnect() {
      await paintLive();
      await onMarketDisconnect();
      await onGalleryDisconnect();
    },
    onError(err) {
      onMarketConnect({ source: "error", err });
      onGalleryConnect({ source: "error", err });
    },
  });

  apply(route);
}

boot();
