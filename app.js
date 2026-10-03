// 진입점: 해시 라우터, 온라인 상태 표시, Service Worker 등록
import { $, $$ } from "./js/ui.js";
import { checkPersistent } from "./js/storage.js";
import { onNetChange } from "./js/offline.js";
import { renderHome } from "./js/home.js";
import { renderBreathe } from "./js/breathing.js";
import { renderMeditate } from "./js/meditation.js";
import { renderOffline } from "./js/offline-view.js";

const VIEWS = { home: renderHome, breathe: renderBreathe, meditate: renderMeditate, offline: renderOffline };
const TITLES = { home: "홈", breathe: "호흡", meditate: "명상", offline: "오프라인 준비" };
let current = "home";

async function show(key) {
  const root = $(`#view-${key}`);
  try {
    await VIEWS[key](root);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="state"><p>화면을 불러오지 못했어요.</p><button class="btn" id="v-retry">다시 시도</button></div>`;
    $("#v-retry", root).onclick = () => show(key);
  }
}

function route() {
  const name = location.hash.replace(/^#\//, "").split("?")[0];
  current = VIEWS[name] ? name : "home";
  $$(".view").forEach((v) => (v.hidden = v.dataset.view !== current));
  $$(".tabbar a").forEach((a) => (a.dataset.tab === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = `${TITLES[current]} · 스르륵`;
  show(current);
  window.scrollTo(0, 0);
  $(`#view-${current}`).focus({ preventScroll: true });
}

function paintNet(online) {
  $$("[data-net-badge]").forEach((b) => {
    b.dataset.online = String(online);
    b.innerHTML = `<i></i>${online ? "온라인" : "오프라인"}`;
  });
}
let lastOnline = navigator.onLine;
onNetChange((on) => {
  lastOnline = on;
  paintNet(on);
});
document.addEventListener("net:refresh", () => paintNet(lastOnline));

window.addEventListener("hashchange", route);
window.addEventListener("progress:changed", () => show(current));

// 안전 안내 창 닫기 버튼
$("#safety-cancel").onclick = () => $("#safety").close("cancel");

checkPersistent();
if (!location.hash) history.replaceState(null, "", "#/home");
route();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW 등록 실패", e)));
}
