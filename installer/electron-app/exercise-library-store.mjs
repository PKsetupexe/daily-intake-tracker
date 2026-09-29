import { normalizeExerciseRecord,normalizeSex,exerciseLibraryId,walkingProfileId,weightForDate,walkingRate } from './exercise-library.mjs';
const currentDate=()=>new Date().toLocaleDateString('en-CA');
const read=(db,store)=>db.prepare('SELECT id,data,updated_at,deleted FROM records WHERE store=?').all(store).map(row=>({...row,value:JSON.parse(row.data)}));
export function getWalkingContext(db,date=currentDate(),sexOverride) {
 const profile=read(db,'profile').find(x=>!x.deleted)?.value||{};
 const sex=normalizeSex(sexOverride||profile.sex);
 const stored=read(db,'walkingProfiles').find(x=>!x.deleted&&x.id===walkingProfileId(sex))?.value;
 const weight=weightForDate(read(db,'weights').filter(x=>!x.deleted).map(x=>x.value),date);
 return {sex,date,weight,mode:stored?.mode||'auto',manualCaloriesPer1000:stored?.manualCaloriesPer1000??null,caloriesPer1000:walkingRate(stored,weight),canLlmEstimate:stored?.mode==='manual'&&stored.manualCaloriesPer1000==null,profile:stored||null};
}
export function prepareWalkingProfile(db,value,timestamp) {
 const sex=normalizeSex(value.sex);const id=walkingProfileId(sex);
 const previous=read(db,'walkingProfiles').find(row=>row.id===id)?.value;
 if(!['auto','manual'].includes(value.mode))throw Error('请选择自动或手动模式');
 const manual=value.manualCaloriesPer1000==null||value.manualCaloriesPer1000===''?null:Number(value.manualCaloriesPer1000);
 if(manual!==null&&(!Number.isFinite(manual)||manual<0))throw Error('每千步耗能必须是有效非负数');
 const weight=getWalkingContext(db,currentDate(),sex).weight;
 const mode=value.mode;
 return {...previous,...value,id,sex,mode,manualCaloriesPer1000:manual,caloriesPer1000:walkingRate({mode,manualCaloriesPer1000:manual},weight),referenceWeight:mode==='auto'?weight:previous?.referenceWeight??null,createdAt:previous?.createdAt||timestamp,updatedAt:timestamp};
}
export function prepareExerciseLibrary(db,value,timestamp) {
 const cleaned=normalizeExerciseRecord(value,value.sex);
 if(cleaned.kind==='walking')throw Error('步行请在独立步行设置中管理');
 const calories=Number(value.caloriesPer10Minutes);
 if(!cleaned.name||!Number.isFinite(calories)||calories<0)throw Error('请填写运动名称和有效的每10分钟耗能');
 const previous=read(db,'exerciseLibrary').find(row=>row.id===value.id)?.value;
 const id=previous?.id||exerciseLibraryId(cleaned.name,cleaned.sex);
 const duplicate=read(db,'exerciseLibrary').find(row=>!row.deleted&&row.id!==id&&exerciseLibraryId(row.value.name,row.value.sex)===exerciseLibraryId(cleaned.name,cleaned.sex));
 if(duplicate)throw Error('已有同名称、同性别的运动，请修改已有条目');
 return {...cleaned,id,caloriesPer10Minutes:calories,baseMinutes:10,createdAt:previous?.createdAt||value.createdAt||timestamp,updatedAt:timestamp};
}
export function planExerciseMigration(db,timestamp) {
 const defaultSex=normalizeSex(read(db,'profile').find(x=>!x.deleted)?.value.sex);
 const updates=[],library=[],walking=[];const groups=new Map();
 const existing=read(db,'exerciseLibrary');
 for(const row of read(db,'exercises').filter(x=>!x.deleted).sort((a,b)=>a.updated_at.localeCompare(b.updated_at)||a.id.localeCompare(b.id))){
  const cleaned=normalizeExerciseRecord(row.value,defaultSex);
  if(JSON.stringify(cleaned)!==JSON.stringify(row.value))updates.push(cleaned);
  if(cleaned.kind==='walking')continue;
  if(!Number.isFinite(cleaned.caloriesPer10Minutes))continue;
  const id=exerciseLibraryId(cleaned.name,cleaned.sex);
  const group=groups.get(id);
  groups.set(id,{row,value:cleaned,createdAt:group?.createdAt||row.updated_at});
 }
 for(const [id,item] of groups){
  const old=existing.find(row=>row.id===id)||existing.find(row=>!row.deleted&&exerciseLibraryId(row.value.name,row.value.sex)===id)||existing.find(row=>exerciseLibraryId(row.value.name,row.value.sex)===id);
  if(old?.deleted)continue;
  if(old&&(item.value.libraryId||item.row.updated_at<=old.updated_at))continue;
  library.push({id:old?.id||id,name:item.value.name,intensity:item.value.intensity,sex:item.value.sex,note:item.value.note,caloriesPer10Minutes:item.value.caloriesPer10Minutes,createdAt:old?.value.createdAt||item.createdAt,updatedAt:timestamp,sourceRecordId:item.row.id});
 }
 const allWalking=read(db,'walkingProfiles');
 const hasBodyData=read(db,'profile').some(x=>!x.deleted)||read(db,'weights').some(x=>!x.deleted);
 const sexes=new Set([...(hasBodyData?[defaultSex]:[]),...allWalking.filter(x=>!x.deleted).map(x=>x.value.sex),...read(db,'exercises').filter(x=>!x.deleted&&normalizeExerciseRecord(x.value,defaultSex).kind==='walking').map(x=>normalizeSex(x.value.sex||defaultSex))]);
 for(const sex of sexes){
  const previous=allWalking.find(x=>x.id===walkingProfileId(sex));
  if(previous?.deleted||previous?.value.mode==='manual')continue;
  const context=getWalkingContext(db,currentDate(),sex);
  if(previous&&previous.value.caloriesPer1000===context.caloriesPer1000&&previous.value.referenceWeight===context.weight)continue;
  walking.push({...previous?.value,id:walkingProfileId(sex),sex,mode:'auto',manualCaloriesPer1000:previous?.value.manualCaloriesPer1000??null,caloriesPer1000:context.caloriesPer1000,referenceWeight:context.weight,createdAt:previous?.value.createdAt||timestamp,updatedAt:timestamp});
 }
 return {updates,library,walking};
}
export function applyWalkingPolicy(db,value,{allowSeed=false}={}) {
 const defaultSex=read(db,'profile').find(x=>!x.deleted)?.value.sex;
 const record=normalizeExerciseRecord(value,defaultSex);
 if(record.kind!=='walking'){
  if(!Number.isFinite(Number(record.duration))||Number(record.duration)<=0)throw Error('非步行运动需要大于0的有效时长');
  if(!Number.isFinite(Number(record.calories))||Number(record.calories)<0)throw Error('耗能必须是有效非负数');
  return {record:{...record,duration:Number(record.duration),calories:Number(record.calories)},seed:null};
 }
 if(!Number.isInteger(Number(record.steps))||Number(record.steps)<=0)throw Error('步行记录需要大于0的步数');
 const context=getWalkingContext(db,record.date||currentDate(),record.sex);
 let rate=context.caloriesPer1000,seed=null;
 if(rate==null&&context.canLlmEstimate&&allowSeed&&Number.isFinite(Number(record.calories))&&Number(record.calories)>0){
  rate=Number(record.calories)*1000/Number(record.steps);
  seed={...context.profile,id:walkingProfileId(record.sex),sex:record.sex,mode:'manual',manualCaloriesPer1000:rate,source:'llm-initial'};
 }
 if(rate==null)throw Error(context.mode==='auto'?'自动步行估算需要体重，请先记录体重':'手动步行费率为空，请填写每千步耗能，或通过AI首次估算');
 return {record:{...record,calories:Number(record.steps)*rate/1000,caloriesPer1000:rate,walkingRate:rate,walkingMode:context.mode},seed};
}
