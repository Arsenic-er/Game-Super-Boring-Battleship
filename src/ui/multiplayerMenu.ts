import {
  applyDocumentLocale,
  localizeElement,
  type GameLocale,
} from "../i18n/gameLocale";
import type { LanCapabilities } from "../net/lanBridge";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../net/networkFingerprint";
import type { LobbySnapshot, LobbyPlayer } from "../net/lobbyState";
import { RoomDirectory, type DiscoveredRoom } from "../net/roomDirectory";
import { LAN_GAME_PORTS, type LanGamePort } from "../net/protocol";
import type { LocalProfile, SavedShipBuild } from "../profile/localProfile";
import { savedBuildReadiness } from "../profile/savedBuilds";

export const MULTIPLAYER_MENU_SOURCE_STRINGS = [
  "多人联机",
  "局域网双人合作入口",
  "创建或加入 2 人局域网房间。",
  "创建房间",
  "搜索局域网房间",
  "刷新",
  "返回任务",
  "房间名称",
  "手动输入 IPv4",
  "允许端口",
  "加入房间",
  "局域网联机仅在桌面版可用。",
  "手动加入也需要桌面版联机桥。",
  "请输入规范 IPv4 地址。",
  "请选择 47778 到 47788 之间的端口。",
  "局域网房间目录",
  "近似延迟（最近广播）",
  "正在搜索房间…",
  "未发现可加入的房间。",
  "房间名",
  "主机",
  "席位",
  "游戏版本",
  "房间状态",
  "加入",
  "联机大厅",
  "房主席位",
  "客席位",
  "已连接",
  "未连接",
  "已准备",
  "未准备",
  "本地方案",
  "选择本地已保存方案",
  "该方案未达到最低出海配置",
  "启动战斗",
  "离开房间",
  "仅房主可启动",
  "当前客席无需启动操作。",
  "请先选择一套可出海的本地方案。",
  "房间中",
  "战斗中",
  "等待客席加入并准备。",
  "等待房主启动战斗。",
  "本地房间",
  "局域网联机桥不可用。",
  "创建房间失败。",
  "搜索尚未连接到对战会话",
  "加入房间失败。",
  "不兼容",
  "房主",
  "访客",
  "准备状态",
  "联机已关闭。",
  "房间已满。",
  "游戏版本不一致，无法加入。",
  "内容哈希不一致，无法加入。",
  "当前方案未通过联机校验。",
  "该联机实例已在房间中。",
  "加入请求被拒绝。",
  "联机消息超出允许大小。",
  "联机连接已断开。",
  "联机操作失败。",
  "联机消息处理失败。",
  "收到无效的联机消息。",
  "加入房间超时。",
  "尚未加入联机房间。",
  "仅房主可启动。",
  "房主已断开。",
  "客席已断开 · AI 已接管。",
  "客席已离开 · AI 已接管。",
  "房主已断开 · 已返回主菜单。",
  "房间已关闭 · 已返回主菜单。",
  "多人联机已禁用开发者改动。",
  "主机地址",
  "复制地址",
  "主机地址已复制。",
  "无法复制主机地址。",
  "返回联机大厅",
] as const;

const GAME_PORT_SET = new Set<number>(LAN_GAME_PORTS);

function escapeMarkup(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isCanonicalIpv4Octet(value: string): boolean {
  if (value === "0") return true;
  if (!/^[1-9]\d{0,2}$/.test(value)) return false;
  const number = Number(value);
  return Number.isInteger(number) && number <= 255;
}

function isIpv4Literal(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 7 || trimmed.length > 15) return false;
  const parts = trimmed.split(".");
  return parts.length === 4 && parts.every((part) => isCanonicalIpv4Octet(part));
}

function lobbyCanStart(snapshot: LobbySnapshot): boolean {
  if (snapshot.phase !== "lobby") return false;
  if (snapshot.players.length !== 2) return false;
  return snapshot.players.every((player) => player.connected && player.ready && Boolean(player.build));
}

