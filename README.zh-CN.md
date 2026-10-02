[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md)

# Game：超级无聊战舰游戏

> **koko** 制作的轻量级单人与双人局域网二战 3D 海战游戏，强调偏真实的舰船操纵、可读弹道和模块化损伤。

[下载最新 Windows 目录版（ZIP）](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest)

## 游戏简介

0.7.9 版支持单人人机战斗、双人合作对抗 AI 和不限时海试；常规战斗目标时长为 15–20 分钟。你将指挥驱逐舰、轻巡洋舰和战列舰，操纵舰船、管理损管并使用舰炮、鱼雷、深水炸弹和舰载航空兵。项目优先照顾普通电脑配置，使用 TypeScript、Babylon.js、Vite 和 Electron 开发。

目前仍是开发中的原型，画面、平衡、舰船模型与成长系统会继续完善。

## 当前特色

- 15 种历史特征舰体、差异化武器与内部组件、6 种二战飞机的原创轻量模型；保留自由装配，非造船图纸级精确复刻。[模型说明](docs/historical-models-ships.md)。

- 双人局域网合作：支持搜索房间、手动 IPv4 备用加入、保存配装选择和房主权威模拟，共同对抗 AI。
- 接近历史节奏的车钟、舵机、转向失速和模块受损响应。
- 可见炮弹轨迹、散布、装填、独立炮塔指向、HE/AP 穿甲与舱段伤害。
- 鱼雷射界、窄/宽雷扇、武装距离、最大射程、提前量和独立发射器损伤。
- 烟幕、水听、火灾、进水、人力损管、可恢复血量和分区碰撞伤害。
- 非全知 AI 光学观测：敌舰会丢失并留下逐渐衰减的最后已知位置。
- AI 自主驾驶的舰载机；玩家以框选、移动、护卫、巡逻、截击和对舰攻击命令进行指挥。
- 无氪金军械库、仓库、船坞、本地舰长档案与历史舰装研发。
- 简体中文、繁體中文、English、日本語、Español、Deutsch、Русский 七种界面语言。

## 主要操作

| 按键 | 功能 |
|---|---|
| `W` / `S` | 增减车钟 |
| `A` / `D` | 左右转舵 |
| 鼠标 / 滚轮 | 转动视角 / 调整瞄准距离 |
| `R` / `Space` | 切换瞄准镜 / 发射当前武器 |
| `1` / `2` / `3` | 主炮 / 鱼雷 / 舰载航空兵 |
| `Q` | 切换弹种或鱼雷散布 |
| `E` / `F` / `G` | 烟幕 / 水听 / 深水炸弹 |
| `H` | 按住进行舰体抢修 |
| `M` / `F3` / `Esc` | 战术地图 / 调试 / 退出或暂停 |

## Windows 使用

从 [Releases](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest) 下载最新 Windows x64 ZIP，完整解压到同一个文件夹后双击 `Super Boring Battleship Game.exe`。请勿把 EXE 单独移出 `resources` 目录和 DLL 所在的游戏文件夹。程序无需安装；SmartScreen 可能因独立测试版未签名而提示未知发布者。

## 开发构建

需要 Node.js 24.x 和 npm：

```bash
npm install
npm test
npm run build
npm run desktop:dist
npm run desktop:zip
```

`desktop:dist` 生成 `release/win-unpacked` 目录版；`desktop:zip` 生成用于发布、包含完整目录的 ZIP。

## 版权

原创代码与美术版权 © 2026 **Arsenic-er（koko）**，保留所有权利，当前未授予开源许可。第三方软件与 Fusion Pixel Font 按各自许可证使用，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
