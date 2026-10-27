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

// tb_1792532431_93509_9: глаголы агента — ОДНО описание (разведка §4):
// machine-readable здесь, то же самое таблицей в AGENT_DATA_MANIFEST.md §0.1.
// status — есть/частично/нет по таблице §2; transport — чем агент говорит
// с плеером: file (артефакт-файл) / file-queue (очередь, пока пусто) / none.
export type UIManifestVerbStatus = "present" | "partial" | "absent";
export type UIManifestVerbBy = "human" | "agent" | "both";
export type UIManifestVerbTransport = "file" | "file-queue" | "none";

export interface UIManifestVerb {
  name: string;
  status: UIManifestVerbStatus;
  by: UIManifestVerbBy;
  args: string;
  returns: string;
  transport: UIManifestVerbTransport;
  artifacts?: string[];
}

export interface UIManifest {
  player: string;
  /** 1 → 2: появились verbs (tb_1792532431_93509_9). */
  manifest_version: 2;
  version: string;
  controls: UIManifestControl[];
  verbs: UIManifestVerb[];
  api: string[];
  /**
   * tb_1791573274_29299_3: указатель на манифест ДАННЫХ для агента
   * (штатные маркеры файлами: SRT/sidecar, вопрос-скобки, экспорт).
   * Кнопки — здесь, данные — там.
   */
  dataManifest: string;
  /** Тот же файл из папки плеера (когда агент сидит в player_playground/). */
  dataManifestInPlayer: string;
  /**
   * tb_1792547382_5133_1: схемы данных в том же манифесте — агент читает
   * один файл вместо двух (указатель dataManifest остаётся). Список
   * сверен с AGENT_DATA_MANIFEST §1/§5 (см. DATA_SCHEMAS).
   */
  data: { manifest: string; manifestInPlayer: string; schemas: string[] };
}

const CONTROL_ROLES: readonly string[] = ["button", "slider", "input", "zone", "indicator"];
const CONTROL_WHEN: readonly string[] = ["always", "video", "conditional"];
const VERB_STATUS: readonly string[] = ["present", "partial", "absent"];
const VERB_BY: readonly string[] = ["human", "agent", "both"];
const VERB_TRANSPORT: readonly string[] = ["file", "file-queue", "none"];

// tb_1791573274_29299_3: манифест данных живёт рядом с вопросом-плейлистом.
export const DATA_MANIFEST_PATH = "player_playground/docs/AGENT_DATA_MANIFEST.md";
export const DATA_MANIFEST_PATH_IN_PLAYER = "docs/AGENT_DATA_MANIFEST.md";

/**
 * tb_1792547382_5133_1: схемы, которые плеер реально читает или пишет.
 * Источник правды — AGENT_DATA_MANIFEST: SRT-маркеры (§1), плейлист-вопрос
 * (§5), сайдкар `.sos.json` (sos_version 0.3). Тест сверяет список с docs:
 * новая схема без строки в манифесте данных роняет тест.
 */
export const DATA_SCHEMAS: readonly string[] = [
  "vetka.cut.question_playlist/1",
  "sos_version 0.3",
  "srt-markers",
];

