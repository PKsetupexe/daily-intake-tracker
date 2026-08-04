const ENERGY_COLOR_STOPS = [
  { ratio: 0, color: [59, 117, 183] },
  { ratio: 0.65, color: [57, 132, 180] },
  { ratio: 0.92, color: [48, 145, 110] },
  { ratio: 1.05, color: [48, 145, 110] },
  { ratio: 1.18, color: [208, 154, 45] },
  { ratio: 1.4, color: [196, 79, 67] },
];

function hex(color) {
  return `#${color.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function interpolateColor(first, second, progress) {
  return first.map((value, index) => value + (second[index] - value) * progress);
}

export function energyTargetStatus(netCalories, targetCalories) {
  const safeTarget = Math.max(1, Number(targetCalories) || 1);
  const ratio = Number(netCalories || 0) / safeTarget;
  const clampedRatio = Math.max(0, ratio);
  let color = ENERGY_COLOR_STOPS.at(-1).color;

  if (clampedRatio <= ENERGY_COLOR_STOPS[0].ratio) {
    color = ENERGY_COLOR_STOPS[0].color;
  } else {
    for (let index = 1; index < ENERGY_COLOR_STOPS.length; index += 1) {
      const upper = ENERGY_COLOR_STOPS[index];
      const lower = ENERGY_COLOR_STOPS[index - 1];
      if (clampedRatio <= upper.ratio) {
        const progress = (clampedRatio - lower.ratio) / (upper.ratio - lower.ratio);
        color = interpolateColor(lower.color, upper.color, progress);
        break;
      }
    }
  }

  return {
    ratio,
    color: hex(color),
    progressPercentage: Math.max(0, Math.min(100, ratio * 100)),
  };
}
