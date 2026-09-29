import { foodKey, libraryId, scaleNutrients, normalizeLibraryFood } from './food-library.mjs';
export function prepareLibraryWrite(database, value, timestamp) {
  const row = database.prepare("SELECT data FROM records WHERE store = 'foodLibrary' AND id = ?").get(String(value.id || libraryId(value.name)));
  const previous = row ? JSON.parse(row.data) : undefined;
  const result = normalizeLibraryFood(value, previous, timestamp);
  const duplicate = database.prepare("SELECT id, data FROM records WHERE store = 'foodLibrary' AND deleted = 0").all()
    .find(item => item.id !== result.id && foodKey(JSON.parse(item.data).name) === foodKey(result.name));
  if (duplicate) throw new Error('食品库已有同名食品，请修改已有记录');
  return result;
}
// Deleted rows deliberately participate: automatic migration must never resurrect user deletions.
export function backfillFoodLibrary(database, write) {
  const known = new Set();
  for (const row of database.prepare("SELECT id, data FROM records WHERE store = 'foodLibrary'").all()) {
    known.add(row.id); known.add(libraryId(JSON.parse(row.data).name));
  }
  const groups = new Map();
  for (const row of database.prepare("SELECT data, updated_at FROM records WHERE store = 'foods' AND deleted = 0 ORDER BY updated_at, id").all()) {
    try {
      const food = JSON.parse(row.data);
      if (!foodKey(food.name)) continue;
      const id = libraryId(food.name);
      if (known.has(id)) continue;
      const nutrients = scaleNutrients(food, 100, Number(food.weight));
      const recorded = food.createdAt || (/^\d{4}-\d{2}-\d{2}$/.test(food.date || '') ? `${food.date}T${food.time || '12:00'}:00+08:00` : row.updated_at);
      const createdAt = Number.isFinite(Date.parse(recorded)) ? new Date(recorded).toISOString() : row.updated_at;
      const previous = groups.get(id);
      groups.set(id, { id, name: String(food.name).trim(), weight: 100, ...nutrients, note: String(food.note || ''),
        createdAt: previous && previous.createdAt < createdAt ? previous.createdAt : createdAt, updatedAt: row.updated_at });
    } catch { /* Old entries without usable weights or nutrients cannot be normalized. */ }
  }
  for (const value of groups.values()) write('foodLibrary', value);
  return groups.size;
}

// Plan only explicit edits; historical reconciliation must not overwrite user library corrections.
export function planEditedFoodLibrary(database, previous, value, timestamp) {
  if (!previous || !(Number(value.weight)>0)) return {puts:[],deletes:[]};
  const rows=database.prepare("SELECT id,data,deleted FROM records WHERE store='foodLibrary'").all();
  const old=rows.find(r=>foodKey(JSON.parse(r.data).name)===foodKey(previous.name));
  const target=rows.find(r=>foodKey(JSON.parse(r.data).name)===foodKey(value.name));
  const renamed=foodKey(previous.name)!==foodKey(value.name);
  const nutrients=scaleNutrients(value,100,Number(value.weight));
  let changed=true;
  try { const before=scaleNutrients(previous,100,Number(previous.weight));changed=Object.keys(nutrients).some(k=>Math.abs(nutrients[k]-before[k])>1e-8*Math.max(1,Math.abs(before[k]))); } catch {}
  if ((!changed&&!renamed)||target?.deleted) return {puts:[],deletes:[]};
  const base=target?JSON.parse(target.data):old&&!old.deleted?JSON.parse(old.data):{};
  const result={...base,id:target?.id||libraryId(value.name),name:value.name,weight:100,
    ...(changed?nutrients:(Object.keys(base).length?scaleNutrients(base,100):nutrients)),
    note:value.note||'',...(changed&&base.reportedNutrients?{reportedNutrients:[...new Set([...base.reportedNutrients,...Object.keys(nutrients).filter(k=>nutrients[k]!==Number(base[k]||0))])]}:{}),defaultServingGrams:Number(value.weight),servingRecordId:value.id,
    servingSource:'history',servingBasis:'最近编辑的摄入记录克重',servingUpdatedAt:timestamp,updatedAt:timestamp};
  const shared=database.prepare("SELECT data FROM records WHERE store='foods' AND deleted=0 AND id<>?").all(value.id).some(r=>foodKey(JSON.parse(r.data).name)===foodKey(previous.name));
  return {puts:[result],deletes:renamed&&old&&!old.deleted&&!shared?[old.id]:[]};
}
