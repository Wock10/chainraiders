(() => {
  const COUNT = 50;
  const INTERVAL_MS = 1500;
  const FLASH_MS = 70;

  const teaser = document.getElementById("teaser");
  const plate = document.querySelector(".plate");
  const hero = document.getElementById("hero");
  const counter = document.getElementById("counter");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const toggle = document.getElementById("toggle");
  const strip = document.getElementById("strip");
  const up = document.getElementById("up");
  const down = document.getElementById("down");
  const led = document.getElementById("led");
  const desktop = window.matchMedia("(min-width: 748px)");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let timer = null;
  let hoverPaused = false;
  let userPaused = reduceMotion;
  let flashTimer = null;
  const thumbs = [];

  function fileFor(i) {
    return `art/${String(i + 1).padStart(2, "0")}.png`;
  }

  function labelFor(i) {
    return `${String(i + 1).padStart(2, "0")}/${String(COUNT).padStart(2, "0")}`;
  }

  function rowSize() {
    return desktop.matches ? 10 : 5;
  }

  function isPaused() {
    return hoverPaused || userPaused || reduceMotion;
  }

  function render() {
    teaser.src = fileFor(index);
    teaser.alt = `CHAINRAIDERS teaser ${labelFor(index)}`;
    counter.textContent = labelFor(index);
    toggle.textContent = "Start";
    toggle.classList.toggle("is-paused", userPaused);
    if (led) led.classList.toggle("is-off", userPaused);
    thumbs.forEach((btn, i) => {
      btn.classList.toggle("is-on", i === index);
    });
  }

  function show(nextIndex) {
    index = (nextIndex + COUNT) % COUNT;
    if (!reduceMotion) {
      plate.classList.add("is-flash");
      if (flashTimer !== null) window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => {
        plate.classList.remove("is-flash");
        flashTimer = null;
      }, FLASH_MS);
    }
    render();
  }

  function go(delta) {
    show(index + delta);
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (isPaused()) return;
    timer = window.setInterval(() => go(1), INTERVAL_MS);
  }

  function jump(i) {
    show(i);
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
  up.addEventListener("click", () => {
    go(-rowSize());
    startTimer();
  });
  down.addEventListener("click", () => {
    go(rowSize());
    startTimer();
  });
  teaser.addEventListener("click", () => {
    go(1);
    startTimer();
  });
  toggle.addEventListener("click", () => {
    userPaused = !userPaused;
    render();
    startTimer();
  });

  hero.addEventListener("mouseenter", () => {
    hoverPaused = true;
    startTimer();
  });
  hero.addEventListener("mouseleave", () => {
    hoverPaused = false;
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
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      go(rowSize());
      startTimer();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      go(-rowSize());
      startTimer();
    } else if (event.key === " ") {
      event.preventDefault();
      userPaused = !userPaused;
      render();
      startTimer();
    }
  });

  render();
  startTimer();
})();
