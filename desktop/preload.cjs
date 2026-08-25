const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = Object.freeze({
  capabilities: "battleship-lan:capabilities",
  createRoom: "battleship-lan:create-room",
  updateAnnouncement: "battleship-lan:update-announcement",
  closeRoom: "battleship-lan:close-room",
  startDiscovery: "battleship-lan:start-discovery",
  stopDiscovery: "battleship-lan:stop-discovery",
  connect: "battleship-lan:connect",
  disconnect: "battleship-lan:disconnect",
  acceptConnection: "battleship-lan:accept-connection",
  closeConnection: "battleship-lan:close-connection",
  send: "battleship-lan:send",
  event: "battleship-lan:event",
});

function createPreloadApi(ipcRenderer) {
  return Object.freeze({
    capabilities: () => ipcRenderer.invoke(CHANNELS.capabilities),
    createRoom: (request) => ipcRenderer.invoke(CHANNELS.createRoom, request),
    updateAnnouncement: (announcementJson) => ipcRenderer.invoke(CHANNELS.updateAnnouncement, announcementJson),
    closeRoom: () => ipcRenderer.invoke(CHANNELS.closeRoom),
    startDiscovery: () => ipcRenderer.invoke(CHANNELS.startDiscovery),
    stopDiscovery: () => ipcRenderer.invoke(CHANNELS.stopDiscovery),
    connect: (url) => ipcRenderer.invoke(CHANNELS.connect, url),
    disconnect: () => ipcRenderer.invoke(CHANNELS.disconnect),
    acceptConnection: (connectionId) => ipcRenderer.invoke(CHANNELS.acceptConnection, connectionId),
    closeConnection: (connectionId, reason) => ipcRenderer.invoke(CHANNELS.closeConnection, connectionId, reason),
    send: (messageJson, target) => ipcRenderer.invoke(CHANNELS.send, messageJson, target),
    subscribe: (listener) => {
      if (typeof listener !== "function") throw new TypeError("listener-must-be-function");
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on(CHANNELS.event, wrapped);
      return () => ipcRenderer.off(CHANNELS.event, wrapped);
    },
  });
}

function installBattleshipLanBridge(contextBridge, ipcRenderer) {
  contextBridge.exposeInMainWorld("battleshipLan", createPreloadApi(ipcRenderer));
}

installBattleshipLanBridge(contextBridge, ipcRenderer);

module.exports = {
  CHANNELS,
  createPreloadApi,
  installBattleshipLanBridge,
};
