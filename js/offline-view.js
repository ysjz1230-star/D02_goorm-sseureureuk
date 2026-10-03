// "오프라인 준비" 화면: 비행기 탑승 전 점검
import { $, $$, esc, icon, fmtMB, toast } from "./ui.js";
import { loadMedia, statusOf, saveFiles, removeFiles, rememberSaved, estimate, isOnline, hasCache } from "./offline.js";

const APP_CACHE = "app-v1";
const jobs = {}; // 그룹별 진행 상태 {running, fraction, error}
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  const b = $("#o-install");
  if (b) b.hidden = false;
});

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const cacheOf = (key) => (key === "A" ? APP_CACHE : undefined);

export async function renderOffline(root) {
  let media;
  try {
    media = await loadMedia();
  } catch {
    root.innerHTML = head() + `<div class="state"><p>저장 목록을 불러오지 못했어요.</p><button class="btn" id="o-retry">다시 시도</button></div>`;
    $("#o-retry", root).onclick = () => renderOffline(root);
    return;
  }
  const groups = Object.entries(media.groups);
  root.innerHTML = `${head()}
    <div class="net-line"><span class="net-badge" data-net-badge></span><span class="muted small">Wi-Fi 연결 상태에서 저장하는 걸 권장해요</span></div>
    ${hasCache ? "" : `<div class="card note warn">이 브라우저는 오프라인 저장을 지원하지 않아요.</div>`}
    <button class="btn primary big" id="o-all">전체 저장하기</button>
    ${groups.map(([key, g]) => cardHtml(key, g)).join("")}
    <section class="card" aria-labelledby="o-st"><h2 class="sec-title" id="o-st">기기 저장 공간</h2>
      <div class="bar"><span id="o-usebar" style="width:0"></span></div><p class="muted small" id="o-use">확인 중…</p></section>
    <section class="card tips"><h2 class="sec-title">알아두세요</h2>
      <ul>
        <li>저장이 끝나면 비행기 모드에서도 호흡·명상·배경이 그대로 동작해요.</li>
        <li>저장 중에 앱을 닫으면 중단돼요. 다시 열어 이어서 저장하면 돼요.</li>
        ${isIOS && !isStandalone() ? "<li><b>iPhone</b>: Safari 공유 버튼 → <b>홈 화면에 추가</b>로 설치해서 쓰면 저장한 파일이 더 오래 보관돼요.</li>" : ""}
      </ul>
      <button class="btn" id="o-install" hidden>앱으로 설치하기</button>
    </section>`;

  $("#o-all", root).onclick = () => saveAll(root, groups);
  const inst = $("#o-install", root);
  if (inst) {
    inst.hidden = !deferredInstall;
    inst.onclick = async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice.catch(() => {});
      deferredInstall = null;
      inst.hidden = true;
    };
  }
  groups.forEach(([key, g]) => bindCard(root, key, g));
  document.dispatchEvent(new Event("net:refresh"));
  await refresh(root, groups);
  showUsage(root);
}

const head = () => `<header class="page-head"><h1>오프라인 준비</h1><p class="muted">비행기에 타기 전에 미리 저장해 두세요.</p></header>`;

function cardHtml(key, g) {
  const total = g.files.reduce((s, f) => s + f.bytes, 0);
  return `<article class="card save-card" data-group="${key}">
    <div class="row between top">
      <div><h3>${esc(g.label)}</h3><small class="muted">${esc(g.desc || "")}</small></div>
      <span class="size">${fmtMB(total)}</span>
    </div>
    ${key === "B3" ? `<div class="checks">${g.files.map((f) => `<label class="check"><input type="checkbox" value="${esc(f.path)}" checked><span>${esc(f.label || f.path)}</span><small data-file="${esc(f.path)}">${fmtMB(f.bytes)}</small></label>`).join("")}</div>` : ""}
    <div class="bar"><span data-bar style="width:0"></span></div>
    <div class="row between">
      <span class="state-text" data-text aria-live="polite">확인 중…</span>
      <span class="row gap">
        <button class="btn primary sm" data-act="save">저장하기</button>
        ${key === "A" ? "" : `<button class="btn sm" data-act="del">삭제</button>`}
      </span>
    </div>
    <p class="error" data-error hidden></p>
  </article>`;
}

const cardEl = (root, key) => $(`.save-card[data-group="${key}"]`, root);

function targets(root, key, g) {
  if (key !== "B3") return g.files;
  const on = new Set($$("input:checked", cardEl(root, key)).map((i) => i.value));
  return g.files.filter((f) => on.has(f.path));
}

