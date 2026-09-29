"use client";

import { CSSProperties, FormEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { normalizeFoodRecord } from "./food-name.mjs";
import { libraryId, scaleNutrients, sortLibraryFoods } from "./food-library.mjs";
import { ActivityEditModal,ActivityPanel,ActivityModal,WalkingPanel,WalkingModal,ActivityEntry,WalkingProfile } from "./activity-library";
import { ContactDirectory } from "./contact-directory";
import { createPortal } from "react-dom";
import { selectBodyTrendDates } from "./body-trend-dates.mjs";
import { energyTargetForDate, longTermEnergyTargetForDate, normalizeEnergyAdjustment, projectedMonthlyWeightChange } from "./energy-balance-targets.mjs";
import { energyTargetStatus } from "./energy-target-status.mjs";
import { macroTargetsForCalories } from "./macro-targets.mjs";
import { defaultScenarioForDate, targetScenarioForDate } from "./target-scenarios.mjs";

type Nutrients = {
  calories: number; protein: number; carbs: number; fat: number; fiber: number;
  sugar: number; sucrose: number; addedSugar: number;
  sodium: number; potassium: number; calcium: number; iron: number;
  magnesium: number; zinc: number; vitaminA: number; vitaminC: number; vitaminD: number;
  vitaminE: number; vitaminB1: number; vitaminB2: number; vitaminB6: number;
  vitaminB12: number; folate: number;
};

type LibraryFood = Nutrients & { defaultServingGrams?:number; servingBasis?:string; reportedNutrients?:string[]; id: string; name: string; note: string; weight: number; createdAt: string; updatedAt: string };

type FoodRecord = Nutrients & {
  id: string; date: string; time: string; meal: string; name: string; weight: number; note: string;
};

type ExerciseRecord = {
  id: string; date: string; time: string; name: string; calories: number; duration: number;
  steps: number; intensity: string; source: string; note: string; sex?: string; kind?: string; libraryId?: string;
};

type TargetScenario = "daily" | "strength" | "cardio";
type ThemePreference = "system" | "light" | "dark";

const selectBodyTrendDatesForUi = selectBodyTrendDates as unknown as (options: {
  weightDates: string[];
  baselineDates: string[];
  range: number;
  showWeight: boolean;
  showBaseline: boolean;
  skipEmpty: boolean;
}) => { recordedDates: string[]; axisDates: string[] };

type Profile = {
  id: "me"; birthdate: string; sex: "male" | "female" | "unspecified"; height: number;
  targetScenario?: TargetScenario;
  energyBalanceEnabled?: boolean;
  energyBalanceType?: "deficit" | "surplus";
  energyBalanceAmount?: number;
  sedentaryMultiplier?: number;
};

type WeightRecord = {
  id: string; date: string; weight: number; note: string;
};

type BaselineMultiplierRecord = {
  id: string; date: string; multiplier: number; recordedAt: string;
};

type TargetScenarioDayRecord = {
  id: string; date: string; scenario: TargetScenario; source: "manual" | "llm"; recordedAt: string;
};

type TargetScenarioDefaultRecord = {
  id: string; date: string; scenario: TargetScenario; recordedAt: string;
};

type EnergyTargetDayRecord = {
  id: string; date: string; enabled: boolean; adjustment: number; source: "manual" | "llm"; recordedAt: string;
};

type EnergyTargetDefaultRecord = {
  id: string; date: string; enabled: boolean; adjustment: number; recordedAt: string;
};

type SharedData = {
  exerciseLibrary?: ActivityEntry[]; walkingProfiles?: WalkingProfile[];
  foodLibrary?: LibraryFood[];
  foods: FoodRecord[]; exercises: ExerciseRecord[]; profile: Profile[]; weights: WeightRecord[];
  baselineMultipliers: BaselineMultiplierRecord[];
  targetScenarios: TargetScenarioDayRecord[];
  targetScenarioDefaults: TargetScenarioDefaultRecord[];
  energyTargetDays: EnergyTargetDayRecord[];
  energyTargetDefaults: EnergyTargetDefaultRecord[];
};

type ChatMessage = {
  id: string | number; role: "user" | "assistant"; content: string; createdAt?: string;
};

type AnalysisMessage = ChatMessage & { rangeDays: number };

type LlmConfig = {
  proxyMode?: string; proxyUrl?: string; headerPreset?: string; customHeaders?: string;
  baseUrl: string; model: string; systemPrompt: string; enableSearch: boolean;
  configured: boolean; externalEndpoint: string; externalToken: string;
};

type SyncStatus = {
  enabled: boolean;
  folder: string;
  detectedOneDriveRoot: string;
  suggestedFolder: string;
  insideDetectedOneDrive: boolean;
  deviceId: string;
  lastSyncAt: string;
  lastBackupAt: string;
  lastBackupFile: string;
  lastError: string;
  lastImported: number;
  pending: number;
  conflicts: number;
  backupHealthy: boolean;
  lastFullExportAt: string;
  lastFullImportAt: string;
  lastCleanupAt: string;
  lastCleanupRemoved: number;
  cloudEventFiles: number;
  cloudBackupFiles: number;
  cloudSnapshotFiles: number;
  retentionEventMinFiles: number;
  retentionEventMaxAgeDays: number;
  snapshotFreshnessDays: number;
  snapshotFreshnessCheckedAt: string;
};

type DailyTargetPlan = {
  weight: number;
  bmr: number;
  baseCalories: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  scenario: TargetScenario;
  balanceAdjustment: number;
  balanceMode: "longTerm" | "exception";
  balanceEnabled: boolean;
  baselineMultiplier: number;
};

const DEFAULT_API_URL = "http://127.0.0.1:3031";

function apiUrl() {
  if (typeof window === "undefined") return DEFAULT_API_URL;
  const configured = new URLSearchParams(window.location.search).get("api");
  return configured?.startsWith("http://127.0.0.1:") ? configured : DEFAULT_API_URL;
}

const nutrientLabels: Array<[keyof Nutrients, string, string]> = [
  ["calories", "热量", "kcal"], ["protein", "蛋白质", "g"], ["carbs", "碳水", "g"],
  ["fat", "脂肪", "g"], ["fiber", "膳食纤维", "g"], ["sugar", "总糖", "g"],
  ["sucrose", "其中蔗糖", "g"], ["addedSugar", "其中添加糖", "g"],
  ["sodium", "钠", "mg"], ["potassium", "钾", "mg"], ["calcium", "钙", "mg"],
  ["iron", "铁", "mg"], ["magnesium", "镁", "mg"], ["zinc", "锌", "mg"],
  ["vitaminA", "维生素 A", "μg"], ["vitaminC", "维生素 C", "mg"],
  ["vitaminD", "维生素 D", "μg"], ["vitaminE", "维生素 E", "mg"],
  ["vitaminB1", "维生素 B1", "mg"], ["vitaminB2", "维生素 B2", "mg"],
  ["vitaminB6", "维生素 B6", "mg"], ["vitaminB12", "维生素 B12", "μg"],
  ["folate", "叶酸", "μg"],
];

const targetScenarioOptions: Array<{ key: TargetScenario; name: string; description: string; short: string }> = [
  { key: "daily", name: "日常情景", short: "日常", description: "蛋白质 1.2 g/kg，适合一般活动日" },
  { key: "strength", name: "无氧健身日", short: "无氧", description: "蛋白质 1.8 g/kg，提高力量训练日占比" },
  { key: "cardio", name: "有氧训练日", short: "有氧", description: "蛋白质 1.4 g/kg，给碳水留出更多空间" },
];

function targetScenarioLabel(scenario: TargetScenario) {
  return targetScenarioOptions.find((item) => item.key === scenario)?.name || "日常情景";
}

const blankNutrients = (): Nutrients => Object.fromEntries(
  nutrientLabels.map(([key]) => [key, 0]),
) as Nutrients;

const today = () => new Date().toLocaleDateString("en-CA");
const nowTime = () => new Date().toTimeString().slice(0, 5);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const n = (value: FormDataEntryValue | null) => Number(value || 0);
const exerciseSteps = (record: ExerciseRecord) => {
  const compatible = record as ExerciseRecord & {
    step?: number; stepCount?: number; step_count?: number; 步数?: number;
  };
  const direct = Number(
    compatible.steps ?? compatible.stepCount ?? compatible.step_count ?? compatible.step ?? compatible.步数 ?? 0,
  ) || 0;
  if (direct > 0) return direct;
  const match = `${record.name || ""} ${record.note || ""}`.match(/(\d+(?:\.\d+)?)\s*(万)?\s*步/);
  if (!match) return 0;
  return Math.round(Number(match[1]) * (match[2] ? 10000 : 1));
};

const foodCatalog: Record<string, { weight: number; nutrients: Nutrients; aliases: string[] }> = {
  "麦当劳双层吉士汉堡": {
    weight: 173,
    aliases: ["麦当劳双吉", "双吉牛肉汉堡", "双层吉士汉堡", "双吉"],
    nutrients: { calories: 450, protein: 27, carbs: 33, fat: 24, fiber: 2, sugar: 7, sucrose: 0, addedSugar: 0, sodium: 1120, potassium: 330, calcium: 180, iron: 3.5, magnesium: 28, zinc: 5.1, vitaminA: 90, vitaminC: 1, vitaminD: 0.3, vitaminE: 0.8, vitaminB1: 0.25, vitaminB2: 0.32, vitaminB6: 0.2, vitaminB12: 2.4, folate: 70 },
  },
  "鸡蛋": {
    weight: 50,
    aliases: ["水煮蛋", "煮鸡蛋", "鸡蛋"],
    nutrients: { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, fiber: 0, sugar: 0.2, sucrose: 0, addedSugar: 0, sodium: 71, potassium: 69, calcium: 28, iron: 0.9, magnesium: 6, zinc: 0.6, vitaminA: 80, vitaminC: 0, vitaminD: 1, vitaminE: 0.5, vitaminB1: 0.02, vitaminB2: 0.23, vitaminB6: 0.09, vitaminB12: 0.6, folate: 24 },
  },
  "熟米饭": {
    weight: 150,
    aliases: ["米饭", "白米饭"],
    nutrients: { calories: 174, protein: 3.9, carbs: 38.7, fat: 0.5, fiber: 0.6, sugar: 0.1, sucrose: 0, addedSugar: 0, sodium: 2, potassium: 44, calcium: 5, iron: 0.3, magnesium: 18, zinc: 0.7, vitaminA: 0, vitaminC: 0, vitaminD: 0, vitaminE: 0.1, vitaminB1: 0.04, vitaminB2: 0.02, vitaminB6: 0.08, vitaminB12: 0, folate: 5 },
  },
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("daily-intake-db", 5);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("foods")) db.createObjectStore("foods", { keyPath: "id" });
      if (!db.objectStoreNames.contains("exercises")) db.createObjectStore("exercises", { keyPath: "id" });
      if (!db.objectStoreNames.contains("profile")) db.createObjectStore("profile", { keyPath: "id" });
      if (!db.objectStoreNames.contains("weights")) db.createObjectStore("weights", { keyPath: "id" });
      if (!db.objectStoreNames.contains("baselineMultipliers")) db.createObjectStore("baselineMultipliers", { keyPath: "id" });
      if (!db.objectStoreNames.contains("targetScenarios")) db.createObjectStore("targetScenarios", { keyPath: "id" });
      if (!db.objectStoreNames.contains("targetScenarioDefaults")) db.createObjectStore("targetScenarioDefaults", { keyPath: "id" });
      if (!db.objectStoreNames.contains("energyTargetDays")) db.createObjectStore("energyTargetDays", { keyPath: "id" });
      if (!db.objectStoreNames.contains("energyTargetDefaults")) db.createObjectStore("energyTargetDefaults", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type StoredRecord = FoodRecord | ExerciseRecord | Profile | WeightRecord | BaselineMultiplierRecord | TargetScenarioDayRecord | TargetScenarioDefaultRecord | EnergyTargetDayRecord | EnergyTargetDefaultRecord;

async function localPut(store: string, value: StoredRecord) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function localDelete(store: string, id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function apiRequest<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Shared database error: ${response.status}`);
  return result;
}

async function dbPut(store: string, value: StoredRecord) {
  await localPut(store, value);
  await apiRequest("/api/put", { store, value });
}

async function dbDelete(store: string, id: string) {
  await localDelete(store, id);
  await apiRequest("/api/delete", { store, id });
}

function dataCount(data: SharedData) {
  return (data.exerciseLibrary?.length || 0) + (data.walkingProfiles?.length || 0) + (data.foodLibrary?.length || 0) + data.foods.length + data.exercises.length + data.profile.length + data.weights.length + data.baselineMultipliers.length
    + data.targetScenarios.length + data.targetScenarioDefaults.length + data.energyTargetDays.length + data.energyTargetDefaults.length;
}

export default function Home() {
  const [exerciseLibrary,setExerciseLibrary] = useState<ActivityEntry[]>([]);
  const [walkingProfiles,setWalkingProfiles] = useState<WalkingProfile[]>([]);
  const [editingActivity,setEditingActivity]=useState<ExerciseRecord|null>(null);
  const [foodLibrary, setFoodLibrary] = useState<LibraryFood[]>([]);
  const [foods, setFoods] = useState<FoodRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [profile, setProfile] = useState<Profile>({ id: "me", birthdate: "", sex: "unspecified", height: 0 });
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [baselineMultipliers, setBaselineMultipliers] = useState<BaselineMultiplierRecord[]>([]);
  const [targetScenarios, setTargetScenarios] = useState<TargetScenarioDayRecord[]>([]);
  const [targetScenarioDefaults, setTargetScenarioDefaults] = useState<TargetScenarioDefaultRecord[]>([]);
  const [energyTargetDays, setEnergyTargetDays] = useState<EnergyTargetDayRecord[]>([]);
  const [energyTargetDefaults, setEnergyTargetDefaults] = useState<EnergyTargetDefaultRecord[]>([]);
  const [date, setDate] = useState(today());
  const [tab, setTab] = useState<"today" | "body" | "history">("today");
  const [modal, setModal] = useState<"walking" | "libraryPick" | "food" | "exercise" | "weight" | "deleteWeight" | "baseline" | "deleteBaseline" | "profile" | "llm" | "appearance" | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [quickText, setQuickText] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    baseUrl: "", model: "qwen-plus", systemPrompt: "", enableSearch: true,
    configured: false, externalEndpoint: "", externalToken: "",
  });
  const [status, setStatus] = useState("正在连接本机共享数据库");
  const [listening, setListening] = useState(false);
  const [expandedFoodId, setExpandedFoodId] = useState<string | null>(null);
  const [editingFood, setEditingFood] = useState<FoodRecord | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightRecord | null>(null);
  const [editingBaseline, setEditingBaseline] = useState<BaselineMultiplierRecord | null>(null);
  const energyMigrationAttempted = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const stored = window.localStorage.getItem("daily-intake-theme");
    const preference: ThemePreference = stored === "light" || stored === "dark" ? stored : "system";
    const applyTheme = (value: ThemePreference) => {
      const dark = value === "dark" || (value === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    setThemePreference(preference);
    applyTheme(preference);
    const onSystemThemeChange = () => {
      if ((window.localStorage.getItem("daily-intake-theme") || "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, []);

  useEffect(() => {
    if (energyMigrationAttempted.current || energyTargetDefaults.length > 0 || !profile.energyBalanceEnabled) return;
    energyMigrationAttempted.current = true;
    const amount = Math.max(0, Number(profile.energyBalanceAmount || 0));
    const record: EnergyTargetDefaultRecord = {
      id: today(),
      date: today(),
      enabled: true,
      adjustment: profile.energyBalanceType === "surplus" ? amount : -amount,
      recordedAt: new Date().toISOString(),
    };
    dbPut("energyTargetDefaults", record)
      .catch(() => localPut("energyTargetDefaults", record))
      .finally(() => setEnergyTargetDefaults([record]));
  }, [profile, energyTargetDefaults.length]);

  function changeTheme(preference: ThemePreference) {
    setThemePreference(preference);
    window.localStorage.setItem("daily-intake-theme", preference);
    const followsDarkSystem = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = preference === "dark" || (preference === "system" && followsDarkSystem) ? "dark" : "light";
  }

  useEffect(() => {
    async function loadData() {
      const [localFoods, localExercises, localProfile, localWeights, localBaselineMultipliers, localTargetScenarios, localTargetScenarioDefaults, localEnergyTargetDays, localEnergyTargetDefaults] = await Promise.all([
        dbAll<FoodRecord>("foods"), dbAll<ExerciseRecord>("exercises"),
        dbAll<Profile>("profile"), dbAll<WeightRecord>("weights"),
        dbAll<BaselineMultiplierRecord>("baselineMultipliers"),
        dbAll<TargetScenarioDayRecord>("targetScenarios"),
        dbAll<TargetScenarioDefaultRecord>("targetScenarioDefaults"),
        dbAll<EnergyTargetDayRecord>("energyTargetDays"),
        dbAll<EnergyTargetDefaultRecord>("energyTargetDefaults"),
      ]);
      const localData: SharedData = {
        foods: localFoods, exercises: localExercises, profile: localProfile, weights: localWeights,
        baselineMultipliers: localBaselineMultipliers, targetScenarios: localTargetScenarios,
        targetScenarioDefaults: localTargetScenarioDefaults,
        energyTargetDays: localEnergyTargetDays, energyTargetDefaults: localEnergyTargetDefaults,
      };
      try {
        let shared = await apiRequest<SharedData>("/api/data");
        shared.baselineMultipliers ||= [];
        shared.targetScenarios ||= [];
        shared.targetScenarioDefaults ||= [];
        shared.energyTargetDays ||= [];
        shared.energyTargetDefaults ||= [];
        if (dataCount(shared) === 0 && dataCount(localData) > 0) {
          await apiRequest("/api/import", localData);
          shared = localData;
          setStatus("原有记录已迁移到本机共享数据库");
        } else {
          await Promise.all([
            ...shared.foods.map((x) => localPut("foods", x)),
            ...shared.exercises.map((x) => localPut("exercises", x)),
            ...shared.profile.map((x) => localPut("profile", x)),
            ...shared.weights.map((x) => localPut("weights", x)),
            ...shared.baselineMultipliers.map((x) => localPut("baselineMultipliers", x)),
            ...shared.targetScenarios.map((x) => localPut("targetScenarios", x)),
            ...shared.targetScenarioDefaults.map((x) => localPut("targetScenarioDefaults", x)),
            ...shared.energyTargetDays.map((x) => localPut("energyTargetDays", x)),
            ...shared.energyTargetDefaults.map((x) => localPut("energyTargetDefaults", x)),
          ]);
          setStatus("已连接本机共享数据库");
        }
        setFoodLibrary(shared.foodLibrary || []);
    setExerciseLibrary(shared.exerciseLibrary || []);
    setWalkingProfiles(shared.walkingProfiles || []);
    setFoods(shared.foods); setExercises(shared.exercises);
        if (shared.profile[0]) setProfile(shared.profile[0]);
        setWeights(shared.weights);
        setBaselineMultipliers(shared.baselineMultipliers);
        setTargetScenarios(shared.targetScenarios);
        setTargetScenarioDefaults(shared.targetScenarioDefaults);
        setEnergyTargetDays(shared.energyTargetDays);
        setEnergyTargetDefaults(shared.energyTargetDefaults);
      } catch {
        setFoods(localFoods); setExercises(localExercises);
        if (localProfile[0]) setProfile(localProfile[0]);
        setWeights(localWeights);
        setBaselineMultipliers(localBaselineMultipliers);
        setTargetScenarios(localTargetScenarios);
        setTargetScenarioDefaults(localTargetScenarioDefaults);
        setEnergyTargetDays(localEnergyTargetDays);
        setEnergyTargetDefaults(localEnergyTargetDefaults);
        setStatus("共享服务未启动；请从启动文件重新打开应用");
      }
    }
    loadData().catch(() => setStatus("本地数据库读取失败，请重新启动应用"));
  }, []);

  useEffect(() => {
    Promise.all([
      apiRequest<LlmConfig>("/api/llm/config"),
      apiRequest<ChatMessage[]>("/api/chat/history"),
    ]).then(([config, messages]) => {
      setLlmConfig(config);
      setChatMessages(messages);
    }).catch(() => undefined);
  }, []);

  const dayFoods = useMemo(() => foods.filter((x) => x.date === date), [foods, date]);
  const dayExercises = useMemo(() => exercises.filter((x) => x.date === date), [exercises, date]);
  const totals = useMemo(() => {
    const result = blankNutrients();
    dayFoods.forEach((food) => nutrientLabels.forEach(([key]) => { result[key] += Number(food[key] || 0); }));
    return result;
  }, [dayFoods]);
  const burned = dayExercises.reduce((sum, x) => sum + Number(x.calories || 0), 0);
  const steps = dayExercises.reduce((sum, x) => sum + exerciseSteps(x), 0);
  const net = totals.calories - burned;
  const sortedWeights = useMemo(() => [...weights].sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const latestWeight = sortedWeights.at(-1)?.weight || 0;
  const sortedBaselineMultipliers = useMemo(() => [...baselineMultipliers].sort((a, b) => a.date.localeCompare(b.date)), [baselineMultipliers]);
  const sortedTargetScenarios = useMemo(() => [...targetScenarios].sort((a, b) => a.date.localeCompare(b.date)), [targetScenarios]);
  const sortedTargetScenarioDefaults = useMemo(() => [...targetScenarioDefaults].sort((a, b) => a.date.localeCompare(b.date)), [targetScenarioDefaults]);
  const sortedEnergyTargetDays = useMemo(() => [...energyTargetDays].sort((a, b) => a.date.localeCompare(b.date)), [energyTargetDays]);
  const sortedEnergyTargetDefaults = useMemo(() => [...energyTargetDefaults].sort((a, b) => a.date.localeCompare(b.date)), [energyTargetDefaults]);
  const dayPlan = useMemo(
    () => targetPlanForDate(date, profile, sortedWeights, sortedBaselineMultipliers, sortedTargetScenarios, sortedTargetScenarioDefaults, sortedEnergyTargetDays, sortedEnergyTargetDefaults),
    [date, profile, sortedWeights, sortedBaselineMultipliers, sortedTargetScenarios, sortedTargetScenarioDefaults, sortedEnergyTargetDays, sortedEnergyTargetDefaults],
  );
  const currentLongTermPlan = useMemo(
    () => targetPlanForDate(today(), profile, sortedWeights, sortedBaselineMultipliers, sortedTargetScenarios, sortedTargetScenarioDefaults, [], sortedEnergyTargetDefaults),
    [profile, sortedWeights, sortedBaselineMultipliers, sortedTargetScenarios, sortedTargetScenarioDefaults, sortedEnergyTargetDefaults],
  );
  const bmr = dayPlan.bmr;
  const calorieTarget = dayPlan.calories;
  const calorieGap = calorieTarget - net;
  const calorieStatus = energyTargetStatus(net, calorieTarget);
  const recommendations: Nutrients = {
    calories: calorieTarget,
    protein: dayPlan.protein,
    carbs: dayPlan.carbs,
    fat: dayPlan.fat,
    fiber: 25,
    sugar: 0,
    sucrose: 0,
    addedSugar: 25,
    sodium: 2000,
    potassium: 2000,
    calcium: 800,
    iron: profile.sex === "female" ? 20 : profile.sex === "male" ? 12 : 15,
    magnesium: 330,
    zinc: profile.sex === "female" ? 8.5 : profile.sex === "male" ? 12 : 10,
    vitaminA: profile.sex === "female" ? 700 : profile.sex === "male" ? 800 : 750,
    vitaminC: 100,
    vitaminD: 10,
    vitaminE: 14,
    vitaminB1: profile.sex === "female" ? 1.2 : profile.sex === "male" ? 1.4 : 1.3,
    vitaminB2: profile.sex === "female" ? 1.2 : profile.sex === "male" ? 1.4 : 1.3,
    vitaminB6: 1.4,
    vitaminB12: 2.4,
    folate: 400,
  };

  async function saveFood(record: FoodRecord) {
    record = normalizeFoodRecord(record);
    await dbPut("foods", record);
    setFoods((old) => [record, ...old.filter((x) => x.id !== record.id)]);
    const shared = await apiRequest<SharedData>("/api/data");
    setFoodLibrary(shared.foodLibrary || []);
    setExerciseLibrary(shared.exerciseLibrary || []);
    setWalkingProfiles(shared.walkingProfiles || []);
    setStatus(`已记录：${record.name}`);
  }

  async function saveExercise(record: ExerciseRecord) {
    await dbPut("exercises", record);
    await refreshSharedData();
    setStatus(`已记录：${record.name}`);
  }

  async function saveProfile(next: Profile) {
    await dbPut("profile", next);
    setProfile(next);
    await refreshSharedData();
    setStatus("个人资料已保存，之后的消耗估算会使用这些数据");
  }

  async function saveWeight(record: WeightRecord) {
    await dbPut("weights", record);
    setWeights((old) => [record, ...old.filter((x) => x.id !== record.id)]);
    await refreshSharedData();
    setStatus(`已记录体重：${record.weight} kg`);
  }

  async function saveBaselineMultiplier(recordDate: string, multiplier: number) {
    const normalized = Math.max(0.7, Math.min(2, Number(multiplier || 1.2)));
    const existingDates = [...foods, ...exercises, ...weights]
      .map((item) => item.date)
      .filter(Boolean)
      .sort();
    const legacyDate = existingDates[0];
    const legacyRecord = baselineMultipliers.length === 0 && legacyDate && legacyDate < recordDate
      ? {
          id: legacyDate,
          date: legacyDate,
          multiplier: Math.max(0.7, Math.min(2, Number(profile.sedentaryMultiplier ?? 1.2))),
          recordedAt: new Date().toISOString(),
        } satisfies BaselineMultiplierRecord
      : null;
    const record: BaselineMultiplierRecord = {
      id: recordDate,
      date: recordDate,
      multiplier: normalized,
      recordedAt: new Date().toISOString(),
    };
    if (legacyRecord) await dbPut("baselineMultipliers", legacyRecord);
    await dbPut("baselineMultipliers", record);
    setBaselineMultipliers((old) => [
      ...old.filter((item) => item.id !== record.id && item.id !== legacyRecord?.id),
      ...(legacyRecord ? [legacyRecord] : []),
      record,
    ]);
    const latestRecordedDate = [...baselineMultipliers.map((item) => item.date), recordDate].sort().at(-1);
    if (recordDate === latestRecordedDate) await saveProfile({ ...profile, sedentaryMultiplier: normalized, id: "me" });
    setStatus(`已记录 ${formatChartDate(recordDate)} 的居家基线系数 ${normalized.toFixed(2)}`);
  }

  async function saveTargetScenario(recordDate: string, scenario: TargetScenario) {
    const record: TargetScenarioDayRecord = {
      id: recordDate,
      date: recordDate,
      scenario,
      source: "manual",
      recordedAt: new Date().toISOString(),
    };
    await dbPut("targetScenarios", record);
    setTargetScenarios((old) => [...old.filter((item) => item.id !== record.id), record]);
    setStatus(`已将 ${formatChartDate(recordDate)} 设为${targetScenarioLabel(scenario)}`);
  }

  async function useDefaultTargetScenario(recordDate: string) {
    await dbDelete("targetScenarios", recordDate);
    setTargetScenarios((old) => old.filter((item) => item.id !== recordDate));
    setStatus(`${formatChartDate(recordDate)} 已恢复使用当时默认情景`);
  }

  async function saveDefaultTargetScenario(scenario: TargetScenario) {
    const effectiveDate = today();
    const record: TargetScenarioDefaultRecord = {
      id: effectiveDate,
      date: effectiveDate,
      scenario,
      recordedAt: new Date().toISOString(),
    };
    await dbPut("targetScenarioDefaults", record);
    setTargetScenarioDefaults((old) => [...old.filter((item) => item.id !== record.id), record]);
    setStatus(`从今天起，默认使用${targetScenarioLabel(scenario)}`);
  }

  async function saveLongTermEnergyTarget(patch: { enabled?: boolean; adjustment?: number }) {
    const effectiveDate = today();
    const current = longTermEnergyTargetForDate(effectiveDate, energyTargetDefaults);
    const record: EnergyTargetDefaultRecord = {
      id: effectiveDate,
      date: effectiveDate,
      enabled: patch.enabled ?? current.enabled,
      adjustment: patch.adjustment ?? current.adjustment,
      recordedAt: new Date().toISOString(),
    };
    await dbPut("energyTargetDefaults", record);
    setEnergyTargetDefaults((old) => [...old.filter((item) => item.id !== record.id), record]);
    setStatus("已更新从今天起生效的长期热量目标");
  }

  async function saveDayEnergyTarget(recordDate: string, patch: { enabled?: boolean; adjustment?: number }, source: "manual" | "llm" = "manual") {
    const current = energyTargetDays.find((item) => item.date === recordDate);
    const record: EnergyTargetDayRecord = {
      id: recordDate,
      date: recordDate,
      enabled: patch.enabled ?? current?.enabled ?? true,
      adjustment: patch.adjustment ?? current?.adjustment ?? 0,
      source,
      recordedAt: new Date().toISOString(),
    };
    await dbPut("energyTargetDays", record);
    setEnergyTargetDays((old) => [...old.filter((item) => item.id !== record.id), record]);
    setStatus(`已更新 ${formatChartDate(recordDate)} 的热量目标特例`);
  }

  async function useLongTermEnergyTarget(recordDate: string) {
    await dbDelete("energyTargetDays", recordDate);
    setEnergyTargetDays((old) => old.filter((item) => item.id !== recordDate));
    setStatus(`${formatChartDate(recordDate)} 已恢复遵从当时的长期目标`);
  }

  async function submitFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nutrients = Object.fromEntries(nutrientLabels.map(([key]) => [key, n(form.get(key))])) as Nutrients;
    await saveFood({
      id: editingFood?.id || uid(), date: String(form.get("date")), time: String(form.get("time")),
      meal: String(form.get("meal")), name: String(form.get("name")), weight: n(form.get("weight")),
      note: String(form.get("note") || ""), ...nutrients,
    });
    setExpandedFoodId(editingFood?.id || null);
    setEditingFood(null);
    setModal(null);
  }

  function submitExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveExercise({
      id: uid(), date: String(form.get("date")), time: String(form.get("time")),
      name: String(form.get("name")), calories: n(form.get("calories")), duration: n(form.get("duration")),
      steps: n(form.get("steps")), intensity: String(form.get("intensity")),
      source: String(form.get("source")), note: String(form.get("note") || ""),
    });
    setModal(null);
  }

  async function submitWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weightDate = String(form.get("date"));
    const originalId = String(form.get("originalId") || "");
    await saveWeight({ id: weightDate, date: weightDate, weight: n(form.get("weight")), note: String(form.get("note") || "") });
    if (originalId && originalId !== weightDate) {
      await dbDelete("weights", originalId);
      setWeights((old) => old.filter((item) => item.id !== originalId));
      setStatus(`已将体重记录从 ${formatChartDate(originalId)} 移至 ${formatChartDate(weightDate)}`);
    }
    setEditingWeight(null);
    setModal(null);
  }

  async function persistLatestBaselineProfile(records: BaselineMultiplierRecord[]) {
    const latestMultiplier = [...records].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.multiplier ?? 1.2;
    if (Number(profile.sedentaryMultiplier ?? 1.2) === latestMultiplier) return;
    const nextProfile = { ...profile, id: "me" as const, sedentaryMultiplier: latestMultiplier };
    await dbPut("profile", nextProfile);
    setProfile(nextProfile);
  }

  async function submitBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const baselineDate = String(form.get("date"));
    const originalId = String(form.get("originalId") || "");
    const record: BaselineMultiplierRecord = {
      id: baselineDate,
      date: baselineDate,
      multiplier: Math.max(0.7, Math.min(2, n(form.get("multiplier")) || 1.2)),
      recordedAt: new Date().toISOString(),
    };
    await dbPut("baselineMultipliers", record);
    if (originalId && originalId !== baselineDate) await dbDelete("baselineMultipliers", originalId);
    const nextRecords = [
      ...baselineMultipliers.filter((item) => item.id !== originalId && item.id !== record.id),
      record,
    ];
    setBaselineMultipliers(nextRecords);
    await persistLatestBaselineProfile(nextRecords);
    setStatus(originalId && originalId !== baselineDate
      ? `已将基线系数记录从 ${formatChartDate(originalId)} 移至 ${formatChartDate(baselineDate)}`
      : `已更新 ${formatChartDate(baselineDate)} 的基线系数为 ${record.multiplier.toFixed(2)}`);
    setEditingBaseline(null);
    setModal(null);
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveProfile({ ...profile, id: "me", birthdate: String(form.get("birthdate")), sex: String(form.get("sex")) as Profile["sex"], height: n(form.get("height")) });
    setModal(null);
  }

  async function refreshSharedData() {
    const shared = await apiRequest<SharedData>("/api/data");
    shared.targetScenarios ||= [];
    shared.targetScenarioDefaults ||= [];
    shared.energyTargetDays ||= [];
    shared.energyTargetDefaults ||= [];
    setFoodLibrary(shared.foodLibrary || []);
    setExerciseLibrary(shared.exerciseLibrary || []);
    setWalkingProfiles(shared.walkingProfiles || []);
    setFoods(shared.foods);
    setExercises(shared.exercises);
    if (shared.profile[0]) setProfile(shared.profile[0]);
    setWeights(shared.weights);
    setBaselineMultipliers(shared.baselineMultipliers || []);
    setTargetScenarios(shared.targetScenarios);
    setTargetScenarioDefaults(shared.targetScenarioDefaults);
    setEnergyTargetDays(shared.energyTargetDays);
    setEnergyTargetDefaults(shared.energyTargetDefaults);
    await Promise.all([
      ...shared.foods.map((x) => localPut("foods", x)),
      ...shared.exercises.map((x) => localPut("exercises", x)),
      ...shared.profile.map((x) => localPut("profile", x)),
      ...shared.weights.map((x) => localPut("weights", x)),
      ...(shared.baselineMultipliers || []).map((x) => localPut("baselineMultipliers", x)),
      ...shared.targetScenarios.map((x) => localPut("targetScenarios", x)),
      ...shared.targetScenarioDefaults.map((x) => localPut("targetScenarioDefaults", x)),
      ...shared.energyTargetDays.map((x) => localPut("energyTargetDays", x)),
      ...shared.energyTargetDefaults.map((x) => localPut("energyTargetDefaults", x)),
    ]);
  }

  async function sendChat() {
    const text = quickText.trim();
    if (!text || chatSending) return;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: text };
    setChatMessages((old) => [...old, userMessage]);
    setQuickText("");
    setChatSending(true);
    try {
      const result = await apiRequest<{ reply: string; actions: Array<{ store: string; value: object }> }>("/api/llm/chat", { message: text, selectedDate: date });
      setChatMessages((old) => [...old, { id: `assistant-${Date.now()}`, role: "assistant", content: result.reply }]);
      try { await refreshSharedData(); } catch { setStatus("记录已保存，但页面刷新失败，请重新打开首页查看"); return; }
      setStatus(result.actions.length ? `LLM 已写入 ${result.actions.length} 条记录` : "LLM 已回复，未写入记录");
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM 请求失败";
      setChatMessages((old) => [...old, { id: `error-${Date.now()}`, role: "assistant", content: `无法处理：${message}` }]);
      setQuickText(text);
      setStatus("本次请求未完成，输入已保留，请核对记录及具体原因后重试");
    } finally {
      setChatSending(false);
    }
  }

  function appendQuickPrompt(text: string) {
    setQuickText((current) => {
      const existing = current.trim().replace(/[，,\s]+$/, "");
      return existing ? `${existing}，${text}` : text;
    });
  }

  async function saveLlmConfig(next: { proxyMode?: string; proxyUrl?: string; headerPreset?: string; customHeaders?: string; baseUrl: string; apiKey: string; model: string; systemPrompt: string; enableSearch: boolean }) {
    await apiRequest("/api/llm/config", next);
    const updated = await apiRequest<LlmConfig>("/api/llm/config");
    setLlmConfig(updated);
    setModal(null);
    setStatus("LLM 配置已保存");
  }

  async function clearChat() {
    await apiRequest("/api/chat/clear", {});
    setChatMessages([]);
  }

  async function parseQuick() {
    const text = quickText.trim();
    if (!text) return;
    const matched = Object.entries(foodCatalog).find(([, item]) =>
      item.aliases.some((alias) => text.includes(alias)),
    );
    if (matched) {
      const [name, item] = matched;
      const countMatch = text.match(/(\d+(?:\.\d+)?)\s*(个|份|只|枚)/);
      const count = countMatch ? Number(countMatch[1]) : 1;
      const scaled = Object.fromEntries(
        nutrientLabels.map(([key]) => [key, Number((item.nutrients[key] * count).toFixed(2))]),
      ) as Nutrients;
      await saveFood({ id: uid(), date, time: nowTime(), meal: guessMeal(), name, weight: item.weight * count, note: `由快速记账识别：“${text}”`, ...scaled });
      setQuickText("");
      return;
    }
    const stepsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:万)?步/);
    const gymMatch = /(健身|力量|训练|跑步|骑行|游泳|瑜伽|散步|走路)/.exec(text);
    if (stepsMatch || gymMatch) {
      let foundSteps = stepsMatch ? Number(stepsMatch[1]) : 0;
      if (stepsMatch && text.includes("万步")) foundSteps *= 10000;
      const duration = Number(text.match(/(\d+)\s*分钟/)?.[1] || 0);
      const intensity = text.includes("高强度") ? "高强度" : text.includes("低强度") ? "低强度" : "中等强度";
      const named = gymMatch?.[1] || "步行";
      const activeWeight = latestWeight || 65;
      const activeHeight = profile.height || 165;
      const distanceKm = foundSteps * activeHeight * 0.415 / 100000;
      const stepCalories = foundSteps ? activeWeight * distanceKm * 0.5 : 0;
      const met = intensity === "高强度" ? 8 : intensity === "低强度" ? 3.5 : 6;
      const workoutCalories = duration ? Math.max(0, met - 1) * 3.5 * activeWeight / 200 * duration : 0;
      const estimated = Math.round(stepCalories + workoutCalories);
      const estimateBasis = latestWeight ? `按最近体重 ${latestWeight} kg 估算` : "暂按 65 kg 估算；记录体重后会更准确";
      await saveExercise({ id: uid(), date, time: nowTime(), name: named, calories: estimated, duration, steps: foundSteps, intensity, source: "描述估算", note: `由快速记账识别：“${text}”；${estimateBasis}，可按手表数据修改` });
      setQuickText("");
      return;
    }
    setStatus("暂时没能识别，请用“添加饮食/运动”详细记录，或直接告诉 Codex 帮你查并填写");
  }

  function startSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setStatus("当前浏览器不支持语音识别，请直接输入"); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setStatus("没有听清，请再试一次");
    recognition.onresult = (event) => setQuickText(event.results[0][0].transcript);
    recognition.start();
  }

  async function remove(kind: "foods" | "exercises", id: string) {
    await dbDelete(kind, id);
    if (kind === "foods") setFoods((old) => old.filter((x) => x.id !== id));
    else setExercises((old) => old.filter((x) => x.id !== id));
  }

  async function removeWeight(record: WeightRecord) {
    await dbDelete("weights", record.id);
    setWeights((old) => old.filter((item) => item.id !== record.id));
    setEditingWeight(null);
    setModal(null);
    await refreshSharedData();
    setStatus(`已删除 ${formatChartDate(record.date)} 的体重记录`);
  }

  async function removeBaseline(record: BaselineMultiplierRecord) {
    await dbDelete("baselineMultipliers", record.id);
    const nextRecords = baselineMultipliers.filter((item) => item.id !== record.id);
    setBaselineMultipliers(nextRecords);
    await persistLatestBaselineProfile(nextRecords);
    setEditingBaseline(null);
    setModal(null);
    setStatus(`已删除 ${formatChartDate(record.date)} 的基线系数记录`);
  }

  const selectedDate = new Date(`${date}T12:00:00`);
  const displayDate = selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const displayWeekday = selectedDate.toLocaleDateString("zh-CN", { weekday: "long" });

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">日</span><div><strong>每日摄入</strong><small>吃得明白，动得清楚</small></div></div>
        <nav>
          <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>今日</button>
          <button className={tab === "body" ? "active" : ""} onClick={() => setTab("body")}>身体趋势</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>历史与备份</button>
        </nav>
        <button className="appearance-button" aria-label="外观设置" title="外观设置" onClick={() => setModal("appearance")}>◐ <span>外观</span></button>
        <span className="save-state"><i /> {status}</span>
      </header>

      <div className="shell">
        {tab === "today" ? <>
          <section className="day-heading">
            <div><p>我的一天</p><h1><span>{displayDate}</span><span>{displayWeekday}</span></h1></div>
            <AppDatePicker value={date} onChange={setDate} />
          </section>

          <section className="llm-chat">
            <div className="llm-head">
              <div className="quick-icon">✦</div>
              <div className="quick-copy">
                <strong>营养记录助手</strong>
                <span>{llmConfig.configured ? `${llmConfig.model} · ${llmConfig.enableSearch ? "允许联网检索" : "未开启联网"}` : "尚未配置模型，点击右侧完成设置"}</span>
              </div>
              <div className="llm-head-actions">
                {chatMessages.length > 0 && <button onClick={clearChat}>清空对话</button>}
                <button className={llmConfig.configured ? "configured" : ""} onClick={() => setModal("llm")}>{llmConfig.configured ? "模型设置" : "配置 LLM"}</button>
              </div>
            </div>
            <div className="chat-log" aria-live="polite">
              {chatMessages.length === 0 ?
                <div className="chat-message assistant"><span>助手</span><p>{llmConfig.configured ? "告诉我吃了什么、运动了多少或今天的体重。我会核对信息后直接写入。" : "配置兼容接口和系统提示词后，这里会成为真正的 LLM 对话框。"}</p></div> :
                chatMessages.slice(-8).map((message) => <div className={`chat-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "助手"}</span><p>{message.content}</p></div>)
              }
              {chatSending && <div className="chat-message assistant thinking"><span>助手</span><p>正在逐项整理食物和运动，完成后统一保存…</p></div>}
            </div>
            <div className="recording-prompts" aria-label="快捷输入">
              {[
                ["健身日", "今天是健身日"],
                ["放纵日不算热量缺口", "今天是放纵日，不计算热量缺口"],
                ["有氧日", "今天是有氧日"],
                ["新增食物记录", "新增食物记录："],
                ["新增锻炼记录", "新增锻炼记录："],
                ["修改已有记录", "已存在的记录有误，需要修改："],
              ].map(([label, prompt]) => <button type="button" key={label} onClick={() => appendQuickPrompt(prompt)} disabled={!llmConfig.configured || chatSending}>{label}</button>)}
            </div>
            <div className="llm-input">
              <textarea value={quickText} onChange={(e) => setQuickText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} placeholder={llmConfig.configured ? "例如：昨天午饭吃了一碗牛腩粉，晚上走了 8000 步…" : "请先配置 LLM 接口"} disabled={!llmConfig.configured || chatSending} rows={2} />
              <button aria-label="语音输入" className={listening ? "listening" : "mic"} onClick={startSpeech} disabled={!llmConfig.configured || chatSending}>{listening ? "正在听…" : "●"}</button>
              <button className="send" onClick={sendChat} disabled={!llmConfig.configured || chatSending || !quickText.trim()}>{chatSending ? "处理中" : "发送"}</button>
            </div>
            <div className="llm-foot"><span>模型只有返回通过校验的结构化操作时才会写入数据库</span><button onClick={() => setModal("llm")}>系统提示词与 API 接入 →</button></div>
          </section>

          <DailyScenarioPicker
            date={date}
            scenario={dayPlan.scenario}
            hasDayOverride={sortedTargetScenarios.some((item) => item.date === date)}
            defaultScenario={defaultScenarioForDate(today(), sortedTargetScenarioDefaults).scenario}
            onScenarioChange={(scenario) => saveTargetScenario(date, scenario)}
            onUseDefault={() => useDefaultTargetScenario(date)}
            onDefaultChange={saveDefaultTargetScenario}
          />

          <section className="summary-grid">
            <article className="calorie-card">
              <div className="card-title"><span>今日能量</span><em className="calorie-target-label">今日净摄入目标：<strong>{calorieTarget.toLocaleString()}</strong> 千卡</em></div>
              <div className="energy-row">
                <div><b>{Math.round(net)}</b><small>千卡净摄入</small></div>
                <div className="energy-equation"><span><strong>{Math.round(totals.calories)}</strong> 摄入</span><i>−</i><span><strong>{Math.round(burned)}</strong> 消耗</span></div>
              </div>
              <div className="calorie-balance" style={{ "--energy-status-color": calorieStatus.color } as CSSProperties}>
                <span>{calorieGap >= 0 ? "距今日目标还差" : "已超出今日目标"}</span>
                <strong>{Math.abs(Math.round(calorieGap)).toLocaleString()} 千卡</strong>
              </div>
              <div className="progress energy-target-progress" style={{ "--energy-status-color": calorieStatus.color } as CSSProperties}><i style={{ width: `${calorieStatus.progressPercentage}%` }} /></div>
              <small>居家久坐基线 {dayPlan.baseCalories.toLocaleString()} 千卡（静息代谢 × {dayPlan.baselineMultiplier.toFixed(2)}）· 走路和训练的活动热量另行扣除 · {dayPlan.weight ? `按当日估算体重 ${dayPlan.weight.toFixed(1)} kg` : "完善身体资料后可个性化"}{dayPlan.balanceEnabled ? ` · ${dayPlan.balanceMode === "exception" ? "今日特例" : "长期目标"}：${dayPlan.balanceAdjustment < 0 ? "缺口" : dayPlan.balanceAdjustment > 0 ? "盈余" : "不设缺口或盈余"} ${Math.abs(dayPlan.balanceAdjustment)} 千卡` : " · 未启用缺口或盈余目标"}</small>
            </article>
            <article className="macro-card">
              <div className="card-title"><span>三大营养素</span><em>克</em></div>
              <div className="macro-list">
                <Macro name="蛋白质" value={totals.protein} target={recommendations.protein} color="#0072B2" />
                <Macro name="碳水" value={totals.carbs} target={recommendations.carbs} color="#E69F00" />
                <Macro name="脂肪" value={totals.fat} target={recommendations.fat} color="#CC79A7" />
              </div>
            </article>
            <article className="movement-card">
              <div className="card-title"><span>今日活动</span><em>{dayExercises.length} 条记录</em></div>
              <div className="movement-stats"><div><b>{steps.toLocaleString()}</b><small>步数</small></div><div><b>{Math.round(burned)}</b><small>消耗千卡</small></div></div>
              {bmr > 0 && <div className="bmr-hint">估算基础代谢 <strong>{bmr}</strong> 千卡/天</div>}
              <div className="library-actions home-record-actions"><button onClick={() => setModal("walking")}>＋ 添加步行</button><button onClick={() => setModal("exercise")}>＋ 添加运动</button></div>
            </article>
          </section>

          <TargetPlanCard
            plan={dayPlan}
            date={date}
            baselineMultipliers={sortedBaselineMultipliers}
            energyTargetDays={sortedEnergyTargetDays}
            energyTargetDefaults={sortedEnergyTargetDefaults}
            longTermPlan={currentLongTermPlan}
            onSaveLongTerm={saveLongTermEnergyTarget}
            onSaveDay={(patch) => saveDayEnergyTarget(date, patch)}
            onUseLongTerm={() => useLongTermEnergyTarget(date)}
            onMultiplierChange={(multiplier) => saveBaselineMultiplier(date, multiplier)}
          />

          <section className="content-grid">
            <div className="records">
              <div className="section-title"><div><p>饮食记录</p><h2>今天吃了什么</h2></div><div className="library-actions home-record-actions"><button onClick={() => { setEditingFood(null); setModal("food"); }}>＋ 手动添加</button><button onClick={() => { setModal("libraryPick"); refreshSharedData().catch(() => setStatus("食品库读取失败，请重新启动应用")); }}>选择已记录过的食物</button></div></div>
              {dayFoods.length === 0 ? <Empty text="还没有饮食记录" hint="用上方快速记账，或手动添加第一餐" /> :
                dayFoods.sort((a, b) => b.time.localeCompare(a.time)).map((food) =>
                  <article
                    className={`record food-record ${expandedFoodId === food.id ? "expanded" : ""}`}
                    key={food.id}
                    onClick={() => setExpandedFoodId((current) => current === food.id ? null : food.id)}
                  >
                    <div className="food-record-summary">
                      <div className="food-symbol">食</div>
                      <div className="record-main"><span>{food.meal} · {food.time}</span><strong>{food.name}</strong><small>{food.weight ? `${food.weight} 克 · ` : ""}{food.note}</small></div>
                      <div className="record-numbers"><b>{Math.round(food.calories)}</b><small>千卡</small></div>
                      <button className="expand-indicator" aria-expanded={expandedFoodId === food.id} onClick={(event) => { event.stopPropagation(); setExpandedFoodId((current) => current === food.id ? null : food.id); }}>{expandedFoodId === food.id ? "收起 ↑" : "详情 ↓"}</button>
                      <button className="edit-record" onClick={(event) => { event.stopPropagation(); setEditingFood(food); setModal("food"); }}>修改</button>
                      <button className="delete" aria-label={`删除${food.name}`} onClick={(event) => { event.stopPropagation(); remove("foods", food.id); }}>×</button>
                    </div>
                    {expandedFoodId === food.id && <div className="food-nutrient-details" onClick={(event) => event.stopPropagation()}>
                      <div className="food-detail-head"><div><strong>完整营养明细</strong><span>本条记录 · {food.weight ? `${food.weight} 克` : "未记录重量"}</span></div><button onClick={() => { setEditingFood(food); setModal("food"); }}>修改这条记录</button></div>
                      <div className="food-nutrient-grid">
                        {nutrientLabels.map(([key, label, unit]) => <div key={key}><span>{label}</span><b>{Number(Number(food[key] || 0).toFixed(2))}<small> {unit}</small></b></div>)}
                      </div>
                      <p>数据来源或备注：{food.note || "未填写"}</p>
                    </div>}
                  </article>)
              }
              <div className="section-title activity-title"><div><p>运动记录</p><h2>今天动了多少</h2></div></div>
              {dayExercises.length === 0 ? <Empty text="还没有运动记录" hint="描述步数、训练时间，或填入手表数据" /> :
                dayExercises.map((item) =>
                  <article className="record exercise" key={item.id}>
                    <div className="food-symbol">动</div>
                    <div className="record-main"><span>{item.time} · {item.intensity} · {item.source}</span><strong>{item.name}</strong><small>{item.duration ? `${item.duration} 分钟` : ""}{exerciseSteps(item) ? ` · ${exerciseSteps(item).toLocaleString()} 步` : ""}{item.note ? ` · ${item.note}` : ""}</small></div>
                    <div className="record-numbers"><b>−{Math.round(item.calories)}</b><small>千卡</small></div>
                    <button className="edit-record" onClick={()=>setEditingActivity(item)}>修改</button>
                    <button className="delete" aria-label={`删除${item.name}`} onClick={() => remove("exercises", item.id)}>×</button>
                  </article>)
              }
            </div>

            <aside className="nutrition">
              <div className="section-title"><div><p>营养素总览</p><h2>不只看热量</h2></div></div>
              <article className="nutrition-panel">
                <div className="nutrition-columns"><span>营养素</span><span>摄入 / 每日参考</span></div>
                {nutrientLabels.slice(4).map(([key, label, unit]) => {
                  const target = recommendations[key];
                  const isLimit = key === "addedSugar" || key === "sodium";
                  return <div className={`nutrient-row ${(isLimit && totals[key] > target) ? "over" : ""}`} key={key}>
                    <div><span>{label}</span>{isLimit ? <em>建议上限</em> : target === 0 ? <em>成分项</em> : null}</div>
                    <div className="nutrient-values">
                      <b>{Number(totals[key].toFixed(1))}<small>{target > 0 ? ` / ${target} ${unit}` : ` ${unit}`}</small></b>
                      {target > 0 && <div className="micro-progress"><i style={{ width: `${Math.min(100, totals[key] / target * 100)}%` }} /></div>}
                    </div>
                  </div>;
                })}
              </article>
              <p className="data-note">总糖仅包含单糖和双糖，不包含淀粉或膳食纤维；蔗糖和添加糖分别单列。添加糖建议上限为 25 g/天。旧记录未提供细分糖时会显示为 0，不代表一定不含。</p>
            </aside>
          </section>
        </> : tab === "body" ?
          <Body
            profile={profile}
            weights={sortedWeights}
            baselineMultipliers={sortedBaselineMultipliers}
            bmr={targetPlanForDate(today(), profile, sortedWeights, sortedBaselineMultipliers).bmr}
            onEditProfile={() => setModal("profile")}
            onAddWeight={() => { setEditingWeight(null); setModal("weight"); }}
            onEditWeight={(record) => { setEditingWeight(record); setModal("weight"); }}
            onDeleteWeight={(record) => { setEditingWeight(record); setModal("deleteWeight"); }}
            onEditBaseline={(record) => { setEditingBaseline(record); setModal("baseline"); }}
            onDeleteBaseline={(record) => { setEditingBaseline(record); setModal("deleteBaseline"); }}
          /> :
          <History
            exerciseLibrary={exerciseLibrary} walkingProfiles={walkingProfiles}
            foodLibrary={foodLibrary}
            foods={foods}
            exercises={exercises}
            profile={profile}
            weights={sortedWeights}
            baselineMultipliers={sortedBaselineMultipliers}
            targetScenarios={sortedTargetScenarios}
            targetScenarioDefaults={sortedTargetScenarioDefaults}
            energyTargetDays={sortedEnergyTargetDays}
            energyTargetDefaults={sortedEnergyTargetDefaults}
            llmConfig={llmConfig}
            onOpenConfig={() => setModal("llm")}
            onDataChanged={refreshSharedData}
          />}
      </div>

      {editingActivity&&<ActivityEditModal record={editingActivity} onClose={()=>setEditingActivity(null)} onSave={saveExercise}/>}
      {modal === "libraryPick" && <LibraryPicker foods={foodLibrary} records={foods} date={date} onClose={() => setModal(null)} onSave={saveFood} />}
      {modal === "food" && <FoodModal onClose={() => { setEditingFood(null); setModal(null); }} onSubmit={submitFood} date={date} record={editingFood} />}
      {modal === "exercise" && <ActivityModal entries={exerciseLibrary} records={exercises} sex={profile.sex} date={date} onClose={() => setModal(null)} onSave={saveExercise} />}
      {modal === "walking" && <WalkingModal profiles={walkingProfiles} weights={weights} sex={profile.sex} date={date} onClose={() => setModal(null)} onSave={saveExercise} onPut={async (store,value) => { await apiRequest("/api/put", {store,value}); await refreshSharedData(); }} />}
      {modal === "weight" && <WeightModal onClose={() => { setEditingWeight(null); setModal(null); }} onSubmit={submitWeight} date={editingWeight?.date || date} record={editingWeight} />}
      {modal === "deleteWeight" && editingWeight && <DeleteWeightModal record={editingWeight} onClose={() => { setEditingWeight(null); setModal(null); }} onConfirm={() => removeWeight(editingWeight)} />}
      {modal === "baseline" && editingBaseline && <BaselineModal record={editingBaseline} onClose={() => { setEditingBaseline(null); setModal(null); }} onSubmit={submitBaseline} />}
      {modal === "deleteBaseline" && editingBaseline && <DeleteBaselineModal record={editingBaseline} onClose={() => { setEditingBaseline(null); setModal(null); }} onConfirm={() => removeBaseline(editingBaseline)} />}
      {modal === "profile" && <ProfileModal onClose={() => setModal(null)} onSubmit={submitProfile} profile={profile} />}
      {modal === "llm" && <LlmConfigModal onClose={() => setModal(null)} onSave={saveLlmConfig} config={llmConfig} />}
      {modal === "appearance" && <AppearanceModal preference={themePreference} onChange={changeTheme} onClose={() => setModal(null)} />}
    </main>
  );
}