function findSavedBuild(profile: LocalProfile, buildId: string | null | undefined): SavedShipBuild | undefined {
  return buildId ? profile.savedShipBuilds.find((build) => build.id === buildId) : undefined;
}

function buildReady(profile: LocalProfile, buildId: string | null | undefined): boolean {
  const build = findSavedBuild(profile, buildId);
  return Boolean(build && savedBuildReadiness(profile, build).ready);
}

function roomPhaseSource(room: DiscoveredRoom): string {
  return room.phase === "lobby" ? "房间中" : "战斗中";
}

function roomCompatible(room: DiscoveredRoom): boolean {
  return room.gameVersion === LAN_GAME_VERSION && room.contentHash === LAN_CONTENT_HASH;
}

function roleSource(role: LobbyPlayer["role"] | null | undefined): string {
  if (role === "host") return "房主";
  if (role === "guest") return "访客";
  return "—";
}

export function parseManualJoinTarget(addressText: string, portText: string):
  | { ok: true; address: string; port: LanGamePort }
  | { ok: false; reason: "invalid-address" | "invalid-port" } {
  const address = addressText.trim();
  if (!isIpv4Literal(address)) return { ok: false, reason: "invalid-address" };
  const port = Number(portText.trim());
  if (!Number.isInteger(port) || !GAME_PORT_SET.has(port)) return { ok: false, reason: "invalid-port" };
  return { ok: true, address, port: port as LanGamePort };
}

export function approximateRoomPingMs(now: number, lastSeenAt: number): number {
  return Math.max(0, Math.round(now - lastSeenAt));
}

export function chooseInitialMultiplayerBuildId(profile: LocalProfile): string | null {
  if (buildReady(profile, profile.selectedBattleBuildId)) return profile.selectedBattleBuildId;
  return profile.savedShipBuilds.find((build) => savedBuildReadiness(profile, build).ready)?.id
    ?? profile.savedShipBuilds[0]?.id
    ?? null;
}

export function deriveLanCapabilityState(capabilities: LanCapabilities): {
  canEnter: true;
  canCreate: boolean;
  canSearch: boolean;
  canRefresh: boolean;
  canManualConnect: boolean;
  unsupportedSource: string | null;
  manualJoinSource: string | null;
} {
  if (!capabilities.desktop) {
    return {
      canEnter: true,
      canCreate: false,
      canSearch: false,
      canRefresh: false,
      canManualConnect: false,
      unsupportedSource: "局域网联机仅在桌面版可用。",
      manualJoinSource: "手动加入也需要桌面版联机桥。",
    };
  }
  return {
    canEnter: true,
    canCreate: capabilities.canHost,
    canSearch: capabilities.canDiscover,
    canRefresh: capabilities.canDiscover,
    canManualConnect: true,
    unsupportedSource: null,
    manualJoinSource: null,
  };
}

export function deriveLobbyControls(options: {
  snapshot: LobbySnapshot;
  localPeerId: string;
  profile: LocalProfile;
  selectedBuildId: string | null;
}): {
  localRole: "host" | "guest" | null;
  canReady: boolean;
  canStart: boolean;
  canLeave: boolean;
  showStart: boolean;
  selectedBuildReady: boolean;
} {
  const player = options.snapshot.players.find(({ peerId }) => peerId === options.localPeerId);
  const localRole = player?.role ?? null;
  const selectedBuildReady = buildReady(options.profile, options.selectedBuildId);
  return {
    localRole,
    canReady: options.snapshot.phase === "lobby" && Boolean(player?.connected) && selectedBuildReady,
    canStart: localRole === "host" && selectedBuildReady && lobbyCanStart(options.snapshot),
    canLeave: true,
    showStart: localRole === "host",
    selectedBuildReady,
  };
}

export interface MultiplayerActionResult {
  ok: boolean;
  errorSource?: string;
  lobby?: LobbySnapshot;
  localPeerId?: string;
  hostAddress?: string;
  port?: LanGamePort;
}

export interface MultiplayerSearchResult extends MultiplayerActionResult {
  rooms?: readonly DiscoveredRoom[];
}

