from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


HOST = "127.0.0.1"
PORT = int(os.environ.get("DAILY_INTAKE_PORT", "3031"))
ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DAILY_INTAKE_DATA_DIR", str(ROOT / "data")))
DB_PATH = DATA_DIR / "food_manage.sqlite"
TOKEN_PATH = DATA_DIR / "api_token.txt"
STORES = ("foods", "exercises", "profile", "weights")
ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
}

DEFAULT_SYSTEM_PROMPT = """你是一个严谨的私人饮食、营养和运动记录助手。你的任务是理解用户的自然语言，把明确发生的饮食、体重和运动转成可写入数据库的结构化记录。

规则：
1. 当前日期由系统上下文提供；正确处理“今天、昨天、上周”等相对日期。
2. 食物优先采用包装、品牌官网或可靠食物成分资料。联网可用时，对品牌食品和不熟悉的食物先检索。
3. 用户没有给重量时，可以采用常见份量估算，但必须在 note 中写明份量、依据和不确定性。
4. 每条食物必须包含 calories、protein、carbs、fat、fiber、sugar、sucrose、addedSugar、sodium、potassium、calcium、iron、magnesium、zinc、vitaminA、vitaminC、vitaminD、vitaminE、vitaminB1、vitaminB2、vitaminB6、vitaminB12、folate。未知值填 0，不得省略。
5. 运动优先采用用户的手表或器械热量；只有用户未提供时才根据最近体重、身高、步数、时长和强度估算，并在 note 说明。
6. 不要把计划、假设或提问当成已发生记录。信息不足且会显著改变结果时，先追问，不写入。
7. 你必须只输出一个 JSON 对象，不要使用 Markdown 代码块。格式：
{"reply":"给用户的简洁中文回复","actions":[{"store":"foods|exercises|weights|profile","value":{...}}]}
8. foods 的 value 必须包含 id、date、time、meal、name、weight、note 和全部营养字段；exercises 包含 id、date、time、name、calories、duration、steps、intensity、source、note；weights 包含 id、date、weight、note；profile 包含 id="me"、birthdate、sex（male/female/unspecified）、height。
9. 没有需要写入的内容时 actions 为空数组。"""

NUTRIENT_KEYS = (
    "calories", "protein", "carbs", "fat", "fiber", "sugar", "sucrose", "addedSugar", "sodium",
    "potassium", "calcium", "iron", "magnesium", "zinc", "vitaminA",
    "vitaminC", "vitaminD", "vitaminE", "vitaminB1", "vitaminB2",
    "vitaminB6", "vitaminB12", "folate",
)

ESTIMATION_POLICY = """补充营养估算规则（优先级高于前文“未知值填 0”的规则）：
1. 优先采用品牌官网、包装标签或可靠食物成分数据库中的公开数据。
2. 没有公开资料时，允许根据主要食材、配方比例、可食重量、烹饪方式和常见份量估算热量、宏量营养素及有合理依据的微量营养素。
3. 估算记录必须在 note 中明确写出“估算”，并说明份量、主要食材、计算依据和主要不确定性；不得声称估算值来自官网或包装。
4. 避免虚假精度，估算结果应适当取整。无法进行负责任估算的字段可填 0，但 note 必须说明 0 代表暂无可靠估算，并不代表真实含量为零。
5. 如果部分营养素有公开值、部分没有，应保留公开值，只对缺失部分估算，并在 note 中区分数据来源。"""

