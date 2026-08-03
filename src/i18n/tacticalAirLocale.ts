import type { GameLocale } from "./gameLocale";
import type {
  AircraftRole,
  AirMissionKind,
  AirSquadronPhase,
  AirWeaponKind,
} from "../sim/types";

export interface TacticalAirText {
  squadronStatus: string;
  aircraft: string;
  airframe: string;
  fuel: string;
  gunAmmo: string;
  ordnance: string;
  rearming: string;
  mission: string;
  noOrder: string;
  ownShip: string;
  friendlyShip: string;
  enemyShip: string;
  enemyAircraft: string;
  roles: Record<AircraftRole, string>;
  phases: Record<AirSquadronPhase, string>;
  weapons: Record<AirWeaponKind, string>;
  missions: Record<AirMissionKind, string>;
}

const zhCN: TacticalAirText = {
  squadronStatus: "航空队状态", aircraft: "架数", airframe: "机体", fuel: "油量",
  gunAmmo: "机炮", ordnance: "挂载", rearming: "整备", mission: "任务",
  noOrder: "等待命令", ownShip: "本舰", friendlyShip: "友舰", enemyShip: "敌舰",
  enemyAircraft: "敌方机群",
  roles: { fighter: "战斗机", diveBomber: "俯冲轰炸机", torpedoBomber: "鱼雷轰炸机" },
  phases: { ready: "待命", launching: "起飞", outbound: "出航", searching: "搜索", attackRun: "攻击航线", intercepting: "截击", patrolling: "巡逻", returning: "返航", landing: "降落", rearming: "整备", destroyed: "损失" },
  weapons: { machineGun: "机炮", heBomb: "HE航弹", aerialTorpedo: "航空鱼雷" },
  missions: { moveTo: "移动", defendShip: "护卫", interceptSquadron: "截击敌机", patrolArea: "区域巡逻", strikeShip: "对舰攻击", recall: "召回" },
};

