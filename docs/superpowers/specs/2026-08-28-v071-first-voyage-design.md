# 0.7.1「首航闭环」设计规格

状态：用户已批准玩家流程与技术方案

日期：2026-08-28
目标版本：0.7.1

## 1. 目标

0.7.1 把现有“配船 → 出击 → 战斗 → 结算”从功能集合收束为首次玩家可以理解、完成并愿意重复的闭环，同时提升局域网失败时的可操作性。

本版本交付四个相互衔接的能力：

1. 新档案首次进入单人战斗时获得可跳过、可续接、可重玩的晴天 1v1 情境教学。
2. 单人战斗结果具备持久幂等的奖励结算、战绩摘要与清晰后续入口。
3. 船坞按当前完整配装显示全部外部武器与内部组件状态，候选预览不再覆盖实际装备。
4. LAN 失败提示给出可执行的私网、防火墙、AP 隔离和手动 IPv4 排查路径，并为真实双机验收留下如实记录。

## 2. 明确不在范围内

- 不增加 PvP、互联网匹配、第三名真人、专用服务器、房主迁移或断线重连。
- 不改变 LAN wire schema、协议修订号、权威模拟、快照频率或现有赛后保留房间语义。
- 不导入新的外部舰模；Fletcher 外部模型和 LOD 管线的用户可见垂直切片属于后续 B 阶段。
- 不增加新的任务类型、地形 AI、共享侦察规则或大规模平衡改写；这些属于后续 C 阶段。
- 不把奖励、教学或本地档案字段写入 `BattleState`，不污染确定性模拟和网络快照。

## 3. 玩家流程

### 3.1 首次单人教学

新档案首次点击“单人战斗”时先显示首航说明。玩家可以开始教学或跳过：

- 开始教学：直接以 `battle + teamSize: 1 + weatherId: "clear"` 启动正常规则战斗。现有 `FleetSize`、`FLEET_SIZES` 和场景构建器已经支持 1；不得另造 LAN 协议类型，必须以运行时测试确认场景实际生成双方各一舰。
- 在说明页跳过：把教学状态记为 `skipped`，随后进入普通战斗准备界面。
- 在战斗中跳过：保留当前晴天 1v1，停止后续教学卡片并把状态记为 `skipped`。

教学不锁定输入、不降低敌舰能力、不改变弹道、伤害或胜负规则。教学卡片是非阻塞 HUD 覆盖层，只有成功动作才推进：

1. `move`：玩家舰累计移动超过最小距离阈值，而不是只检测按键。
2. `aim`：玩家实际进入瞄准状态，`PlayerInput.isAiming === true`。
3. `fire`：玩家舰真实产生至少一个 `ShotEvent`，装填中或射界受阻不算完成。
4. `objective`：玩家成功打开 `M` 战术地图，并能看到中央目标区；被暂停/菜单拦截的按键不算完成。

退出游戏或返回菜单会保存当前步骤。下一次本地单人战斗从该步骤续接，但不再强制覆盖玩家已经选择的舰队规模和天气。完成或跳过后不自动出现；主菜单新增可直接进入的设置入口，其中提供“重玩首航教学”。在主菜单确认后才创建新的晴天 1v1 教学战；暂停菜单中的同一设置只把教学标记为“下一场重玩”，不会中止、替换或取消当前战斗的结算资格。教学战按普通本地单人规则结算奖励，每次重玩都是新的 `battleId`。

从 v6 迁移且 `battlesCompleted > 0` 的档案默认标记为已完成教学，避免老玩家被强制引导；设置中仍可重玩。

### 3.2 战斗结算

本地单人结算卡显示：

- 胜、负或平局及权威 `endReason`；
- 战斗时长；
- 玩家造成的伤害；
- 主炮与鱼雷命中数；
- 玩家击沉数；
- 双方最终团队目标积分；
- 本局银币、研发点、钢材、零件和补给券奖励；
- 奖励成功写入后的最新余额。

结算入口为“再战”“返回船坞”“返回主菜单”。再战创建新的 `battleId`。应用在终局时另存一次性的 `LastBattleDockTarget { shipClassId, savedBuildId? }`，它不参与奖励结算；“返回船坞”直接消费该目标并打开对应舰级，若方案仍存在则以只读查看态显示该方案，若已删除或失效则降级显示该舰级当前编辑配置并明确提示。完成船坞导航后才清除此目标，不能依赖已经结束的 launch context。

LAN 仍显示胜负、原因、战斗时长、双方目标积分以及现有协议已经提供的可见摘要，但不走本地单人经济结算，也不为补齐单人统计而新增 wire 字段；正常赛后唯一主路径是返回原联机大厅，保留现有 socket/room 并清除准备状态。

