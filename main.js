const BARS = " ▁▂▃▄▅▆▇█";
const SECRET = ["k", "i", "n", "d"]; // thanks kashvi, max, chris, shashi and prerna ma'am for teaching me what it means to be kind & strong.
const WAVE_COLS = 40;

const BASE = location.pathname.startsWith("/drumkit") ? "/drumkit/" : "";

// initially, this was just letters for my name i.e K A R T I K E Y. I can't be bothered to have audio for every key.... so we're re-using this
const SOUND_POOL = [
  "audio/k.wav",
  "audio/a.wav",
  "audio/i.wav",
  "audio/e.wav",
  "audio/r.wav",
  "audio/t.wav",
  "audio/k2.wav",
  "audio/y.wav",
  "audio/boom.wav",
].map((path) => BASE + path);

const QWERTY = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];

const SHIFT_CHARS = {
  "`": "~",
  1: "!",
  2: "@",
  3: "#",
  4: "$",
  5: "%",
  6: "^",
  7: "&",
  8: "*",
  9: "(",
  0: ")",
  "-": "_",
  "=": "+",
  "[": "{",
  "]": "}",
  "\\": "|",
  ";": ":",
  "'": '"',
  ",": "<",
  ".": ">",
  "/": "?",
};

const sounds = {};
let audioCtx;
let waveformEl;
let pads = [];
let padByKey = new Map();

let secretStep = 0;
let statusLine = "[space] record  [l] loop";

let isRecording = false;
let recordStart = 0;
let recording = [];

let isLooping = false;
let loopTimeout = null;

let activeAnalyser = null;
let waveRaf = null;
let idleTimer = null;
let shiftHeld = false;

function displayForKey(key, shifted = shiftHeld) {
  if (!shifted) return key;
  if (SHIFT_CHARS[key]) return SHIFT_CHARS[key];
  if (/[a-z]/.test(key)) return key.toUpperCase();
  return key;
}

function updateKeyboardLabels() {
  pads.forEach((pad) => {
    pad.textContent = displayForKey(pad.dataset.key);
  });
}

function setShiftHeld(held) {
  if (shiftHeld === held) return;
  shiftHeld = held;
  updateKeyboardLabels();
}

// we only have 9 sounds and every key needs to map to one of it
function soundForKey(key) {
  const index = key.charCodeAt(0) % SOUND_POOL.length; // SOUND_POOL.length = 9
  console.log(index);
  return SOUND_POOL[index];
}

function normalizeKey(key) {
  if (!key || key.length !== 1) return null;
  return /[a-zA-Z]/.test(key) ? key.toLowerCase() : key;
}

// otherwise the first few keystrokes will emit nothing
function preload(path) {
  if (sounds[path]) return;

  const audio = new Audio(path);
  audio.preload = "auto";

  const ctx = getCtx();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  source.connect(analyser);
  analyser.connect(ctx.destination);

  sounds[path] = { audio, analyser };
}

function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function renderBars(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const step = Math.max(1, Math.floor(data.length / WAVE_COLS));
  let line = "";

  for (let i = 0; i < WAVE_COLS; i++) {
    const v = data[i * step] / 255;
    const idx = Math.min(BARS.length - 1, Math.floor(v * (BARS.length - 1)));
    line += BARS[idx];
  }

  return line;
}

function updateWaveDisplay() {
  if (!waveformEl) return;

  const wave = activeAnalyser
    ? renderBars(activeAnalyser)
    : "▁".repeat(WAVE_COLS);

  waveformEl.textContent = `${wave}\n${statusLine}`;
}

function startWaveLoop(analyser) {
  activeAnalyser = analyser;
  clearTimeout(idleTimer);

  if (waveRaf) return;

  const tick = () => {
    updateWaveDisplay();
    waveRaf = requestAnimationFrame(tick);
  };
  waveRaf = requestAnimationFrame(tick);
}

function stopWaveLoopSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    activeAnalyser = null;
    if (waveRaf) {
      cancelAnimationFrame(waveRaf);
      waveRaf = null;
    }
    updateWaveDisplay();
  }, 350);
}

async function resumeCtx() {
  const ctx = getCtx();
  if (ctx.state === "suspended") await ctx.resume();
}

function playSound(path) {
  const entry = sounds[path];
  if (!entry) return;

  resumeCtx();
  entry.audio.currentTime = 0;
  entry.audio.play();
  startWaveLoop(entry.analyser);
  stopWaveLoopSoon();
}

function flashPad(element) {
  if (!element) return;
  element.classList.add("playing");
  setTimeout(() => element.classList.remove("playing"), 200);
}

