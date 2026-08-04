export type MacroTargetScenario = "daily" | "strength" | "cardio";
export function macroTargetsForCalories(input: {
  calories: number;
  baseCalories: number;
  weight?: number;
  sex?: string;
  scenario?: MacroTargetScenario;
}): { protein: number; carbs: number; fat: number; macroCalories: number };
