export type BodyTrendDateOptions = {
  weightDates?: string[];
  baselineDates?: string[];
  range?: number;
  showWeight?: boolean;
  showBaseline?: boolean;
  skipEmpty?: boolean;
};

export function selectBodyTrendDates(options?: BodyTrendDateOptions): {
  recordedDates: string[];
  axisDates: string[];
};
