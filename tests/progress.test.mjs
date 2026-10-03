// 연속일수·날짜 계산 테스트.  실행: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { todayKey, addDays, calcStreak, weekDays } from "../js/progress.js";

test("todayKey는 로컬 날짜를 YYYY-MM-DD로 돌려준다 (한국 새벽에도 어제로 밀리지 않는다)", () => {
  assert.equal(todayKey(new Date(2026, 9, 4, 0, 30)), "2026-10-04"); // 로컬 00:30
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("addDays는 월·연도 경계를 넘는다", () => {
  assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("기록이 없으면 연속일수 0", () => {
  assert.equal(calcStreak([], "2026-10-04"), 0);
});

test("오늘까지 이어진 3일 → 3", () => {
  assert.equal(calcStreak(["2026-10-02", "2026-10-03", "2026-10-04"], "2026-10-04"), 3);
});

test("오늘 아직 안 했어도 어제까지 이어졌다면 유지", () => {
  assert.equal(calcStreak(["2026-10-02", "2026-10-03"], "2026-10-04"), 2);
});

test("하루를 건너뛰면 0으로 초기화", () => {
  assert.equal(calcStreak(["2026-10-01", "2026-10-02"], "2026-10-04"), 0);
});

test("중간에 끊기면 최근 구간만 센다", () => {
  assert.equal(calcStreak(["2026-09-28", "2026-09-29", "2026-10-02", "2026-10-03"], "2026-10-04"), 2);
});

test("중복 날짜는 한 번만 센다", () => {
  assert.equal(calcStreak(["2026-10-04", "2026-10-04", "2026-10-03"], "2026-10-04"), 2);
});

test("weekDays는 월~일 7칸이고 오늘을 표시한다", () => {
  const w = weekDays(["2026-10-05"], "2026-10-07"); // 2026-10-07은 수요일
  assert.equal(w.length, 7);
  assert.equal(w[0].key, "2026-10-05");
  assert.equal(w[0].label, "월");
  assert.equal(w[0].done, true);
  assert.equal(w[2].isToday, true);
  assert.equal(w[6].future, true);
});
