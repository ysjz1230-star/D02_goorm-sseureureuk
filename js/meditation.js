// 가이드 명상: 단회 목록·필터, 7일 코스, 플레이어
import { $, $$, esc, icon, fmtTime, toast, onEscape, TOPICS } from "./ui.js";
import { getSettings, setSettings } from "./storage.js";
import { getProgress, recordMeditation, savePosition, restartCourse, courseState } from "./progress.js";
import { startAmbient, stopAmbient } from "./audio.js";
import { keepAwake, releaseAwake, prefersReducedMotion } from "./device.js";
import { isOnline, isCached } from "./offline.js";

let sessions = [];
let tab = "single";
const filters = { topic: "all", minutes: "all" };

export async function loadSessions() {
  if (sessions.length) return sessions;
  const res = await fetch("/data/sessions.json");
  if (!res.ok) throw new Error("sessions " + res.status);
  const list = await res.json();
  sessions = list.filter((s) => s && s.id && s.title && s.audio && Number.isFinite(s.minutes));
  return sessions;
}

export const getSessions = () => sessions;
export const setTab = (t) => (tab = t === "course" ? "course" : "single");

// 오늘의 추천: 코스에서 다음에 할 차례, 코스를 끝냈다면 날짜로 돌려 가며
export function recommended() {
  if (!sessions.length) return null;
  const next = courseState(sessions).find((c) => c.state === "open");
  if (next) return next.session;
  const day = Math.floor(Date.now() / 86400000);
  return sessions[day % sessions.length];
}

// ---------------------------------------------------------------- 목록 화면
export async function renderMeditate(root) {
  root.innerHTML = head() + `<div class="card skeleton"></div><div class="card skeleton"></div><div class="card skeleton"></div>`;
  try {
    await loadSessions();
  } catch {
    root.innerHTML = head() + `<div class="state"><p>목록을 불러오지 못했어요.</p><button class="btn" id="m-retry">다시 시도</button></div>`;
    $("#m-retry", root).onclick = () => renderMeditate(root);
    return;
  }
  const cached = new Set((await Promise.all(sessions.map(async (s) => ((await isCached(s.audio)) ? s.id : null)))).filter(Boolean));

  root.innerHTML = `${head()}
    <div class="tabs" role="tablist" aria-label="명상 종류">
      <button role="tab" id="tab-single" aria-selected="${tab === "single"}" aria-controls="m-panel">단회</button>
      <button role="tab" id="tab-course" aria-selected="${tab === "course"}" aria-controls="m-panel">7일 코스</button>
    </div>
    <div id="m-panel" role="tabpanel"></div>`;

  const panel = $("#m-panel", root);
  const draw = () => (tab === "single" ? drawSingle(panel, cached) : drawCourse(panel, cached, draw));
  $$("[role=tab]", root).forEach((b) => (b.onclick = () => {
    tab = b.id === "tab-course" ? "course" : "single";
    $$("[role=tab]", root).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    draw();
  }));
  draw();
}

const head = () => `<header class="page-head"><h1>명상</h1><p class="muted">3분이면 충분해요. 마음 가는 대로 골라 보세요.</p></header>`;

function statusBadges(s, p, cached) {
  const done = (p.completedSessions[s.id] || []).length > 0;
  return `<span class="status">
    ${done ? `<span class="pill ok">${icon("i-check")}완료</span>` : ""}
    ${cached.has(s.id) ? `<span class="pill">${icon("i-cloud-check")}오프라인 가능</span>` : `<span class="pill warn">${icon("i-cloud-down")}저장 필요</span>`}
  </span>`;
}

function cardHtml(s, p, cached, extra = "") {
  const t = TOPICS[s.topic] || TOPICS.focus;
  return `<button class="session-card" data-id="${esc(s.id)}" ${extra}>
    <span class="tile">${icon(t.icon)}</span>
    <span class="session-body"><b>${esc(s.title)}</b><small>${t.label} · ${s.minutes}분</small>${statusBadges(s, p, cached)}</span>
    ${icon("i-chevron", "chev")}
  </button>`;
}

