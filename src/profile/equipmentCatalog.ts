import type { MainGunId } from "../ships/components";

export type EquipmentRarity = "common" | "purple" | "gold" | "redGold";
export type EquipmentCategory =
  | "mainGun" | "torpedo" | "antiAir" | "sideGun"
  | "magazine" | "engine" | "steering";
export type HullId = "destroyer" | "lightCruiser" | "battleship";

export interface EquipmentDefinition {
  id: string;
  category: EquipmentCategory;
  rarity: EquipmentRarity;
  name: string;
  origin: string;
  description: string;
  compatibleHulls: HullId[];
  mainGunId?: MainGunId;
  bonus: number;
  drawback?: number;
}

export const RARITY_META: Record<EquipmentRarity, { label: string; color: string; guarantee: number }> = {
  common: { label: "常备舰装", color: "#7f9da0", guarantee: 0 },
  purple: { label: "改装舰装", color: "#a574d1", guarantee: 10 },
  gold: { label: "精锐舰装", color: "#d9ad55", guarantee: 50 },
  redGold: { label: "舰队试验舰装", color: "#e36a4e", guarantee: 100 },
};

export const CATEGORY_META: Record<EquipmentCategory, { label: string; icon: string; slot: string }> = {
  mainGun: { label: "主炮", icon: "fa-solid fa-gun", slot: "主炮槽 ×1" },
  torpedo: { label: "鱼雷", icon: "fa-solid fa-rocket", slot: "鱼雷槽 ×2" },
  antiAir: { label: "防空炮", icon: "fa-solid fa-crosshairs", slot: "防空槽 ×2" },
  sideGun: { label: "侧炮", icon: "fa-solid fa-shield-halved", slot: "侧炮槽" },
  magazine: { label: "弹药库", icon: "fa-solid fa-boxes-stacked", slot: "弹药库槽 ×1" },
  engine: { label: "引擎", icon: "fa-solid fa-gears", slot: "引擎槽 ×1" },
  steering: { label: "转向机", icon: "fa-solid fa-dharmachakra", slot: "转向槽 ×1" },
};

const bonuses: Record<EquipmentRarity, number> = {
  common: 0.03,
  purple: 0.08,
  gold: 0.14,
  redGold: 0.22,
};

interface HistoricalEquipment {
  name: string;
  origin: string;
  description: string;
}