function bindCard(root, key, g) {
  const card = cardEl(root, key);
  $('[data-act="save"]', card).onclick = () => runSave(root, key, g);
  const del = $('[data-act="del"]', card);
  if (del) del.onclick = async () => {
    const files = targets(root, key, g);
    if (!files.length) return toast("삭제할 항목을 선택해 주세요");
    await removeFiles(files, cacheOf(key));
    toast("삭제했어요");
    await refresh(root, Object.entries((await loadMedia()).groups));
    showUsage(root);
  };
}

async function runSave(root, key, g) {
  if (jobs[key]?.running) return;
  const files = targets(root, key, g);
  if (!files.length) return toast("저장할 항목을 선택해 주세요");
  if (!isOnline()) return toast("인터넷에 연결한 뒤 저장할 수 있어요");
  jobs[key] = { running: true, fraction: 0 };
  paintJob(root, key);
  try {
    await saveFiles(files, {
      cacheName: cacheOf(key),
      onProgress: (f) => {
        jobs[key].fraction = f;
        paintJob(root, key);
      },
    });
    rememberSaved(key);
    jobs[key] = null;
  } catch (e) {
    const quota = e?.name === "QuotaExceededError";
    jobs[key] = { error: quota ? "저장 공간이 부족해요. 다른 항목을 삭제한 뒤 다시 시도해 주세요." : "저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요." };
  }
  await refresh(root, Object.entries((await loadMedia()).groups));
  showUsage(root);
}

async function saveAll(root, groups) {
  for (const [key, g] of groups) {
    await runSave(root, key, g);
    if (jobs[key]?.error) return;
  }
  if (!Object.values(jobs).some((j) => j?.error)) toast("모두 저장했어요. 이제 비행기 모드로 바꿔도 돼요 ✈");
}

function paintJob(root, key) {
  const card = cardEl(root, key);
  if (!card) return;
  const j = jobs[key];
  const bar = $("[data-bar]", card);
  const text = $("[data-text]", card);
  const err = $("[data-error]", card);
  const btns = $$("button", card);
  if (j?.running) {
    bar.style.width = (j.fraction * 100).toFixed(0) + "%";
    text.textContent = `저장 중 ${(j.fraction * 100).toFixed(0)}%`;
    btns.forEach((b) => (b.disabled = true));
    err.hidden = true;
  }
}

async function refresh(root, groups) {
  await Promise.all(groups.map(async ([key, g]) => {
    const card = cardEl(root, key);
    if (!card) return;
    const st = await statusOf(g.files);
    const j = jobs[key];
    const bar = $("[data-bar]", card);
    const text = $("[data-text]", card);
    const err = $("[data-error]", card);
    if (j?.running) return paintJob(root, key);
    $$("button", card).forEach((b) => (b.disabled = false));
    const all = st.saved === st.total && st.total > 0;
    bar.style.width = st.bytesTotal ? ((st.bytesSaved / st.bytesTotal) * 100).toFixed(0) + "%" : "0";
    card.classList.toggle("saved", all);
    text.textContent = all ? "저장됨 ✓" : st.saved ? `${st.saved}/${st.total}개 저장됨` : "아직 저장되지 않았어요";
    err.hidden = !j?.error;
    err.textContent = j?.error || "";
    const save = $('[data-act="save"]', card);
    save.textContent = j?.error ? "다시 시도" : st.saved && !all ? "나머지 저장" : "저장하기";
    save.disabled = all && key !== "B3";
    const del = $('[data-act="del"]', card);
    if (del) del.disabled = st.saved === 0;
    if (key === "B3") $$("[data-file]", card).forEach((s) => {
      const f = g.files.find((x) => x.path === s.dataset.file);
      s.textContent = `${fmtMB(f.bytes)}${st.set.has(f.path) ? " · 저장됨" : ""}`;
    });
  }));
}

async function showUsage(root) {
  const u = await estimate();
  const el = $("#o-use", root);
  if (!el) return;
  if (!u) return (el.textContent = "이 브라우저에서는 저장 공간을 확인할 수 없어요.");
  el.textContent = `앱이 ${fmtMB(u.usage)} 사용 중 · 사용 가능 약 ${(u.quota / 1024 / 1024 / 1024).toFixed(1)}GB`;
  $("#o-usebar", root).style.width = Math.max(1, Math.min(100, (u.usage / u.quota) * 100)) + "%";
}