function AppearanceModal({ preference, onChange, onClose }: { preference: ThemePreference; onChange: (value: ThemePreference) => void; onClose: () => void }) {
  const choices: Array<{ value: ThemePreference; title: string; note: string; icon: string }> = [
    { value: "system", title: "跟随系统", note: "系统切换浅色或深色时，应用自动同步", icon: "◐" },
    { value: "light", title: "固定浅色", note: "始终使用明亮背景，不受系统外观影响", icon: "☀" },
    { value: "dark", title: "固定深色", note: "始终使用深色背景，不受系统外观影响", icon: "☾" },
  ];
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal compact appearance-modal" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <div className="modal-head"><div><p>本机偏好</p><h2 id="appearance-title">外观设置</h2></div><button type="button" onClick={onClose}>×</button></div>
      <div className="theme-choices">
        {choices.map((choice) => <button type="button" className={preference === choice.value ? "active" : ""} onClick={() => onChange(choice.value)} key={choice.value}>
          <i>{choice.icon}</i><span><strong>{choice.title}</strong><small>{choice.note}</small></span><em>{preference === choice.value ? "已选择" : ""}</em>
        </button>)}
      </div>
      <p className="appearance-note">外观设置只保存在这台电脑，不会写入数据库或云盘同步包。</p>
      <div className="modal-actions"><button className="primary" type="button" onClick={onClose}>完成</button></div>
    </section>
  </div>;
}

