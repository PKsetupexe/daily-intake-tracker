import test from "node:test";
import assert from "node:assert/strict";
import {
  energyTargetForDate,
  longTermEnergyTargetForDate,
  normalizeEnergyAdjustment,
  projectedMonthlyWeightChange,
} from "../app/energy-balance-targets.mjs";

test("未设置时默认关闭且长期调整为 0", () => {
  assert.deepEqual(longTermEnergyTargetForDate("2026-07-31", []), {
    mode: "longTerm", enabled: false, adjustment: 0, record: null,
  });
});

test("长期目标只从生效日期起影响之后日期", () => {
  const records = [
    { id: "2026-08-05", date: "2026-08-05", enabled: true, adjustment: -300 },
    { id: "2026-08-20", date: "2026-08-20", enabled: true, adjustment: 200 },
  ];
  assert.equal(energyTargetForDate("2026-08-04", [], records).adjustment, 0);
  assert.equal(energyTargetForDate("2026-08-10", [], records).adjustment, -300);
  assert.equal(energyTargetForDate("2026-08-20", [], records).adjustment, 200);
  assert.equal(energyTargetForDate("2026-08-31", [], records).adjustment, 200);
});

test("当日特例优先且只影响固定日期", () => {
  const defaults = [{ id: "2026-08-01", date: "2026-08-01", enabled: true, adjustment: -300 }];
  const days = [{ id: "2026-08-05", date: "2026-08-05", enabled: true, adjustment: 0 }];
  assert.equal(energyTargetForDate("2026-08-05", days, defaults).mode, "exception");
  assert.equal(energyTargetForDate("2026-08-05", days, defaults).adjustment, 0);
  assert.equal(energyTargetForDate("2026-08-06", days, defaults).adjustment, -300);
});

test("调整值受当日居家基线限制，速度按体重相对百分比评级", () => {
  assert.equal(normalizeEnergyAdjustment(-2500, 1800), -1800);
  assert.equal(normalizeEnergyAdjustment(2500, 1800), 1800);
  assert.equal(projectedMonthlyWeightChange(-770, 70).severity, "warning");
  assert.equal(projectedMonthlyWeightChange(-1100, 70).severity, "danger");
});
