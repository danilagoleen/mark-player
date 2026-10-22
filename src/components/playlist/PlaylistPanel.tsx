import { useCallback, useEffect, useRef, useState } from "react";
import type { Playlist, PlaylistEntry, QuestionPlaylistEntry } from "../../lib/playlist";
import type { PlaybackMode } from "../../lib/playlist";
import { createEmptyPlaylist, loadPlaylist, removeEntry, moveEntry, serializePlaylist, loadPlaybackMode, savePlaybackMode, savePlaylist, nextLoopMode, renamePlaylist, sanitizePlaylistFilename } from "../../lib/playlist";
import { buildAnswersDocument, filterAnswersToPlaylist, isQuestionPlaylist, parseAnswersFile, rememberQuestionPlaylistPath, serializeAnswersDocument, type QuestionEntry } from "../../lib/questionPlaylist";
import { sanitizeAnswersFileOnDisk } from "../../lib/questionAnswersFile";
import { dirOfPath, joinForDialog } from "../../lib/exportPaths";
import {
  markerDedupKey,
  materializePlaylistQuestions,
} from "../../lib/questionMaterialize";
import { toAssetUrl } from "../../lib/nativeWindow";
import { notifyMarkersChanged } from "../../lib/markersSync";
import { notifyPlaylistReloaded } from "../../lib/playlistPlay";
import { importBetaBundleText } from "../../lib/betaBundles";
import { readInOutPlayEnabled, writeInOutPlayEnabled, INOUT_PLAY_STORAGE_KEY } from "../../lib/inOutPlayback";
import { Download, Repeat, Repeat1, Scissors, Shuffle, Upload } from "lucide-react";

