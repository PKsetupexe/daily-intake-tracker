const VALID_SCENARIOS = new Set(["daily", "strength", "cardio"]);

export function normalizeTargetScenario(value) {
  return VALID_SCENARIOS.has(value) ? value : "daily";
}

export function defaultScenarioForDate(date, records = []) {
  const applicable = records
    .filter((record) => record && record.date <= date)
    .sort((first, second) => String(first.date).localeCompare(String(second.date)))
    .at(-1);
  return {
    scenario: normalizeTargetScenario(applicable?.scenario),
    record: applicable || null,
  };
}

export function targetScenarioForDate(date, dayRecords = [], defaultRecords = []) {
  const dayRecord = dayRecords.find((record) => record && record.date === date);
  if (dayRecord) {
    return {
      scenario: normalizeTargetScenario(dayRecord.scenario),
      source: "day",
      record: dayRecord,
    };
  }
  const fallback = defaultScenarioForDate(date, defaultRecords);
  return {
    scenario: fallback.scenario,
    source: fallback.record ? "default-history" : "initial-default",
    record: fallback.record,
  };
}