## 4. 架构与数据契约

### 4.1 启动上下文

应用层新增不可变启动上下文，ID 在本地单人战斗启动时由 `crypto.randomUUID()` 生成：

```ts
type BattleLaunchOrigin = "solo" | "lan" | "sea-trials";

interface BattleLaunchContext {
  battleId: string;
  mode: "battle";
  origin: "solo";
  rewardEligible: true;
  tutorialEligible: boolean;
  savedBuildId?: string;
}
```

LAN 与海试没有本地奖励上下文。`startMode`、普通再战和教学重玩各生成新 ID；暂停、恢复、渲染循环和同一终局的重复重绘必须复用当前 ID。离开本地战斗时清除已经结束的 launch context，避免它泄漏到 LAN、海试或下一场战斗；但未成功写入档案的 `pendingSettlement` 不得因返回主菜单、船坞或进入其他模式而丢弃。

### 4.2 战绩聚合

应用/会话层新增 `BattleTelemetryAccumulator`，只消费玩家可见的本地权威事件与状态，不反向修改模拟：

```ts
interface BattlePerformanceSummary {
  durationSeconds: number;
  damageDealt: number;
  shellHits: number;
  torpedoHits: number;
  shipsSunk: number;
  playerScore: number;
  enemyScore: number;
}
```

统计在战斗启动时清零，在本地玩家归属的事件与最终 objective state 上累计，终局后冻结。伤害及主炮/鱼雷命中必须比较受控玩家舰 `shipId`，再使用 `ImpactEvent.sourceId` 与 `projectileKind/weaponSource` 归属；只按 `team === "player"` 会把友方 AI 算入玩家，禁止这样实现。

模拟/本地会话层新增只供遥测消费的一次性 `ShipDestroyedAttributionEvent { targetId, creditedOwnerId?: string, cause }`。目标生命第一次跨过沉没阈值时发一次；直接伤害沿用明确 source，火灾/进水沿用触发该持续效果的已记录 owner，碰撞或无法证明的来源保持 `undefined` 并不计玩家击沉。该事件不进入 `replicationViewFor`、`PlayerSnapshotPayload.events` 或其他 LAN wire schema。玩家击沉数只比较 `creditedOwnerId === controlledShipId`，禁止从最后一次 Impact 或剩余生命值猜测。

### 4.3 Profile v7

`LocalProfile` 升级为 v7：

```ts
type OnboardingStepId = "move" | "aim" | "fire" | "objective";

interface OnboardingState {
  version: 1;
  status: "not-started" | "active" | "completed" | "skipped";
  currentStepId?: OnboardingStepId;
  seenStepIds: OnboardingStepId[];
}

interface SettledBattleRecord {
  battleId: string;
  reward: BattleEconomyReward;
}

interface LocalProfile {
  version: 7;
  // v6 的经济、库存、舰级、槽位、方案和设置关联字段原样保留
  onboarding: OnboardingState;
  settledBattles: SettledBattleRecord[];
}
```

存储键固定为 `grey-sea-local-profile-v7`；迁移来源为当前 `grey-sea-local-profile-v6`，更早版本仍由既有 v6 迁移器处理。`isUsableProfileV7` 的致命无效边界包括：版本不为 7，舰长名/经济/计数器的顶层类型错误，`materials`、`inventory`、`unlockedEquipment`、`loadout`、`slotLoadoutsByShipClass` 不是对象，`recentDraws`、`savedShipBuilds`、`settledBattles` 不是数组，`hullId/shipClassId` 类型错误，`selectedBattleBuildId` 既非字符串也非 null，或 `onboarding` 不是对象。这些情况回退 v6；容器内部的非法单项、越界数字和未知 ID 属于可修复字段，由 normalizer 过滤或安全降级。

`settledBattles` 只保证最近 128 场本地单人战斗的持久幂等。规范化时：

- 只接受受控长度的 UUID 字符串；
- 去重并保留最新顺序；
- 裁剪到 128 条；
- 记录具有有效 battleId 但 reward 损坏时，保留 ID 并将 reward 降级为全零，避免删除记录后再次发奖；非法 onboarding 值回退到安全默认值。

迁移顺序为：读取 v7 → 在 normalize 前调用 `isUsableProfileV7` → 无效或不存在时读取并规范化 v6 → 仅在 `setItem(v7)` 成功后将迁移结果作为当前档案。最低有效结构必须同时满足 `version === 7`、经济字段为有限非负数、当前舰级有效、槽位/库存/保存方案为预期容器、`onboarding` 为对象、`settledBattles` 为数组；其余单项再交给 normalizer 降级。v6 key 不删除，作为迁移或后续写入失败的回退。不得让“JSON 可解析但最低结构损坏的 v7”覆盖有效 v6，且失败时不得改写或删除 v6。

