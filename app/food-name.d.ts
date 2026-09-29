export function splitFoodName(name: string, note?: string): { name: string; note: string };
export function normalizeFoodRecord<T extends { name: string; note?: string }>(value: T): T & { note: string };
