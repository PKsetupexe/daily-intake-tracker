export function normalizeEnergyAdjustment(value, baseCalories = Infinity) {
  const limit = Math.max(0, Number(baseCalories) || 0);
  const numeric = Number(value) || 0;
  return Math.round(Math.max(-limit, Math.min(limit, numeric)));
}

export function longTermEnergyTargetForDate(date, records = []) {
  const applicable = [...records]
    .filter((record) => String(record.date || "") <= date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);
  return applicable
    ? {
        mode: "longTerm",
        enabled: Boolean(applicable.enabled),
        adjustment: Number(applicable.adjustment) || 0,
        record: applicable,
      }
    : { mode: "longTerm", enabled: false, adjustment: 0, record: null };
}

export function energyTargetForDate(date, dayRecords = [], longTermRecords = []) {
  const dayRecord = dayRecords.find((record) => String(record.date) === date);
  if (dayRecord) {
    return {
      mode: "exception",
      enabled: Boolean(dayRecord.enabled),
      adjustment: Number(dayRecord.adjustment) || 0,
      record: dayRecord,
    };
  }
  return longTermEnergyTargetForDate(date, longTermRecords);
}

export function projectedMonthlyWeightChange(adjustment, weight) {
  const kilograms = Number(adjustment || 0) * 30 / 7700;
  const percent = Number(weight) > 0 ? Math.abs(kilograms) / Number(weight) * 100 : 0;
  const severity = percent >= 6 ? "danger" : percent >= 4 ? "warning" : "normal";
  return { kilograms, percent, severity };
}

