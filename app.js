(() => {
  const COUNT = 24;
  const INTERVAL_MS = 3000;

  const teaser = document.getElementById("teaser");
  const counter = document.getElementById("counter");
  const handheld = document.getElementById("handheld");
  const led = document.getElementById("led");
  const btnA = document.getElementById("btn-a");
  const btnB = document.getElementById("btn-b");
  const padLeft = document.getElementById("pad-left");
  const padRight = document.getElementById("pad-right");
  const btnSelect = document.getElementById("btn-select");
  const btnStart = document.getElementById("btn-start");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let timer = null;
  let userPaused = reduceMotion;
  let hoverPaused = false;

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
    handheld.classList.toggle("is-paused", userPaused || hoverPaused);
    if (led) led.classList.toggle("is-paused", userPaused);
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
    if (userPaused || hoverPaused || reduceMotion) return;
    timer = window.setInterval(() => go(1), INTERVAL_MS);
  }

  function pause() {
    userPaused = true;
    startTimer();
    render();
  }

  function play() {
    userPaused = false;
    startTimer();
    render();
  }

  function togglePause() {
    if (userPaused) play();
    else pause();
  }

  btnA.addEventListener("click", () => {
    go(1);
    pause();
  });
  btnB.addEventListener("click", () => {
    go(-1);
    pause();
  });
  padRight.addEventListener("click", () => {
    go(1);
    pause();
  });
  padLeft.addEventListener("click", () => {
    go(-1);
    pause();
  });
  btnSelect.addEventListener("click", pause);
  btnStart.addEventListener("click", play);

  handheld.addEventListener("mouseenter", () => {
    hoverPaused = true;
    startTimer();
    render();
  });
  handheld.addEventListener("mouseleave", () => {
    hoverPaused = false;
    startTimer();
    render();
  });
  teaser.addEventListener("click", togglePause);

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "a" || event.key === "A") {
      event.preventDefault();
      go(1);
      pause();
    } else if (event.key === "ArrowLeft" || event.key === "b" || event.key === "B") {
      event.preventDefault();
      go(-1);
      pause();
    } else if (event.key === " ") {
      event.preventDefault();
      togglePause();
    }
  });

  for (let i = 2; i <= COUNT; i += 1) {
    const preload = new Image();
    preload.src = fileFor(i - 1);
  }

  render();
  startTimer();
})();
