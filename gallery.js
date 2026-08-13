(() => {
  const LAUNCHED = false;
  const TEASER_COUNT = 50;
  const CHUNK = 24;
  const LAYERS = ["DNA", "HEAD", "BODY", "FACE", "BG"];

  let catalog = null;
  let filtered = [];
  let shown = 0;
  let selected = 0;
  const picked = Object.fromEntries(LAYERS.map((layer) => [layer, new Set()]));
  const openLayer = { DNA: true, HEAD: false, BODY: false, FACE: false, BG: false };

  const $ = (id) => document.getElementById(id);

  function rng(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function code(rand) {
    const hex = "0123456789ABCDEF";
    let out = "";
    for (let i = 0; i < 4; i += 1) out += hex[(rand() * 16) | 0];
    return `${out.slice(0, 2)}-${out.slice(2)}`;
  }

  function teaserSrc(i) {
    return `art/${String((i % TEASER_COUNT) + 1).padStart(2, "0")}.png`;
  }

  // Preview only. Filter keys are random codes, not real traits.
  // Images are the public landing teasers. No ranks, tiers, or token IDs.
  function buildPreviewCatalog() {
    const rand = rng(0xC1A1);
    const values = {};
    for (const layer of LAYERS) {
      values[layer] = Array.from({ length: 8 }, () => code(rand));
    }

    const keepers = Array.from({ length: TEASER_COUNT }, (_, i) => {
      const attributes = {};
      for (const layer of LAYERS) {
        attributes[layer] = values[layer][i % values[layer].length];
      }
      return { src: teaserSrc(i), attributes };
    });

    const traits = {};
    for (const layer of LAYERS) {
      traits[layer] = values[layer].map((value) => ({ value }));
    }

    return { keepers, traits };
  }

  async function loadCatalog() {
    if (!LAUNCHED) return buildPreviewCatalog();
    const res = await fetch("raiders.json");
    if (!res.ok) throw new Error("catalog missing");
    return res.json();
  }

  function matchesPicked(k, skip) {
    for (const layer of LAYERS) {
      if (layer === skip) continue;
      const set = picked[layer];
      if (set.size && !set.has(k.attributes[layer])) return false;
    }
    return true;
  }

  function toggleVal(layer, value) {
    const set = picked[layer];
    if (set.has(value)) set.delete(value);
    else set.add(value);
    applyFilter();
  }

  function applyFilter() {
    filtered = catalog.keepers.filter((k) => matchesPicked(k, null));
    selected = 0;
    renderSidebar();
    render(true);
  }

  function renderSidebar() {
    const q = ($("tsearch").value || "").trim().toLowerCase();
    const chips = [];
    for (const layer of LAYERS) {
      for (const value of picked[layer]) {
        chips.push(
          `<button type="button" class="filter-chip" data-t="${layer}" data-v="${value}">${layer} ×</button>`
        );
      }
    }
    $("chips").innerHTML = chips.join("");
    $("chips").querySelectorAll("[data-t]").forEach((el) => {
      el.addEventListener("click", () => toggleVal(el.dataset.t, el.dataset.v));
    });

    $("layers").innerHTML = LAYERS.map((layer) => {
      const rows = (catalog.traits[layer] || []).filter(
        (r) => !q || layer.toLowerCase().includes(q)
      );
      const selectedN = picked[layer].size;
      const body = openLayer[layer]
        ? `<div class="vals">${rows
            .map((r) => {
              const on = picked[layer].has(r.value) ? "is-on" : "";
              return `<button type="button" class="val ${on}" data-t="${layer}" data-v="${r.value}">
                <span class="name secret" aria-hidden="true">········</span>
              </button>`;
            })
            .join("")}</div>`
        : "";
      return `<section class="layer">
        <button type="button" class="layer-h" data-layer="${layer}">${layer}${
        selectedN ? ` <span class="n">${selectedN}</span>` : ""
      }</button>
        ${body}
      </section>`;
    }).join("");

    $("layers").querySelectorAll(".layer-h").forEach((el) => {
      el.addEventListener("click", () => {
        openLayer[el.dataset.layer] = !openLayer[el.dataset.layer];
        renderSidebar();
      });
    });
    $("layers").querySelectorAll(".val[data-t]").forEach((el) => {
      el.addEventListener("click", () => toggleVal(el.dataset.t, el.dataset.v));
    });
  }

  function cardHtml(k, i) {
    const on = i === selected ? "is-on" : "";
    return `<article class="card ${on}" data-i="${i}">
      <img
        class="card-art"
        src="${k.src}"
        width="350"
        height="350"
        alt=""
        loading="lazy"
        decoding="async"
      />
    </article>`;
  }

  function bindNewCards(start) {
    $("grid").querySelectorAll(".card[data-i]").forEach((el) => {
      const i = Number(el.dataset.i);
      if (i < start) return;
      el.addEventListener("click", () => {
        selected = i;
        $("grid").querySelectorAll(".card.is-on").forEach((c) => c.classList.remove("is-on"));
        el.classList.add("is-on");
      });
    });
  }

  function appendMore() {
    if (shown >= filtered.length) return;
    const start = shown;
    const next = filtered.slice(shown, shown + CHUNK);
    $("grid").insertAdjacentHTML(
      "beforeend",
      next.map((k, i) => cardHtml(k, start + i)).join("")
    );
    shown += next.length;
    bindNewCards(start);
  }

  function render(reset) {
    if (reset) {
      shown = 0;
      $("grid").innerHTML = "";
      $("main").scrollTop = 0;
    }
    appendMore();
    $("status").textContent = LAUNCHED ? "Gallery" : "Preview";
  }

  $("tsearch").addEventListener("input", renderSidebar);
  $("clear").addEventListener("click", () => {
    for (const layer of LAYERS) picked[layer].clear();
    applyFilter();
  });
  $("main").addEventListener("scroll", () => {
    const el = $("main");
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 720) appendMore();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, button")) return;
    const cols = Math.max(1, Math.floor($("grid").clientWidth / 180));
    let next = selected;
    if (event.key === "ArrowRight") next = Math.min(filtered.length - 1, selected + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, selected - 1);
    else if (event.key === "ArrowDown") next = Math.min(filtered.length - 1, selected + cols);
    else if (event.key === "ArrowUp") next = Math.max(0, selected - cols);
    else return;
    event.preventDefault();
    selected = next;
    while (shown <= selected) appendMore();
    $("grid").querySelectorAll(".card.is-on").forEach((c) => c.classList.remove("is-on"));
    const el = $("grid").querySelector(`.card[data-i="${selected}"]`);
    if (el) {
      el.classList.add("is-on");
      el.scrollIntoView({ block: "nearest" });
    }
  });

  loadCatalog()
    .then((data) => {
      catalog = data;
      if (!LAUNCHED) {
        document.body.classList.add("is-sealed");
        $("lock-note").hidden = false;
      } else {
        document.body.classList.remove("is-sealed");
        $("lock-note").hidden = true;
      }
      applyFilter();
    })
    .catch(() => {
      $("status").textContent = "Gallery is closed";
    });
})();
