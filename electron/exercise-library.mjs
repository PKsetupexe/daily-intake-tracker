export const WALKING_COEFFICIENT = 0.35;
export const normalizeSex = value => ({男:'male',女:'female',male:'male',female:'female'})[value] || 'unspecified';
const tidy = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ');
export function isWalking(value) {
  if (/跑步|跑走|跑步机跑|骑行|登山|爬楼|run|jog/i.test(String(value.name || ''))) return false;
  return value.kind === 'walking' || /步行|走路|散步|快走|慢走|walking/i.test(String(value.name || ''));
}
const intensityName = value => ({low:'低强度',light:'低强度',轻度:'低强度',低:'低强度',moderate:'中等强度',中等:'中等强度',一般:'中等强度',high:'高强度',vigorous:'高强度',高:'高强度'})[tidy(value)] || tidy(value);
export function normalizeExerciseRecord(value, defaultSex = 'unspecified') {
  const raw = tidy(value.name);
  let note = String(value.note || '').trim();
  const moved=[];
  const durationPattern=/(?:约|大约)?\d+(?:\.\d+)?\s*(?:分钟(?!\/公里)|小时|mins?\b(?!\/km)|hours?\b)|半小时|\d+(?:\.\d+)?\s*步/g;
  let name=raw.replace(durationPattern, match=>{moved.push(match);return ' ';}).replace(/[()（）]/g,' ').replace(/[,，；;]+/g,' ').replace(/\s+/g,' ').trim();
  const walking=isWalking(value);
  const explicitIntensity=raw.match(/(?:极低|较低|低|轻|中等|较高|高|一般)强度/)?.[0];
  const intensity=intensityName(explicitIntensity || value.intensity || '未注明强度');
  // MET is an estimation assumption, not a distinct activity when intensity is already known.
  const metPattern=/\bMET\s*(?:约|[:：=])?\s*(\d+(?:\.\d+)?)/gi;
  const metNotes=[...raw.matchAll(metPattern)].map(x=>`代谢当量 ${Number(x[1])}`);
  note=note.replace(/\bMET(?=\s*(?:约|[:：=]|\d))/gi,'代谢当量');
  for(const item of metNotes) if(!note.includes(item))note+=`${note?'\n':''}${item}`;
  if (walking) name='步行';
  else {
    name=name.replace(metPattern,' ').replace(/(?:极低|较低|低|轻|中等|较高|高|一般|未注明)强度/g,' ');
    const context=`${raw} ${value.pace || ''} ${note}`;
    const pacePattern=/(?:配速\s*)?(\d+(?:[:：]\d{1,2}|\.\d+)?)\s*(?:分配|分\/公里|分钟\/公里|min\/km)/i;
    const pace=context.match(pacePattern);
    let paceLabel='';
    if(pace){const parts=pace[1].split(/[:：]/);const minutes=parts.length===2?Number(parts[0])+Number(parts[1])/60:Number(parts[0]);paceLabel=`配速${Number(minutes.toFixed(4))}分/公里`;name=name.replace(pacePattern,' ');}
    const speedPattern=/\d+(?:\.\d+)?(?:[–~-]\d+(?:\.\d+)?)?\s*(?:km\/h|公里\/小时)/i;
    const speed=pace?'':context.match(speedPattern)?.[0]?.replace(/\s+/g,'').replace('公里/小时','km/h');
    if(pace)name=name.replace(speedPattern,' ');
    if(speed)name=name.replace(speedPattern,' ');
    name=tidy(name.replace(/[·|]+/g,' '));
    if(/^(?:健身房)?(?:无氧)?(?:力量|抗阻)训练(?:\s*无氧)?$/.test(name))name='力量训练';
    if(/^(?:骑自行车|自行车骑行|骑单车)$/.test(name))name='骑行';
    if(name==='慢跑')name='跑步';
    const pieces=[name,intensity,paceLabel,speed].filter(Boolean);
    name=[...new Set(pieces)].join(' · ');
  }
  const extras=[...new Set(moved)].filter(item=>!note.includes(item));
  if(extras.length)note+=`${note?'\n':''}记录时长/步数：${extras.join('；')}`;
  const result={...value,name:name||'未命名运动',note,intensity,kind:walking?'walking':'exercise',sex:normalizeSex(value.sex || defaultSex)};
  delete result.caloriesPer10Minutes; delete result.caloriesPer1000;
  const calories=Number(value.calories),duration=Number(value.duration),steps=Number(value.steps);
  if(walking && Number.isFinite(steps)&&steps>0&&Number.isFinite(calories)&&calories>=0)result.caloriesPer1000=calories*1000/steps;
  if(!walking && Number.isFinite(duration)&&duration>0&&Number.isFinite(calories)&&calories>=0)result.caloriesPer10Minutes=calories*10/duration;
  return result;
}
export function exerciseLibraryId(name, sex) { return `exercise-library:${normalizeSex(sex)}:${encodeURIComponent(tidy(name).toLowerCase())}`; }
export function walkingProfileId(sex) { return `walking:${normalizeSex(sex)}`; }
export function weightForDate(weights,date) {
  const valid=weights.filter(row=>Number.isFinite(Number(row.weight))&&Number(row.weight)>0&&row.date).sort((a,b)=>a.date.localeCompare(b.date));
  const before=valid.filter(row=>row.date<=date).at(-1),after=valid.find(row=>row.date>=date);
  if(!before)return after?Number(after.weight):null;
  if(!after||before.date===after.date)return Number(before.weight);
  const ratio=(Date.parse(date)-Date.parse(before.date))/(Date.parse(after.date)-Date.parse(before.date));
  return Number(before.weight)+(Number(after.weight)-Number(before.weight))*ratio;
}
export function walkingRate(profile,weight) {
  if(profile?.mode==='manual')return profile.manualCaloriesPer1000 == null ? null : Number(profile.manualCaloriesPer1000);
  return Number.isFinite(weight)&&weight>0?Math.round(weight*WALKING_COEFFICIENT*1e8)/1e8:null;
}
export function sortExercises(items,query='',sort='name',direction='asc',sex='all') {
 const collator=new Intl.Collator('zh-Hans-CN-u-co-pinyin',{numeric:true});
 const q=tidy(query).toLowerCase();
 return items.filter(x=>(sex==='all'||x.sex===sex)&&`${x.name} ${x.note}`.toLowerCase().includes(q)).slice().sort((a,b)=>{
 const result=sort==='name'?collator.compare(a.name,b.name):sort==='caloriesPer10Minutes'?a[sort]-b[sort]:String(a[sort]||'').localeCompare(String(b[sort]||''));
 return (result||collator.compare(a.name,b.name)||a.id.localeCompare(b.id))*(direction==='desc'?-1:1);
 });
}
