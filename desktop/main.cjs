const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { createLanBridge, createLanIpcController } = require("./lanBridge.cjs");

app.commandLine.appendSwitch("disable-gpu-sandbox");

let lanIpcController;

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

function startApp() {
  const bridge = createLanBridge();
  lanIpcController = createLanIpcController({
    bridge,
    ipcMain,
    getWindowFromSender: (sender) => BrowserWindow.fromWebContents(sender),
  });

  app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("before-quit", () => {
  void lanIpcController?.dispose();
  lanIpcController = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

startApp();