interface PlaylistPanelProps {
  currentPath: string | null;
  // tb_1791876286_57716_1: индекс вместе с записью — сиблинги A/B делят
  // question_id (trk-10 — и path), first-match поднимал не ту запись.
  onPlay: (entry: PlaylistEntry, index: number) => void;
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
  // tb_1791819024_26192_2: ревизия списка — перемонтирование после Clear/
  // импорта (страховка от призраков WebView: строки + «Empty» сразу).
  const [listRev, setListRev] = useState(0);
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
    // tb_1791819024_26192_2: свои мутации шлём наружу — второй экземпляр
    // и главное окно в Tauri storage не слышат.
    notifyPlaylistReloaded();
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
    notifyPlaylistReloaded();
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
    notifyPlaylistReloaded();
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
    notifyPlaylistReloaded();
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
    notifyPlaylistReloaded();
  }, []);

  const handleExport = useCallback(async () => {
    if (!playlist) return;
    const json = serializePlaylist(playlist);
    const fileName = `${sanitizePlaylistFilename(playlist.name)}.json`;
    // tb_1791885959_77379_1: ответы оператора (вердикты/комменты) едут рядом
    // sibling .answers.json по конвенции answersPathFor — Commander видит
    // комментарии, открытие подхватит их само. Источник — файл у исходного
    // плейлиста, иначе аутбокс (веб/без пути). Нет ответов — уезжают entries.
    let answersText: string | null = null;
    let answersCount = 0;
    try {
      const qp = await import("../../lib/questionPlaylist");
      let sourceText: string | null = null;
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const fs = await import("@tauri-apps/plugin-fs");
          const srcPath = qp.readQuestionPlaylistPath();
          if (srcPath) sourceText = await fs.readTextFile(qp.answersPathFor(srcPath));
        } catch { /* файла ещё нет — дальше аутбокс */ }
      }
      const rawAnswers = qp.resolveExportAnswersText(sourceText, qp.readAnswersOutbox());
      // tb_1792634443_73606_2: экспорт не тащит чужие ответы и всегда несёт
      // прогресс question_ids/answered/pending/complete для агента.
      const questionIds = (playlist.entries as QuestionEntry[])
        .map((e) => e.question_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const doc = buildAnswersDocument(
        filterAnswersToPlaylist(parseAnswersFile(rawAnswers), questionIds),
        { playlistId: playlist.id, questionIds },
      );
      answersText = questionIds.length ? serializeAnswersDocument(doc) : rawAnswers;
      answersCount = doc.answers.length;
    } catch { /* экспорт entries всё равно уедет */ }
    const downloadBlob = (text: string, name: string) => {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const fs = await import("@tauri-apps/plugin-fs");
        const savePath = await dialog.save({
          // tb_1792634443_73606_2: рядом с плейлистом/медиа, а не в
          // «последней открытой папке».
          defaultPath: joinForDialog(
            dirOfPath((await import("../../lib/questionPlaylist")).readQuestionPlaylistPath()) ||
              dirOfPath(playlist.entries[0]?.path),
            fileName,
          ),
          filters: [{ name: "Playlist JSON", extensions: ["json"] }],
        });
        if (!savePath || typeof savePath !== "string") return;
        await fs.writeTextFile(savePath, json);
        if (answersText) {
          try {
            const qp = await import("../../lib/questionPlaylist");
            await fs.writeTextFile(qp.answersPathFor(savePath), answersText);
            setLoadedLine(`Exported ${fileName} + ${answersCount} answers.`);
          } catch {
            setLoadedLine(`Exported ${fileName} (answers failed).`);
          }
          return;
        }
        setLoadedLine(`Exported ${fileName} (no answers yet).`);
        return;
      } catch { /* fallback to blob */ }
    }
    downloadBlob(json, fileName);
    if (answersText) downloadBlob(answersText, `${fileName}.answers.json`);
  }, [playlist]);

  // tb_1792634443_73606_2: импорт вопрос-плейлиста санитайзит sibling
  // answers.json (только свои question_id, исходник — в .bak).
  const sanitizeImportedAnswers = useCallback(async (pl: Playlist, path: string) => {
    if (!isQuestionPlaylist(pl)) return;
    try {
      const questionIds = (pl.entries as QuestionEntry[])
        .map((e) => e.question_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      await sanitizeAnswersFileOnDisk(path, { playlistId: pl.id || "playlist", questionIds });
    } catch { /* плейлист всё равно открываем */ }
  }, []);

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
            rememberQuestionPlaylistPath(isQuestionPlaylist(converted) ? path : null);
            await sanitizeImportedAnswers(converted, path);
            try {
              localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(converted));
            } catch { /* ignore */ }
            setPlaylist(converted);
            setListRev((r) => r + 1);
            notifyPlaylistReloaded();
            setLoadedLine(await describeLoadedPlaylist(converted, fileLabel));
            return;
          }
          // tb_1791654032_27281_1: тихий отказ остался в прошлом — видно,
          // что файл не список (нужен {entries:[...]}), старый список цел.
          setLoadedLine(`Could not load ${fileLabel}: not a playlist file (needs {entries: [...]}).`);
          return;
        }
        // tb_1791521998_11250_5: ответы лягут рядом с этим файлом
        rememberQuestionPlaylistPath(isQuestionPlaylist(parsed) ? path : null);
        await sanitizeImportedAnswers(parsed, path);
        try {
          localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(parsed));
        } catch { /* ignore */ }
        setPlaylist(parsed);
        setListRev((r) => r + 1);
        notifyPlaylistReloaded();
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
            setListRev((r) => r + 1);
            notifyPlaylistReloaded();
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
        setListRev((r) => r + 1);
        notifyPlaylistReloaded();
        setLoadedLine(await describeLoadedPlaylist(parsed, file.name));
      } catch { /* ignore */ }
    };
    input.click();
  }, [sanitizeImportedAnswers]);

  const entries = playlist?.entries ?? [];

  // tb_1791654032_27281_1: импорт вопрос-плейлиста сразу пишет штатные
  // маркеры (кнопки «Материализовать» больше нет). Повтор — без дублей:
  // id детерминированы (qmat_<qid>_*), дедуп по паре id+медиа
  // (tb_1791861762_84020_3: тот же вопрос на другом видео — новый маркер).
  // tb_1791840835_63972_1: тело уехало в lib (materializePlaylistQuestions) —
  // один код на оба пути импорта (панель + File-меню).
  const describeLoadedPlaylist = useCallback(async (parsed: Playlist, fileLabel: string): Promise<string> => {
    return materializePlaylistQuestions(parsed, fileLabel, {
      readStoredKeys: () => {
        let stored: unknown = [];
        try {
          stored = JSON.parse(localStorage.getItem("vetka_player_lab_markers_v1") || "[]");
        } catch { stored = []; }
        const arr = Array.isArray(stored) ? stored : [];
        return new Set(
          arr
            .filter((m): m is { marker_id: string; media_path?: unknown; anchor_sec?: unknown } => !!m && typeof m === "object" && typeof (m as { marker_id?: unknown }).marker_id === "string")
            .map((m) => markerDedupKey(m.marker_id, typeof m.media_path === "string" ? m.media_path : null, typeof m.anchor_sec === "number" ? m.anchor_sec : null)),
        );
      },
      appendMarkers: (fresh) => {
        let arr: unknown[] = [];
        try {
          const stored = JSON.parse(localStorage.getItem("vetka_player_lab_markers_v1") || "[]");
          if (Array.isArray(stored)) arr = stored;
        } catch { /* ignore */ }
        try {
          localStorage.setItem("vetka_player_lab_markers_v1", JSON.stringify([...arr, ...fresh]));
        } catch { /* ignore — панель остаётся рабочей в памяти */ }
      },
      resolveMediaUrl: (path) => toAssetUrl(path),
      notifyChanged: () => notifyMarkersChanged(),
    });
  }, []);

  // tb_1791683106_1275_5: новый пустой лист — Clear оставляет schema
  // вопрос-листа (трекинг отказывает дальше), тут лист правда новый.
  const handleNew = useCallback(() => {
    try {
      savePlaylist(createEmptyPlaylist());
    } catch { /* ignore */ }
    setLoadedLine(null);
    setListRev((r) => r + 1);
    notifyPlaylistReloaded();
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
    setListRev((r) => r + 1);
    notifyPlaylistReloaded();
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
        <div key={listRev} style={{ flex: 1, overflowY: "auto" }}>
          {entries.map((entry, index) => (
            <div
              // tb_1791819024_26192_2: ключ по вопросу (у капчи 28 записей на
              // один path — дубли ключей глючили строки).
              // tb_1791876286_57716_1: qid делят сиблинги A/B (v07: один qid
              // на пару) — ключ qid+path+окно, иначе строки A/B коллизили.
              key={`${(entry as QuestionPlaylistEntry).question_id ?? ""}|${entry.path}|${(entry as QuestionPlaylistEntry).in_sec ?? ""}|${(entry as QuestionPlaylistEntry).out_sec ?? ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => onPlay(entry, index)}
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
