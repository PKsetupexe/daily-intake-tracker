export const NUTRIENT_KEYS: string[];
export function foodKey(name: string): string;
export function libraryId(name: string): string;
export function scaleNutrients(food: object, grams: number, sourceGrams?: number): Record<string, number>;
export function normalizeLibraryFood(value: object, previous: object | undefined, timestamp: string): object;
export function sortLibraryFoods<T extends { id: string; name: string; note: string }>(foods: T[], query?: string, sort?: string, direction?: string): T[];