export interface MultiplayerMenuCallbacks {
  capabilities(): Promise<LanCapabilities>;
  createRoom(request: { roomName: string; buildId: string | null }): Promise<MultiplayerActionResult>;
  searchRooms(): Promise<MultiplayerSearchResult>;
  manualJoin(request: { address: string; port: LanGamePort }): Promise<MultiplayerActionResult>;
  leaveRoom(): Promise<MultiplayerActionResult>;
  readyLobby(request: { ready: boolean; buildId: string }): Promise<MultiplayerActionResult>;
  startLobby(): Promise<MultiplayerActionResult>;
  returnToLobby?(): Promise<MultiplayerActionResult>;
}

export class MultiplayerMenuController {
  private profile: LocalProfile;

  private selectedBuildId: string | null;

  private snapshot?: LobbySnapshot;

  private localPeerId?: string;

  constructor(
    profile: LocalProfile,
    private readonly callbacks: MultiplayerMenuCallbacks,
  ) {
    this.profile = profile;
    this.selectedBuildId = chooseInitialMultiplayerBuildId(profile);
  }

  setProfile(profile: LocalProfile): void {
    this.profile = profile;
    if (buildReady(profile, profile.selectedBattleBuildId)) {
      this.selectedBuildId = profile.selectedBattleBuildId;
      return;
    }
    if (buildReady(profile, this.selectedBuildId)) return;
    this.selectedBuildId = chooseInitialMultiplayerBuildId(profile);
  }

  selectBuild(buildId: string | null): void {
    this.selectedBuildId = buildId;
  }

  getSelectedBuildId(): string | null {
    return this.selectedBuildId;
  }

  setLobby(snapshot: LobbySnapshot, localPeerId: string): void {
    this.snapshot = snapshot;
    this.localPeerId = localPeerId;
  }

  clearLobby(): void {
    this.snapshot = undefined;
    this.localPeerId = undefined;
  }

  getLobby(): { snapshot?: LobbySnapshot; localPeerId?: string } {
    return { snapshot: this.snapshot, localPeerId: this.localPeerId };
  }

  getLobbyControls() {
    if (!this.snapshot || !this.localPeerId) {
      return {
        localRole: null,
        canReady: false,
        canStart: false,
        canLeave: false,
        showStart: false,
        selectedBuildReady: buildReady(this.profile, this.selectedBuildId),
      };
    }
    return deriveLobbyControls({
      snapshot: this.snapshot,
      localPeerId: this.localPeerId,
      profile: this.profile,
      selectedBuildId: this.selectedBuildId,
    });
  }

  async requestReady(ready: boolean): Promise<boolean> {
    const controls = this.getLobbyControls();
    if (!controls.canReady || !this.selectedBuildId) return false;
    const result = await this.callbacks.readyLobby({ ready, buildId: this.selectedBuildId });
    this.syncActionResult(result);
    return true;
  }

  async requestStart(): Promise<boolean> {
    if (!this.getLobbyControls().canStart) return false;
    const result = await this.callbacks.startLobby();
    this.syncActionResult(result);
    return true;
  }

  async requestLeave(): Promise<MultiplayerActionResult> {
    const result = await this.callbacks.leaveRoom();
    this.syncActionResult(result);
    if (result.ok) this.clearLobby();
    return result;
  }

  private syncActionResult(result: MultiplayerActionResult): void {
    if (result.lobby && result.localPeerId) this.setLobby(result.lobby, result.localPeerId);
  }
}

interface MultiplayerMenuOptions {
  locale: GameLocale;
  profile: LocalProfile;
  callbacks: MultiplayerMenuCallbacks;
  onBack: () => void;
  now?: () => number;
}

export class MultiplayerMenu {
  private locale: GameLocale;

  private profile: LocalProfile;

  private readonly controller: MultiplayerMenuController;

  private readonly roomDirectory = new RoomDirectory();

  private readonly now: () => number;

  private capabilities?: LanCapabilities;

  private capabilitiesLoaded = false;

  private loadingCapabilities = false;

  private loadingRooms = false;

  private statusSource: string | null = null;

