import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommentOverlay } from "./components/chat/CommentOverlay";
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

function CommentsStandalone() {
  const [markers, setMarkers] = useState<BareMarker[]>(loadAllMarkers);

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
    setMarkers((prev) => {
      const updated = prev.map((m) => (m.marker_id === markerId ? { ...m, text } : m));
      try {
        localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // panel stays usable in-memory when storage is unavailable
      }
      return updated;
    });
  }, []);

  const handleDeleteMarker = useCallback((markerId: string) => {
    setMarkers((prev) => {
      const updated = prev.filter((m) => m.marker_id !== markerId);
      try {
        localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // panel stays usable in-memory when storage is unavailable
      }
      return updated;
    });
  }, []);

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
