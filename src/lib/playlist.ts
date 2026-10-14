import type { QuestionEntryFields, QuestionPlaylistSource } from "./questionPlaylist";

export interface PlaylistEntry {
  path: string;
  name: string;
  duration: number;
  addedAt: string;
}

// tb_1791521998_11250_5: запись-вопрос — все поля необязательные,
// старый плейлист без них открывается как раньше.
export interface QuestionPlaylistEntry extends PlaylistEntry, QuestionEntryFields {}

export interface Playlist {
  id: string;
  name: string;
  entries: PlaylistEntry[];
  createdAt: string;
  /** vetka.cut.question_playlist/1 — только у плейлиста-вопроса */
  schema?: string;
  /** кто спросил и о чём (by/task/layer) */
  source?: QuestionPlaylistSource;
}

const STORAGE_KEY = "vetka_player_lab_playlist_v1";

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createEmptyPlaylist(name = "New Playlist"): Playlist {
  return {
    id: generateId(),
    name,
    entries: [],
    createdAt: new Date().toISOString(),
  };
}

export function savePlaylist(playlist: Playlist): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
  } catch {
    console.warn("[Playlist] Failed to save to localStorage");
  }
}

export function loadPlaylist(): Playlist | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Playlist;
  } catch {
    return null;
  }
}

export function addEntry(playlist: Playlist, entry: Omit<PlaylistEntry, "addedAt">): Playlist {
  return {
    ...playlist,
    entries: [...playlist.entries, { ...entry, addedAt: new Date().toISOString() }],
  };
}

// 0.10.24: add-if-absent — открытое видео падает в плейлист, дубли по path не плодятся.
export function addEntryIfAbsent(playlist: Playlist, entry: Omit<PlaylistEntry, "addedAt">): Playlist {
  if (!entry.path || playlist.entries.some((e) => e.path === entry.path)) return playlist;
  return addEntry(playlist, entry);
}

// tb_1791563210_29299_4: открытое видео НЕ дописываем в плейлист-вопрос —
// иначе в хвосте агентского «вот N мест для проверки» копятся левые записи.
// Эвристика та же, что isQuestionPlaylist, но без импорта-цикла:
// схема вопроса либо хоть одна запись с вопросом.
export function trackOpenedFile(
  base: Playlist | null,
  entry: Omit<PlaylistEntry, "addedAt">,
): Playlist {
  const list = base ?? createEmptyPlaylist();
  const entries = list.entries as (PlaylistEntry & { question_id?: unknown })[];
  if (
    (list as { schema?: unknown }).schema === "vetka.cut.question_playlist/1" ||
    entries.some((e) => typeof e.question_id === "string")
  ) {
    return list;
  }
  return addEntryIfAbsent(list, entry);
}

export function removeEntry(playlist: Playlist, path: string): Playlist {
  return {
    ...playlist,
    entries: playlist.entries.filter((e) => e.path !== path),
  };
}

export function moveEntry(playlist: Playlist, fromIndex: number, toIndex: number): Playlist {
  if (fromIndex < 0 || fromIndex >= playlist.entries.length) return playlist;
  if (toIndex < 0 || toIndex >= playlist.entries.length) return playlist;
  if (fromIndex === toIndex) return playlist;
  const entries = [...playlist.entries];
  const [moved] = entries.splice(fromIndex, 1);
  entries.splice(toIndex, 0, moved);
  return { ...playlist, entries };
}

// Режим воспроизведения живёт отдельно от плейлиста: экспорт/импорт JSON
// плейлиста не меняется, а режим — настройка плеера, не содержимое списка.
export type LoopMode = "off" | "all" | "one";

export interface PlaybackMode {
  shuffle: boolean;
  loop: LoopMode;
}

const MODE_STORAGE_KEY = "vetka_player_lab_playlist_mode_v1";

export const DEFAULT_PLAYBACK_MODE: PlaybackMode = { shuffle: false, loop: "off" };

export function nextLoopMode(loop: LoopMode): LoopMode {
  return loop === "off" ? "all" : loop === "all" ? "one" : "off";
}

export function loadPlaybackMode(): PlaybackMode {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYBACK_MODE;
    const parsed = JSON.parse(raw) as Partial<PlaybackMode>;
    const loop: LoopMode = parsed.loop === "all" || parsed.loop === "one" ? parsed.loop : "off";
    return { shuffle: parsed.shuffle === true, loop };
  } catch {
    return DEFAULT_PLAYBACK_MODE;
  }
}

export function savePlaybackMode(mode: PlaybackMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(mode));
  } catch {
    console.warn("[Playlist] Failed to save playback mode");
  }
}

/**
 * Следующая запись после окончания текущей.
 * loop "one" — та же запись (перезапуск делает вызывающий: src не меняется).
 * shuffle — случайная запись, кроме текущей; при loop "off" список не кончается
 * сам, как и в обычных плеерах (остановка — пользователем).
 * Без shuffle: по порядку; loop "all" заворачивает на первую.
 */
