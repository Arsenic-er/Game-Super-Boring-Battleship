const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { createLanBridge } = require("./lanBridge.cjs");

app.commandLine.appendSwitch("disable-gpu-sandbox");

const bridge = createLanBridge();
const senderRecords = new Map();
const CHANNELS = Object.freeze({
  capabilities: "battleship-lan:capabilities",
  createRoom: "battleship-lan:create-room",
  updateAnnouncement: "battleship-lan:update-announcement",
  closeRoom: "battleship-lan:close-room",
  startDiscovery: "battleship-lan:start-discovery",
  stopDiscovery: "battleship-lan:stop-discovery",
  connect: "battleship-lan:connect",
  disconnect: "battleship-lan:disconnect",
  send: "battleship-lan:send",
  event: "battleship-lan:event",
});

bridge.subscribe((payload) => {
  for (const record of senderRecords.values()) {
    if (!record.sender.isDestroyed()) record.sender.send(CHANNELS.event, payload);
  }
});

function cleanupSender(sender) {
  const record = senderRecords.get(sender.id);
  if (!record) return;
  senderRecords.delete(sender.id);
  sender.removeListener("destroyed", record.onSenderDestroyed);
  if (record.window && !record.window.isDestroyed()) record.window.removeListener("closed", record.onWindowClosed);
  if (senderRecords.size === 0) void bridge.dispose();
}

function trackSender(sender) {
  if (senderRecords.has(sender.id)) return;
  const window = BrowserWindow.fromWebContents(sender);
  const onSenderDestroyed = () => cleanupSender(sender);
  const onWindowClosed = () => cleanupSender(sender);
  sender.once("destroyed", onSenderDestroyed);
  if (window) window.once("closed", onWindowClosed);
  senderRecords.set(sender.id, { sender, window, onSenderDestroyed, onWindowClosed });
}

function registerLanHandlers() {
  ipcMain.handle(CHANNELS.capabilities, async (event) => {
    trackSender(event.sender);
    return await bridge.capabilities();
  });
  ipcMain.handle(CHANNELS.createRoom, async (event, request) => {
    trackSender(event.sender);
    return await bridge.createRoom(request);
  });
  ipcMain.handle(CHANNELS.updateAnnouncement, async (event, announcementJson) => {
    trackSender(event.sender);
    await bridge.updateAnnouncement(announcementJson);
  });
  ipcMain.handle(CHANNELS.closeRoom, async (event) => {
    trackSender(event.sender);
    await bridge.closeRoom();
  });
  ipcMain.handle(CHANNELS.startDiscovery, async (event) => {
    trackSender(event.sender);
    await bridge.startDiscovery();
  });
  ipcMain.handle(CHANNELS.stopDiscovery, async (event) => {
    trackSender(event.sender);
    await bridge.stopDiscovery();
  });
  ipcMain.handle(CHANNELS.connect, async (event, url) => {
    trackSender(event.sender);
    await bridge.connect(url);
  });
  ipcMain.handle(CHANNELS.disconnect, async (event) => {
    trackSender(event.sender);
    await bridge.disconnect();
  });
  ipcMain.handle(CHANNELS.send, async (event, messageJson) => {
    trackSender(event.sender);
    await bridge.send(messageJson);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#07151e",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  registerLanHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  for (const record of senderRecords.values()) {
    record.sender.removeListener("destroyed", record.onSenderDestroyed);
    if (record.window && !record.window.isDestroyed()) record.window.removeListener("closed", record.onWindowClosed);
  }
  senderRecords.clear();
  void bridge.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
