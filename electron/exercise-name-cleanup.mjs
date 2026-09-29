import {normalizeExerciseRecord,exerciseLibraryId} from './exercise-library.mjs';
export function planExerciseNameCleanup(rows,timestamp){
 const groups=new Map(),puts=[],deletes=[],updates=[],aliases=new Map();
 const library=rows.filter(x=>x.store==='exerciseLibrary');
 const history=new Map(rows.filter(x=>x.store==='exercises').map(row=>[row.id,typeof row.data==='string'?JSON.parse(row.data):row.data]));
 const sourceDate=item=>{const source=history.get(item.value.sourceRecordId);return source?[source.date,source.time].join('T'):'';};
 for(const row of library.filter(x=>!x.deleted)){
  const value=typeof row.data==='string'?JSON.parse(row.data):row.data;
  const cleaned=normalizeExerciseRecord(value,value.sex);
  const id=exerciseLibraryId(cleaned.name,cleaned.sex);
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push({row,value,cleaned});aliases.set(row.id,id);
 }
 for(const [id,items]of groups){
  if(library.find(x=>x.id===id)?.deleted){deletes.push(...items.map(x=>x.row.id));continue;}
  items.sort((a,b)=>String(b.value.updatedAt||b.row.updated_at).localeCompare(String(a.value.updatedAt||a.row.updated_at))||sourceDate(b).localeCompare(sourceDate(a))||a.row.id.localeCompare(b.row.id));
  const latest=items[0],createdAt=items.map(x=>x.value.createdAt||x.row.updated_at).sort()[0];
  const note=[...new Set(items.map(x=>x.cleaned.note).filter(Boolean))].join('\n');
  const changed=items.length>1||latest.row.id!==id||latest.cleaned.name!==latest.value.name||latest.cleaned.note!==(latest.value.note||'');
  if(changed)puts.push({...latest.value,name:latest.cleaned.name,intensity:latest.cleaned.intensity,sex:latest.cleaned.sex,id,note,createdAt,updatedAt:timestamp});
  for(const item of items)if(item.row.id!==id)deletes.push(item.row.id);
 }
 for(const row of rows.filter(x=>x.store==='exercises'&&!x.deleted)){
  const value=typeof row.data==='string'?JSON.parse(row.data):row.data;
  const cleaned=normalizeExerciseRecord(value,value.sex);
  if(value.libraryId&&aliases.has(value.libraryId))cleaned.libraryId=aliases.get(value.libraryId);
  if(JSON.stringify(cleaned)!==JSON.stringify(value))updates.push(cleaned);
 }
 return {puts,deletes,updates};
}
