export function expandRecordActions(result){
 const actions=Array.isArray(result.actions)?result.actions:null;
 if(!actions)throw Error('模型返回的 actions 必须是数组');
 const expanded=actions.flatMap(action=>Array.isArray(action?.value)?action.value.map(value=>({...action,value})):Array.isArray(action?.values)?action.values.map(value=>({...action,value})): [action]);
 if(expanded.length>100)throw Error('单次最多记录100条，请分批发送');
 for(const action of expanded)if(!action||typeof action!=='object'||!action.value||typeof action.value!=='object'||Array.isArray(action.value))throw Error('每条记录必须包含独立的 value 对象');
 return expanded;
}
export function numericValue(value){
 if(typeof value==='number')return value;
 if(typeof value!=='string')return Number(value||0);
 const text=value.replace(/[,，]/g,'').trim();
 if(!/^[-+]?\d+(?:\.\d+)?\s*(?:g|克|分钟|min|步|kcal|千卡)?$/i.test(text))return NaN;
 return parseFloat(text);
}
export function durationMinutes(value){
 if(typeof value==='number')return value;
 const text=String(value??'').trim();
 if(!text)return 0;
 if(text==='半小时')return 30;
 const hours=text.match(/^(\d+(?:\.\d+)?)\s*(?:小时|h|hours?)(?:\s*(\d+(?:\.\d+)?)\s*(?:分钟|min))?$/i);
 return hours?Number(hours[1])*60+Number(hours[2]||0):numericValue(text);
}
export const BATCH_RECORD_RULES=`多条记录规则：
用户一句话中提到的每一种已吃食物、每一项已完成运动都必须各写一个action，不得只记第一项或把多个食物/运动塞进一个name。
例如“一份番茄炒鸡蛋和一碗米饭”产生2条foods；“走10000步、一般强度健身1小时、网球半小时”产生3条exercises，分别为步行steps:10000、力量训练duration:60、网球duration:30。
每个value是单条对象，不重复使用id；新增无需提供id，修改才提供原id和operation:update。辅助目标情景只需每日期一条；同日力量与有氧并存时优先strength。
没有克重时优先参考foodLibrary.defaultServingGrams和标准份量备注；普通一份/一碗允许合理估测并说明，不因普通份量未精确称重而拒绝整批。食品营养写本次总量，运动duration单位始终分钟。
输出前逐项核对用户提到的食物和运动是否齐全。估测热量、强度仍遵守食品和运动规则，不把一道菜拆成食材再重复记录。`;
