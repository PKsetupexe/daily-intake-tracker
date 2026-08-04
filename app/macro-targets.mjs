const SCENARIO_RATES = {
  daily: { proteinPerKg: 1.2, fatPerKg: 0.9 },
  strength: { proteinPerKg: 1.8, fatPerKg: 0.8 },
  cardio: { proteinPerKg: 1.4, fatPerKg: 0.7 },
};

export function macroTargetsForCalories({
  calories,
  baseCalories,
  weight = 0,
  sex = "",
  scenario = "daily",
}) {
  const targetCalories = Math.max(0, Math.round(Number(calories) || 0));
  const referenceCalories = Math.max(1, Math.round(Number(baseCalories) || targetCalories || 1));
  if (targetCalories === 0) return { protein: 0, carbs: 0, fat: 0, macroCalories: 0 };

  const rates = SCENARIO_RATES[scenario] || SCENARIO_RATES.daily;
  const referenceProtein = Number(weight) > 0
    ? Number(weight) * rates.proteinPerKg
    : sex === "male" ? 65 : sex === "female" ? 55 : 60;
  const referenceFat = Number(weight) > 0
    ? Number(weight) * rates.fatPerKg
    : referenceCalories * .28 / 9;
  const referenceProteinCalories = referenceProtein * 4;
  const referenceFatCalories = referenceFat * 9;
  const referenceCarbCalories = Math.max(0, referenceCalories - referenceProteinCalories - referenceFatCalories);
  const referenceMacroCalories = Math.max(1, referenceProteinCalories + referenceCarbCalories + referenceFatCalories);

  const protein = Math.max(0, Math.round(targetCalories * (referenceProteinCalories / referenceMacroCalories) / 4));
  const fat = Math.max(0, Math.round(targetCalories * (referenceFatCalories / referenceMacroCalories) / 9));
  const carbs = Math.max(0, Math.round((targetCalories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat, macroCalories: protein * 4 + carbs * 4 + fat * 9 };
}
