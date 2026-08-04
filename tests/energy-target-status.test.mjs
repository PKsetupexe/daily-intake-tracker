import assert from "node:assert/strict";
import test from "node:test";
import { energyTargetStatus } from "../app/energy-target-status.mjs";

test("远低于目标时使用蓝色，接近目标时逐渐转为绿色", () => {
  assert.equal(energyTargetStatus(0, 2000).color, "#3b75b7");
  assert.equal(energyTargetStatus(1840, 2000).color, "#30916e");
  assert.equal(energyTargetStatus(2000, 2000).color, "#30916e");
});

test("轻微超过目标仍为绿色，超过较多后依次转黄和红", () => {
  assert.equal(energyTargetStatus(2020, 2000).color, "#30916e");
  assert.equal(energyTargetStatus(2360, 2000).color, "#d09a2d");
  assert.equal(energyTargetStatus(2800, 2000).color, "#c44f43");
});

test("进度宽度限制在 0 到 100，颜色仍能表达超出程度", () => {
  assert.equal(energyTargetStatus(-200, 2000).progressPercentage, 0);
  assert.equal(energyTargetStatus(1000, 2000).progressPercentage, 50);
  assert.equal(energyTargetStatus(2600, 2000).progressPercentage, 100);
  assert.notEqual(energyTargetStatus(2100, 2000).color, energyTargetStatus(2700, 2000).color);
});
