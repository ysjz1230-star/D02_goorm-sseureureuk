// 호흡 운동: 설정 화면 + 전체 화면 세션(원 애니메이션)
import { $, $$, esc, icon, fmtTime, toast, onEscape } from "./ui.js";
import { getSettings, setSettings } from "./storage.js";
import { recordBreathing } from "./progress.js";
import { playCue, preloadCues, startAmbient, stopAmbient, AMBIENT } from "./audio.js";
import { keepAwake, releaseAwake, vibrate, canVibrate, prefersReducedMotion } from "./device.js";
import { isOnline } from "./offline.js";

const PHASE_TEXT = { inhale: "들이쉬세요", hold: "멈추세요", exhale: "내쉬세요" };
const LENGTHS = [1, 3, 5, 10];
const RING_LEN = 2 * Math.PI * 94;

let presets = [];
let selected = "coherent";

async function loadPresets() {
  if (presets.length) return presets;
  const res = await fetch("/data/breathing-presets.json");
  if (!res.ok) throw new Error("presets " + res.status);
  const list = await res.json();
  presets = list.filter((p) => ["inhale", "hold1", "exhale", "hold2"].every((k) => Number.isFinite(p[k]) && p[k] >= 0) && p.inhale > 0);
  return presets;
}

export const patternText = (p) => [p.inhale, p.hold1, p.exhale, p.hold2].filter(Boolean).join("-");

function buildPhases(p) {
  const raw = [["inhale", p.inhale], ["hold", p.hold1], ["exhale", p.exhale], ["hold", p.hold2]].filter((x) => x[1] > 0);
  return raw.map(([kind, dur], i) => {
    // 멈춤 구간의 원 크기: 들숨 뒤면 최대, 날숨 뒤면 최소
    const prev = raw[i - 1]?.[0];
    const level = prev === "inhale" ? 1 : 0;
    return { kind, dur, from: kind === "inhale" ? 0 : kind === "exhale" ? 1 : level, to: kind === "inhale" ? 1 : kind === "exhale" ? 0 : level };
  });
}

// 선택 시간을 넘기지 않는 가장 큰 정수 주기 (최소 1회)
export function planSession(p, minutes) {
  const phases = buildPhases(p);
  const cycle = phases.reduce((s, x) => s + x.dur, 0);
  const cycles = Math.max(1, Math.floor((minutes * 60) / cycle));
  return { phases, cycle, cycles, total: cycles * cycle };
}

