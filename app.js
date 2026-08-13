(() => {
  const COUNT = 24;
  const INTERVAL_MS = 4000;

  const teaser = document.getElementById("teaser");
  const hero = document.getElementById("hero");
  const counter = document.getElementById("counter");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let timer = null;
  let paused = reduceMotion;

  function fileFor(i) {
    return `art/${String(i + 1).padStart(2, "0")}.png`;
  }

  function labelFor(i) {
    return `${String(i + 1).padStart(2, "0")} / ${String(COUNT).padStart(2, "0")}`;
  }

  function render() {
    teaser.src = fileFor(index);
    teaser.alt = `CHAINRAIDERS teaser ${labelFor(index)}`;
    counter.textContent = labelFor(index);
  }

  function go(delta) {
    index = (index + delta + COUNT) % COUNT;
    render();
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (paused || reduceMotion) return;
    timer = window.setInterval(() => go(1), INTERVAL_MS);
  }

  prev.addEventListener("click", () => {
    go(-1);
    startTimer();
  });
  next.addEventListener("click", () => {
    go(1);
    startTimer();
  });
  teaser.addEventListener("click", () => {
    go(1);
    startTimer();
  });

  hero.addEventListener("mouseenter", () => {
    paused = true;
    startTimer();
  });
  hero.addEventListener("mouseleave", () => {
    paused = reduceMotion;
    startTimer();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
      startTimer();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
      startTimer();
    }
  });

  for (let i = 0; i < COUNT; i += 1) {
    const preload = new Image();
    preload.src = fileFor(i);
  }

  render();
  startTimer();
})();
