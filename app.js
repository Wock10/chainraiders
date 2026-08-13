(() => {
  const COUNT = 50;
  const INTERVAL_MS = 900;
  const FLASH_MS = 70;

  const teaser = document.getElementById("teaser");
  const plate = document.querySelector(".plate");
  const hero = document.getElementById("hero");
  const counter = document.getElementById("counter");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const strip = document.getElementById("strip");
  const led = document.getElementById("led");

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

  function isPaused() {
    return hoverPaused || userPaused || reduceMotion;
  }

  function render() {
    teaser.src = fileFor(index);
    teaser.alt = `CHAINRAIDERS teaser ${labelFor(index)}`;
    counter.textContent = labelFor(index);
    if (led) led.classList.toggle("is-off", isPaused());
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
  teaser.addEventListener("click", () => {
    go(1);
    startTimer();
  });

  hero.addEventListener("mouseenter", () => {
    hoverPaused = true;
    render();
    startTimer();
  });
  hero.addEventListener("mouseleave", () => {
    hoverPaused = false;
    render();
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
    } else if (event.key === " " && !event.target.closest("button, a")) {
      event.preventDefault();
      userPaused = !userPaused;
      render();
      startTimer();
    }
  });

  render();
  startTimer();
})();