// ---------------------------------------------------------------- 설정 화면
export async function renderBreathe(root) {
  try {
    await loadPresets();
  } catch {
    root.innerHTML = `<div class="state"><p>호흡 목록을 불러오지 못했어요.</p><button class="btn" id="b-retry">다시 시도</button></div>`;
    $("#b-retry", root).onclick = () => renderBreathe(root);
    return;
  }
  const s = getSettings();
  const visible = presets.filter((p) => !p.hidden);
  if (!visible.some((p) => p.id === selected)) selected = visible[0].id;

  root.innerHTML = `
    <header class="page-head"><h1>호흡</h1><p class="muted">원이 커지면 들이쉬고, 작아지면 내쉬어요.</p></header>

    <section aria-labelledby="h-pat">
      <h2 class="sec-title" id="h-pat">호흡 방법</h2>
      <div class="preset-list" role="radiogroup" aria-labelledby="h-pat">
        ${visible.map((p) => `
          <button class="preset" role="radio" aria-checked="${p.id === selected}" data-id="${esc(p.id)}">
            <span class="tile">${icon("i-wind")}</span>
            <span class="preset-body">
              <b>${esc(p.name)}${p.recommended ? ' <span class="badge">추천</span>' : ""}</b>
              <small>${patternText(p)}초 · ${esc(p.desc || "")}</small>
            </span>
          </button>`).join("")}
      </div>
    </section>

    <section aria-labelledby="h-len">
      <h2 class="sec-title" id="h-len">시간</h2>
      <div class="chips" role="radiogroup" aria-labelledby="h-len">
        ${LENGTHS.map((m) => `<button class="chip" role="radio" aria-checked="${m === s.breathMinutes}" data-min="${m}">${m}분</button>`).join("")}
      </div>
      <p class="muted small" id="b-plan"></p>
    </section>

    <section aria-labelledby="h-opt">
      <h2 class="sec-title" id="h-opt">안내</h2>
      <div class="card list">
        ${toggleRow("sound", "소리 안내", "단계가 바뀔 때 부드러운 종소리", s.sound)}
        ${canVibrate ? toggleRow("vibrate", "진동 안내", "단계가 바뀔 때 짧게 진동", s.vibrate) : ""}
        ${toggleRow("bgSound", "배경 소리", "선택한 소리를 낮게 반복", s.bgSound)}
      </div>
      <div class="ambient-grid" id="b-amb" ${s.bgSound ? "" : "hidden"} role="radiogroup" aria-label="배경 소리 선택">
        ${AMBIENT.map((a) => `
          <button class="amb" role="radio" aria-checked="${a.id === s.ambient}" data-id="${a.id}">
            <span class="tile">${icon(a.icon)}</span><span>${a.label}</span>
          </button>`).join("")}
      </div>
    </section>

    <button class="btn primary big" id="b-start">시작하기</button>
    <p class="tiny center">어지럽거나 불편하면 멈추고 편하게 호흡하세요.</p>`;

  const refreshPlan = () => {
    const p = presets.find((x) => x.id === selected);
    const plan = planSession(p, getSettings().breathMinutes);
    $("#b-plan", root).textContent = `1회 ${plan.cycle}초 · ${plan.cycles}회 반복 · 약 ${fmtTime(plan.total)}`;
  };
  refreshPlan();

  $$(".preset", root).forEach((b) => (b.onclick = () => {
    selected = b.dataset.id;
    $$(".preset", root).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    refreshPlan();
  }));
  $$("[data-min]", root).forEach((b) => (b.onclick = () => {
    setSettings({ breathMinutes: Number(b.dataset.min) });
    $$("[data-min]", root).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    refreshPlan();
  }));
  $$(".switch", root).forEach((b) => (b.onclick = () => {
    const on = b.getAttribute("aria-checked") !== "true";
    b.setAttribute("aria-checked", String(on));
    setSettings({ [b.dataset.key]: on });
    if (b.dataset.key === "bgSound") $("#b-amb", root).hidden = !on;
  }));
  $$(".amb", root).forEach((b) => (b.onclick = () => {
    setSettings({ ambient: b.dataset.id });
    $$(".amb", root).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  }));
  $("#b-start", root).onclick = () => {
    const p = presets.find((x) => x.id === selected);
    const go = () => startSession(p, getSettings().breathMinutes);
    if (getSettings().safetySeen) return go();
    const dlg = $("#safety");
    dlg.returnValue = "";
    dlg.onclose = () => {
      if (dlg.returnValue === "ok") {
        setSettings({ safetySeen: true });
        go();
      }
    };
    dlg.showModal();
  };
}

function toggleRow(key, title, sub, on) {
  return `<div class="row-item">
    <div><b>${title}</b><small>${sub}</small></div>
    <button class="switch" role="switch" aria-checked="${on}" aria-label="${title}" data-key="${key}"><span></span></button>
  </div>`;
}

// ---------------------------------------------------------------- 세션
let run = null;

export async function startSessionById(id, minutes, opts) {
  const list = await loadPresets();
  const p = list.find((x) => x.id === id);
  if (p) startSession(p, minutes, opts);
}

export function startSession(preset, minutes, opts = {}) {
  if (run) return;
  const el = $("#breath-session");
  const settings = getSettings();
  const plan = planSession(preset, minutes);
  const restoreFocus = document.activeElement;

  run = { ...plan, preset, opts, settings, base: 0, elapsed: 0, t0: 0, raf: 0, paused: false, lastKey: -1, offEsc: null, el, restoreFocus };
  el.classList.toggle("reduced", prefersReducedMotion());
  el.classList.remove("is-done", "is-paused");
  $("#bs-done", el).hidden = true;
  $("#bs-title", el).textContent = opts.sos ? "SOS 진정 호흡" : preset.name;
  $("#bs-pause", el).textContent = "일시정지";
  $("#bs-ring", el).style.strokeDasharray = RING_LEN;
  el.hidden = false;
  document.body.classList.add("noscroll");

  preloadCues();
  keepAwake();
  if (settings.bgSound) ambientWithHint(settings.ambient);

  $("#bs-pause", el).onclick = togglePause;
  $("#bs-stop", el).onclick = closeSession;
  $("#bs-close", el).onclick = closeSession;
  $("#bs-ok", el).onclick = closeSession;
  $("#bs-more", el).onclick = () => {
    closeSession();
    location.hash = "#/meditate";
  };
  $("#bs-more", el).hidden = !opts.sos;
  run.offEsc = onEscape(closeSession);

  run.t0 = performance.now();
  $("#bs-pause", el).focus();
  frame(run.t0);
}

