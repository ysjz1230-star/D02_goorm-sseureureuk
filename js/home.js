// 홈 화면
import { $, esc, icon, TOPICS } from "./ui.js";
import { getProgress, calcStreak, weekDays, courseState } from "./progress.js";
import { startSessionById } from "./breathing.js";
import { loadSessions, recommended, openPlayer, setTab } from "./meditation.js";
import { isPersistent } from "./storage.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "깊은 밤이에요";
  if (h < 12) return "좋은 아침이에요";
  if (h < 18) return "편안한 오후예요";
  return "고요한 저녁이에요";
}

export async function renderHome(root) {
  let sessions = [];
  let failed = false;
  try {
    sessions = await loadSessions();
  } catch {
    failed = true;
  }
  const p = getProgress();
  const streak = calcStreak(p.completedDates);
  const week = weekDays(p.completedDates);
  const rec = failed ? null : recommended();
  const course = courseState(sessions, p);
  const done = course.filter((c) => c.state === "done").length;
  const t = rec ? TOPICS[rec.topic] || TOPICS.focus : null;

  root.innerHTML = `
    <header class="home-head">
      <div><p class="muted">${greeting()}</p><h1>스르륵</h1></div>
      <div class="row gap">
        <span class="net-badge" data-net-badge></span>
        <a class="icon-btn" href="#/offline" aria-label="오프라인 준비">${icon("i-cloud-down")}</a>
      </div>
    </header>

    <section class="card streak" aria-label="연속 기록">
      <div class="row between">
        <div class="streak-num">${icon("i-flame", "flame")}<span><b>연속 ${streak}일</b><small>${streak ? "오늘도 이어가 볼까요?" : "오늘 한 번이면 시작돼요"}</small></span></div>
      </div>
      <ol class="week">
        ${week.map((d) => `<li class="${d.done ? "done" : ""} ${d.isToday ? "today" : ""} ${d.future ? "future" : ""}" aria-label="${d.label}요일 ${d.done ? "완료" : d.future ? "예정" : "미완료"}"><span>${d.label}</span><i>${d.done ? icon("i-check") : ""}</i></li>`).join("")}
      </ol>
    </section>

    <button class="sos" id="h-sos" aria-label="SOS 진정 호흡 1분 바로 시작">
      <span class="sos-ic">${icon("i-heart")}</span>
      <span><b>SOS 진정 호흡</b><small>눌러서 바로 시작 · 1분</small></span>
    </button>

    <div class="grid2">
      <a class="card tap" href="#/breathe"><span class="tile">${icon("i-wind")}</span><b>호흡 시작</b><small>원을 따라 천천히</small></a>
      <a class="card tap" href="#/meditate" id="h-course"><span class="tile">${icon("i-moon")}</span><b>7일 코스</b><small>${done} / ${course.length || 7} 완료</small>
        <div class="bar thin"><span style="width:${course.length ? (done / course.length) * 100 : 0}%"></span></div></a>
    </div>

    <h2 class="sec-title">오늘의 추천 명상</h2>
    ${rec
      ? `<button class="session-card feature" id="h-rec" style="--bg:url(${rec.bgImage})">
          <span class="session-body"><small>${t.label} · ${rec.minutes}분${rec.courseDay ? ` · Day ${rec.courseDay}` : ""}</small><b>${esc(rec.title)}</b></span>
          <span class="play-chip">${icon("i-play")}</span></button>`
      : `<div class="state"><p>명상 목록을 불러오지 못했어요.</p><button class="btn" id="h-retry">다시 시도</button></div>`}
    ${isPersistent() ? "" : `<p class="card note warn">이 브라우저에서는 기록을 저장할 수 없어요. 앱을 닫으면 기록이 사라져요.</p>`}
    <p class="disclaimer">이 앱은 휴식과 호흡·명상 습관을 돕는 도구이며 질환의 진단·치료를 대신하지 않습니다. 불편하면 즉시 중단하고, 증상이 지속되면 전문가와 상담하세요.</p>`;

  $("#h-sos", root).onclick = () => startSessionById("sos", 1, { sos: true });
  const r = $("#h-rec", root);
  if (r) r.onclick = () => openPlayer(rec.id);
  const c = $("#h-course", root);
  if (c) c.onclick = () => setTab("course");
  const retry = $("#h-retry", root);
  if (retry) retry.onclick = () => renderHome(root);
  document.dispatchEvent(new Event("net:refresh"));
}
