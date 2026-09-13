import { SUPPORTED_GAME_LOCALES, type GameLocale } from "./gameLocale";
type Row = readonly [string, string, string, string, string, string, string];
export const PORT_MESSAGES = {
  title: ["超级无聊战舰游戏", "超級無聊戰艦遊戲", "Super Boring Battleship Game", "超退屈な戦艦ゲーム", "El superaburrido juego de acorazados", "Das superlangweilige Kriegsschiffspiel", "Суперскучная игра о линкорах"],
  sail: ["出航", "出航", "Set sail", "出航", "Zarpar", "Auslaufen", "В бой"],
  port: ["船坞", "船塢", "Dockyard", "造船所", "Astillero", "Werft", "Верфь"],
  armory: ["军械库", "軍械庫", "Armory", "兵装庫", "Armería", "Arsenal", "Арсенал"],
  codex: ["图鉴", "圖鑑", "Collection", "図鑑", "Colección", "Sammlung", "Коллекция"],
  help: ["帮助", "說明", "Help", "ヘルプ", "Ayuda", "Hilfe", "Помощь"],
  settings: ["设置", "設定", "Settings", "設定", "Ajustes", "Einstellungen", "Настройки"],
  profile: ["舰长档案", "艦長檔案", "Captain profile", "艦長プロフィール", "Perfil del capitán", "Kapitänsprofil", "Профиль капитана"],
  equipment: ["装配", "裝配", "Equipment", "装備", "Equipamiento", "Ausrüstung", "Оснащение"],
  builds: ["配装方案", "配裝方案", "Loadouts", "保存構成", "Configuraciones", "Konfigurationen", "Сборки"],
  close: ["关闭", "關閉", "Close", "閉じる", "Cerrar", "Schließen", "Закрыть"],
  back: ["返回港口", "返回港口", "Back to port", "港に戻る", "Volver al puerto", "Zurück zum Hafen", "Вернуться в порт"],
  chooseMode: ["选择航程", "選擇航程", "Choose your voyage", "出航モードを選択", "Elige tu travesía", "Wähle deine Fahrt", "Выберите поход"],
  previousShips: ["前一组舰船", "上一組艦船", "Previous ships", "前の艦船", "Buques anteriores", "Vorherige Schiffe", "Предыдущие корабли"],
  nextShips: ["后一组舰船", "下一組艦船", "Next ships", "次の艦船", "Siguientes buques", "Weitere Schiffe", "Следующие корабли"],
  previewHelp: ["拖动舰船旋转，滚轮缩放。鼠标悬停查看组件，点击组件打开装配。", "拖曳艦船旋轉，滾輪縮放。滑鼠懸停查看組件，點擊組件開啟裝配。", "Drag the ship to rotate and scroll to zoom. Hover to identify a component; click it to open equipment.", "ドラッグで回転、ホイールで拡大縮小。部品にカーソルを合わせて確認し、クリックで装備を開きます。", "Arrastra para girar y usa la rueda para acercar. Pasa el cursor sobre una pieza para identificarla; haz clic para equiparla.", "Ziehen zum Drehen, Mausrad zum Zoomen. Zeige auf ein Bauteil für seinen Namen; klicke zum Ausrüsten.", "Перетаскивайте для вращения, колесо — масштаб. Наведите на компонент для названия; нажмите для оснащения."],
} as const satisfies Record<string, Row>;
export type PortMessageKey = keyof typeof PORT_MESSAGES;
export function portText(locale: GameLocale, key: PortMessageKey): string {
  return PORT_MESSAGES[key][Math.max(0, SUPPORTED_GAME_LOCALES.indexOf(locale))];
}
