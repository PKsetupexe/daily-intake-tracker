import assert from "node:assert/strict";
import test from "node:test";
import { defaultScenarioForDate, targetScenarioForDate } from "../app/target-scenarios.mjs";

test("没有任何设置时，所有日期初始使用日常情景", () => {
  assert.equal(targetScenarioForDate("2026-07-01").scenario, "daily");
  assert.equal(targetScenarioForDate("2030-01-01").source, "initial-default");
});

test("默认情景只从生效日期起影响没有单独覆盖的日期", () => {
  const defaults = [
    { date: "2026-07-10", scenario: "strength" },
    { date: "2026-07-20", scenario: "cardio" },
  ];
  assert.equal(defaultScenarioForDate("2026-07-09", defaults).scenario, "daily");
  assert.equal(defaultScenarioForDate("2026-07-10", defaults).scenario, "strength");
  assert.equal(defaultScenarioForDate("2026-07-19", defaults).scenario, "strength");
  assert.equal(defaultScenarioForDate("2026-07-20", defaults).scenario, "cardio");
});

test("当日设置优先于该日期生效的默认情景，且不影响相邻日期", () => {
  const defaults = [{ date: "2026-07-10", scenario: "strength" }];
  const days = [{ date: "2026-07-12", scenario: "cardio" }];
  assert.equal(targetScenarioForDate("2026-07-11", days, defaults).scenario, "strength");
  assert.equal(targetScenarioForDate("2026-07-12", days, defaults).scenario, "cardio");
  assert.equal(targetScenarioForDate("2026-07-13", days, defaults).scenario, "strength");
});
