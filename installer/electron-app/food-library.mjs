import { splitFoodName } from './food-name.mjs';
export const NUTRIENT_KEYS = ['calories','protein','carbs','fat','fiber','sugar','sucrose','addedSugar','sodium','potassium','calcium','iron','magnesium','zinc','vitaminA','vitaminC','vitaminD','vitaminE','vitaminB1','vitaminB2','vitaminB6','vitaminB12','folate'];
const searchKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function foodKey(name) { return searchKey(splitFoodName(name).name); }
export function libraryId(name) { return `food-library:${encodeURIComponent(foodKey(name))}`; }
export function scaleNutrients(food, grams, sourceGrams = 100) {
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(sourceGrams) || sourceGrams <= 0) throw new Error('请输入大于 0 的有效克重');
  return Object.fromEntries(NUTRIENT_KEYS.map(key => {
    const value = Number(food[key] ?? 0);
    const scaled = value * (grams / sourceGrams);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(scaled)) throw new Error('营养值必须是有效的非负数字');
    return [key, scaled];
  }));
}
export function normalizeLibraryFood(value, previous, timestamp) {
  const { name, note } = splitFoodName(value.name, value.note);
  if (!name) throw new Error('请输入食品名称');
  const serving=value.defaultServingGrams??previous?.defaultServingGrams;
  if(serving!==undefined&&(!Number.isFinite(Number(serving))||Number(serving)<=0))throw Error("默认份量必须是大于0的有效克重");
  return { ...(serving===undefined?{}:{defaultServingGrams:Number(serving)}), ...Object.fromEntries(["presetId","sourceUrl","reportedNutrients","servingSource","servingBasis","servingRecordId","servingUpdatedAt"].filter(key=>value[key]!==undefined||previous?.[key]!==undefined).map(key=>[key,value[key]??previous[key]])), id: previous?.id || value.id || libraryId(name), name, weight: 100,
    ...scaleNutrients(value, 100), note,
    createdAt: [previous?.createdAt, value.createdAt].filter(date => Number.isFinite(Date.parse(date || ''))).sort()[0] || timestamp, updatedAt: timestamp };
}
const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { numeric: true, sensitivity: 'base' });
export function sortLibraryFoods(foods, query = '', sort = 'name', direction = 'asc') {
  const search = searchKey(query);
  return foods.filter(food => searchKey(food.name).includes(search) || searchKey(food.note).includes(search)).slice().sort((a,b) => {
    const order = sort === 'name' ? collator.compare(a.name, b.name)
      : ['calories','protein'].includes(sort) ? Number(a[sort]) - Number(b[sort])
      : String(a[sort] || '').localeCompare(String(b[sort] || ''));
    return (order || collator.compare(a.name, b.name) || a.id.localeCompare(b.id)) * (direction === 'desc' ? -1 : 1);
  });
}