const historicalModels: Record<EquipmentCategory, Record<EquipmentRarity, HistoricalEquipment>> = {
  mainGun: {
    common: {
      name: "QF 4.7英寸 Mk IX / CP Mk XVIII",
      origin: "英国 · J/K/N级驱逐舰",
      description: "1938年型单装速射炮与炮架组合；结构直接、重量适中，作为驱逐舰常备火炮基准。",
    },
    purple: {
      name: "三年式 12.7厘米/50 C型双联装",
      origin: "日本 · 阳炎级驱逐舰",
      description: "日本海军驱逐舰主炮系统，双联装炮塔提高单次齐射密度，但对空能力受炮架限制。",
    },
    gold: {
      name: "5英寸/38 Mk 12 / Mk 38双联装",
      origin: "美国 · 萨姆纳级驱逐舰",
      description: "二战美制双用途主炮与双联炮座，兼顾射速、装填组织和高低射界。",
    },
    redGold: {
      name: "QF 4.5英寸 Mk III / RP10 Mk IV",
      origin: "英国 · 战斗级驱逐舰",
      description: "战争后期遥控动力双联炮架原型，强调快速跟踪、持续射击与双用途作战。",
    },
  },
  torpedo: {
    common: {
      name: "21英寸 Mk IX鱼雷",
      origin: "英国 · 舰队驱逐舰",
      description: "英国水面舰常用21英寸鱼雷，以均衡射程和装药作为基础水面打击方案。",
    },
    purple: {
      name: "G7a T1蒸汽瓦斯鱼雷",
      origin: "德国 · 1934/1936型驱逐舰",
      description: "可选航速与航程的德制533毫米鱼雷；尾迹较明显，但战术设定灵活。",
    },
    gold: {
      name: "Mk 15 Mod 3鱼雷",
      origin: "美国 · 弗莱彻级驱逐舰",
      description: "美国海军二战驱逐舰标准水面发射鱼雷，使用五联装发射器形成集中雷击。",
    },
    redGold: {
      name: "九三式三型氧气鱼雷",
      origin: "日本 · 水雷战队",
      description: "以氧气推进换取远射程与大装药的610毫米鱼雷，威力突出但舰上储存风险更高。",
    },
  },
  antiAir: {
    common: {
      name: "20毫米 Oerlikon Mk II",
      origin: "英美海军 · 近程防空",
      description: "二战舰艇广泛使用的单管近程机关炮，轻便可靠，适合填补近距离射界。",
    },
    purple: {
      name: "QF 2磅 Mk VIII八联装“砰砰炮”",
      origin: "英国 · 舰队防空",
      description: "多管齐射形成密集弹幕，适合舰队近程防空，但整套炮座体积较大。",
    },
    gold: {
      name: "40毫米 Bofors Mk I双联装",
      origin: "盟军舰艇 · 中近程防空",
      description: "战争中后期广泛采用的40毫米自动炮，射程、威力和持续射击能力均衡。",
    },
    redGold: {
      name: "40毫米 Bofors Mk 2四联装 / Mk 51",
      origin: "美国 · 雷达哨戒驱逐舰",
      description: "四联装博福斯炮配合Mk 51指挥仪的原型组合，强化集中火力和目标跟踪。",
    },
  },
  sideGun: {
    common: {
      name: "10.5厘米 SK C/33双联装",
      origin: "德国 · 巡洋舰/战列舰副炮",
      description: "德制双用途副炮，适合大型舰艇舷侧与上层建筑周边的中程防御。",
    },
    purple: {
      name: "QF 5.25英寸 Mk I双联装",
      origin: "英国 · 乔治五世级",
      description: "兼顾对海和对空的英制双用途副炮；炮弹较重，对装填组织要求较高。",
    },
    gold: {
      name: "15厘米 SK C/28双联装",
      origin: "德国 · 俾斯麦级",
      description: "大型舰艇中口径副炮，强调对驱逐舰与轻型目标的水面压制能力。",
    },
    redGold: {
      name: "6英寸/47 Mk 16三联装",
      origin: "美国 · 克利夫兰级巡洋舰",
      description: "美制轻巡洋舰三联主炮系统，在大型舰体上提供高射速与密集舷侧火力。",
    },
  },
  magazine: {
    common: {
      name: "Mk IX QF定装弹处理间",
      origin: "英国 · 4.7英寸炮供弹体系",
      description: "参考英制速射炮弹药处理间和扬弹路线，维护简单，装填提升有限。",
    },
    purple: {
      name: "SK C/34药筒式扬弹链",
      origin: "德国 · 驱逐舰供弹体系",
      description: "参考德制药筒式弹药与分层输送布置，缩短炮塔内的下一发准备时间。",
    },
    gold: {
      name: "Mk 38双路上部供弹间",
      origin: "美国 · 双联5英寸炮塔",
      description: "参考Mk 38双联炮座上部供弹间，为两根炮管维持更稳定的连续装填节奏。",
    },
    redGold: {
      name: "防闪燃扬弹链与水淹系统",
      origin: "美国 · 战争后期损管标准",
      description: "以防闪燃隔离、扬弹路线和弹药库水淹能力为原型；装填组织更强，但储弹密度提高风险。",
    },
  },
  engine: {
    common: {
      name: "Parsons齿轮汽轮机组",
      origin: "英国 · J/K/N级驱逐舰",
      description: "参考英国舰队驱逐舰的齿轮汽轮机布置，输出平稳、维护体系成熟。",
    },
    purple: {
      name: "舰本式齿轮汽轮机组",
      origin: "日本 · 阳炎级驱逐舰",
      description: "参考日本海军阳炎级动力布置，在续航、舰体空间和高速输出之间取平衡。",
    },
    gold: {
      name: "General Electric齿轮汽轮机组",
      origin: "美国 · 弗莱彻级驱逐舰",
      description: "参考弗莱彻级双轴动力系统，强调可靠的大功率输出和战时损管冗余。",
    },
    redGold: {
      name: "Wagner高压锅炉 / Deschimag机组",
      origin: "德国 · 1936A型驱逐舰",
      description: "参考德制高压蒸汽动力系统，以复杂维护换取高输出；游戏中作为舰队试验动力。",
    },
  },
  steering: {
    common: {
      name: "J/K/N级单舵电液舵机",
      origin: "英国 · 舰队驱逐舰布置",
      description: "参考英国驱逐舰单舵与电液操舵系统，响应可预测，适合作为基础转向机构。",
    },
    purple: {
      name: "阳炎级双泵电液舵机",
      origin: "日本 · 水雷战队布置",
      description: "参考阳炎级操舵动力与泵组冗余，改善持续转舵时的响应稳定性。",
    },
    gold: {
      name: "弗莱彻级双回路电液舵机",
      origin: "美国 · 驱逐舰损管布置",
      description: "参考弗莱彻级分舱和冗余操舵思路，提高战损环境下的转向响应。",
    },
    redGold: {
      name: "基林级高速电液舵机",
      origin: "美国 · 战争后期驱逐舰布置",
      description: "参考加长型高速驱逐舰的操舵需求，强化高速航行时的舵角建立速度。",
    },
  },
};

const gunByRarity: Record<EquipmentRarity, MainGunId> = {
  common: "mk1-single",
  purple: "mk2-twin",
  gold: "mk3-twin",
  redGold: "mk4-twin",
};

const categories = Object.keys(CATEGORY_META) as EquipmentCategory[];
const rarities = Object.keys(RARITY_META) as EquipmentRarity[];

export const EQUIPMENT_CATALOG: EquipmentDefinition[] = categories.flatMap((category) =>
  rarities.map((rarity) => ({
    id: `${category}-${rarity}`,
    category,
    rarity,
    name: historicalModels[category][rarity].name,
    origin: historicalModels[category][rarity].origin,
    description: historicalModels[category][rarity].description,
    compatibleHulls: category === "sideGun" ? ["lightCruiser", "battleship"] : ["destroyer", "lightCruiser", "battleship"],
    mainGunId: category === "mainGun" ? gunByRarity[rarity] : undefined,
    bonus: bonuses[rarity],
    drawback: category === "magazine" && rarity !== "common" ? bonuses[rarity] * 0.24 : undefined,
  })),
);

export const EQUIPMENT_BY_ID = Object.fromEntries(
  EQUIPMENT_CATALOG.map((item) => [item.id, item]),
) as Record<string, EquipmentDefinition>;

export const DESTROYER_SLOT_COUNTS: Record<EquipmentCategory, number> = {
  mainGun: 1,
  torpedo: 2,
  antiAir: 2,
  sideGun: 0,
  magazine: 1,
  engine: 1,
  steering: 1,
};

export function equipmentFor(category: EquipmentCategory, rarity: EquipmentRarity): EquipmentDefinition {
  return EQUIPMENT_BY_ID[`${category}-${rarity}`];
}