  private screen: "directory" | "lobby" = "directory";

  private roomName = "本地房间";

  private manualAddress = "";

  private manualPort = String(LAN_GAME_PORTS[0]);

  private hostEndpoint?: { address: string; port: LanGamePort };

  constructor(
    private readonly root: HTMLElement,
    private readonly options: MultiplayerMenuOptions,
  ) {
    this.locale = options.locale;
    this.profile = options.profile;
    this.controller = new MultiplayerMenuController(options.profile, options.callbacks);
    this.now = options.now ?? (() => Date.now());
    this.root.classList.add("multiplayer-menu-screen");
    this.root.hidden = true;
    this.render();
  }

  setLobby(snapshot: LobbySnapshot, localPeerId: string): void {
    this.controller.setLobby(snapshot, localPeerId);
    this.screen = "lobby";
    this.render();
  }

  async show(): Promise<void> {
    this.root.hidden = false;
    if (!this.capabilitiesLoaded && !this.loadingCapabilities) await this.loadCapabilities();
    else this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  setLocale(locale: GameLocale): void {
    this.locale = locale;
    this.render();
  }

  setProfile(profile: LocalProfile): void {
    this.profile = profile;
    this.controller.setProfile(profile);
    this.render();
  }

  private async loadCapabilities(): Promise<void> {
    this.loadingCapabilities = true;
    this.render();
    try {
      this.capabilities = await this.options.callbacks.capabilities();
      this.capabilitiesLoaded = true;
    } catch {
      this.statusSource = "局域网联机桥不可用。";
    } finally {
      this.loadingCapabilities = false;
      this.render();
    }
  }

  private applySearchResults(rooms: readonly DiscoveredRoom[] | undefined): void {
    if (!rooms) return;
    const now = this.now();
    for (const room of rooms) this.roomDirectory.ingest(room);
    this.roomDirectory.expire(now);
  }

  private currentCapabilities() {
    return deriveLanCapabilityState(this.capabilities ?? {
      desktop: false,
      canHost: false,
      canDiscover: false,
      reason: "unsupported",
    });
  }

  private roomCardsMarkup(): string {
    const rooms = this.roomDirectory.list();
    if (this.loadingRooms) return `<p class="multiplayer-room-state">正在搜索房间…</p>`;
    if (rooms.length === 0) return `<p class="multiplayer-room-state">未发现可加入的房间。</p>`;
    const now = this.now();
    return rooms.map((room) => {
      const latency = approximateRoomPingMs(now, room.lastSeenAt);
      const compatible = roomCompatible(room);
      return `
        <article class="multiplayer-room-card">
          <div class="multiplayer-room-card-header">
            <div>
              <p class="multiplayer-field-label">房间名</p>
              <b>${escapeMarkup(room.roomName)}</b>
            </div>
            <button class="menu-button primary multiplayer-room-join" type="button" data-room-id="${escapeMarkup(room.roomId)}" ${room.phase === "lobby" && compatible ? "" : "disabled"}>加入</button>
          </div>
          <dl class="multiplayer-room-fields">
            <div><dt>主机</dt><dd>${escapeMarkup(room.hostName)}</dd></div>
            <div><dt>席位</dt><dd>${room.playerCount}/${room.capacity}</dd></div>
            <div><dt>近似延迟（最近广播）</dt><dd>≈${latency} ms</dd></div>
            <div><dt>游戏版本</dt><dd>${escapeMarkup(room.gameVersion)}</dd></div>
            <div><dt>房间状态</dt><dd>${compatible ? roomPhaseSource(room) : "不兼容"}</dd></div>
          </dl>
        </article>`;
    }).join("");
  }

  private buildOptionsMarkup(): string {
    return this.profile.savedShipBuilds.map((build) => {
      const selected = build.id === this.controller.getSelectedBuildId();
      return `<option value="${escapeMarkup(build.id)}" ${selected ? "selected" : ""}>${escapeMarkup(build.name)}</option>`;
    }).join("");
  }

  private seatMarkup(title: string, player: LobbyPlayer | undefined, localBuildName: string | null): string {
    const buildName = player?.role === "host" || player?.role === "guest"
      ? (localBuildName && player.peerId === this.controller.getLobby().localPeerId ? localBuildName : player.build?.buildName ?? "—")
      : "—";
    return `
      <section class="multiplayer-seat-card">
        <h3>${escapeMarkup(title)}</h3>
        <dl>
          <div><dt>席位</dt><dd>${roleSource(player?.role)}</dd></div>
          <div><dt>主机</dt><dd>${escapeMarkup(player?.commanderName ?? "—")}</dd></div>
          <div><dt>房间状态</dt><dd>${player?.connected ? "已连接" : "未连接"}</dd></div>
          <div><dt>本地方案</dt><dd>${escapeMarkup(buildName)}</dd></div>
          <div><dt>准备状态</dt><dd>${player?.ready ? "已准备" : "未准备"}</dd></div>
        </dl>
      </section>`;
  }

  private lobbyMarkup(snapshot: LobbySnapshot, localPeerId: string): string {
    const controls = this.controller.getLobbyControls();
    const host = snapshot.players.find(({ role }) => role === "host");
    const guest = snapshot.players.find(({ role }) => role === "guest");
    const selectedBuild = findSavedBuild(this.profile, this.controller.getSelectedBuildId());
    const localBuildName = selectedBuild?.name ?? null;
    return `
      <div class="screen-heading multiplayer-screen-heading">
        <div><p class="eyebrow">多人联机</p><h2>联机大厅</h2></div>
        <button class="text-button multiplayer-leave" type="button">离开房间</button>
      </div>
      ${controls.localRole === "host" && this.hostEndpoint ? `
        <div class="multiplayer-host-endpoint">
          <span>主机地址</span>
          <code>${escapeMarkup(this.hostEndpoint.address)}:${this.hostEndpoint.port}</code>
          <button class="text-button multiplayer-copy-endpoint" type="button">复制地址</button>
        </div>` : ""}
      <div class="multiplayer-lobby-grid">
        ${this.seatMarkup("房主席位", host, localBuildName)}
        ${this.seatMarkup("客席位", guest, localBuildName)}
        <section class="multiplayer-lobby-actions">
          <h3>本地方案</h3>
          <label class="multiplayer-stack-field"><span>选择本地已保存方案</span><select class="multiplayer-build-select" aria-label="选择本地已保存方案">${this.buildOptionsMarkup()}</select></label>
          <label class="multiplayer-ready-toggle"><input class="multiplayer-ready-checkbox" type="checkbox" ${snapshot.players.find(({ peerId }) => peerId === localPeerId)?.ready ? "checked" : ""} ${controls.canReady ? "" : "disabled"} /><span>已准备</span></label>
          ${controls.selectedBuildReady ? "" : `<p class="multiplayer-warning">请先选择一套可出海的本地方案。</p>`}
          ${controls.showStart
            ? `<button class="menu-button primary multiplayer-start" type="button" ${controls.canStart ? "" : "disabled"}>启动战斗</button><p class="multiplayer-secondary-note">${controls.canStart ? "仅房主可启动" : "等待客席加入并准备。"}</p>`
            : `<p class="multiplayer-secondary-note">等待房主启动战斗。</p><p class="multiplayer-secondary-note">当前客席无需启动操作。</p>`}
        </section>
      </div>`;
  }

  private directoryMarkup(): string {
    const capabilityState = this.currentCapabilities();
    const supported = capabilityState.unsupportedSource === null;
    return `
      <div class="screen-heading multiplayer-screen-heading">
        <div><p class="eyebrow">多人联机</p><h2>局域网双人合作入口</h2></div>
        <button class="text-button multiplayer-back" type="button">返回任务</button>
      </div>
      <p class="mission-brief multiplayer-brief">创建或加入 2 人局域网房间。</p>
      ${capabilityState.unsupportedSource ? `<p class="multiplayer-inline-note">${capabilityState.unsupportedSource}</p>` : ""}
      <div class="multiplayer-grid">
        <section class="multiplayer-panel multiplayer-actions-panel">
          <label class="multiplayer-stack-field"><span>房间名称</span><input class="multiplayer-room-name" value="${escapeMarkup(this.roomName)}" maxlength="32" /></label>
          <div class="multiplayer-action-buttons">
            <button class="menu-button primary multiplayer-create" type="button" ${capabilityState.canCreate ? "" : "disabled"}>创建房间</button>
            <button class="menu-button multiplayer-search" type="button" ${capabilityState.canSearch ? "" : "disabled"}>搜索局域网房间</button>
            <button class="menu-button multiplayer-refresh" type="button" ${capabilityState.canRefresh ? "" : "disabled"}>刷新</button>
          </div>
          <label class="multiplayer-stack-field"><span>手动输入 IPv4</span><input class="multiplayer-address" value="${escapeMarkup(this.manualAddress)}" inputmode="decimal" /></label>
          <label class="multiplayer-stack-field"><span>允许端口</span><select class="multiplayer-port">${LAN_GAME_PORTS.map((port) => `<option value="${port}" ${String(port) === this.manualPort ? "selected" : ""}>${port}</option>`).join("")}</select></label>
          <button class="menu-button multiplayer-manual-join" type="button" ${capabilityState.canManualConnect ? "" : "disabled"}>加入房间</button>
          ${capabilityState.manualJoinSource ? `<p class="multiplayer-inline-note">${capabilityState.manualJoinSource}</p>` : ""}
        </section>
        <section class="multiplayer-panel multiplayer-directory-panel">
          <div class="multiplayer-directory-heading"><h3>局域网房间目录</h3><small>近似延迟（最近广播）</small></div>
          <div class="multiplayer-room-list">${supported ? this.roomCardsMarkup() : `<p class="multiplayer-room-state">${capabilityState.unsupportedSource}</p>`}</div>
        </section>
      </div>`;
  }

  private render(): void {
    const lobby = this.controller.getLobby();
    this.root.innerHTML = this.screen === "lobby" && lobby.snapshot && lobby.localPeerId
      ? this.lobbyMarkup(lobby.snapshot, lobby.localPeerId)
      : this.directoryMarkup();
    this.bindEvents();
    const status = this.statusSource ? `<p class="multiplayer-status" aria-live="polite">${escapeMarkup(this.statusSource)}</p>` : "";
    if (status) this.root.insertAdjacentHTML("beforeend", status);
    applyDocumentLocale(this.locale);
    localizeElement(this.root, this.locale);
  }

  private bindEvents(): void {
    this.root.querySelector<HTMLButtonElement>(".multiplayer-back")?.addEventListener("click", () => this.options.onBack());
    this.root.querySelector<HTMLInputElement>(".multiplayer-room-name")?.addEventListener("input", (event) => {
      this.roomName = (event.currentTarget as HTMLInputElement).value;
    });
    this.root.querySelector<HTMLInputElement>(".multiplayer-address")?.addEventListener("input", (event) => {
      this.manualAddress = (event.currentTarget as HTMLInputElement).value;
    });
    this.root.querySelector<HTMLSelectElement>(".multiplayer-port")?.addEventListener("change", (event) => {
      this.manualPort = (event.currentTarget as HTMLSelectElement).value;
    });
    this.root.querySelector<HTMLButtonElement>(".multiplayer-create")?.addEventListener("click", () => void this.handleCreateRoom());
    this.root.querySelector<HTMLButtonElement>(".multiplayer-search")?.addEventListener("click", () => void this.handleSearchRooms("search"));
    this.root.querySelector<HTMLButtonElement>(".multiplayer-refresh")?.addEventListener("click", () => void this.handleSearchRooms("refresh"));
    this.root.querySelector<HTMLButtonElement>(".multiplayer-manual-join")?.addEventListener("click", () => void this.handleManualJoin());
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(".multiplayer-room-join")) {
      button.addEventListener("click", () => {
        const room = this.roomDirectory.list().find(({ roomId }) => roomId === button.dataset.roomId);
        if (!room) return;
        this.manualAddress = room.address;
        this.manualPort = String(room.port);
        void this.handleManualJoin();
      });
    }
    this.root.querySelector<HTMLButtonElement>(".multiplayer-leave")?.addEventListener("click", () => void this.handleLeaveRoom());
    this.root.querySelector<HTMLSelectElement>(".multiplayer-build-select")?.addEventListener("change", (event) => {
      this.controller.selectBuild((event.currentTarget as HTMLSelectElement).value || null);
      this.render();
    });
    this.root.querySelector<HTMLInputElement>(".multiplayer-ready-checkbox")?.addEventListener("change", (event) => {
      void this.handleReadyChange((event.currentTarget as HTMLInputElement).checked);
    });
    this.root.querySelector<HTMLButtonElement>(".multiplayer-start")?.addEventListener("click", () => void this.handleStartLobby());
    this.root.querySelector<HTMLButtonElement>(".multiplayer-copy-endpoint")?.addEventListener("click", () => {
      void this.copyHostEndpoint();
    });
  }

