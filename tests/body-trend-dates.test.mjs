import assert from "node:assert/strict";
import test from "node:test";
import { selectBodyTrendDates } from "../app/body-trend-dates.mjs";

const weightDates = ["2026-07-01", "2026-07-03"];
const baselineDates = ["2026-07-02", "2026-07-04"];

test("跳过无记录日期时，两项开启采用可见数据日期的并集", () => {
  const result = selectBodyTrendDates({
    weightDates,
    baselineDates,
    showWeight: true,
    showBaseline: true,
    skipEmpty: true,
  });
  assert.deepEqual(result.axisDates, [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
  ]);
});

test("跳过无记录日期时，单项开启只保留该项实际记录日期", () => {
  const weightOnly = selectBodyTrendDates({
    weightDates,
    baselineDates,
    showWeight: true,
    showBaseline: false,
    skipEmpty: true,
  });
  const baselineOnly = selectBodyTrendDates({
    weightDates,
    baselineDates,
    showWeight: false,
    showBaseline: true,
    skipEmpty: true,
  });
  assert.deepEqual(weightOnly.axisDates, weightDates);
  assert.deepEqual(baselineOnly.axisDates, baselineDates);
});

test("不跳过时，横轴只填充当前可见数据最早至最晚记录之间的日期", () => {
  const both = selectBodyTrendDates({
    weightDates,
    baselineDates,
    showWeight: true,
    showBaseline: true,
    skipEmpty: false,
  });
  const weightOnly = selectBodyTrendDates({
    weightDates,
    baselineDates,
    showWeight: true,
    showBaseline: false,
    skipEmpty: false,
  });
  assert.deepEqual(both.axisDates, [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
  ]);
  assert.deepEqual(weightOnly.axisDates, [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
  ]);
});

test("时间范围以当前可见项的最新记录为锚点，隐藏项不能撑大范围", () => {
  const olderWeights = ["2026-07-01", "2026-07-02"];
  const newerBaselines = ["2026-07-30"];
  const weightOnly = selectBodyTrendDates({
    weightDates: olderWeights,
    baselineDates: newerBaselines,
    range: 7,
    showWeight: true,
    showBaseline: false,
    skipEmpty: false,
  });
  const both = selectBodyTrendDates({
    weightDates: olderWeights,
    baselineDates: newerBaselines,
    range: 7,
    showWeight: true,
    showBaseline: true,
    skipEmpty: false,
  });
  assert.deepEqual(weightOnly.axisDates, ["2026-07-01", "2026-07-02"]);
  assert.deepEqual(both.axisDates, ["2026-07-30"]);
});

test("没有开启曲线或可见曲线没有记录时返回空日期轴", () => {
  assert.deepEqual(selectBodyTrendDates({
    weightDates,
    baselineDates,
    showWeight: false,
    showBaseline: false,
  }).axisDates, []);
  assert.deepEqual(selectBodyTrendDates({
    weightDates: [],
    baselineDates,
    showWeight: true,
    showBaseline: false,
  }).axisDates, []);
});
