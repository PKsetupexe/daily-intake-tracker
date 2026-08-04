export type EnergyTargetResolution = {
  mode: "longTerm" | "exception";
  enabled: boolean;
  adjustment: number;
  record: EnergyTargetRecord | null;
};

export type EnergyTargetRecord = { date: string; enabled?: boolean; adjustment?: number };
export function normalizeEnergyAdjustment(value: number, baseCalories?: number): number;
export function longTermEnergyTargetForDate(date: string, records?: EnergyTargetRecord[]): EnergyTargetResolution;
export function energyTargetForDate(date: string, dayRecords?: EnergyTargetRecord[], longTermRecords?: EnergyTargetRecord[]): EnergyTargetResolution;
export function projectedMonthlyWeightChange(adjustment: number, weight: number): {
  kilograms: number;
  percent: number;
  severity: "normal" | "warning" | "danger";
};
