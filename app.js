(() => {
  const COUNT = 50;
  const INTERVAL_MS = 250;

  const teaser = document.getElementById("teaser");
  if (!teaser) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const files = Array.from({ length: COUNT }, (_, i) => `art/${String(i + 1).padStart(2, "0")}.png`);

  files.forEach((src) => {
    const img = new Image();
    img.src = src;
  });

  if (!reduceMotion) {
    let index = 0;
    window.setInterval(() => {
      index = (index + 1) % COUNT;
      teaser.src = files[index];
    }, INTERVAL_MS);
  }

  const anvilStat = document.getElementById("fact-anvil");
  if (anvilStat) {
    fetch("app/demo-state.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.inventorySize != null) {
          anvilStat.textContent = Number(data.inventorySize).toLocaleString();
        }
      })
      .catch(() => {});
  }
})();
