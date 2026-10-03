// localStorage 래퍼. 읽기·쓰기는 모두 이 파일을 거친다.
// 저장소가 막혀 있어도(사생활 보호 모드 등) 앱은 열리고, 이번 접속 동안만 메모리에 기록한다.
const memory = new Map();
let persistent = true;

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch {
    persistent = false; // 접근 불가 또는 JSON 깨짐
  }
  return memory.has(key) ? structuredClone(memory.get(key)) : fallback;
}

export function save(key, value) {
  memory.set(key, structuredClone(value));
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    persistent = false;
  }
}

export function checkPersistent() {
  try {
    const k = "sseureureuk.probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    persistent = true;
  } catch {
    persistent = false;
  }
  return persistent;
}

export const isPersistent = () => persistent;

export const KEYS = {
  settings: "sseureureuk.v1.settings",
  progress: "sseureureuk.v1.progress",
  offline: "sseureureuk.v1.offline",
};

const DEFAULT_SETTINGS = { sound: true, vibrate: false, bgSound: false, ambient: "rain", breathMinutes: 3, safetySeen: false };
const MINUTES = [1, 3, 5, 10];

export function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(load(KEYS.settings, {}) || {}) };
  if (!MINUTES.includes(s.breathMinutes)) s.breathMinutes = 3;
  for (const k of ["sound", "vibrate", "bgSound", "safetySeen"]) s[k] = !!s[k];
  if (typeof s.ambient !== "string") s.ambient = "rain";
  return s;
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  save(KEYS.settings, next);
  return next;
}
