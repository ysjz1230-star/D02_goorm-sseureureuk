// 화면 공용 도우미
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#${name}"/></svg>`;

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1) + "MB";
}

export const TOPICS = {
  sleep: { label: "수면", icon: "i-moon" },
  anxiety: { label: "불안", icon: "i-wave" },
  stress: { label: "스트레스", icon: "i-wind" },
  gratitude: { label: "감사", icon: "i-heart" },
  focus: { label: "집중", icon: "i-tree" },
};

let toastTimer;
export function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// 포커스 가두기 없이 간단히: Esc로 닫기 지원
export function onEscape(fn) {
  const h = (e) => {
    if (e.key === "Escape") fn();
  };
  document.addEventListener("keydown", h);
  return () => document.removeEventListener("keydown", h);
}
