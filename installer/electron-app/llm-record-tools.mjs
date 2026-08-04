export const EDIT_OPERATIONS = new Set(["update", "patch", "modify"]);

export function mergeEditableRecord(records, value, store) {
  const items = Array.isArray(records) ? records : [];
  const draft = structuredClone(value || {});
  const recordId = String(draft.id || "");
  const byId = recordId ? items.find((item) => String(item.id) === recordId) : undefined;
  if (byId) return { ...byId, ...draft, id: byId.id };

  const locatorKeys = store === "exercises"
    ? ["name", "date", "time", "source"]
    : ["name", "date", "time", "meal"];
  const suppliedKeys = locatorKeys.filter((key) => draft[key] !== undefined && String(draft[key]) !== "");
  const recordLabel = store === "exercises" ? "运动" : "食物";
  if (suppliedKeys.length === 0) {
    throw new Error(`无法定位要修改的${recordLabel}记录，请提供原记录 ID、日期、名称或时间`);
  }
  const candidates = items.filter((item) =>
    suppliedKeys.every((key) => String(item[key] ?? "") === String(draft[key] ?? ""))
  );
  if (candidates.length === 1) return { ...candidates[0], ...draft, id: candidates[0].id };
  if (candidates.length > 1) {
    throw new Error(`无法唯一定位要修改的${recordLabel}记录，请补充日期、名称或时间`);
  }
  throw new Error(`找不到要修改的${recordLabel}记录，请核对日期、名称或时间`);
}
