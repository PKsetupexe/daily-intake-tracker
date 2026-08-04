import assert from "node:assert/strict";
import test from "node:test";
import { mergeEditableRecord } from "../electron/llm-record-tools.mjs";

const exercises = [
  {
    id: "exercise-1", date: "2026-07-28", time: "20:00", name: "步行",
    calories: 180, duration: 55, steps: 7000, intensity: "低强度", source: "手表", note: "",
  },
  {
    id: "exercise-2", date: "2026-07-29", time: "19:30", name: "力量训练",
    calories: 220, duration: 40, steps: 0, intensity: "中等强度", source: "手动填写", note: "",
  },
];

test("LLM exercise update keeps the original id and merges partial fields", () => {
  const updated = mergeEditableRecord(exercises, {
    id: "exercise-1", calories: 205, note: "按手表活动热量修正",
  }, "exercises");
  assert.equal(updated.id, "exercise-1");
  assert.equal(updated.steps, 7000);
  assert.equal(updated.calories, 205);
});

test("LLM exercise update can locate one record by date, time and name", () => {
  const updated = mergeEditableRecord(exercises, {
    date: "2026-07-29", time: "19:30", name: "力量训练", duration: 45,
  }, "exercises");
  assert.equal(updated.id, "exercise-2");
  assert.equal(updated.duration, 45);
  assert.equal(updated.calories, 220);
});

test("LLM exercise update refuses ambiguous or missing records", () => {
  assert.throws(
    () => mergeEditableRecord([...exercises, { ...exercises[0], id: "exercise-3" }], { name: "步行" }, "exercises"),
    /无法唯一定位/,
  );
  assert.throws(
    () => mergeEditableRecord(exercises, { date: "2026-07-20", name: "跑步" }, "exercises"),
    /找不到/,
  );
});
