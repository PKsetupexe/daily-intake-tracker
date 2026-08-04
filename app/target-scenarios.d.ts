export type TargetScenarioValue = "daily" | "strength" | "cardio";

export type TargetScenarioRecordLike = {
  date: string;
  scenario: TargetScenarioValue;
};

export function normalizeTargetScenario(value: unknown): TargetScenarioValue;

export function defaultScenarioForDate(date: string, records?: TargetScenarioRecordLike[]): {
  scenario: TargetScenarioValue;
  record: TargetScenarioRecordLike | null;
};

export function targetScenarioForDate(
  date: string,
  dayRecords?: TargetScenarioRecordLike[],
  defaultRecords?: TargetScenarioRecordLike[],
): {
  scenario: TargetScenarioValue;
  source: "day" | "default-history" | "initial-default";
  record: TargetScenarioRecordLike | null;
};
