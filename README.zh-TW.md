[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md)

# Game：超級無聊戰艦遊戲

> **koko** 製作的輕量級單人與雙人區域網路二戰 3D 海戰遊戲，著重偏寫實的艦艇操縱、清楚可讀的彈道與模組化損傷。

[下載最新 Windows 目錄版（ZIP）](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest)

## 遊戲簡介

0.7.7 版支援單人對 AI、雙人合作對抗 AI 與不限時海試；一般戰鬥的目標時長為 15–20 分鐘。你將指揮驅逐艦、輕巡洋艦與戰列艦，操縱艦艇、管理損管，並使用艦砲、魚雷、深水炸彈與艦載航空兵。專案優先照顧一般電腦配備，使用 TypeScript、Babylon.js、Vite 與 Electron 開發。

目前仍是開發中的原型，畫面、平衡、艦艇模型與成長系統將持續完善。

## 目前特色

- 15 種歷史特徵艦體、差異化武器與內部組件、6 種二戰飛機的原創輕量模型；保留自由配裝，並非造船圖紙級的精確復刻。[模型說明](docs/historical-models-ships.md)。

- 雙人區域網路合作：支援搜尋房間、手動 IPv4 備用加入、已儲存配裝選擇與房主權威模擬，共同對抗 AI。
- 接近歷史節奏的車鐘、舵機、轉向失速與模組受損反應。
- 可見砲彈軌跡、散布、裝填、獨立砲塔指向、HE/AP 穿甲與艙段傷害。
- 魚雷射界、窄／寬雷扇、武裝距離、最大射程、提前量與獨立發射器損傷。
- 煙幕、水聽、火災、進水、人力損管、可恢復血量與分區碰撞傷害。
- 非全知 AI 光學觀測：敵艦會失聯並留下逐漸衰減的最後已知位置。
- AI 自主駕駛的艦載機；玩家以框選、移動、護衛、巡邏、截擊與對艦攻擊命令指揮。
- 無課金軍械庫、倉庫、船塢、本機艦長檔案與歷史艦裝研發。
- 简体中文、繁體中文、English、日本語、Español、Deutsch、Русский 七種介面語言。

## 主要操作

| 按鍵 | 功能 |
|---|---|
| `W` / `S` | 增減車鐘 |
| `A` / `D` | 左右轉舵 |
| 滑鼠 / 滾輪 | 轉動視角 / 調整瞄準距離 |
| `R` / `Space` | 切換瞄準鏡 / 發射目前武器 |
| `1` / `2` / `3` | 主砲 / 魚雷 / 艦載航空兵 |
| `Q` | 切換彈種或魚雷散布 |
| `E` / `F` / `G` | 煙幕 / 水聽 / 深水炸彈 |
| `H` | 按住進行艦體搶修 |
| `M` / `F3` / `Esc` | 戰術地圖 / 除錯 / 退出或暫停 |

## Windows 使用方式

從 [Releases](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest) 下載最新 Windows x64 ZIP，完整解壓縮到同一個資料夾後雙擊 `Super Boring Battleship Game.exe`。請勿將 EXE 單獨移出 `resources` 目錄與 DLL 所在的遊戲資料夾。程式無需安裝；SmartScreen 可能因獨立測試版未簽署而提示未知發行者。

## 開發建置

需要 Node.js 24.x 與 npm：

```bash
npm install
npm test
npm run build
npm run desktop:dist
npm run desktop:zip
```

`desktop:dist` 產生 `release/win-unpacked` 目錄版；`desktop:zip` 產生用於發佈、包含完整目錄的 ZIP。

## 版權

原創程式碼與美術版權 © 2026 **Arsenic-er（koko）**，保留所有權利，目前未授予開源授權。第三方軟體與 Fusion Pixel Font 依各自授權使用，詳見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
