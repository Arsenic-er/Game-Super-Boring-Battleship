[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md)

# Super Boring Battleship Game

> **koko** 制作の軽量なシングルプレイ第二次世界大戦3D海戦ゲーム。現実寄りの艦艇操作、読みやすい弾道、モジュール式損傷を重視しています。

[最新の Windows ポータブル版をダウンロード](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest)

## ゲーム概要

駆逐艦、軽巡洋艦、戦艦を指揮し、10分間の対AI戦または時間無制限の海上公試で操艦、応急修理、艦砲、魚雷、爆雷、艦載航空隊を運用します。一般的なPCでの動作を優先し、TypeScript、Babylon.js、Vite、Electronで開発しています。

本作は開発中のプロトタイプです。映像、バランス、艦艇モデル、進行システムは今後も改善されます。

## 現在の特徴

- 史実に近い速力感覚、機関指令、舵の移動、旋回時の速力低下、モジュール損傷。
- 可視砲弾軌道、散布界、装填、独立砲塔照準、HE/AP貫通と区画損傷。
- 魚雷射界、狭角／広角射出、信管作動距離、最大射程、予測線、発射管損傷。
- 煙幕、ソナー、火災、浸水、乗員による応急処置、回復可能HP、部位別衝突損傷。
- 全知ではないAI光学観測。敵を見失うと、時間とともに薄れる最終確認位置だけが残ります。
- AIが操縦する艦載機。プレイヤーは範囲選択、移動、護衛、哨戒、迎撃、対艦攻撃を指示します。
- 課金要素のない武器庫、倉庫、造船所、ローカル艦長プロフィール、史実装備研究。
- 简体中文、繁體中文、English、日本語、Español、Deutsch、Русскийの7言語UI。

## 主な操作

| キー | 操作 |
|---|---|
| `W` / `S` | 機関指令を増減 |
| `A` / `D` | 左右に操舵 |
| マウス / ホイール | 視点移動 / 照準距離調整 |
| `R` / `Space` | スコープ切替 / 選択武器を発射 |
| `1` / `2` / `3` | 主砲 / 魚雷 / 艦載航空隊 |
| `Q` | 弾種または魚雷散布角を切替 |
| `E` / `F` / `G` | 煙幕 / 水中聴音 / 爆雷 |
| `H` | 長押しで船体を応急修理 |
| `M` / `F3` / `Esc` | 戦術マップ / デバッグ / 終了または一時停止 |

## Windowsでの起動

[Releases](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest) から最新のWindows x64 ZIPを取得し、完全に展開して `Super Boring Battleship Game.exe` を実行してください。インストールは不要です。未署名の開発版のためSmartScreenが警告する場合があります。

## 開発ビルド

Node.js 24.xとnpmが必要です。

```bash
npm install
npm test
npm run build
npm run desktop:dist
```

## 著作権

オリジナルのコードとアートワーク © 2026 **Arsenic-er (koko)**。無断転載・利用を禁じます。現時点ではオープンソースライセンスを付与していません。第三者ソフトウェアとFusion Pixel Fontは各ライセンスに従います。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
