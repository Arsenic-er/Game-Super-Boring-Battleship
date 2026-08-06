export const SUPPORTED_GAME_LOCALES = [
  "zh-CN", "zh-TW", "en-US", "ja-JP", "es-ES", "de-DE", "ru-RU",
] as const;

export type GameLocale = typeof SUPPORTED_GAME_LOCALES[number];

export const DEFAULT_GAME_LOCALE: GameLocale = "zh-CN";

export const GAME_LOCALE_OPTIONS: readonly { value: GameLocale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en-US", label: "English" },
  { value: "ja-JP", label: "日本語" },
  { value: "es-ES", label: "Español" },
  { value: "de-DE", label: "Deutsch" },
  { value: "ru-RU", label: "Русский" },
];

interface LocaleMessageRow {
  source: string;
  "zh-TW": string;
  "en-US": string;
  "ja-JP": string;
  "es-ES": string;
  "de-DE": string;
  "ru-RU": string;
}

// Source text remains Simplified Chinese while stable game data continues to use IDs.
// Longest phrases are translated first so short naval terms can also localize dynamic text.
export const GAME_LOCALE_MESSAGES: readonly LocaleMessageRow[] = [
  { source: "从船坞保存舰船方案，再选择舰队规模、天气与旗舰出击；海试仍使用当前船坞配装。", "zh-TW": "先在船塢儲存艦艇方案，再選擇艦隊規模、天氣與旗艦出擊；海試仍使用目前船塢配裝。", "en-US": "Save ship builds in the dockyard, then choose fleet size, weather, and flagship. Sea trials still use the current dockyard loadout.", "ja-JP": "造船所で艦艇構成を保存し、艦隊規模・天候・旗艦を選んで出撃します。海上公試は現在の造船所装備を使用します。", "es-ES": "Guarda configuraciones en el astillero y elige tamaño de flota, clima y buque insignia. Las pruebas usan el equipamiento actual.", "de-DE": "Speichere Schiffskonfigurationen in der Werft und wähle Flottengröße, Wetter und Flaggschiff. Seeerprobungen nutzen die aktuelle Werftausrüstung.", "ru-RU": "Сохраните комплектации на верфи, затем выберите размер флота, погоду и флагман. Испытания используют текущую комплектацию верфи." },
  { source: "选择规模、天气与已保存旗舰后开始", "zh-TW": "選擇規模、天氣與已儲存旗艦後開始", "en-US": "Choose size, weather, and a saved flagship", "ja-JP": "規模・天候・保存済み旗艦を選択", "es-ES": "Elige tamaño, clima y un buque guardado", "de-DE": "Größe, Wetter und gespeichertes Flaggschiff wählen", "ru-RU": "Выберите размер, погоду и сохранённый флагман" },
  { source: "天气会同时影响天空、海况与双方光学发现距离。", "zh-TW": "天氣會同時影響天空、海況與雙方光學發現距離。", "en-US": "Weather affects the sky, sea state, and optical spotting range for both teams.", "ja-JP": "天候は空、海況、双方の光学発見距離に影響します。", "es-ES": "El clima afecta al cielo, al estado del mar y al alcance de detección óptica de ambos equipos.", "de-DE": "Das Wetter beeinflusst Himmel, Seegang und optische Sichtweite beider Teams.", "ru-RU": "Погода влияет на небо, состояние моря и дальность оптического обнаружения обеих сторон." },
  { source: "双方舰种数量完全对称。真正航母舰体尚未实装，因此不会用其他舰型冒充。", "zh-TW": "雙方艦種數量完全對稱。真正的航空母艦艦體尚未實裝，因此不會以其他艦型冒充。", "en-US": "Both teams use identical class counts. A true carrier hull is not implemented yet, so no other ship will impersonate one.", "ja-JP": "両軍の艦種数は完全に対称です。空母船体は未実装のため、他艦種で代用しません。", "es-ES": "Ambos equipos usan el mismo número por clase. Aún no hay casco de portaaviones y no se sustituirá por otro buque.", "de-DE": "Beide Teams haben identische Klassenanzahlen. Ein echter Trägerrumpf fehlt noch und wird nicht durch einen anderen Schiffstyp vorgetäuscht.", "ru-RU": "Состав классов у сторон симметричен. Настоящий корпус авианосца ещё не реализован и не подменяется другим кораблём." },
  { source: "单人战斗准备", "zh-TW": "單人戰鬥準備", "en-US": "Single-Battle Setup", "ja-JP": "シングル戦準備", "es-ES": "Preparación de batalla individual", "de-DE": "Einzelgefecht vorbereiten", "ru-RU": "Подготовка одиночного боя" },
  { source: "编成与海况", "zh-TW": "編成與海況", "en-US": "Fleet and Sea Conditions", "ja-JP": "編成と海況", "es-ES": "Flota y estado del mar", "de-DE": "Flotte und Seegang", "ru-RU": "Состав и морские условия" },
  { source: "返回任务", "zh-TW": "返回任務", "en-US": "Back to Mission", "ja-JP": "任務へ戻る", "es-ES": "Volver a la misión", "de-DE": "Zurück zum Auftrag", "ru-RU": "Назад к заданию" },
  { source: "对战规模", "zh-TW": "對戰規模", "en-US": "Battle Size", "ja-JP": "戦闘規模", "es-ES": "Tamaño de batalla", "de-DE": "Gefechtsgröße", "ru-RU": "Размер боя" },
  { source: "选择旗舰方案", "zh-TW": "選擇旗艦方案", "en-US": "Select Flagship Build", "ja-JP": "旗艦構成を選択", "es-ES": "Elegir configuración del buque insignia", "de-DE": "Flaggschiff-Konfiguration wählen", "ru-RU": "Выбрать комплектацию флагмана" },
  { source: "确认编成并开始战斗", "zh-TW": "確認編成並開始戰鬥", "en-US": "Confirm Fleet and Start", "ja-JP": "編成を確定して戦闘開始", "es-ES": "Confirmar flota e iniciar", "de-DE": "Flotte bestätigen und starten", "ru-RU": "Подтвердить состав и начать бой" },
  { source: "保存当前方案", "zh-TW": "儲存目前方案", "en-US": "Save Current Build", "ja-JP": "現在の構成を保存", "es-ES": "Guardar configuración actual", "de-DE": "Aktuelle Konfiguration speichern", "ru-RU": "Сохранить текущую комплектацию" },
  { source: "已保存舰船方案", "zh-TW": "已儲存艦艇方案", "en-US": "Saved Ship Builds", "ja-JP": "保存済み艦艇構成", "es-ES": "Configuraciones guardadas", "de-DE": "Gespeicherte Schiffskonfigurationen", "ru-RU": "Сохранённые комплектации кораблей" },
  { source: "方案名称", "zh-TW": "方案名稱", "en-US": "Build name", "ja-JP": "構成名", "es-ES": "Nombre de configuración", "de-DE": "Konfigurationsname", "ru-RU": "Название комплектации" },
  { source: "方案已保存（本机）", "zh-TW": "方案已儲存（本機）", "en-US": "Build saved locally", "ja-JP": "構成をローカル保存しました", "es-ES": "Configuración guardada localmente", "de-DE": "Konfiguration lokal gespeichert", "ru-RU": "Комплектация сохранена локально" },
  { source: "设为出击舰", "zh-TW": "設為出擊艦", "en-US": "Set for Battle", "ja-JP": "出撃艦に設定", "es-ES": "Usar en batalla", "de-DE": "Für Gefecht wählen", "ru-RU": "Назначить для боя" },
  { source: "以当前配装覆盖", "zh-TW": "以目前配裝覆蓋", "en-US": "Overwrite with Current", "ja-JP": "現在装備で上書き", "es-ES": "Sobrescribir con el actual", "de-DE": "Mit aktueller Ausrüstung überschreiben", "ru-RU": "Перезаписать текущей комплектацией" },
  { source: "双方自动编成", "zh-TW": "雙方自動編成", "en-US": "Automatic Team Composition", "ja-JP": "両軍自動編成", "es-ES": "Composición automática", "de-DE": "Automatische Teamaufstellung", "ru-RU": "Автоматический состав сторон" },
  { source: "舰队航空支援", "zh-TW": "艦隊航空支援", "en-US": "Fleet Air Support", "ja-JP": "艦隊航空支援", "es-ES": "Apoyo aéreo de flota", "de-DE": "Flottenluftunterstützung", "ru-RU": "Воздушная поддержка флота" },
  { source: "真正航母舰体尚未实装，因此不会用其他舰型冒充。", "zh-TW": "真正的航空母艦艦體尚未實裝，因此不會以其他艦型冒充。", "en-US": "A true carrier hull is not implemented yet, so no other ship will impersonate one.", "ja-JP": "空母船体は未実装のため、他艦種で代用しません。", "es-ES": "Aún no hay casco de portaaviones y no se sustituirá por otro buque.", "de-DE": "Ein echter Trägerrumpf fehlt noch und wird nicht durch einen anderen Schiffstyp vorgetäuscht.", "ru-RU": "Настоящий корпус авианосца ещё не реализован и не подменяется другим кораблём." },
  { source: "万里晴空", "zh-TW": "萬里晴空", "en-US": "Cloudless", "ja-JP": "快晴", "es-ES": "Despejado", "de-DE": "Wolkenlos", "ru-RU": "Ясно" },
  { source: "晴间多云", "zh-TW": "晴時多雲", "en-US": "Scattered Clouds", "ja-JP": "晴れ時々曇り", "es-ES": "Nubes dispersas", "de-DE": "Leicht bewölkt", "ru-RU": "Переменная облачность" },
  { source: "海上阵雨", "zh-TW": "海上陣雨", "en-US": "Rain Squall", "ja-JP": "海上のにわか雨", "es-ES": "Chubasco marino", "de-DE": "Regenschauer", "ru-RU": "Морской ливень" },
  { source: "海雾", "zh-TW": "海霧", "en-US": "Sea Fog", "ja-JP": "海霧", "es-ES": "Niebla marina", "de-DE": "Seenebel", "ru-RU": "Морской туман" },
  { source: "阴天", "zh-TW": "陰天", "en-US": "Overcast", "ja-JP": "曇天", "es-ES": "Cubierto", "de-DE": "Bedeckt", "ru-RU": "Пасмурно" },
  { source: "最佳能见度 · 平静海况", "zh-TW": "最佳能見度 · 平靜海況", "en-US": "Best visibility · calm sea", "ja-JP": "最高の視界 · 穏やかな海", "es-ES": "Visibilidad máxima · mar en calma", "de-DE": "Beste Sicht · ruhige See", "ru-RU": "Лучшая видимость · спокойное море" },
  { source: "柔和日照 · 轻微海风", "zh-TW": "柔和日照 · 輕微海風", "en-US": "Soft sunlight · light breeze", "ja-JP": "柔らかな日差し · 微風", "es-ES": "Luz suave · brisa ligera", "de-DE": "Sanftes Licht · leichte Brise", "ru-RU": "Мягкий свет · лёгкий бриз" },
  { source: "云层压低 · 中等海况", "zh-TW": "低垂雲層 · 中等海況", "en-US": "Low cloud · moderate sea", "ja-JP": "低い雲 · 中程度の海況", "es-ES": "Nubes bajas · mar moderada", "de-DE": "Tiefe Wolken · mäßiger Seegang", "ru-RU": "Низкая облачность · умеренное море" },
  { source: "局地强雨 · 较强风浪", "zh-TW": "局部強雨 · 較強風浪", "en-US": "Local heavy rain · rougher sea", "ja-JP": "局地的大雨 · 強めの波", "es-ES": "Lluvia intensa local · mar agitada", "de-DE": "Lokaler Starkregen · stärkerer Seegang", "ru-RU": "Локальный ливень · сильное волнение" },
  { source: "近距离交战 · 低风浪", "zh-TW": "近距離交戰 · 低風浪", "en-US": "Close-range combat · low waves", "ja-JP": "近距離戦 · 低い波", "es-ES": "Combate cercano · oleaje bajo", "de-DE": "Nahkampf · geringer Seegang", "ru-RU": "Ближний бой · слабое волнение" },
  { source: "推荐", "zh-TW": "建議", "en-US": "Recommended", "ja-JP": "推奨", "es-ES": "Recomendado", "de-DE": "Empfohlen", "ru-RU": "Рекомендуется" },
  { source: "较高负载", "zh-TW": "較高負載", "en-US": "Higher load", "ja-JP": "高負荷", "es-ES": "Carga alta", "de-DE": "Höhere Last", "ru-RU": "Повышенная нагрузка" },
  { source: "快速战斗", "zh-TW": "快速戰鬥", "en-US": "Quick battle", "ja-JP": "クイック戦", "es-ES": "Batalla rápida", "de-DE": "Schnelles Gefecht", "ru-RU": "Быстрый бой" },
  { source: "装备完整", "zh-TW": "裝備完整", "en-US": "Ready", "ja-JP": "装備完備", "es-ES": "Listo", "de-DE": "Einsatzbereit", "ru-RU": "Готово" },
  { source: "缺少库存组件", "zh-TW": "缺少庫存組件", "en-US": "Missing inventory items", "ja-JP": "在庫部品不足", "es-ES": "Faltan componentes", "de-DE": "Inventarteile fehlen", "ru-RU": "Не хватает компонентов" },
  { source: "请先到船坞保存一套舰船方案。", "zh-TW": "請先到船塢儲存一套艦艇方案。", "en-US": "Save a ship build in the dockyard first.", "ja-JP": "先に造船所で艦艇構成を保存してください。", "es-ES": "Guarda primero una configuración en el astillero.", "de-DE": "Speichere zuerst eine Schiffskonfiguration in der Werft.", "ru-RU": "Сначала сохраните комплектацию корабля на верфи." },
  { source: "请先选择一套装备完整的舰船方案", "zh-TW": "請先選擇一套裝備完整的艦艇方案", "en-US": "Select a complete ship build first", "ja-JP": "装備が揃った艦艇構成を選択してください", "es-ES": "Elige una configuración completa", "de-DE": "Wähle zuerst eine vollständige Schiffskonfiguration", "ru-RU": "Сначала выберите полностью оснащённый корабль" },
  { source: "删除", "zh-TW": "刪除", "en-US": "Delete", "ja-JP": "削除", "es-ES": "Eliminar", "de-DE": "Löschen", "ru-RU": "Удалить" },
  { source: "驱逐舰", "zh-TW": "驅逐艦", "en-US": "Destroyer", "ja-JP": "駆逐艦", "es-ES": "Destructor", "de-DE": "Zerstörer", "ru-RU": "Эсминец" },
  { source: "轻巡洋舰", "zh-TW": "輕巡洋艦", "en-US": "Light Cruiser", "ja-JP": "軽巡洋艦", "es-ES": "Crucero ligero", "de-DE": "Leichter Kreuzer", "ru-RU": "Лёгкий крейсер" },
  { source: "战列舰", "zh-TW": "戰艦", "en-US": "Battleship", "ja-JP": "戦艦", "es-ES": "Acorazado", "de-DE": "Schlachtschiff", "ru-RU": "Линкор" },
  { source: "航母", "zh-TW": "航空母艦", "en-US": "Carrier", "ja-JP": "空母", "es-ES": "Portaaviones", "de-DE": "Flugzeugträger", "ru-RU": "Авианосец" },
  { source: "天气", "zh-TW": "天氣", "en-US": "Weather", "ja-JP": "天候", "es-ES": "Clima", "de-DE": "Wetter", "ru-RU": "Погода" },
  { source: "能见度", "zh-TW": "能見度", "en-US": "Visibility", "ja-JP": "視界", "es-ES": "Visibilidad", "de-DE": "Sicht", "ru-RU": "Видимость" },
  { source: "有", "zh-TW": "有", "en-US": "Yes", "ja-JP": "あり", "es-ES": "Sí", "de-DE": "Ja", "ru-RU": "Есть" },
  { source: "无", "zh-TW": "無", "en-US": "No", "ja-JP": "なし", "es-ES": "No", "de-DE": "Nein", "ru-RU": "Нет" },
  { source: "按住查看战术信息与键位", "zh-TW": "按住查看戰術資訊與按鍵", "en-US": "Hold to view tactical data and controls", "ja-JP": "長押しで戦術情報と操作を表示", "es-ES": "Mantén para ver datos tácticos y controles", "de-DE": "Halten: Taktikdaten und Steuerung anzeigen", "ru-RU": "Удерживать: тактические данные и управление" },
  { source: "灰海行动 · 二战海战原型", "zh-TW": "灰海行動 · 二戰海戰原型", "en-US": "Grey Sea Action · WWII Naval Combat Prototype", "ja-JP": "グレイ・シー作戦 · 第二次大戦海戦プロトタイプ", "es-ES": "Operación Mar Gris · Prototipo naval de la SGM", "de-DE": "Operation Graue See · Seekampf-Prototyp des Zweiten Weltkriegs", "ru-RU": "Операция «Серое море» · прототип морских боёв Второй мировой" },
  { source: "开始战斗、军需商店与舰队船坞", "zh-TW": "開始戰鬥、軍需商店與艦隊船塢", "en-US": "Battle, Armory and Fleet Dockyard", "ja-JP": "戦闘・武器庫・艦隊造船所", "es-ES": "Batalla, Arsenal y Astillero", "de-DE": "Gefecht, Arsenal und Flottenwerft", "ru-RU": "Бой, арсенал и верфь флота" },
  { source: "击沉敌舰，或控制中央 A 区率先达到 375 分。双方争夺时，舰体状态更好的一方会缓慢建立区域优势。当前本地配装会真实影响战斗性能。", "zh-TW": "擊沉敵艦，或控制中央 A 區率先達到 375 分。雙方爭奪時，艦體狀態較好的一方會逐步建立區域優勢。目前本機配裝會實際影響戰鬥性能。", "en-US": "Sink the enemy fleet or control central Zone A and reach 375 points first. When contested, the healthier fleet slowly gains control. Your current local loadout directly affects combat performance.", "ja-JP": "敵艦隊を撃沈するか、中央A区域を制圧して先に375ポイントへ到達してください。競合中は状態の良い艦隊が徐々に優勢になります。現在の装備は戦闘性能に反映されます。", "es-ES": "Hunde a la flota enemiga o controla la zona A central y alcanza primero 375 puntos. Si hay disputa, la flota en mejor estado gana ventaja poco a poco. Tu equipamiento local afecta al combate.", "de-DE": "Versenke die gegnerische Flotte oder kontrolliere Zone A und erreiche zuerst 375 Punkte. Bei umkämpfter Zone gewinnt die intaktere Flotte langsam die Oberhand. Deine aktuelle Ausrüstung wirkt sich direkt aus.", "ru-RU": "Потопите вражеский флот или захватите центральную зону A и первыми наберите 375 очков. В спорной зоне преимущество постепенно получает более боеспособный флот. Текущая комплектация влияет на бой." },
  { source: "使用当前船坞配装出击，或进入海试场验证舰船性能。", "zh-TW": "使用目前船塢配裝出擊，或進入海試場驗證艦艇性能。", "en-US": "Deploy with the current dockyard loadout, or enter sea trials to test ship performance.", "ja-JP": "造船所の現在装備で出撃するか、海上公試で性能を確認します。", "es-ES": "Combate con el equipamiento actual o entra en pruebas de mar para comprobar el rendimiento.", "de-DE": "Rücke mit der aktuellen Werftausrüstung aus oder teste das Schiff in der Seeerprobung.", "ru-RU": "Выйдите в бой с текущей комплектацией или проверьте корабль на ходовых испытаниях." },
  { source: "无现金货币、无会员、无限时促销。所有战斗组件均可定向研发和购买。", "zh-TW": "無現金貨幣、無會員、無限時促銷。所有戰鬥組件皆可定向研發與購買。", "en-US": "No cash currency, memberships or timed sales. Every combat component can be researched and purchased directly.", "ja-JP": "有料通貨・会員制度・期間限定セールはありません。すべての戦闘部品を指定研究・購入できます。", "es-ES": "Sin moneda de pago, membresías ni ofertas temporales. Todos los componentes pueden investigarse y comprarse directamente.", "de-DE": "Keine Echtgeldwährung, Mitgliedschaften oder zeitlich begrenzten Angebote. Alle Kampfkomponenten sind gezielt erforsch- und kaufbar.", "ru-RU": "Без платной валюты, подписок и временных акций. Любой боевой компонент можно целенаправленно исследовать и купить." },
  { source: "补给券只能通过有效战斗获得，不能购买。全部组件也可在上方直接研发采购。", "zh-TW": "補給券只能透過有效戰鬥取得，無法購買。所有組件亦可在上方直接研發採購。", "en-US": "Supply tickets are earned only through valid battles and cannot be bought. Every component is also available through direct research and procurement above.", "ja-JP": "補給券は有効な戦闘でのみ獲得でき、購入できません。すべての部品は上で直接研究・調達もできます。", "es-ES": "Los vales de suministro solo se ganan en batallas válidas y no se compran. Todos los componentes también pueden investigarse y adquirirse directamente.", "de-DE": "Versorgungsscheine gibt es nur für gültige Gefechte; sie sind nicht käuflich. Alle Komponenten können oben direkt erforscht und beschafft werden.", "ru-RU": "Талоны снабжения выдаются только за полноценные бои и не продаются. Все компоненты также доступны через прямое исследование и закупку." },
  { source: "战场模拟已暂停。舰装更换需返回主菜单。", "zh-TW": "戰場模擬已暫停。更換艦裝需返回主選單。", "en-US": "The battle simulation is paused. Return to the main menu to change equipment.", "ja-JP": "戦闘シミュレーションを一時停止しました。装備変更はメインメニューへ戻ってください。", "es-ES": "La simulación está en pausa. Vuelve al menú principal para cambiar el equipamiento.", "de-DE": "Die Gefechtssimulation ist pausiert. Kehre zum Hauptmenü zurück, um die Ausrüstung zu ändern.", "ru-RU": "Симуляция боя приостановлена. Для смены оснащения вернитесь в главное меню." },
  { source: "10 分钟 · 击沉或 375 分获胜 · 3v3 混编舰队", "zh-TW": "10 分鐘 · 擊沉或 375 分獲勝 · 3v3 混編艦隊", "en-US": "10 minutes · sink or reach 375 points · mixed 3v3 fleets", "ja-JP": "10分 · 撃沈または375ポイントで勝利 · 3対3混成艦隊", "es-ES": "10 minutos · hunde o logra 375 puntos · flotas mixtas 3v3", "de-DE": "10 Minuten · Versenken oder 375 Punkte · gemischte 3-gegen-3-Flotten", "ru-RU": "10 минут · потопление или 375 очков · смешанные флоты 3 на 3" },
  { source: "无攻击 AI · 无时间限制 · 测试装配性能", "zh-TW": "無攻擊 AI · 無時間限制 · 測試配裝性能", "en-US": "No attacking AI · no time limit · test your loadout", "ja-JP": "攻撃AIなし · 制限時間なし · 装備性能を試験", "es-ES": "Sin IA atacante · sin límite de tiempo · prueba el equipamiento", "de-DE": "Keine angreifende KI · kein Zeitlimit · Ausrüstung testen", "ru-RU": "Без атакующего ИИ · без лимита времени · проверка комплектации" },
  { source: "界面语言", "zh-TW": "介面語言", "en-US": "Interface Language", "ja-JP": "表示言語", "es-ES": "Idioma de la interfaz", "de-DE": "Oberflächensprache", "ru-RU": "Язык интерфейса" },
  { source: "语言切换会立即生效并保存在本机", "zh-TW": "語言切換會立即生效並儲存在本機", "en-US": "Language changes apply immediately and are saved locally", "ja-JP": "言語変更は直ちに反映され、この端末に保存されます", "es-ES": "El idioma cambia al instante y se guarda localmente", "de-DE": "Sprachänderungen gelten sofort und werden lokal gespeichert", "ru-RU": "Язык меняется сразу и сохраняется локально" },
  { source: "本地舰长档案", "zh-TW": "本機艦長檔案", "en-US": "Local Captain Profile", "ja-JP": "ローカル艦長プロフィール", "es-ES": "Perfil local del capitán", "de-DE": "Lokales Kapitänsprofil", "ru-RU": "Локальный профиль командира" },
  { source: "本地舰长昵称", "zh-TW": "本機艦長暱稱", "en-US": "Local captain name", "ja-JP": "ローカル艦長名", "es-ES": "Nombre local del capitán", "de-DE": "Lokaler Kapitänsname", "ru-RU": "Имя локального командира" },
  { source: "主菜单选项卡", "zh-TW": "主選單分頁", "en-US": "Main menu tabs", "ja-JP": "メインメニュータブ", "es-ES": "Pestañas del menú principal", "de-DE": "Hauptmenü-Reiter", "ru-RU": "Вкладки главного меню" },
  { source: "单人战术原型 · 1943", "zh-TW": "單人戰術原型 · 1943", "en-US": "Single-player tactical prototype · 1943", "ja-JP": "シングルプレイ戦術プロトタイプ · 1943", "es-ES": "Prototipo táctico para un jugador · 1943", "de-DE": "Einzelspieler-Taktikprototyp · 1943", "ru-RU": "Тактический прототип для одного игрока · 1943" },
  { source: "纯游戏内资源 · 常驻明码兑换", "zh-TW": "純遊戲內資源 · 常駐明碼兌換", "en-US": "Gameplay resources only · permanent fixed prices", "ja-JP": "ゲーム内資源のみ · 常設の明確価格", "es-ES": "Solo recursos del juego · precios fijos permanentes", "de-DE": "Nur Spielressourcen · dauerhaft feste Preise", "ru-RU": "Только игровые ресурсы · постоянные фиксированные цены" },
  { source: "无限容量 · 免费保管", "zh-TW": "無限容量 · 免費保管", "en-US": "Unlimited capacity · free storage", "ja-JP": "容量無制限 · 保管無料", "es-ES": "Capacidad ilimitada · almacenamiento gratuito", "de-DE": "Unbegrenzte Kapazität · kostenlose Lagerung", "ru-RU": "Неограниченная вместимость · бесплатное хранение" },
  { source: "模块化船坞蓝图", "zh-TW": "模組化船塢藍圖", "en-US": "Modular dockyard blueprint", "ja-JP": "モジュール式造船所設計図", "es-ES": "Plano modular del astillero", "de-DE": "Modularer Werftbauplan", "ru-RU": "Модульный чертёж верфи" },
  { source: "二战舰装档案", "zh-TW": "二戰艦裝檔案", "en-US": "WWII equipment archive", "ja-JP": "第二次大戦装備資料", "es-ES": "Archivo de equipo de la SGM", "de-DE": "Ausrüstungsarchiv des Zweiten Weltkriegs", "ru-RU": "Архив оснащения Второй мировой" },
  { source: "单人战斗", "zh-TW": "單人戰鬥", "en-US": "Single Battle", "ja-JP": "シングル戦", "es-ES": "Batalla individual", "de-DE": "Einzelgefecht", "ru-RU": "Одиночный бой" },
  { source: "舰船测试模式", "zh-TW": "艦艇測試模式", "en-US": "Sea Trials", "ja-JP": "海上公試", "es-ES": "Pruebas de mar", "de-DE": "Seeerprobung", "ru-RU": "Ходовые испытания" },
  { source: "舰队军械库", "zh-TW": "艦隊軍械庫", "en-US": "Fleet Armory", "ja-JP": "艦隊武器庫", "es-ES": "Arsenal de la flota", "de-DE": "Flottenarsenal", "ru-RU": "Арсенал флота" },
  { source: "舰队仓库", "zh-TW": "艦隊倉庫", "en-US": "Fleet Inventory", "ja-JP": "艦隊倉庫", "es-ES": "Inventario de la flota", "de-DE": "Flotteninventar", "ru-RU": "Склад флота" },
  { source: "舰队船坞", "zh-TW": "艦隊船塢", "en-US": "Fleet Dockyard", "ja-JP": "艦隊造船所", "es-ES": "Astillero de la flota", "de-DE": "Flottenwerft", "ru-RU": "Верфь флота" },
  { source: "组件图鉴", "zh-TW": "組件圖鑑", "en-US": "Equipment Codex", "ja-JP": "装備図鑑", "es-ES": "Enciclopedia de equipo", "de-DE": "Ausrüstungslexikon", "ru-RU": "Справочник оснащения" },
  { source: "战斗暂停", "zh-TW": "戰鬥暫停", "en-US": "Battle Paused", "ja-JP": "戦闘一時停止", "es-ES": "Batalla en pausa", "de-DE": "Gefecht pausiert", "ru-RU": "Бой приостановлен" },
  { source: "舰桥指令", "zh-TW": "艦橋指令", "en-US": "Bridge Orders", "ja-JP": "艦橋命令", "es-ES": "Órdenes del puente", "de-DE": "Brückenbefehle", "ru-RU": "Приказы с мостика" },
  { source: "游戏设置", "zh-TW": "遊戲設定", "en-US": "Game Settings", "ja-JP": "ゲーム設定", "es-ES": "Ajustes del juego", "de-DE": "Spieleinstellungen", "ru-RU": "Настройки игры" },
  { source: "操控与画面", "zh-TW": "操控與畫面", "en-US": "Controls and Graphics", "ja-JP": "操作と画面", "es-ES": "Controles y gráficos", "de-DE": "Steuerung und Grafik", "ru-RU": "Управление и графика" },
  { source: "操控灵敏度", "zh-TW": "操控靈敏度", "en-US": "Control Sensitivity", "ja-JP": "操作感度", "es-ES": "Sensibilidad de control", "de-DE": "Steuerungsempfindlichkeit", "ru-RU": "Чувствительность управления" },
  { source: "画面质量", "zh-TW": "畫面品質", "en-US": "Graphics Quality", "ja-JP": "画質", "es-ES": "Calidad gráfica", "de-DE": "Grafikqualität", "ru-RU": "Качество графики" },
  { source: "返回战斗", "zh-TW": "返回戰鬥", "en-US": "Resume Battle", "ja-JP": "戦闘に戻る", "es-ES": "Volver a la batalla", "de-DE": "Gefecht fortsetzen", "ru-RU": "Вернуться в бой" },
  { source: "重新开始", "zh-TW": "重新開始", "en-US": "Restart", "ja-JP": "やり直す", "es-ES": "Reiniciar", "de-DE": "Neu starten", "ru-RU": "Начать заново" },
  { source: "退出到主菜单", "zh-TW": "退出至主選單", "en-US": "Exit to Main Menu", "ja-JP": "メインメニューに戻る", "es-ES": "Salir al menú principal", "de-DE": "Zum Hauptmenü", "ru-RU": "Выйти в главное меню" },
  { source: "返回暂停菜单", "zh-TW": "返回暫停選單", "en-US": "Back to Pause Menu", "ja-JP": "ポーズメニューへ戻る", "es-ES": "Volver al menú de pausa", "de-DE": "Zurück zum Pausenmenü", "ru-RU": "Назад в меню паузы" },
  { source: "低（推荐）", "zh-TW": "低（建議）", "en-US": "Low (Recommended)", "ja-JP": "低（推奨）", "es-ES": "Baja (recomendada)", "de-DE": "Niedrig (empfohlen)", "ru-RU": "Низкое (рекомендуется)" },
  { source: "中等", "zh-TW": "中等", "en-US": "Medium", "ja-JP": "中", "es-ES": "Media", "de-DE": "Mittel", "ru-RU": "Среднее" },
  { source: "主音量", "zh-TW": "主音量", "en-US": "Master Volume", "ja-JP": "マスター音量", "es-ES": "Volumen general", "de-DE": "Gesamtlautstärke", "ru-RU": "Общая громкость" },
  { source: "静音：关", "zh-TW": "靜音：關", "en-US": "Mute: Off", "ja-JP": "ミュート：オフ", "es-ES": "Silencio: no", "de-DE": "Stumm: Aus", "ru-RU": "Без звука: выкл." },
  { source: "静音：开", "zh-TW": "靜音：開", "en-US": "Mute: On", "ja-JP": "ミュート：オン", "es-ES": "Silencio: sí", "de-DE": "Stumm: Ein", "ru-RU": "Без звука: вкл." },
  { source: "前往仓库管理", "zh-TW": "前往倉庫管理", "en-US": "Manage Inventory", "ja-JP": "倉庫を管理", "es-ES": "Gestionar inventario", "de-DE": "Inventar verwalten", "ru-RU": "Управление складом" },
  { source: "前往船坞配装", "zh-TW": "前往船塢配裝", "en-US": "Open Dockyard", "ja-JP": "造船所で装備", "es-ES": "Abrir astillero", "de-DE": "Werft öffnen", "ru-RU": "Открыть верфь" },
  { source: "查看完整组件表", "zh-TW": "查看完整組件表", "en-US": "View Full Equipment Table", "ja-JP": "全装備表を見る", "es-ES": "Ver tabla completa", "de-DE": "Vollständige Ausrüstungstabelle", "ru-RU": "Открыть полную таблицу" },
  { source: "历史舰装目录", "zh-TW": "歷史艦裝目錄", "en-US": "Historical Equipment Catalog", "ja-JP": "史実装備一覧", "es-ES": "Catálogo de equipo histórico", "de-DE": "Historischer Ausrüstungskatalog", "ru-RU": "Каталог исторического оснащения" },
  { source: "研发解锁 → 银币与材料采购", "zh-TW": "研發解鎖 → 銀幣與材料採購", "en-US": "Research unlock → credits and materials", "ja-JP": "研究で解除 → クレジットと資材で調達", "es-ES": "Investiga para desbloquear → créditos y materiales", "de-DE": "Erforschen → mit Kreditpunkten und Material beschaffen", "ru-RU": "Исследование → покупка за кредиты и материалы" },
  { source: "免费战斗补给", "zh-TW": "免費戰鬥補給", "en-US": "Free Battle Supplies", "ja-JP": "無料戦闘補給", "es-ES": "Suministros de batalla gratuitos", "de-DE": "Kostenlose Gefechtsversorgung", "ru-RU": "Бесплатное боевое снабжение" },
  { source: "开启 1 张", "zh-TW": "開啟 1 張", "en-US": "Open 1", "ja-JP": "1枚開封", "es-ES": "Abrir 1", "de-DE": "1 öffnen", "ru-RU": "Открыть 1" },
  { source: "开启 10 张", "zh-TW": "開啟 10 張", "en-US": "Open 10", "ja-JP": "10枚開封", "es-ES": "Abrir 10", "de-DE": "10 öffnen", "ru-RU": "Открыть 10" },
  { source: "仓库筛选", "zh-TW": "倉庫篩選", "en-US": "Inventory Filters", "ja-JP": "倉庫フィルター", "es-ES": "Filtros de inventario", "de-DE": "Inventarfilter", "ru-RU": "Фильтры склада" },
  { source: "持有组件", "zh-TW": "持有組件", "en-US": "Owned Equipment", "ja-JP": "所有装備", "es-ES": "Equipo en propiedad", "de-DE": "Eigene Ausrüstung", "ru-RU": "Имеющееся оснащение" },
  { source: "更换舰体", "zh-TW": "更換艦體", "en-US": "Change Hull", "ja-JP": "艦体変更", "es-ES": "Cambiar casco", "de-DE": "Rumpf wechseln", "ru-RU": "Сменить корпус" },
  { source: "组件库", "zh-TW": "組件庫", "en-US": "Equipment Library", "ja-JP": "装備ライブラリ", "es-ES": "Biblioteca de equipo", "de-DE": "Ausrüstungsbibliothek", "ru-RU": "Библиотека оснащения" },
  { source: "配装自动保存至本机", "zh-TW": "配裝自動儲存至本機", "en-US": "Loadout saved locally", "ja-JP": "装備はローカルに自動保存", "es-ES": "El equipamiento se guarda localmente", "de-DE": "Ausrüstung wird lokal gespeichert", "ru-RU": "Комплектация сохраняется локально" },
  { source: "出击", "zh-TW": "出擊", "en-US": "Battle", "ja-JP": "出撃", "es-ES": "A la batalla", "de-DE": "Ins Gefecht", "ru-RU": "В бой" },
  { source: "军械库", "zh-TW": "軍械庫", "en-US": "Armory", "ja-JP": "武器庫", "es-ES": "Arsenal", "de-DE": "Arsenal", "ru-RU": "Арсенал" },
  { source: "仓库", "zh-TW": "倉庫", "en-US": "Inventory", "ja-JP": "倉庫", "es-ES": "Inventario", "de-DE": "Inventar", "ru-RU": "Склад" },
  { source: "船坞", "zh-TW": "船塢", "en-US": "Dockyard", "ja-JP": "造船所", "es-ES": "Astillero", "de-DE": "Werft", "ru-RU": "Верфь" },
  { source: "图鉴", "zh-TW": "圖鑑", "en-US": "Codex", "ja-JP": "図鑑", "es-ES": "Enciclopedia", "de-DE": "Enzyklopädie", "ru-RU": "Справочник" },
  { source: "设置", "zh-TW": "設定", "en-US": "Settings", "ja-JP": "設定", "es-ES": "Ajustes", "de-DE": "Einstellungen", "ru-RU": "Настройки" },
  { source: "航速", "zh-TW": "航速", "en-US": "Speed", "ja-JP": "速力", "es-ES": "Velocidad", "de-DE": "Fahrt", "ru-RU": "Скорость" },
  { source: "舰船航行仪表", "zh-TW": "艦艇航行儀表", "en-US": "Ship Navigation Instruments", "ja-JP": "艦艇航海計器", "es-ES": "Instrumentos de navegación", "de-DE": "Schiffsnavigationsinstrumente", "ru-RU": "Судовые навигационные приборы" },
  { source: "详细舰况", "zh-TW": "詳細艦況", "en-US": "Detailed Ship Status", "ja-JP": "詳細艦艇状況", "es-ES": "Estado detallado del buque", "de-DE": "Detaillierter Schiffsstatus", "ru-RU": "Подробное состояние корабля" },
  { source: "罗经", "zh-TW": "羅經", "en-US": "Compass", "ja-JP": "羅針儀", "es-ES": "Compás", "de-DE": "Kompass", "ru-RU": "Компас" },
  { source: "舵角", "zh-TW": "舵角", "en-US": "Rudder", "ja-JP": "舵角", "es-ES": "Timón", "de-DE": "Ruder", "ru-RU": "Руль" },
  { source: "车钟", "zh-TW": "車鐘", "en-US": "Telegraph", "ja-JP": "速力通信機", "es-ES": "Telégrafo", "de-DE": "Maschinentelegraf", "ru-RU": "Машинный телеграф" },
  { source: "舰体", "zh-TW": "艦體", "en-US": "Hull", "ja-JP": "船体", "es-ES": "Casco", "de-DE": "Rumpf", "ru-RU": "Корпус" },
  { source: "可恢复", "zh-TW": "可恢復", "en-US": "Recoverable", "ja-JP": "回復可能", "es-ES": "Recuperable", "de-DE": "Wiederherstellbar", "ru-RU": "Восстановимо" },
  { source: "正舵", "zh-TW": "正舵", "en-US": "Amidships", "ja-JP": "中央", "es-ES": "Al centro", "de-DE": "Mittschiffs", "ru-RU": "Прямо" },
  { source: "转向", "zh-TW": "轉向", "en-US": "Steering", "ja-JP": "操舵", "es-ES": "Dirección", "de-DE": "Steuerung", "ru-RU": "Рулевое управление" },
  { source: "移动鼠标", "zh-TW": "移動滑鼠", "en-US": "Move Mouse", "ja-JP": "マウス移動", "es-ES": "Mover ratón", "de-DE": "Maus bewegen", "ru-RU": "Двигать мышь" },
  { source: "瞄准", "zh-TW": "瞄準", "en-US": "Aim", "ja-JP": "照準", "es-ES": "Apuntar", "de-DE": "Zielen", "ru-RU": "Прицеливание" },
  { source: "开火", "zh-TW": "開火", "en-US": "Fire", "ja-JP": "射撃", "es-ES": "Disparar", "de-DE": "Feuern", "ru-RU": "Огонь" },
  { source: "损管优先", "zh-TW": "損管優先", "en-US": "Damage-control priority", "ja-JP": "応急班優先", "es-ES": "Prioridad de control de daños", "de-DE": "Schadensabwehr-Priorität", "ru-RU": "Приоритет борьбы за живучесть" },
  { source: "舰体抢修", "zh-TW": "艦體搶修", "en-US": "Hull repair", "ja-JP": "船体応急修理", "es-ES": "Reparación del casco", "de-DE": "Rumpfreparatur", "ru-RU": "Ремонт корпуса" },
  { source: "地图", "zh-TW": "地圖", "en-US": "Map", "ja-JP": "マップ", "es-ES": "Mapa", "de-DE": "Karte", "ru-RU": "Карта" },
  { source: "地图缩放", "zh-TW": "地圖縮放", "en-US": "Map zoom", "ja-JP": "マップ拡大縮小", "es-ES": "Zoom del mapa", "de-DE": "Kartenzoom", "ru-RU": "Масштаб карты" },
  { source: "放大地图", "zh-TW": "放大地圖", "en-US": "Zoom in", "ja-JP": "拡大", "es-ES": "Acercar", "de-DE": "Vergrößern", "ru-RU": "Приблизить" },
  { source: "缩小地图", "zh-TW": "縮小地圖", "en-US": "Zoom out", "ja-JP": "縮小", "es-ES": "Alejar", "de-DE": "Verkleinern", "ru-RU": "Отдалить" },
  { source: "返回全局", "zh-TW": "返回全局", "en-US": "Reset overview", "ja-JP": "全体表示に戻す", "es-ES": "Volver a vista global", "de-DE": "Gesamtansicht", "ru-RU": "Вернуть общий вид" },
  { source: "全局", "zh-TW": "全局", "en-US": "Overview", "ja-JP": "全体", "es-ES": "Global", "de-DE": "Gesamt", "ru-RU": "Обзор" },
  { source: "调试", "zh-TW": "除錯", "en-US": "Debug", "ja-JP": "デバッグ", "es-ES": "Depuración", "de-DE": "Debug", "ru-RU": "Отладка" },
  { source: "暂停", "zh-TW": "暫停", "en-US": "Pause", "ja-JP": "ポーズ", "es-ES": "Pausa", "de-DE": "Pause", "ru-RU": "Пауза" },
  { source: "声音", "zh-TW": "聲音", "en-US": "Audio", "ja-JP": "サウンド", "es-ES": "Sonido", "de-DE": "Audio", "ru-RU": "Звук" },
  { source: "银币", "zh-TW": "銀幣", "en-US": "Credits", "ja-JP": "クレジット", "es-ES": "Créditos", "de-DE": "Kreditpunkte", "ru-RU": "Кредиты" },
  { source: "研发", "zh-TW": "研發", "en-US": "Research", "ja-JP": "研究", "es-ES": "Investigación", "de-DE": "Forschung", "ru-RU": "Исследование" },
  { source: "战斗补给券", "zh-TW": "戰鬥補給券", "en-US": "Supply Tickets", "ja-JP": "戦闘補給券", "es-ES": "Vales de suministro", "de-DE": "Versorgungsscheine", "ru-RU": "Талоны снабжения" },
  { source: "钢材", "zh-TW": "鋼材", "en-US": "Steel", "ja-JP": "鋼材", "es-ES": "Acero", "de-DE": "Stahl", "ru-RU": "Сталь" },
  { source: "零件", "zh-TW": "零件", "en-US": "Parts", "ja-JP": "部品", "es-ES": "Piezas", "de-DE": "Teile", "ru-RU": "Детали" },
  { source: "全部组件", "zh-TW": "全部組件", "en-US": "All Equipment", "ja-JP": "すべての装備", "es-ES": "Todo el equipo", "de-DE": "Gesamte Ausrüstung", "ru-RU": "Всё оснащение" },
  { source: "主炮", "zh-TW": "主砲", "en-US": "Main Battery", "ja-JP": "主砲", "es-ES": "Batería principal", "de-DE": "Hauptbatterie", "ru-RU": "Главный калибр" },
  { source: "鱼雷", "zh-TW": "魚雷", "en-US": "Torpedo", "ja-JP": "魚雷", "es-ES": "Torpedo", "de-DE": "Torpedo", "ru-RU": "Торпеда" },
  { source: "防空炮", "zh-TW": "防空砲", "en-US": "Anti-aircraft Battery", "ja-JP": "対空砲", "es-ES": "Batería antiaérea", "de-DE": "Flugabwehr", "ru-RU": "ПВО" },
  { source: "侧炮", "zh-TW": "副砲", "en-US": "Secondary Battery", "ja-JP": "副砲", "es-ES": "Batería secundaria", "de-DE": "Sekundärbatterie", "ru-RU": "Вспомогательный калибр" },
  { source: "深水炸弹", "zh-TW": "深水炸彈", "en-US": "Depth Charges", "ja-JP": "爆雷", "es-ES": "Cargas de profundidad", "de-DE": "Wasserbomben", "ru-RU": "Глубинные бомбы" },
  { source: "弹药库", "zh-TW": "彈藥庫", "en-US": "Magazine", "ja-JP": "弾薬庫", "es-ES": "Pañol de munición", "de-DE": "Munitionsmagazin", "ru-RU": "Артиллерийский погреб" },
  { source: "引擎", "zh-TW": "引擎", "en-US": "Engine", "ja-JP": "機関", "es-ES": "Motor", "de-DE": "Maschine", "ru-RU": "Двигатель" },
  { source: "转向机", "zh-TW": "舵機", "en-US": "Steering Gear", "ja-JP": "操舵装置", "es-ES": "Servomotor del timón", "de-DE": "Rudermaschine", "ru-RU": "Рулевой привод" },
];