  private async copyHostEndpoint(): Promise<void> {
    if (!this.hostEndpoint) return;
    try {
      await navigator.clipboard.writeText(`${this.hostEndpoint.address}:${this.hostEndpoint.port}`);
      this.statusSource = "主机地址已复制。";
    } catch {
      this.statusSource = "无法复制主机地址。";
    }
    this.render();
  }

  private async handleCreateRoom(): Promise<void> {
    const roomName = this.roomName.trim() || "本地房间";
    const result = await this.options.callbacks.createRoom({ roomName, buildId: this.controller.getSelectedBuildId() });
    this.statusSource = result.ok
      ? this.statusSource
      : result.errorSource ?? "创建房间失败。";
    if (result.lobby && result.localPeerId) {
      if (result.hostAddress && result.port) {
        this.hostEndpoint = { address: result.hostAddress, port: result.port };
      }
      this.controller.setLobby(result.lobby, result.localPeerId);
      this.screen = "lobby";
    }
    this.render();
  }

  private async handleSearchRooms(trigger: "search" | "refresh"): Promise<void> {
    this.loadingRooms = true;
    this.statusSource = null;
    this.render();
    const result = await this.options.callbacks.searchRooms();
    this.loadingRooms = false;
    if (result.ok) {
      this.applySearchResults(result.rooms);
      this.statusSource = null;
    } else {
      this.statusSource = result.errorSource ?? (trigger === "refresh"
        ? "搜索尚未连接到对战会话"
        : "搜索尚未连接到对战会话");
    }
    this.render();
  }

