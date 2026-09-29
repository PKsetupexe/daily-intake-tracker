export const WALKING_COEFFICIENT: number;
export function normalizeSex(value: string): 'male' | 'female' | 'unspecified';
export function isWalking(value: object): boolean;
export function normalizeExerciseRecord<T>(value: T, defaultSex?: string): T;
export function exerciseLibraryId(name: string, sex: string): string;
export function walkingProfileId(sex: string): string;
export function weightForDate(weights: {date:string;weight:number}[], date:string): number | null;
export function walkingRate(profile: object | undefined, weight: number | null): number | null;
export function sortExercises<T>(items:T[], query?:string, sort?:string, direction?:string, sex?:string):T[];