function drawSingle(panel, cached) {
  const p = getProgress();
  const topics = [["all", "전체"], ...Object.entries(TOPICS).map(([k, v]) => [k, v.label])];
  const mins = [["all", "전체"], ["3", "3분"], ["5", "5분"], ["10", "10분"], ["20", "20분"]];
  panel.innerHTML = `
    <div class="chips scroll" role="radiogroup" aria-label="주제">
      ${topics.map(([k, l]) => `<button class="chip" role="radio" data-topic="${k}" aria-checked="${filters.topic === k}">${l}</button>`).join("")}
    </div>
    <div class="chips scroll" role="radiogroup" aria-label="길이">
      ${mins.map(([k, l]) => k === "20"
        ? `<button class="chip" role="radio" aria-checked="false" disabled aria-disabled="true">${l}<small>준비 중</small></button>`
        : `<button class="chip" role="radio" data-min="${k}" aria-checked="${filters.minutes === k}">${l}</button>`).join("")}
    </div>
    <div id="m-list" class="stack"></div>`;
  const list = $("#m-list", panel);
  const render = () => {
    const rows = sessions.filter((s) => (filters.topic === "all" || s.topic === filters.topic) && (filters.minutes === "all" || String(s.minutes) === filters.minutes));
    list.innerHTML = rows.length
      ? rows.map((s) => cardHtml(s, p, cached)).join("")
      : `<div class="state"><p>조건에 맞는 명상이 아직 없어요.</p><button class="btn" id="m-reset">필터 초기화</button></div>`;
    $$(".session-card", list).forEach((b) => (b.onclick = () => openPlayer(b.dataset.id)));
    const r = $("#m-reset", list);
    if (r) r.onclick = () => {
      filters.topic = filters.minutes = "all";
      drawSingle(panel, cached);
    };
  };
  $$("[data-topic]", panel).forEach((b) => (b.onclick = () => {
    filters.topic = b.dataset.topic;
    $$("[data-topic]", panel).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    render();
  }));
  $$("[data-min]", panel).forEach((b) => (b.onclick = () => {
    filters.minutes = b.dataset.min;
    $$("[data-min]", panel).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    render();
  }));
  render();
}

function drawCourse(panel, cached, redraw) {
  const p = getProgress();
  const days = courseState(sessions, p);
  const done = days.filter((d) => d.state === "done").length;
  const total = days.length;
  panel.innerHTML = `
    <div class="card course-head">
      <div class="row between"><b>7일 입문 코스</b><span class="muted" aria-label="진행률">${done} / ${total}</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${(done / total) * 100}%"></span></div>
    </div>
    ${done === total && total > 0 ? `<div class="card celebrate"><h2>7일 코스를 마쳤어요 🎉</h2><p class="muted">스스로에게 시간을 내어 준 것만으로 큰 걸음이에요.</p><button class="btn" id="c-restart">처음부터 다시</button></div>` : ""}
    <div class="stack">
      ${days.map(({ session: s, state }) => `
        <button class="session-card day ${state}" data-id="${esc(s.id)}" data-state="${state}" ${state === "locked" ? 'aria-disabled="true"' : ""}>
          <span class="day-no">Day<br><b>${s.courseDay}</b></span>
          <span class="session-body"><b>${esc(s.title)}</b><small>${(TOPICS[s.topic] || {}).label || ""} · ${s.minutes}분</small>
            <span class="status">${state === "done" ? `<span class="pill ok">${icon("i-check")}완료</span>` : state === "locked" ? `<span class="pill">${icon("i-lock")}잠김</span>` : `<span class="pill accent">진행 가능</span>`}
            ${state !== "locked" ? (cached.has(s.id) ? `<span class="pill">${icon("i-cloud-check")}오프라인 가능</span>` : `<span class="pill warn">${icon("i-cloud-down")}저장 필요</span>`) : ""}</span></span>
          ${icon(state === "locked" ? "i-lock" : "i-chevron", "chev")}
        </button>`).join("")}
    </div>`;
  $$(".session-card", panel).forEach((b) => (b.onclick = () => {
    if (b.dataset.state === "locked") {
      const day = days.findIndex((d) => d.session.id === b.dataset.id);
      return toast(`Day ${day}을(를) 먼저 완료하면 열려요`);
    }
    openPlayer(b.dataset.id);
  }));
  const r = $("#c-restart", panel);
  if (r) r.onclick = () => {
    restartCourse();
    toast("코스를 처음부터 시작해요. 기록은 그대로 남아 있어요");
    redraw();
  };
}