async function ambientWithHint(id) {
  const ok = await startAmbient(id, 0.28);
  if (!ok && !isOnline()) toast("배경 소리를 저장하지 않아서 오프라인에서는 켤 수 없어요");
}

function frame(now) {
  const r = run;
  if (!r || r.paused) return;
  r.elapsed = r.base + (now - r.t0);
  if (r.elapsed >= r.total * 1000) return finish();
  paint(r);
  r.raf = requestAnimationFrame(frame);
}

function paint(r) {
  const sec = r.elapsed / 1000;
  const ci = Math.floor(sec / r.cycle);
  let t = sec - ci * r.cycle;
  let idx = 0;
  while (idx < r.phases.length - 1 && t >= r.phases[idx].dur) {
    t -= r.phases[idx].dur;
    idx++;
  }
  const ph = r.phases[idx];
  const p = Math.min(Math.max(t / ph.dur, 0), 1);
  const eased = (1 - Math.cos(Math.PI * p)) / 2; // 부드러운 가감속
  const level = ph.from + (ph.to - ph.from) * eased;

  const el = r.el;
  const key = ci * 10 + idx;
  if (key !== r.lastKey) {
    r.lastKey = key;
    $("#bs-phase", el).textContent = PHASE_TEXT[ph.kind];
    el.dataset.phase = ph.kind;
    if (r.settings.sound) playCue(ph.kind);
    if (r.settings.vibrate) vibrate(ph.kind === "inhale" ? 60 : 35);
    $("#bs-cycle", el).textContent = `${ci + 1} / ${r.cycles}회`;
  }
  $("#bs-orb", el).style.setProperty("--level", level.toFixed(4));
  $("#bs-ring", el).style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(1);
  const count = String(Math.min(ph.dur, Math.max(1, Math.ceil(ph.dur - t))));
  const c = $("#bs-count", el);
  if (c.textContent !== count) c.textContent = count;
  $("#bs-bar", el).style.width = ((r.elapsed / (r.total * 1000)) * 100).toFixed(2) + "%";
  $("#bs-remaining", el).textContent = fmtTime(r.total - sec);
}

function togglePause() {
  const r = run;
  if (!r) return;
  r.paused = !r.paused;
  r.el.classList.toggle("is-paused", r.paused);
  $("#bs-pause", r.el).textContent = r.paused ? "계속하기" : "일시정지";
  if (r.paused) {
    cancelAnimationFrame(r.raf);
    r.base = r.elapsed;
    stopAmbient();
  } else {
    r.t0 = performance.now();
    if (r.settings.bgSound) ambientWithHint(r.settings.ambient);
    frame(r.t0);
  }
}

function finish() {
  const r = run;
  cancelAnimationFrame(r.raf);
  stopAmbient();
  releaseAwake();
  recordBreathing();
  if (r.settings.sound) playCue("exhale");
  vibrate([80, 60, 80]);
  r.el.classList.add("is-done");
  $("#bs-phase", r.el).textContent = "";
  $("#bs-bar", r.el).style.width = "100%";
  $("#bs-done-text", r.el).textContent = `${r.cycles}회 호흡을 마쳤어요. 오늘의 연속 기록에 더해졌어요.`;
  $("#bs-done", r.el).hidden = false;
  $("#bs-ok", r.el).focus();
}

function closeSession() {
  const r = run;
  if (!r) return;
  run = null;
  cancelAnimationFrame(r.raf);
  r.offEsc?.();
  stopAmbient();
  releaseAwake();
  r.el.hidden = true;
  document.body.classList.remove("noscroll");
  r.restoreFocus?.focus?.();
}