function playDrumFill() {
  statusLine = "★ Kindness. I like you. <3 — drum fill! ★";
  updateWaveDisplay();

  SOUND_POOL.forEach((path, i) => {
    setTimeout(() => playSound(path), i * 70);
  });
  SOUND_POOL.forEach((path, i) => {
    setTimeout(() => playSound(path), 550 + i * 45);
  });

  setTimeout(() => {
    statusLine = isRecording
      ? `● REC — ${recording.length} hits`
      : isLooping
        ? "↻ looping"
        : "[space] record  [l] loop";
    updateWaveDisplay();
  }, 1400);
}

function checkSecret(key) {
  const c = normalizeKey(key);
  if (!c) return;

  if (c === SECRET[secretStep]) {
    secretStep += 1;
    if (secretStep === SECRET.length) {
      secretStep = 0;
      playDrumFill();
    }
    return;
  }

  secretStep = c === SECRET[0] ? 1 : 0;
}

function recordHit(path) {
  if (!isRecording) return;
  recording.push({ path, at: performance.now() - recordStart });
  statusLine = `● REC — ${recording.length} hits`;
  updateWaveDisplay();
}

function triggerKey(rawKey) {
  const key = normalizeKey(rawKey);
  if (!key) return;

  const path = soundForKey(key);
  preload(path);
  playSound(path);
  checkSecret(key);
  recordHit(path);

  const pad = padByKey.get(key);
  flashPad(pad);
}

function play(event) {
  const key = event.target.dataset.key;
  if (!key) return;
  const shifted = event.shiftKey || shiftHeld;
  triggerKey(displayForKey(key, shifted));
}

function buildKeyboard() {
  const container = document.getElementById("keyboard");
  if (!container) return;

  QWERTY.forEach((row) => {
    const ul = document.createElement("ul");
    row.forEach((key) => {
      const li = document.createElement("li");
      li.dataset.key = key;
      li.dataset.sound = soundForKey(key);
      li.textContent = key;
      li.addEventListener("click", play);
      ul.appendChild(li);
      padByKey.set(key, li);
    });
    container.appendChild(ul);
  });

  pads = [...container.querySelectorAll("li[data-key]")];
}

function stopLoop() {
  isLooping = false;
  clearTimeout(loopTimeout);
  loopTimeout = null;
  statusLine = recording.length
    ? `✓ ${recording.length} hits — [l] loop`
    : "[space] record  [l] loop  spell";
  updateWaveDisplay();
}

function playRecordingOnce() {
  if (!recording.length) return;

  recording.forEach(({ path, at }) => {
    setTimeout(() => playSound(path), at);
  });

  const end = recording[recording.length - 1].at + 400;
  loopTimeout = setTimeout(() => {
    if (isLooping) playRecordingOnce();
    else stopLoop();
  }, end);
}

function toggleLoop() {
  if (isLooping) {
    stopLoop();
    return;
  }

  if (!recording.length) {
    statusLine = "record something first (space)";
    updateWaveDisplay();
    return;
  }

  isLooping = true;
  statusLine = "↻ looping";
  updateWaveDisplay();
  playRecordingOnce();
}

function toggleRecord() {
  if (isLooping) stopLoop();

  if (!isRecording) {
    isRecording = true;
    recording = [];
    recordStart = performance.now();
    statusLine = "● REC — 0 hits";
    updateWaveDisplay();
    return;
  }

  isRecording = false;
  statusLine = recording.length
    ? `✓ ${recording.length} hits — [l] loop`
    : "empty take — [space] to rec again";
  updateWaveDisplay();
}

function keyDown(e) {
  if (e.key === "Shift") {
    setShiftHeld(true);
    return;
  }

  if (e.repeat) return;

  if (e.code === "Space") {
    e.preventDefault();
    toggleRecord();
    return;
  }

  if (e.key.toLowerCase() === "l" && !e.shiftKey) {
    toggleLoop();
    return;
  }

  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.length !== 1) return;

  if (e.shiftKey) setShiftHeld(true);
  triggerKey(e.key);
}

function keyUp(e) {
  if (e.key === "Shift") setShiftHeld(false);
}

document.addEventListener("DOMContentLoaded", () => {
  waveformEl = document.getElementById("ascii-wave");
  buildKeyboard();

  const paths = new Set(SOUND_POOL);
  pads.forEach((el) => paths.add(el.dataset.sound));
  paths.forEach(preload);

  updateWaveDisplay();
});

window.addEventListener("keydown", keyDown);
window.addEventListener("keyup", keyUp);
window.addEventListener("blur", () => setShiftHeld(false));
