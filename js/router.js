const TABS = ["trade", "snipe", "stake", "loans", "pool"];

const META = {
  home: {
    title: "CHAINRAIDERS",
    description:
      "CHAINRAIDERS. 5,000 minted-out pixel raiders on Robinhood Chain. Active AMM pool. Royalties buy RAID.",
    robots: "index,follow",
  },
  market: {
    title: "Market · CHAINRAIDERS",
    description: "CHAINRAIDERS market. Buy, sell, snipe, stake, and borrow on the Anvil AMM.",
    robots: "index,follow",
  },
  gallery: {
    title: "Gallery · CHAINRAIDERS",
    description:
      "CHAINRAIDERS gallery. Filter all 5,000 raiders by DNA, head, body, face, background, the Anvil pool, and OpenSea listings.",
    robots: "noindex,nofollow",
  },
};

export { TABS };

export function dirPath() {
  return location.pathname.replace(/[^/]*$/, "");
}

export function pageUrl(file, hash = "") {
  const path = file ? `${dirPath()}${file}` : dirPath() || "./";
  return hash ? `${path}#${hash}` : path;
}

function pathFile() {
  return location.pathname.replace(/\/+$/, "").split("/").pop() || "";
}

function isGalleryPath(file) {
  return file === "gallery.html" || file === "gallery";
}

function isMarketPath(file) {
  return file === "app.html" || file === "app" || file === "market";
}

export function readRoute() {
  const file = pathFile();
  const hash = location.hash.replace(/^#/, "");
  if (isGalleryPath(file)) return { view: "gallery", hash, tab: "" };
  if (isMarketPath(file)) {
    const tab = TABS.includes(hash) ? hash : "trade";
    return { view: "market", hash, tab };
  }
  return { view: "home", hash: "", tab: "" };
}

export function routeUrl(view, { tab, hash } = {}) {
  if (view === "market") return pageUrl("market", tab && tab !== "trade" ? tab : "");
  if (view === "gallery") return pageUrl("gallery", hash || "");
  return pageUrl("");
}

function viewClass(view) {
  if (view === "market") return "is-app";
  if (view === "gallery") return "is-gallery";
  return "is-home";
}

export function applyChrome(view) {
  const html = document.documentElement;
  html.classList.remove("is-home", "is-app", "is-gallery");
  html.classList.add(viewClass(view));

  const meta = META[view];
  document.title = meta.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", meta.description);
  let robots = document.querySelector('meta[name="robots"]');
  if (meta.robots.includes("noindex")) {
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = meta.robots;
  } else if (robots) {
    robots.remove();
  }

  document.querySelectorAll("[data-view]").forEach((el) => {
    const on = el.dataset.view === (view === "market" ? "market" : view);
    el.inert = !on;
  });
  const desk = document.querySelector(".desk-bar");
  if (desk) desk.inert = view !== "market";

  document.querySelectorAll(".site-nav a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const on =
      (view === "home" && (href === "./" || href === "index.html" || href === "/")) ||
      (view === "market" && (href.startsWith("market") || href.startsWith("app.html"))) ||
      (view === "gallery" && (href.startsWith("gallery") || href.startsWith("gallery.html")));
    a.classList.toggle("is-on", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

export function isInternalHref(href) {
  let url;
  try {
    url = new URL(href, location.href);
  } catch {
    return false;
  }
  if (url.origin !== location.origin) return false;
  const file = url.pathname.replace(/\/+$/, "").split("/").pop() || "";
  if (url.pathname === dirPath() || url.pathname === `${dirPath()}index.html`) return true;
  return (
    file === "" ||
    file === "index.html" ||
    file === "app.html" ||
    file === "gallery.html" ||
    file === "market" ||
    file === "gallery" ||
    file === "app"
  );
}

export function routeFromHref(href) {
  const url = new URL(href, location.href);
  const file = url.pathname.replace(/\/+$/, "").split("/").pop() || "index.html";
  const hash = url.hash.replace(/^#/, "");
  if (isGalleryPath(file)) return { view: "gallery", hash, tab: "" };
  if (isMarketPath(file)) {
    const tab = TABS.includes(hash) ? hash : "trade";
    return { view: "market", hash, tab };
  }
  return { view: "home", hash: "", tab: "" };
}
