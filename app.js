(() => {
  const COUNT = 48;
  const INTERVAL_MS = 4000;

  const teaser = document.getElementById("teaser");
  const hero = document.getElementById("hero");
  const counter = document.getElementById("counter");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const strip = document.getElementById("strip");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let timer = null;
  let paused = reduceMotion;
  const thumbs = [];

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
    thumbs.forEach((btn, i) => {
      btn.classList.toggle("is-on", i === index);
    });
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

  function jump(i) {
    index = i;
    render();
    startTimer();
  }

  for (let i = 0; i < COUNT; i += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", `Teaser ${labelFor(i)}`);
    const img = document.createElement("img");
    img.src = fileFor(i);
    img.width = 70;
    img.height = 70;
    img.alt = "";
    btn.appendChild(img);
    btn.addEventListener("click", () => jump(i));
    strip.appendChild(btn);
    thumbs.push(btn);
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

  render();
  startTimer();
})();
