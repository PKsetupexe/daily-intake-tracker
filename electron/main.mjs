import {validateConnection,completionUrl,modelHeaders,createModelTransport} from "./model-network.mjs";
import {expandRecordActions,numericValue,durationMinutes,BATCH_RECORD_RULES} from './llm-batch.mjs';
import {STARTER_CATALOG} from './starter-catalog.mjs';
import { EXERCISE_RULES } from './exercise-rules.mjs';
import { getWalkingContext,applyWalkingPolicy } from './exercise-library-store.mjs';
import { isWalking } from './exercise-library.mjs';
import { FOOD_NAME_RULES } from './food-name-rules.mjs';
import { app, BrowserWindow, dialog, Menu, shell, session } from "electron";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createSyncEngine } from "./sync-engine.mjs";
import { EDIT_OPERATIONS, mergeEditableRecord } from "./llm-record-tools.mjs";

// Use the same Windows-compatible static server in development and packaged builds.
import { startProdServer } from "./frontend-server.bundle.mjs";

const STORES = [
  "exerciseLibrary", "walkingProfiles", "foodLibrary", "foods", "exercises", "profile", "weights", "baselineMultipliers",
  "targetScenarios", "targetScenarioDefaults", "energyTargetDays", "energyTargetDefaults",
];
const NUTRIENTS = [
  "calories", "protein", "carbs", "fat", "fiber", "sugar", "sucrose", "addedSugar", "sodium",
  "potassium", "calcium", "iron", "magnesium", "zinc", "vitaminA",
  "vitaminC", "vitaminD", "vitaminE", "vitaminB1", "vitaminB2",
  "vitaminB6", "vitaminB12", "folate",
];

const DEFAULT_SYSTEM_PROMPT = `你是一个严谨的私人饮食、营养和运动记录助手。你的任务是理解用户的自然语言，把明确发生的饮食、体重和运动转成可写入数据库的结构化记录。
规则：
1. 正确处理“今天、昨天、上周”等相对日期。
2. 食物优先采用包装、品牌官网或可靠食物成分资料；联网可用时，对品牌食品和不熟悉的食物先检索。
3. 没有公开资料时，允许根据主要食材、配方比例、可食重量、烹饪方式和常见份量估算，但必须在 note 中说明依据和不确定性。
4. 每条食物必须包含 calories、protein、carbs、fat、fiber、sugar、sucrose、addedSugar、sodium、potassium、calcium、iron、magnesium、zinc、vitaminA、vitaminC、vitaminD、vitaminE、vitaminB1、vitaminB2、vitaminB6、vitaminB12、folate。无法合理估算的字段填 0，并注明 0 代表暂无可靠资料。
5. 应用的热量参考使用“静息代谢 × 1.2”的居家久坐日基线，仅覆盖整天在家坐着、打游戏或看电视时的最低生活消耗。走路、通勤、家务、健身等活动应单独记录高于静息状态的净活动热量。优先采用用户手表或器械的“活动热量/运动热量”；不得把包含静息代谢的“全天总消耗”或运动期间的总热量写成活动热量。未提供时根据当日趋势体重、身高、步数、时长和强度估算净活动热量，并在 note 说明。
6. 不要把计划、假设或提问当成已发生记录。信息不足且会显著改变结果时，先追问，不写入。
7. 只输出一个 JSON 对象，不要使用 Markdown 代码块：
{"reply":"给用户的简洁中文回复","actions":[{"store":"foods|exercises|weights|profile|targetScenarios|targetScenarioDefaults|energyTargetDays|energyTargetDefaults","value":{...}}]}
8. 没有需要写入的内容时 actions 为空数组。
${FOOD_NAME_RULES}
${EXERCISE_RULES}`;