### 4.4 结算与持久化

结算是 profile 层的一次纯变换：

```ts
interface BattleResult {
  battleId: string;
  status: "player-won" | "enemy-won" | "draw";
  endReason?: BattleEndReason;
  performance: BattlePerformanceSummary;
}

interface BattleSettlement {
  battleId: string;
  applied: boolean;
  reward?: BattleEconomyReward;
  balancesAfter: EconomyBalances;
  profileAfter: LocalProfile;
}
```

`settleBattle(profile, result)` 对同一 `battleId` 最多应用一次奖励和 `battlesCompleted`。若已经存在，返回 `applied: false` 及已记录 reward，不重复发放。

持久化 API 必须返回 `ProfileSaveResult = { ok: true } | { ok: false; error: "storage-unavailable" | "quota" | "unknown" }`，不得吞掉异常。首次结算保留同一个 `pendingSettlement`，包含相同 battleId、相同 reward 和相同 `profileAfter`：

- 保存成功：更新内存 profile，清除 pending，结果卡显示“已入账”。
- 保存失败：不宣称奖励已入账，显示“奖励待保存，可重试”。
- 重试：仅再次写入原 `profileAfter`，不得重新计算奖励或生成新 ID。
- 余额、奖励记录和 settled ID 使用同一次 localStorage `setItem` 写入，获得单 key 下的整体替换语义。

`pendingSettlement` 是应用会话内的待提交事务。它在主菜单、船坞、LAN 和海试之间继续保留，并以常驻通知提供“重试保存”；未保存期间可以进入不产生本地经济的 LAN 或海试，也可以只读浏览其他页面。为避免旧 `profileAfter` 覆盖新改动，只要 pending 存在，所有会写 `LocalProfile` 的操作——舰长名、抽取/购买/出售/拆解、自动/手动装配、保存/覆盖/删除/选择方案和其他进度变更——都必须禁用并说明“先保存待结算奖励”；设备级 `GameSettings` 使用独立存储键，不受此锁影响。开始另一场可获得奖励的本地单人战斗之前，应用必须先重试原事务；仍失败则阻止该奖励战并显示原因。若 localStorage 本身不可用并且进程退出，内存 pending 无法跨进程恢复，界面必须明确警告这一限制，不能声称奖励已持久保存。

## 5. 船坞完整配装可视化

### 5.1 统一纯视觉计划

新增不依赖 Babylon.js 的 `ResolvedLoadoutVisualPlan`。唯一规范输入是 profile/生成舰船时的 `SlotLoadout`（或等价的 `InstalledEquipmentIds`），每个类别保持有序 `(EquipmentId | null)[]`；`BattleLoadout` 只是从它派生的模拟数值，不能作为完整视觉配置的反向来源。计划明确包含：

- `shipClassId`；
- 主炮型号和实际安装 mount 数；
- 按完整槽位顺序排列的鱼雷、防空炮、副炮和深水炸弹型号与 mount 数；
- 弹药库、引擎和舵机的型号及内部锚点；
- 空槽和非法槽位的降级结果。

profile 层不得依赖 render 层；dock 直接从当前槽位构建计划，战斗启动/生成实体时把同一份有序槽位快照登记到应用层 visual registry，并由 combat adapter 读取，不能从已压缩的 `mainGunId`、效率数值或 `ShipState` 反推。registry 键必须是 `(sessionScope, shipId)`：本地 reward battle 使用 `battleId`，LAN 使用当前 match/session scope；每次海试另生成只供渲染的 `crypto.randomUUID()` visual session scope，它不进入 `BattleState`、不产生奖励或教学上下文。登记后为不可变快照，终局离开、海试 restart、新局替换、离房或 runtime dispose 时清除整个 scope，禁止仅用可跨局复用的 `shipId`。LAN 继续使用现有已经验证并可见的大厅/快照配装字段，不新增 wire 字段。空槽不凭空补模型；失效 ID 只可降级为同类别 common 视觉，不能跨类别。

### 5.2 原子更新与候选层

`DockPreview.setLoadout(plan): Promise<LoadoutApplyResult>`（或具有同等可等待完成语义的 API）是唯一的整船实际配装入口：

1. 在新的 actual root 下构造完整装备。
2. 所有必需实体创建成功后，一次性替换旧 actual root。
3. 失败时 dispose 新 root，保留上一套完整可见配置。

