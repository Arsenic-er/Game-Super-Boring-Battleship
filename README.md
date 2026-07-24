<p align="center">
  <img src="docs/images/hero-banner.png" alt="Super Boring Battleship Game — pixel-art destroyer battle" width="100%">
</p>

# Super Boring Battleship Game

**Official Chinese title / 正式中文名：Game：超级无聊战舰游戏**

> A deliberately unhurried, lightweight 3D WWII destroyer combat prototype by **koko**.

[Download the latest Windows build](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest) · [中文说明](#game超级无聊战舰游戏)

## About the game

Super Boring Battleship Game is a single-player naval combat prototype focused on readable ballistics, deliberate ship handling, modular damage and low-end-PC compatibility. It uses TypeScript, Babylon.js, Vite and Electron.

This is an early prototype rather than a finished commercial game. Visuals, balance, ship models and progression are still evolving.

## Current features

- Ten-minute player-vs-AI battles and an unlimited sea-trials mode.
- Historically paced destroyer movement, throttle and rudder control.
- Main-gun ballistics with visible shell arcs, dispersion, reload progress and independent turret alignment.
- Weapon slots: `1` main guns, `2` twin torpedo launch, `3` reserved aircraft slot.
- Hull compartments, module damage, fire, flooding, crew-dependent repair and recoverable health.
- Physical ship collision and location-dependent collision damage.
- Tactical minimap and full map, dedicated aiming scope, developer diagnostics and adjustable sensitivity.
- Local captain profile, supply draws, component inventory, upgrades and a modular dockyard preview.
- Portable Windows x64 build: extract the ZIP and launch the EXE; no installer is required.

## Controls

| Input | Action |
|---|---|
| `W` / `S` | Increase or reduce engine order |
| `A` / `D` | Rudder left / right |
| Mouse movement | Look around |
| Mouse wheel | Adjust aiming range |
| `R` | Enter / leave aiming scope |
| `1` / `2` / `3` | Main gun / torpedo / reserved aircraft slot |
| `Space` | Fire selected weapon |
| `4` | Cycle balanced / firefighting / flooding / module repair priority |
| `H` | Hold to divert damage-control crew to recoverable hull damage |
| `M` | Open / close tactical map |
| `F3` | Developer diagnostics |
| `Esc` | Exit scope/map or pause |

## Windows quick start

1. Open the repository's **Releases** page.
2. Download `Super-Boring-Battleship-Game-v0.6.4-Windows-x64.zip`.
3. Extract the entire ZIP to a normal folder.
4. Double-click `Super Boring Battleship Game.exe`.

The build targets 64-bit Windows 10/11. Windows SmartScreen may warn about an unsigned indie build; only run a file downloaded from this repository's official Release page.

## Development

Requirements: Node.js 24.x and npm.

```bash
npm install
npm test
npm run build
```

Create the portable Windows executable:

```bash
npm run desktop:dist
```

Architecture notes and game-design documents are available in [`docs/`](docs/).

## Copyright and third-party software

The original game code and artwork are copyright © 2026 **Arsenic-er (koko)**. All rights reserved. No open-source license is granted at this stage.

Third-party libraries and the Fusion Pixel Font remain under their respective licenses. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

# Game：超级无聊战舰游戏

> 由 **koko** 制作的、节奏刻意偏慢并照顾普通电脑配置的二战驱逐舰 3D 战斗原型。

[下载最新版 Windows 压缩包](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest) · [返回英文介绍](#super-boring-battleship-game)

## 游戏简介

《超级无聊战舰游戏》是一款单人海战原型，重点是可读的弹道、偏真实的舰船操纵、模块化损伤和低配置电脑兼容性。项目使用 TypeScript、Babylon.js、Vite 与 Electron 开发。

目前仍是早期原型，并非完成的商业游戏。画面、平衡、舰船模型和成长系统仍会继续修改。

## 当前内容

- 10 分钟人机战斗，以及没有时间限制的舰船测试模式。
- 接近现实节奏的驱逐舰航速、车钟和舵机操纵。
- 可见炮弹轨迹、散布、装填进度、炮管实际指向与独立火控准线。
- HE/AP 弹药切换、装甲入射角、跳弹、碎弹、正常穿透与过度穿透。
- 武器栏：`1` 主炮、`2` 双雷齐射、`3` 预留舰载机。
- 船体分区、组件损伤、起火、进水、有限人力损管与可恢复血量。
- 舰船实体碰撞，以及依据碰撞部位计算的不同伤害。
- 小地图、大地图、专用瞄准镜、开发者调试面板与灵敏度设置。
- 本地舰长档案、军需抽取、组件仓库、升级与模块化船坞预览。
- Windows x64 便携版：解压 ZIP 后直接运行 EXE，无需安装。

## 操作方式

| 按键 | 功能 |
|---|---|
| `W` / `S` | 增减车钟 |
| `A` / `D` | 左右转舵 |
| 移动鼠标 | 转动视角 |
| 鼠标滚轮 | 调整瞄准距离 |
| `R` | 进入或退出瞄准镜 |
| `1` / `2` / `3` | 主炮 / 鱼雷 / 预留舰载机 |
| `Q` | 切换主炮 HE / AP；换弹会重新装填 |
| `Space` | 发射当前武器 |
| `4` | 循环均衡 / 灭火 / 堵漏 / 模块优先级 |
| `H` | 按住抽调损管人力修复可恢复舰体血量 |
| `M` | 打开或关闭战术地图 |
| `F3` | 开发者调试面板 |
| `Esc` | 退出瞄准/地图或暂停 |

## Windows 使用方法

1. 打开仓库的 **Releases** 页面。
2. 下载 `Super-Boring-Battleship-Game-v0.6.4-Windows-x64.zip`。
3. 把 ZIP 完整解压到普通文件夹。
4. 双击 `Super Boring Battleship Game.exe`。

目标系统为 64 位 Windows 10/11。由于目前是独立开发测试版，Windows SmartScreen 可能显示未知发布者提示；请只运行从本仓库官方 Release 下载的文件。

## 开发构建

需要 Node.js 24.x 与 npm：

```bash
npm install
npm test
npm run build
```

生成 Windows 便携版：

```bash
npm run desktop:dist
```

架构与游戏设计文档位于 [`docs/`](docs/) 目录。

## 版权与第三方组件

原创游戏代码与美术内容版权 © 2026 **Arsenic-er（koko）**，保留所有权利；当前没有授予开源许可证。

第三方程序库及 Fusion Pixel Font 继续遵循各自的许可证，详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