// ---------------------------------------------------------------- 플레이어
let pl = null;

export async function openPlayer(id) {
  if (pl) return;
  try {
    await loadSessions();
  } catch {
    return toast("명상 목록을 불러오지 못했어요");
  }
  const s = sessions.find((x) => x.id === id);
  if (!s) return;

  const el = $("#player");
  const cached = await isCached(s.audio);
  const t = TOPICS[s.topic] || TOPICS.focus;
  const resume = getProgress().lastPosition[s.id] || 0;
  const audio = new Audio();
  audio.preload = "metadata";
  pl = { s, el, audio, counted: false, seeking: false, savedAt: 0, ambOn: getSettings().bgSound, blocked: !isOnline() && !cached, restoreFocus: document.activeElement, offEsc: null, duration: s.minutes * 60, resume };

  $("#pl-title", el).textContent = s.title;
  $("#pl-topic", el).innerHTML = `${icon(t.icon)}${t.label} · ${s.minutes}분`;
  $("#pl-img", el).style.backgroundImage = `url(${s.bgImage})`;
  setNote("");
  setPlayIcon(false);
  updateTimes(0);
  updateAmbButton();

  // 배경 영상: 동작 줄이기 설정이거나 영상이 없으면 대체 이미지만 보여 준다
  const video = $("#pl-video", el);
  video.hidden = true;
  video.onerror = () => (video.hidden = true);
  if (!prefersReducedMotion() && s.bgVideo) {
    video.poster = s.bgImage;
    video.muted = true;
    video.src = s.bgVideo;
    video.onplaying = () => (video.hidden = false);
  }

  const play = $("#pl-play", el);
  play.disabled = pl.blocked;
  if (pl.blocked) setNote("인터넷에 연결한 뒤 '오프라인 준비'에서 저장해 주세요", true);
  else if (resume > 5) setNote(`${fmtTime(resume)}부터 이어 들어요`);

  audio.addEventListener("loadedmetadata", () => {
    if (!pl || pl.audio !== audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) pl.duration = audio.duration;
    if (pl.resume > 0 && pl.resume < pl.duration - 2) audio.currentTime = pl.resume;
    pl.resume = 0;
    $("#pl-seek", el).max = String(Math.floor(pl.duration));
    updateTimes(audio.currentTime);
  });
  audio.addEventListener("timeupdate", onTime);
  audio.addEventListener("waiting", () => el.classList.add("loading"));
  audio.addEventListener("playing", () => {
    el.classList.remove("loading");
    setNote("");
  });
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("error", () => {
    if (!pl || pl.audio !== audio) return; // 닫은 뒤 늦게 오는 이벤트 무시
    el.classList.remove("loading");
    setPlayIcon(false);
    setNote(isOnline() ? "음성 파일을 재생할 수 없어요. 잠시 뒤 다시 시도해 주세요" : "인터넷에 연결한 뒤 '오프라인 준비'에서 저장해 주세요", true);
  });
  if (!pl.blocked) audio.src = s.audio;

  $("#pl-play", el).onclick = togglePlay;
  $("#pl-back", el).onclick = () => skip(-15);
  $("#pl-fwd", el).onclick = () => skip(15);
  $("#pl-close", el).onclick = closePlayer;
  $("#pl-amb", el).onclick = toggleAmb;
  const seek = $("#pl-seek", el);
  seek.max = String(pl.duration);
  seek.value = "0";
  seek.oninput = () => {
    pl.seeking = true;
    updateTimes(Number(seek.value));
  };
  seek.onchange = () => {
    if (pl) {
      audio.currentTime = Number(seek.value);
      pl.seeking = false;
    }
  };
  pl.offEsc = onEscape(closePlayer);

  el.hidden = false;
  document.body.classList.add("noscroll");
  (pl.blocked ? $("#pl-close", el) : play).focus();
}