异步外部舰体和实际 plan 更新共用以“舰级 + plan”递增的 generation token，旧请求不能回填新舰级或新配装。外部舰模失败时本次事务以程序化舰体成功降级；必需装备实体创建失败才回滚整套 actual root。调用方和测试可等待结果明确为 applied、superseded、fallback-applied 或 failed。候选 overlay 使用独立 token/root，不能取消或覆盖 actual 事务。

候选装备使用独立 inspection overlay root：

- 外部武器以半透明 ghost 表示替换位置；
- 不清空、不修改 actual root；
- 关闭详情后只 dispose overlay。

### 5.3 可见规则

- 主炮、鱼雷、防空炮、副炮和深水炸弹以实际型号、槽位和数量显示实体。
- 弹药库、引擎和舵机默认以舰体锚定 callout 显示型号和状态。
- 选中内部组件时，显示置顶、不会被不透明舰体遮挡的半透明内部区域标记；本版本不实现真实网格剖切。
- 船坞状态明确分为 `editingShipClassId`（当前编辑舰级）、`inspectionBuildId`（只读查看方案，可为空）和 profile 的 `selectedBattleBuildId`（出击方案）。
- “查看方案”只设置 inspection，不修改编辑槽位或出击方案；“载入为当前编辑配置”把方案槽位复制到对应舰级编辑态并清除 inspection，但不会静默覆盖原保存方案或自动设为出击方案；“设为出击舰”只更新 selected。
- 本版本不从船坞直接出击。玩家必须保存/覆盖方案、设为出击舰，再从战斗准备页启动；战斗准备页选择方案会更新 selected，之后进入船坞时默认只读查看该 selected 方案。
- 启动战斗时由同一个 selected build 同时生成 `BattleLaunchContext.savedBuildId`、规范有序槽位快照和 `BattleLoadout`；三者不一致或方案未达到最低出海条件时阻止启动。

`gameMenus.ts` 中船坞渲染、自动装配和方案管理拆到独立 `dockPanel`，但不进行与本版本无关的 profile 或菜单大重构。

## 6. 七语言完整目录

简中、繁中、英文、日文、西语、德语和俄语必须覆盖：

- 遍历当前装备目录中的每个装备，为其提供 `name`、`origin`、`description`；
- 15 个舰级的 `historicalArmament`；
- 装备详情行、稀有度、兼容性、槽位、候选/已装状态；
- 教学、结算、奖励保存状态和 LAN 故障指引；
- 所有动态模板中的数值插值。

使用稳定装备/舰级 ID 查本地化 catalog，不能依赖完整中文 DOM 文本替换。实现穷尽的 `EquipmentLocalizationCatalog`、`ShipClassLocalizationCatalog` 与动态 message-key 目录；七个 locale 的键集合和字段结构必须同构，非中文 locale 禁止退回简体中文。历史正式型号单列为 `modelName`，只允许白名单中的正式写法跨语言相同；不能用“日文中出现汉字”作为漏译判据。切换语言后当前船坞详情、教学卡、结果卡和 LAN 状态必须即时重绘。

## 7. LAN 失败指引与验收

0.7.1 只增加状态到行动建议的 UI 映射。runtime 暴露可枚举的 `LanGuidanceReason` 判别联合，而不是让 UI 匹配中文字符串：`search-empty`、`host-create-failed`、`manual-join-timeout`、`manual-join-disconnected`、`host-disconnected`、`version-mismatch`、`content-mismatch`、`room-full`、`invalid-build`。UI 仅对前五类附加网络排障步骤，后四类保持原有精确拒绝原因。

对应文案为：

- 搜索为空：确认两机同一私有 IPv4 网络、关闭 AP/client isolation，并提示手动 IPv4 路径。
- 创建失败：确认完整桌面目录、Windows 私有网络和防火墙私网放行。
- 手动加入超时/断开：核对房主显示的 IPv4:端口、版本/内容、私网和防火墙。
- 房主断开：持久提示“请重新创建或加入新房间”，不显示虚假的恢复/重连入口。
- 版本不一致、内容不一致、房满、方案非法继续显示精确原因，不附加泛化网络建议。

UI 会话层维护 `LanTroubleshootingState { reason, titleKey, actionKeys }`。它显示在多人目录/大厅中的常驻排障面板，而不是短暂 HUD toast；房主断开时自动返回多人目录并保留该面板。用户主动关闭，或开始新的搜索、建房、手动加入操作时才清除；切换普通菜单页签不会清除。精确兼容错误同样可持久查看，但不携带网络排障 action keys。

