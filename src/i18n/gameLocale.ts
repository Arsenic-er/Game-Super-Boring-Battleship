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
  { source: "中键", "zh-TW": "滑鼠中鍵", "en-US": "Middle Mouse", "ja-JP": "マウス中ボタン", "es-ES": "Botón central", "de-DE": "Mittlere Maustaste", "ru-RU": "Средняя кнопка мыши" },
  { source: "按住显示瞄准标识", "zh-TW": "按住顯示瞄準標記", "en-US": "Hold to show aiming indicator", "ja-JP": "長押しで照準表示", "es-ES": "Mantén para mostrar el indicador de puntería", "de-DE": "Halten, um die Zielanzeige einzublenden", "ru-RU": "Удерживать для отображения прицела" },
  { source: "点击返回游戏并锁定鼠标", "zh-TW": "點擊返回遊戲並鎖定滑鼠", "en-US": "Click to return to the game and capture the mouse", "ja-JP": "クリックしてゲームに戻り、マウスを固定", "es-ES": "Haz clic para volver al juego y capturar el ratón", "de-DE": "Klicken, um zum Spiel zurückzukehren und die Maus zu erfassen", "ru-RU": "Нажмите, чтобы вернуться в игру и захватить мышь" },
  { source: "拖动舰船预览可旋转 · 滚轮缩放", "zh-TW": "拖曳艦船預覽可旋轉 · 滾輪縮放", "en-US": "Drag the ship preview to rotate · Scroll to zoom", "ja-JP": "艦船プレビューをドラッグして回転 · ホイールで拡大縮小", "es-ES": "Arrastra la vista previa del buque para girar · Usa la rueda para acercar o alejar", "de-DE": "Schiffsvorschau zum Drehen ziehen · Mit dem Mausrad zoomen", "ru-RU": "Перетаскивайте модель корабля для вращения · Колесо мыши изменяет масштаб" },
  { source: "二战海战 · 单人与双人局域网合作", "zh-TW": "二戰海戰 · 單人與雙人區域網路合作", "en-US": "WWII naval combat · Solo and two-player LAN co-op", "ja-JP": "第二次大戦の海戦 · ソロ・2人LAN協力プレイ", "es-ES": "Combate naval de la SGM · Individual y cooperativo LAN para dos", "de-DE": "Seekampf im Zweiten Weltkrieg · Solo und LAN-Koop für zwei", "ru-RU": "Морские бои Второй мировой · Одиночная игра и кооператив по LAN на двоих" },
  { source: "防空炮已接入舰载机空战，其防空效能随装备数量与性能变化。", "zh-TW": "防空炮已接入艦載機空戰，其防空效能隨裝備數量與性能變化。", "en-US": "Anti-aircraft guns now engage carrier aircraft; their effectiveness varies with the number and performance of installed mounts.", "ja-JP": "対空砲は艦載機との航空戦に対応し、その対空能力は装備数と性能に応じて変化します。", "es-ES": "Los cañones antiaéreos ya combaten contra aeronaves embarcadas; su eficacia varía según la cantidad y el rendimiento de los montajes instalados.", "de-DE": "Flugabwehrgeschütze bekämpfen nun Trägerflugzeuge; ihre Wirksamkeit hängt von Anzahl und Leistung der eingebauten Lafetten ab.", "ru-RU": "Зенитные орудия уже участвуют в боях с палубной авиацией; их эффективность зависит от числа и характеристик установленных орудий." },
  { source: "历史鱼雷与侧炮型号已接入实际战斗性能；轻巡洋舰和战列舰的侧炮会在火控连续确认目标后自动接战。防空炮已接入舰载机空战，其防空效能随装备数量与性能变化。", "zh-TW": "歷史魚雷與副炮型號已接入實際戰鬥性能；輕巡洋艦和戰列艦的副炮會在火控持續確認目標後自動接戰。防空炮已接入艦載機空戰，其防空效能隨裝備數量與性能變化。", "en-US": "Historical torpedo and secondary-gun models now have distinct combat performance. Light-cruiser and battleship secondary batteries engage automatically after fire control maintains target confirmation. Anti-aircraft guns now engage carrier aircraft; their effectiveness varies with the number and performance of installed mounts.", "ja-JP": "史実の魚雷と副砲の型式が実際の戦闘性能に反映されています。軽巡洋艦と戦艦の副砲は、射撃管制が目標を継続確認した後に自動交戦します。対空砲は艦載機との航空戦に対応し、その対空能力は装備数と性能に応じて変化します。", "es-ES": "Los modelos históricos de torpedos y artillería secundaria ya tienen prestaciones de combate propias. Las baterías secundarias de cruceros ligeros y acorazados abren fuego automáticamente tras la confirmación continua del objetivo por el control de tiro. Los cañones antiaéreos ya combaten contra aeronaves embarcadas; su eficacia varía según la cantidad y el rendimiento de los montajes instalados.", "de-DE": "Historische Torpedo- und Sekundärgeschützmodelle besitzen nun eigene Gefechtseigenschaften. Die Sekundärartillerie leichter Kreuzer und Schlachtschiffe eröffnet nach anhaltender Zielbestätigung durch die Feuerleitung automatisch das Feuer. Flugabwehrgeschütze bekämpfen nun Trägerflugzeuge; ihre Wirksamkeit hängt von Anzahl und Leistung der eingebauten Lafetten ab.", "ru-RU": "Исторические модели торпед и вспомогательных орудий уже имеют собственные боевые характеристики. Вспомогательная артиллерия лёгких крейсеров и линкоров автоматически вступает в бой после непрерывного подтверждения цели системой управления огнём. Зенитные орудия уже участвуют в боях с палубной авиацией; их эффективность зависит от числа и характеристик установленных орудий." },
  { source: "灰海行动", "zh-TW": "灰海行動", "en-US": "Grey Sea Action", "ja-JP": "グレイ・シー作戦", "es-ES": "Operación Mar Gris", "de-DE": "Operation Graue See", "ru-RU": "Операция «Серое море»" },
  { source: "视角", "zh-TW": "視角", "en-US": "View", "ja-JP": "視点", "es-ES": "Vista", "de-DE": "Ansicht", "ru-RU": "Обзор" },
  { source: "核心增益", "zh-TW": "核心增益", "en-US": "Core bonus", "ja-JP": "コア効果", "es-ES": "Bonificación central", "de-DE": "Kernbonus", "ru-RU": "Основной бонус" },
  { source: "全部", "zh-TW": "全部", "en-US": "All", "ja-JP": "すべて", "es-ES": "Todo", "de-DE": "Alle", "ru-RU": "Все" },
  { source: "槽", "zh-TW": "槽", "en-US": "slots", "ja-JP": "スロット", "es-ES": "ranuras", "de-DE": "Plätze", "ru-RU": "слотов" },
  { source: "弗莱彻级", "zh-TW": "弗萊徹級", "en-US": "Fletcher class", "ja-JP": "フレッチャー級", "es-ES": "Clase Fletcher", "de-DE": "Fletcher-Klasse", "ru-RU": "Тип «Флетчер»" },
  { source: "J级", "zh-TW": "J級", "en-US": "J class", "ja-JP": "J級", "es-ES": "Clase J", "de-DE": "J-Klasse", "ru-RU": "Тип J" },
  { source: "阳炎级", "zh-TW": "陽炎級", "en-US": "Kagerō class", "ja-JP": "陽炎型", "es-ES": "Clase Kagerō", "de-DE": "Kagerō-Klasse", "ru-RU": "Тип «Кагэро»" },
  { source: "1936A型（Z23）", "zh-TW": "1936A型（Z23）", "en-US": "Type 1936A (Z23)", "ja-JP": "1936A型（Z23）", "es-ES": "Tipo 1936A (Z23)", "de-DE": "Typ 1936A (Z23)", "ru-RU": "Тип 1936A (Z23)" },
  { source: "塔什干级", "zh-TW": "塔什干級", "en-US": "Tashkent class", "ja-JP": "タシュケント級", "es-ES": "Clase Tashkent", "de-DE": "Taschkent-Klasse", "ru-RU": "Тип «Ташкент»" },
  { source: "克利夫兰级", "zh-TW": "克利夫蘭級", "en-US": "Cleveland class", "ja-JP": "クリーブランド級", "es-ES": "Clase Cleveland", "de-DE": "Cleveland-Klasse", "ru-RU": "Тип «Кливленд»" },
  { source: "爱丁堡级", "zh-TW": "愛丁堡級", "en-US": "Edinburgh subclass", "ja-JP": "エディンバラ級", "es-ES": "Subclase Edinburgh", "de-DE": "Edinburgh-Unterklasse", "ru-RU": "Подтип «Эдинбург»" },
  { source: "纽伦堡级", "zh-TW": "紐倫堡級", "en-US": "Nürnberg class", "ja-JP": "ニュルンベルク級", "es-ES": "Clase Nürnberg", "de-DE": "Nürnberg-Klasse", "ru-RU": "Тип «Нюрнберг»" },
  { source: "阿贺野级", "zh-TW": "阿賀野級", "en-US": "Agano class", "ja-JP": "阿賀野型", "es-ES": "Clase Agano", "de-DE": "Agano-Klasse", "ru-RU": "Тип «Агано»" },
  { source: "黛朵级", "zh-TW": "黛朵級", "en-US": "Dido class", "ja-JP": "ダイドー級", "es-ES": "Clase Dido", "de-DE": "Dido-Klasse", "ru-RU": "Тип «Дидо»" },
  { source: "北卡罗来纳级", "zh-TW": "北卡羅來納級", "en-US": "North Carolina class", "ja-JP": "ノースカロライナ級", "es-ES": "Clase North Carolina", "de-DE": "North-Carolina-Klasse", "ru-RU": "Тип «Норт Кэролайна»" },
  { source: "乔治五世级", "zh-TW": "喬治五世級", "en-US": "King George V class", "ja-JP": "キング・ジョージ5世級", "es-ES": "Clase King George V", "de-DE": "King-George-V-Klasse", "ru-RU": "Тип «Кинг Джордж V»" },
  { source: "俾斯麦级", "zh-TW": "俾斯麥級", "en-US": "Bismarck class", "ja-JP": "ビスマルク級", "es-ES": "Clase Bismarck", "de-DE": "Bismarck-Klasse", "ru-RU": "Тип «Бисмарк»" },
  { source: "大和级", "zh-TW": "大和級", "en-US": "Yamato class", "ja-JP": "大和型", "es-ES": "Clase Yamato", "de-DE": "Yamato-Klasse", "ru-RU": "Тип «Ямато»" },
  { source: "黎塞留级", "zh-TW": "黎塞留級", "en-US": "Richelieu class", "ja-JP": "リシュリュー級", "es-ES": "Clase Richelieu", "de-DE": "Richelieu-Klasse", "ru-RU": "Тип «Ришелье»" },
  { source: "1942改装型", "zh-TW": "1942改裝型", "en-US": "1942 refit", "ja-JP": "1942年改装型", "es-ES": "Reforma de 1942", "de-DE": "Umbau 1942", "ru-RU": "Модернизация 1942 г." },
  { source: "1941战斗形态", "zh-TW": "1941戰鬥形態", "en-US": "1941 combat configuration", "ja-JP": "1941年戦闘仕様", "es-ES": "Configuración de combate de 1941", "de-DE": "Gefechtsausführung 1941", "ru-RU": "Боевая конфигурация 1941 г." },
  { source: "1940完整设计型", "zh-TW": "1940完整設計型", "en-US": "1940 full design", "ja-JP": "1940年原設計仕様", "es-ES": "Diseño completo de 1940", "de-DE": "Vollentwurf 1940", "ru-RU": "Полный проект 1940 г." },
  { source: "1943形态", "zh-TW": "1943形態", "en-US": "1943 configuration", "ja-JP": "1943年仕様", "es-ES": "Configuración de 1943", "de-DE": "Ausführung 1943", "ru-RU": "Конфигурация 1943 г." },
  { source: "1943完成态", "zh-TW": "1943完成態", "en-US": "1943 completed configuration", "ja-JP": "1943年完成仕様", "es-ES": "Configuración final de 1943", "de-DE": "Fertiggestellte Ausführung 1943", "ru-RU": "Завершённая конфигурация 1943 г." },
  { source: "房主已断开 · 已返回多人目录。", "zh-TW": "房主已斷線 · 已返回多人目錄。", "en-US": "Host disconnected · Returned to the multiplayer directory.", "ja-JP": "ホスト切断 · マルチプレイ一覧に戻りました。", "es-ES": "Anfitrión desconectado · Se volvió al directorio multijugador.", "de-DE": "Host getrennt · Zum Mehrspieler-Verzeichnis zurückgekehrt.", "ru-RU": "Ведущий отключился · выполнен возврат к списку сетевых комнат." },
  { source: "房间已关闭 · 已返回多人目录。", "zh-TW": "房間已關閉 · 已返回多人目錄。", "en-US": "Room closed · Returned to the multiplayer directory.", "ja-JP": "部屋が終了 · マルチプレイ一覧に戻りました。", "es-ES": "Sala cerrada · Se volvió al directorio multijugador.", "de-DE": "Raum geschlossen · Zum Mehrspieler-Verzeichnis zurückgekehrt.", "ru-RU": "Комната закрыта · выполнен возврат к списку сетевых комнат." },
  { source: "目标积分达到胜利门槛", "zh-TW": "目標積分達到勝利門檻", "en-US": "Objective score reached the victory threshold", "ja-JP": "目標スコアが勝利条件に到達", "es-ES": "La puntuación de objetivo alcanzó el umbral de victoria", "de-DE": "Zielpunktzahl hat die Siegschwelle erreicht", "ru-RU": "Очки целей достигли порога победы" },
  { source: "战斗时间结束", "zh-TW": "戰鬥時間結束", "en-US": "Battle time limit reached", "ja-JP": "戦闘制限時間に到達", "es-ES": "Se agotó el tiempo de batalla", "de-DE": "Gefechtszeit abgelaufen", "ru-RU": "Время боя истекло" },
  { source: "一方舰队被击沉", "zh-TW": "一方艦隊被擊沉", "en-US": "One fleet was sunk", "ja-JP": "一方の艦隊が全滅", "es-ES": "Una flota fue hundida", "de-DE": "Eine Flotte wurde versenkt", "ru-RU": "Один из флотов потоплен" },
  { source: "主机地址已复制。", "zh-TW": "主機位址已複製。", "en-US": "Host address copied.", "ja-JP": "ホストアドレスをコピーしました。", "es-ES": "Dirección del anfitrión copiada.", "de-DE": "Host-Adresse kopiert.", "ru-RU": "Адрес хоста скопирован." },
  { source: "无法复制主机地址。", "zh-TW": "無法複製主機位址。", "en-US": "Could not copy the host address.", "ja-JP": "ホストアドレスをコピーできませんでした。", "es-ES": "No se pudo copiar la dirección del anfitrión.", "de-DE": "Host-Adresse konnte nicht kopiert werden.", "ru-RU": "Не удалось скопировать адрес хоста." },
  { source: "返回联机大厅", "zh-TW": "返回連線大廳", "en-US": "Return to Lobby", "ja-JP": "ロビーに戻る", "es-ES": "Volver a la sala", "de-DE": "Zurück zur Lobby", "ru-RU": "Вернуться в лобби" },
  { source: "主机地址", "zh-TW": "主機位址", "en-US": "Host Address", "ja-JP": "ホストアドレス", "es-ES": "Dirección del anfitrión", "de-DE": "Host-Adresse", "ru-RU": "Адрес хоста" },
  { source: "复制地址", "zh-TW": "複製位址", "en-US": "Copy Address", "ja-JP": "アドレスをコピー", "es-ES": "Copiar dirección", "de-DE": "Adresse kopieren", "ru-RU": "Копировать адрес" },
  { source: "客席已断开 · AI 已接管。", "zh-TW": "客席已斷線 · AI 已接管。", "en-US": "Guest disconnected · AI has taken over.", "ja-JP": "ゲスト切断 · AI が引き継ぎました。", "es-ES": "Invitado desconectado · La IA tomó el control.", "de-DE": "Gast getrennt · KI hat übernommen.", "ru-RU": "Гость отключился · управление принял ИИ." },
  { source: "客席已离开 · AI 已接管。", "zh-TW": "客席已離開 · AI 已接管。", "en-US": "Guest left · AI has taken over.", "ja-JP": "ゲスト退出 · AI が引き継ぎました。", "es-ES": "El invitado salió · La IA tomó el control.", "de-DE": "Gast hat verlassen · KI hat übernommen.", "ru-RU": "Гость вышел · управление принял ИИ." },
  { source: "房主已断开 · 已返回主菜单。", "zh-TW": "房主已斷線 · 已返回主選單。", "en-US": "Host disconnected · Returned to the main menu.", "ja-JP": "ホスト切断 · メインメニューに戻りました。", "es-ES": "Anfitrión desconectado · Se volvió al menú principal.", "de-DE": "Host getrennt · Zum Hauptmenü zurückgekehrt.", "ru-RU": "Хост отключился · выполнен возврат в главное меню." },
  { source: "房间已关闭 · 已返回主菜单。", "zh-TW": "房間已關閉 · 已返回主選單。", "en-US": "Room closed · Returned to the main menu.", "ja-JP": "ルーム終了 · メインメニューに戻りました。", "es-ES": "Sala cerrada · Se volvió al menú principal.", "de-DE": "Raum geschlossen · Zum Hauptmenü zurückgekehrt.", "ru-RU": "Комната закрыта · выполнен возврат в главное меню." },
  { source: "收到无效的联机消息。", "zh-TW": "收到無效的連線訊息。", "en-US": "An invalid multiplayer message was received.", "ja-JP": "無効なマルチプレイメッセージを受信しました。", "es-ES": "Se recibió un mensaje multijugador no válido.", "de-DE": "Eine ungültige Mehrspieler-Nachricht wurde empfangen.", "ru-RU": "Получено недопустимое сетевое сообщение." },
  { source: "联机消息处理失败。", "zh-TW": "連線訊息處理失敗。", "en-US": "Failed to process a multiplayer message.", "ja-JP": "マルチプレイメッセージの処理に失敗しました。", "es-ES": "No se pudo procesar un mensaje multijugador.", "de-DE": "Eine Mehrspieler-Nachricht konnte nicht verarbeitet werden.", "ru-RU": "Не удалось обработать сетевое сообщение." },
  { source: "多人联机已禁用开发者改动。", "zh-TW": "多人連線已停用開發者改動。", "en-US": "Developer mutations are disabled in multiplayer.", "ja-JP": "マルチプレイでは開発者用変更は無効です。", "es-ES": "Las modificaciones de desarrollador están desactivadas en multijugador.", "de-DE": "Entwickleränderungen sind im Mehrspieler deaktiviert.", "ru-RU": "Изменения разработчика отключены в сетевой игре." },
  { source: "联机已关闭。", "zh-TW": "連線已關閉。", "en-US": "Multiplayer has closed.", "ja-JP": "マルチプレイを終了しました。", "es-ES": "El multijugador se ha cerrado.", "de-DE": "Der Mehrspieler wurde geschlossen.", "ru-RU": "Сетевая игра закрыта." },
  { source: "房间已满。", "zh-TW": "房間已滿。", "en-US": "The room is full.", "ja-JP": "ルームは満員です。", "es-ES": "La sala está llena.", "de-DE": "Der Raum ist voll.", "ru-RU": "Комната заполнена." },
  { source: "联机操作失败。", "zh-TW": "連線操作失敗。", "en-US": "The multiplayer operation failed.", "ja-JP": "マルチプレイ操作に失敗しました。", "es-ES": "La operación multijugador falló.", "de-DE": "Der Mehrspielervorgang ist fehlgeschlagen.", "ru-RU": "Сетевая операция завершилась ошибкой." },
  { source: "游戏版本不一致，无法加入。", "zh-TW": "遊戲版本不一致，無法加入。", "en-US": "Game versions do not match.", "ja-JP": "ゲームバージョンが一致しません。", "es-ES": "Las versiones del juego no coinciden.", "de-DE": "Die Spielversionen stimmen nicht überein.", "ru-RU": "Версии игры не совпадают." },
  { source: "内容哈希不一致，无法加入。", "zh-TW": "內容雜湊不一致，無法加入。", "en-US": "Game content does not match.", "ja-JP": "ゲーム内容が一致しません。", "es-ES": "El contenido del juego no coincide.", "de-DE": "Die Spielinhalte stimmen nicht überein.", "ru-RU": "Содержимое игры не совпадает." },
  { source: "当前方案未通过联机校验。", "zh-TW": "目前方案未通過連線驗證。", "en-US": "The current build failed multiplayer validation.", "ja-JP": "現在の構成はマルチプレイ検証に失敗しました。", "es-ES": "La configuración actual no superó la validación multijugador.", "de-DE": "Die aktuelle Konfiguration hat die Mehrspielerprüfung nicht bestanden.", "ru-RU": "Текущая сборка не прошла сетевую проверку." },
  { source: "该联机实例已在房间中。", "zh-TW": "該連線實例已在房間中。", "en-US": "This multiplayer instance is already in the room.", "ja-JP": "このインスタンスはすでにルーム内です。", "es-ES": "Esta instancia ya está en la sala.", "de-DE": "Diese Instanz befindet sich bereits im Raum.", "ru-RU": "Этот экземпляр уже находится в комнате." },
  { source: "加入请求被拒绝。", "zh-TW": "加入請求被拒絕。", "en-US": "The join request was rejected.", "ja-JP": "参加要求が拒否されました。", "es-ES": "La solicitud de unión fue rechazada.", "de-DE": "Die Beitrittsanfrage wurde abgelehnt.", "ru-RU": "Запрос на вход отклонён." },
  { source: "联机消息超出允许大小。", "zh-TW": "連線訊息超出允許大小。", "en-US": "The multiplayer message exceeded the size limit.", "ja-JP": "マルチプレイメッセージが上限を超えました。", "es-ES": "El mensaje multijugador superó el límite de tamaño.", "de-DE": "Die Mehrspieler-Nachricht überschritt das Größenlimit.", "ru-RU": "Сетевое сообщение превысило допустимый размер." },
  { source: "联机连接已断开。", "zh-TW": "連線已中斷。", "en-US": "The multiplayer connection was lost.", "ja-JP": "マルチプレイ接続が切断されました。", "es-ES": "Se perdió la conexión multijugador.", "de-DE": "Die Mehrspielerverbindung wurde getrennt.", "ru-RU": "Сетевое соединение разорвано." },
  { source: "加入房间超时。", "zh-TW": "加入房間逾時。", "en-US": "Joining the room timed out.", "ja-JP": "ルーム参加がタイムアウトしました。", "es-ES": "Se agotó el tiempo para entrar en la sala.", "de-DE": "Zeitüberschreitung beim Raumbeitritt.", "ru-RU": "Время входа в комнату истекло." },
  { source: "尚未加入联机房间。", "zh-TW": "尚未加入連線房間。", "en-US": "You have not joined a multiplayer room.", "ja-JP": "マルチプレイルームに参加していません。", "es-ES": "Aún no te has unido a una sala multijugador.", "de-DE": "Du bist keinem Mehrspielerraum beigetreten.", "ru-RU": "Вы ещё не вошли в сетевую комнату." },
  { source: "仅房主可启动。", "zh-TW": "僅房主可啟動。", "en-US": "Only the host can start.", "ja-JP": "開始できるのはホストのみです。", "es-ES": "Solo el anfitrión puede iniciar.", "de-DE": "Nur der Host kann starten.", "ru-RU": "Запуск доступен только хосту." },
  { source: "房主已断开。", "zh-TW": "房主已斷線。", "en-US": "The host disconnected.", "ja-JP": "ホストが切断されました。", "es-ES": "El anfitrión se desconectó.", "de-DE": "Der Host wurde getrennt.", "ru-RU": "Хост отключился." },
  { source: "多人联机", "zh-TW": "多人連線", "en-US": "LAN Multiplayer", "ja-JP": "LAN マルチプレイ", "es-ES": "Multijugador LAN", "de-DE": "LAN-Mehrspieler", "ru-RU": "LAN-мультиплеер" },
  { source: "局域网双人合作入口", "zh-TW": "局域網雙人合作入口", "en-US": "Two-player LAN co-op", "ja-JP": "2人LAN協力入口", "es-ES": "Acceso cooperativo LAN para dos jugadores", "de-DE": "Einstieg für LAN-Koop zu zweit", "ru-RU": "Вход в LAN-кооп на двоих" },
  { source: "创建或加入 2 人局域网房间。", "zh-TW": "建立或加入 2 人局域網房間。", "en-US": "Create or join a two-player LAN room.", "ja-JP": "2人用LANルームを作成または参加します。", "es-ES": "Crea o únete a una sala LAN para 2 jugadores.", "de-DE": "Erstelle oder betrete einen LAN-Raum für zwei Spieler.", "ru-RU": "Создайте или присоединитесь к LAN-комнате на 2 игроков." },
  { source: "创建房间", "zh-TW": "建立房間", "en-US": "Create Room", "ja-JP": "ルームを作成", "es-ES": "Crear sala", "de-DE": "Raum erstellen", "ru-RU": "Создать комнату" },
  { source: "搜索局域网房间", "zh-TW": "搜尋局域網房間", "en-US": "Search LAN Rooms", "ja-JP": "LANルームを検索", "es-ES": "Buscar salas LAN", "de-DE": "LAN-Räume suchen", "ru-RU": "Искать LAN-комнаты" },
  { source: "刷新", "zh-TW": "重新整理", "en-US": "Refresh", "ja-JP": "更新", "es-ES": "Actualizar", "de-DE": "Aktualisieren", "ru-RU": "Обновить" },
  { source: "返回任务", "zh-TW": "返回任務", "en-US": "Back to Mission", "ja-JP": "任務に戻る", "es-ES": "Volver a la misión", "de-DE": "Zurück zur Mission", "ru-RU": "Назад к заданию" },
  { source: "房间名称", "zh-TW": "房間名稱", "en-US": "Room Name", "ja-JP": "ルーム名", "es-ES": "Nombre de la sala", "de-DE": "Raumname", "ru-RU": "Название комнаты" },
  { source: "手动输入 IPv4", "zh-TW": "手動輸入 IPv4", "en-US": "Enter IPv4 Manually", "ja-JP": "IPv4 を手動入力", "es-ES": "Introducir IPv4 manualmente", "de-DE": "IPv4 manuell eingeben", "ru-RU": "Ввести IPv4 вручную" },
  { source: "允许端口", "zh-TW": "允許連接埠", "en-US": "Allowed Port", "ja-JP": "許可ポート", "es-ES": "Puerto permitido", "de-DE": "Erlaubter Port", "ru-RU": "Разрешённый порт" },
  { source: "加入房间", "zh-TW": "加入房間", "en-US": "Join Room", "ja-JP": "ルームに参加", "es-ES": "Unirse a la sala", "de-DE": "Raum beitreten", "ru-RU": "Войти в комнату" },
  { source: "局域网联机仅在桌面版可用。", "zh-TW": "局域網連線僅在桌面版可用。", "en-US": "LAN multiplayer is only available in the desktop build.", "ja-JP": "LAN マルチプレイはデスクトップ版でのみ利用できます。", "es-ES": "El multijugador LAN solo está disponible en la versión de escritorio.", "de-DE": "LAN-Mehrspieler ist nur in der Desktop-Version verfügbar.", "ru-RU": "LAN-мультиплеер доступен только в настольной версии." },
  { source: "手动加入也需要桌面版联机桥。", "zh-TW": "手動加入也需要桌面版連線橋接。", "en-US": "Manual join also requires the desktop LAN bridge.", "ja-JP": "手動参加にもデスクトップ版の LAN ブリッジが必要です。", "es-ES": "La unión manual también requiere el puente LAN de escritorio.", "de-DE": "Auch der manuelle Beitritt benötigt die Desktop-LAN-Brücke.", "ru-RU": "Для ручного входа тоже нужен настольный LAN-мост." },
  { source: "请输入规范 IPv4 地址。", "zh-TW": "請輸入標準 IPv4 位址。", "en-US": "Enter a canonical IPv4 address.", "ja-JP": "正規の IPv4 アドレスを入力してください。", "es-ES": "Introduce una dirección IPv4 canónica.", "de-DE": "Gib eine kanonische IPv4-Adresse ein.", "ru-RU": "Введите канонический IPv4-адрес." },
  { source: "请选择 47778 到 47788 之间的端口。", "zh-TW": "請選擇 47778 到 47788 之間的連接埠。", "en-US": "Choose a port between 47778 and 47788.", "ja-JP": "47778 から 47788 のポートを選択してください。", "es-ES": "Elige un puerto entre 47778 y 47788.", "de-DE": "Wähle einen Port zwischen 47778 und 47788.", "ru-RU": "Выберите порт от 47778 до 47788." },
  { source: "局域网房间目录", "zh-TW": "局域網房間目錄", "en-US": "LAN Room Directory", "ja-JP": "LANルーム一覧", "es-ES": "Directorio de salas LAN", "de-DE": "LAN-Raumverzeichnis", "ru-RU": "Каталог LAN-комнат" },
  { source: "近似延迟（最近广播）", "zh-TW": "近似延遲（最近廣播）", "en-US": "Approximate latency (latest announcement)", "ja-JP": "近似遅延（直近のブロードキャスト）", "es-ES": "Latencia aproximada (último anuncio)", "de-DE": "Ungefähre Latenz (letzte Ankündigung)", "ru-RU": "Примерная задержка (последний анонс)" },
  { source: "正在搜索房间…", "zh-TW": "正在搜尋房間…", "en-US": "Searching for rooms…", "ja-JP": "ルームを検索中…", "es-ES": "Buscando salas…", "de-DE": "Suche nach Räumen…", "ru-RU": "Поиск комнат…" },
  { source: "未发现可加入的房间。", "zh-TW": "未發現可加入的房間。", "en-US": "No joinable rooms found.", "ja-JP": "参加できるルームが見つかりません。", "es-ES": "No se encontraron salas disponibles.", "de-DE": "Keine beitretbaren Räume gefunden.", "ru-RU": "Подходящие комнаты не найдены." },
  { source: "房间名", "zh-TW": "房間名", "en-US": "Room", "ja-JP": "ルーム名", "es-ES": "Sala", "de-DE": "Raum", "ru-RU": "Комната" },
  { source: "主机", "zh-TW": "主機", "en-US": "Host", "ja-JP": "ホスト", "es-ES": "Anfitrión", "de-DE": "Host", "ru-RU": "Хост" },
  { source: "席位", "zh-TW": "席位", "en-US": "Seats", "ja-JP": "席", "es-ES": "Plazas", "de-DE": "Plätze", "ru-RU": "Места" },
  { source: "游戏版本", "zh-TW": "遊戲版本", "en-US": "Game Version", "ja-JP": "ゲームバージョン", "es-ES": "Versión del juego", "de-DE": "Spielversion", "ru-RU": "Версия игры" },
  { source: "房间状态", "zh-TW": "房間狀態", "en-US": "Room Status", "ja-JP": "ルーム状態", "es-ES": "Estado de la sala", "de-DE": "Raumstatus", "ru-RU": "Статус комнаты" },
  { source: "加入", "zh-TW": "加入", "en-US": "Join", "ja-JP": "参加", "es-ES": "Unirse", "de-DE": "Beitreten", "ru-RU": "Войти" },
  { source: "联机大厅", "zh-TW": "連線大廳", "en-US": "Multiplayer Lobby", "ja-JP": "マルチプレイロビー", "es-ES": "Sala multijugador", "de-DE": "Mehrspieler-Lobby", "ru-RU": "Сетевая комната" },
  { source: "房主席位", "zh-TW": "房主席位", "en-US": "Host Seat", "ja-JP": "ホスト席", "es-ES": "Plaza del anfitrión", "de-DE": "Host-Platz", "ru-RU": "Место хоста" },
  { source: "客席位", "zh-TW": "客席位", "en-US": "Guest Seat", "ja-JP": "ゲスト席", "es-ES": "Plaza del invitado", "de-DE": "Gast-Platz", "ru-RU": "Место гостя" },
  { source: "房主", "zh-TW": "房主", "en-US": "Host", "ja-JP": "ホスト", "es-ES": "Anfitrión", "de-DE": "Host", "ru-RU": "Хост" },
  { source: "访客", "zh-TW": "訪客", "en-US": "Guest", "ja-JP": "ゲスト", "es-ES": "Invitado", "de-DE": "Gast", "ru-RU": "Гость" },
  { source: "已连接", "zh-TW": "已連線", "en-US": "Connected", "ja-JP": "接続済み", "es-ES": "Conectado", "de-DE": "Verbunden", "ru-RU": "Подключён" },
  { source: "未连接", "zh-TW": "未連線", "en-US": "Disconnected", "ja-JP": "未接続", "es-ES": "Desconectado", "de-DE": "Getrennt", "ru-RU": "Не подключён" },
  { source: "准备状态", "zh-TW": "準備狀態", "en-US": "Ready Status", "ja-JP": "準備状態", "es-ES": "Estado de preparación", "de-DE": "Bereitschaftsstatus", "ru-RU": "Статус готовности" },
  { source: "已准备", "zh-TW": "已準備", "en-US": "Ready", "ja-JP": "準備完了", "es-ES": "Listo", "de-DE": "Bereit", "ru-RU": "Готов" },
  { source: "未准备", "zh-TW": "未準備", "en-US": "Not Ready", "ja-JP": "未準備", "es-ES": "No listo", "de-DE": "Nicht bereit", "ru-RU": "Не готов" },
  { source: "本地方案", "zh-TW": "本地方案", "en-US": "Local Build", "ja-JP": "ローカル構成", "es-ES": "Configuración local", "de-DE": "Lokale Konfiguration", "ru-RU": "Локальная сборка" },
  { source: "选择本地已保存方案", "zh-TW": "選擇本地已儲存方案", "en-US": "Choose a saved local build", "ja-JP": "保存済みのローカル構成を選択", "es-ES": "Elige una configuración local guardada", "de-DE": "Gespeicherte lokale Konfiguration wählen", "ru-RU": "Выберите сохранённую локальную сборку" },
  { source: "该方案未达到最低出海配置", "zh-TW": "該方案未達到最低出海配置", "en-US": "This build does not meet the minimum sea-ready loadout.", "ja-JP": "この構成は最低出撃構成を満たしていません。", "es-ES": "Esta configuración no cumple el mínimo para zarpar.", "de-DE": "Diese Konfiguration erfüllt nicht die minimale Einsatzbereitschaft.", "ru-RU": "Эта сборка не соответствует минимальной мореготовности." },
  { source: "启动战斗", "zh-TW": "啟動戰鬥", "en-US": "Start Battle", "ja-JP": "戦闘を開始", "es-ES": "Iniciar batalla", "de-DE": "Gefecht starten", "ru-RU": "Начать бой" },
  { source: "离开房间", "zh-TW": "離開房間", "en-US": "Leave Room", "ja-JP": "ルームを退出", "es-ES": "Salir de la sala", "de-DE": "Raum verlassen", "ru-RU": "Покинуть комнату" },
  { source: "仅房主可启动", "zh-TW": "僅房主可啟動", "en-US": "Only the host can start", "ja-JP": "開始できるのはホストのみです", "es-ES": "Solo el anfitrión puede iniciar", "de-DE": "Nur der Host kann starten", "ru-RU": "Только хост может запустить бой" },
  { source: "当前客席无需启动操作。", "zh-TW": "目前客席無需啟動操作。", "en-US": "The guest does not start the match.", "ja-JP": "ゲストは開始操作を行いません。", "es-ES": "El invitado no inicia la partida.", "de-DE": "Der Gast startet das Gefecht nicht.", "ru-RU": "Гость не запускает бой." },
  { source: "请先选择一套可出海的本地方案。", "zh-TW": "請先選擇一套可出海的本地方案。", "en-US": "Choose a sea-ready local build first.", "ja-JP": "先に出撃可能なローカル構成を選択してください。", "es-ES": "Elige primero una configuración local apta para zarpar.", "de-DE": "Wähle zuerst eine seetaugliche lokale Konfiguration.", "ru-RU": "Сначала выберите локальную сборку, готовую к выходу в море." },
  { source: "房间中", "zh-TW": "房間中", "en-US": "In Lobby", "ja-JP": "ルーム待機中", "es-ES": "En sala", "de-DE": "Im Raum", "ru-RU": "В комнате" },
  { source: "战斗中", "zh-TW": "戰鬥中", "en-US": "In Match", "ja-JP": "戦闘中", "es-ES": "En combate", "de-DE": "Im Gefecht", "ru-RU": "В бою" },
  { source: "不兼容", "zh-TW": "不相容", "en-US": "Incompatible", "ja-JP": "非互換", "es-ES": "Incompatible", "de-DE": "Inkompatibel", "ru-RU": "Несовместимо" },
  { source: "等待客席加入并准备。", "zh-TW": "等待客席加入並準備。", "en-US": "Waiting for the guest to join and ready up.", "ja-JP": "ゲストの参加と準備完了を待っています。", "es-ES": "Esperando a que el invitado entre y se prepare.", "de-DE": "Warte auf Beitritt und Bereitschaft des Gasts.", "ru-RU": "Ожидание подключения и готовности гостя." },
  { source: "等待房主启动战斗。", "zh-TW": "等待房主啟動戰鬥。", "en-US": "Waiting for the host to start the battle.", "ja-JP": "ホストが戦闘を開始するのを待っています。", "es-ES": "Esperando a que el anfitrión inicie la batalla.", "de-DE": "Warte darauf, dass der Host das Gefecht startet.", "ru-RU": "Ожидание запуска боя хостом." },
  { source: "本地房间", "zh-TW": "本地房間", "en-US": "Local Room", "ja-JP": "ローカルルーム", "es-ES": "Sala local", "de-DE": "Lokaler Raum", "ru-RU": "Локальная комната" },
  { source: "局域网联机桥不可用。", "zh-TW": "區域網連線橋不可用。", "en-US": "The LAN bridge is unavailable.", "ja-JP": "LAN ブリッジは利用できません。", "es-ES": "El puente LAN no está disponible.", "de-DE": "Die LAN-Brücke ist nicht verfügbar.", "ru-RU": "Мост LAN недоступен." },
  { source: "创建房间失败。", "zh-TW": "建立房間失敗。", "en-US": "Failed to create the room.", "ja-JP": "ルームの作成に失敗しました。", "es-ES": "No se pudo crear la sala.", "de-DE": "Der Raum konnte nicht erstellt werden.", "ru-RU": "Не удалось создать комнату." },
  { source: "搜索尚未连接到对战会话", "zh-TW": "搜尋尚未連接到對戰會話", "en-US": "Search is not connected to a battle session yet.", "ja-JP": "検索はまだ対戦セッションに接続されていません", "es-ES": "La búsqueda todavía no está conectada a una sesión de combate.", "de-DE": "Die Suche ist noch nicht mit einer Gefechtssitzung verbunden.", "ru-RU": "Поиск ещё не подключён к боевой сессии." },
  { source: "加入房间失败。", "zh-TW": "加入房間失敗。", "en-US": "Failed to join the room.", "ja-JP": "ルームへの参加に失敗しました。", "es-ES": "No se pudo entrar en la sala.", "de-DE": "Der Beitritt zum Raum ist fehlgeschlagen.", "ru-RU": "Не удалось присоединиться к комнате." },
  { source: "离开房间失败。", "zh-TW": "離開房間失敗。", "en-US": "Failed to leave the room.", "ja-JP": "ルームの退出に失敗しました。", "es-ES": "No se pudo salir de la sala.", "de-DE": "Das Verlassen des Raums ist fehlgeschlagen.", "ru-RU": "Не удалось покинуть комнату." },
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
  { source: "自动最优装配", "zh-TW": "自動最佳配裝", "en-US": "Auto-Equip Best", "ja-JP": "最適装備を自動装着", "es-ES": "Equipar automáticamente lo mejor", "de-DE": "Beste Ausrüstung automatisch", "ru-RU": "Автоустановка лучшего" },
  { source: "自动装配完成", "zh-TW": "自動配裝完成", "en-US": "Auto-equip complete", "ja-JP": "自動装備が完了しました", "es-ES": "Equipamiento automático completado", "de-DE": "Automatische Ausrüstung abgeschlossen", "ru-RU": "Автооснащение завершено" },
  { source: "当前已是库存最优配置", "zh-TW": "目前已是庫存最佳配裝", "en-US": "Already using the best available inventory", "ja-JP": "現在の在庫で最適な装備です", "es-ES": "Ya usa el mejor equipo disponible", "de-DE": "Bereits bestmöglich aus dem Inventar ausgerüstet", "ru-RU": "Уже установлено лучшее доступное оснащение" },
  { source: "未达到最低出海配置", "zh-TW": "未達最低出海配裝", "en-US": "Below minimum sea-ready loadout", "ja-JP": "最低出航装備を満たしていません", "es-ES": "No cumple el equipamiento mínimo para zarpar", "de-DE": "Mindest-Ausrüstung für Auslaufen fehlt", "ru-RU": "Не выполнен минимум оснащения для выхода" },
  { source: "军械库与仓库", "zh-TW": "軍械庫與倉庫", "en-US": "Armory and Inventory", "ja-JP": "武器庫と倉庫", "es-ES": "Arsenal e inventario", "de-DE": "Arsenal und Inventar", "ru-RU": "Арсенал и склад" },
  { source: "标准配置", "zh-TW": "標準配裝", "en-US": "Standard Loadout", "ja-JP": "標準装備", "es-ES": "Equipamiento estándar", "de-DE": "Standardausrüstung", "ru-RU": "Стандартное оснащение" },
  { source: "继承配置", "zh-TW": "繼承配裝", "en-US": "Migrated Loadout", "ja-JP": "移行済み装備", "es-ES": "Equipamiento migrado", "de-DE": "Migrierte Ausrüstung", "ru-RU": "Перенесённое оснащение" },
  { source: "配置", "zh-TW": "配裝", "en-US": "Loadout", "ja-JP": "装備", "es-ES": "Equipamiento", "de-DE": "Ausrüstung", "ru-RU": "Оснащение" },
  { source: "可出击", "zh-TW": "可出擊", "en-US": "Battle-ready", "ja-JP": "出撃可能", "es-ES": "Listo para el combate", "de-DE": "Gefechtsbereit", "ru-RU": "Готов к бою" },
  { source: "组件不足", "zh-TW": "組件不足", "en-US": "Insufficient equipment", "ja-JP": "装備不足", "es-ES": "Equipo insuficiente", "de-DE": "Ausrüstung unvollständig", "ru-RU": "Недостаточно оснащения" },
  { source: "最多保存 24 套方案", "zh-TW": "最多儲存 24 套方案", "en-US": "Up to 24 builds can be saved", "ja-JP": "保存できる構成は24件までです", "es-ES": "Se pueden guardar hasta 24 configuraciones", "de-DE": "Es können bis zu 24 Konfigurationen gespeichert werden", "ru-RU": "Можно сохранить не более 24 комплектаций" },
  { source: "请输入方案名称", "zh-TW": "請輸入方案名稱", "en-US": "Enter a build name", "ja-JP": "構成名を入力してください", "es-ES": "Introduce un nombre de configuración", "de-DE": "Konfigurationsnamen eingeben", "ru-RU": "Введите название комплектации" },
  { source: "已采购", "zh-TW": "已採購", "en-US": "Purchased", "ja-JP": "調達完了", "es-ES": "Comprado", "de-DE": "Beschafft", "ru-RU": "Приобретено" },
  { source: "研发完成", "zh-TW": "研發完成", "en-US": "Research complete", "ja-JP": "研究完了", "es-ES": "Investigación completada", "de-DE": "Forschung abgeschlossen", "ru-RU": "Исследование завершено" },
  { source: "已出售", "zh-TW": "已出售", "en-US": "Sold", "ja-JP": "売却済み", "es-ES": "Vendido", "de-DE": "Verkauft", "ru-RU": "Продано" },
  { source: "已拆解", "zh-TW": "已拆解", "en-US": "Salvaged", "ja-JP": "解体済み", "es-ES": "Desguazado", "de-DE": "Zerlegt", "ru-RU": "Разобрано" },
  { source: "交易未完成，请检查资源与研发状态。", "zh-TW": "交易未完成，請檢查資源與研發狀態。", "en-US": "Transaction failed. Check resources and research status.", "ja-JP": "取引に失敗しました。資源と研究状況を確認してください。", "es-ES": "La transacción falló. Comprueba los recursos y la investigación.", "de-DE": "Transaktion fehlgeschlagen. Ressourcen und Forschungsstatus prüfen.", "ru-RU": "Операция не выполнена. Проверьте ресурсы и состояние исследования." },
  { source: "无法处理已安装组件或最后一套基础组件。", "zh-TW": "無法處理已安裝組件或最後一套基礎組件。", "en-US": "Installed equipment and the last baseline set cannot be recycled.", "ja-JP": "装備中の部品と最後の基本装備は処分できません。", "es-ES": "No se puede reciclar equipo instalado ni el último conjunto básico.", "de-DE": "Installierte Ausrüstung und der letzte Basissatz können nicht verwertet werden.", "ru-RU": "Нельзя утилизировать установленное оснащение или последний базовый комплект." },
  { source: "型号", "zh-TW": "型號", "en-US": "models", "ja-JP": "型式", "es-ES": "modelos", "de-DE": "Modelle", "ru-RU": "моделей" },
  { source: "件组件", "zh-TW": "件組件", "en-US": "components", "ja-JP": "個の部品", "es-ES": "componentes", "de-DE": "Komponenten", "ru-RU": "компонентов" },
  { source: "持有", "zh-TW": "持有", "en-US": "Owned", "ja-JP": "所有", "es-ES": "En propiedad", "de-DE": "Besitz", "ru-RU": "В наличии" },
  { source: "已安装", "zh-TW": "已安裝", "en-US": "Installed", "ja-JP": "装備中", "es-ES": "Instalado", "de-DE": "Installiert", "ru-RU": "Установлено" },
  { source: "有重复件", "zh-TW": "有重複件", "en-US": "Duplicates available", "ja-JP": "重複あり", "es-ES": "Hay duplicados", "de-DE": "Duplikate vorhanden", "ru-RU": "Есть дубликаты" },
  { source: "在库", "zh-TW": "在庫", "en-US": "In inventory", "ja-JP": "在庫", "es-ES": "En inventario", "de-DE": "Im Inventar", "ru-RU": "На складе" },
  { source: "研发解锁", "zh-TW": "研發解鎖", "en-US": "Research unlock", "ja-JP": "研究で解除", "es-ES": "Desbloquear con investigación", "de-DE": "Durch Forschung freischalten", "ru-RU": "Открыть исследованием" },
  { source: "选择组件查看库存详情", "zh-TW": "選擇組件查看庫存詳情", "en-US": "Select equipment to view inventory details", "ja-JP": "装備を選択して在庫詳細を表示", "es-ES": "Selecciona equipo para ver los detalles", "de-DE": "Ausrüstung auswählen, um Inventardetails anzuzeigen", "ru-RU": "Выберите оснащение для просмотра сведений" },
  { source: "选择组件查看详情", "zh-TW": "選擇組件查看詳情", "en-US": "Select equipment to view details", "ja-JP": "装備を選択して詳細を表示", "es-ES": "Selecciona equipo para ver los detalles", "de-DE": "Ausrüstung auswählen, um Details anzuzeigen", "ru-RU": "Выберите оснащение для просмотра сведений" },
  { source: "该分类暂无组件", "zh-TW": "該分類暫無組件", "en-US": "No equipment in this category", "ja-JP": "このカテゴリには装備がありません", "es-ES": "No hay equipo en esta categoría", "de-DE": "Keine Ausrüstung in dieser Kategorie", "ru-RU": "В этой категории нет оснащения" },
  { source: "当前已安装", "zh-TW": "目前已安裝", "en-US": "Currently installed", "ja-JP": "現在装備中", "es-ES": "Instalado actualmente", "de-DE": "Derzeit installiert", "ru-RU": "Уже установлено" },
  { source: "候选装配预览", "zh-TW": "候選配裝預覽", "en-US": "Candidate loadout preview", "ja-JP": "候補装備プレビュー", "es-ES": "Vista previa del equipo candidato", "de-DE": "Vorschau der möglichen Ausrüstung", "ru-RU": "Предпросмотр выбранного оснащения" },
  { source: "不兼容检视预览", "zh-TW": "不相容檢視預覽", "en-US": "Incompatible equipment preview", "ja-JP": "非対応装備プレビュー", "es-ES": "Vista previa de equipo incompatible", "de-DE": "Vorschau inkompatibler Ausrüstung", "ru-RU": "Предпросмотр несовместимого оснащения" },
  { source: "选择组件即可临时预览", "zh-TW": "選擇組件即可暫時預覽", "en-US": "Select equipment for a temporary preview", "ja-JP": "装備を選択して一時プレビュー", "es-ES": "Selecciona equipo para una vista previa", "de-DE": "Ausrüstung für eine Vorschau auswählen", "ru-RU": "Выберите оснащение для временного предпросмотра" },
  { source: "当前舰型无可用槽位", "zh-TW": "目前艦型無可用槽位", "en-US": "No compatible slot on the current ship", "ja-JP": "現在の艦艇に対応スロットがありません", "es-ES": "El buque actual no tiene una ranura compatible", "de-DE": "Das aktuelle Schiff hat keinen kompatiblen Platz", "ru-RU": "На текущем корабле нет совместимого слота" },
  { source: "美国", "zh-TW": "美國", "en-US": "United States", "ja-JP": "アメリカ", "es-ES": "Estados Unidos", "de-DE": "Vereinigte Staaten", "ru-RU": "США" },
  { source: "英国", "zh-TW": "英國", "en-US": "United Kingdom", "ja-JP": "イギリス", "es-ES": "Reino Unido", "de-DE": "Vereinigtes Königreich", "ru-RU": "Великобритания" },
  { source: "日本", "zh-TW": "日本", "en-US": "Japan", "ja-JP": "日本", "es-ES": "Japón", "de-DE": "Japan", "ru-RU": "Япония" },
  { source: "德国", "zh-TW": "德國", "en-US": "Germany", "ja-JP": "ドイツ", "es-ES": "Alemania", "de-DE": "Deutschland", "ru-RU": "Германия" },
  { source: "苏联", "zh-TW": "蘇聯", "en-US": "Soviet Union", "ja-JP": "ソビエト連邦", "es-ES": "Unión Soviética", "de-DE": "Sowjetunion", "ru-RU": "СССР" },
  { source: "法国", "zh-TW": "法國", "en-US": "France", "ja-JP": "フランス", "es-ES": "Francia", "de-DE": "Frankreich", "ru-RU": "Франция" },
  { source: "可安装", "zh-TW": "可安裝", "en-US": "Compatible", "ja-JP": "装備可能", "es-ES": "Compatible", "de-DE": "Kompatibel", "ru-RU": "Совместимо" },
  { source: "研发资料", "zh-TW": "研發資料", "en-US": "Research Points", "ja-JP": "研究ポイント", "es-ES": "Puntos de investigación", "de-DE": "Forschungspunkte", "ru-RU": "Очки исследования" },
  { source: "采购组件", "zh-TW": "採購組件", "en-US": "Purchase Equipment", "ja-JP": "装備を購入", "es-ES": "Comprar equipo", "de-DE": "Ausrüstung kaufen", "ru-RU": "Купить оснащение" },
  { source: "资源不足", "zh-TW": "資源不足", "en-US": "Insufficient Resources", "ja-JP": "資源不足", "es-ES": "Recursos insuficientes", "de-DE": "Nicht genug Ressourcen", "ru-RU": "Недостаточно ресурсов" },
  { source: "研发资料不足", "zh-TW": "研發資料不足", "en-US": "Insufficient Research Points", "ja-JP": "研究ポイント不足", "es-ES": "Puntos de investigación insuficientes", "de-DE": "Nicht genug Forschungspunkte", "ru-RU": "Недостаточно очков исследования" },
  { source: "当前装备", "zh-TW": "目前裝備", "en-US": "Current Equipment", "ja-JP": "現在の装備", "es-ES": "Equipo actual", "de-DE": "Aktuelle Ausrüstung", "ru-RU": "Текущее оснащение" },
  { source: "相对核心增益", "zh-TW": "相對核心增益", "en-US": "Relative Core Bonus", "ja-JP": "相対コア効果", "es-ES": "Bonificación central relativa", "de-DE": "Relativer Kernbonus", "ru-RU": "Относительный основной бонус" },
  { source: "适配", "zh-TW": "適配", "en-US": "Compatibility", "ja-JP": "適合性", "es-ES": "Compatibilidad", "de-DE": "Kompatibilität", "ru-RU": "Совместимость" },
  { source: "当前持有", "zh-TW": "目前持有", "en-US": "Currently Owned", "ja-JP": "現在の所有数", "es-ES": "En propiedad", "de-DE": "Aktueller Bestand", "ru-RU": "В наличии" },
  { source: "持有 / 已安装", "zh-TW": "持有 / 已安裝", "en-US": "Owned / Installed", "ja-JP": "所有 / 装備中", "es-ES": "En propiedad / Instalado", "de-DE": "Besitz / Installiert", "ru-RU": "В наличии / Установлено" },
  { source: "可处理", "zh-TW": "可處理", "en-US": "Available to Recycle", "ja-JP": "処分可能", "es-ES": "Disponible para reciclar", "de-DE": "Verwertbar", "ru-RU": "Доступно для переработки" },
  { source: "当前舰级不可用", "zh-TW": "目前艦級不可用", "en-US": "Unavailable for Current Ship", "ja-JP": "現在の艦艇では使用不可", "es-ES": "No disponible para el buque actual", "de-DE": "Für aktuelles Schiff nicht verfügbar", "ru-RU": "Недоступно для текущего корабля" },
  {"source":"装配位置","zh-TW":"配裝位置","en-US":"Mount position","ja-JP":"装備位置","es-ES":"Posición de montaje","de-DE":"Einbauposition","ru-RU":"Позиция установки"},
  {"source":"自动选择槽位","zh-TW":"自動選擇槽位","en-US":"Automatic slot selection","ja-JP":"スロットを自動選択","es-ES":"Selección automática de ranura","de-DE":"Automatische Platzwahl","ru-RU":"Автоматический выбор слота"},
  {"source":"槽位","zh-TW":"槽位","en-US":"Slot","ja-JP":"スロット","es-ES":"Ranura","de-DE":"Platz","ru-RU":"Слот"},
  {"source":"空槽","zh-TW":"空槽","en-US":"Empty","ja-JP":"空き","es-ES":"Vacía","de-DE":"Frei","ru-RU":"Пусто"},
  {"source":"替换所选槽位","zh-TW":"替換所選槽位","en-US":"Replace selected slot","ja-JP":"選択したスロットを交換","es-ES":"Reemplazar la ranura seleccionada","de-DE":"Ausgewählten Platz ersetzen","ru-RU":"Заменить выбранный слот"},
  { source: "槽位占用", "zh-TW": "槽位占用", "en-US": "Slot Usage", "ja-JP": "スロット使用状況", "es-ES": "Uso de ranuras", "de-DE": "Platzbelegung", "ru-RU": "Занято слотов" },
  { source: "安装到空槽", "zh-TW": "安裝到空槽", "en-US": "Install in Empty Slot", "ja-JP": "空きスロットに装備", "es-ES": "Instalar en ranura vacía", "de-DE": "In freien Platz einbauen", "ru-RU": "Установить в свободный слот" },
  { source: "替换首个槽位", "zh-TW": "替換首個槽位", "en-US": "Replace First Slot", "ja-JP": "最初のスロットを交換", "es-ES": "Reemplazar la primera ranura", "de-DE": "Ersten Platz ersetzen", "ru-RU": "Заменить первый слот" },
  { source: "该舰级不可安装", "zh-TW": "該艦級不可安裝", "en-US": "Cannot Install on This Ship", "ja-JP": "この艦艇には装備不可", "es-ES": "No se puede instalar en este buque", "de-DE": "Auf diesem Schiff nicht installierbar", "ru-RU": "Нельзя установить на этот корабль" },
  { source: "只处理未安装的副本。", "zh-TW": "只處理未安裝的副本。", "en-US": "Only uninstalled copies will be recycled.", "ja-JP": "未装備の複製のみ処分します。", "es-ES": "Solo se reciclarán las copias no instaladas.", "de-DE": "Nur nicht installierte Exemplare werden verwertet.", "ru-RU": "Перерабатываются только неустановленные экземпляры." },
  { source: "舰队预设中的副本已安装，无法处理。", "zh-TW": "艦隊預設中的副本已安裝，無法處理。", "en-US": "Copies used by fleet builds cannot be recycled.", "ja-JP": "艦隊構成で使用中のため処分できません。", "es-ES": "Las copias usadas en configuraciones de flota no se pueden reciclar.", "de-DE": "In Flottenkonfigurationen verwendete Exemplare können nicht verwertet werden.", "ru-RU": "Экземпляры в комплектациях флота нельзя переработать." },
  { source: "最后一套基础组件受到保护。", "zh-TW": "最後一套基礎組件受到保護。", "en-US": "The last baseline set is protected.", "ja-JP": "最後の基本装備は保護されています。", "es-ES": "El último conjunto básico está protegido.", "de-DE": "Der letzte Basissatz ist geschützt.", "ru-RU": "Последний базовый комплект защищён." },
  { source: "出售", "zh-TW": "出售", "en-US": "Sell", "ja-JP": "売却", "es-ES": "Vender", "de-DE": "Verkaufen", "ru-RU": "Продать" },
  { source: "拆解", "zh-TW": "拆解", "en-US": "Salvage", "ja-JP": "解体", "es-ES": "Desguazar", "de-DE": "Zerlegen", "ru-RU": "Разобрать" },
  { source: "件", "zh-TW": "件", "en-US": "unit", "ja-JP": "個", "es-ES": "unidad", "de-DE": "Stück", "ru-RU": "ед." },
  { source: "界面音效", "zh-TW": "介面音效", "en-US": "Interface Sounds", "ja-JP": "UI効果音", "es-ES": "Sonidos de interfaz", "de-DE": "Menü-Sounds", "ru-RU": "Звуки интерфейса" },
  { source: "舰桥继电器", "zh-TW": "艦橋繼電器", "en-US": "Bridge Relay", "ja-JP": "艦橋リレー", "es-ES": "Relé de puente", "de-DE": "Brückenrelais", "ru-RU": "Реле мостика" },
  { source: "机械拨杆", "zh-TW": "機械撥桿", "en-US": "Mechanical Lever", "ja-JP": "機械レバー", "es-ES": "Palanca mecánica", "de-DE": "Mechanischer Hebel", "ru-RU": "Механический рычаг" },
  { source: "像素电报码", "zh-TW": "像素電報碼", "en-US": "Pixel Telegraph", "ja-JP": "ピクセル電信音", "es-ES": "Telégrafo píxel", "de-DE": "Pixeltelegraf", "ru-RU": "Пиксельный телеграф" },
  { source: "试听", "zh-TW": "試聽", "en-US": "Preview", "ja-JP": "試聴", "es-ES": "Escuchar", "de-DE": "Anhören", "ru-RU": "Прослушать" },
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
  { source: "击沉敌舰，或控制中央 A 区率先达到 2000 分。双方争夺时，舰体状态更好的一方会缓慢建立区域优势。当前本地配装会真实影响战斗性能。", "zh-TW": "擊沉敵艦，或控制中央 A 區率先達到 2000 分。雙方爭奪時，艦體狀態較好的一方會逐步建立區域優勢。目前本機配裝會實際影響戰鬥性能。", "en-US": "Sink the enemy fleet or control central Zone A and reach 2,000 points first. When contested, the healthier fleet slowly gains control. Your current local loadout directly affects combat performance.", "ja-JP": "敵艦隊を撃沈するか、中央A区域を制圧して先に2000ポイントへ到達してください。競合中は状態の良い艦隊が徐々に優勢になります。現在の装備は戦闘性能に反映されます。", "es-ES": "Hunde a la flota enemiga o controla la zona A central y alcanza primero 2000 puntos. Si hay disputa, la flota en mejor estado gana ventaja poco a poco. Tu equipamiento local afecta al combate.", "de-DE": "Versenke die gegnerische Flotte oder kontrolliere Zone A und erreiche zuerst 2000 Punkte. Bei umkämpfter Zone gewinnt die intaktere Flotte langsam die Oberhand. Deine aktuelle Ausrüstung wirkt sich direkt aus.", "ru-RU": "Потопите вражеский флот или захватите центральную зону A и первыми наберите 2000 очков. В спорной зоне преимущество постепенно получает более боеспособный флот. Текущая комплектация влияет на бой." },
  { source: "使用当前船坞配装出击，或进入海试场验证舰船性能。", "zh-TW": "使用目前船塢配裝出擊，或進入海試場驗證艦艇性能。", "en-US": "Deploy with the current dockyard loadout, or enter sea trials to test ship performance.", "ja-JP": "造船所の現在装備で出撃するか、海上公試で性能を確認します。", "es-ES": "Combate con el equipamiento actual o entra en pruebas de mar para comprobar el rendimiento.", "de-DE": "Rücke mit der aktuellen Werftausrüstung aus oder teste das Schiff in der Seeerprobung.", "ru-RU": "Выйдите в бой с текущей комплектацией или проверьте корабль на ходовых испытаниях." },
  { source: "无现金货币、无会员、无限时促销。所有战斗组件均可定向研发和购买。", "zh-TW": "無現金貨幣、無會員、無限時促銷。所有戰鬥組件皆可定向研發與購買。", "en-US": "No cash currency, memberships or timed sales. Every combat component can be researched and purchased directly.", "ja-JP": "有料通貨・会員制度・期間限定セールはありません。すべての戦闘部品を指定研究・購入できます。", "es-ES": "Sin moneda de pago, membresías ni ofertas temporales. Todos los componentes pueden investigarse y comprarse directamente.", "de-DE": "Keine Echtgeldwährung, Mitgliedschaften oder zeitlich begrenzten Angebote. Alle Kampfkomponenten sind gezielt erforsch- und kaufbar.", "ru-RU": "Без платной валюты, подписок и временных акций. Любой боевой компонент можно целенаправленно исследовать и купить." },
  { source: "补给券只能通过有效战斗获得，不能购买。全部组件也可在上方直接研发采购。", "zh-TW": "補給券只能透過有效戰鬥取得，無法購買。所有組件亦可在上方直接研發採購。", "en-US": "Supply tickets are earned only through valid battles and cannot be bought. Every component is also available through direct research and procurement above.", "ja-JP": "補給券は有効な戦闘でのみ獲得でき、購入できません。すべての部品は上で直接研究・調達もできます。", "es-ES": "Los vales de suministro solo se ganan en batallas válidas y no se compran. Todos los componentes también pueden investigarse y adquirirse directamente.", "de-DE": "Versorgungsscheine gibt es nur für gültige Gefechte; sie sind nicht käuflich. Alle Komponenten können oben direkt erforscht und beschafft werden.", "ru-RU": "Талоны снабжения выдаются только за полноценные бои и не продаются. Все компоненты также доступны через прямое исследование и закупку." },
  { source: "战场模拟已暂停。舰装更换需返回主菜单。", "zh-TW": "戰場模擬已暫停。更換艦裝需返回主選單。", "en-US": "The battle simulation is paused. Return to the main menu to change equipment.", "ja-JP": "戦闘シミュレーションを一時停止しました。装備変更はメインメニューへ戻ってください。", "es-ES": "La simulación está en pausa. Vuelve al menú principal para cambiar el equipamiento.", "de-DE": "Die Gefechtssimulation ist pausiert. Kehre zum Hauptmenü zurück, um die Ausrüstung zu ändern.", "ru-RU": "Симуляция боя приостановлена. Для смены оснащения вернитесь в главное меню." },
  { source: "20 分钟 · 击沉或 2000 分获胜 · 3v3 混编舰队", "zh-TW": "20 分鐘 · 擊沉或 2000 分獲勝 · 3v3 混編艦隊", "en-US": "20 minutes · sink or reach 2,000 points · mixed 3v3 fleets", "ja-JP": "20分 · 撃沈または2000ポイントで勝利 · 3対3混成艦隊", "es-ES": "20 minutos · hunde o logra 2000 puntos · flotas mixtas 3v3", "de-DE": "20 Minuten · Versenken oder 2000 Punkte · gemischte 3-gegen-3-Flotten", "ru-RU": "20 минут · потопление или 2000 очков · смешанные флоты 3 на 3" },
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
    if (node.parentElement?.closest("[data-i18n-keyed]")) { node = next; continue; }
    const translated = translateGameText(node.textContent ?? "", locale);
    if (translated !== node.textContent) node.textContent = translated;
    node = next;
  }
  for (const element of [root, ...Array.from(root.querySelectorAll("[aria-label],[title],[placeholder]"))]) {
    if (element.closest("[data-i18n-keyed]")) continue;
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