const orderedRows = [...GAME_LOCALE_MESSAGES].sort((a, b) => b.source.length - a.source.length);
const inlineSources = new Set([
  "银币", "研发", "战斗补给券", "钢材", "零件", "能见度",
]);
const inlineRows = orderedRows.filter((row) => inlineSources.has(row.source));

export function isGameLocale(value: unknown): value is GameLocale {
  return typeof value === "string" && (SUPPORTED_GAME_LOCALES as readonly string[]).includes(value);
}

export function translateGameText(text: string, locale: GameLocale): string {
  if (!text.trim()) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core = text.slice(leading.length, text.length - trailing.length);
  let normalized = core;
  let exactSource: string | undefined;
  for (const row of orderedRows) {
    if (row.source === core) {
      exactSource = row.source;
      break;
    }
    for (const candidateLocale of SUPPORTED_GAME_LOCALES) {
      if (candidateLocale === "zh-CN") continue;
      const translated = row[candidateLocale];
      if (translated === core) {
        exactSource = row.source;
        break;
      }
    }
    if (exactSource) break;
  }
  if (exactSource) {
    normalized = exactSource;
  } else {
    for (const row of inlineRows) {
      for (const candidateLocale of SUPPORTED_GAME_LOCALES) {
        if (candidateLocale === "zh-CN") continue;
        normalized = normalized.split(row[candidateLocale]).join(row.source);
      }
    }
  }
  if (locale !== "zh-CN") {
    const exactRow = orderedRows.find((row) => row.source === normalized);
    if (exactRow) normalized = exactRow[locale];
    else for (const row of inlineRows) normalized = normalized.split(row.source).join(row[locale]);
  }
  return `${leading}${normalized}${trailing}`;
}

export function localizeElement(root: Element, locale: GameLocale): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const next = walker.nextNode();
    const translated = translateGameText(node.textContent ?? "", locale);
    if (translated !== node.textContent) node.textContent = translated;
    node = next;
  }
  for (const element of [root, ...Array.from(root.querySelectorAll("[aria-label],[title],[placeholder]"))]) {
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const translated = translateGameText(value, locale);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  }
}

export function applyDocumentLocale(locale: GameLocale): void {
  document.documentElement.lang = locale;
  document.title = translateGameText("灰海行动 · 二战海战原型", locale);
}

export function formatGameNumber(value: number, locale: GameLocale): string {
  return new Intl.NumberFormat(locale).format(value);
}
