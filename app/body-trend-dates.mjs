function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function uniqueSortedDates(dates) {
  return [...new Set(dates.filter(Boolean))].sort();
}

export function selectBodyTrendDates({
  weightDates = [],
  baselineDates = [],
  range = 0,
  showWeight = true,
  showBaseline = false,
  skipEmpty = false,
} = {}) {
  const visibleRecordedDates = uniqueSortedDates([
    ...(showWeight ? weightDates : []),
    ...(showBaseline ? baselineDates : []),
  ]);

  if (visibleRecordedDates.length === 0) {
    return { recordedDates: [], axisDates: [] };
  }

  let recordedDates = visibleRecordedDates;
  if (range) {
    const latestVisibleDate = new Date(`${visibleRecordedDates.at(-1)}T12:00:00`);
    latestVisibleDate.setDate(latestVisibleDate.getDate() - range + 1);
    const cutoff = formatLocalDate(latestVisibleDate);
    recordedDates = visibleRecordedDates.filter((date) => date >= cutoff);
  }

  if (skipEmpty || recordedDates.length < 2) {
    return { recordedDates, axisDates: recordedDates };
  }

  const axisDates = [];
  const current = new Date(`${recordedDates[0]}T12:00:00`);
  const end = new Date(`${recordedDates.at(-1)}T12:00:00`);
  while (current <= end) {
    axisDates.push(formatLocalDate(current));
    current.setDate(current.getDate() + 1);
  }

  return { recordedDates, axisDates };
}