// §2 разведки + шаг 2 (tb_1792536109_79489_5): глаголы показа. С шага 2
// агент говорит с плеером файловой очередью inbox/ + ack/ (Rust
// command_queue.rs) — transport=file-queue; file остаётся там, где правда
// лежит в артефакте (ответы, session.json).
export const SHOW_VERBS: readonly UIManifestVerb[] = [
  {
    name: "open_playlist",
    status: "present",
    by: "both",
    args:
      "path к <плейлист>.json (vetka.cut.question_playlist/1) ИЛИ entries[] — подборка/форма вопроса: path, question_id, question, hypothesis, in_sec/out_sec, choices[], markers[], bbox; by/task/layer — автор и этап",
    returns: "записи + карточка вопроса на экране; ответы — <плейлист>.answers.json",
    transport: "file-queue",
    artifacts: ["<плейлист>.json", "playlists/queue_<id>.playlist.json"],
  },
  {
    name: "open_file",
    status: "present",
    by: "both",
    args: "абсолютный путь к медиа",
    returns: "видео в окне; маркеры — отдельным импортом",
    transport: "file-queue",
    artifacts: ["<плейлист>.json → entry.path"],
  },
  {
    name: "seek",
    status: "present",
    by: "both",
    args: "t_sec",
    returns: "плейхед на t_sec",
    transport: "file-queue",
  },
  {
    name: "play_range",
    status: "present",
    by: "both",
    args: "in_sec, out_sec",
    returns: "проигрывание ровно окна записи (до out) и пауза",
    transport: "file-queue",
    artifacts: ["<плейлист>.json → in_sec/out_sec"],
  },
  {
    name: "caption",
    status: "partial",
    by: "human",
    args: "label, text, t_sec",
    returns: "комментарий в окне Markers",
    transport: "file",
    artifacts: ["answers.json", "<видео>.sos.json"],
  },
  {
    name: "next",
    status: "present",
    by: "both",
    args: "—",
    returns: "следующая запись плейлиста",
    transport: "file-queue",
  },
  {
    name: "pause",
    status: "present",
    by: "both",
    args: "t_sec (необязательно; пауза в заданной точке)",
    returns: "плеер на паузе (в t_sec, если задан)",
    transport: "file-queue",
  },
  {
    name: "ask_and_answer",
    status: "present",
    by: "both",
    args: "question_id, verdict (favorite|negative|comment)",
    returns: "reply-маркер + answers.json",
    transport: "file",
    artifacts: ["answers.json"],
  },
  {
    name: "show_session",
    status: "present",
    by: "agent",
    args: "— (пишет плеер)",
    returns: "где человек остановился / что отметил / сколько ответил",
    transport: "file",
    artifacts: ["<плейлист>.session.json"],
  },
];

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
    { testid: "transport-shuttle-badge", role: "indicator", label: "Shuttle level badge", when: "always" },
  ];
  return {
    player: "Mark Player",
    manifest_version: 2,
    version,
    controls,
    verbs: SHOW_VERBS.map((verb) => ({ ...verb, artifacts: verb.artifacts ? [...verb.artifacts] : undefined })),
    api: [...api],
    dataManifest: DATA_MANIFEST_PATH,
    dataManifestInPlayer: DATA_MANIFEST_PATH_IN_PLAYER,
    data: {
      manifest: DATA_MANIFEST_PATH,
      manifestInPlayer: DATA_MANIFEST_PATH_IN_PLAYER,
      schemas: [...DATA_SCHEMAS],
    },
  };
}

function isUIManifestVerb(raw: unknown): raw is UIManifestVerb {
  if (!raw || typeof raw !== "object") return false;
  const verb = raw as Record<string, unknown>;
  if (typeof verb.name !== "string" || verb.name.length === 0) return false;
  if (!VERB_STATUS.includes(verb.status as string)) return false;
  if (!VERB_BY.includes(verb.by as string)) return false;
  if (!VERB_TRANSPORT.includes(verb.transport as string)) return false;
  if (typeof verb.args !== "string" || verb.args.length === 0) return false;
  if (typeof verb.returns !== "string" || verb.returns.length === 0) return false;
  if (verb.artifacts !== undefined) {
    if (!Array.isArray(verb.artifacts)) return false;
    if (!verb.artifacts.every((item) => typeof item === "string" && item.length > 0)) return false;
  }
  // file-глагол обязан назвать файл/поле, которым он говорит.
  if (verb.transport === "file" && (!Array.isArray(verb.artifacts) || verb.artifacts.length === 0)) return false;
  return true;
}

export function isUIManifest(raw: unknown): raw is UIManifest {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  if (typeof record.player !== "string" || record.player.length === 0) return false;
  if (record.manifest_version !== 2) return false;
  if (typeof record.version !== "string" || record.version.length === 0) return false;
  if (!Array.isArray(record.api)) return false;
  if (!Array.isArray(record.verbs) || record.verbs.length === 0) return false;
  if (!record.verbs.every(isUIManifestVerb)) return false;
  if (typeof record.dataManifest !== "string" || record.dataManifest.length === 0) return false;
  if (typeof record.dataManifestInPlayer !== "string" || record.dataManifestInPlayer.length === 0) return false;
  const data = record.data;
  if (!data || typeof data !== "object") return false;
  const dataBlock = data as Record<string, unknown>;
  if (typeof dataBlock.manifest !== "string" || dataBlock.manifest.length === 0) return false;
  if (typeof dataBlock.manifestInPlayer !== "string" || dataBlock.manifestInPlayer.length === 0) return false;
  if (!Array.isArray(dataBlock.schemas) || dataBlock.schemas.length === 0) return false;
  if (!dataBlock.schemas.every((schema) => typeof schema === "string" && schema.length > 0)) return false;
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
