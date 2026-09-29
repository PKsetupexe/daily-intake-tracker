const normalizeText = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const NAME_ALIASES = {
  '中杯可乐': ['可乐', '中杯'],
  '小苹果': ['苹果', '小个'],
  '水烫生菜': ['水煮生菜', '水烫'],
  '煮生菜': ['水煮生菜', '水煮'],
  '煮上海青': ['水煮上海青', '水煮'],
  '水煮混合部位纯鸡肉': ['水煮鸡肉', '混合部位纯鸡肉'],
};

// Only remove explicit annotations/servings; brands, preparation and product names remain distinct.
export function splitFoodName(rawName, rawNote = '') {
  const original = normalizeText(rawName);
  const details = [];
  const preparations = [];
  const preparation = /(?:少油|减油|低油|无油|无糖|减糖|低糖|去皮|带皮|去酱|不加酱|油炸|水煮|清蒸|生重|熟重|生食|熟食)/;
  let name = original;
  for (let pass = 0; pass < 10 && /\([^()]*\)|\[[^\[\]]*\]|【[^【】]*】/.test(name); pass++) {
    name = name.replace(/\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】/g, (_match, a, b, c) => {
      const detail = normalizeText(a ?? b ?? c);
      for(const part of detail.split(/[,，;；]/).map(normalizeText).filter(Boolean)){
        if(preparation.test(part)){const kept=part.replace(/(?:约)?\d+(?:\.\d+)?\s*(?:kg|g|ml|克|个|份|毫升)/gi,'').trim();if(kept)preparations.push(kept);}

      }
      if(detail)details.push(detail);
      return ' ';
    });
  }
  // A unit is mandatory: do not strip product numbers such as 维生素B12 or 可乐Zero.
  name = name.replace(/(?:\s*[,，:：·-]?\s*)((?:约|大约)?(?:\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(?:kg|mg|g|ml|毫升|千克|公斤|克|斤|两|个|颗|根|片|碗|杯|瓶|袋|份|块|只|枚|包)(?:毛重|净重|可食部)?)[。]?$/i, (_match, detail) => { details.push(detail); return ''; });
  name = normalizeText(name);
  if (!name) return { name: original, note: String(rawNote || '') };
  // Recover preparation annotations removed by earlier app versions, only from the explicit annotation line.
  for(const line of String(rawNote||'').split('\n').filter(x=>x.startsWith('名称补充：')))for(const part of line.slice(5).split(/[；;，,]/)){if(preparation.test(part)&&!/[0-9]/.test(part))preparations.push(normalizeText(part));}
  for(const part of [...new Set(preparations)])if(!name.includes(part))name=`${part}${name}`;
  const alias = NAME_ALIASES[name];
  if (alias) { name = alias[0]; details.push(alias[1]); }
  let note = String(rawNote || '').trim();
  const extras = [...new Set(details)].filter(detail => !note.includes(detail));
  if (extras.length) note += `${note ? '\n' : ''}名称补充：${extras.join('；')}`;
  return { name, note };
}

export function normalizeFoodRecord(value) {
  return { ...value, ...splitFoodName(value.name, value.note) };
}
