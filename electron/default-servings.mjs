import {foodKey} from './food-library.mjs';
export function estimateServing(food){
 const name=String(food.name||''),note=String(food.note||'');
 const serving=note.match(/1\s*(?:个|份|瓶|袋)\s*[=＝]\s*(\d+(?:\.\d+)?)\s*g/i);
 if(serving&&Number(serving[1])>0)return {grams:Number(serving[1]),source:'reference',basis:'采用备注中该版本的单个/单份参考重量'};
 const rules=[[/油$|黄油|花生酱|芝麻酱/,10],[/鸡蛋|煎蛋|水煮蛋|茶叶蛋/,50],[/牛奶|酸奶|豆浆|可乐|饮料/,250],[/米饭|意大利面|面条|米粉|河粉|粉丝/,200],[/燕麦|坚果|饼干|薯片/,30],[/苹果|香蕉|桃|梨|橙|西瓜|葡萄|水果/,150],[/鸡|牛|猪|鱼|虾|肉/,150],[/生菜|青菜|番茄|西兰花|黄瓜|蔬菜|土豆|豆腐/,200]];
 const grams=rules.find(([pattern])=>pattern.test(name))?.[1]||100;
 return {grams,source:'estimated',basis:'缺少摄入历史，按常见单人份粗略估测，可按个人习惯修改'};
}
export function planDefaultServings(db){
 const foods=db.prepare("SELECT id,data,updated_at FROM records WHERE store='foods' AND deleted=0").all().map(row=>({...row,value:JSON.parse(row.data)})).filter(x=>Number.isFinite(Number(x.value.weight))&&Number(x.value.weight)>0);
 const updates=[];
 for(const row of db.prepare("SELECT id,data FROM records WHERE store='foodLibrary' AND deleted=0").all()){
  const value=JSON.parse(row.data),candidates=foods.filter(x=>foodKey(x.value.name)===foodKey(value.name));
  const missing=!(Number(value.defaultServingGrams)>0);
  const latest=missing?candidates.sort((a,b)=>String(a.value.date||'').localeCompare(String(b.value.date||''))||String(a.value.time||'').localeCompare(String(b.value.time||''))||a.updated_at.localeCompare(b.updated_at)||a.id.localeCompare(b.id)).at(-1):candidates.filter(x=>x.updated_at>String(value.servingUpdatedAt||value.updatedAt||'')).sort((a,b)=>a.updated_at.localeCompare(b.updated_at)||a.id.localeCompare(b.id)).at(-1);
  if(!missing&&!latest)continue;
  const fallback=estimateServing(value);
  updates.push({...value,defaultServingGrams:latest?Number(latest.value.weight):fallback.grams,servingSource:latest?'history':fallback.source,servingBasis:latest?'最近摄入记录的克重':fallback.basis,servingRecordId:latest?.id||null,servingUpdatedAt:(missing?candidates.map(x=>x.updated_at).sort().at(-1):latest?.updated_at)||value.updatedAt||'2000-01-01T00:00:00.000Z'});
 }
 return updates;
}