function Macro({ name, value, target, color }: { name: string; value: number; target: number; color: string }) {
  return <div className="macro"><div><span>{name}</span><b>{Math.round(value)} <small>/ {target}</small></b></div><div className="progress"><i style={{ width: `${Math.min(100, value / target * 100)}%`, background: color }} /></div></div>;
}

type ChartTooltipState = { x: number; y: number; text: string } | null;

function SvgChartTooltip({ tooltip, width, height }: { tooltip: ChartTooltipState; width: number; height: number }) {
  if (!tooltip) return null;
  const boxWidth = Math.min(330, Math.max(150, tooltip.text.length * 7.2 + 24));
  const boxHeight = tooltip.text.length > 38 ? 52 : 38;
  const boxX = Math.max(8, Math.min(width - boxWidth - 8, tooltip.x - boxWidth / 2));
  const preferredY = tooltip.y - boxHeight - 12;
  const boxY = preferredY >= 5 ? preferredY : Math.min(height - boxHeight - 5, tooltip.y + 12);
  return <foreignObject className="chart-tooltip-foreign" x={boxX} y={boxY} width={boxWidth} height={boxHeight} aria-hidden="true">
    <div className="chart-tooltip-box">{tooltip.text}</div>
  </foreignObject>;
}

function DailyScenarioPicker({ date, scenario, defaultScenario, hasDayOverride, onScenarioChange, onDefaultChange, onUseDefault }: {
  date: string;
  scenario: TargetScenario;
  defaultScenario: TargetScenario;
  hasDayOverride: boolean;
  onScenarioChange: (scenario: TargetScenario) => Promise<void>;
  onDefaultChange: (scenario: TargetScenario) => Promise<void>;
  onUseDefault: () => Promise<void>;
}) {
  return <section className="daily-scenario-picker" aria-label={`${formatChartDate(date)}的目标情景`}>
    <div className="daily-scenario-heading">
      <div><p>当日目标情景</p><strong>{formatChartDate(date)} · {hasDayOverride ? "已单独设置" : "沿用当时默认"}</strong></div>
      {hasDayOverride && <button type="button" onClick={onUseDefault}>恢复当时默认</button>}
    </div>
    <div className="daily-scenario-grid">
      {targetScenarioOptions.map((item) => <article key={item.key} className={`scenario-${item.key} ${scenario === item.key ? "active" : ""}`}>
        <button type="button" className="scenario-select" aria-pressed={scenario === item.key} onClick={() => onScenarioChange(item.key)}>
          <span>{item.short}</span><div><strong>{item.name}</strong><small>{item.description}</small></div>
        </button>
        <label className={`scenario-default-toggle ${defaultScenario === item.key ? "selected" : ""}`}>
          <input type="radio" name="default-target-scenario" aria-label={`将${item.name}设为默认`} checked={defaultScenario === item.key} onChange={() => onDefaultChange(item.key)} />
          <i /><span>设为默认</span>
        </label>
      </article>)}
    </div>
    <small className="daily-scenario-note">选择卡片只修改当前显示日期；“设为默认”从今天起影响之后未单独设置的日期，不会改写过去。</small>
  </section>;
}

