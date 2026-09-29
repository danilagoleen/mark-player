import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommentOverlay } from "./components/chat/CommentOverlay";
import {
  confirmClearMarkers,
  createMarkerHistory,
  historyPush,
  historyRedo,
  historyUndo,
  selectMarkersToClear,
} from "./lib/markerHistory";
import { resolvePlayerHotkey } from "./lib/playerHotkeys";
import "./index.css";

const MARKERS_STORAGE_KEY = "vetka_player_lab_markers_v1";

interface BareMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec?: number;
  text?: string;
  media_path?: string;
}

// 0.10.16c: media-scope для СПИСКА, не только выбора — CommentOverlay
// получал всю кучу markers целиком и резал лишь по kind.
export function selectMediaFromSearch(search: string): string | null {
  try {
    return new URLSearchParams(search).get("media");
  } catch {
    return null;
  }
}

// Pure selector: scope to ?media= first (no media → null, never the global pile),
// then ?marker= wins when it points at a comment of that media, else last comment.
// [signal: media-scope режет чужие] [project: cut-player]
export function filterCommentMarkers(markers: BareMarker[], media: string | null): BareMarker[] {
  if (!media) return [];
  return markers.filter((m) => m.kind === "comment" && m.media_path === media);
}

export function selectCommentMarkerId(markers: BareMarker[], search: string): string | null {
  let queryId: string | null = null;
  try {
    queryId = new URLSearchParams(search).get("marker");
  } catch {
    queryId = null;
  }
  const comments = filterCommentMarkers(markers, selectMediaFromSearch(search));
  if (comments.length === 0) return null;
  if (queryId && comments.some((m) => m.marker_id === queryId)) return queryId;
  return comments[comments.length - 1].marker_id;
}

function loadAllMarkers(): BareMarker[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKERS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistMarkers(next: BareMarker[]): void {
  try {
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // panel stays usable in-memory when storage is unavailable
  }
}

function CommentsStandalone() {
  const [markers, setMarkers] = useState<BareMarker[]>(loadAllMarkers);
  // 0.20: ref-зеркало + своя история (main-окно историю комментов не видит —
  // правки идут мимо него через LS). Мутации считают "до" из ref, а не из
  // setState-апдейтера: апдейтеры в StrictMode двоятся, ref — нет.
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const historyRef = useRef(createMarkerHistory<BareMarker>());

  // Main window persists markers to the same key — refresh when it writes.
  useEffect(() => {
    const reload = () => setMarkers(loadAllMarkers());
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

  const search = typeof window !== "undefined" ? window.location.search : "";
  const media = selectMediaFromSearch(search);
  // 0.12 слайс 1: fps для HH:MM:SS:FF из ?fps= (главное окно кладёт цепочку
  // probe→rVFC); нет/мусор — честные 25 внутри CommentOverlay.
  let fps = 25;
  try {
    const raw = new URLSearchParams(search).get("fps");
    const parsed = raw === null ? NaN : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) fps = parsed;
  } catch {
    fps = 25;
  }
  // 0.10.16c: список тоже scoped — иначе панель показывает чужие видео.
  const visibleMarkers = filterCommentMarkers(markers, media);
  const selectedId = selectCommentMarkerId(markers, search);
  const selectedMarker = visibleMarkers.find((m) => m.marker_id === selectedId) ?? null;

  const handleUpdateText = useCallback((markerId: string, text: string) => {
    const prev = markersRef.current;
    historyRef.current = historyPush(historyRef.current, prev);
    const updated = prev.map((m) => (m.marker_id === markerId ? { ...m, text } : m));
    persistMarkers(updated);
    setMarkers(updated);
  }, []);

  const handleDeleteMarker = useCallback((markerId: string) => {
    const prev = markersRef.current;
    historyRef.current = historyPush(historyRef.current, prev);
    const updated = prev.filter((m) => m.marker_id !== markerId);
    persistMarkers(updated);
    setMarkers(updated);
  }, []);

  const performUndo = useCallback(() => {
    const undone = historyUndo(historyRef.current, markersRef.current);
    if (!undone) return;
    historyRef.current = undone.history;
    persistMarkers(undone.snapshot);
    setMarkers(undone.snapshot);
  }, []);

  const performRedo = useCallback(() => {
    const redone = historyRedo(historyRef.current, markersRef.current);
    if (!redone) return;
    historyRef.current = redone.history;
    persistMarkers(redone.snapshot);
    setMarkers(redone.snapshot);
  }, []);

  // 0.20: ⌘Z / ⇧⌘Z в окне комментов. Typing-guard внутри resolvePlayerHotkey:
  // в textarea остаётся нативный undo текста.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolvePlayerHotkey(event);
      if (action !== "undo" && action !== "redo") return;
      event.preventDefault();
      if (action === "undo") performUndo();
      else performRedo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [performUndo, performRedo]);

  // 0.21: Clear all чистит ВСЕ виды маркеров текущего видео (фидбэк
  // оператора: кнопка врала названием — сносила только текст). Scope тот же,
  // что у списка: только своё media. Confirm с разбивкой по видам, сама
  // очистка — в undo-стек: ⌘Z возвращает.
  const handleClearAll = useCallback(async () => {
    const prev = markersRef.current;
    const victims = selectMarkersToClear(prev, media, "all");
    if (!victims.length) return;
    if (!(await confirmClearMarkers(victims))) return;
    historyRef.current = historyPush(historyRef.current, prev);
    const victimIds = new Set(victims.map((m) => m.marker_id));
    const updated = prev.filter((m) => !victimIds.has(m.marker_id));
    persistMarkers(updated);
    setMarkers(updated);
  }, [media]);

  if (!selectedMarker) {
    return (
      <div style={{ padding: 24, color: "#888", background: "#1a1a1a", height: "100vh" }}>
        No comments yet.
      </div>
    );
  }

  return (
    <CommentOverlay
      marker={selectedMarker}
      markers={visibleMarkers}
      onClose={() => { if (typeof window !== "undefined") window.close(); }}
      onUpdateText={handleUpdateText}
      onDeleteMarker={handleDeleteMarker}
      onClearAll={visibleMarkers.length > 0 ? () => { void handleClearAll(); } : undefined}
      fps={fps}
      standalone
    />
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CommentsStandalone />
    </StrictMode>,
  );
}
