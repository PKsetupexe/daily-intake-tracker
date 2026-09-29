import { splitFoodName } from './food-name.mjs';
import { libraryId } from './food-library.mjs';
const validDate = value => Number.isFinite(Date.parse(value || ''));

// Pure plan: retain every dietary record and its nutrient values; merge only reusable library entries.
export function planFoodNameCleanup(rows, timestamp) {
  const foods = [], puts = [], deletes = [], groups = new Map();
  const allLibrary = new Map(rows.filter(row => row.store === 'foodLibrary').map(row => [row.id, row]));
  for (const row of rows) {
    if (row.deleted) continue;
    const value = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const cleaned = splitFoodName(value.name, value.note);
    if (row.store === 'foods') {
      if (cleaned.name !== value.name || cleaned.note !== (value.note || '') || !Object.hasOwn(value, 'note')) foods.push({ ...value, ...cleaned });
    } else if (row.store === 'foodLibrary' && cleaned.name) {
      const id = libraryId(cleaned.name);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ row, value, cleaned });
    }
  }
  for (const [id, group] of groups) {
    // A canonical tombstone is an intentional deletion, including after a remote stale alias reappears.
    const canonical = allLibrary.get(id);
    if (canonical?.deleted) {
      for (const item of group) deletes.push(item.row.id);
      continue;
    }
    group.sort((a, b) => String(b.value.updatedAt || b.row.updated_at).localeCompare(String(a.value.updatedAt || a.row.updated_at)) || a.row.id.localeCompare(b.row.id));
    const latest = group[0];
    const earliest = group.map(item => item.value.createdAt).filter(validDate).sort()[0] || latest.value.createdAt || timestamp;
    const targetId = group.length === 1 && latest.cleaned.name === latest.value.name ? latest.row.id : id;
    const current = group.find(item => item.row.id === targetId);
    const changed = group.length > 1 || !current || latest.cleaned.name !== latest.value.name || latest.cleaned.note !== (latest.value.note || '') || earliest !== latest.value.createdAt;
    if (changed) puts.push({ ...latest.value, ...latest.cleaned, id: targetId, createdAt: earliest, updatedAt: timestamp });
    for (const item of group) if (item.row.id !== targetId) deletes.push(item.row.id);
  }
  return { foods, puts, deletes };
}
