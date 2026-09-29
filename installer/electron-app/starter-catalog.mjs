import {estimateServing} from './default-servings.mjs';
import {starterFoods,starterExercises} from './starter-catalog-data.mjs';
import {libraryId} from './food-library.mjs';
import {normalizeExerciseRecord,exerciseLibraryId} from './exercise-library.mjs';
const published='2026-09-10T00:00:00.000Z';
export const STARTER_CATALOG=[
 ...starterFoods.map(value=>{const serving=estimateServing(value);return {store:'foodLibrary',value:{...value,id:libraryId(value.name),createdAt:published,updatedAt:published,defaultServingGrams:serving.grams,servingSource:serving.source,servingBasis:serving.basis,servingUpdatedAt:'2000-01-01T00:00:00.000Z'}};}),
 ...starterExercises.map(value=>{const normalized=normalizeExerciseRecord(value,value.sex);return {store:'exerciseLibrary',value:{...value,name:normalized.name,intensity:normalized.intensity,id:exerciseLibraryId(normalized.name,value.sex),createdAt:published,updatedAt:published}};})
];