`package.json` 升为 0.7.1 后，现有 `LAN_GAME_VERSION` 与内容指纹自动变化。`LAN_PROTOCOL_VERSION`、消息验证常量和内容指纹的 revision 常量保持不变；不得递增 wire/schema revision，也不得修改 UDP/WebSocket 状态机。

新增 `docs/acceptance/LAN-0.7.1.md`，记录两台实体 Windows 机器、完整目录包 SHA-256、网络环境、自动发现、手动加入、兼容门禁、双人战斗、两类断线和赛后重赛。实际执行前全部为 `pending`；同机双开和 loopback 只能作为补充证据，不能标记真实双机通过。

## 8. 错误处理

- Profile v7 迁移失败时使用有效 v6，不覆盖旧档案。
- 奖励保存失败时保留 pending settlement，不重复计算奖励。
- 教学状态保存失败时保持当前内存步骤并提示未保存，不假装已完成。
- 船坞某个新 root 构造失败时保留上一套 actual root，候选 overlay 独立失败。
- 外部舰模加载失败继续使用程序化舰体，完整装备仍可显示。
- LAN 故障指引不能把协议不兼容误报为网络问题。

## 9. 测试与验收

### 9.1 自动化

- Profile：v6→v7 保档、各类致命/可修复 v7 字段、损坏 v7 回退有效 v6、写入失败不改 v6、onboarding 规范化、settled ring 去重/裁剪/非法 ID、有效 ID 加损坏 reward 时保留零奖励记录。
- 奖励：胜/负/平局、同 battleId 重复终局、重启后重复提交、保存失败后跨菜单保留并只重写同一 profileAfter、pending 时所有 profile mutation 被锁定、阻止第二场奖励战、restart/replay 新 ID、LAN/海试无奖励。
- 遥测：只统计 controlledShipId；友方 AI 不计入玩家；直接、火灾和进水击沉归属；无来源碰撞不归属；同一目标只发一次 destroyed event；LAN payload 不含该事件。
- 教学：首次固定 1v1/clear 且场景真实生成双方各一舰、成功动作推进、退出续接、说明页跳过、战斗内跳过、完成后不再自动出现、主菜单重玩立即开新局、暂停菜单重玩只影响下一局。
- 船坞计划：15 个舰级 × 八分类；dock plan 与 combat plan 的型号、槽位顺序、数量一致；同一 player ID 连续两场不同配装不串用，reward battle、LAN 和海试三类 scope 结束后 registry 均清空。
- 船坞生命周期：混装、空槽、无鱼雷战列舰、切舰级、异步 supersede/fallback/failed 结果、50 次重建无 mesh/node/material 泄漏；actual root 与 inspection overlay 的 token/root 隔离。
- 船坞状态：查看/载入/设为出击互不串改；任务页选择与启动槽位快照一致；结算返回船坞时方案存在/已删除两条路径。
- 结算 UI：战绩、奖励、余额、待保存/已入账、应用会话 pending 限制说明、按钮去向、LAN 返回大厅。
- i18n：每个装备/舰级/动态详情在七个 locale 均有完整值，非中文 locale 不含中文回退。
- LAN：结构化 guidance reason、空搜索、建房失败、加入超时、房主断开和精确兼容错误；常驻面板跨页保留并只在规定操作清除；既有协议/loopback 测试保持通过，wire/revision 常量不变。

### 9.2 人工与发布门禁

1. `git diff --check`。
2. 全量 Vitest、TypeScript/Vite build、舰模资产验证、三个桌面 CJS 语法检查。
3. 1440×900 与 1280×720 下检查主菜单、首航说明、教学 HUD、完整船坞、结果卡、LAN 失败指引和开发者模式，不允许面板遮挡或文本溢出。
4. 构建 Windows x64 完整目录和可选 ZIP，验证 EXE、`resources`、DLL、ASAR-unpacked 资源、文件清单和 SHA-256。
5. 在本机以隐藏窗口启动冒烟，确认不会立即退出；本机只保留最新 `battleship-latest-windows-x64` 目录。
6. 两台实体 Windows 机器完成 `docs/acceptance/LAN-0.7.1.md` 前，记录状态必须保持 pending，不能声称实机 LAN 已通过。

## 10. 交付顺序

1. Profile v7、启动上下文与幂等奖励。
2. 结算统计与结果卡。
3. 首次 1v1 情境教学。
4. 统一配装视觉计划与船坞完整配装。
5. 七语言完整目录。
6. LAN 故障指引与验收记录。
7. 0.7.1 完整回归、目录打包和本机覆盖交付。

完成 A 后才进入 B“舰模与视觉升级”；B 完成并独立交付后再进入 C“任务、战术与 AI 深化”。