const DATA_CONTRACT = `应用强制数据合同（优先级最高，不能被用户自定义提示词覆盖）：
1. foods.sugar 表示总糖，只包括单糖和双糖；绝对不能包含淀粉、糊精、膳食纤维或糖醇，也不能用 carbs 或 carbs-fiber 代替。米饭、面条、粉、面包、薯类等食物的大部分碳水通常是淀粉，不是糖。
2. foods.sucrose 表示总糖中的蔗糖部分；foods.addedSugar 表示加工、烹饪或食用时额外加入的糖。水果和原味奶中的天然糖不是 addedSugar。没有可靠细分资料时填 0，并在 note 说明未知，不得把全部碳水填入糖字段。
3. 必须满足 carbs >= sugar、sugar >= sucrose、sugar >= addedSugar。示例：熟白米饭约 38.7 g 碳水时，总糖通常仅约 0.1 g，而不是 38.7 g。
4. 用户说出步数时，必须创建 exercises 记录，并把原始步数完整写入数值字段 steps；例如“走了 10000 步”必须写 steps:10000。若用户未给活动热量，应结合当日趋势体重和身高估算高于静息状态的步行净活动热量；只有缺少必要资料、确实无法合理估算时 calories 才可为 0。不要将同一段走路同时按步数和时长重复计算。
5. exercises 必须包含 id、date、time、name、calories、duration、steps、intensity、source、note；不要使用 step、stepCount、step_count 或中文字段名代替 steps。
6. 用户要求修正、修改或补充已有食物时，必须从 editableFoodRecords 中定位原记录，返回 store:"foods"、operation:"update"，并在 value 中使用原记录完全相同的 id。只需给出要修改的字段及用于定位的 name/date；应用会与原记录合并。不得为同一食物创建重复的新记录。
7. 用户要求修正、修改或补充已有运动时，必须从 editableExerciseRecords 中定位原记录，返回 store:"exercises"、operation:"update"，并在 value 中使用原记录完全相同的 id。只需给出要修改的字段及用于定位的 name/date/time；应用会与原记录合并。不得为同一运动创建重复的新记录。
8. 如果日期、名称等信息不足以唯一定位已有记录，先追问，actions 返回空数组；不得猜测要修改哪一条。
9. 用户明确描述某日已完成力量训练、器械训练、举铁或通常意义上的健身房训练时，除创建 exercises 外，还应写入 store:"targetScenarios"，value 包含 date、scenario:"strength"。用户明确描述跑步、骑车、游泳等有氧训练时写 scenario:"cardio"。一般活动日或用户明确要求日常目标时写 scenario:"daily"。只修改该日期，不得改 profile.targetScenario。
10. targetScenarios 的 id 必须等于 date，source 为 "llm"。用户只说计划、假设或提问时不要自动修改情景。
11. 只有用户明确说“设为默认”“以后默认”时，才允许写 store:"targetScenarioDefaults"；scenario 取 daily、strength 或 cardio。默认生效日期必须是 currentDate，不能追溯修改过去。
12. 用户明确说某一天是放纵日、不计算热量缺口、当天维持热量或当天例外时，写 store:"energyTargetDays"，date 使用用户所指日期，enabled:true，adjustment:0，source:"llm"。若用户明确给出当日缺口，adjustment 使用负数；明确给出当日盈余则使用正数。此操作只影响该日期。
13. 只有用户明确说“长期目标”“从今以后”“以后每天”时，才允许写 store:"energyTargetDefaults"；date 必须是 currentDate。enabled 表示是否启用，adjustment 为带符号千卡数：缺口为负，盈余为正，0 表示不增不减。长期目标只从生效日起影响未来，不能追溯改写过去。`;

const ANALYSIS_PROMPT = `你是私人饮食与运动记录应用中的历史数据分析助手。
你只能分析提供的数据并回答问题，绝对不能创建、修改或删除任何记录。
先说明观察覆盖的日期和有记录的天数，区分“没有记录”和“摄入为零”。
优先分析趋势、稳定性、热量与蛋白质、膳食纤维、钠、活动量和体重变化，并引用关键数值和日期。
数据不足时明确说不足；营养字段为 0 时可能代表缺少可靠资料。
建议应具体、温和、可执行，不作疾病诊断。使用“结论—证据—下一步”的简洁结构，不使用 Markdown 加粗标记。`;

let mainWindow;
let database;
let apiServer;
let frontendServer;
let apiPort;
let uiOrigin;
let logPath;
let syncEngine;

