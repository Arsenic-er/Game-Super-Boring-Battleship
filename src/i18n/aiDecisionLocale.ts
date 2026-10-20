import { SUPPORTED_GAME_LOCALES, type GameLocale } from "./gameLocale";

type TranslationRow = readonly [string, string, string, string, string, string, string];
// Dedicated keyed diagnostics: never reverse-translate Chinese DOM strings.
export const AI_DECISION_MESSAGES = {
  navigation: ["导航（上次规划）", "導航（上次規劃）", "Navigation (last plan)", "航行（前回の計画）", "Navegación (último plan)", "Navigation (letzte Planung)", "Навигация (последний план)"],
  cruising: ["常规导航", "常規導航", "Regular navigation", "通常航法", "Navegación normal", "Reguläre Navigation", "Обычная навигация"],
  reversing: ["倒航恢复", "倒航恢復", "Reversing to recover", "後進で復帰", "Recuperación en reversa", "Rückwärts freifahren", "Выход задним ходом"],
  reorienting: ["转向恢复", "轉向恢復", "Reorienting", "針路を修正中", "Reorientando", "Neu ausrichten", "Смена курса"],
  corridor: ["前方通道", "前方通道", "Forward corridor", "前方の通路", "Paso frontal", "Fahrweg voraus", "Проход впереди"],
  clear: ["畅通", "暢通", "Clear", "通行可", "Libre", "Frei", "Свободен"],
  blocked: ["受阻", "受阻", "Blocked", "通行不可", "Bloqueado", "Blockiert", "Перекрыт"],
  committed: ["锁定出口航向", "鎖定出口航向", "Exit heading held", "脱出針路を保持", "Rumbo de salida fijado", "Ausfahrtskurs gehalten", "Курс выхода удерживается"],
  yes: ["是", "是", "Yes", "はい", "Sí", "Ja", "Да"],
  no: ["否", "否", "No", "いいえ", "No", "Nein", "Нет"],
  throttle: ["车钟上限", "車鐘上限", "Throttle limit", "機関出力上限", "Límite de máquina", "Maschinenlimit", "Лимит хода"],
  intent: ["主炮意图（非射击结果）", "主炮意圖（非射擊結果）", "Main-gun intent (not a firing result)", "主砲の意図（発射結果ではない）", "Intención de artillería (no es un resultado)", "Hauptgeschützabsicht (kein Schussergebnis)", "Намерение ГК (не результат стрельбы)"],
  requested: ["请求开火", "請求開火", "Fire requested", "射撃を要求", "Fuego solicitado", "Feuer angefordert", "Огонь запрошен"],
  held: ["未请求开火", "未請求開火", "No fire request", "射撃要求なし", "Sin solicitud de fuego", "Kein Feuer angefordert", "Нет запроса огня"],
  restrictions: ["限制", "限制", "Restrictions", "制限", "Restricciones", "Einschränkungen", "Ограничения"],
  none: ["无", "無", "None", "なし", "Ninguna", "Keine", "Нет"],
  mounts: ["决策时炮座", "決策時炮座", "Mounts at decision time", "判断時の砲塔", "Montajes al decidir", "Lafetten bei Entscheidung", "Установки в момент решения"],
  ready: ["就绪", "就緒", "Ready", "準備完了", "Listos", "Bereit", "Готовы"],
  operational: ["可用", "可用", "Operational", "稼働可能", "Operativos", "Funktionsfähig", "Исправны"],
  reload: ["最早装填", "最早裝填", "Earliest reload", "最短装填時間", "Recarga más próxima", "Früheste Ladezeit", "Ближайшая перезарядка"],
  unknown: ["未知", "未知", "Unknown", "不明", "Desconocido", "Unbekannt", "Неизвестно"],
  unbounded: ["无有限估计", "無有限估計", "No finite estimate", "有限の推定値なし", "Sin estimación finita", "Keine endliche Schätzung", "Нет конечной оценки"],
  "torpedo-selected": ["已选择鱼雷", "已選擇魚雷", "Torpedoes selected", "魚雷を選択中", "Torpedos seleccionados", "Torpedos ausgewählt", "Выбраны торпеды"],
  withdrawal: ["受伤撤退隐蔽", "受傷撤退隱蔽", "Concealment during withdrawal", "損傷撤退中の隠蔽", "Ocultación durante la retirada", "Tarnung beim Rückzug", "Скрытность при отходе"],
  smoke: ["烟幕抑制", "煙幕抑制", "Smoke suppression", "煙幕による射撃抑制", "Supresión por humo", "Feuerpause wegen Rauch", "Огонь сдержан из-за дыма"],
  cover: ["寻找掩体", "尋找掩體", "Seeking cover", "遮蔽物へ退避", "Buscando cobertura", "Deckung suchen", "Поиск укрытия"],
  "no-track": ["无稳定本地跟踪", "無穩定本地追蹤", "No stable local track", "安定した自艦追跡なし", "Sin seguimiento local estable", "Keine stabile lokale Verfolgung", "Нет устойчивого локального сопровождения"],
  "out-of-range": ["超出射程范围", "超出射程範圍", "Outside firing range", "射程範囲外", "Fuera del alcance de tiro", "Außerhalb des Schussbereichs", "Вне диапазона стрельбы"],
  arc: ["炮座射界受限", "炮座射界受限", "Mount firing arcs blocked", "砲塔の射界制限", "Arcos de tiro bloqueados", "Schusswinkel blockiert", "Секторы огня перекрыты"],
  "salvo-window": ["等待齐射窗口", "等待齊射窗口", "Waiting for salvo window", "斉射タイミング待ち", "Esperando ventana de salva", "Warten auf Salvenfenster", "Ожидание окна залпа"],
  "no-guns": ["未安装主炮", "未安裝主炮", "No main guns installed", "主砲未装備", "Sin artillería principal", "Keine Hauptgeschütze installiert", "Главный калибр не установлен"],
  "gun-disabled": ["主炮失效", "主炮失效", "Main guns disabled", "主砲使用不能", "Artillería principal inutilizada", "Hauptgeschütze ausgefallen", "Главный калибр выведен из строя"],
  reloading: ["装填中", "裝填中", "Reloading", "装填中", "Recargando", "Lädt nach", "Перезарядка"],
} as const satisfies Record<string, TranslationRow>;

export type AiDecisionMessageKey = keyof typeof AI_DECISION_MESSAGES;
export function aiDecisionText(locale: GameLocale, key: AiDecisionMessageKey): string {
  return AI_DECISION_MESSAGES[key][SUPPORTED_GAME_LOCALES.indexOf(locale)];
}