export const TACTICAL_AIR_TEXT: Record<GameLocale, TacticalAirText> = {
  "zh-CN": zhCN,
  "zh-TW": {
    squadronStatus: "航空隊狀態", aircraft: "架數", airframe: "機體", fuel: "油量", gunAmmo: "機砲", ordnance: "掛載", rearming: "整備", mission: "任務", noOrder: "等待命令", ownShip: "本艦", friendlyShip: "友艦", enemyShip: "敵艦", enemyAircraft: "敵方機群",
    roles: { fighter: "戰鬥機", diveBomber: "俯衝轟炸機", torpedoBomber: "魚雷轟炸機" },
    phases: { ready: "待命", launching: "起飛", outbound: "出航", searching: "搜索", attackRun: "攻擊航線", intercepting: "攔截", patrolling: "巡邏", returning: "返航", landing: "降落", rearming: "整備", destroyed: "損失" },
    weapons: { machineGun: "機砲", heBomb: "HE航彈", aerialTorpedo: "航空魚雷" },
    missions: { moveTo: "移動", defendShip: "護衛", interceptSquadron: "攔截敵機", patrolArea: "區域巡邏", strikeShip: "對艦攻擊", recall: "召回" },
  },
  "en-US": {
    squadronStatus: "Air Group Status", aircraft: "Aircraft", airframe: "Strength", fuel: "Fuel", gunAmmo: "Gun ammo", ordnance: "Ordnance", rearming: "Rearming", mission: "Mission", noOrder: "Awaiting orders", ownShip: "Own ship", friendlyShip: "Friendly ship", enemyShip: "Enemy ship", enemyAircraft: "Enemy aircraft",
    roles: { fighter: "Fighter", diveBomber: "Dive bomber", torpedoBomber: "Torpedo bomber" },
    phases: { ready: "Ready", launching: "Launching", outbound: "Outbound", searching: "Searching", attackRun: "Attack run", intercepting: "Intercepting", patrolling: "Patrolling", returning: "Returning", landing: "Landing", rearming: "Rearming", destroyed: "Lost" },
    weapons: { machineGun: "Guns", heBomb: "HE bomb", aerialTorpedo: "Air torpedo" },
    missions: { moveTo: "Move", defendShip: "Guard", interceptSquadron: "Intercept", patrolArea: "Patrol area", strikeShip: "Strike ship", recall: "Recall" },
  },
  "ja-JP": {
    squadronStatus: "航空隊状況", aircraft: "機数", airframe: "戦力", fuel: "燃料", gunAmmo: "機銃弾", ordnance: "兵装", rearming: "再武装", mission: "任務", noOrder: "命令待機", ownShip: "自艦", friendlyShip: "味方艦", enemyShip: "敵艦", enemyAircraft: "敵航空隊",
    roles: { fighter: "戦闘機", diveBomber: "急降下爆撃機", torpedoBomber: "雷撃機" },
    phases: { ready: "待機", launching: "発進", outbound: "進出", searching: "捜索", attackRun: "攻撃航程", intercepting: "迎撃", patrolling: "哨戒", returning: "帰投", landing: "着陸", rearming: "再武装", destroyed: "喪失" },
    weapons: { machineGun: "機銃", heBomb: "HE爆弾", aerialTorpedo: "航空魚雷" },
    missions: { moveTo: "移動", defendShip: "護衛", interceptSquadron: "敵機迎撃", patrolArea: "区域哨戒", strikeShip: "対艦攻撃", recall: "帰投命令" },
  },
  "es-ES": {
    squadronStatus: "Estado de escuadrones", aircraft: "Aviones", airframe: "Fuerza", fuel: "Combustible", gunAmmo: "Munición", ordnance: "Armamento", rearming: "Rearmando", mission: "Misión", noOrder: "Esperando órdenes", ownShip: "Buque propio", friendlyShip: "Buque aliado", enemyShip: "Buque enemigo", enemyAircraft: "Aeronaves enemigas",
    roles: { fighter: "Caza", diveBomber: "Bombardero en picado", torpedoBomber: "Torpedero" },
    phases: { ready: "Listo", launching: "Despegando", outbound: "En ruta", searching: "Buscando", attackRun: "Ataque", intercepting: "Interceptando", patrolling: "Patrullando", returning: "Regresando", landing: "Aterrizando", rearming: "Rearmando", destroyed: "Perdido" },
    weapons: { machineGun: "Cañones", heBomb: "Bomba HE", aerialTorpedo: "Torpedo aéreo" },
    missions: { moveTo: "Mover", defendShip: "Escoltar", interceptSquadron: "Interceptar", patrolArea: "Patrullar zona", strikeShip: "Atacar buque", recall: "Retirar" },
  },
  "de-DE": {
    squadronStatus: "Fliegergruppenstatus", aircraft: "Flugzeuge", airframe: "Stärke", fuel: "Treibstoff", gunAmmo: "Bordmunition", ordnance: "Bewaffnung", rearming: "Aufrüstung", mission: "Auftrag", noOrder: "Wartet auf Befehl", ownShip: "Eigenes Schiff", friendlyShip: "Verbündetes Schiff", enemyShip: "Feindschiff", enemyAircraft: "Feindflugzeuge",
    roles: { fighter: "Jäger", diveBomber: "Sturzkampfbomber", torpedoBomber: "Torpedobomber" },
    phases: { ready: "Bereit", launching: "Startet", outbound: "Im Anflug", searching: "Sucht", attackRun: "Angriff", intercepting: "Abfangen", patrolling: "Patrouille", returning: "Rückflug", landing: "Landung", rearming: "Aufrüstung", destroyed: "Verloren" },
    weapons: { machineGun: "Bordwaffen", heBomb: "HE-Bombe", aerialTorpedo: "Lufttorpedo" },
    missions: { moveTo: "Verlegen", defendShip: "Geleitschutz", interceptSquadron: "Abfangen", patrolArea: "Gebietspatrouille", strikeShip: "Schiffsangriff", recall: "Rückruf" },
  },
  "ru-RU": {
    squadronStatus: "Состояние авиагрупп", aircraft: "Самолёты", airframe: "Боеспособность", fuel: "Топливо", gunAmmo: "Боезапас пушек", ordnance: "Подвеска", rearming: "Подготовка", mission: "Задача", noOrder: "Ожидание приказа", ownShip: "Свой корабль", friendlyShip: "Союзный корабль", enemyShip: "Корабль противника", enemyAircraft: "Авиация противника",
    roles: { fighter: "Истребитель", diveBomber: "Пикирующий бомбардировщик", torpedoBomber: "Торпедоносец" },
    phases: { ready: "Готов", launching: "Взлёт", outbound: "На маршруте", searching: "Поиск", attackRun: "Боевой заход", intercepting: "Перехват", patrolling: "Патруль", returning: "Возвращение", landing: "Посадка", rearming: "Подготовка", destroyed: "Потерян" },
    weapons: { machineGun: "Пушки", heBomb: "Фугасная бомба", aerialTorpedo: "Авиаторпеда" },
    missions: { moveTo: "Перемещение", defendShip: "Охрана", interceptSquadron: "Перехват", patrolArea: "Патруль зоны", strikeShip: "Атака корабля", recall: "Отзыв" },
  },
};

export const tacticalAirText = (locale: GameLocale): TacticalAirText =>
  TACTICAL_AIR_TEXT[locale];