function TargetPlanCard({ plan, date, baselineMultipliers, energyTargetDays, energyTargetDefaults, longTermPlan, onSaveLongTerm, onSaveDay, onUseLongTerm, onMultiplierChange }: {
  plan: DailyTargetPlan;
  date: string;
  baselineMultipliers: BaselineMultiplierRecord[];
  energyTargetDays: EnergyTargetDayRecord[];
  energyTargetDefaults: EnergyTargetDefaultRecord[];
  longTermPlan: DailyTargetPlan;
  onSaveLongTerm: (patch: { enabled?: boolean; adjustment?: number }) => Promise<void>;
  onSaveDay: (patch: { enabled?: boolean; adjustment?: number }) => Promise<void>;
  onUseLongTerm: () => Promise<void>;
  onMultiplierChange: (multiplier: number) => Promise<void>;
}) {
  const dayRecord = energyTargetDays.find((item) => item.date === date);
  const longTerm = longTermEnergyTargetForDate(today(), energyTargetDefaults);
  const [longTermAdjustment, setLongTermAdjustment] = useState(longTerm.adjustment);
  const [dayAdjustment, setDayAdjustment] = useState(dayRecord?.adjustment ?? 0);
  const [multiplier, setMultiplier] = useState(plan.baselineMultiplier);
  const selectedMode = dayRecord ? "exception" : "longTerm";
  const selectedEnabled = dayRecord ? dayRecord.enabled : longTerm.enabled;
  const normalizedLongTermAdjustment = normalizeEnergyAdjustment(longTermAdjustment, longTermPlan.baseCalories);
  const normalizedDayAdjustment = normalizeEnergyAdjustment(dayAdjustment, plan.baseCalories);
  const longTermProjection = projectedMonthlyWeightChange(normalizedLongTermAdjustment, longTermPlan.weight);
  const sharedLimit = Math.max(1, selectedMode === "exception" ? plan.baseCalories : longTermPlan.baseCalories);
  const selectedAdjustment = normalizeEnergyAdjustment(selectedMode === "exception" ? dayAdjustment : longTermAdjustment, sharedLimit);
  const longTermMarkerAdjustment = normalizeEnergyAdjustment(longTermAdjustment, sharedLimit);
  const longTermMarkerPercent = (longTermMarkerAdjustment + sharedLimit) / (sharedLimit * 2) * 100;
  const longTermMarkerOffset = 11 - longTermMarkerPercent * .22;
  useEffect(() => setLongTermAdjustment(longTerm.adjustment), [longTerm.adjustment]);
  useEffect(() => setDayAdjustment(dayRecord?.adjustment ?? 0), [dayRecord?.adjustment, date]);
  useEffect(() => setMultiplier(plan.baselineMultiplier), [plan.baselineMultiplier, date]);

  const describeAdjustment = (value: number) => value < 0 ? `缺口 ${Math.abs(value)} kcal` : value > 0 ? `盈余 ${value} kcal` : "不设缺口或盈余";
  const sliderGradient = (baseCalories: number, weight: number) => {
    const base = Math.max(1, baseCalories);
    const point = (adjustment: number) => Math.max(0, Math.min(100, (adjustment + base) / (base * 2) * 100));
    const deficitFast = weight ? -weight * 7700 * .04 / 30 : -base * .28;
    const surplusGood = weight ? weight * 7700 * .015 / 30 : base * .1;
    const surplusWarn = weight ? weight * 7700 * .03 / 30 : base * .2;
    const surplusDanger = weight ? weight * 7700 * .05 / 30 : base * .32;
    return `linear-gradient(90deg, #2779bd 0%, #4b97cf ${point(deficitFast - base * .06)}%, #55a878 ${point(deficitFast)}%, #59ad78 50%, #63ae78 ${point(surplusGood)}%, #d7b044 ${point(surplusWarn)}%, #df793d ${point(surplusDanger)}%, #c83e4d 100%)`;
  };
  const commitLongTermAdjustment = (value: number) => {
    const normalized = normalizeEnergyAdjustment(value, longTermPlan.baseCalories);
    setLongTermAdjustment(normalized);
    void onSaveLongTerm({ adjustment: normalized });
  };
  const commitDayAdjustment = (value: number) => {
    const normalized = normalizeEnergyAdjustment(value, plan.baseCalories);
    setDayAdjustment(normalized);
    void onSaveDay({ adjustment: normalized });
  };

  return <details className="target-plan-card">
    <summary className="target-plan-head">
      <div><p>每日目标计划</p><h2>{formatChartDate(date)} 的净摄入目标</h2><span>{plan.weight ? `按趋势体重 ${plan.weight.toFixed(1)} kg 和静息代谢 × ${plan.baselineMultiplier.toFixed(2)} 计算；不预先包含专项步行或训练` : "尚无体重记录，暂用通用目标"}</span></div>
      <div className={`target-plan-summary ${plan.balanceEnabled ? "with-formula" : ""}`}>
        {plan.balanceEnabled
          ? <div className="target-plan-equation" aria-label={`基准目标 ${plan.baseCalories} 千卡，${plan.balanceAdjustment < 0 ? "减去" : "加上"} ${Math.abs(plan.balanceAdjustment)} 千卡，净摄入目标 ${plan.calories} 千卡`}>
              <span><small>基准目标</small><strong>{plan.baseCalories}<i>kcal</i></strong></span>
              <b>{plan.balanceAdjustment < 0 ? "−" : "+"}</b>
              <span><small>{plan.balanceAdjustment < 0 ? "缺口目标" : plan.balanceAdjustment > 0 ? "盈余目标" : "目标调整"}</small><strong>{Math.abs(plan.balanceAdjustment)}<i>kcal</i></strong></span>
              <b>=</b>
              <span className="target-plan-equation-result"><small>净摄入目标</small><strong>{plan.calories}<i>kcal</i></strong></span>
            </div>
          : <strong>{plan.calories}<small> kcal</small></strong>}
      </div>
      <span className="target-plan-expand">
        <i className="closed-label">展开目标设置与详情</i>
        <i className="open-label">收起目标设置与详情</i>
        <span className="target-plan-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false"><path d="M4.75 7.5 10 12.5l5.25-5" /></svg>
        </span>
      </span>
    </summary>
    <div className="target-plan-details">
    <div className="energy-balance-setting">
      <div className="energy-balance-title">
        <div><strong>热量缺口 / 盈余目标</strong><span>长期计划按生效日期保留历史；今日特例只覆盖当前显示日期。</span></div>
        <label className="balance-enable"><input type="checkbox" checked={selectedEnabled} onChange={(event) => selectedMode === "exception" ? onSaveDay({ enabled: event.target.checked }) : onSaveLongTerm({ enabled: event.target.checked })} /><span>启用目标</span></label>
      </div>
      <div className={`energy-target-mode ${selectedEnabled ? "" : "target-disabled"}`} aria-label="热量目标应用方式">
        <button type="button" disabled={!selectedEnabled} aria-pressed={selectedEnabled && selectedMode === "longTerm"} className={selectedEnabled && selectedMode === "longTerm" ? "active" : ""} onClick={onUseLongTerm}><strong>遵从长期目标</strong><small>采用该日期当时有效的长期设置</small></button>
        <button type="button" disabled={!selectedEnabled} aria-pressed={selectedEnabled && selectedMode === "exception"} className={selectedEnabled && selectedMode === "exception" ? "active" : ""} onClick={() => !dayRecord && onSaveDay({ enabled: selectedEnabled, adjustment: 0 })}><strong>今日特例</strong><small>只影响 {formatChartDate(date)}，不改长期计划</small></button>
      </div>
      <section className={`energy-target-control ${selectedEnabled ? "" : "target-disabled"}`} aria-disabled={!selectedEnabled}>
        <div className={`energy-long-term-content ${selectedMode === "exception" || !selectedEnabled ? "secondary" : ""}`}>
        <header className="energy-long-term-head">
          <div><strong>长期目标</strong><span>从今天起影响之后没有特例的日期</span></div>
          <div className="energy-adjustment-editor">
            <b>{describeAdjustment(normalizedLongTermAdjustment)}</b>
            <label><span>手动输入</span><input aria-label="手动输入长期热量缺口或盈余" disabled={!selectedEnabled} type="number" min={-longTermPlan.baseCalories} max={longTermPlan.baseCalories} step="25" value={longTermAdjustment} onChange={(event) => setLongTermAdjustment(Number(event.target.value || 0))} onBlur={() => commitLongTermAdjustment(longTermAdjustment)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /><i>kcal</i></label>
          </div>
        </header>
        <div className={`weight-projection ${longTermProjection.severity}`}>
            {normalizedLongTermAdjustment === 0 ? <span>预计维持当前体重趋势</span> : <span>预计每月{normalizedLongTermAdjustment < 0 ? "减重" : "增重"}约 <strong>{Math.abs(longTermProjection.kilograms).toFixed(2)} kg</strong>，约为当前体重 <strong>{longTermProjection.percent.toFixed(1)}%</strong></span>}
            {longTermProjection.severity === "warning" && <small>速度偏快，建议结合至少数周体重趋势谨慎调整。</small>}
            {longTermProjection.severity === "danger" && <small>速度严重过快，存在较高健康和反弹风险，请显著降低目标幅度。</small>}
        </div>
        </div>
        <div className="energy-slider-scale"><span>−{sharedLimit}</span><span>0</span><span>+{sharedLimit} kcal</span></div>
        <div className={`energy-shared-slider mode-${selectedMode}`} style={{ "--long-term-marker-left": `calc(${longTermMarkerPercent}% + ${longTermMarkerOffset}px)` } as CSSProperties}>
          {selectedMode === "exception" && <span className="long-term-slider-marker" aria-label={`长期目标位置：${describeAdjustment(normalizedLongTermAdjustment)}`} />}
          <input aria-label={selectedMode === "exception" ? "今日特例热量缺口或盈余" : "长期热量缺口或盈余"} disabled={!selectedEnabled} type="range" min={-sharedLimit} max={sharedLimit} step="25" value={selectedAdjustment} style={{ background: sliderGradient(sharedLimit, selectedMode === "exception" ? plan.weight : longTermPlan.weight) }} onChange={(event) => selectedMode === "exception" ? setDayAdjustment(Number(event.target.value)) : setLongTermAdjustment(Number(event.target.value))} onPointerUp={(event) => selectedMode === "exception" ? commitDayAdjustment(Number(event.currentTarget.value)) : commitLongTermAdjustment(Number(event.currentTarget.value))} onKeyUp={(event) => selectedMode === "exception" ? commitDayAdjustment(Number(event.currentTarget.value)) : commitLongTermAdjustment(Number(event.currentTarget.value))} />
        </div>
        {selectedMode === "exception" && <section className="energy-day-exception">
          <header>
            <div><strong>{formatChartDate(date)} 今日特例</strong><span>例如放纵日、聚餐日或临时恢复日；只影响这一天</span></div>
            <div className="energy-adjustment-editor">
              <b>{describeAdjustment(normalizedDayAdjustment)}</b>
              <label><span>手动输入</span><input aria-label="手动输入今日特例热量缺口或盈余" disabled={!selectedEnabled} type="number" min={-plan.baseCalories} max={plan.baseCalories} step="25" value={dayAdjustment} onChange={(event) => setDayAdjustment(Number(event.target.value || 0))} onBlur={() => commitDayAdjustment(dayAdjustment)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /><i>kcal</i></label>
            </div>
          </header>
          <small>当前特例{selectedEnabled ? "已启用" : "总开关已关闭"}；净摄入目标 {plan.calories} kcal。</small>
        </section>}
      </section>
      <p className="energy-target-note">滑块左端代表一天不摄入热量，右端代表在居家久坐基线上增加同等热量；走路、通勤和训练仍作为活动热量单独扣除。</p>
    </div>
    <div className="baseline-multiplier-setting">
      <div>
        <strong>居家久坐基线系数</strong>
        <span>默认 1.20。若连续观察一个月或一个季度后，体重变化与计划长期不符，可用外部估算或实际趋势校准。</span>
      </div>
      <div className="metabolism-slider">
        <div className="metabolism-scale"><span>较低消耗 · 易胖倾向</span><b>默认 1.20</b><span>较高消耗 · 易瘦倾向</span></div>
        <input
          aria-label="居家久坐基线系数"
          type="range"
          min="0.7"
          max="2"
          step="0.01"
          value={multiplier}
          onChange={(event) => setMultiplier(Number(event.target.value))}
          onPointerUp={(event) => onMultiplierChange(Number(event.currentTarget.value))}
          onKeyUp={(event) => onMultiplierChange(Number(event.currentTarget.value))}
        />
        <label>精确值<input type="number" min="0.7" max="2" step="0.01" value={multiplier} onChange={(event) => setMultiplier(Number(event.target.value || 0))} onBlur={() => onMultiplierChange(Number(multiplier || 1.2))} /></label>
      </div>
      <div className="baseline-formula">
        <span>{plan.bmr ? `公式静息代谢 ${plan.bmr} × ${plan.baselineMultiplier.toFixed(2)} = ${plan.baseCalories} kcal` : `当前系数 ${plan.baselineMultiplier.toFixed(2)}`}</span>
        <button type="button" disabled={plan.baselineMultiplier === 1.2} onClick={() => { setMultiplier(1.2); onMultiplierChange(1.2); }}>恢复默认 1.20</button>
      </div>
      <small>例如：公式结果为 1,600 kcal，外部长期估算认为 1,500 kcal 更符合，可输入 0.94。建议依据至少数周的体重趋势微调，不要因单日波动频繁修改。</small>
    </div>
    <div className="baseline-history">
      <div><strong>系数历史</strong><span>统计图和往期目标会采用当时最近一次有效记录</span></div>
      <div>{baselineMultipliers.length === 0
        ? <small>尚无独立历史记录；当前沿用兼容系数 {plan.baselineMultiplier.toFixed(2)}</small>
        : [...baselineMultipliers].reverse().slice(0, 8).map((item) => <span key={item.id}><time>{formatChartDate(item.date)}</time><b>{item.multiplier.toFixed(2)}</b></span>)}
      </div>
    </div>
    </div>
  </details>;
}

function Empty({ text, hint }: { text: string; hint: string }) {
  return <div className="empty"><span>○</span><strong>{text}</strong><small>{hint}</small></div>;
}

function FoodModal({ onClose, onSubmit, date, record }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>; date: string; record: FoodRecord | null }) {
  const [linked,setLinked]=useState(Boolean(record&&record.weight>0));
  const [weight,setWeight]=useState(String(record?.weight||""));
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(nutrientLabels.map(([key])=>[key,record?String(record[key]||0):""])));
  const anchor=useRef({weight:Number(record?.weight||0),values:{...values}});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  function changeWeight(next:string){setWeight(next);if(linked&&anchor.current.weight>0){setValues(Object.fromEntries(nutrientLabels.map(([key])=>[key,String(Number(anchor.current.values[key]||0)*Number(next)/anchor.current.weight)])));}}
  function toggle(){if(!linked){if(!(Number(weight)>0))return;anchor.current={weight:Number(weight),values:{...values}};}setLinked(!linked);}
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");try{await onSubmit(e);}catch(e){setError(e instanceof Error?e.message:"保存失败");setBusy(false);}}
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><p>{record ? "修正记录" : "手动录入"}</p><h2>{record ? "修改饮食" : "添加饮食"}</h2></div><button type="button" disabled={busy} onClick={onClose}>×</button></div>
    <div className="form-grid">
      <label className="wide">食物名称<input name="name" required autoFocus placeholder="例如：番茄炒蛋" defaultValue={record?.name || ""} /></label>
      <label>日期<input name="date" type="date" defaultValue={record?.date || date} required /></label>
      <label>时间<input name="time" type="time" defaultValue={record?.time || nowTime()} required /></label>
      <label>餐次<select name="meal" defaultValue={record?.meal || "早餐"}><option>早餐</option><option>午餐</option><option>晚餐</option><option>加餐</option><option>未注明</option></select></label>
      <label>重量（克）<input name="weight" type="number" min="0.01" step="any" required value={weight} onChange={e=>changeWeight(e.target.value)} /></label>
    </div>
    {record&&<div className="proportional-control"><button type="button" role="switch" aria-checked={linked} disabled={busy||(!linked&&!(Number(weight)>0))} onClick={toggle}>{linked?"重量与营养挂钩":"重量与营养脱钩"}</button><p>{linked?"营养随重量等比例变化；仅改重量时，食品库只更新默认份量。":"可独立修改营养；比例改变后更新食品库每100g营养。"}</p></div>}
    <h3>热量、宏量营养与糖</h3>
    <div className="nutrient-inputs">{nutrientLabels.slice(0, 8).map(([key, label, unit]) => <label key={key}>{label}（{unit}）<input name={key} type="number" min="0" step="any" readOnly={linked} value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})} /></label>)}</div>
    <details><summary>填写维生素与矿物质（可选）</summary><div className="nutrient-inputs">{nutrientLabels.slice(8).map(([key, label, unit]) => <label key={key}>{label}（{unit}）<input name={key} type="number" min="0" step="any" readOnly={linked} value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})} /></label>)}</div></details>
    <label className="wide note-label">备注<input name="note" placeholder="份量、克重说明、做法或数据来源（名称只写食品名）" defaultValue={record?.note || ""} /></label>
    {error&&<p role="alert">{error}</p>}<div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy}>{record ? "保存修改" : "保存饮食"}</button></div>
  </form></div>;
}

function ExerciseModal({ onClose, onSubmit, date }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; date: string }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal compact" onSubmit={onSubmit}>
    <div className="modal-head"><div><p>手动录入</p><h2>添加运动</h2></div><button type="button" onClick={onClose}>×</button></div>
    <div className="form-grid">
      <label className="wide">运动名称<input name="name" required autoFocus placeholder="例如：力量训练、步行" /></label>
      <label>日期<input name="date" type="date" defaultValue={date} required /></label>
      <label>时间<input name="time" type="time" defaultValue={nowTime()} required /></label>
      <label>消耗热量（千卡）<input name="calories" type="number" min="0" required /></label>
      <label>运动时长（分钟）<input name="duration" type="number" min="0" /></label>
      <label>步数<input name="steps" type="number" min="0" /></label>
      <label>强度<select name="intensity"><option>低强度</option><option>中等强度</option><option>高强度</option></select></label>
      <label>数据来源<select name="source"><option>手表</option><option>器械</option><option>描述估算</option><option>手动填写</option></select></label>
      <label className="wide">备注<input name="note" placeholder="可记录心率、距离等" /></label>
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary">保存运动</button></div>
  </form></div>;
}

function WeightModal({ onClose, onSubmit, date, record }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; date: string; record: WeightRecord | null }) {
  const [weightDate, setWeightDate] = useState(date);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal compact" onSubmit={onSubmit}>
    <div className="modal-head"><div><p>身体数据</p><h2>{record ? "修改体重记录" : "记录体重"}</h2></div><button type="button" onClick={onClose}>×</button></div>
    <p className="form-explain">{record ? "可以同时修正日期、体重和备注；改动日期后，原日期记录会转移到新日期并同步删除。" : "可以选择电子秤或其他来源中的往期日期。同一天只保留一条记录；目标日期已有记录时会覆盖。"}</p>
    <div className="form-grid">
      <div className="form-field"><span>记录日期</span><AppDatePicker name="date" value={weightDate} onChange={setWeightDate} max={today()} label="选择体重记录日期" /></div>
      <input name="originalId" type="hidden" value={record?.id || ""} readOnly />
      <label>体重（kg）<input name="weight" type="number" min="20" max="400" step="0.1" defaultValue={record?.weight ?? ""} required autoFocus /></label>
      <label className="wide">备注<input name="note" defaultValue={record?.note || ""} placeholder="例如：晨起空腹、训练后" /></label>
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary">{record ? "保存修改" : "保存体重"}</button></div>
  </form></div>;
}

