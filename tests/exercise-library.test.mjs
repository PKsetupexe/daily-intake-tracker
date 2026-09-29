import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExerciseRecord,isWalking,walkingRate,exerciseLibraryId,weightForDate} from '../app/exercise-library.mjs';

test('exercise durations are removed while pace and intensity remain distinct',()=>{
 const a=normalizeExerciseRecord({name:'中等强度10分钟健身房运动',duration:10,calories:60});
 const b=normalizeExerciseRecord({name:'较低强度10分钟健身房运动',duration:10,calories:30});
 assert.ok(a.name.includes('中等强度'));assert.ok(b.name.includes('较低强度'));assert.ok(!a.name.includes('10分钟'));assert.notEqual(a.name,b.name);
 const run=pace=>normalizeExerciseRecord({name:`${pace}分配跑步10分钟`,duration:10,steps:1500,calories:100});
 assert.ok(run(8).name.includes('配速8分/公里'));assert.notEqual(run(8).name,run(5).name);assert.equal(isWalking(run(8)),false);
 assert.ok(normalizeExerciseRecord({name:'配速5:00min/km跑步30分钟',duration:30,calories:300}).name.includes('配速5分/公里'));
 assert.deepEqual(normalizeExerciseRecord(a),a);
});
test('ten minute conversion and sex keys, walking manual null vs zero',()=>{
 const record=normalizeExerciseRecord({name:'骑行',duration:32,calories:183,intensity:'moderate',sex:'female'});
 assert.equal(record.caloriesPer10Minutes,183*10/32);assert.ok(record.name.includes('中等强度'));
 assert.notEqual(exerciseLibraryId(record.name,'male'),exerciseLibraryId(record.name,'female'));
 assert.equal(walkingRate({mode:'auto'},70),24.5);assert.equal(walkingRate({mode:'manual',manualCaloriesPer1000:30},80),30);
 assert.equal(walkingRate({mode:'manual',manualCaloriesPer1000:0},80),0);assert.equal(walkingRate({mode:'manual',manualCaloriesPer1000:null},80),null);
 assert.equal(weightForDate([{date:'2026-01-01',weight:70},{date:'2026-01-03',weight:72}],'2026-01-02'),71);
});

test('equivalent activity wording merges without erasing real intensity or pace',()=>{
 const clean=name=>normalizeExerciseRecord({name,intensity:'中等强度',sex:'male',duration:30,calories:150});
 assert.equal(clean('健身房力量训练 无氧 · 中等强度 · MET5').name,clean('力量训练 · 中等强度 · MET4').name);
 assert.equal(clean('8分配跑步10分钟').name,clean('跑步 · 配速8:00min/km').name);
 assert.notEqual(clean('较低强度力量训练').name,clean('中等强度力量训练').name);
 const a=clean('骑行 · 16–19km/h');assert.ok(a.name.includes('16–19km/h'));assert.deepEqual(normalizeExerciseRecord(a),a);
});
