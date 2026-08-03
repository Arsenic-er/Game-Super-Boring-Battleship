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
  { source: "按住查看战术信息与键位", "zh-TW": "按住查看戰術資訊與按鍵", "en-US": "Hold to view tactical data and controls", "ja-JP": "長押しで戦術情報と操作を表示", "es-ES": "Mantén para ver datos tácticos y controles", "de-DE": "Halten: Taktikdaten und Steuerung anzeigen", "ru-RU": "Удерживать: тактические данные и управление" },
  { source: "灰海行动 · 二战海战原型", "zh-TW": "灰海行動 · 二戰海戰原型", "en-US": "Grey Sea Action · WWII Naval Combat Prototype", "ja-JP": "グレイ・シー作戦 · 第二次大戦海戦プロトタイプ", "es-ES": "Operación Mar Gris · Prototipo naval de la SGM", "de-DE": "Operation Graue See · Seekampf-Prototyp des Zweiten Weltkriegs", "ru-RU": "Операция «Серое море» · прототип морских боёв Второй мировой" },
  { source: "开始战斗、军需商店与舰队船坞", "zh-TW": "開始戰鬥、軍需商店與艦隊船塢", "en-US": "Battle, Armory and Fleet Dockyard", "ja-JP": "戦闘・武器庫・艦隊造船所", "es-ES": "Batalla, Arsenal y Astillero", "de-DE": "Gefecht, Arsenal und Flottenwerft", "ru-RU": "Бой, арсенал и верфь флота" },
  { source: "击沉敌舰，或控制中央 A 区率先达到 200 分。双方争夺时，舰体状态更好的一方会缓慢建立区域优势。当前本地配装会真实影响战斗性能。", "zh-TW": "擊沉敵艦，或控制中央 A 區率先達到 200 分。雙方爭奪時，艦體狀態較好的一方會逐步建立區域優勢。目前本機配裝會實際影響戰鬥性能。", "en-US": "Sink the enemy or control central Zone A and reach 200 points first. When contested, the healthier ship slowly gains control. Your current local loadout directly affects combat performance.", "ja-JP": "敵艦を撃沈するか、中央A区域を制圧して先に200ポイントへ到達してください。競合中は状態の良い艦が徐々に優勢になります。現在の装備は戦闘性能に反映されます。", "es-ES": "Hunde al enemigo o controla la zona A central y alcanza primero 200 puntos. Si hay disputa, el buque en mejor estado gana ventaja poco a poco. Tu equipamiento local afecta al combate.", "de-DE": "Versenke den Gegner oder kontrolliere Zone A und erreiche zuerst 200 Punkte. Bei umkämpfter Zone gewinnt das intaktere Schiff langsam die Oberhand. Deine aktuelle Ausrüstung wirkt sich direkt aus.", "ru-RU": "Потопите противника или захватите центральную зону A и первыми наберите 200 очков. В спорной зоне преимущество постепенно получает более исправный корабль. Текущая комплектация влияет на бой." },
  { source: "使用当前船坞配装出击，或进入海试场验证舰船性能。", "zh-TW": "使用目前船塢配裝出擊，或進入海試場驗證艦艇性能。", "en-US": "Deploy with the current dockyard loadout, or enter sea trials to test ship performance.", "ja-JP": "造船所の現在装備で出撃するか、海上公試で性能を確認します。", "es-ES": "Combate con el equipamiento actual o entra en pruebas de mar para comprobar el rendimiento.", "de-DE": "Rücke mit der aktuellen Werftausrüstung aus oder teste das Schiff in der Seeerprobung.", "ru-RU": "Выйдите в бой с текущей комплектацией или проверьте корабль на ходовых испытаниях." },
  { source: "无现金货币、无会员、无限时促销。所有战斗组件均可定向研发和购买。", "zh-TW": "無現金貨幣、無會員、無限時促銷。所有戰鬥組件皆可定向研發與購買。", "en-US": "No cash currency, memberships or timed sales. Every combat component can be researched and purchased directly.", "ja-JP": "有料通貨・会員制度・期間限定セールはありません。すべての戦闘部品を指定研究・購入できます。", "es-ES": "Sin moneda de pago, membresías ni ofertas temporales. Todos los componentes pueden investigarse y comprarse directamente.", "de-DE": "Keine Echtgeldwährung, Mitgliedschaften oder zeitlich begrenzten Angebote. Alle Kampfkomponenten sind gezielt erforsch- und kaufbar.", "ru-RU": "Без платной валюты, подписок и временных акций. Любой боевой компонент можно целенаправленно исследовать и купить." },
  { source: "补给券只能通过有效战斗获得，不能购买。全部组件也可在上方直接研发采购。", "zh-TW": "補給券只能透過有效戰鬥取得，無法購買。所有組件亦可在上方直接研發採購。", "en-US": "Supply tickets are earned only through valid battles and cannot be bought. Every component is also available through direct research and procurement above.", "ja-JP": "補給券は有効な戦闘でのみ獲得でき、購入できません。すべての部品は上で直接研究・調達もできます。", "es-ES": "Los vales de suministro solo se ganan en batallas válidas y no se compran. Todos los componentes también pueden investigarse y adquirirse directamente.", "de-DE": "Versorgungsscheine gibt es nur für gültige Gefechte; sie sind nicht käuflich. Alle Komponenten können oben direkt erforscht und beschafft werden.", "ru-RU": "Талоны снабжения выдаются только за полноценные бои и не продаются. Все компоненты также доступны через прямое исследование и закупку." },
  { source: "战场模拟已暂停。舰装更换需返回主菜单。", "zh-TW": "戰場模擬已暫停。更換艦裝需返回主選單。", "en-US": "The battle simulation is paused. Return to the main menu to change equipment.", "ja-JP": "戦闘シミュレーションを一時停止しました。装備変更はメインメニューへ戻ってください。", "es-ES": "La simulación está en pausa. Vuelve al menú principal para cambiar el equipamiento.", "de-DE": "Die Gefechtssimulation ist pausiert. Kehre zum Hauptmenü zurück, um die Ausrüstung zu ändern.", "ru-RU": "Симуляция боя приостановлена. Для смены оснащения вернитесь в главное меню." },
  { source: "10 分钟 · 击沉或 200 分获胜 · 对抗 AI", "zh-TW": "10 分鐘 · 擊沉或 200 分獲勝 · 對抗 AI", "en-US": "10 minutes · sink or reach 200 points · versus AI", "ja-JP": "10分 · 撃沈または200ポイントで勝利 · AI戦", "es-ES": "10 minutos · hunde o logra 200 puntos · contra IA", "de-DE": "10 Minuten · Versenken oder 200 Punkte · gegen KI", "ru-RU": "10 минут · потопление или 200 очков · против ИИ" },
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
  { source: "转向", "zh-TW": "轉向", "en-US": "Steering", "ja-JP": "操舵", "es-ES": "Dirección", "de-DE": "Steuerung", "ru-RU": "Рулевое управление" },
  { source: "移动鼠标", "zh-TW": "移動滑鼠", "en-US": "Move Mouse", "ja-JP": "マウス移動", "es-ES": "Mover ratón", "de-DE": "Maus bewegen", "ru-RU": "Двигать мышь" },
  { source: "瞄准", "zh-TW": "瞄準", "en-US": "Aim", "ja-JP": "照準", "es-ES": "Apuntar", "de-DE": "Zielen", "ru-RU": "Прицеливание" },
  { source: "开火", "zh-TW": "開火", "en-US": "Fire", "ja-JP": "射撃", "es-ES": "Disparar", "de-DE": "Feuern", "ru-RU": "Огонь" },
  { source: "损管优先", "zh-TW": "損管優先", "en-US": "Damage-control priority", "ja-JP": "応急班優先", "es-ES": "Prioridad de control de daños", "de-DE": "Schadensabwehr-Priorität", "ru-RU": "Приоритет борьбы за живучесть" },
  { source: "舰体抢修", "zh-TW": "艦體搶修", "en-US": "Hull repair", "ja-JP": "船体応急修理", "es-ES": "Reparación del casco", "de-DE": "Rumpfreparatur", "ru-RU": "Ремонт корпуса" },
  { source: "地图", "zh-TW": "地圖", "en-US": "Map", "ja-JP": "マップ", "es-ES": "Mapa", "de-DE": "Karte", "ru-RU": "Карта" },
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
  "银币", "研发", "战斗补给券", "钢材", "零件",
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
