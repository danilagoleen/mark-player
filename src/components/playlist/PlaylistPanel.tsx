import { useCallback, useEffect, useRef, useState } from "react";
import type { Playlist, PlaylistEntry, QuestionPlaylistEntry } from "../../lib/playlist";
import type { PlaybackMode } from "../../lib/playlist";
import { createEmptyPlaylist, loadPlaylist, removeEntry, moveEntry, serializePlaylist, loadPlaybackMode, savePlaybackMode, savePlaylist, nextLoopMode, renamePlaylist, sanitizePlaylistFilename } from "../../lib/playlist";
import type { QuestionPlaylist } from "../../lib/questionPlaylist";
import { isQuestionPlaylist, normalizeQuestionEntry, rememberQuestionPlaylistPath } from "../../lib/questionPlaylist";
import {
  agentAuthorFor,
  filterNewMarkers,
  materializeQuestionEntry,
  type MaterializedMarker,
} from "../../lib/questionMaterialize";
import { toAssetUrl } from "../../lib/nativeWindow";
import { importBetaBundleText } from "../../lib/betaBundles";
import { readInOutPlayEnabled, writeInOutPlayEnabled, INOUT_PLAY_STORAGE_KEY } from "../../lib/inOutPlayback";
import { Download, Repeat, Repeat1, Scissors, Shuffle, Upload } from "lucide-react";

interface PlaylistPanelProps {
  currentPath: string | null;
  onPlay: (entry: PlaylistEntry) => void;
  onClose: () => void;
  standalone?: boolean;
}

