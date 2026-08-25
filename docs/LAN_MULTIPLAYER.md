# LAN co-op / 局域网合作模式

Version 0.7.0 supports exactly two human players cooperating against the AI on the same local network. One Windows desktop instance is the authoritative host; the second is the guest. PvP, Internet matchmaking, dedicated servers, spectators, host migration and reconnecting to an interrupted match are not included in this release.

0.7.0 版支持两名玩家在同一局域网内合作对抗 AI。一台 Windows 桌面版负责权威模拟并担任房主，另一台作为客席。本版不包含 PvP、互联网匹配、专用服务器、观战、房主迁移或断线重连。

## Requirements / 使用条件

- Both computers must fully extract and run the same Windows x64 directory build. Keep `Super Boring Battleship Game.exe`, `resources` and the DLL files together, and connect both computers to the same private IPv4 network.
- When Windows Defender Firewall asks, allow the game on **Private networks**. Public-network access is not required.
- The router or access point must not enable **AP isolation**, **client isolation** or a guest-network rule that prevents devices from reaching each other.
- UDP `47777` is used for room discovery. The host chooses one WebSocket game port from TCP `47778`–`47788`.
- The browser/Vite preview cannot create or join a LAN room. LAN transport is available only in the packaged Electron desktop game.

- 两台电脑必须完整解压并运行相同的 Windows x64 目录版；`Super Boring Battleship Game.exe`、`resources` 与 DLL 文件必须保持在同一个游戏目录中，并连接到同一个私有 IPv4 网络。
- Windows Defender 防火墙询问时，只需允许游戏访问**专用网络**，无需开放公用网络。
- 路由器或无线接入点不能开启 **AP 隔离**、**客户端隔离**，也不能使用会阻止设备互访的访客网络。
- UDP `47777` 用于搜索房间；房主会从 TCP `47778`–`47788` 中选择一个游戏端口。
- 浏览器/Vite 预览版不能建立或加入局域网房间；联机传输仅在打包后的 Electron 桌面版中可用。

## Host / 房主

1. Start the desktop EXE and open **Multiplayer → Create room**.
2. Choose a sea-ready saved ship build, enter a room name and create the room.
3. The lobby shows the actual private IPv4 address and selected game port, including a one-click copy button. Tell that endpoint to the guest if automatic discovery does not find the room. On Windows, `ipconfig` also shows the address under the active adapter as `IPv4 Address` (commonly `192.168.x.x` or `10.x.x.x`).
4. Wait for the guest, select your ready build, mark ready, then start after both players are ready.

1. 启动桌面 EXE，进入**多人模式 → 创建房间**。
2. 选择一套满足出海条件的已保存舰船配置，输入房间名并创建。
3. 大厅会显示实际私有 IPv4 与最终选中的游戏端口，并提供复制按钮。自动搜索不到时，把这组地址告诉客席；Windows 也可用 `ipconfig` 查看当前网卡的 `IPv4 地址`，常见形式为 `192.168.x.x` 或 `10.x.x.x`。
4. 等待客席加入，选择配置并准备；双方都准备后由房主开始战斗。

## Guest / 客席

1. Start the same desktop build and open **Multiplayer → Search rooms**.
2. Select the host room. If it is not listed, use **Manual IPv4**, enter the host address and the game port shown by the host.
3. Select a sea-ready saved build and mark ready.
4. The host starts the match. The guest sends controls while the host remains authoritative for simulation, damage, AI and results.

1. 启动完全相同的桌面版本，进入**多人模式 → 搜索房间**。
2. 选择房主房间；如果列表中没有，改用**手动 IPv4**，输入房主地址和房主显示的游戏端口。
3. 选择满足出海条件的已保存配置并准备。
4. 房主开始战斗。客席发送操控输入，舰船模拟、伤害、AI 和结算结果均以房主为准。

## Disconnect behaviour / 断线行为

- After a completed match, both instances keep the room and socket open, enter a post-match state, reset both ready flags, and return to the same fresh lobby. A rematch does not require rediscovery or reconnecting.
- If the guest disconnects during battle, the host continues and AI immediately takes control of the guest ship (within the five-simulation-second acceptance limit).
- If the host disconnects, the guest returns to the main menu with an explicit message.
- There is no host migration and no in-match reconnect in 0.7.0. Start a new room after a host failure or if both players want to resume together.

- 正常结算后，两台实例会保留房间和连接，进入赛后状态，清除双方准备标记，再返回同一个新大厅；重赛无需重新搜索或连接。
- 客席在战斗中断线后，房主战斗继续，AI 会立刻接管客席舰船（满足五个模拟秒内接管的验收上限）。
- 房主断线后，客席会显示明确提示并返回主菜单。
- 0.7.0 没有房主迁移或战斗中重连；房主故障或双方希望重新开始时，请重新创建房间。

## Two-instance acceptance matrix / 双实例验收表

Run this matrix with two packaged Windows instances before publishing a release. Prefer two computers; two instances on one computer verify transport wiring but do not prove router discovery.

发布前应使用两个 Windows 桌面实例执行以下验收。最好使用两台电脑；同一电脑双开只能验证传输链路，不能证明路由器广播搜索可用。

| Case / 场景 | Host / 房主 | Guest / 客席 | Expected / 预期 |
|---|---|---|---|
| Automatic discovery / 自动搜索 | Create a room | Search rooms | Room appears once with correct name, version and `1/2` occupancy / 房间名称、版本及 `1/2` 人数正确 |
| Manual fallback / 手动加入 | Share private IPv4 and port | Enter IPv4 and port | Guest reaches the same lobby / 客席进入同一大厅 |
| Compatibility gate / 兼容校验 | Run 0.7.0 | Run a different content build | Join is rejected before ready / 准备前即拒绝加入 |
| Ready and start / 准备与开始 | Select build, ready, start | Select build, ready | Both enter the same seeded battle / 双方进入同一种子战斗 |
| Controls and authority / 操控与权威 | Observe guest ship | Throttle, rudder, fire | Both views converge on the host tick and result / 双方收敛到房主 tick 和结算 |
| Result and rematch / 结算与重赛 | Return from result | Return from result | Same socket and room remain; both ready flags reset in a fresh lobby / 房间与连接保留，双方准备清除并返回新大厅 |
| Guest dropout / 客席断线 | Keep playing | Close the game | AI controls the guest ship within 5 simulated seconds / AI 在 5 模拟秒内接管 |
| Host dropout / 房主断线 | Close the game | Remain connected | Guest receives a notice and returns to menu / 客席收到提示并回主菜单 |
| Browser guard / 浏览器限制 | Open Vite preview | Open multiplayer | Desktop-required notice; no room is hosted / 提示需要桌面版且不会建房 |

## Troubleshooting / 故障排查

1. Confirm both extracted game directories have the same version and content fingerprint.
2. Set the Windows network profile to **Private**, then allow the game through the firewall on Private networks.
3. Disable AP/client isolation or move both computers off the guest Wi-Fi network.
4. Retry with the host's private IPv4 address and shown TCP port.
5. If discovery still fails but manual join works, UDP broadcast is being filtered; manual IPv4 is the supported fallback.

1. 确认双方完整游戏目录的版本和内容指纹一致。
2. 把 Windows 网络配置设为**专用**，并在防火墙中允许游戏访问专用网络。
3. 关闭 AP/客户端隔离，或把两台电脑移出访客 Wi-Fi。
4. 使用房主的私有 IPv4 和界面显示的 TCP 端口手动加入。
5. 如果自动搜索失败但手动加入成功，说明 UDP 广播被过滤；手动 IPv4 即为正式备用方案。
