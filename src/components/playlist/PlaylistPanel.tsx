import { useCallback, useEffect, useRef, useState } from "react";
import type { Playlist, PlaylistEntry } from "../../lib/playlist";
import type { PlaybackMode } from "../../lib/playlist";
import { loadPlaylist, removeEntry, moveEntry, serializePlaylist, loadPlaybackMode, savePlaybackMode, nextLoopMode } from "../../lib/playlist";
import { Download, Repeat, Repeat1, Shuffle, Upload } from "lucide-react";

interface PlaylistPanelProps {
  currentPath: string | null;
  onPlay: (entry: PlaylistEntry) => void;
  onClose: () => void;
  standalone?: boolean;
}

export function PlaylistPanel({ currentPath, onPlay, onClose: _onClose, standalone }: PlaylistPanelProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [mode, setMode] = useState<PlaybackMode>(() => loadPlaybackMode());
  const updateMode = useCallback((next: PlaybackMode) => {
    setMode(next);
    savePlaybackMode(next);
  }, []);

  const refresh = useCallback(() => {
    setPlaylist(loadPlaylist());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
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

  const handleExport = useCallback(async () => {
    if (!playlist) return;
    const json = serializePlaylist(playlist);
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const fs = await import("@tauri-apps/plugin-fs");
        const savePath = await dialog.save({
          defaultPath: `${playlist.name.replace(/[^a-zA-Z0-9]/g, "_")}.json`,
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
    a.download = `${playlist.name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
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
        if (!parsed) return;
        try {
          localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(parsed));
        } catch { /* ignore */ }
        setPlaylist(parsed);
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
        if (!parsed) return;
        try {
          localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(parsed));
        } catch { /* ignore */ }
        setPlaylist(parsed);
      } catch { /* ignore */ }
    };
    input.click();
  }, []);

  const entries = playlist?.entries ?? [];

  return (
    <div className="playlist-panel" style={{ height: standalone ? "100vh" : "auto", display: "flex", flexDirection: "column", background: "#121416", color: "#e8eaed" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>{playlist?.name ?? "Playlist"}</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{entries.length} items</span>
      </div>

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
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: "2px 4px", fontSize: 14, opacity: 0.6 }}
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
