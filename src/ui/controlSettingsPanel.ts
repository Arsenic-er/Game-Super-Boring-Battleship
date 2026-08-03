import type { GameSettings } from "../settings/gameSettings";

export class ControlSettingsPanel {
  private settings: GameSettings;
  private readonly steeringValue: HTMLElement;
  private readonly aimValue: HTMLElement;

  constructor(
    parent: HTMLElement,
    initialSettings: GameSettings,
    onChange: (settings: GameSettings) => void,
  ) {
    this.settings = { ...initialSettings };
    const panel = document.createElement("section");
    panel.className = "control-settings panel hud-tactical";
    panel.setAttribute("aria-label", "操控灵敏度快速设置");
    panel.innerHTML = `
      <div class="settings-heading">
        <div><p class="eyebrow">快速设置</p><strong>操控灵敏度</strong></div>
        <small>稍后移入设置菜单</small>
      </div>
      <label class="sensitivity-row">
        <span>转向</span>
        <input id="steering-sensitivity" type="range" min="35" max="100" step="5" />
        <output id="steering-value">100%</output>
      </label>
      <label class="sensitivity-row">
        <span>瞄准</span>
        <input id="aim-sensitivity" type="range" min="50" max="200" step="10" />
        <output id="aim-value">100%</output>
      </label>`;
    parent.append(panel);

    const steering = panel.querySelector<HTMLInputElement>("#steering-sensitivity");
    const aim = panel.querySelector<HTMLInputElement>("#aim-sensitivity");
    const steeringValue = panel.querySelector<HTMLElement>("#steering-value");
    const aimValue = panel.querySelector<HTMLElement>("#aim-value");
    if (!steering || !aim || !steeringValue || !aimValue) {
      throw new Error("Failed to create sensitivity controls");
    }
    this.steeringValue = steeringValue;
    this.aimValue = aimValue;
    steering.value = String(Math.round(this.settings.steeringSensitivity * 100));
    aim.value = String(Math.round(this.settings.aimSensitivity * 100));
    this.updateLabels();

    steering.addEventListener("input", () => {
      this.settings = { ...this.settings, steeringSensitivity: Number(steering.value) / 100 };
      this.updateLabels();
      onChange({ ...this.settings });
    });
    aim.addEventListener("input", () => {
      this.settings = { ...this.settings, aimSensitivity: Number(aim.value) / 100 };
      this.updateLabels();
      onChange({ ...this.settings });
    });
  }

  private updateLabels(): void {
    this.steeringValue.textContent = `${Math.round(this.settings.steeringSensitivity * 100)}%`;
    this.aimValue.textContent = `${Math.round(this.settings.aimSensitivity * 100)}%`;
  }
}