function setNote(msg, warn = false) {
  const n = $("#pl-note");
  n.textContent = msg;
  n.hidden = !msg;
  n.classList.toggle("warn", warn);
}

function setPlayIcon(playing) {
  const b = $("#pl-play");
  b.innerHTML = icon(playing ? "i-pause" : "i-play");
  b.setAttribute("aria-label", playing ? "일시정지" : "재생");
}

function updateTimes(cur) {
  const dur = pl?.duration || 0;
  $("#pl-cur").textContent = fmtTime(cur);
  $("#pl-left").textContent = "-" + fmtTime(dur - cur);
  const seek = $("#pl-seek");
  if (!pl?.seeking) seek.value = String(Math.floor(cur));
  seek.style.setProperty("--pct", dur ? ((cur / dur) * 100).toFixed(1) + "%" : "0%");
}

function updateAmbButton() {
  const b = $("#pl-amb");
  b.setAttribute("aria-pressed", String(pl.ambOn));
  b.classList.toggle("on", pl.ambOn);
}

async function syncAmbient() {
  if (!pl) return;
  if (pl.ambOn && !pl.audio.paused) {
    const ok = await startAmbient(getSettings().ambient, 0.2);
    if (!ok && !isOnline()) toast("배경 소리를 저장하지 않아서 오프라인에서는 켤 수 없어요");
  } else stopAmbient();
}

function toggleAmb() {
  pl.ambOn = !pl.ambOn;
  setSettings({ bgSound: pl.ambOn });
  updateAmbButton();
  syncAmbient();
}

function togglePlay() {
  const a = pl.audio;
  if (a.paused) {
    el_loading(true);
    a.play().then(() => {
      setPlayIcon(true);
      keepAwake();
      $("#pl-video").play?.().catch(() => {});
      syncAmbient();
    }).catch(() => {
      el_loading(false);
      setNote("재생할 수 없어요. 다시 한 번 눌러 주세요", true);
    });
  } else {
    a.pause();
    setPlayIcon(false);
    releaseAwake();
    stopAmbient();
    persistPosition();
  }
}

function el_loading(on) {
  pl.el.classList.toggle("loading", on);
}

function skip(sec) {
  const a = pl.audio;
  a.currentTime = Math.min(Math.max(0, a.currentTime + sec), Math.max(0, pl.duration - 0.5));
  updateTimes(a.currentTime);
}

function onTime() {
  if (!pl) return;
  const a = pl.audio;
  el_loading(false);
  updateTimes(a.currentTime);
  if (!pl.counted && pl.duration > 0 && a.currentTime / pl.duration >= 0.8) complete();
  if (!pl.counted && Date.now() - pl.savedAt > 3000) persistPosition();
}

function persistPosition() {
  if (!pl) return;
  pl.savedAt = Date.now();
  savePosition(pl.s.id, pl.counted ? 0 : pl.audio.currentTime);
}

// 80% 이상 재생하면 완료
function complete() {
  if (!pl || pl.counted) return;
  pl.counted = true;
  const course = recordMeditation(pl.s, sessions);
  toast(course ? `Day ${pl.s.courseDay} 완료! 🎉` : "완료로 기록됐어요 ✓");
}

function onEnded() {
  if (!pl) return;
  complete();
  setPlayIcon(false);
  releaseAwake();
  stopAmbient();
  pl.audio.currentTime = 0;
  updateTimes(0);
  setNote("수고하셨어요. 천천히 눈을 뜨고 주변을 둘러보세요");
}

function closePlayer() {
  if (!pl) return;
  const p = pl;
  persistPosition();
  pl = null;
  p.offEsc?.();
  p.audio.pause();
  p.audio.removeAttribute("src");
  p.audio.load();
  const video = $("#pl-video", p.el);
  video.pause();
  video.removeAttribute("src");
  video.load();
  stopAmbient();
  releaseAwake();
  p.el.hidden = true;
  p.el.classList.remove("loading");
  document.body.classList.remove("noscroll");
  p.restoreFocus?.focus?.();
}
