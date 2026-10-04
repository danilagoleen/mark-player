import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
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

const HATCH = "repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0 6px, transparent 6px 12px)";
const MONO = "'SF Mono', Menlo, ui-monospace, monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif";
// Окно нативное и непрозрачное: углы и рамку рисует система, внутри — только
// сплошной фон 0.94 (скруглённая карточка в квадратном окне выглядела нелепо).
const GLASS_BG = "rgba(30,30,30,0.94)";
const HAIRLINE = "1px solid rgba(255,255,255,0.10)";
const DELETE_ARM_MS = 3000;

const CSS = `
.cm-ghost{background:none;border:none;color:#fff;opacity:.55;cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;transition:opacity .12s}
.cm-ghost:hover,.cm-ghost:focus-visible{opacity:1;outline:none}
.cm-ghost[data-armed="true"]{opacity:1;background:${HATCH};box-shadow:inset 0 0 0 1px rgba(255,255,255,0.35)}
.cm-row[data-armed="true"]{background-image:${HATCH} !important}
.cm-list::-webkit-scrollbar{width:8px}
.cm-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border-radius:4px}
`;

const S = {
  overlay: { display: "flex", flexDirection: "column" as const, height: "100%", fontSize: 15, color: "#fff", fontFamily: SANS },
  empty: { padding: "24px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13 },
  list: { listStyle: "none" as const, margin: 0, padding: 0, overflowY: "auto" as const, flex: 1 },
  item: (active: boolean) => ({
    padding: "12px 16px",
    borderBottom: HAIRLINE,
    background: active ? "rgba(255,255,255,0.04)" : "transparent",
  }),
  time: { fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums" as const, opacity: 0.6, marginBottom: 4 },
  body: { display: "flex" as const, alignItems: "flex-start" as const, justifyContent: "space-between" as const, gap: 8 },
  textContent: { margin: 0, fontSize: 15, fontWeight: 400, lineHeight: 1.4, flex: 1, color: "#fff", wordBreak: "break-word" as const },
  icons: { display: "flex" as const, gap: 2, flexShrink: 0 },
  clearAllBtn: {
    background: "none", border: "1px solid rgba(255,255,255,0.20)", color: "rgba(255,255,255,0.7)", fontSize: 11,
    cursor: "pointer", padding: "2px 10px", borderRadius: 6, whiteSpace: "nowrap" as const,
    marginLeft: "auto" as const,
  },
  edit: { display: "flex" as const, flexDirection: "column" as const, gap: 8, flex: 1 },
  textarea: {
    background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 8, color: "#fff", fontSize: 15, padding: 8,
    resize: "vertical" as const, minHeight: 56, fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
    outline: "none",
  },
  actions: { display: "flex" as const, gap: 6 },
  btn: (primary: boolean) => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "none",
    background: primary ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)",
    color: primary ? "#fff" : "rgba(255,255,255,0.7)",
  }),
};

export function CommentOverlay({ marker, markers, onClose, onUpdateText, onDeleteMarker, onClearAll, fps = 25, standalone }: CommentOverlayProps) {
  // Баг 2026-09-27: editing был boolean + Edit только для marker из ?marker=
  // (query не обновляется когда окно уже открыто) — правился один коммент.
  // Теперь editingId на каждый айтем, Edit/Delete у всех.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Опасность без цвета: первый клик по корзине включает штриховку, второй
  // (в течение DELETE_ARM_MS) удаляет. ⌘Z в окне всё равно вернёт.
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  const handleDeleteClick = (id: string) => {
    if (armTimer.current) clearTimeout(armTimer.current);
    if (armedId === id) {
      setArmedId(null);
      if (editingId === id) setEditingId(null);
      onDeleteMarker(id);
      return;
    }
    setArmedId(id);
    armTimer.current = setTimeout(() => setArmedId(null), DELETE_ARM_MS);
  };

  const commentMarkers = useMemo(
    () => markers.filter((m) => m.kind === "comment").sort((a, b) => a.start_sec - b.start_sec),
    [markers],
  );

  const expandedContent = (
    <div style={S.overlay}>
      {!standalone && <style>{CSS}</style>}
      {commentMarkers.length === 0 ? (
        <div style={S.empty}>No comments yet. Click the comment button to add one.</div>
      ) : (
        <ul style={S.list}>
          {commentMarkers.map((cm) => (
            <li key={cm.marker_id} className="cm-row" data-armed={armedId === cm.marker_id} style={S.item(cm.marker_id === marker.marker_id)}>
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
                  <div style={S.icons}>
                    <button className="cm-ghost" type="button" aria-label="Edit comment" title="Edit" onClick={() => { setArmedId(null); setDraft(cm.text ?? ""); setEditingId(cm.marker_id); }}>
                      <Pencil size={16} />
                    </button>
                    <button className="cm-ghost" type="button" data-armed={armedId === cm.marker_id} aria-label={armedId === cm.marker_id ? "Confirm delete" : "Delete comment"} title={armedId === cm.marker_id ? "Click again to delete" : "Delete"} onClick={() => handleDeleteClick(cm.marker_id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
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
        display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box",
        background: GLASS_BG, color: "#fff", fontSize: 15, fontFamily: SANS,
        overflow: "hidden",
        backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}>
        <style>{CSS}</style>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderBottom: HAIRLINE,
          fontSize: 13, fontWeight: 600, color: "#fff",
        }}>
          Comments
          {onClearAll && commentMarkers.length > 0 && (
            <button style={S.clearAllBtn} type="button" onClick={onClearAll}>
              Clear all
            </button>
          )}
        </div>
        <div className="cm-list" style={{ flex: 1, overflow: "auto" }}>
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
