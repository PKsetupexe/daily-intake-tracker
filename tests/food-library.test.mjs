import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleNutrients, sortLibraryFoods, libraryId, NUTRIENT_KEYS } from '../app/food-library.mjs';
test('350 g conversion and variable serving preserve every nutrient without rounding', () => {
  const food = Object.fromEntries(NUTRIENT_KEYS.map((key, i) => [key, (i + 1) * 3.5]));
  const normalized = scaleNutrients(food, 100, 350);
  for (const [i, key] of NUTRIENT_KEYS.entries()) assert.ok(Math.abs(normalized[key] - (i + 1)) < 1e-12);
  assert.deepEqual(scaleNutrients(normalized, 350), food);
  for (const weight of [0, -1, NaN, Infinity]) assert.throws(() => scaleNutrients(food, 100, weight));
  assert.throws(() => scaleNutrients({ calories: -1 }, 100));
});
test('search results use all sort orders and deterministic pinyin', () => {
  const foods = [ { id:'b', name:'米饭', note:'测试', calories:120, protein:2, createdAt:'2020',updatedAt:'2022'}, {id:'a',name:'鸡蛋',note:'测试',calories:150,protein:13,createdAt:'2021',updatedAt:'2021'} ];
  for (const sort of ['name','calories','protein','createdAt','updatedAt']) {
    assert.deepEqual(sortLibraryFoods(foods,'测试',sort,'asc').map(x=>x.id).reverse(),sortLibraryFoods(foods,'测试',sort,'desc').map(x=>x.id));
  }
  assert.equal(sortLibraryFoods(foods)[0].name,'鸡蛋');
  assert.equal(sortLibraryFoods(foods,'鸡')[0].name,'鸡蛋');
  assert.equal(libraryId(' Rice  '),libraryId('rice'));
});
