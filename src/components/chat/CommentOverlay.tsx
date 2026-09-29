import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { formatTimecode } from "../../srtUtils";
import { MiniWindow } from "./MiniWindow";

interface PlayerTimeMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec?: number;
  text?: string;
}

interface CommentOverlayProps {
  marker: PlayerTimeMarker;
  markers: PlayerTimeMarker[];
  onClose: () => void;
  onUpdateText: (markerId: string, text: string) => void;
  onDeleteMarker: (markerId: string) => void;
  // 0.20: Clear all — опциональный колбэк от standalone-окна (там confirm
  // и undo-стек). Без колбэка кнопки нет.
  onClearAll?: () => void;
  // 0.12 слайс 1: fps для HH:MM:SS:FF едет из главного окна в ?fps=
  // (та же цепочка probe→rVFC); нет параметра — честные 25.
  fps?: number;
  standalone?: boolean;
}

const S = {
  overlay: { display: "flex", flexDirection: "column" as const, height: "100%", fontSize: 13, color: "#ccc" },
  empty: { padding: "24px 16px", color: "#888", fontSize: 13 },
  list: { listStyle: "none" as const, margin: 0, padding: 0, overflowY: "auto" as const, flex: 1 },
  item: (active: boolean) => ({
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    background: active ? "rgba(255,255,255,0.04)" : "transparent",
  }),
  time: { fontSize: 13, fontVariantNumeric: "tabular-nums" as const, color: "#9ca3af", marginBottom: 4 },
  body: { display: "flex" as const, alignItems: "flex-start" as const, justifyContent: "space-between" as const, gap: 8 },
  textContent: { margin: 0, lineHeight: 1.4, flex: 1 },
  editBtn: {
    background: "none", border: "none", color: "#888", fontSize: 11,
    cursor: "pointer", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" as const,
  },
  deleteBtn: {
    background: "none", border: "none", color: "#f87171", fontSize: 11,
    cursor: "pointer", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" as const,
  },
  clearAllBtn: {
    background: "none", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", fontSize: 11,
    cursor: "pointer", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" as const,
    marginLeft: "auto" as const,
  },
  edit: { display: "flex" as const, flexDirection: "column" as const, gap: 8, flex: 1 },
  textarea: {
    background: "rgba(0,0,0,0.4)", border: "1px solid #333",
    borderRadius: 8, color: "#ccc", fontSize: 13, padding: 8,
    resize: "vertical" as const, minHeight: 56, fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
    outline: "none",
  },
  actions: { display: "flex" as const, gap: 6 },
  btn: (primary: boolean) => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "none",
    background: primary ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
    color: primary ? "#ccc" : "#888",
  }),
};

export function CommentOverlay({ marker, markers, onClose, onUpdateText, onDeleteMarker, onClearAll, fps = 25, standalone }: CommentOverlayProps) {
  // Баг 2026-09-27: editing был boolean + Edit только для marker из ?marker=
  // (query не обновляется когда окно уже открыто) — правился один коммент.
  // Теперь editingId на каждый айтем, Edit/Delete у всех.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commentMarkers = useMemo(
    () => markers.filter((m) => m.kind === "comment").sort((a, b) => a.start_sec - b.start_sec),
    [markers],
  );

  const expandedContent = (
    <div style={S.overlay}>
      {commentMarkers.length === 0 ? (
        <div style={S.empty}>No comments yet. Click the comment button to add one.</div>
      ) : (
        <ul style={S.list}>
          {commentMarkers.map((cm) => (
            <li key={cm.marker_id} style={S.item(cm.marker_id === marker.marker_id)}>
              <div style={S.time}>{formatTimecode(cm.start_sec, fps)}</div>
              {editingId === cm.marker_id ? (
                <div style={S.edit}>
                  <textarea
                    style={S.textarea}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div style={S.actions}>
                    <button style={S.btn(true)} type="button" onClick={() => { onUpdateText(cm.marker_id, draft); setEditingId(null); }}>Save</button>
                    <button style={S.btn(false)} type="button" onClick={() => { setDraft(""); setEditingId(null); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={S.body}>
                  <p style={S.textContent}>{cm.text || "No comment text."}</p>
                  <button style={S.editBtn} type="button" onClick={() => { setDraft(cm.text ?? ""); setEditingId(cm.marker_id); }}>Edit</button>
                  <button style={S.deleteBtn} type="button" onClick={() => { if (editingId === cm.marker_id) setEditingId(null); onDeleteMarker(cm.marker_id); }}>Delete</button>
                  </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100vh",
        background: "#1a1a1a", color: "#ccc", fontSize: 13,
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          fontSize: 12, fontWeight: 600, color: "#e4e6eb",
        }}>
          Comments
          {onClearAll && commentMarkers.length > 0 && (
            <button style={S.clearAllBtn} type="button" onClick={onClearAll}>
              Clear all
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {expandedContent}
        </div>
      </div>
    );
  }

  return (
    <MiniWindow
      windowId="comments"
      title="Comments"
      icon={<MessageSquare size={14} />}
      position={{ x: 370, y: 340 }}
      expandedWidth={320}
      expandedHeight={400}
      defaultExpanded
      compactContent={
        <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af" }}>
          <MessageSquare size={12} />
          <span>{commentMarkers.length > 0 ? `${commentMarkers.length} comments` : "Comments"}</span>
        </div>
      }
      expandedContent={expandedContent}
      onClose={onClose}
    />
  );
}