export function PlaylistPanel({ currentPath, onPlay, onClose: _onClose, standalone }: PlaylistPanelProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [mode, setMode] = useState<PlaybackMode>(() => loadPlaybackMode());
  // tb_1791654032_27281_1: что загружено (файл + итог) — видно, какой список
  // на экране; тихий импорт без разбора остался в прошлом.
  const [loadedLine, setLoadedLine] = useState<string | null>(null);
  // tb_1791143015_70644_7: тумблер In–Out Play рядом с loop/shuffle.
  // Владелец состояния — главное окно (App); панель пишет LS-ключ, главное
  // подхватывает через storage; обратно — тем же путём через refresh.
  const [inOutPlay, setInOutPlay] = useState<boolean>(() => readInOutPlayEnabled());
  const toggleInOutPlay = useCallback(() => {
    setInOutPlay((prev) => {
      const next = !prev;
      writeInOutPlayEnabled(next);
      return next;
    });
  }, []);
  const updateMode = useCallback((next: PlaybackMode) => {
    setMode(next);
    savePlaybackMode(next);
  }, []);

  const refresh = useCallback(() => {
    setPlaylist(loadPlaylist());
  }, []);

  useEffect(() => {
    refresh();
    const handler = (event: Event) => {
      refresh();
      // tb_1791143015_70644_7: тумблер могли щёлкнуть из главного окна (S/меню).
      if ((event as StorageEvent).key === undefined || (event as StorageEvent).key === INOUT_PLAY_STORAGE_KEY) {
        setInOutPlay(readInOutPlayEnabled());
      }
    };
    window.addEventListener("storage", handler);
    // tb_1791563210_29299_4: storage между вебвью Tauri не доходит —
    // главное окно будит уже открытую панель событием playlist:reload.
    let unlisten: (() => void) | null = null;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        import("../../lib/playlistPlay").then(({ PLAYLIST_RELOAD_EVENT }) => {
          listen(PLAYLIST_RELOAD_EVENT, () => refresh()).then((fn) => { unlisten = fn; }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener("storage", handler);
      unlisten?.();
    };
  }, [refresh]);

  const handleRemove = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setPlaylist((prev) => {
      if (!prev) return prev;
      const updated = removeEntry(prev, path);
      try {
        localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const handleMoveUp = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index === 0) return;
    setPlaylist((prev) => {
      if (!prev) return prev;
      const updated = moveEntry(prev, index, index - 1);
      try {
        localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const handleMoveDown = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setPlaylist((prev) => {
      if (!prev) return prev;
      if (index >= prev.entries.length - 1) return prev;
      const updated = moveEntry(prev, index, index + 1);
      try {
        localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    setDragOverIndex(null);
    if (from === null || from === targetIndex) return;
    setPlaylist((prev) => {
      if (!prev) return prev;
      const updated = moveEntry(prev, from, targetIndex);
      try {
        localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleRename = useCallback((name: string) => {
    setPlaylist((prev) => {
      if (!prev) return prev;
      const updated = renamePlaylist(prev, name);
      savePlaylist(updated);
      return updated;
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (!playlist) return;
    const json = serializePlaylist(playlist);
    const fileName = `${sanitizePlaylistFilename(playlist.name)}.json`;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const fs = await import("@tauri-apps/plugin-fs");
        const savePath = await dialog.save({
          defaultPath: fileName,
          filters: [{ name: "Playlist JSON", extensions: ["json"] }],
        });
        if (!savePath || typeof savePath !== "string") return;
        await fs.writeTextFile(savePath, json);
        return;
      } catch { /* fallback to blob */ }
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [playlist]);

  const handleImport = useCallback(async () => {
    // Tauri standalone: use native dialog + fs (file input unreliable in WebView)
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const fs = await import("@tauri-apps/plugin-fs");
        const selected = await dialog.open({
          multiple: false,
          filters: [{ name: "Playlist JSON", extensions: ["json"] }],
        });
        const path = typeof selected === "string" ? selected : (Array.isArray(selected) ? selected[0] : null);
        if (!path || typeof path !== "string") return;
        const text = await fs.readTextFile(path);
        const { deserializePlaylist } = await import("../../lib/playlist");
        const parsed = deserializePlaylist(text);
        const fileLabel = path.split(/[\\/]/).pop() || path;
        if (!parsed) {
          // tb_1791684645_1275_1: рабочие форматы Беты — конвертируем
          // в вопрос-плейлист (answers лягут рядом с исходником).
          const converted = await importBetaBundleText(text, path);
          if (converted) {
            const { isQuestionPlaylist } = await import("../../lib/questionPlaylist");
            rememberQuestionPlaylistPath(isQuestionPlaylist(converted) ? path : null);
            try {
              localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(converted));
            } catch { /* ignore */ }
            setPlaylist(converted);
            setLoadedLine(await describeLoadedPlaylist(converted, fileLabel));
            return;
          }
          // tb_1791654032_27281_1: тихий отказ остался в прошлом — видно,
          // что файл не список (нужен {entries:[...]}), старый список цел.
          setLoadedLine(`Could not load ${fileLabel}: not a playlist file (needs {entries: [...]}).`);
          return;
        }
        // tb_1791521998_11250_5: ответы лягут рядом с этим файлом
        const { isQuestionPlaylist } = await import("../../lib/questionPlaylist");
        rememberQuestionPlaylistPath(isQuestionPlaylist(parsed) ? path : null);
        try {
          localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(parsed));
        } catch { /* ignore */ }
        setPlaylist(parsed);
        // tb_1791654032_27281_1: вопрос-плейлист при открытии СРАЗУ кладёт
        // штатные маркеры (in/out + комменты agent:<роль>) — кнопок нет,
        // файл агента и есть подтверждение. Повтор — без дублей.
        setLoadedLine(await describeLoadedPlaylist(parsed, fileLabel));
        return;
      } catch { /* fallback to input */ }
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const { deserializePlaylist } = await import("../../lib/playlist");
        const parsed = deserializePlaylist(text);
        if (!parsed) {
          // tb_1791684645_1275_1: и в вебе пробуем форматы Беты (без fs —
          // голые имена как есть, тост о недоступности скажет сам переход).
          const converted = await importBetaBundleText(text, null);
          if (converted) {
            try {
              localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(converted));
            } catch { /* ignore */ }
            setPlaylist(converted);
            setLoadedLine(await describeLoadedPlaylist(converted, file.name));
            return;
          }
          setLoadedLine(`Could not load ${file.name}: not a playlist file (needs {entries: [...]}).`);
          return;
        }
        try {
          localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(parsed));
        } catch { /* ignore */ }
        setPlaylist(parsed);
        setLoadedLine(await describeLoadedPlaylist(parsed, file.name));
      } catch { /* ignore */ }
    };
    input.click();
  }, []);

  const entries = playlist?.entries ?? [];

  // tb_1791654032_27281_1: импорт вопрос-плейлиста сразу пишет штатные
  // маркеры (кнопки «Материализовать» больше нет). Повтор — без дублей:
  // id детерминированы (qmat_<qid>_*), существующие пропускаются.
  const describeLoadedPlaylist = useCallback(async (parsed: Playlist, fileLabel: string): Promise<string> => {
    const entryCount = parsed.entries.length;
    if (!isQuestionPlaylist(parsed)) {
      return `Loaded ${fileLabel}: ${entryCount} entries.`;
    }
    const qp = parsed as QuestionPlaylist;
    const author = agentAuthorFor(qp.source?.by);
    let stored: unknown = [];
    try {
      stored = JSON.parse(localStorage.getItem("vetka_player_lab_markers_v1") || "[]");
    } catch { stored = []; }
    const arr = Array.isArray(stored) ? stored : [];
    const existingIds = new Set(
      arr
        .filter((m): m is { marker_id: string } => !!m && typeof m === "object" && typeof (m as { marker_id?: unknown }).marker_id === "string")
        .map((m) => m.marker_id),
    );
    const now = new Date().toISOString();
    const fresh: MaterializedMarker[] = [];
    let questions = 0;
    for (const rawEntry of qp.entries) {
      const norm = normalizeQuestionEntry(rawEntry);
      if (!norm.question_id?.trim()) continue;
      questions += 1;
      const entry = rawEntry as QuestionPlaylistEntry;
      if (!entry.path) continue;
      const built = materializeQuestionEntry(norm, {
        mediaPath: (await toAssetUrl(entry.path)) ?? entry.path,
        author,
        now,
      });
      for (const m of filterNewMarkers(existingIds, built)) {
        fresh.push(m);
        existingIds.add(m.marker_id);
      }
    }
    if (fresh.length > 0) {
      try {
        localStorage.setItem("vetka_player_lab_markers_v1", JSON.stringify([...arr, ...fresh]));
      } catch { /* ignore — панель остаётся рабочей в памяти */ }
    }
    if (questions === 0) return `Loaded ${fileLabel}: no questions.`;
    return fresh.length > 0
      ? `Loaded ${fileLabel}: ${questions} questions → ${fresh.length} markers (${author}).`
      : `Loaded ${fileLabel}: ${questions} questions already in markers.`;
  }, []);

  // tb_1791683106_1275_5: новый пустой лист — Clear оставляет schema
  // вопрос-листа (трекинг отказывает дальше), тут лист правда новый.
  const handleNew = useCallback(() => {
    try {
      savePlaylist(createEmptyPlaylist());
    } catch { /* ignore */ }
    setLoadedLine(null);
    refresh();
  }, [refresh]);

  // tb_1791654032_27281_1: очистка одним действием (файл на диске цел —
  // переимпорт вернёт список).
  const handleClear = useCallback(() => {
    setPlaylist((prev) => {
      if (!prev || prev.entries.length === 0) return prev;
      const updated = { ...prev, entries: [] };
      try {
        localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
    setLoadedLine(null);
  }, []);

  return (
    <div className="playlist-panel" style={{ height: standalone ? "100vh" : "auto", display: "flex", flexDirection: "column", background: "#121416", color: "#e8eaed" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* tb_1791143015_70644_10: имя редактируется прямо в шапке, персист в LS */}
        <input
          value={playlist?.name ?? ""}
          placeholder="Playlist"
          aria-label="Playlist name"
          onChange={(e) => handleRename(e.target.value)}
          style={{ background: "transparent", border: "none", color: "inherit", fontSize: 14, fontWeight: 700, minWidth: 0, flex: 1, outline: "none", padding: 0 }}
        />
        <span style={{ fontSize: 12, opacity: 0.6, flexShrink: 0 }}>{entries.length} items</span>
        {entries.length > 0 ? (
          <button
            type="button"
            data-testid="playlist-clear"
            title="Clear playlist"
            aria-label="Clear playlist"
            onClick={handleClear}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "2px 4px", fontSize: 12, flexShrink: 0 }}
          >Clear</button>
        ) : null}
        <button
          type="button"
          data-testid="playlist-new"
          title="New empty playlist (collect your own list)"
          aria-label="New playlist"
          onClick={handleNew}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "2px 4px", fontSize: 12, flexShrink: 0 }}
        >New</button>
      </div>

      {loadedLine ? (
        <div
          data-testid="playlist-loaded-line"
          style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 12, opacity: 0.75 }}
        >
          {loadedLine}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24, fontSize: 13, opacity: 0.5, textAlign: "center" }}>
          Empty playlist.<br />Add files from the player.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {entries.map((entry, index) => (
            <div
              key={entry.path}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => onPlay(entry)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                borderTop: dragOverIndex === index ? "2px solid #4ade80" : "2px solid transparent",
                background: entry.path === currentPath ? "rgba(255,255,255,0.08)" : "transparent",
                borderLeft: entry.path === currentPath ? "2px solid rgba(255,255,255,0.45)" : "2px solid transparent",
                opacity: dragIndexRef.current === index ? 0.4 : 1,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.4, width: 20, textAlign: "right", flexShrink: 0 }}>{index + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</div>
                <div style={{ fontSize: 11, opacity: 0.4 }}>{formatDuration(entry.duration)}</div>
                {/* tb_1791521998_11250_5: вопрос агента виден в строке записи */}
                {(entry as QuestionPlaylistEntry).question ? (
                  <div
                    data-testid="playlist-entry-question"
                    style={{ fontSize: 11, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    title={(entry as QuestionPlaylistEntry).hypothesis || (entry as QuestionPlaylistEntry).question}
                  >
                    {(entry as QuestionPlaylistEntry).question}
                  </div>
                ) : null}
              </div>
              <button
                onClick={(e) => handleMoveUp(e, index)}
                disabled={index === 0}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "2px 4px", fontSize: 13, opacity: index === 0 ? 0.2 : 0.6 }}
                title="Move up"
              >▲</button>
              <button
                onClick={(e) => handleMoveDown(e, index)}
                disabled={index >= entries.length - 1}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "2px 4px", fontSize: 13, opacity: index >= entries.length - 1 ? 0.2 : 0.6 }}
                title="Move down"
              >▼</button>
              <button
                onClick={(e) => handleRemove(e, entry.path)}
                // tb_1791143015_70644_10: нейтральный, как стрелки рядом (был #f87171).
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "2px 4px", fontSize: 14, opacity: 0.6 }}
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 2, alignItems: "center" }}>
        <IconToggle
          label={mode.shuffle ? "Shuffle: on" : "Shuffle: off"}
          active={mode.shuffle}
          onClick={() => updateMode({ ...mode, shuffle: !mode.shuffle })}
          testId="playlist-shuffle"
        >
          <Shuffle size={16} />
        </IconToggle>
        <IconToggle
          label={mode.loop === "one" ? "Repeat: one" : mode.loop === "all" ? "Repeat: all" : "Repeat: off"}
          active={mode.loop !== "off"}
          onClick={() => updateMode({ ...mode, loop: nextLoopMode(mode.loop) })}
          testId="playlist-loop"
        >
          {mode.loop === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </IconToggle>
        <IconToggle
          label={inOutPlay ? "In–Out Play: on" : "In–Out Play: off"}
          active={inOutPlay}
          onClick={toggleInOutPlay}
          testId="playlist-inout-play"
        >
          <Scissors size={16} />
        </IconToggle>
        <span style={{ flex: 1 }} />
        <IconToggle label="Import playlist" active={false} onClick={handleImport} testId="playlist-import">
          <Upload size={16} />
        </IconToggle>
        <IconToggle label="Export playlist" active={false} onClick={handleExport} testId="playlist-export">
          <Download size={16} />
        </IconToggle>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function IconToggle({ label, active, onClick, testId, children }: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
      style={{
        background: "none",
        border: "none",
        borderRadius: 6,
        padding: 6,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: active ? "#e8eaed" : "rgba(255,255,255,0.45)",
        backgroundColor: active ? "rgba(255,255,255,0.10)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}
