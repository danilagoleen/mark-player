import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PlaylistPanel } from "./components/playlist/PlaylistPanel";
import { addEntry, createEmptyPlaylist, loadPlaylist, savePlaylist } from "./lib/playlist";
import { useDragDrop } from "./lib/useDragDrop";
import "./index.css";

const root = document.getElementById("root");

function readQueryPath(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("path");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function requestPlay(path: string) {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit("playlist:play", { path }).catch(() => {});
    }).catch(() => {});
  }
}

function PlaylistStandalone() {
  const [currentPath, setCurrentPath] = useState<string | null>(readQueryPath);

  // File drop from Finder straight into the playlist window
  // [signal: дроп файлов добавляет entries] [project: cut-player].
  const handleDropPaths = useCallback((paths: string[]) => {
    const base = loadPlaylist() || createEmptyPlaylist();
    let updated = base;
    for (const p of paths) {
      const name = p.split(/[\\/]/).pop() || p;
      if (!updated.entries.some((e) => e.path === p)) {
        updated = addEntry(updated, { path: p, name, duration: 0 });
      }
    }
    if (updated !== base) {
      savePlaylist(updated);
      // Same-window localStorage write doesn't fire 'storage' — nudge the panel.
      window.dispatchEvent(new Event("storage"));
    }
  }, []);
  useDragDrop({ onDrop: handleDropPaths });

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ path: string }>("playlist:current", (event) => {
        if (event.payload?.path) setCurrentPath(event.payload.path);
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  return (
    <PlaylistPanel
      currentPath={currentPath}
      onPlay={(entry) => requestPlay(entry.path)}
      onClose={() => { if (typeof window !== "undefined") window.close(); }}
      standalone
    />
  );
}

if (root) {
  createRoot(root).render(
    <StrictMode>
      <PlaylistStandalone />
    </StrictMode>,
  );
}