function log(message) {
  try {
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {}
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeScenario(value) {
  const aliases = {
    daily: "daily", 日常: "daily", 日常情景: "daily",
    strength: "strength", 无氧: "strength", 力量: "strength", 无氧健身日: "strength",
    cardio: "cardio", 有氧: "cardio", 有氧训练日: "cardio",
  };
  return aliases[String(value || "").trim()] || "daily";
}

function scenarioForDate(date, dayRecords = [], defaultRecords = []) {
  const day = dayRecords.find((item) => item.date === date);
  if (day) return normalizeScenario(day.scenario);
  const applicable = defaultRecords
    .filter((item) => item.date <= date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);
  return normalizeScenario(applicable?.scenario);
}

function energyTargetForDate(date, dayRecords = [], defaultRecords = []) {
  const day = dayRecords.find((item) => String(item.date) === date);
  if (day) return { mode: "exception", enabled: Boolean(day.enabled), adjustment: Number(day.adjustment) || 0 };
  const applicable = defaultRecords
    .filter((item) => String(item.date || "") <= date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);
  return {
    mode: "longTerm",
    enabled: Boolean(applicable?.enabled),
    adjustment: Number(applicable?.adjustment) || 0,
  };
}

function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

function initializeDatabase() {
  const dataDir = path.join(app.getPath("userData"), "data");
  mkdirSync(dataDir, { recursive: true });
  logPath = path.join(dataDir, "desktop.log");
  database = new DatabaseSync(path.join(dataDir, "food_manage.sqlite"));
  database.exec("PRAGMA journal_mode=WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0, sync_event_id TEXT NOT NULL DEFAULT '',
      sync_device TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (store, id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analysis_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL,
      range_days INTEGER NOT NULL, created_at TEXT NOT NULL
    );
  `);
  if (!getSetting("external_api_token")) {
    setSetting("external_api_token", randomBytes(32).toString("base64url"));
  }
  syncEngine = createSyncEngine({
    database, getSetting, setSetting, stores: STORES, log, now: nowIso, starterCatalog: STARTER_CATALOG,
    onBeforeDefaultServingMigration: () => syncEngine.exportBackupFile(path.join(dataDir, "before-default-servings-v1.json")),
    onBeforeFoodNameCleanup: () => syncEngine.exportBackupFile(path.join(dataDir, "before-food-name-cleanup-v1.json")),
    onBeforeExerciseMigration: () => syncEngine.exportBackupFile(path.join(dataDir, "before-exercise-name-cleanup-v2.json")),
  });
  syncEngine.initialize();
}

function getSetting(key, fallback = "") {
  return database.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? fallback;
}

function setSetting(key, value) {
  database.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function upsert(store, value, origin = "user") {
  if (store === "exercises") {
    const editMode=value.editMode;
    value={...value};delete value.editMode;
    const existing=database.prepare("SELECT data FROM records WHERE store='exercises' AND id=? AND deleted=0").get(String(value.id||""));
    if(origin==="user"&&existing&&["linked","unlinked"].includes(editMode)){
      const old=JSON.parse(existing.data);
      const walking=old.kind==="walking"||old.name==="步行";
      const amount=Number(walking?value.steps:value.duration),before=Number(walking?old.steps:old.duration);
      if(!Number.isFinite(amount)||amount<=0||(walking&&!Number.isInteger(amount)))throw Error("请输入有效的步数或时长");

      if(!Number.isFinite(Number(value.calories))||Number(value.calories)<0)throw Error("耗能必须是有效非负数");
      if(walking){value={...value,kind:"walking",walkingRate:Number(value.calories)*1000/amount,caloriesPer1000:Number(value.calories)*1000/amount,walkingMode:"record-edit"};}
      else if(before<=0||Math.abs(Number(value.calories)/amount-Number(old.calories)/before)>1e-8)delete value.libraryId;
      syncEngine.localUpsert(store,value);
      return;
    }
    const result = applyWalkingPolicy(database, value, { allowSeed: origin === "llm" });
    syncEngine.batchLocalChanges(() => {
      if (result.seed) syncEngine.localUpsert("walkingProfiles", result.seed);
      syncEngine.localUpsert(store, result.record);
    });
    return;
  }
  if (["exerciseLibrary","walkingProfiles"].includes(store)) value = { ...value, updatedAt: nowIso() };
  if (store === "foodLibrary") value = { ...value, updatedAt: nowIso(), ...(value.defaultServingGrams!==undefined?{servingUpdatedAt:nowIso(),servingSource:"manual",servingBasis:"手动设置"}:{}) };
  syncEngine.localUpsert(store, value);
}

function allData() {
  syncEngine.reconcileFoodLibrary();
  syncEngine.reconcileExerciseLibrary();
  const result = Object.fromEntries(STORES.map((store) => [store, []]));
  for (const row of database.prepare(
    "SELECT store, data FROM records WHERE deleted = 0 ORDER BY updated_at"
  ).all()) {
    result[row.store].push(JSON.parse(row.data));
  }
  return result;
}

function mergeExistingAction(action) {
  if (!action || typeof action !== "object") return action;
  const store = String(action.store || "");
  const value = structuredClone(action.value || {});
  const operation = String(action.operation || "").toLowerCase();
  const recordId = String(value.id || "");
  let existing;
  if (store === "profile") {
    const row = database.prepare(
      "SELECT data FROM records WHERE store = 'profile' AND id = 'me' AND deleted = 0"
    ).get();
    if (row) {
      existing = JSON.parse(row.data);
      value.id = "me";
    }
  } else if ((store === "foods" || store === "exercises") && EDIT_OPERATIONS.has(operation)) {
    const records = database.prepare("SELECT data FROM records WHERE store=? AND deleted=0").all(store).map(row=>JSON.parse(row.data));
    value.id = mergeEditableRecord(records, value, store).id;
    existing = records.find((item) => String(item.id) === String(value.id));
  } else if (STORES.includes(store) && recordId) {
    const row = database.prepare(
      "SELECT data FROM records WHERE store = ? AND id = ? AND deleted = 0"
    ).get(store, recordId);
    if (row) existing = JSON.parse(row.data);
  }
  if (existing) return { ...action, store, value: { ...existing, ...value, id: existing.id } };
  return { ...action, store, value };
}

function normalizeAction(action, selectedDate = "") {
  if (!action || typeof action !== "object") throw new Error("Action must be an object");
  const store = String(action.store ?? "");
  const value = structuredClone(action.value ?? {});
  if (!STORES.includes(store) || !value || typeof value !== "object") throw new Error("Unsupported action");
  if (store === "profile") value.id = "me";
  else if (["weights", "baselineMultipliers", "targetScenarios", "targetScenarioDefaults", "energyTargetDays", "energyTargetDefaults"].includes(store)) value.id = String(value.date || value.id || "");
  else value.id = String(value.id || `llm-${randomBytes(8).toString("hex")}`);
  if (!value.id) throw new Error("Record id is required");
  if (store === "foods") {
    value.sugar ??= value.totalSugar ?? value.total_sugar ?? 0;
    value.sucrose ??= value["蔗糖"] ?? 0;
    value.addedSugar ??= value.added_sugar ?? value["添加糖"] ?? 0;
    for (const key of NUTRIENTS) { value[key]=numericValue(value[key]??0); if(!Number.isFinite(value[key])||value[key]<0)throw Error("营养数值必须为有效非负数字："+key); }
    value.sugar = Math.max(value.sugar, value.sucrose, value.addedSugar);
    value.carbs = Math.max(value.carbs, value.sugar);
    value.sucrose = Math.min(value.sucrose, value.sugar);
    value.addedSugar = Math.min(value.addedSugar, value.sugar);
    value.date ||= selectedDate || todayIso();
    value.time ||= "12:00";
    value.meal ||= "未注明";
    value.name ||= "未命名食物";
    value.weight = numericValue(value.weight);
    if(!Number.isFinite(value.weight)||value.weight<=0)throw Error("食品需要有效的可食克重");
    value.note ||= "由 LLM 录入";
  }
  if (store === "exercises") {
    const metrics = value.metrics && typeof value.metrics === "object" ? value.metrics : {};
    value.steps ??= value.stepCount ?? value.step_count ?? value.step ?? value["步数"] ?? metrics.steps ?? 0;
    value.duration=durationMinutes(value.duration??value.durationMinutes??(value.hours!=null?String(value.hours)+"小时":0));
    for(const key of ["calories","steps"])value[key]=numericValue(value[key]??0);
    value.date ||= selectedDate || todayIso();
    value.time ||= "20:00";
    value.name ||= "运动";
    value.intensity ||= "中等强度";
    value.source ||= "LLM 估算";
    value.note ||= "由 LLM 录入";
  }
  if (store === "baselineMultipliers") {
    value.date ||= selectedDate || todayIso();
    value.id = String(value.date);
    value.multiplier = Math.max(0.7, Math.min(2, Number(value.multiplier || 1.2)));
    value.recordedAt ||= nowIso();
  }
  if (store === "targetScenarios") {
    value.date ||= selectedDate || todayIso();
    value.id = String(value.date);
    value.scenario = normalizeScenario(value.scenario);
    value.source = "llm";
    value.recordedAt ||= nowIso();
  }
  if (store === "targetScenarioDefaults") {
    value.date = todayIso();
    value.id = String(value.date);
    value.scenario = normalizeScenario(value.scenario);
    value.recordedAt ||= nowIso();
  }
  if (store === "energyTargetDays") {
    value.date ||= selectedDate || todayIso();
    value.id = String(value.date);
    value.enabled = value.enabled !== false;
    value.adjustment = Math.max(-5000, Math.min(5000, Number(value.adjustment) || 0));
    value.source = "llm";
    value.recordedAt ||= nowIso();
  }
  if (store === "energyTargetDefaults") {
    value.date = todayIso();
    value.id = String(value.date);
    value.enabled = value.enabled !== false;
    value.adjustment = Math.max(-5000, Math.min(5000, Number(value.adjustment) || 0));
    value.recordedAt ||= nowIso();
  }
  return { store, value };
}

function reconcileExercise(value, latestWeight) {
  if (isWalking(value)) return;
  const source = String(value.source || "").toLowerCase();
  if (!source.includes("estimated") && !source.includes("估算")) return;
  const match = String(value.note || "").match(/\bMET[^0-9]{0,6}([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return;
  const met = Number(match[1]);
  const weight = Number(latestWeight?.weight || 0);
  const duration = Number(value.duration || 0);
  const calories = Number(value.calories || 0);
  if (met < 0.5 || met > 25 || weight <= 0 || duration <= 0) return;
  const expected = Math.max(0, met - 1) * weight * duration / 60;
  if (calories <= 0 || Math.abs(calories - expected) / expected > 0.03) value.calories = Math.round(expected);
}

function parseModelJson(content) {
  let text = String(content || "").trim();
  if (text.startsWith("```")) text = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型没有返回结构化 JSON");
  return JSON.parse(text.slice(start, end + 1));
}

const requestModel=createModelTransport(session);
function modelConnection(){return {proxyMode:getSetting("llm_proxy_mode","auto"),proxyUrl:getSetting("llm_proxy_url",""),headerPreset:getSetting("llm_header_preset","auto"),customHeaders:getSetting("llm_custom_headers","{}")};}
function conversationId(kind){const key="llm_session_"+kind;let id=getSetting(key);if(!id){id=randomBytes(24).toString("hex");setSetting(key,id);}return id;}
async function llmCompletion(messages, enableSearch, temperature = 0.2, conversation = "chat") {
  const baseUrl = getSetting("llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const apiKey = getSetting("llm_api_key");
  const model = getSetting("llm_model", "qwen-plus");
  if (!apiKey) throw new Error("请先配置 LLM API Key");
  const url=completionUrl(baseUrl),connection=modelConnection();
  const response = await requestModel(url, {
    method: "POST",
    headers: modelHeaders({url,apiKey,preset:connection.headerPreset,customHeaders:connection.customHeaders,sessionId:conversationId(conversation),version:app.getVersion()}),
    body: JSON.stringify({model,messages,temperature,...(/(^|\.)aliyuncs\.com$/.test(new URL(url).hostname)?{enable_search:enableSearch}:{})}),
    signal: AbortSignal.timeout(90000),
  },connection);
  const rawText = await response.text();
  if (!response.ok && response.status>=500 && /ConnectFailed|ConnectionRefused|127\.0\.0\.1:7890/.test(rawText)) throw new Error("模型接口或转发服务返回 "+response.status+"：上游服务自身连接代理失败；本机代理设置无法修复远端代理。请检查转发服务的代理设置。"+rawText.slice(0,180));
  if (!response.ok) throw new Error(`模型接口返回 ${response.status}：${rawText.slice(0, 300)}`);
  const raw = JSON.parse(rawText);
  return String(raw.choices?.[0]?.message?.content || "").trim();
}

async function callLlm(userMessage, selectedDate = "") {
  const data = allData();
  const weights = [...data.weights].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latestWeight = weights.at(-1) || {};
  const history = database.prepare(
    "SELECT role, content FROM chat_messages ORDER BY id DESC LIMIT 12"
  ).all().reverse();
  const editableFoodRecords = [...data.foods]
    .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`))
    .slice(-50);
  const editableExerciseRecords = [...data.exercises]
    .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`))
    .slice(-50);
  const content = await llmCompletion([
    { role: "system", content: `${getSetting("llm_system_prompt", DEFAULT_SYSTEM_PROMPT)}\n\n${DATA_CONTRACT}\n\n${FOOD_NAME_RULES}\n\n${EXERCISE_RULES}\n\n${BATCH_RECORD_RULES}` },
    { role: "system", content: `本机用户上下文：${JSON.stringify({
      currentDate: todayIso(), currentViewDate: selectedDate,
      profile: data.profile[0] || {}, latestWeight, editableFoodRecords, editableExerciseRecords,
      walkingContext: getWalkingContext(database, selectedDate || todayIso()),
      walkingContextsByDate: Object.fromEntries([...new Set([selectedDate || todayIso(), ...data.exercises.slice(-30).map(x => x.date)])].map(date => [date, getWalkingContext(database, date)])),
      exerciseLibrary: data.exerciseLibrary,
      foodLibrary: data.foodLibrary,
      currentViewScenario: scenarioForDate(selectedDate || todayIso(), data.targetScenarios, data.targetScenarioDefaults),
      targetScenarios: data.targetScenarios.slice(-60),
      targetScenarioDefaults: data.targetScenarioDefaults.slice(-30),
      currentViewEnergyTarget: energyTargetForDate(selectedDate || todayIso(), data.energyTargetDays, data.energyTargetDefaults),
      energyTargetDays: data.energyTargetDays.slice(-60),
      energyTargetDefaults: data.energyTargetDefaults.slice(-30),
    })}` },
    ...history,
    { role: "user", content: userMessage },
  ], getSetting("llm_enable_search", "true") === "true");
  const modelResult = parseModelJson(content);
  const rawActions=expandRecordActions(modelResult);
  if(rawActions.some(action=>["exerciseLibrary","walkingProfiles","foodLibrary"].includes(action.store)))throw Error("模型不能直接修改食品库、运动库或步行设置");
  rawActions.sort((a,b)=>Number(!["profile","weights"].includes(a.store))-Number(!["profile","weights"].includes(b.store)));
  const normalized=[];
  const reply=String(modelResult.reply||"记录已处理");
  syncEngine.batchLocalChanges(()=>{
    for(let index=0;index<rawActions.length;index++){
      try{
        const raw=structuredClone(rawActions[index]);
        if(["foods","exercises"].includes(raw.store)&&!EDIT_OPERATIONS.has(String(raw.operation||"").toLowerCase()))delete raw.value.id;
        const action=normalizeAction(mergeExistingAction(raw),selectedDate);
        if(action.store==="exercises"){
          const weight=database.prepare("SELECT data FROM records WHERE store='weights' AND deleted=0").all().map(row=>JSON.parse(row.data)).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
          reconcileExercise(action.value,weight);
        }
        upsert(action.store,action.value,"llm");
        const saved=database.prepare("SELECT data FROM records WHERE store=? AND id=?").get(action.store,action.value.id);
        normalized.push({...action,value:JSON.parse(saved.data)});
      }catch(error){throw Error("第"+(index+1)+"条记录无法保存："+error.message+"；本批次没有写入任何记录");}
    }
    const insert=database.prepare("INSERT INTO chat_messages(role,content,created_at) VALUES(?,?,?)");
    insert.run("user",userMessage,nowIso());insert.run("assistant",reply,nowIso());
  });
  return {reply,actions:normalized};

}

function buildAnalysisContext(rangeDays) {
  const data = allData();
  const allDates = ["foods", "exercises", "weights"].flatMap(
    (store) => data[store].map((item) => String(item.date || "")).filter(Boolean)
  );
  const latestDate = allDates.sort().at(-1) || todayIso();
  let cutoff = "";
  if (rangeDays > 0) {
    const date = new Date(`${latestDate}T12:00:00`);
    date.setDate(date.getDate() - rangeDays + 1);
    cutoff = date.toLocaleDateString("en-CA");
  }
  const foods = data.foods.filter((item) => !cutoff || String(item.date) >= cutoff);
  const exercises = data.exercises.filter((item) => !cutoff || String(item.date) >= cutoff);
  const weights = data.weights.filter((item) => !cutoff || String(item.date) >= cutoff);
  const baselineMultipliers = data.baselineMultipliers.filter((item) => !cutoff || String(item.date) >= cutoff);
  const targetScenarios = data.targetScenarios.filter((item) => !cutoff || String(item.date) >= cutoff);
  const targetScenarioDefaults = data.targetScenarioDefaults;
  const energyTargetDays = data.energyTargetDays.filter((item) => !cutoff || String(item.date) >= cutoff);
  const energyTargetDefaults = data.energyTargetDefaults;
  const dates = [...new Set([...foods, ...exercises].map((item) => item.date).filter(Boolean))].sort();
  const daily = dates.map((date) => {
    const dayFoods = foods.filter((item) => item.date === date);
    const dayExercises = exercises.filter((item) => item.date === date);
    const sums = Object.fromEntries(
      ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sucrose", "addedSugar", "sodium", "potassium", "calcium", "iron"]
        .map((key) => [key, Number(dayFoods.reduce((sum, item) => sum + Number(item[key] || 0), 0).toFixed(1))])
    );
    const burned = Number(dayExercises.reduce((sum, item) => sum + Number(item.calories || 0), 0).toFixed(1));
    return {
      date, foodCount: dayFoods.length, foods: dayFoods.map((item) => item.name), ...sums,
      burned, netCalories: Number((sums.calories - burned).toFixed(1)),
      steps: Math.round(dayExercises.reduce((sum, item) => sum + Number(item.steps || 0), 0)),
      exerciseMinutes: Math.round(dayExercises.reduce((sum, item) => sum + Number(item.duration || 0), 0)),
      targetScenario: scenarioForDate(date, data.targetScenarios, targetScenarioDefaults),
      energyTarget: energyTargetForDate(date, data.energyTargetDays, energyTargetDefaults),
    };
  });
  return {
    requestedRangeDays: rangeDays,
    rangeStart: cutoff || allDates.sort()[0] || null,
    rangeEnd: latestDate,
    recordedDays: daily.length,
    profile: data.profile[0] || {},
    weights: weights.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    baselineMultipliers: baselineMultipliers.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    targetScenarios: targetScenarios.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    targetScenarioDefaults: targetScenarioDefaults.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    energyTargetDays: energyTargetDays.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    energyTargetDefaults: energyTargetDefaults.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    daily: daily.slice(-365),
    dataNotes: ["缺失日期不能视为零摄入。", "营养值为 0 可能代表资料未公开。"],
  };
}

async function analyzeHistory(question, rangeDays) {
  const history = database.prepare(
    "SELECT role, content FROM analysis_messages WHERE range_days = ? ORDER BY id DESC LIMIT 8"
  ).all(rangeDays).reverse();
  const reply = await llmCompletion([
    { role: "system", content: ANALYSIS_PROMPT },
    { role: "system", content: `历史数据（JSON）：${JSON.stringify(buildAnalysisContext(rangeDays))}` },
    ...history,
    { role: "user", content: question },
  ], false, 0.15, "analysis-"+rangeDays);
  const insert = database.prepare(
    "INSERT INTO analysis_messages (role, content, range_days, created_at) VALUES (?, ?, ?, ?)"
  );
  insert.run("user", question, rangeDays, nowIso());
  insert.run("assistant", reply, rangeDays, nowIso());
  return reply;
}

function sendJson(response, status, value, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (origin === uiOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 2_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function startApi() {
  apiServer = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const route = url.pathname;
    const origin = request.headers.origin || "";
    const token = getSetting("external_api_token");
    const external = route === "/api/v1/import";
    const authorized = request.headers.authorization === `Bearer ${token}`;
    try {
      if (request.method === "OPTIONS") {
        if (origin !== uiOrigin) return sendJson(response, 403, { error: "Origin not allowed" }, origin);
        return sendJson(response, 204, {}, origin);
      }
      if (route === "/health") return sendJson(response, 200, { ok: true }, origin);
      if (route === "/api/v1/schema") {
        if (!authorized) return sendJson(response, 401, { error: "Unauthorized" }, origin);
        return sendJson(response, 200, { stores: STORES }, origin);
      }
      if (external && !authorized) return sendJson(response, 401, { error: "Unauthorized" }, origin);
      if (!external && origin !== uiOrigin) return sendJson(response, 403, { error: "Origin not allowed" }, origin);

      if (request.method === "GET") {
        if (route === "/api/directory/preferences") return sendJson(response, 200, JSON.parse(getSetting("directoryPreferences", "{}")), origin);
        if (route === "/api/data") return sendJson(response, 200, allData(), origin);
        if (route === "/api/llm/config") return sendJson(response, 200, {
          ...modelConnection(),
          baseUrl: getSetting("llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
          model: getSetting("llm_model", "qwen-plus"),
          systemPrompt: getSetting("llm_system_prompt", DEFAULT_SYSTEM_PROMPT),
          enableSearch: getSetting("llm_enable_search", "true") === "true",
          configured: Boolean(getSetting("llm_api_key")),
          externalEndpoint: `http://127.0.0.1:${apiPort}/api/v1/import`,
          externalToken: token,
        }, origin);
        if (route === "/api/chat/history") {
          const rows = database.prepare(
            "SELECT id, role, content, created_at FROM chat_messages ORDER BY id DESC LIMIT 30"
          ).all().reverse();
          return sendJson(response, 200, rows.map((row) => ({
            id: row.id, role: row.role, content: row.content, createdAt: row.created_at,
          })), origin);
        }
        if (route === "/api/analysis/history") {
          const rows = database.prepare(
            "SELECT id, role, content, range_days, created_at FROM analysis_messages ORDER BY id DESC LIMIT 30"
          ).all().reverse();
          return sendJson(response, 200, rows.map((row) => ({
            id: row.id, role: row.role, content: row.content, rangeDays: row.range_days, createdAt: row.created_at,
          })), origin);
        }
        if (route === "/api/sync/status") return sendJson(response, 200, syncEngine.status(), origin);
        if (route === "/api/sync/conflicts") return sendJson(response, 200, syncEngine.conflictList(), origin);
        return sendJson(response, 404, { error: "Not found" }, origin);
      }

      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" }, origin);
      const body = await readBody(request);
      if (route === "/api/directory/preferences") {
        if (!/^(food-directory-v1|exercise-directory-v1-(male|female|unspecified))$/.test(body.key || "")) throw new Error("Invalid preference key");
        const preferences = JSON.parse(getSetting("directoryPreferences", "{}"));
        preferences[body.key] = { sort: body.sort === "recent" ? "recent" : "alphabet", pins: [...new Set((Array.isArray(body.pins) ? body.pins : []).filter(id => typeof id === "string" && id.length < 2000))].slice(0,5) };
        setSetting("directoryPreferences", JSON.stringify(preferences));
      }
      else if (route === "/api/put") upsert(String(body.store || ""), body.value);
      else if (route === "/api/delete") {
        if (!STORES.includes(String(body.store || "")) || !body.id) throw new Error("Invalid record");
        syncEngine.localDelete(String(body.store), String(body.id));
      } else if (route === "/api/import" || route === "/api/v1/import") {
        if (Array.isArray(body.actions)) {
          for (const action of body.actions.map(mergeExistingAction).map((item) => normalizeAction(item))) upsert(action.store, action.value);
        } else {
          for (const store of STORES) {
            for (const value of body[store] || []) {
              const action = (store === "foods" || store === "exercises")
                ? normalizeAction({ store, value })
                : { store, value };
              syncEngine.localUpsert(action.store, action.value);
            }
          }
        }
      } else if (route === "/api/llm/config") {
        const connection=validateConnection({...modelConnection(),...body});
        completionUrl(body.baseUrl||"");
        setSetting("llm_proxy_mode",connection.proxyMode);
        setSetting("llm_proxy_url",connection.proxyUrl);
        setSetting("llm_header_preset",connection.headerPreset);
        setSetting("llm_custom_headers",connection.customHeaders);
        setSetting("llm_base_url", body.baseUrl || "");
        setSetting("llm_model", body.model || "qwen-plus");
        setSetting("llm_system_prompt", body.systemPrompt || DEFAULT_SYSTEM_PROMPT);
        setSetting("llm_enable_search", String(Boolean(body.enableSearch)));
        if (body.apiKey) setSetting("llm_api_key", body.apiKey);
      } else if (route === "/api/llm/chat") {
        const message = String(body.message || "").trim();
        if (!message) throw new Error("消息不能为空");
        return sendJson(response, 200, await callLlm(message, String(body.selectedDate || "")), origin);
      } else if (route === "/api/llm/analyze") {
        const question = String(body.question || "").trim();
        const rangeDays = Number(body.rangeDays ?? 30);
        if (!question) throw new Error("问题不能为空");
        if (![0, 7, 30, 90].includes(rangeDays)) throw new Error("不支持的时间范围");
        return sendJson(response, 200, {
          reply: await analyzeHistory(question, rangeDays), rangeDays, readOnly: true,
        }, origin);
      } else if (route === "/api/chat/clear") {database.exec("DELETE FROM chat_messages");setSetting("llm_session_chat","");}
      else if (route === "/api/analysis/clear") {database.exec("DELETE FROM analysis_messages");for(const days of [0,7,30,90])setSetting("llm_session_analysis-"+days,"");}
      else if (route === "/api/sync/config") {
        return sendJson(response, 200, syncEngine.configure({
          syncFolder: body.folder,
          syncEnabled: Boolean(body.enabled),
        }), origin);
      } else if (route === "/api/sync/select-folder") {
        const selected = await dialog.showOpenDialog(mainWindow, {
          title: "选择云盘中的每日摄入同步文件夹",
          defaultPath: syncEngine.status().folder || syncEngine.defaultFolder() || undefined,
          properties: ["openDirectory", "createDirectory"],
        });
        if (selected.canceled || !selected.filePaths[0]) {
          return sendJson(response, 200, syncEngine.status(), origin);
        }
        return sendJson(response, 200, syncEngine.configure({
          syncFolder: selected.filePaths[0],
          syncEnabled: Boolean(body.enabled),
        }), origin);
      } else if (route === "/api/sync/run") {
        return sendJson(response, 200, syncEngine.runSync(), origin);
      } else if (route === "/api/sync/backup") {
        return sendJson(response, 200, syncEngine.createBackup(), origin);
      } else if (route === "/api/sync/full-export") {
        return sendJson(response, 200, syncEngine.exportFullToCloud(), origin);
      } else if (route === "/api/sync/full-import") {
        return sendJson(response, 200, syncEngine.importAllFromCloud(), origin);
      } else if (route === "/api/backup/export-local") {
        const selected = await dialog.showSaveDialog(mainWindow, {
          title: "保存每日摄入完整备份",
          defaultPath: path.join(app.getPath("documents"), `每日摄入备份-${nowIso().slice(0, 10)}.json`),
          filters: [{ name: "JSON 备份文件", extensions: ["json"] }],
        });
        if (selected.canceled || !selected.filePath) {
          return sendJson(response, 200, { canceled: true }, origin);
        }
        return sendJson(response, 200, {
          canceled: false,
          ...syncEngine.exportBackupFile(selected.filePath),
        }, origin);
      } else if (route === "/api/backup/import-local") {
        const selected = await dialog.showOpenDialog(mainWindow, {
          title: "选择每日摄入备份",
          properties: ["openFile"],
          filters: [{ name: "JSON 备份文件", extensions: ["json"] }],
        });
        if (selected.canceled || !selected.filePaths[0]) {
          return sendJson(response, 200, { canceled: true }, origin);
        }
        return sendJson(response, 200, {
          canceled: false,
          ...syncEngine.importBackupFile(selected.filePaths[0]),
        }, origin);
      } else if (route === "/api/sync/open-backup-folder") {
        const syncFolder = syncEngine.status().folder;
        if (!syncFolder) throw new Error("请先设置并开启同步");
        const backupFolder = path.join(syncFolder, "backups");
        mkdirSync(backupFolder, { recursive: true });
        const openError = await shell.openPath(backupFolder);
        if (openError) throw new Error(`无法打开备份文件夹：${openError}`);
        return sendJson(response, 200, { opened: true, folder: backupFolder }, origin);
      }
      else return sendJson(response, 404, { error: "Not found" }, origin);
      return sendJson(response, 200, { ok: true }, origin);
    } catch (error) {
      log(`API error ${route}: ${error.stack || error}`);
      return sendJson(response, 400, { error: error.message || String(error) }, origin);
    }
  });
  return new Promise((resolve, reject) => {
    apiServer.once("error", reject);
    apiServer.listen(0, "127.0.0.1", () => {
      apiPort = apiServer.address().port;
      resolve();
    });
  });
}

async function createDesktopWindow() {
  const appRoot = app.getAppPath();
  const frontendOutDir = app.isPackaged
    ? path.join(process.resourcesPath, "dist")
    : path.join(appRoot, "dist");
  const frontend = await startProdServer({ port: 0, host: "127.0.0.1", outDir: frontendOutDir });
  frontendServer = frontend.server;
  uiOrigin = `http://127.0.0.1:${frontend.port}`;
  await startApi();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: "#f7f5ee",
    icon: path.join(appRoot, "app-icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(uiOrigin)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(`${uiOrigin}/?api=${encodeURIComponent(`http://127.0.0.1:${apiPort}`)}`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      app.setAppUserModelId("com.local.dailyintake");
      Menu.setApplicationMenu(null);
      initializeDatabase();
      await createDesktopWindow();
      syncEngine.start();
    } catch (error) {
      log(`Startup error: ${error.stack || error}`);
      dialog.showErrorBox("每日摄入无法启动", `启动失败：${error.message}\n\n诊断日志：${logPath || app.getPath("userData")}`);
      app.quit();
    }
  });
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  try { syncEngine?.runSync(); } catch {}
  try { syncEngine?.stop(); } catch {}
  try { apiServer?.close(); } catch {}
  try { frontendServer?.close(); } catch {}
  try { database?.close(); } catch {}
});