export function getNextEntry(
  playlist: Playlist,
  currentPath: string | null,
  mode: PlaybackMode = DEFAULT_PLAYBACK_MODE,
  random: () => number = Math.random,
): PlaylistEntry | null {
  const { entries } = playlist;
  if (!entries.length) return null;
  if (!currentPath) return entries[0];
  const idx = entries.findIndex((e) => e.path === currentPath);
  return stepFromIndex(entries, idx, mode, random)?.entry ?? null;
}

function stepFromIndex(
  entries: PlaylistEntry[],
  idx: number,
  mode: PlaybackMode,
  random: () => number,
): { entry: PlaylistEntry; index: number } | null {
  if (!entries.length) return null;
  if (mode.loop === "one" && idx >= 0) return { entry: entries[idx], index: idx };
  if (mode.shuffle) {
    const others = entries.map((_, i) => i).filter((i) => i !== idx);
    if (!others.length) return mode.loop === "all" && idx >= 0 ? { entry: entries[idx], index: idx } : null;
    const pick = others[Math.min(others.length - 1, Math.floor(random() * others.length))];
    return { entry: entries[pick], index: pick };
  }
  if (idx < 0) return null;
  if (idx >= entries.length - 1) return mode.loop === "all" ? { entry: entries[0], index: 0 } : null;
  return { entry: entries[idx + 1], index: idx + 1 };
}

/** Курсор текущей записи: путь + вопрос (панель везёт оба) + индекс. */
export interface AdvanceCursor {
  path: string | null;
  questionId?: string | null;
  // tb_1791876286_57716_1: сиблинги делят path+qid (trk-10 A/B — два окна
  // в одном прокси) — first-match резолвился в A, B повторялась вечно.
  // Индекс — точная identity; валидируем ниже, иначе старые правила.
  index?: number | null;
}

// tb_1791865711_84020_5: фантом «плейлист возвращается назад». Корень:
// несколько записей-вопросов делят один path (60 видео, вопросы Beta),
// а переход искал findIndex-первое вхождение — с не-первой дублированной
// записи прыгал НАЗАД (на первую+1). Индекс текущей — по вопросу, иначе
// по пути; вопрос чужого пути не засчитываем.
export function findCurrentEntryIndex(entries: unknown, cursor: AdvanceCursor): number {
  if (!Array.isArray(entries)) return -1;
  // tb_1791876286_57716_1: индекс важнее first-match — но только
  // валидированный (список мог переупорядочиться между кликом и открытием).
  const ci = cursor.index;
  if (typeof ci === "number" && Number.isInteger(ci) && ci >= 0 && ci < entries.length) {
    const cand = entries[ci] as { path?: unknown; question_id?: unknown } | null;
    if (cand && typeof cand === "object" && cand.path === cursor.path &&
        (cursor.questionId == null || cand.question_id === cursor.questionId)) {
      return ci;
    }
  }
  const path = cursor.path;
  const qid = cursor.questionId;
  if (typeof qid === "string" && qid) {
    const byQ = (entries as unknown[]).findIndex((raw) =>
      !!raw && typeof raw === "object" &&
      (raw as { question_id?: unknown }).question_id === qid &&
      (!path || (raw as { path?: unknown }).path === path));
    if (byQ >= 0) return byQ;
  }
  if (typeof path !== "string" || !path) return -1;
  return (entries as unknown[]).findIndex((raw) =>
    !!raw && typeof raw === "object" && (raw as { path?: unknown }).path === path);
}

/** Следующая запись от КУРСОРА (а не от первого совпадения пути). */
export function getNextEntryFromCursor(
  playlist: Playlist,
  cursor: AdvanceCursor,
  mode: PlaybackMode = DEFAULT_PLAYBACK_MODE,
  random: () => number = Math.random,
): { entry: PlaylistEntry; index: number } | null {
  const { entries } = playlist;
  if (!entries.length) return null;
  if (!cursor.path) return { entry: entries[0], index: 0 };
  return stepFromIndex(entries, findCurrentEntryIndex(entries, cursor), mode, random);
}

export function serializePlaylist(playlist: Playlist): string {
  return JSON.stringify(playlist, null, 2);
}

export function deserializePlaylist(json: string): Playlist | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed as Playlist;
  } catch {
    return null;
  }
}

// tb_1791143015_70644_10: имя плейлиста редактируется из шапки панели.
// Пустое/пробельное — откат к дефолту, окаменелостей вроде «Bell gate» больше нет.
export function renamePlaylist(playlist: Playlist, name: string): Playlist {
  const clean = name.trim();
  return { ...playlist, name: clean || "New Playlist" };
}

// Имя плейлиста → имя файла экспорта: только латиница/цифры, серии мусора —
// в один _, края чистятся, пустое — «playlist».
export function sanitizePlaylistFilename(name: string | null | undefined): string {
  const flat = (name ?? "").trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return flat || "playlist";
}
