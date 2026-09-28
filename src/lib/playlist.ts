export interface PlaylistEntry {
  path: string;
  name: string;
  duration: number;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  entries: PlaylistEntry[];
  createdAt: string;
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
  if (mode.loop === "one" && idx >= 0) return entries[idx];
  if (mode.shuffle) {
    const others = entries.filter((_, i) => i !== idx);
    if (!others.length) return mode.loop === "all" ? entries[idx] : null;
    return others[Math.min(others.length - 1, Math.floor(random() * others.length))];
  }
  if (idx < 0) return null;
  if (idx >= entries.length - 1) return mode.loop === "all" ? entries[0] : null;
  return entries[idx + 1];
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