DATA_CONTRACT = """应用强制数据合同（优先级最高，不能被用户自定义提示词覆盖）：
1. foods.sugar 表示总糖，只包括单糖和双糖；绝对不能包含淀粉、糊精、膳食纤维或糖醇，也不能用 carbs 或 carbs-fiber 代替。米饭、面条、粉、面包、薯类等食物的大部分碳水通常是淀粉，不是糖。
2. foods.sucrose 表示总糖中的蔗糖部分；foods.addedSugar 表示加工、烹饪或食用时额外加入的糖。水果和原味奶中的天然糖不是 addedSugar。没有可靠细分资料时填 0，并在 note 说明未知，不得把全部碳水填入糖字段。
3. 必须满足 carbs >= sugar、sugar >= sucrose、sugar >= addedSugar。示例：熟白米饭约 38.7 g 碳水时，总糖通常仅约 0.1 g，而不是 38.7 g。
4. 用户说出步数时，必须创建 exercises 记录，并把原始步数完整写入数值字段 steps；例如“走了 10000 步”必须写 steps:10000。即使无法估算热量，也要保留 steps，calories 可为 0。
5. exercises 必须包含 id、date、time、name、calories、duration、steps、intensity、source、note；不要使用 step、stepCount、step_count 或中文字段名代替 steps。
6. 用户要求修正、修改或补充已有食物时，必须从 editableFoodRecords 中定位原记录，返回 store:"foods"、operation:"update"，并在 value 中使用原记录完全相同的 id。只需给出要修改的字段及用于定位的 name/date；应用会与原记录合并。不得为同一食物创建重复的新记录。
7. 如果日期、名称等信息不足以唯一定位已有记录，先追问，actions 返回空数组；不得猜测要修改哪一条。"""