  private async handleManualJoin(): Promise<void> {
    const capabilityState = this.currentCapabilities();
    if (!capabilityState.canManualConnect) {
      this.statusSource = capabilityState.manualJoinSource;
      this.render();
      return;
    }
    const target = parseManualJoinTarget(this.manualAddress, this.manualPort);
    if (!target.ok) {
      this.statusSource = target.reason === "invalid-address"
        ? "请输入规范 IPv4 地址。"
        : "请选择 47778 到 47788 之间的端口。";
      this.render();
      return;
    }
    const result = await this.options.callbacks.manualJoin(target);
    this.statusSource = result.ok
      ? this.statusSource
      : result.errorSource ?? "加入房间失败。";
    if (result.lobby && result.localPeerId) {
      this.controller.setLobby(result.lobby, result.localPeerId);
      this.screen = "lobby";
    }
    this.render();
  }

  private async handleLeaveRoom(): Promise<void> {
    const result = await this.controller.requestLeave();
    if (result.ok) this.screen = "directory";
    else this.statusSource = result.errorSource ?? "离开房间失败。";
    this.render();
  }

  private async handleReadyChange(ready: boolean): Promise<void> {
    const ok = await this.controller.requestReady(ready);
    if (!ok) this.statusSource = "请先选择一套可出海的本地方案。";
    this.render();
  }

  private async handleStartLobby(): Promise<void> {
    const ok = await this.controller.requestStart();
    if (!ok) this.statusSource = "局域网联机桥不可用。";
    this.render();
  }
}
