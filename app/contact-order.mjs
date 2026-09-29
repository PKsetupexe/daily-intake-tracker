import { pinyin } from 'pinyin-pro';
export function initial(name){const first=Array.from(String(name).normalize('NFKC').trim())[0]||'';if(/[0-9]/.test(first))return '0–9';const letter=pinyin(first,{pattern:'first',toneType:'none'}).toUpperCase();return /^[A-Z]$/.test(letter)?letter:'#';}
const compare=(a,b)=>a.name.localeCompare(b.name,'zh-CN-u-co-pinyin',{numeric:true})||a.id.localeCompare(b.id);
export function directoryGroups(items,records,pins,sort,query,keyOf){
 const available=new Set(items.map(x=>x.id)),manual=[...new Set(pins)].filter(id=>available.has(id)).slice(0,5),recent=new Map();
 for(const r of records){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date||''))continue;const id=keyOf(r),stamp=r.date+'T'+(r.time||'00:00');if(available.has(id)&&stamp>(recent.get(id)||''))recent.set(id,stamp);}
 const chronological=[...items].filter(x=>recent.has(x.id)).sort((a,b)=>recent.get(b.id).localeCompare(recent.get(a.id))||compare(a,b));
 const auto=chronological.filter(x=>!manual.includes(x.id)).slice(0,Math.min(3,5-manual.length)).map(x=>x.id),top=[...manual,...auto],groups=[];
 const match=x=>(x.name+' '+(x.note||'')+' '+(x.intensity||'')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
 const pinned=top.map(id=>items.find(x=>x.id===id)).filter(match);if(pinned.length)groups.push({label:'置顶',items:pinned});
 let rest=items.filter(x=>!top.includes(x.id)&&match(x));
 if(sort==='recent'){const used=chronological.filter(x=>rest.some(y=>y.id===x.id));if(used.length)groups.push({label:'最近记录',items:used});rest=rest.filter(x=>!recent.has(x.id));}
 const buckets=new Map();for(const item of rest.sort(compare)){const letter=initial(item.name);if(!buckets.has(letter))buckets.set(letter,[]);buckets.get(letter).push(item);}
 for(const label of [...buckets.keys()].sort((a,b)=>a==='#'?1:b==='#'?-1:a.localeCompare(b)))groups.push({label,items:buckets.get(label)});
 return {groups,manual,auto};
}