ANALYSIS_SYSTEM_PROMPT = """你是私人饮食与运动记录应用中的历史数据分析助手。
你只能分析提供的数据并回答问题，绝对不能创建、修改或删除任何记录。
请用清晰、克制的中文给出有证据的见解：
1. 先说明观察覆盖的日期和有记录的天数，区分“没有记录”和“摄入为零”。
2. 优先分析趋势、稳定性、热量与蛋白质、膳食纤维、钠、活动量和体重变化，并引用关键数值和日期。
3. 数据不足时明确说不足，不要过度推断；营养字段为 0 时可能代表缺少可靠资料。
4. 建议应具体、温和、可执行，不作疾病诊断，不使用恐吓性措辞。
5. 默认采用“结论—证据—下一步”的简洁结构；可以使用短标题和项目符号，但不要使用 Markdown 加粗标记。"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS records (
            store TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (store, id)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            range_days INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.commit()
    return connection


def api_token() -> str:
    DATA_DIR.mkdir(exist_ok=True)
    if not TOKEN_PATH.exists():
        TOKEN_PATH.write_text(secrets.token_urlsafe(32), encoding="utf-8")
    return TOKEN_PATH.read_text(encoding="utf-8").strip()


def get_setting(connection: sqlite3.Connection, key: str, default: str = "") -> str:
    row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set_setting(connection: sqlite3.Connection, key: str, value: object) -> None:
    connection.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def upsert(connection: sqlite3.Connection, store: str, value: dict) -> None:
    if store not in STORES or not isinstance(value, dict) or not value.get("id"):
        raise ValueError("Invalid record")
    connection.execute(
        """
        INSERT INTO records (store, id, data, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
        """,
        (store, str(value["id"]), json.dumps(value, ensure_ascii=False, separators=(",", ":")), now_iso()),
    )


def all_data(connection: sqlite3.Connection) -> dict:
    result = {store: [] for store in STORES}
    rows = connection.execute("SELECT store, data FROM records ORDER BY updated_at").fetchall()
    for store, data in rows:
        result[store].append(json.loads(data))
    return result


def merge_existing_action(connection: sqlite3.Connection, action: dict) -> dict:
    if not isinstance(action, dict):
        return action
    store = str(action.get("store", ""))
    value = dict(action.get("value") or {})
    operation = str(action.get("operation", "")).lower()
    record_id = str(value.get("id", ""))
    existing = None
    if store in STORES and record_id:
        row = connection.execute(
            "SELECT data FROM records WHERE store = ? AND id = ?",
            (store, record_id),
        ).fetchone()
        if row:
            existing = json.loads(row[0])
    elif store == "foods" and operation in ("update", "patch", "modify"):
        candidates = [
            item for item in all_data(connection)["foods"]
            if (not value.get("name") or item.get("name") == value.get("name"))
            and (not value.get("date") or item.get("date") == value.get("date"))
            and (not value.get("time") or item.get("time") == value.get("time"))
        ]
        if len(candidates) == 1:
            existing = candidates[0]
            value["id"] = existing["id"]
        elif len(candidates) > 1:
            raise ValueError("无法唯一定位要修改的食物记录，请提供日期、餐次或时间")
    if existing:
        value = {**existing, **value, "id": existing["id"]}
    return {**action, "store": store, "value": value}


def normalize_action(action: dict) -> tuple[str, dict]:
    if not isinstance(action, dict):
        raise ValueError("Action must be an object")
    store = str(action.get("store", ""))
    value = action.get("value")
    if store not in STORES or not isinstance(value, dict):
        raise ValueError("Unsupported action")
    if store == "profile":
        value["id"] = "me"
    elif store == "weights":
        value["id"] = str(value.get("date") or value.get("id") or "")
    else:
        value["id"] = str(value.get("id") or f"llm-{secrets.token_hex(8)}")
    if not value["id"]:
        raise ValueError("Record id is required")
    if store == "foods":
        value["sugar"] = value.get("sugar", value.get("totalSugar", value.get("total_sugar", 0)))
        value["sucrose"] = value.get("sucrose", value.get("蔗糖", 0))
        value["addedSugar"] = value.get("addedSugar", value.get("added_sugar", value.get("添加糖", 0)))
        for key in NUTRIENT_KEYS:
            try:
                value[key] = float(value.get(key, 0) or 0)
            except (TypeError, ValueError):
                value[key] = 0
        value["sugar"] = max(value["sugar"], value["sucrose"], value["addedSugar"])
        value["carbs"] = max(value["carbs"], value["sugar"])
        value["sucrose"] = min(value["sucrose"], value["sugar"])
        value["addedSugar"] = min(value["addedSugar"], value["sugar"])
        value.setdefault("date", datetime.now().date().isoformat())
        value.setdefault("time", "12:00")
        value.setdefault("meal", "未注明")
        value.setdefault("name", "未命名食物")
        value.setdefault("weight", 0)
        value.setdefault("note", "由 LLM 录入")
    elif store == "exercises":
        metrics = value.get("metrics") if isinstance(value.get("metrics"), dict) else {}
        value["steps"] = value.get(
            "steps",
            value.get("stepCount", value.get("step_count", value.get("step", value.get("步数", metrics.get("steps", 0))))),
        )
        for key in ("calories", "duration", "steps"):
            try:
                value[key] = float(value.get(key, 0) or 0)
            except (TypeError, ValueError):
                value[key] = 0
        value.setdefault("date", datetime.now().date().isoformat())
        value.setdefault("time", "20:00")
        value.setdefault("name", "运动")
        value.setdefault("intensity", "中等强度")
        value.setdefault("source", "LLM 估算")
        value.setdefault("note", "由 LLM 录入")
    return store, value


def reconcile_estimated_exercise(value: dict, latest_weight: dict) -> None:
    """Keep an LLM's stated MET formula consistent with the stored calories."""
    source = str(value.get("source", "")).lower()
    note = str(value.get("note", ""))
    if "estimated" not in source and "估算" not in source:
        return
    match = re.search(r"\bMET[^0-9]{0,6}([0-9]+(?:\.[0-9]+)?)", note, re.IGNORECASE)
    if not match:
        return
    try:
        met = float(match.group(1))
        weight = float(latest_weight.get("weight", 0) or 0)
        duration = float(value.get("duration", 0) or 0)
        calories = float(value.get("calories", 0) or 0)
    except (TypeError, ValueError):
        return
    if not (0.5 <= met <= 25 and weight > 0 and duration > 0):
        return
    expected = met * weight * duration / 60
    if calories <= 0 or abs(calories - expected) / expected > 0.03:
        value["calories"] = round(expected)


def parse_model_json(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = text.replace("```json", "", 1).replace("```", "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("模型没有返回结构化 JSON")
    result = json.loads(text[start:end + 1])
    if not isinstance(result, dict):
        raise ValueError("模型返回格式无效")
    return result


def llm_completion(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    enable_search: bool,
    temperature: float = 0.2,
) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "enable_search": enable_search,
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ValueError(f"模型接口返回 {error.code}：{detail[:300]}") from error
    except urllib.error.URLError as error:
        raise ValueError(f"无法连接模型接口：{error.reason}") from error
    return str(raw["choices"][0]["message"]["content"]).strip()


def call_llm(connection: sqlite3.Connection, user_message: str, selected_date: str = "") -> dict:
    base_url = get_setting(connection, "llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
    api_key = get_setting(connection, "llm_api_key")
    model = get_setting(connection, "llm_model", "qwen-plus")
    system_prompt = get_setting(connection, "llm_system_prompt", DEFAULT_SYSTEM_PROMPT)
    enable_search = get_setting(connection, "llm_enable_search", "true").lower() == "true"
    if not api_key:
        raise ValueError("请先配置 LLM API Key")

    data = all_data(connection)
    profile = data["profile"][0] if data["profile"] else {}
    weights = sorted(data["weights"], key=lambda item: item.get("date", ""))
    latest_weight = weights[-1] if weights else {}
    context = {
        "currentDate": datetime.now().date().isoformat(),
        "currentViewDate": selected_date,
        "profile": profile,
        "latestWeight": latest_weight,
        "editableFoodRecords": sorted(
            data["foods"],
            key=lambda item: (str(item.get("date", "")), str(item.get("time", ""))),
        )[-50:],
    }
    history_rows = connection.execute(
        "SELECT role, content FROM chat_messages ORDER BY id DESC LIMIT 12"
    ).fetchall()[::-1]
    messages = [
        {"role": "system", "content": f"{system_prompt}\n\n{ESTIMATION_POLICY}\n\n{DATA_CONTRACT}"},
        {"role": "system", "content": "本机用户上下文：" + json.dumps(context, ensure_ascii=False)},
        *[{"role": role, "content": content} for role, content in history_rows],
        {"role": "user", "content": user_message},
    ]
    content = llm_completion(base_url, api_key, model, messages, enable_search)
    model_result = parse_model_json(content)
    actions = model_result.get("actions", [])
    if not isinstance(actions, list):
        raise ValueError("模型返回的 actions 不是数组")
    normalized = [normalize_action(merge_existing_action(connection, action)) for action in actions]
    for store, value in normalized:
        if store == "exercises":
            reconcile_estimated_exercise(value, latest_weight)
        upsert(connection, store, value)
    reply = str(model_result.get("reply") or f"已处理 {len(normalized)} 条记录")
    connection.execute(
        "INSERT INTO chat_messages (role, content, created_at) VALUES (?, ?, ?)",
        ("user", user_message, now_iso()),
    )
    connection.execute(
        "INSERT INTO chat_messages (role, content, created_at) VALUES (?, ?, ?)",
        ("assistant", reply, now_iso()),
    )
    connection.commit()
    return {"reply": reply, "actions": [{"store": store, "value": value} for store, value in normalized]}


def build_analysis_context(connection: sqlite3.Connection, range_days: int) -> dict:
    data = all_data(connection)
    all_dates = [
        str(item.get("date", ""))
        for store in ("foods", "exercises", "weights")
        for item in data[store]
        if item.get("date")
    ]
    latest_date = max(all_dates, default=datetime.now().date().isoformat())
    cutoff = ""
    if range_days > 0:
        cutoff = (datetime.fromisoformat(latest_date).date() - timedelta(days=range_days - 1)).isoformat()

    foods = [item for item in data["foods"] if not cutoff or str(item.get("date", "")) >= cutoff]
    exercises = [item for item in data["exercises"] if not cutoff or str(item.get("date", "")) >= cutoff]
    weights = [item for item in data["weights"] if not cutoff or str(item.get("date", "")) >= cutoff]
    dates = sorted({str(item.get("date")) for item in foods + exercises if item.get("date")})
    daily = []
    for date in dates:
        day_foods = [item for item in foods if item.get("date") == date]
        day_exercises = [item for item in exercises if item.get("date") == date]
        sums = {
            key: round(sum(float(item.get(key, 0) or 0) for item in day_foods), 1)
            for key in ("calories", "protein", "carbs", "fat", "fiber", "sugar", "sucrose", "addedSugar", "sodium", "potassium", "calcium", "iron")
        }
        burned = round(sum(float(item.get("calories", 0) or 0) for item in day_exercises), 1)
        daily.append({
            "date": date,
            "foodCount": len(day_foods),
            "foods": [str(item.get("name", "")) for item in day_foods],
            **sums,
            "burned": burned,
            "netCalories": round(sums["calories"] - burned, 1),
            "steps": round(sum(float(item.get("steps", 0) or 0) for item in day_exercises)),
            "exerciseMinutes": round(sum(float(item.get("duration", 0) or 0) for item in day_exercises)),
        })
    return {
        "requestedRangeDays": range_days,
        "rangeStart": cutoff or (min(all_dates) if all_dates else None),
        "rangeEnd": latest_date,
        "recordedDays": len(daily),
        "profile": data["profile"][0] if data["profile"] else {},
        "weights": sorted(weights, key=lambda item: str(item.get("date", ""))),
        "daily": daily[-365:],
        "dataNotes": [
            "只有出现饮食或运动记录的日期才进入 daily；日期缺失不能视为零摄入。",
            "营养值为 0 可能代表食物资料未公开，而不一定代表真实含量为零。",
        ],
    }


def analyze_history(connection: sqlite3.Connection, question: str, range_days: int) -> str:
    base_url = get_setting(connection, "llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
    api_key = get_setting(connection, "llm_api_key")
    model = get_setting(connection, "llm_model", "qwen-plus")
    if not api_key:
        raise ValueError("请先配置 LLM API Key")
    context = build_analysis_context(connection, range_days)
    history_rows = connection.execute(
        "SELECT role, content FROM analysis_messages WHERE range_days = ? ORDER BY id DESC LIMIT 8",
        (range_days,),
    ).fetchall()[::-1]
    messages = [
        {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
        {"role": "system", "content": "历史数据（JSON）：" + json.dumps(context, ensure_ascii=False)},
        *[{"role": role, "content": content} for role, content in history_rows],
        {"role": "user", "content": question},
    ]
    reply = llm_completion(base_url, api_key, model, messages, False, 0.15)
    connection.execute(
        "INSERT INTO analysis_messages (role, content, range_days, created_at) VALUES (?, ?, ?, ?)",
        ("user", question, range_days, now_iso()),
    )
    connection.execute(
        "INSERT INTO analysis_messages (role, content, range_days, created_at) VALUES (?, ?, ?, ?)",
        ("assistant", reply, range_days, now_iso()),
    )
    connection.commit()
    return reply


class Handler(BaseHTTPRequestHandler):
    server_version = "DailyIntakeLocal/2.0"

    def log_message(self, format: str, *args: object) -> None:
        return

    def _headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _json(self, value: object, status: int = 200) -> None:
        self._headers(status)
        self.wfile.write(json.dumps(value, ensure_ascii=False).encode("utf-8"))

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8")) if raw else {}

    def _is_internal(self) -> bool:
        return self.headers.get("Origin") in ALLOWED_ORIGINS

    def _has_token(self) -> bool:
        return self.headers.get("Authorization", "") == f"Bearer {api_token()}"

    def do_OPTIONS(self) -> None:
        if not self._is_internal():
            self._json({"error": "Origin not allowed"}, 403)
            return
        self._headers(204)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._json({"ok": True, "database": str(DB_PATH)})
            return
        if path == "/api/v1/schema":
            if not self._has_token():
                self._json({"error": "Unauthorized"}, 401)
                return
            self._json({"stores": STORES, "actionFormat": {"store": "foods|exercises|profile|weights", "value": {"id": "string"}}})
            return
        if not self._is_internal():
            self._json({"error": "Origin not allowed"}, 403)
            return
        with connect() as connection:
            if path == "/api/data":
                self._json(all_data(connection))
            elif path == "/api/llm/config":
                key = get_setting(connection, "llm_api_key")
                self._json({
                    "baseUrl": get_setting(connection, "llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
                    "model": get_setting(connection, "llm_model", "qwen-plus"),
                    "systemPrompt": get_setting(connection, "llm_system_prompt", DEFAULT_SYSTEM_PROMPT),
                    "enableSearch": get_setting(connection, "llm_enable_search", "true").lower() == "true",
                    "configured": bool(key),
                    "externalEndpoint": f"http://{HOST}:{PORT}/api/v1/import",
                    "externalToken": api_token(),
                })
            elif path == "/api/chat/history":
                rows = connection.execute(
                    "SELECT id, role, content, created_at FROM chat_messages ORDER BY id DESC LIMIT 30"
                ).fetchall()[::-1]
                self._json([{"id": row[0], "role": row[1], "content": row[2], "createdAt": row[3]} for row in rows])
            elif path == "/api/analysis/history":
                rows = connection.execute(
                    "SELECT id, role, content, range_days, created_at FROM analysis_messages ORDER BY id DESC LIMIT 30"
                ).fetchall()[::-1]
                self._json([
                    {"id": row[0], "role": row[1], "content": row[2], "rangeDays": row[3], "createdAt": row[4]}
                    for row in rows
                ])
            else:
                self._json({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        external = path == "/api/v1/import"
        if external:
            if not self._has_token():
                self._json({"error": "Unauthorized"}, 401)
                return
        elif not self._is_internal():
            self._json({"error": "Origin not allowed"}, 403)
            return
        try:
            body = self._body()
            with connect() as connection:
                if path == "/api/put":
                    upsert(connection, str(body.get("store", "")), body.get("value"))
                elif path == "/api/delete":
                    store, record_id = str(body.get("store", "")), str(body.get("id", ""))
                    if store not in STORES or not record_id:
                        raise ValueError("Invalid record")
                    connection.execute("DELETE FROM records WHERE store = ? AND id = ?", (store, record_id))
                elif path in ("/api/import", "/api/v1/import"):
                    if isinstance(body.get("actions"), list):
                        for action in body["actions"]:
                            store, value = normalize_action(merge_existing_action(connection, action))
                            upsert(connection, store, value)
                    else:
                        for store in STORES:
                            for value in body.get(store, []) or []:
                                if store in ("foods", "exercises"):
                                    normalized_store, normalized_value = normalize_action({"store": store, "value": value})
                                    upsert(connection, normalized_store, normalized_value)
                                else:
                                    upsert(connection, store, value)
                elif path == "/api/llm/config":
                    set_setting(connection, "llm_base_url", body.get("baseUrl", ""))
                    set_setting(connection, "llm_model", body.get("model", "qwen-plus"))
                    set_setting(connection, "llm_system_prompt", body.get("systemPrompt", DEFAULT_SYSTEM_PROMPT))
                    set_setting(connection, "llm_enable_search", str(bool(body.get("enableSearch", False))).lower())
                    if body.get("apiKey"):
                        set_setting(connection, "llm_api_key", body["apiKey"])
                elif path == "/api/llm/chat":
                    message = str(body.get("message", "")).strip()
                    if not message:
                        raise ValueError("消息不能为空")
                    result = call_llm(connection, message, str(body.get("selectedDate", "")))
                    self._json(result)
                    return
                elif path == "/api/llm/analyze":
                    question = str(body.get("question", "")).strip()
                    range_days = int(body.get("rangeDays", 30) or 0)
                    if not question:
                        raise ValueError("问题不能为空")
                    if range_days not in (0, 7, 30, 90):
                        raise ValueError("不支持的时间范围")
                    reply = analyze_history(connection, question, range_days)
                    self._json({"reply": reply, "rangeDays": range_days, "readOnly": True})
                    return
                elif path == "/api/chat/clear":
                    connection.execute("DELETE FROM chat_messages")
                elif path == "/api/analysis/clear":
                    connection.execute("DELETE FROM analysis_messages")
                else:
                    self._json({"error": "Not found"}, 404)
                    return
                connection.commit()
            self._json({"ok": True})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self._json({"error": str(error)}, 400)
        except Exception as error:
            self._json({"error": str(error)}, 500)


if __name__ == "__main__":
    connect().close()
    api_token()
    print(f"Daily Intake shared database: http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
