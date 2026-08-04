import assert from "node:assert/strict";
import test from "node:test";
import { macroTargetsForCalories } from "../app/macro-targets.mjs";

test("手动改变净摄入目标时三大营养素会一起按最终热量换算", () => {
  const base = macroTargetsForCalories({ calories: 1800, baseCalories: 1800, weight: 70, scenario: "strength" });
  const deficit = macroTargetsForCalories({ calories: 1400, baseCalories: 1800, weight: 70, scenario: "strength" });
  assert.ok(deficit.protein < base.protein);
  assert.ok(deficit.carbs < base.carbs);
  assert.ok(deficit.fat < base.fat);
  assert.ok(Math.abs(deficit.macroCalories - 1400) <= 4);
});

test("极端缺口不会留下超过目标热量的固定蛋白质、脂肪或碳水", () => {
  assert.deepEqual(
    macroTargetsForCalories({ calories: 0, baseCalories: 1847, weight: 68.4, scenario: "daily" }),
    { protein: 0, carbs: 0, fat: 0, macroCalories: 0 },
  );
});

test("训练情景的宏量营养比例在调整热量后仍保留差异", () => {
  const strength = macroTargetsForCalories({ calories: 1600, baseCalories: 1900, weight: 70, scenario: "strength" });
  const cardio = macroTargetsForCalories({ calories: 1600, baseCalories: 1900, weight: 70, scenario: "cardio" });
  assert.ok(strength.protein > cardio.protein);
  assert.ok(cardio.carbs > strength.carbs);
  assert.ok(Math.abs(strength.macroCalories - 1600) <= 4);
  assert.ok(Math.abs(cardio.macroCalories - 1600) <= 4);
});
