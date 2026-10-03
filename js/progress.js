// 완료 기록, 연속일수, 7일 코스 상태.
import { load, save, KEYS } from "./storage.js";

// 로컬 날짜 문자열 (toISOString은 UTC라 한국 시간 0~9시에 하루가 어긋난다)
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // e.g. "2026-10-04"
}

// 개발용: 주소에 ?today=2026-10-05 를 붙이면 그 날짜로 동작 (연속일수 테스트용)
export function today() {
  if (typeof location !== "undefined") {
    const q = new URLSearchParams(location.search).get("today");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  }
  return todayKey();
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

// 연속일수: 오늘 했으면 오늘부터, 아직이면 어제부터 거슬러 올라가며 센다.
// 어제도 안 했다면 0.
export function calcStreak(dates, todayStr = today()) {
  const set = new Set(dates);
  let cursor = set.has(todayStr) ? todayStr : addDays(todayStr, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// 이번 주(월~일) 7칸
export function weekDays(dates, todayStr = today()) {
  const set = new Set(dates);
  const dow = (parseKey(todayStr).getDay() + 6) % 7; // 월=0
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  return labels.map((label, i) => {
    const key = addDays(todayStr, i - dow);
    return { label, key, done: set.has(key), isToday: key === todayStr, future: key > todayStr };
  });
}

// ---------- 저장 데이터 ----------
const DEFAULT = { completedDates: [], completedSessions: {}, lastPosition: {}, courseDone: [], courseRounds: 0 };

export function getProgress() {
  const raw = load(KEYS.progress, null);
  const p = { ...DEFAULT, ...(raw && typeof raw === "object" ? raw : {}) };
  p.completedDates = Array.isArray(p.completedDates) ? p.completedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  p.courseDone = Array.isArray(p.courseDone) ? p.courseDone : [];
  if (!p.completedSessions || typeof p.completedSessions !== "object") p.completedSessions = {};
  if (!p.lastPosition || typeof p.lastPosition !== "object") p.lastPosition = {};
  return p;
}

function commit(p) {
  save(KEYS.progress, p);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("progress:changed"));
}

function markToday(p) {
  const t = today();
  if (!p.completedDates.includes(t)) p.completedDates.push(t);
}

export function recordBreathing() {
  const p = getProgress();
  markToday(p);
  commit(p);
}

// sessions: 전체 세션 목록(코스 순서 판단용). 반환: 코스 진행에 반영됐는지
export function recordMeditation(session, sessions = []) {
  const p = getProgress();
  const t = today();
  markToday(p);
  const list = p.completedSessions[session.id] || (p.completedSessions[session.id] = []);
  if (!list.includes(t)) list.push(t);
  delete p.lastPosition[session.id];
  let course = false;
  if (session.courseDay && !p.courseDone.includes(session.id)) {
    const prev = sessions.find((s) => s.courseDay === session.courseDay - 1);
    if (!prev || p.courseDone.includes(prev.id)) {
      p.courseDone.push(session.id);
      course = true;
    }
  }
  commit(p);
  return course;
}

export function savePosition(id, sec) {
  const p = getProgress();
  if (sec > 3) p.lastPosition[id] = Math.floor(sec);
  else delete p.lastPosition[id];
  save(KEYS.progress, p); // 화면 갱신 이벤트는 불필요
}

export function restartCourse() {
  const p = getProgress();
  p.courseDone = [];
  p.courseRounds += 1; // 완료 기록(completedDates 등)은 그대로 유지
  commit(p);
}

// 코스 상태: [{session, state: 'done'|'open'|'locked'}] (Day 순)
export function courseState(sessions, p = getProgress()) {
  const days = sessions.filter((s) => s.courseDay).sort((a, b) => a.courseDay - b.courseDay);
  return days.map((s, i) => {
    const done = p.courseDone.includes(s.id);
    const unlocked = i === 0 || p.courseDone.includes(days[i - 1].id);
    return { session: s, state: done ? "done" : unlocked ? "open" : "locked" };
  });
}