function BaselineModal({ record, onClose, onSubmit }: { record: BaselineMultiplierRecord; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [recordDate, setRecordDate] = useState(record.date);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal compact" onSubmit={onSubmit}>
    <div className="modal-head"><div><p>身体数据</p><h2>修改基线系数记录</h2></div><button type="button" onClick={onClose}>×</button></div>
    <p className="form-explain">可以同时修正日期和系数；改动日期后，原日期记录会迁移到新日期并同步删除。</p>
    <div className="form-grid">
      <div className="form-field"><span>记录日期</span><AppDatePicker name="date" value={recordDate} onChange={setRecordDate} max={today()} label="选择基线系数记录日期" /></div>
      <input name="originalId" type="hidden" value={record.id} readOnly />
      <label>基线系数<input name="multiplier" type="number" min="0.7" max="2" step="0.01" defaultValue={record.multiplier} required autoFocus /></label>
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary">保存修改</button></div>
  </form></div>;
}

function DeleteWeightModal({ record, onClose, onConfirm }: { record: WeightRecord; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="modal compact confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-weight-title">
      <div className="modal-head"><div><p>删除确认</p><h2 id="delete-weight-title">删除这条体重记录？</h2></div><button type="button" onClick={onClose}>×</button></div>
      <div className="delete-weight-summary">
        <span>{new Date(`${record.date}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</span>
        <strong>{record.weight.toFixed(1)} kg</strong>
        <small>{record.note || "没有备注"}</small>
      </div>
      <p className="confirm-note">删除状态会参与云盘同步，其他电脑同步后也会删除这条记录。</p>
      <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="danger" disabled={deleting} onClick={async () => { setDeleting(true); await onConfirm(); }}>{deleting ? "删除中…" : "确认删除"}</button></div>
    </div>
  </div>;
}

function DeleteBaselineModal({ record, onClose, onConfirm }: { record: BaselineMultiplierRecord; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="modal compact confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-baseline-title">
      <div className="modal-head"><div><p>删除确认</p><h2 id="delete-baseline-title">删除这条基线系数记录？</h2></div><button type="button" onClick={onClose}>×</button></div>
      <div className="delete-weight-summary">
        <span>{new Date(`${record.date}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</span>
        <strong>× {record.multiplier.toFixed(2)}</strong>
      </div>
      <p className="form-explain">删除状态会参与云盘同步，其他设备同步后也会隐藏这条记录。</p>
      <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="danger" disabled={deleting} onClick={async () => { setDeleting(true); await onConfirm(); }}>{deleting ? "删除中…" : "确认删除"}</button></div>
    </div>
  </div>;
}

function ProfileModal({ onClose, onSubmit, profile }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; profile: Profile }) {
  const [birthdate, setBirthdate] = useState(profile.birthdate || "");
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal compact" onSubmit={onSubmit}>
    <div className="modal-head"><div><p>估算基础</p><h2>个人资料</h2></div><button type="button" onClick={onClose}>×</button></div>
    <p className="form-explain">这些信息只保存在本机，用于估算基础代谢和运动热量。</p>
    <div className="form-grid">
      <div className="form-field"><span>出生日期</span><AppDatePicker name="birthdate" value={birthdate} onChange={setBirthdate} max={today()} label="选择出生日期" placeholder="选择出生日期" /></div>
      <label>生理性别<select name="sex" defaultValue={profile.sex} required><option value="unspecified">暂不提供</option><option value="male">男</option><option value="female">女</option></select></label>
      <label className="wide">身高（cm）<input name="height" type="number" min="100" max="250" step="0.1" defaultValue={profile.height || ""} required /></label>
    </div>
    <div className="formula-note">基础代谢采用 Mifflin–St Jeor 公式估算。未提供生理性别时使用男女公式常数的中间值。</div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={!birthdate}>保存资料</button></div>
  </form></div>;
}

function LlmConfigModal({ onClose, onSave, config }: { onClose: () => void; onSave: (value: { proxyMode?: string; proxyUrl?: string; headerPreset?: string; customHeaders?: string; baseUrl: string; apiKey: string; model: string; systemPrompt: string; enableSearch: boolean }) => Promise<void>; config: LlmConfig }) {
  const [proxyMode,setProxyMode]=useState(config.proxyMode||"auto");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      await onSave({
        proxyMode,proxyUrl:String(form.get("proxyUrl")??config.proxyUrl??""),
        headerPreset:String(form.get("headerPreset")||"auto"),customHeaders:String(form.get("customHeaders")||"{}"),
        baseUrl: String(form.get("baseUrl")),
        apiKey: String(form.get("apiKey")),
        model: String(form.get("model")),
        systemPrompt: String(form.get("systemPrompt")),
        enableSearch: form.get("enableSearch") === "on",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      setSaving(false);
    }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal llm-modal" onSubmit={submit}>
    <div className="modal-head"><div><p>智能录入</p><h2>LLM 与外部 API</h2></div><button type="button" onClick={onClose}>×</button></div>
    <section className="config-section">
      <div className="config-title"><strong>模型连接</strong><span>{config.configured ? "已配置" : "待配置"}</span></div>
      <div className="form-grid">
        <label className="wide">OpenAI 兼容接口地址<input name="baseUrl" required defaultValue={config.baseUrl} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" /></label>
        <label>模型名称<input name="model" required defaultValue={config.model} placeholder="qwen-plus" /></label>
        <label>API Key<input name="apiKey" type="password" placeholder={config.configured ? "已保存；留空表示不修改" : "sk-…"} required={!config.configured} /></label>
        <label>连接方式<select name="proxyMode" value={proxyMode} onChange={e=>setProxyMode(e.target.value)}><option value="auto">自动 · 系统代理不可用时直连</option><option value="direct">直连 · 不使用应用层代理</option><option value="system">仅使用系统代理设置</option><option value="custom">自定义代理</option></select></label>
        <label>代理地址<input name="proxyUrl" disabled={proxyMode!=="custom"} required={proxyMode==="custom"} defaultValue={config.proxyUrl||""} placeholder="http://127.0.0.1:7890"/></label>
        <p className="wide">自动模式跟随系统代理设置；失效的代理连接会回退直连。强制代理模式不回退。TUN / VPN 的系统路由仍由对应软件控制。</p>
        <label className="wide">请求头预设<select name="headerPreset" defaultValue={config.headerPreset||"auto"}><option value="auto">自动识别 · OpenCode 自动补齐会话头</option><option value="standard">标准 OpenAI 兼容</option><option value="opencode">OpenCode · 稳定会话 ID</option></select></label>
        <label className="wide">自定义请求头（JSON，可留空）<textarea name="customHeaders" rows={4} defaultValue={config.customHeaders||"{}"} placeholder={'{"X-Custom-Header":"value"}'}/></label>
        <p className="wide">自定义值优先于预设，仅保存在本机。OpenCode 会话 ID 自动生成，同一对话保持稳定；清空对话后更换。客户端标识使用本软件名称。OpenCode Go 官方主要面向编程代理，是否接受营养助手用途由服务方决定。</p>
        <label className="search-toggle wide"><input name="enableSearch" type="checkbox" defaultChecked={config.enableSearch} /><span>允许模型联网搜索（Qwen Chat Completions 使用 enable_search）</span></label>
      </div>
    </section>
    <section className="config-section">
      <div className="config-title"><strong>系统级提示词</strong><span>随每次对话发送</span></div>
      <label className="wide"><textarea className="system-prompt" name="systemPrompt" defaultValue={config.systemPrompt} required rows={13} /></label>
    </section>
    <section className="config-section api-access">
      <div className="config-title"><strong>外部写入 API</strong><span>供未来 Qwen 或自动化脚本调用</span></div>
      <label>POST 地址<div className="copy-field"><input readOnly value={config.externalEndpoint} /><button type="button" onClick={() => navigator.clipboard.writeText(config.externalEndpoint)}>复制</button></div></label>
      <label>Bearer Token<div className="copy-field"><input readOnly value={config.externalToken} /><button type="button" onClick={() => navigator.clipboard.writeText(config.externalToken)}>复制</button></div></label>
      <div className="api-format"><code>{`{"actions":[{"store":"foods","value":{...}}]}`}</code><span>请求头：Authorization: Bearer &lt;Token&gt;</span></div>
    </section>
    {error && <div className="config-error">{error}</div>}
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={saving}>{saving ? "保存中…" : "保存配置"}</button></div>
  </form></div>;
}

function AppDatePicker({ value, onChange, name, min, max, label = "选择日期", placeholder = "请选择日期", allowClear = false }: {
  value: string;
  onChange: (date: string) => void;
  name?: string;
  min?: string;
  max?: string;
  label?: string;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"days" | "months" | "years">("days");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [calendarPosition, setCalendarPosition] = useState({ top: 0, left: 0, maxHeight: 390, ready: false });
  const initialDate = value || max || today();
  const [viewMonth, setViewMonth] = useState(initialDate.slice(0, 7));
  const selected = value ? new Date(`${value}T12:00:00`) : null;
  const [viewYear, viewMonthNumber] = viewMonth.split("-").map(Number);
  const yearPageStart = Math.floor(viewYear / 12) * 12;
  const firstDay = new Date(viewYear, viewMonthNumber - 1, 1);
  const leading = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonthNumber, 0).getDate();
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > daysInMonth) return null;
    return `${viewYear}-${String(viewMonthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  const isAllowed = (dateValue: string) => (!min || dateValue >= min) && (!max || dateValue <= max);
  const moveView = (offset: number) => {
    const monthOffset = panel === "days" ? offset : panel === "months" ? offset * 12 : offset * 12 * 12;
    const next = new Date(viewYear, viewMonthNumber - 1 + monthOffset, 1);
    setViewMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  const choose = (next: string) => {
    if (!isAllowed(next)) return;
    onChange(next);
    setViewMonth(next.slice(0, 7));
    setPanel("days");
    setOpen(false);
  };
  const chooseMonth = (month: number) => {
    setViewMonth(`${viewYear}-${String(month).padStart(2, "0")}`);
    setPanel("days");
  };
  const chooseYear = (year: number) => {
    setViewMonth(`${year}-${String(viewMonthNumber).padStart(2, "0")}`);
    setPanel("months");
  };
  const openPicker = () => {
    setViewMonth((value || max || today()).slice(0, 7));
    setPanel("days");
    setCalendarPosition((current) => ({ ...current, ready: false }));
    setOpen((current) => !current);
  };
  const positionCalendar = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const margin = 12;
    const gap = 8;
    const width = Math.min(318, window.innerWidth - margin * 2);
    const measuredHeight = calendarRef.current?.offsetHeight || 390;
    const viewportHeight = window.innerHeight - margin * 2;
    const height = Math.min(measuredHeight, viewportHeight);
    const rect = trigger.getBoundingClientRect();
    let left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    let top = margin;
    let maxHeight = viewportHeight;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const spaceLeft = rect.left - margin - gap;
    const spaceRight = window.innerWidth - rect.right - margin - gap;
    if (spaceBelow >= height) {
      top = rect.bottom + gap;
    } else if (spaceAbove >= height) {
      top = rect.top - height - gap;
    } else if (spaceLeft >= width) {
      left = rect.left - width - gap;
      top = Math.max(margin, Math.min(rect.top - (height - rect.height) / 2, window.innerHeight - height - margin));
    } else if (spaceRight >= width) {
      left = rect.right + gap;
      top = Math.max(margin, Math.min(rect.top - (height - rect.height) / 2, window.innerHeight - height - margin));
    } else if (spaceBelow >= spaceAbove) {
      top = rect.bottom + gap;
      maxHeight = Math.max(180, spaceBelow);
    } else {
      maxHeight = Math.max(180, spaceAbove);
      top = Math.max(margin, rect.top - maxHeight - gap);
    }
    setCalendarPosition({ top, left, maxHeight, ready: true });
  };
  useLayoutEffect(() => {
    if (!open) return;
    positionCalendar();
    const frame = window.requestAnimationFrame(positionCalendar);
    window.addEventListener("resize", positionCalendar);
    window.addEventListener("scroll", positionCalendar, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionCalendar);
      window.removeEventListener("scroll", positionCalendar, true);
    };
  }, [open, panel, viewMonth]);
  const calendar = open && typeof document !== "undefined" && createPortal(
    <div
      ref={calendarRef}
      className="app-calendar app-calendar-portal"
      role="dialog"
      aria-label={`${label}日历`}
      style={{ top: calendarPosition.top, left: calendarPosition.left, maxHeight: calendarPosition.maxHeight, visibility: calendarPosition.ready ? "visible" : "hidden" }}
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
    >
      <div className="calendar-head">
        <button type="button" aria-label={panel === "days" ? "上一月" : panel === "months" ? "上一年" : "上一组年份"} onClick={() => moveView(-1)}>‹</button>
        {panel === "days"
          ? <button type="button" className="calendar-period" onClick={() => setPanel("months")}>{viewYear} 年 {viewMonthNumber} 月</button>
          : panel === "months"
            ? <button type="button" className="calendar-period" onClick={() => setPanel("years")}>{viewYear} 年</button>
            : <strong className="calendar-period-label">{yearPageStart}–{yearPageStart + 11} 年</strong>}
        <button type="button" aria-label={panel === "days" ? "下一月" : panel === "months" ? "下一年" : "下一组年份"} onClick={() => moveView(1)}>›</button>
      </div>
      {panel === "days" && <>
        <div className="calendar-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((dateValue, index) => dateValue
            ? <button
                type="button"
                key={dateValue}
                disabled={!isAllowed(dateValue)}
                className={`${dateValue === value ? "selected" : ""} ${dateValue === today() ? "today" : ""}`}
                aria-pressed={dateValue === value}
                onClick={() => choose(dateValue)}
              >{Number(dateValue.slice(-2))}</button>
            : <span key={`empty-${index}`} />)}
        </div>
      </>}
      {panel === "months" && <div className="calendar-choice-grid month-grid">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
          const monthKey = `${viewYear}-${String(month).padStart(2, "0")}`;
          const monthStart = `${monthKey}-01`;
          const monthEnd = `${monthKey}-${String(new Date(viewYear, month, 0).getDate()).padStart(2, "0")}`;
          const disabled = Boolean((min && monthEnd < min) || (max && monthStart > max));
          return <button type="button" key={month} disabled={disabled} className={value.slice(0, 7) === monthKey ? "selected" : ""} onClick={() => chooseMonth(month)}>{month} 月</button>;
        })}
      </div>}
      {panel === "years" && <div className="calendar-choice-grid year-grid">
        {Array.from({ length: 12 }, (_, index) => yearPageStart + index).map((year) => {
          const disabled = Boolean((min && year < Number(min.slice(0, 4))) || (max && year > Number(max.slice(0, 4))));
          return <button type="button" key={year} disabled={disabled} className={value.startsWith(`${year}-`) ? "selected" : ""} onClick={() => chooseYear(year)}>{year}</button>;
        })}
      </div>}
      <div className="calendar-foot">
        <button type="button" disabled={!isAllowed(today())} onClick={() => choose(today())}>回到今天</button>
        {allowClear && <button type="button" onClick={() => { onChange(""); setOpen(false); }}>不限日期</button>}
        <button type="button" onClick={() => setOpen(false)}>关闭</button>
      </div>
    </div>,
    document.body,
  );
  return <>
  <div className="app-date-picker">
    {name && <input type="hidden" name={name} value={value} readOnly />}
    <button
      ref={triggerRef}
      type="button"
      className="app-date-trigger"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={openPicker}
    >
      <span>{selected ? selected.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : placeholder}</span>
      <i aria-hidden="true">▦</i>
    </button>
  </div>
  {calendar}
  </>;
}

function usePaginatedItems<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => {
    setPage((value) => Math.min(value, totalPages));
  }, [totalPages]);
  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return { page: currentPage, setPage, pageSize, setPageSize, totalPages, pageItems };
}

function PaginationControls({ totalItems, page, pageSize, totalPages, onPageChange, onPageSizeChange }: {
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  if (totalItems === 0) return null;
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((value) => value === 1 || value === totalPages || Math.abs(value - page) <= 2);
  const pageTokens: Array<number | string> = [];
  pageNumbers.forEach((value, index) => {
    if (index > 0 && value - pageNumbers[index - 1] > 1) pageTokens.push(`ellipsis-${value}`);
    pageTokens.push(value);
  });
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);
  return <div className="pagination-bar" aria-label="记录分页">
    <div className="pagination-summary">共 <strong>{totalItems}</strong> 条 · 当前 {start}–{end} 条</div>
    <div className="pagination-pages">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
      {pageTokens.map((token) => typeof token === "number"
        ? <button type="button" key={token} className={page === token ? "active" : ""} aria-current={page === token ? "page" : undefined} onClick={() => onPageChange(token)}>{token}</button>
        : <span key={token}>…</span>)}
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</button>
    </div>
    <label className="pagination-jump"><span>跳至</span><select value={page} onChange={(event) => onPageChange(Number(event.target.value))}>{Array.from({ length: totalPages }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 页</option>)}</select></label>
    <label className="pagination-size"><span>每页</span><select value={pageSize} onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}>{[10, 20, 50].map((size) => <option key={size} value={size}>{size} 条</option>)}</select></label>
  </div>;
}

function TrendFilterBar({ range, bucket, skipEmpty, onRangeChange, onBucketChange, onSkipEmptyChange, compact = false, note = "" }: {
  range: TrendRange;
  bucket: TrendBucket;
  skipEmpty: boolean;
  onRangeChange: (value: TrendRange) => void;
  onBucketChange: (value: TrendBucket) => void;
  onSkipEmptyChange: (value: boolean) => void;
  compact?: boolean;
  note?: string;
}) {
  const rangeOptions: Array<[TrendRange, string]> = [[7, "7 天"], [14, "14 天"], [30, "月"], [90, "季度"], [365, "年度"], [0, "所有数据"]];
  const bucketOptions: Array<[TrendBucket, string]> = [["day", "每天"], ["week", "每周平均"], ["month", "每月平均"]];
  return <div className={`${compact ? "weight-trend-controls compact" : "trend-controls"} trend-filter-bar`}>
    <div className="trend-control-group">
      <span>时间范围</span>
      <div>{rangeOptions.map(([value, label]) => <button type="button" key={value} className={range === value ? "active" : ""} onClick={() => onRangeChange(value)}>{label}</button>)}</div>
    </div>
    <div className="trend-control-group">
      <span>数据点</span>
      <div>{bucketOptions.map(([value, label]) => <button type="button" key={value} className={bucket === value ? "active" : ""} onClick={() => onBucketChange(value)}>{label}</button>)}</div>
    </div>
    <div className="trend-filter-tail">
      <label className="skip-empty-toggle"><input type="checkbox" checked={skipEmpty} onChange={(event) => onSkipEmptyChange(event.target.checked)} /><i /><span>跳过无记录日期</span></label>
      {note && <small>{note}</small>}
    </div>
  </div>;
}

function RecordDateFilter({ start, end, onStartChange, onEndChange, onReset }: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onReset: () => void;
}) {
  return <div className="record-date-filter">
    <span>记录日期</span>
    <label><small>从</small><AppDatePicker value={start} onChange={onStartChange} max={end || today()} label="选择开始日期" placeholder="最早记录" allowClear /></label>
    <label><small>至</small><AppDatePicker value={end} onChange={onEndChange} min={start || undefined} max={today()} label="选择结束日期" placeholder="最新记录" allowClear /></label>
    {(start || end) && <button type="button" onClick={onReset}>清除日期筛选</button>}
  </div>;
}

function Body({ profile, weights, baselineMultipliers, bmr, onEditProfile, onAddWeight, onEditWeight, onDeleteWeight, onEditBaseline, onDeleteBaseline }: {
  profile: Profile;
  weights: WeightRecord[];
  baselineMultipliers: BaselineMultiplierRecord[];
  bmr: number;
  onEditProfile: () => void;
  onAddWeight: () => void;
  onEditWeight: (record: WeightRecord) => void;
  onDeleteWeight: (record: WeightRecord) => void;
  onEditBaseline: (record: BaselineMultiplierRecord) => void;
  onDeleteBaseline: (record: BaselineMultiplierRecord) => void;
}) {
  const [weightRange, setWeightRange] = useState<TrendRange>(30);
  const [weightBucket, setWeightBucket] = useState<TrendBucket>("day");
  const [weightSkipEmpty, setWeightSkipEmpty] = useState(false);
  const [showWeightTrend, setShowWeightTrend] = useState(true);
  const [showBaselineTrend, setShowBaselineTrend] = useState(false);
  const [weightLogStart, setWeightLogStart] = useState("");
  const [weightLogEnd, setWeightLogEnd] = useState("");
  const [baselineLogStart, setBaselineLogStart] = useState("");
  const [baselineLogEnd, setBaselineLogEnd] = useState("");
  const filteredWeightLogs = useMemo(() => [...weights].reverse().filter((item) =>
    (!weightLogStart || item.date >= weightLogStart) && (!weightLogEnd || item.date <= weightLogEnd)
  ), [weights, weightLogStart, weightLogEnd]);
  const filteredBaselineLogs = useMemo(() => [...baselineMultipliers].reverse().filter((item) =>
    (!baselineLogStart || item.date >= baselineLogStart) && (!baselineLogEnd || item.date <= baselineLogEnd)
  ), [baselineMultipliers, baselineLogStart, baselineLogEnd]);
  const weightPagination = usePaginatedItems(filteredWeightLogs);
  const baselinePagination = usePaginatedItems(filteredBaselineLogs);
  const latest = weights.at(-1);
  const first = weights[0];
  const change = latest && first ? latest.weight - first.weight : 0;
  const age = getAge(profile.birthdate);
  return <section className="body-page">
    <div className="body-head">
      <div><p>身体趋势</p><h1>体重与代谢</h1><span>持续记录后，运动消耗估算会越来越贴近你。</span></div>
      <div className="body-actions"><button onClick={onEditProfile}>编辑个人资料</button><button className="primary-action" onClick={onAddWeight}>＋ 记录体重</button></div>
    </div>

    <div className="body-summary">
      <article><span>最近体重</span><b>{latest ? latest.weight.toFixed(1) : "—"} <small>{latest ? "kg" : ""}</small></b><em>{latest ? new Date(`${latest.date}T12:00:00`).toLocaleDateString("zh-CN") : "尚未记录"}</em></article>
      <article><span>累计变化</span><b className={change < 0 ? "down" : ""}>{weights.length > 1 ? `${change > 0 ? "+" : ""}${change.toFixed(1)}` : "—"} <small>{weights.length > 1 ? "kg" : ""}</small></b><em>{weights.length > 1 ? `从 ${first.weight.toFixed(1)} kg 开始` : "至少记录两次后显示"}</em></article>
      <article><span>基础代谢估算</span><b>{bmr || "—"} <small>{bmr ? "kcal/天" : ""}</small></b><em>{bmr ? "不含运动与日常活动" : "完善资料和体重后计算"}</em></article>
    </div>

    <div className="body-layout">
      <article className="chart-panel">
        <div className="chart-heading"><div><p>身体与代谢趋势</p><h2>体重与基线系数</h2></div><span>左轴 kg · 右轴系数</span></div>
        <div className="body-series-switches">
          <strong>显示数据</strong>
          <button type="button" className={`weight ${showWeightTrend ? "active" : ""}`} aria-pressed={showWeightTrend} onClick={() => setShowWeightTrend((value) => !value)}><i /><span>体重<small>蓝色实线 · 圆点</small></span></button>
          <button type="button" className={`baseline ${showBaselineTrend ? "active" : ""}`} aria-pressed={showBaselineTrend} onClick={() => setShowBaselineTrend((value) => !value)}><i /><span>基线系数<small>橙色虚线 · 方点</small></span></button>
        </div>
        <TrendFilterBar
          compact
          range={weightRange}
          bucket={weightBucket}
          skipEmpty={weightSkipEmpty}
          onRangeChange={setWeightRange}
          onBucketChange={setWeightBucket}
          onSkipEmptyChange={setWeightSkipEmpty}
          note="只有体重和系数都没有记录的日期才会被跳过"
        />
        <BodyDualTrendChart
          weights={weights}
          baselineMultipliers={baselineMultipliers}
          range={weightRange}
          bucket={weightBucket}
          skipEmpty={weightSkipEmpty}
          showWeight={showWeightTrend}
          showBaseline={showBaselineTrend}
        />
      </article>
      <aside className="profile-panel">
        <div><p>个人资料</p><h2>估算依据</h2></div>
        <dl>
          <div><dt>出生日期</dt><dd>{profile.birthdate || "未填写"}</dd></div>
          <div><dt>当前年龄</dt><dd>{age !== null ? `${age} 岁` : "—"}</dd></div>
          <div><dt>生理性别</dt><dd>{profile.sex === "male" ? "男" : profile.sex === "female" ? "女" : "暂不提供"}</dd></div>
          <div><dt>身高</dt><dd>{profile.height ? `${profile.height} cm` : "未填写"}</dd></div>
        </dl>
        <button onClick={onEditProfile}>{profile.birthdate ? "修改资料" : "完善资料"}</button>
        <p className="data-note">运动描述的热量估算会优先采用你的最近体重和身高。手表或器械实测数据仍然优先。</p>
      </aside>
    </div>

    {weights.length > 0 && <div className="weight-log"><div className="section-title paginated-section-title"><div><p>记录明细</p><h2>全部体重记录</h2></div><RecordDateFilter
      start={weightLogStart}
      end={weightLogEnd}
      onStartChange={(value) => { setWeightLogStart(value); weightPagination.setPage(1); }}
      onEndChange={(value) => { setWeightLogEnd(value); weightPagination.setPage(1); }}
      onReset={() => { setWeightLogStart(""); setWeightLogEnd(""); weightPagination.setPage(1); }}
    /></div>{filteredWeightLogs.length === 0 ? <Empty text="这个日期范围内没有体重记录" hint="清除日期筛选或选择其他范围" /> : weightPagination.pageItems.map((item) => <div className="weight-row" key={item.id}>
      <time>{new Date(`${item.date}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</time>
      <span>{item.note || "—"}</span>
      <strong>{item.weight.toFixed(1)} kg</strong>
      <div className="weight-row-actions"><button type="button" onClick={() => onEditWeight(item)}>修改</button><button type="button" className="danger" onClick={() => onDeleteWeight(item)}>删除</button></div>
    </div>)}<PaginationControls totalItems={filteredWeightLogs.length} page={weightPagination.page} pageSize={weightPagination.pageSize} totalPages={weightPagination.totalPages} onPageChange={weightPagination.setPage} onPageSizeChange={weightPagination.setPageSize} /></div>}
    {baselineMultipliers.length > 0 && <div className="weight-log baseline-record-log"><div className="section-title paginated-section-title"><div><p>记录明细</p><h2>全部基线系数记录</h2></div><RecordDateFilter
      start={baselineLogStart}
      end={baselineLogEnd}
      onStartChange={(value) => { setBaselineLogStart(value); baselinePagination.setPage(1); }}
      onEndChange={(value) => { setBaselineLogEnd(value); baselinePagination.setPage(1); }}
      onReset={() => { setBaselineLogStart(""); setBaselineLogEnd(""); baselinePagination.setPage(1); }}
    /></div>{filteredBaselineLogs.length === 0 ? <Empty text="这个日期范围内没有基线系数记录" hint="清除日期筛选或选择其他范围" /> : baselinePagination.pageItems.map((item) => <div className="weight-row" key={item.id}>
      <time>{new Date(`${item.date}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</time>
      <span>{item.recordedAt ? `最后修改：${new Date(item.recordedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "—"}</span>
      <strong>× {item.multiplier.toFixed(2)}</strong>
      <div className="weight-row-actions"><button type="button" onClick={() => onEditBaseline(item)}>修改</button><button type="button" className="danger" onClick={() => onDeleteBaseline(item)}>删除</button></div>
    </div>)}<PaginationControls totalItems={filteredBaselineLogs.length} page={baselinePagination.page} pageSize={baselinePagination.pageSize} totalPages={baselinePagination.totalPages} onPageChange={baselinePagination.setPage} onPageSizeChange={baselinePagination.setPageSize} /></div>}
  </section>;
}

function BodyDualTrendChart({ weights, baselineMultipliers, range: selectedRange, bucket, skipEmpty, showWeight, showBaseline }: {
  weights: WeightRecord[];
  baselineMultipliers: BaselineMultiplierRecord[];
  range: TrendRange;
  bucket: TrendBucket;
  skipEmpty: boolean;
  showWeight: boolean;
  showBaseline: boolean;
}) {
  const [tooltip, setTooltip] = useState<ChartTooltipState>(null);
  const weightByDate = new Map(weights.map((item) => [item.date, item]));
  const baselineByDate = new Map(baselineMultipliers.map((item) => [item.date, item]));
  const { recordedDates, axisDates: dates } = selectBodyTrendDatesForUi({
    weightDates: [...weightByDate.keys()],
    baselineDates: [...baselineByDate.keys()],
    range: selectedRange,
    showWeight,
    showBaseline,
    skipEmpty,
  });
  const { latestScroll, viewportWidth } = useLatestChartScroll([selectedRange, bucket, skipEmpty, showWeight, showBaseline, recordedDates.join(",")].join("|"));
  if (!showWeight && !showBaseline) return <Empty text="两条趋势都已隐藏" hint="在上方至少开启体重或基线系数中的一项" />;
  if (recordedDates.length === 0) return <Empty text="当前显示项没有身体趋势记录" hint="记录当前开启的体重或基线系数后，这里会显示趋势" />;
  const daily = dates.map((date) => {
    const weight = weightByDate.get(date);
    const baseline = baselineByDate.get(date);
    return {
      date,
      label: formatTrendPointLabel(date, "day"),
      weight: Number(weight?.weight || 0),
      multiplier: Number(baseline?.multiplier || 0),
      weightRecorded: Boolean(weight),
      baselineRecorded: Boolean(baseline),
    };
  });
  const data = bucket === "day" ? daily : [...daily.reduce((groups, item) => {
    const key = trendBucketKey(item.date, bucket);
    groups.set(key, [...(groups.get(key) || []), item]);
    return groups;
  }, new Map<string, typeof daily>())].map(([key, items]) => {
    const weightItems = items.filter((item) => item.weightRecorded);
    const baselineItems = items.filter((item) => item.baselineRecorded);
    return {
      date: key,
      label: formatTrendPointLabel(key, bucket),
      weight: weightItems.length ? weightItems.reduce((sum, item) => sum + item.weight, 0) / weightItems.length : 0,
      multiplier: baselineItems.length ? baselineItems.reduce((sum, item) => sum + item.multiplier, 0) / baselineItems.length : 0,
      weightRecorded: weightItems.length > 0,
      baselineRecorded: baselineItems.length > 0,
    };
  });
  const weightActual = data.map((item, index) => ({ item, index })).filter(({ item }) => item.weightRecorded);
  const baselineActual = data.map((item, index) => ({ item, index })).filter(({ item }) => item.baselineRecorded);
  const width = Math.max(viewportWidth, (data.length - 1) * Math.max(1, (viewportWidth - 120) / 59) + 120), height = 310, left = 60, right = 60, top = 34, bottom = 48;
  const weightValues = weightActual.map(({ item }) => item.weight);
  const baselineValues = baselineActual.map(({ item }) => item.multiplier);
  const weightMin = weightValues.length ? Math.floor((Math.min(...weightValues) - 1) * 10) / 10 : 0;
  const weightMax = weightValues.length ? Math.ceil((Math.max(...weightValues) + 1) * 10) / 10 : 1;
  const weightSpan = Math.max(2, weightMax - weightMin);
  const baselineMinRaw = baselineValues.length ? Math.floor((Math.min(...baselineValues) - .08) * 20) / 20 : .7;
  const baselineMaxRaw = baselineValues.length ? Math.ceil((Math.max(...baselineValues) + .08) * 20) / 20 : 2;
  const baselineMin = Math.max(.5, baselineMinRaw);
  const baselineMax = Math.min(2.2, Math.max(baselineMin + .2, baselineMaxRaw));
  const baselineSpan = Math.max(.2, baselineMax - baselineMin);
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (index: number) => left + (data.length === 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const weightY = (value: number) => top + (weightMax - value) / weightSpan * plotHeight;
  const baselineY = (value: number) => top + (baselineMax - value) / baselineSpan * plotHeight;
  const weightPoints = weightActual.map(({ item, index }) => `${x(index)},${weightY(item.weight)}`).join(" ");
  const baselinePoints = baselineActual.map(({ item, index }) => `${x(index)},${baselineY(item.multiplier)}`).join(" ");
  const weightTicks = [weightMax, Number(((weightMax + weightMin) / 2).toFixed(1)), weightMin];
  const baselineTicks = [baselineMax, Number(((baselineMax + baselineMin) / 2).toFixed(2)), baselineMin];
  const labelEvery = Math.max(1, Math.ceil(60 / ((width - left - right) / Math.max(1, data.length - 1))));
  return <div className="weight-chart body-dual-chart">
    <div className="chart-scroll" ref={latestScroll}><svg style={{ minWidth: `${width}px` }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`体重与居家久坐基线系数双轴趋势图，共 ${data.length} 个日期数据点`}>
      <desc>横轴为日期，左轴为体重千克，右轴为居家久坐基线系数。</desc>
      {[top, top + plotHeight / 2, top + plotHeight].map((gridY) => <line key={gridY} x1={left} x2={width - right} y1={gridY} y2={gridY} className="chart-grid" />)}
      {showWeight && weightTicks.map((tick) => <text key={`weight-${tick}`} x={left - 10} y={weightY(tick) + 4} textAnchor="end" className="body-weight-axis">{tick.toFixed(1)}</text>)}
      {showBaseline && baselineTicks.map((tick) => <text key={`baseline-${tick}`} x={width - right + 10} y={baselineY(tick) + 4} textAnchor="start" className="body-baseline-axis">{tick.toFixed(2)}</text>)}
      {showWeight && <text x={left} y={18} className="body-weight-axis axis-unit">体重 kg</text>}
      {showBaseline && <text x={width - right} y={18} textAnchor="end" className="body-baseline-axis axis-unit">基线系数</text>}
      {showWeight && weightActual.length > 1 && <polyline points={weightPoints} className="body-weight-line" />}
      {showBaseline && baselineActual.length > 1 && <polyline points={baselinePoints} className="body-baseline-line" />}
      {showWeight && weightActual.map(({ item, index }) => <circle key={`weight-${item.date}`} cx={x(index)} cy={weightY(item.weight)} r="4.5" className="body-weight-dot" onMouseEnter={() => setTooltip({ x: x(index), y: weightY(item.weight), text: `${item.label}：体重 ${item.weight.toFixed(2)} kg` })} onMouseLeave={() => setTooltip(null)} />)}
      {showBaseline && baselineActual.map(({ item, index }) => <rect key={`baseline-${item.date}`} x={x(index) - 4.3} y={baselineY(item.multiplier) - 4.3} width="8.6" height="8.6" rx="1.5" className="body-baseline-dot" onMouseEnter={() => setTooltip({ x: x(index), y: baselineY(item.multiplier), text: `${item.label}：基线系数 ${item.multiplier.toFixed(2)}` })} onMouseLeave={() => setTooltip(null)} />)}
      {data.map((item, index) => (index % labelEvery === 0 || index === data.length - 1) && <text key={item.date} x={x(index)} y={height - 15} textAnchor="middle">{item.label}</text>)}
      <SvgChartTooltip tooltip={tooltip} width={width} height={height} />
    </svg></div>
    <div className="trend-latest body-dual-latest">
      <span>{showWeight && weightActual.length ? `最新体重 ${weightActual.at(-1)!.item.weight.toFixed(1)} kg` : "体重已隐藏或暂无记录"}</span>
      <strong>{showBaseline && baselineActual.length ? `最新系数 ${baselineActual.at(-1)!.item.multiplier.toFixed(2)}` : "系数已隐藏或暂无记录"}</strong>
    </div>
  </div>;
}

function ActionHelp({ hint, children }: { hint: string; children: ReactNode }) {
  return <span className="action-help">
    {children}
    <span className="action-tooltip" role="tooltip">{hint}</span>
  </span>;
}

function History({ exerciseLibrary,walkingProfiles,foodLibrary, foods, exercises, profile, weights, baselineMultipliers, targetScenarios, targetScenarioDefaults, energyTargetDays, energyTargetDefaults, llmConfig, onOpenConfig, onDataChanged }: {
  exerciseLibrary: ActivityEntry[]; walkingProfiles: WalkingProfile[];
  foodLibrary: LibraryFood[];
  foods: FoodRecord[];
  exercises: ExerciseRecord[];
  profile: Profile;
  weights: WeightRecord[];
  baselineMultipliers: BaselineMultiplierRecord[];
  targetScenarios: TargetScenarioDayRecord[];
  targetScenarioDefaults: TargetScenarioDefaultRecord[];
  energyTargetDays: EnergyTargetDayRecord[];
  energyTargetDefaults: EnergyTargetDefaultRecord[];
  llmConfig: LlmConfig;
  onOpenConfig: () => void;
  onDataChanged: () => Promise<void>;
}) {
  const allRecordDates = [...new Set([...foods.map((x) => x.date), ...exercises.map((x) => x.date)])].sort().reverse();
  const [analysisRange, setAnalysisRange] = useState(30);
  const [analysisQuestion, setAnalysisQuestion] = useState("");
  const [analysisMessages, setAnalysisMessages] = useState<AnalysisMessage[]>([]);
  const [analysisSending, setAnalysisSending] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [localBackupBusy, setLocalBackupBusy] = useState(false);
  const [localBackupMessage, setLocalBackupMessage] = useState("");
  const [syncFolderDraft, setSyncFolderDraft] = useState("");
  const [trendRange, setTrendRange] = useState<TrendRange>(14);
  const [trendBucket, setTrendBucket] = useState<TrendBucket>("day");
  const [trendSkipEmpty, setTrendSkipEmpty] = useState(false);
  const [recordYear, setRecordYear] = useState("all");
  const [recordMonth, setRecordMonth] = useState("all");
  const recordYears = [...new Set(allRecordDates.map((date) => date.slice(0, 4)))];
  const filteredRecordDates = allRecordDates.filter((date) =>
    (recordYear === "all" || date.startsWith(`${recordYear}-`))
    && (recordMonth === "all" || date.slice(5, 7) === recordMonth)
  );
  const historyPagination = usePaginatedItems(filteredRecordDates);

  useEffect(() => {
    Promise.all([
      apiRequest<AnalysisMessage[]>("/api/analysis/history"),
      apiRequest<SyncStatus>("/api/sync/status"),
    ]).then(([messages, sync]) => {
      setAnalysisMessages(messages);
      setSyncStatus(sync);
      setSyncFolderDraft(sync.folder || sync.suggestedFolder || "");
    }).catch(() => undefined);
  }, []);

  async function syncAction(path: string, body: object = {}) {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncMessage("");
    try {
      const next = await apiRequest<SyncStatus>(path, body);
      setSyncStatus(next);
      setSyncFolderDraft(next.folder || next.suggestedFolder || "");
      if (next.enabled) await onDataChanged();
      setSyncMessage(
        path.endsWith("full-export")
          ? "已将包含删除状态的全部记录导出到云盘并校验"
          : path.endsWith("full-import")
            ? "已读取云端完整快照和全部剩余增量，并按时间戳合并"
            : path.endsWith("backup")
              ? "已创建并校验完整备份"
              : "同步检查已完成",
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "同步操作失败");
    } finally {
      setSyncBusy(false);
    }
  }

  async function localBackupAction(action: "export" | "import") {
    if (localBackupBusy) return;
    setLocalBackupBusy(true);
    setLocalBackupMessage("");
    try {
      const result = await apiRequest<{
        canceled?: boolean;
        file?: string;
        records?: number;
        imported?: number;
        skipped?: number;
      }>(`/api/backup/${action === "export" ? "export-local" : "import-local"}`, {});
      if (result.canceled) return;
      if (action === "export") {
        setLocalBackupMessage(`已生成并保存最新完整备份，共 ${result.records || 0} 条记录`);
      } else {
        await onDataChanged();
        setLocalBackupMessage(`备份已增量合并：更新 ${result.imported || 0} 条，保留本机较新记录 ${result.skipped || 0} 条`);
      }
    } catch (error) {
      setLocalBackupMessage(error instanceof Error ? error.message : "本地备份操作失败");
    } finally {
      setLocalBackupBusy(false);
    }
  }

  async function openCloudBackupFolder() {
    if (syncBusy) return;
    setSyncMessage("");
    try {
      await apiRequest<{ opened: boolean; folder: string }>("/api/sync/open-backup-folder", {});
      setSyncMessage("已在文件管理器中打开完整备份文件夹");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "无法打开完整备份文件夹");
    }
  }

  const displaySyncTime = (value: string) => value
    ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "尚未执行";

  async function askAnalysis(question = analysisQuestion) {
    const text = question.trim();
    if (!text || analysisSending || !llmConfig.configured) return;
    const rangeDays = analysisRange;
    setAnalysisMessages((old) => [...old, { id: `analysis-user-${Date.now()}`, role: "user", content: text, rangeDays }]);
    setAnalysisQuestion("");
    setAnalysisError("");
    setAnalysisSending(true);
    try {
      const result = await apiRequest<{ reply: string; rangeDays: number; readOnly: boolean }>("/api/llm/analyze", { question: text, rangeDays });
      setAnalysisMessages((old) => [...old, { id: `analysis-assistant-${Date.now()}`, role: "assistant", content: result.reply, rangeDays }]);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "历史分析请求失败");
    } finally {
      setAnalysisSending(false);
    }
  }

  async function clearAnalysis() {
    await apiRequest("/api/analysis/clear", {});
    setAnalysisMessages([]);
    setAnalysisError("");
  }

  const visibleAnalysis = analysisMessages.filter((message) => message.rangeDays === analysisRange);
  const rangeLabel = analysisRange === 0 ? "全部记录" : `近 ${analysisRange} 天`;
  const prompts = [
    "总结这段时间最值得关注的三个趋势",
    "我的蛋白质和总热量是否稳定？",
    "结合运动和体重变化给我建议",
    "哪些营养素可能长期不足或偏高？",
  ];

  return <section className="history">
    <div className="history-head"><div><p>所有记录</p><h1>历史、同步与备份</h1><span>先查看历史趋势和每日汇总；同步与备份设置位于页面底部。</span></div></div>
    <article className={`sync-panel ${syncStatus?.enabled ? "enabled" : ""}`}>
      <div className="sync-main">
        <div className="sync-icon">{syncStatus?.enabled ? "✓" : "↔"}</div>
        <div>
          <p>云盘双机同步</p>
          <h2>{syncStatus?.enabled ? "已启用安全增量同步" : "当前仅在本机保存"}</h2>
          <span className="sync-path">{syncStatus?.folder || syncStatus?.suggestedFolder || "可选择 OneDrive 或其他网盘的本地同步目录"}</span>
        </div>
      </div>
      <div className="sync-settings">
        <div className="sync-mode" aria-label="数据保存模式">
          <button className={!syncStatus?.enabled ? "active" : ""} disabled={syncBusy} onClick={() => syncAction("/api/sync/config", { folder: syncFolderDraft, enabled: false })}>仅本地使用</button>
          <button className={syncStatus?.enabled ? "active" : ""} disabled={syncBusy || !syncFolderDraft.trim()} onClick={() => syncAction("/api/sync/config", { folder: syncFolderDraft, enabled: true })}>开启同步</button>
        </div>
        <label className="sync-folder-field">
          <span>同步文件夹路径</span>
          <div>
            <input value={syncFolderDraft} onChange={(event) => setSyncFolderDraft(event.target.value)} placeholder="选择或输入网盘中的每日摄入同步文件夹" />
            <button type="button" disabled={syncBusy} onClick={() => syncAction("/api/sync/select-folder", { enabled: Boolean(syncStatus?.enabled) })}>浏览选择</button>
            <button type="button" disabled={syncBusy || !syncFolderDraft.trim()} onClick={() => syncAction("/api/sync/config", { folder: syncFolderDraft, enabled: Boolean(syncStatus?.enabled) })}>保存路径</button>
          </div>
        </label>
        <small>可使用 OneDrive、Dropbox、坚果云或其他会自动同步本地文件夹的网盘。建议在网盘中单独建立“每日摄入同步”文件夹。</small>
      </div>
      <div className="sync-stats">
        <div><span>最近同步</span><strong>{displaySyncTime(syncStatus?.lastSyncAt || "")}</strong></div>
        <div><span>完整备份</span><strong>{displaySyncTime(syncStatus?.lastBackupAt || "")}</strong></div>
        <div><span>待发送</span><strong>{syncStatus?.pending || 0} 条</strong></div>
        <div><span>冲突记录</span><strong className={syncStatus?.conflicts ? "warning" : ""}>{syncStatus?.conflicts || 0} 条</strong></div>
      </div>
      {syncStatus?.enabled && <div className="sync-storage-summary">
        <span>云端现有：增量 {syncStatus.cloudEventFiles} 个 · 完整快照 {syncStatus.cloudSnapshotFiles} 个 · 历史备份 {syncStatus.cloudBackupFiles} 个</span>
        <span>自动清理仅针对超过 {syncStatus.retentionEventMaxAgeDays} 天、已被校验快照覆盖的增量；始终至少保留 {syncStatus.retentionEventMinFiles} 个</span>
        <span>每天首次启动检查云端；若 {syncStatus.snapshotFreshnessDays || 30} 天内没有完整快照会自动补建。新设备优先读取最新快照，只合并其后未覆盖的增量。</span>
      </div>}
      {syncStatus?.lastError && <div className="sync-warning">上次同步未完成：{syncStatus.lastError}</div>}
      {syncMessage && <div className="sync-message">{syncMessage}</div>}
      <div className="sync-actions">
        {syncStatus?.enabled && <ActionHelp hint="上传本机尚未发送的新事件到云端，同时读取其他设备产生的数据，并按时间戳合并"><button disabled={syncBusy} onClick={() => syncAction("/api/sync/run")}>立即同步</button></ActionHelp>}
        {syncStatus?.enabled && <ActionHelp hint="把本机当前未删除的全部记录写成一份独立备份文件，保存到当前同步目录"><button disabled={syncBusy} onClick={() => syncAction("/api/sync/backup")}>立即完整备份</button></ActionHelp>}
        {syncStatus?.enabled && <ActionHelp hint="在文件管理器中打开“立即完整备份”所在的 backups 文件夹"><button disabled={syncBusy} onClick={openCloudBackupFolder}>打开备份文件夹</button></ActionHelp>}
        {syncStatus?.enabled && <ActionHelp hint="生成供程序迁移使用的完整同步快照到云端"><button className="primary" disabled={syncBusy} onClick={() => syncAction("/api/sync/full-export")}>导出全部记录到云盘</button></ActionHelp>}
        {syncStatus?.enabled && <ActionHelp hint="读取云盘最新完整快照及其后未覆盖的增量，并按时间戳合并到本机"><button disabled={syncBusy} onClick={() => syncAction("/api/sync/full-import")}>同步云端全部数据</button></ActionHelp>}
      </div>
      <div className="sync-foot">
        <span>{syncStatus?.enabled ? "每 60 秒检查增量 · 每 24 小时创建并校验完整备份 · 每日首次启动检查 30 天快照保鲜" : "仅本地模式不会读写任何网盘目录"} · 可离线使用</span>
        <span>API 密钥、接口令牌、LLM 设置和聊天记录不会同步</span>
      </div>
    </article>
    <article className="analysis-panel">
      <div className="analysis-head">
        <div><p>只读分析</p><h2>历史数据助手</h2><span>{llmConfig.configured ? `${llmConfig.model} · 只分析，不修改记录` : "配置模型后即可分析历史数据"}</span></div>
        <div className="analysis-ranges" aria-label="分析时间范围">
          {[7, 30, 90, 0].map((days) => <button key={days} className={analysisRange === days ? "active" : ""} onClick={() => setAnalysisRange(days)}>{days === 0 ? "全部" : `${days} 天`}</button>)}
        </div>
      </div>
      <div className="analysis-prompts">
        {prompts.map((prompt) => <button key={prompt} onClick={() => askAnalysis(prompt)} disabled={!llmConfig.configured || analysisSending}>{prompt}</button>)}
      </div>
      <div className="analysis-log" aria-live="polite">
        {visibleAnalysis.length === 0 && !analysisSending &&
          <div className="analysis-empty"><strong>{rangeLabel}，想了解什么？</strong><span>助手会综合饮食、营养、活动量和体重记录，并说明数据不足之处。</span></div>}
        {visibleAnalysis.map((message) => <div className={`analysis-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "分析助手"}</span><p>{message.content}</p></div>)}
        {analysisSending && <div className="analysis-message assistant thinking"><span>分析助手</span><p>正在汇总{rangeLabel}的数据并寻找趋势…</p></div>}
      </div>
      {analysisError && <div className="analysis-error">{analysisError}</div>}
      <div className="analysis-compose">
        <textarea value={analysisQuestion} onChange={(event) => setAnalysisQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askAnalysis(); } }} placeholder={llmConfig.configured ? `询问${rangeLabel}的饮食、运动或体重趋势…` : "请先配置 LLM 接口"} disabled={!llmConfig.configured || analysisSending} rows={2} />
        <button className="primary" onClick={() => askAnalysis()} disabled={!llmConfig.configured || analysisSending || !analysisQuestion.trim()}>{analysisSending ? "分析中" : "发送"}</button>
      </div>
      <div className="analysis-foot"><span>所选范围的汇总会发送给已配置模型 · 缺失日期不会被当成零摄入</span><div>{visibleAnalysis.length > 0 && <button onClick={clearAnalysis}>清空分析</button>}{!llmConfig.configured && <button onClick={onOpenConfig}>配置模型</button>}</div></div>
    </article>
    <TrendFilterBar
      range={trendRange}
      bucket={trendBucket}
      skipEmpty={trendSkipEmpty}
      onRangeChange={setTrendRange}
      onBucketChange={setTrendBucket}
      onSkipEmptyChange={setTrendSkipEmpty}
      note="周平均和月平均只计算有记录的日期，不会把漏记日期当作零。"
    />
    <div className="trend-stack">
      <article className="trend-panel calorie-trend-panel">
        <div className="chart-heading"><div><p>能量趋势</p><h2>净摄入与运动消耗</h2></div><span>半透明面积代表所选数据点的摄入热量</span></div>
        <CalorieBalanceTrendChart foods={foods} exercises={exercises} profile={profile} weights={weights} baselineMultipliers={baselineMultipliers} targetScenarios={targetScenarios} targetScenarioDefaults={targetScenarioDefaults} energyTargetDays={energyTargetDays} energyTargetDefaults={energyTargetDefaults} range={trendRange} bucket={trendBucket} skipEmpty={trendSkipEmpty} />
      </article>
      <article className="trend-panel macro-trend-panel">
        <div className="chart-heading"><div><p>营养趋势</p><h2>蛋白质、碳水与脂肪</h2></div><span>可单独开关每条折线</span></div>
        <MacroTrendChart foods={foods} profile={profile} weights={weights} baselineMultipliers={baselineMultipliers} targetScenarios={targetScenarios} targetScenarioDefaults={targetScenarioDefaults} energyTargetDays={energyTargetDays} energyTargetDefaults={energyTargetDefaults} range={trendRange} bucket={trendBucket} skipEmpty={trendSkipEmpty} />
      </article>
    </div>
    <FoodLibraryOverview foods={foodLibrary} onChanged={onDataChanged} />
    <WalkingPanel profiles={walkingProfiles} weights={weights} sex={profile.sex} onPut={async (store,value) => { await apiRequest("/api/put", {store,value}); await onDataChanged(); }} />
    <ActivityPanel entries={exerciseLibrary} Pagination={PaginationControls} onPut={async (store,value) => { await apiRequest("/api/put", {store,value}); await onDataChanged(); }} onDelete={async (store,id) => { await apiRequest("/api/delete", {store,id}); await onDataChanged(); }} />
    <div className="section-title history-record-title paginated-section-title"><div><p>每日汇总</p><h2>记录明细</h2></div><div className="history-period-filter">
      <label><span>年份</span><select value={recordYear} onChange={(event) => { setRecordYear(event.target.value); setRecordMonth("all"); historyPagination.setPage(1); }}><option value="all">全部年份</option>{recordYears.map((year) => <option key={year} value={year}>{year} 年</option>)}</select></label>
      <label><span>月份</span><select value={recordMonth} disabled={recordYear === "all"} onChange={(event) => { setRecordMonth(event.target.value); historyPagination.setPage(1); }}><option value="all">全年</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => <option key={month} value={month}>{Number(month)} 月</option>)}</select></label>
      {(recordYear !== "all" || recordMonth !== "all") && <button type="button" onClick={() => { setRecordYear("all"); setRecordMonth("all"); historyPagination.setPage(1); }}>清除筛选</button>}
    </div></div>
    <div className="history-records"><div className="history-list">{allRecordDates.length === 0 ? <Empty text="还没有历史记录" hint="完成第一条记录后会显示在这里" /> : filteredRecordDates.length === 0 ? <Empty text="这个年月没有记录" hint="切换年份、月份或清除筛选" /> : historyPagination.pageItems.map((date) => {
      const f = foods.filter((x) => x.date === date); const e = exercises.filter((x) => x.date === date);
      const intake = f.reduce((s, x) => s + x.calories, 0); const burn = e.reduce((s, x) => s + x.calories, 0);
      const plan = targetPlanForDate(date, profile, weights, baselineMultipliers, targetScenarios, targetScenarioDefaults, energyTargetDays, energyTargetDefaults);
      const balanceLabel = !plan.balanceEnabled ? "未启用缺口/盈余" : plan.balanceAdjustment < 0 ? `缺口 ${Math.abs(plan.balanceAdjustment)} kcal` : plan.balanceAdjustment > 0 ? `盈余 ${plan.balanceAdjustment} kcal` : "缺口/盈余 0 kcal";
      return <article key={date}><time>{new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</time><div><b>{f.length}</b><span>餐饮食</span></div><div><b>{Math.round(intake)}</b><span>摄入千卡</span></div><div><b>{Math.round(burn)}</b><span>消耗千卡</span></div><div className="history-day-target"><b>{targetScenarioLabel(plan.scenario)}</b><span>目标 {plan.calories} kcal · 蛋白质 {plan.protein} g</span><small>{plan.balanceMode === "exception" ? "今日特例" : "长期目标"} · {balanceLabel}</small></div><strong>{Math.round(intake - burn)} 净摄入</strong></article>;
    })}</div><PaginationControls totalItems={filteredRecordDates.length} page={historyPagination.page} pageSize={historyPagination.pageSize} totalPages={historyPagination.totalPages} onPageChange={historyPagination.setPage} onPageSizeChange={historyPagination.setPageSize} /></div>
    <div className="history-storage-heading">
      <div><p>数据管理</p><h2>同步与备份</h2><span>数据库保留在本机；云盘只传递增量记录和不含密钥的完整备份。</span></div>
      <div className="backup-actions">
        <ActionHelp hint="立即生成包含本机当前全部未删除记录的最新备份，并选择本地保存位置"><button disabled={localBackupBusy} onClick={() => localBackupAction("export")}>下载备份</button></ActionHelp>
        <ActionHelp hint="从本地指定文件导入备份数据；按记录 ID 和时间戳增量合并，不清空其他数据"><button disabled={localBackupBusy} onClick={() => localBackupAction("import")}>导入备份</button></ActionHelp>
      </div>
    </div>
    {localBackupMessage && <div className="local-backup-message">{localBackupMessage}</div>}
  </section>;
}

function useLatestChartScroll(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [key]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollLeft = element.scrollWidth;
    const frame = requestAnimationFrame(() => { element.scrollLeft = element.scrollWidth; });
    return () => cancelAnimationFrame(frame);
  }, [key, viewportWidth]);
  return { latestScroll: ref, viewportWidth };
}

function CalorieBalanceTrendChart({ foods, exercises, profile, weights, baselineMultipliers, targetScenarios, targetScenarioDefaults, energyTargetDays, energyTargetDefaults, range, bucket, skipEmpty }: { foods: FoodRecord[]; exercises: ExerciseRecord[]; profile: Profile; weights: WeightRecord[]; baselineMultipliers: BaselineMultiplierRecord[]; targetScenarios: TargetScenarioDayRecord[]; targetScenarioDefaults: TargetScenarioDefaultRecord[]; energyTargetDays: EnergyTargetDayRecord[]; energyTargetDefaults: EnergyTargetDefaultRecord[]; range: TrendRange; bucket: TrendBucket; skipEmpty: boolean }) {
  const [tooltip, setTooltip] = useState<ChartTooltipState>(null);
  const recordedDates = filterTrendDates([...new Set([...foods.map((item) => item.date), ...exercises.map((item) => item.date)])].sort(), range);
  const { latestScroll, viewportWidth } = useLatestChartScroll([range, bucket, skipEmpty, recordedDates.join(",")].join("|"));
  if (recordedDates.length === 0) return <Empty text="还没有能量趋势" hint="记录饮食或运动后，这里会显示净摄入与运动消耗" />;
  const dates = trendAxisDates(recordedDates, skipEmpty);
  const daily = dates.map((date) => {
    const intake = foods.filter((item) => item.date === date).reduce((sum, item) => sum + Number(item.calories || 0), 0);
    const burned = exercises.filter((item) => item.date === date).reduce((sum, item) => sum + Number(item.calories || 0), 0);
    const target = targetPlanForDate(date, profile, weights, baselineMultipliers, targetScenarios, targetScenarioDefaults, energyTargetDays, energyTargetDefaults).calories;
    return { date, label: formatTrendPointLabel(date, "day"), intake, net: intake - burned, exercise: -burned, target, recorded: recordedDates.includes(date) };
  });
  const data = aggregateSparseTrendData(daily, bucket, ["intake", "net", "exercise"], ["target"]);
  const actual = data.map((item, index) => ({ item, index })).filter(({ item }) => item.recorded);
  const segments = actual.slice(1).map((current, index) => ({
    first: actual[index],
    second: current,
    gap: current.index - actual[index].index > 1,
  }));
  const width = Math.max(viewportWidth, (data.length - 1) * Math.max(1, (viewportWidth - 88) / 44) + 88), height = 410, left = 64, right = 24, top = 32, bottom = 54;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const rawMax = Math.max(0, ...actual.map(({ item }) => item.net), ...data.map((item) => item.target));
  const rawMin = Math.min(0, ...actual.map(({ item }) => item.exercise));
  const valueRange = Math.max(200, rawMax - rawMin);
  const yMax = rawMax + valueRange * 0.08, yMin = rawMin - valueRange * 0.08;
  const x = (index: number) => left + (data.length === 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const y = (value: number) => top + (yMax - value) / (yMax - yMin) * plotHeight;
  const targetPoints = data.map((item, index) => `${x(index)},${y(item.target)}`).join(" ");
  const tickValues = Array.from({ length: 5 }, (_, index) => yMax - index * (yMax - yMin) / 4);
  const labelEvery = Math.max(1, Math.ceil(60 / ((width - left - right) / Math.max(1, data.length - 1))));
  return <div className="trend-chart calorie-balance-chart">
    <div className="trend-legend">
      <span><i className="net-swatch" />净摄入（摄入 − 运动）</span>
      <span><i className="exercise-swatch" />运动消耗（负值）</span>
      <span><i className="intake-area-swatch" />两线之间＝摄入热量</span>
      <em>虚线为净摄入参考值</em>
    </div>
    <div className="chart-scroll" ref={latestScroll}><svg style={{ minWidth: `${width}px` }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`净摄入、运动消耗和摄入热量面积趋势图，共 ${data.length} 个数据点`}>
      <desc>上方橙色点为摄入减运动后的净摄入，下方蓝色点为负向运动消耗，两者之间的半透明面积代表摄入热量。</desc>
      <defs>
        <linearGradient id="calorie-intake-area" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={height - bottom}>
          <stop offset="0%" stopColor="#d85843" stopOpacity=".34" />
          <stop offset={`${Math.max(0, Math.min(100, (y(0) - top) / plotHeight * 100))}%`} stopColor="#b7aca0" stopOpacity=".11" />
          <stop offset="100%" stopColor="#3978bd" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <text x={left} y={18} className="trend-axis-title">热量 kcal</text>
      {tickValues.map((tick, index) => <g key={index}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid" /><text x={left - 10} y={y(tick) + 4} textAnchor="end">{Math.round(tick)}</text></g>)}
      <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="zero-line" />
      {data.length > 1 && <polyline points={targetPoints} className="target-trend-line calorie-target" />}
      {data.map((item, index) => <circle key={`target-${item.date}`} cx={x(index)} cy={y(item.target)} r="2.5" className="target-trend-dot" onMouseEnter={() => setTooltip({ x: x(index), y: y(item.target), text: `${item.label}：净摄入参考 ${Math.round(item.target)} kcal` })} onMouseLeave={() => setTooltip(null)} />)}
      <text x={width - right} y={y(data.at(-1)!.target) - 7} textAnchor="end" className="target-label">动态净摄入参考</text>
      {segments.map(({ first, second }) => <path key={`area-${first.item.date}-${second.item.date}`} d={`M ${x(first.index)} ${y(first.item.net)} L ${x(second.index)} ${y(second.item.net)} L ${x(second.index)} ${y(second.item.exercise)} L ${x(first.index)} ${y(first.item.exercise)} Z`} className="calorie-intake-area" />)}
      {actual.map(({ item, index }) => <line key={`connector-${item.date}`} x1={x(index)} x2={x(index)} y1={y(item.net)} y2={y(item.exercise)} className="calorie-connector" />)}
      {segments.map(({ first, second, gap }) => <g key={`lines-${first.item.date}-${second.item.date}`} className={gap ? "gap-segment" : ""}>
        <line x1={x(first.index)} y1={y(first.item.net)} x2={x(second.index)} y2={y(second.item.net)} className="trend-line net-calories" />
        <line x1={x(first.index)} y1={y(first.item.exercise)} x2={x(second.index)} y2={y(second.item.exercise)} className="trend-line exercise-calories" />
      </g>)}
      {actual.map(({ item, index }, actualIndex) => <g key={item.date}>
        <circle cx={x(index)} cy={y(item.net)} r={actualIndex === actual.length - 1 ? 5.5 : 4} className="trend-dot net-calories" onMouseEnter={() => setTooltip({ x: x(index), y: y(item.net), text: `${item.label}：净摄入 ${Math.round(item.net)} kcal，摄入 ${Math.round(item.intake)} kcal` })} onMouseLeave={() => setTooltip(null)} />
        <circle cx={x(index)} cy={y(item.exercise)} r={actualIndex === actual.length - 1 ? 5.5 : 4} className="trend-dot exercise-calories" onMouseEnter={() => setTooltip({ x: x(index), y: y(item.exercise), text: `${item.label}：运动消耗 ${Math.round(-item.exercise)} kcal` })} onMouseLeave={() => setTooltip(null)} />
      </g>)}
      {data.map((item, index) => <g key={`axis-${item.date}`}>
        {(index % labelEvery === 0 || index === data.length - 1) && <text x={x(index)} y={height - 19} textAnchor="middle">{item.label}</text>}
      </g>)}
      <SvgChartTooltip tooltip={tooltip} width={width} height={height} />
    </svg></div>
    <div className="trend-latest"><span>最近数据点</span><strong>{actual.at(-1)!.item.label} · 净摄入 {Math.round(actual.at(-1)!.item.net)} kcal · 运动 {Math.round(-actual.at(-1)!.item.exercise)} kcal · 摄入 {Math.round(actual.at(-1)!.item.intake)} kcal</strong></div>
  </div>;
}

type MacroKey = "protein" | "carbs" | "fat";
type TrendRange = 7 | 14 | 30 | 90 | 365 | 0;
type TrendBucket = "day" | "week" | "month";
const MACRO_REFERENCE_MIN_FADE_PX = 72;

function MacroTrendChart({ foods, profile, weights, baselineMultipliers, targetScenarios, targetScenarioDefaults, energyTargetDays, energyTargetDefaults, range, bucket, skipEmpty }: { foods: FoodRecord[]; profile: Profile; weights: WeightRecord[]; baselineMultipliers: BaselineMultiplierRecord[]; targetScenarios: TargetScenarioDayRecord[]; targetScenarioDefaults: TargetScenarioDefaultRecord[]; energyTargetDays: EnergyTargetDayRecord[]; energyTargetDefaults: EnergyTargetDefaultRecord[]; range: TrendRange; bucket: TrendBucket; skipEmpty: boolean }) {
  const recordedDates = filterTrendDates([...new Set(foods.map((item) => item.date))].sort(), range);
  const dates = trendAxisDates(recordedDates, skipEmpty);
  const [visible, setVisible] = useState<Record<MacroKey, boolean>>({ protein: true, carbs: true, fat: true });
  const [referenceVisible, setReferenceVisible] = useState<Record<MacroKey, boolean>>({ protein: true, carbs: true, fat: true });
  const [tooltip, setTooltip] = useState<ChartTooltipState>(null);
  const { latestScroll, viewportWidth } = useLatestChartScroll([range, bucket, skipEmpty, recordedDates.join(",")].join("|"));
  if (recordedDates.length === 0) return <Empty text="还没有营养趋势" hint="记录饮食后，这里会显示蛋白质、碳水与脂肪变化" />;
  const daily = dates.map((date) => {
    const day = foods.filter((item) => item.date === date);
    const target = targetPlanForDate(date, profile, weights, baselineMultipliers, targetScenarios, targetScenarioDefaults, energyTargetDays, energyTargetDefaults);
    return {
      date,
      label: formatTrendPointLabel(date, "day"),
      protein: day.reduce((sum, item) => sum + Number(item.protein || 0), 0),
      carbs: day.reduce((sum, item) => sum + Number(item.carbs || 0), 0),
      fat: day.reduce((sum, item) => sum + Number(item.fat || 0), 0),
      targetProtein: target.protein,
      targetCarbs: target.carbs,
      targetFat: target.fat,
      recorded: recordedDates.includes(date),
    };
  });
  const data = aggregateSparseTrendData(daily, bucket, ["protein", "carbs", "fat"], ["targetProtein", "targetCarbs", "targetFat"]);
  const actual = data.map((item, index) => ({ item, index })).filter(({ item }) => item.recorded);
  const series: Array<{ key: MacroKey; label: string }> = [
    { key: "protein", label: "蛋白质" },
    { key: "carbs", label: "碳水" },
    { key: "fat", label: "脂肪" },
  ];
  const enabled = series.filter((item) => visible[item.key]);
  const referenceEnabled = series.filter((item) => referenceVisible[item.key]);
  const width = Math.max(viewportWidth, (data.length - 1) * Math.max(1, (viewportWidth - 82) / 44) + 82), height = 360, left = 58, right = 24, top = 30, bottom = 52;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const activeValues = enabled.flatMap(({ key }) => actual.map(({ item }) => item[key]));
  const targetKey = (key: MacroKey) => `target${key[0].toUpperCase()}${key.slice(1)}` as "targetProtein" | "targetCarbs" | "targetFat";
  const activeTargets = referenceEnabled.flatMap(({ key }) => data.map((item) => item[targetKey(key)]));
  const yMax = Math.max(10, ...activeValues, ...activeTargets) * 1.15;
  const x = (index: number) => left + (data.length === 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1));
  const y = (value: number) => top + (yMax - value) / yMax * plotHeight;
  const targetValue = (item: (typeof data)[number], key: MacroKey) => Number(item[targetKey(key)] || 0);
  const referenceBandPaths: Array<{ id: string; key: MacroKey; d: string; gradientTop: number; gradientBottom: number }> = [];
  const bandKeys = referenceEnabled.map((item) => item.key);
  const addBandCell = (
    id: string,
    key: MacroKey,
    xA: number,
    xB: number,
    topA: number,
    topB: number,
    bottomA: number,
    bottomB: number,
  ) => {
    if (Math.max(topA - bottomA, topB - bottomB) <= .001) return;
    const topY = (y(topA) + y(topB)) / 2;
    const bottomY = (y(bottomA) + y(bottomB)) / 2;
    const fadeHeight = Math.max(MACRO_REFERENCE_MIN_FADE_PX, bottomY - topY);
    referenceBandPaths.push({
      id,
      key,
      d: `M ${xA} ${y(topA)} L ${xB} ${y(topB)} L ${xB} ${y(bottomB)} L ${xA} ${y(bottomA)} Z`,
      gradientTop: topY,
      gradientBottom: topY + fadeHeight,
    });
  };
  if (bandKeys.length && data.length === 1) {
    const ordered = [...bandKeys].sort((a, b) => targetValue(data[0], b) - targetValue(data[0], a));
    ordered.forEach((key, rank) => addBandCell(
      `single-${key}`,
      key,
      x(0) - 18,
      x(0) + 18,
      targetValue(data[0], key),
      targetValue(data[0], key),
      ordered[rank + 1] ? targetValue(data[0], ordered[rank + 1]) : 0,
      ordered[rank + 1] ? targetValue(data[0], ordered[rank + 1]) : 0,
    ));
  } else if (bandKeys.length) {
    for (let index = 0; index < data.length - 1; index++) {
      const first = data[index];
      const second = data[index + 1];
      const breaks = [0, 1];
      for (let a = 0; a < bandKeys.length; a++) {
        for (let b = a + 1; b < bandKeys.length; b++) {
          const diffA = targetValue(first, bandKeys[a]) - targetValue(first, bandKeys[b]);
          const diffB = targetValue(second, bandKeys[a]) - targetValue(second, bandKeys[b]);
          if (diffA * diffB < 0) breaks.push(diffA / (diffA - diffB));
        }
      }
      const sortedBreaks = [...new Set(breaks)].sort((a, b) => a - b);
      for (let part = 0; part < sortedBreaks.length - 1; part++) {
        const start = sortedBreaks[part];
        const end = sortedBreaks[part + 1];
        const subdivisions = data.length <= 30 ? 4 : data.length <= 90 ? 2 : 1;
        for (let slice = 0; slice < subdivisions; slice++) {
          const tA = start + (end - start) * slice / subdivisions;
          const tB = start + (end - start) * (slice + 1) / subdivisions;
          const midpoint = (tA + tB) / 2;
          const valueAt = (key: MacroKey, ratio: number) =>
            targetValue(first, key) + (targetValue(second, key) - targetValue(first, key)) * ratio;
          const ordered = [...bandKeys].sort((a, b) => valueAt(b, midpoint) - valueAt(a, midpoint));
          ordered.forEach((key, rank) => {
            const lowerKey = ordered[rank + 1];
            addBandCell(
              `${index}-${part}-${slice}-${key}`,
              key,
              x(index) + (x(index + 1) - x(index)) * tA,
              x(index) + (x(index + 1) - x(index)) * tB,
              valueAt(key, tA),
              valueAt(key, tB),
              lowerKey ? valueAt(lowerKey, tA) : 0,
              lowerKey ? valueAt(lowerKey, tB) : 0,
            );
          });
        }
      }
    }
  }
  const labelEvery = Math.max(1, Math.ceil(60 / ((width - left - right) / Math.max(1, data.length - 1))));
  return <div className="trend-chart macro-chart">
    <div className="macro-toggle-block">
      <div className="macro-switches" aria-label="选择显示的实际摄入">
        <strong>实际摄入</strong>
        {series.map(({ key, label }) => <button key={key} className={`${key} ${visible[key] ? "active" : ""}`} aria-pressed={visible[key]} onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}><i />{label}</button>)}
      </div>
      <div className="macro-switches reference-switches" aria-label="选择显示的动态参考摄入">
        <strong>参考目标</strong>
        {series.map(({ key, label }) => <button key={key} className={`${key} ${referenceVisible[key] ? "active" : ""}`} aria-pressed={referenceVisible[key]} onClick={() => setReferenceVisible((current) => ({ ...current, [key]: !current[key] }))}><i />{label}参考线</button>)}
        <span>参考目标随历史体重与基线系数变化</span>
      </div>
    </div>
    <div className="chart-scroll" ref={latestScroll}><svg style={{ minWidth: `${width}px` }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`三大营养素趋势图，当前显示${enabled.map((item) => item.label).join("、") || "无"}`}>
      <desc>可分别显示或隐藏蛋白质、碳水、脂肪及其参考目标。</desc>
      <defs>
        {referenceBandPaths.map((band) => {
          const color = band.key === "protein" ? "#5aa6d1" : band.key === "carbs" ? "#efbd4f" : "#d883aa";
          return <linearGradient
            key={`gradient-${band.id}`}
            id={`macro-reference-band-${band.key}-${band.id}`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={band.gradientTop}
            x2="0"
            y2={band.gradientBottom}
          >
            <stop offset="0%" stopColor={color} stopOpacity=".26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>;
        })}
      </defs>
      <text x={left} y={18} className="trend-axis-title">营养素 g</text>
      <g className="macro-reference-bands" aria-hidden="true">
        {referenceBandPaths.map((band) => <path key={band.id} d={band.d} fill={`url(#macro-reference-band-${band.key}-${band.id})`} />)}
      </g>
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} className="chart-grid" /><text x={left - 9} y={top + plotHeight * ratio + 4} textAnchor="end">{Math.round(yMax * (1 - ratio))}</text></g>)}
      {referenceEnabled.map(({ key, label }) => {
        const metric = targetKey(key);
        const points = data.map((item, index) => `${x(index)},${y(item[metric])}`).join(" ");
        return <g key={`reference-${key}`}>
          {data.length > 1 && <polyline points={points} className={`macro-reference-line macro-${key}`} />}
          {data.map((item, index) => {
            const cx = x(index);
            const cy = y(item[metric]);
            const text = `${item.label}：${label}参考 ${Number(item[metric].toFixed(1))} g`;
            const handlers = { onMouseEnter: () => setTooltip({ x: cx, y: cy, text }), onMouseLeave: () => setTooltip(null) };
            if (key === "carbs") return <rect key={item.date} x={cx - 2.2} y={cy - 2.2} width="4.4" height="4.4" rx=".5" className="macro-reference-dot macro-carbs" {...handlers} />;
            if (key === "fat") return <polygon key={item.date} points={`${cx},${cy - 3} ${cx + 3},${cy} ${cx},${cy + 3} ${cx - 3},${cy}`} className="macro-reference-dot macro-fat" {...handlers} />;
            return <circle key={item.date} cx={cx} cy={cy} r="2.3" className="macro-reference-dot macro-protein" {...handlers} />;
          })}
        </g>;
      })}
      {enabled.map(({ key, label }) => {
        const seriesActual = actual;
        const segments = seriesActual.slice(1).map((current, index) => ({ first: seriesActual[index], second: current, gap: current.index - seriesActual[index].index > 1 }));
        return <g key={key}>
          {segments.map(({ first, second, gap }) => <line key={`${first.item.date}-${second.item.date}`} x1={x(first.index)} y1={y(first.item[key])} x2={x(second.index)} y2={y(second.item[key])} className={`trend-line macro-${key} ${gap ? "gap-segment" : ""}`} />)}
          {seriesActual.map(({ item, index }, actualIndex) => {
            const size = actualIndex === seriesActual.length - 1 ? 5 : 3.8;
            const cx = x(index);
            const cy = y(item[key]);
            const text = `${item.label}：${label} ${Number(item[key].toFixed(1))} g`;
            const handlers = { onMouseEnter: () => setTooltip({ x: cx, y: cy, text }), onMouseLeave: () => setTooltip(null) };
            if (key === "carbs") return <rect key={item.date} x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx="1" className="trend-dot macro-carbs" {...handlers} />;
            if (key === "fat") return <polygon key={item.date} points={`${cx},${cy - size - 1} ${cx + size + 1},${cy} ${cx},${cy + size + 1} ${cx - size - 1},${cy}`} className="trend-dot macro-fat" {...handlers} />;
            return <circle key={item.date} cx={cx} cy={cy} r={size} className="trend-dot macro-protein" {...handlers} />;
          })}
        </g>;
      })}
      {data.map((item, index) => (index % labelEvery === 0 || index === data.length - 1) && <text key={item.date} x={x(index)} y={height - 17} textAnchor="middle">{item.label}</text>)}
      {enabled.length === 0 && <text x={width / 2} y={height / 2} textAnchor="middle" className="chart-empty-label">请至少开启一种营养素</text>}
      <SvgChartTooltip tooltip={tooltip} width={width} height={height} />
    </svg></div>
    <div className="trend-latest"><span>最近数据点</span><strong>{actual.at(-1)!.item.label} · 蛋白质 {Number(actual.at(-1)!.item.protein.toFixed(1))} g · 碳水 {Number(actual.at(-1)!.item.carbs.toFixed(1))} g · 脂肪 {Number(actual.at(-1)!.item.fat.toFixed(1))} g</strong></div>
  </div>;
}

function filterTrendDates(dates: string[], range: TrendRange) {
  if (!range || dates.length === 0) return dates;
  const latest = new Date(`${dates.at(-1)}T12:00:00`);
  latest.setDate(latest.getDate() - range + 1);
  const cutoff = latest.toLocaleDateString("en-CA");
  return dates.filter((date) => date >= cutoff);
}

function trendAxisDates(recordedDates: string[], skipEmpty: boolean) {
  const unique = [...new Set(recordedDates)].sort();
  if (skipEmpty || unique.length < 2) return unique;
  const dates: string[] = [];
  const current = new Date(`${unique[0]}T12:00:00`);
  const end = new Date(`${unique.at(-1)}T12:00:00`);
  while (current <= end) {
    dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function trendBucketKey(date: string, bucket: TrendBucket) {
  if (bucket === "day") return date;
  if (bucket === "month") return date.slice(0, 7);
  const start = new Date(`${date}T12:00:00`);
  const weekday = start.getDay() || 7;
  start.setDate(start.getDate() - weekday + 1);
  return start.toLocaleDateString("en-CA");
}

function formatTrendPointLabel(date: string, bucket: TrendBucket) {
  if (bucket === "month") {
    const [year, month] = date.split("-");
    return `${year.slice(2)}年${Number(month)}月`;
  }
  const formatted = formatChartDate(date);
  return bucket === "week" ? `${formatted}周` : formatted;
}

function aggregateTrendData<T extends { date: string; label: string }>(
  daily: T[],
  bucket: TrendBucket,
  metrics: Array<Exclude<keyof T, "date" | "label">>,
): T[] {
  if (bucket === "day") return daily;
  const groups = new Map<string, T[]>();
  for (const item of daily) {
    const key = trendBucketKey(item.date, bucket);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const result: Record<string, string | number> = {
      date: key,
      label: formatTrendPointLabel(key, bucket),
    };
    for (const metric of metrics) {
      result[String(metric)] = items.reduce((sum, item) => sum + Number(item[metric] || 0), 0) / items.length;
    }
    return result as T;
  });
}

function aggregateSparseTrendData<T extends { date: string; label: string; recorded: boolean }>(
  daily: T[],
  bucket: TrendBucket,
  actualMetrics: Array<Exclude<keyof T, "date" | "label" | "recorded">>,
  continuousMetrics: Array<Exclude<keyof T, "date" | "label" | "recorded">>,
): T[] {
  if (bucket === "day") return daily;
  const groups = new Map<string, T[]>();
  for (const item of daily) {
    const key = trendBucketKey(item.date, bucket);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const actualItems = items.filter((item) => item.recorded);
    const result: Record<string, string | number | boolean> = {
      date: key,
      label: formatTrendPointLabel(key, bucket),
      recorded: actualItems.length > 0,
    };
    for (const metric of actualMetrics) {
      result[String(metric)] = actualItems.length
        ? actualItems.reduce((sum, item) => sum + Number(item[metric] || 0), 0) / actualItems.length
        : 0;
    }
    for (const metric of continuousMetrics) {
      result[String(metric)] = items.reduce((sum, item) => sum + Number(item[metric] || 0), 0) / Math.max(1, items.length);
    }
    return result as T;
  });
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; start: () => void;
  onstart: () => void; onend: () => void; onerror: () => void;
  onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
}

function interpolatedWeightForDate(date: string, weights: WeightRecord[]) {
  if (weights.length === 0) return 0;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const targetTime = new Date(`${date}T12:00:00`).getTime();
  const firstTime = new Date(`${sorted[0].date}T12:00:00`).getTime();
  if (targetTime <= firstTime) return Number(sorted[0].weight || 0);
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const next = sorted[index];
    const previousTime = new Date(`${previous.date}T12:00:00`).getTime();
    const nextTime = new Date(`${next.date}T12:00:00`).getTime();
    if (targetTime <= nextTime) {
      if (nextTime === previousTime) return Number(next.weight || previous.weight || 0);
      const ratio = (targetTime - previousTime) / (nextTime - previousTime);
      return Number(previous.weight) + (Number(next.weight) - Number(previous.weight)) * ratio;
    }
  }
  return Number(sorted.at(-1)?.weight || 0);
}

function ageOnDate(birthdate: string, date: string) {
  if (!birthdate || !date) return null;
  const birth = new Date(`${birthdate}T12:00:00`);
  const current = new Date(`${date}T12:00:00`);
  let age = current.getFullYear() - birth.getFullYear();
  const beforeBirthday = current.getMonth() < birth.getMonth() || (current.getMonth() === birth.getMonth() && current.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age >= 0 ? age : null;
}

function baselineMultiplierForDate(date: string, profile: Profile, records: BaselineMultiplierRecord[]) {
  const applicable = [...records]
    .filter((record) => record.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  return Math.max(0.7, Math.min(2, Number(applicable?.multiplier ?? profile.sedentaryMultiplier ?? 1.2)));
}

function targetPlanForDate(
  date: string,
  profile: Profile,
  weights: WeightRecord[],
  baselineMultipliers: BaselineMultiplierRecord[] = [],
  targetScenarios: TargetScenarioDayRecord[] = [],
  targetScenarioDefaults: TargetScenarioDefaultRecord[] = [],
  energyTargetDays: EnergyTargetDayRecord[] = [],
  energyTargetDefaults: EnergyTargetDefaultRecord[] = [],
): DailyTargetPlan {
  const weight = interpolatedWeightForDate(date, weights);
  const age = ageOnDate(profile.birthdate, date);
  const bmr = weight && profile.height && age !== null
    ? Math.round(10 * weight + 6.25 * profile.height - 5 * age + (profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78))
    : 0;
  const baselineMultiplier = baselineMultiplierForDate(date, profile, baselineMultipliers);
  const baseCalories = bmr
    ? Math.round(bmr * baselineMultiplier)
    : weight
      ? Math.round(weight * (profile.sex === "male" ? 24 : profile.sex === "female" ? 22 : 23) * baselineMultiplier)
      : 2000;
  const balance = energyTargetForDate(date, energyTargetDays, energyTargetDefaults);
  const balanceAdjustment = balance.enabled ? normalizeEnergyAdjustment(balance.adjustment, baseCalories) : 0;
  const calories = Math.max(0, baseCalories + balanceAdjustment);
  const scenario = targetScenarioForDate(date, targetScenarios, targetScenarioDefaults).scenario;
  const { protein, carbs, fat } = macroTargetsForCalories({
    calories,
    baseCalories,
    weight,
    sex: profile.sex,
    scenario,
  });
  return { weight, bmr, baseCalories, calories, protein, carbs, fat, scenario, balanceAdjustment, balanceMode: balance.mode as "longTerm" | "exception", balanceEnabled: balance.enabled, baselineMultiplier };
}

function getAge(birthdate: string) {
  return ageOnDate(birthdate, today());
}

function formatChartDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function guessMeal() {
  const hour = new Date().getHours();
  if (hour < 10) return "早餐";
  if (hour < 15) return "午餐";
  if (hour < 21) return "晚餐";
  return "加餐";
}

function LibraryNutrients({ food }: { food: Nutrients & {reportedNutrients?:string[]} }) {
  return <div className="library-nutrients">{nutrientLabels.map(([key, label, unit]) => <span key={key}>{label} <b>{food.reportedNutrients&&!food.reportedNutrients.includes(key)?"未报告":Number(food[key] || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</b> {unit}</span>)}</div>;
}

function LibraryPicker({ foods, records, date, onClose, onSave }: { foods: LibraryFood[]; records: FoodRecord[]; date: string; onClose: () => void; onSave: (food: FoodRecord) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState("");
  const [grams, setGrams] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = foods.find(food => food.id === selectedId);
  const valid = Number.isFinite(Number(grams)) && Number(grams) > 0;
  let scaled: Nutrients | null = null;
  try { if (selected && valid) scaled = scaleNutrients(selected, Number(grams)) as Nutrients; } catch {}
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selected || !scaled) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await onSave({ ...scaled, id: uid(), name: selected.name, weight: Number(grams), date: String(form.get("date")), time: String(form.get("time")), meal: String(form.get("meal")), note: selected.note });
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "添加失败，请重试"); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><form className="modal library-picker directory-modal" role="dialog" aria-modal="true" aria-labelledby="library-picker-title" onSubmit={submit}>
    <div className="modal-head"><div><p>食品库</p><h2 id="library-picker-title">选择已记录过的食物</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭">×</button></div>
    <ContactDirectory onDeselect={()=>setSelectedId("")} items={foods} records={records} storageKey="food-directory-v1" keyOf={record=>libraryId(record.name)} selected={selectedId} onSelect={food=>{setSelectedId(food.id);setGrams(String(food.defaultServingGrams||100));}} summary={food=>food.calories.toFixed(1)+" kcal / 100 g"} busy={busy}>
    <div className="form-grid"><label>重量（克）<input type="number" min="0.01" step="any" value={grams} onChange={event => setGrams(event.target.value)} required /></label><label>日期<input name="date" type="date" defaultValue={date} required /></label><label>时间<input name="time" type="time" defaultValue={nowTime()} required /></label><label>餐次<select name="meal" defaultValue="午餐"><option>早餐</option><option>午餐</option><option>晚餐</option><option>加餐</option></select></label></div>
    {selected && <><h3>{selected.name} · {grams || "0"} g</h3><p>默认份量：{selected.defaultServingGrams||100} g · {selected.servingBasis||"可按实际食用量调整"}</p></>}
    {scaled && <LibraryNutrients food={{...scaled,reportedNutrients:(selected as LibraryFood & {reportedNutrients?:string[]})?.reportedNutrients}} />}
    {selected?.note&&<details><summary>来源与适用说明</summary><p>{selected.note}</p></details>}
    </ContactDirectory>
    {error && <p role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy || !scaled}>{busy ? "正在添加…" : "添加饮食记录"}</button></div>
  </form></div>;
}

function FoodLibraryOverview({ foods, onChanged }: { foods: LibraryFood[]; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [direction, setDirection] = useState("asc");
  const [editing, setEditing] = useState<LibraryFood | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<LibraryFood | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = sortLibraryFoods(foods, query, sort, direction) as LibraryFood[];
  const pagination = usePaginatedItems(filtered);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!editing && foods.some(food => libraryId(food.name) === libraryId(name))) { setError("食品库已有同名食品，请修改已有记录"); return; }
    const value = { defaultServingGrams:Number(form.get("defaultServingGrams")), reportedNutrients:nutrientLabels.filter(([key])=>String(form.get(key)||" ").trim()!=="").map(([key])=>key), ...Object.fromEntries(nutrientLabels.map(([key]) => [key, Number(form.get(key) || 0)])), id: editing?.id || libraryId(name), name, weight: 100, note: String(form.get("note") || "") };
    setBusy(true); setError("");
    try { await apiRequest("/api/put", { store: "foodLibrary", value }); await onChanged(); setEditing(undefined); }
    catch (error) { setError(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError("");
    try { await apiRequest("/api/delete", { store: "foodLibrary", id: deleting.id }); await onChanged(); setDeleting(null); }
    catch (error) { setError(error instanceof Error ? error.message : "删除失败"); }
    finally { setBusy(false); }
  }
  return <section className="food-library-section">
    <div className="section-title history-record-title"><div><p>食品数据库</p><h2>每 100 g 营养概览</h2></div><button onClick={() => { setError(""); setEditing(null); }}>＋ 新增食品</button></div>
    <p>从带有有效克重的饮食记录自动换算；修改食品库只影响之后的快捷添加。</p>
    <form className="library-toolbar" onSubmit={event => { event.preventDefault(); setQuery(draft); pagination.setPage(1); }}>
      <label>搜索食品<input value={draft} onChange={event => setDraft(event.target.value)} placeholder="名称或备注" /></label><button>搜索</button>
      <label>排序方式<select value={sort} onChange={event => { setSort(event.target.value); pagination.setPage(1); }}><option value="name">字母 / 汉字拼音</option><option value="createdAt">初次记录时间</option><option value="updatedAt">最近修改时间</option><option value="calories">每百克热量</option><option value="protein">每百克蛋白质</option></select></label>
      <label>顺序<select value={direction} onChange={event => { setDirection(event.target.value); pagination.setPage(1); }}><option value="asc">正序（从小到大）</option><option value="desc">倒序（从大到小）</option></select></label>
    </form>
    <div className="library-cards">{pagination.pageItems.map(food => <article className="library-card" key={food.id}>
      <div className="section-title"><h3>{food.name}</h3><div className="library-actions"><button onClick={() => { setError(""); setEditing(food); }}>修改</button><button onClick={() => { setError(""); setDeleting(food); }}>删除</button></div></div>
      <p>默认份量：<strong>{food.defaultServingGrams||100} g</strong> · {food.servingBasis||"可手动修改"}</p><p><strong>{Number(food.calories).toFixed(1)} kcal</strong> · 蛋白质 {Number(food.protein).toFixed(2)} g · 碳水 {Number(food.carbs).toFixed(2)} g · 脂肪 {Number(food.fat).toFixed(2)} g</p>
      <div className="library-times"><span>初次记录：{new Date(food.createdAt).toLocaleString("zh-CN")}</span><span>最近修改：{new Date(food.updatedAt).toLocaleString("zh-CN")}</span></div>
      {food.note && <p>{food.note}</p>}<details><summary>全部营养素 / 100 g</summary><LibraryNutrients food={food} /></details>
    </article>)}</div>
    {!filtered.length && <Empty text={query ? "没有搜索结果" : "食品库暂无记录"} hint="可新增食品，或记录包含有效克重的饮食" />}
    <PaginationControls totalItems={filtered.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
    {editing !== undefined && <div className="modal-backdrop"><form className="modal" role="dialog" aria-modal="true" aria-labelledby="library-edit-title" onSubmit={save}>
      <div className="modal-head"><h2 id="library-edit-title">{editing ? "修改食品" : "新增食品"} · 每 100 g</h2><button type="button" disabled={busy} onClick={() => setEditing(undefined)} aria-label="关闭">×</button></div>
      <label>食品名称<input name="name" autoFocus required defaultValue={editing?.name || ""} /></label><label>默认份量（克）<input name="defaultServingGrams" type="number" min="0.01" step="any" required defaultValue={editing?.defaultServingGrams||100}/></label>
      <div className="nutrient-inputs">{nutrientLabels.map(([key, label, unit]) => <label key={key}>{label}（{unit}）<input name={key} type="number" min="0" step="any" defaultValue={editing?.reportedNutrients&&!editing.reportedNutrients.includes(key)?"":editing?.[key] ?? 0} placeholder="未报告" /></label>)}</div>
      <label>备注<input name="note" defaultValue={editing?.note || ""} /></label>{error && <p role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" disabled={busy} onClick={() => setEditing(undefined)}>取消</button><button className="primary" disabled={busy}>{busy ? "保存中…" : "保存食品"}</button></div>
    </form></div>}
    {deleting && <div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="library-delete-title"><h2 id="library-delete-title">删除 {deleting.name}？</h2><p>已有饮食记录会保留。删除状态会同步到其他设备，旧饮食记录不会自动重新生成这项食品。</p>{error && <p role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="primary" disabled={busy} onClick={remove}>{busy ? "删除中…" : "确认删除"}</button></div></section></div>}
  </section>;
}
