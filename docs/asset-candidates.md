# 灰海行动：精细化资源候选（0.6.4）

目标：比当前程序化占位模型更精细，同时保留低显卡运行、后续舰船升级换件、Windows 打包与合法再分发能力。

## 第一选择：Fubuki 二战驱逐舰

- 来源：https://sketchfab.com/3d-models/japanese-destroyer-fubuki-265fd075c2da4b23b4b4bc370cd3a924
- 许可：CC Attribution；约 64.2k 三角面、43.8k 顶点。
- 适合原因：舰体轮廓、三座炮塔与鱼雷发射器辨识度高，最适合拆成“船体 / 主炮 / 鱼雷 / 防空 / 舰桥 / 桅杆”升级节点。
- 接入方案：保留 25k–40k 三角面为近景 LOD0；生成约 12k 的 LOD1 与约 3k 的 LOD2；统一导出 GLB；碰撞继续使用独立简化盒体，不能直接用渲染网格。

## 备选舰船

1. Samidare 驱逐舰：https://sketchfab.com/3d-models/samidare-destroyer-b37939147c854e61857f5b248f9efd29
   - CC Attribution；约 64.8k 三角面。规模合适，日系二战驱逐舰外形完整。
2. Tribal-class Destroyer (1936)：https://sketchfab.com/3d-models/tribal-class-destroyer-1936-97dce925c4044ba4aa03674289d54b4a
   - CC Attribution；约 132.1k 三角面。细节更好但必须较大幅度减面。
3. Quaternius LowPoly Ship Pack：https://opengameart.org/content/lowpoly-ship-pack
   - CC0。适合远景 AI 舰、港口道具和占位，不建议作为玩家主舰。

## 海面、天空与环境

- Ocean HDRI / Skybox：https://opengameart.org/content/ocean-hdriskybox （CC0）
- Cool Water Texture：https://opengameart.org/content/cool-water-texture （CC0）
- Watercraft Kit：https://opengameart.org/content/watercraft-kit （CC0，可用于小艇与远景环境）

推荐场景预算：1K 或 2K 天空贴图、单张 1K 水面法线、程序化低面数波层、有限距离泡沫尾迹。避免实时反射、体积云和高细分海面，以守住普通集显/入门独显的帧率。

## 暂不采用

- Chung Mu / Fletcher 改装模型约 187.8k 三角面，配置偏战后且对当前目标过重。
- 3D CAD Browser / Free3D 的部分模型存在付费、账户或再分发约束；许可证未逐项确认前不进入可发布 EXE。

## 接入检查表

- 下载时保存原始许可证、作者名、来源 URL 与下载日期。
- 在游戏“制作人员 / 第三方资源”页提供 CC-BY 署名。
- Blender 中拆分升级部件、修轴心、减面、烘焙贴图并生成 LOD。
- GLB 进入 Babylon.js 后验证朝向、尺寸、炮塔旋转轴、鱼雷发射点、碰撞体与低画质模式。
