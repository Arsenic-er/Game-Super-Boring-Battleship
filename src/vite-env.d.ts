/// <reference types="vite/client" />

import type { BattleshipLanApi } from "./net/lanBridge";

declare global {
  interface Window {
    battleshipLan?: BattleshipLanApi;
  }
}

export {};
