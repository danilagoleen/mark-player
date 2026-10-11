// tb_1791233033_7043_2 — манифест агента: как пользоваться плеером
// без гаданий по DOM (слоение 22.09: манифест+FOVEA едут в релиз).
//
// Статика (testid/роли/подписи) живёт здесь и покрыта unit-тестами.
// Динамику (список методов window.vetkaPlayerLab) подставляет App через
// Object.keys(api) — дрейф имён невозможен по построению.
export type UIManifestControlRole = "button" | "slider" | "input" | "zone" | "indicator";

export type UIManifestControlWhen = "always" | "video" | "conditional";

export interface UIManifestControl {
  testid: string;
  role: UIManifestControlRole;
  label: string;
  when: UIManifestControlWhen;
}

export interface UIManifest {
  player: string;
  version: string;
  controls: UIManifestControl[];
  api: string[];
  /**
   * tb_1791573274_29299_3: указатель на манифест ДАННЫХ для агента
   * (штатные маркеры файлами: SRT/sidecar, вопрос-скобки, экспорт).
   * Кнопки — здесь, данные — там.
   */
  dataManifest: string;
}

const CONTROL_ROLES: readonly string[] = ["button", "slider", "input", "zone", "indicator"];
const CONTROL_WHEN: readonly string[] = ["always", "video", "conditional"];

// tb_1791573274_29299_3: манифест данных живёт рядом с вопросом-плейлистом.
export const DATA_MANIFEST_PATH = "player_playground/docs/AGENT_DATA_MANIFEST.md";

export function buildUIManifest(version: string, api: string[]): UIManifest {
  const controls: UIManifestControl[] = [
    { testid: "viewer-open", role: "button", label: "Open media (empty window)", when: "always" },
    { testid: "context-action", role: "button", label: "Open markers / Favorite this moment", when: "always" },
    { testid: "corner-playlist", role: "button", label: "Open playlist window", when: "always" },
    { testid: "marker-favorite", role: "button", label: "Mark favorite at playhead (F)", when: "video" },
    { testid: "marker-negative", role: "button", label: "Mark negative at playhead (N)", when: "video" },
    { testid: "marker-in", role: "button", label: "Mark in-point at playhead (I)", when: "video" },
    { testid: "marker-out", role: "button", label: "Mark out-point at playhead (O)", when: "video" },
    { testid: "marker-comment", role: "button", label: "Open markers panel (M)", when: "video" },
    { testid: "transport-play-pause", role: "button", label: "Play / pause (Space)", when: "video" },
    { testid: "transport-progress", role: "slider", label: "Seek (range input, seconds)", when: "video" },
    { testid: "transport-mute", role: "button", label: "Mute / unmute", when: "video" },
    { testid: "transport-volume", role: "slider", label: "Volume (range input 0..1, in popup)", when: "conditional" },
    { testid: "seek-backward", role: "zone", label: "Seek backward (left screen zone)", when: "video" },
    { testid: "seek-forward", role: "zone", label: "Seek forward (right screen zone)", when: "video" },
    { testid: "transport-selection", role: "indicator", label: "In-out total (only with in-out pairs)", when: "conditional" },
    { testid: "transport-seeking", role: "indicator", label: "Seeking… (decoder catching up)", when: "conditional" },
    { testid: "transport-shuttle-badge", role: "indicator", label: "Shuttle level badge", when: "always" },
  ];
  return { player: "Mark Player", version, controls, api: [...api], dataManifest: DATA_MANIFEST_PATH };
}

export function isUIManifest(raw: unknown): raw is UIManifest {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  if (typeof record.player !== "string" || record.player.length === 0) return false;
  if (typeof record.version !== "string" || record.version.length === 0) return false;
  if (!Array.isArray(record.api)) return false;
  if (typeof record.dataManifest !== "string" || record.dataManifest.length === 0) return false;
  if (!Array.isArray(record.controls) || record.controls.length === 0) return false;
  return (record.controls as unknown[]).every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const control = entry as Record<string, unknown>;
    if (typeof control.testid !== "string" || control.testid.length === 0) return false;
    if (typeof control.label !== "string" || control.label.length === 0) return false;
    if (!CONTROL_ROLES.includes(control.role as string)) return false;
    if (!CONTROL_WHEN.includes(control.when as string)) return false;
    return true;
  });
}
