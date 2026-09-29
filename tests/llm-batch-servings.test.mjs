import test from 'node:test';
import assert from 'node:assert/strict';
import {expandRecordActions,durationMinutes,numericValue} from '../electron/llm-batch.mjs';
import {estimateServing,planDefaultServings} from '../electron/default-servings.mjs';
import {DatabaseSync} from 'node:sqlite';
test('batch objects expand and exercise units normalize',()=>{
 assert.equal(expandRecordActions({actions:[{store:'foods',value:[{name:'番茄炒蛋'},{name:'米饭'}]},{store:'exercises',value:{name:'步行'}}]}).length,3);
 assert.equal(durationMinutes('1小时'),60);assert.equal(durationMinutes('半小时'),30);assert.equal(durationMinutes('1小时30分钟'),90);assert.equal(numericValue('10,000步'),10000);assert.ok(Number.isNaN(durationMinutes('不清楚')));
 assert.throws(()=>expandRecordActions({actions:[{store:'foods',value:'invalid'}]}));
});
test('default portions use latest intake date before edit date, preserve manual values, and fill unknown foods',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE records(store TEXT,id TEXT,data TEXT,updated_at TEXT,deleted INTEGER DEFAULT 0)');
 const put=(store,id,value,date)=>db.prepare('INSERT INTO records(store,id,data,updated_at) VALUES(?,?,?,?)').run(store,id,JSON.stringify({id,...value}),date);
 put('foodLibrary','rice',{name:'白米饭'},'2026-09-01');
 put('foodLibrary','burger',{name:'汉堡',note:'1个=155g'},'2026-09-01');
 put('foodLibrary','manual',{name:'苹果',defaultServingGrams:120,servingUpdatedAt:'2026-09-12'},'2026-09-12');
 put('foods','older',{name:'白米饭',date:'2026-09-01',weight:350},'2026-09-10');
 put('foods','newer',{name:'白米饭',date:'2026-09-02',weight:200},'2026-09-03');
 put('foods','apple',{name:'苹果',date:'2026-09-02',weight:180},'2026-09-03');
 const plan=planDefaultServings(db);assert.equal(plan.find(x=>x.id==='rice').defaultServingGrams,200);assert.equal(plan.find(x=>x.id==='burger').defaultServingGrams,155);assert.ok(!plan.some(x=>x.id==='manual'));
 for(const value of plan)db.prepare("UPDATE records SET data=? WHERE store='foodLibrary' AND id=?").run(JSON.stringify(value),value.id);assert.equal(planDefaultServings(db).length,0);
 assert.equal(estimateServing({name:'未知食品'}).source,'estimated');db.close();
});
