import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFoodName } from '../app/food-name.mjs';
import { libraryId } from '../app/food-library.mjs';
import { planFoodNameCleanup } from '../electron/food-name-cleanup.mjs';

test('serving annotations move into existing notes without changing food identity', () => {
  for (const name of ['白米饭 (300g)','白米饭（360g）','白米饭 350g']) {
    assert.equal(splitFoodName(name).name,'白米饭');
    assert.equal(libraryId(name),libraryId('白米饭'));
  }
  const clean=splitFoodName('脆桃 (2个, 约280g)','原来的估算说明');
  assert.equal(clean.name,'脆桃'); assert.ok(clean.note.includes('原来的估算说明'));assert.ok(clean.note.includes('2个, 约280g'));
  assert.deepEqual(splitFoodName(clean.name,clean.note),clean);
  assert.equal(splitFoodName('维生素B12').name,'维生素B12');
  assert.equal(splitFoodName('麦当劳无糖可乐麦炫酷').name,'麦当劳无糖可乐麦炫酷');
  assert.equal(splitFoodName('糖醋鸡翅中 (3个, 减糖版本)').name,'减糖版本糖醋鸡翅中');
});
test('cleanup merges library nutrition by latest version and preserves dietary quantities', () => {
  const row=(store,id,value,updated_at='2026-08-01')=>({store,id,data:JSON.stringify({id,...value}),updated_at,deleted:0});
  const rows=[row('foods','meal1',{name:'白米饭 (300g)',weight:300,calories:360,note:'原备注'}),row('foods','meal2',{name:'白米饭 (360g)',weight:360,calories:432}),row('foodLibrary','a',{name:'白米饭 (300g)',calories:120,createdAt:'2026-01-01',updatedAt:'2026-08-01'}),row('foodLibrary','b',{name:'白米饭 (360g)',calories:125,createdAt:'2026-02-01',updatedAt:'2026-08-02'})];
  const plan=planFoodNameCleanup(rows,'2026-09-10');
  assert.equal(plan.foods.length,2);assert.equal(plan.foods[0].weight,300);assert.equal(plan.foods[1].calories,432);
  assert.equal(plan.puts.length,1);assert.equal(plan.puts[0].name,'白米饭');assert.equal(plan.puts[0].calories,125);assert.equal(plan.puts[0].createdAt,'2026-01-01');assert.equal(plan.deletes.length,2);
});

test('calorie-changing preparation stays in the title, including old annotations',()=>{
 for(const [raw,part]of [['煎蛋 (少油版, 2个)','少油版'],['鸡腿肉（去皮）','去皮'],['辣椒炒肉（减油版，300g）','减油版']]){
  const value=splitFoodName(raw);assert.ok(value.name.includes(part));assert.deepEqual(splitFoodName(value.name,value.note),value);
 }
 assert.ok(splitFoodName('煎蛋','名称补充：少油版；2个').name.includes('少油版'));
 assert.notEqual(splitFoodName('少油版煎蛋').name,splitFoodName('煎蛋').name);
});
