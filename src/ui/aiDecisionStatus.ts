import type { AiDecisionTelemetry, AiMainGunHoldReason } from "../sim/types";
import type { GameLocale } from "../i18n/gameLocale";
import { aiDecisionText, type AiDecisionMessageKey } from "../i18n/aiDecisionLocale";

export interface AiDecisionStatusText {
  navigation: string;
  gunnery: string;
  mounts: string;
}

const holdReasonKeys = {
  "torpedo-selected": "torpedo-selected", withdrawal: "withdrawal", smoke: "smoke",
  cover: "cover", "no-track": "no-track", "out-of-range": "out-of-range", arc: "arc",
  "salvo-window": "salvo-window", "no-guns": "no-guns", "gun-disabled": "gun-disabled",
  reloading: "reloading",
} satisfies Record<AiMainGunHoldReason, AiDecisionMessageKey>;

/** Display-only, pre-command diagnostics. Readiness does not assert a shell was spawned. */
export function formatAiDecisionStatus(
  decision: Pick<AiDecisionTelemetry, "navigation" | "gunnery"> | undefined,
  locale: GameLocale,
): AiDecisionStatusText {
  const t = (key: AiDecisionMessageKey) => aiDecisionText(locale, key);
  const unknown = t("unknown");
  const integer = (value: number) => Number.isFinite(value) && value >= 0
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.floor(value)) : unknown;
  const flag = (value: boolean | undefined) => value === undefined ? unknown : t(value ? "yes" : "no");
  const nav = decision?.navigation;
  const gun = decision?.gunnery;
  const throttle = nav?.throttleLimit;
  const throttleText = throttle === undefined || !Number.isFinite(throttle) ? unknown
    : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(throttle);
  const navigation = nav
    ? [t("navigation") + ": " + t(nav.phase), t("corridor") + ": " + (nav.forwardClear === undefined ? unknown : t(nav.forwardClear ? "clear" : "blocked")),
      t("committed") + ": " + flag(nav.exitCommitted), t("throttle") + ": " + throttleText].join(" · ")
    : t("navigation") + ": " + unknown;
  if (!gun) return { navigation, gunnery: t("intent") + ": " + unknown, mounts: t("mounts") + ": " + unknown };
  const reasons = [...new Set(gun.holdReasons)].map((reason) => t(holdReasonKeys[reason])).join(" / ") || t("none");
  const seconds = gun.reloadSeconds;
  const reload = seconds === Number.POSITIVE_INFINITY ? t("unbounded")
    : seconds === undefined || !Number.isFinite(seconds) ? unknown
      : new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.max(0, seconds)) + " s";
  return {
    navigation,
    gunnery: t("intent") + ": " + t(gun.requested ? "requested" : "held") + " · " + t("restrictions") + ": " + reasons,
    mounts: [t("mounts"), t("ready") + ": " + integer(gun.readyMounts) + "/" + integer(gun.totalMounts),
      t("operational") + ": " + integer(gun.operationalMounts) + "/" + integer(gun.totalMounts), t("reload") + ": " + reload].join(" · "),
  };
}
