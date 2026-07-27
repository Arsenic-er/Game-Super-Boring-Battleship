# Historical ship-class catalog / 历史舰级目录

This file records the historical baseline and deliberate gameplay abstractions behind the first 15 playable ship classes. The project borrows recognizable role identities from naval games, but dimensions and armament hardpoints are based on historical classes rather than copied game tiers or economy values.

本文件记录首批 15 个可玩舰级的史实基线与明确的游戏化取舍。项目只借鉴海战游戏中易识别的玩法身份，不复制等级、经济或虚构改装。

`M/T/A/S/D` = main-battery turrets / trainable torpedo-launcher groups / grouped light-AA sectors / medium secondary turrets / depth-charge projector-or-rail groups. AA is deliberately grouped by fire-control sector instead of counting every light mount.

| Type | Class | Country / date | Max M/T/A/S/D | Starter M/T/A/S/D |
| --- | --- | --- | --- | --- |
| DD | Fletcher | US / 1942 | 5/2/4/0/2 | 5/1/1/0/1 |
| DD | J class | UK / 1939 | 3/2/3/0/2 | 3/1/1/0/1 |
| DD | Kagerō | Japan / 1939 | 3/2/3/0/2 | 3/1/1/0/1 |
| DD | Type 1936A (Z23) | Germany / 1942 refit | 4/2/3/0/2 | 4/1/1/0/1 |
| DD | Tashkent | USSR / 1941 fit | 3/3/3/0/2 | 3/1/1/0/1 |
| CL | Cleveland | US / 1942 | 4/0/5/6/0 | 4/0/2/6/0 |
| CL | Edinburgh | UK / 1939 | 4/2/4/6/0 | 4/1/1/6/0 |
| CL | Nürnberg | Germany / 1935 | 3/4/4/0/0 | 3/2/1/0/0 |
| CL | Agano | Japan / 1942 | 3/2/3/2/0 | 3/1/1/2/0 |
| CL | Dido | UK / complete design | 5/2/3/0/0 | 5/1/1/0/0 |
| BB | North Carolina | US / 1941 | 3/0/6/10/0 | 3/0/2/10/0 |
| BB | King George V | UK / 1940 | 3/0/6/8/0 | 3/0/2/8/0 |
| BB | Bismarck | Germany / 1940 | 4/0/6/6/0 | 4/0/2/6/0 |
| BB | Yamato | Japan / 1943 fit | 3/0/8/4/0 | 3/0/3/4/0 |
| BB | Richelieu | France / 1943 completed fit | 2/0/6/3/0 | 2/0/2/3/0 |

## Deliberate abstractions / 明确取舍

- Fletcher and J-class maximum torpedo layouts preserve early-war fits; the starter fit removes one launcher group to leave upgrade space.
- Z23 uses the recognizable 1942 refit silhouette: one twin and three single 150 mm positions, counted as four main-battery hardpoints.
- Tashkent uses the 1941 three-twin B-2LM combat fit, not the temporary delivery armament.
- Dido uses the intended five-turret design; individual wartime ships with four turrets can later become sub-variants.
- Cleveland and every battleship have no torpedo hardpoint.
- Agano historically carried depth charges, but the current gameplay rule deliberately reserves ASW for destroyers, so its `D` count is zero.
- Yamato uses a 1943 configuration with four 155 mm secondary positions; a later AA refit should reduce `S` while increasing `A`.
- Richelieu is labeled as the 1943 completed/refitted combat state rather than implying the incomplete 1940 fit was equivalent.

## Reference anchors / 资料入口

- Fletcher and ASW fit: https://www.history.navy.mil/research/histories/ship-histories/danfs/f/fletcher.html
- Cleveland overview: https://www.history.navy.mil/content/dam/nhhc/about-us/leadership/hgram_pdfs/H-Gram_024.pdf
- North Carolina armament: https://www.history.navy.mil/content/history/nhhc/research/histories/ship-histories/danfs/n/north-carolina-iii.html
- Bismarck overview: https://www.history.navy.mil/content/history/nhhc/research/library/online-reading-room/title-list-alphabetically/s/sinking-of-the-bismarck/the-cruise-of-the-bismarck.html
- J-class table: https://ww2ships.com/britain/gb-dd-001-f.shtml
- Kagerō layout reference: https://www.tamiya.com/english/products/78032/index.html
- Type 1936A overview: https://naval-encyclopedia.com/ww2/germany/1936a-type-destroyers.php
- Tashkent fit history: https://www.navypedia.org/ships/russia/ru_dd_tashkent.htm
- Edinburgh design table: https://ww2ships.com/acrobat/gb-cl-001-b-r00.pdf
- Nürnberg data: https://www.navypedia.org/ships/germany/ger_cr_nurnberg.htm
- Dido overview: https://www.usni.org/magazines/proceedings/1965/january/anti-aircraft-cruisers-life-class-pictorial
- World of Warships roster cross-check: https://wiki.worldofwarships.com/Ship:List_of_Ships

