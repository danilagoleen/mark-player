import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface MiniWindowHandle {
  toggleCompact: () => void;
}

interface Props {
  windowId: string;
  title: string;
  icon?: React.ReactNode;
  noHeader?: boolean;
  headerContent?: React.ReactNode;
  position?: { x: number; y: number };
  compactWidth?: number;
  compactHeight?: number;
  expandedWidth?: number;
  expandedHeight?: number;
  compactContent: React.ReactNode;
  expandedContent: React.ReactNode;
  defaultExpanded?: boolean;
  onClose?: () => void;
}

const STORAGE_PREFIX = "vetka_mini_window_";

function loadState(windowId: string) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${windowId}`);
    if (!raw) return null;
    return JSON.parse(raw) as { x: number; y: number; expanded: boolean; width?: number; height?: number };
  } catch { return null; }
}

function saveState(windowId: string, state: { x: number; y: number; expanded: boolean }) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${windowId}`, JSON.stringify(state)); } catch { }
}

function clampPos(x: number, y: number, w: number, h: number) {
  const maxX = Math.max(0, window.innerWidth - 60);
  const maxY = Math.max(0, window.innerHeight - 40);
  return { x: Math.max(-w + 40, Math.min(maxX, x)), y: Math.max(-h + 40, Math.min(maxY, y)) };
}

export const MiniWindow = forwardRef<MiniWindowHandle, Props>(function MiniWindow({
  windowId,
  title,
  icon,
  noHeader = false,
  headerContent,
  position = { x: 24, y: 64 },
  compactWidth = 260,
  compactHeight = 140,
  expandedWidth = 340,
  expandedHeight = 420,
  compactContent,
  expandedContent,
  defaultExpanded = false,
  onClose,
}: Props, ref) {
  const saved = loadState(windowId);
  const initialExpanded = saved?.expanded ?? defaultExpanded;
  const initialW = saved?.width || (initialExpanded ? expandedWidth : compactWidth);
  const initialH = saved?.height || (initialExpanded ? expandedHeight : compactHeight);
  const clamped = clampPos(saved?.x ?? position.x, saved?.y ?? position.y, initialW, initialH);

  const [pos, setPos] = useState({ x: clamped.x, y: clamped.y });
  const [size, setSize] = useState({ width: initialW, height: initialH });
  const [expanded, setExpanded] = useState(initialExpanded);
  const dragRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);
  const resizeRef = useRef<{ edge: string; startX: number; startY: number; w: number; h: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({ toggleCompact: () => setExpanded((v) => !v) }), []);

  useEffect(() => {
    saveState(windowId, { x: pos.x, y: pos.y, expanded });
  }, [windowId, pos, expanded]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".mini-window-close") || (e.target as HTMLElement).closest(".mini-window-toggle")) return;
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const cw = panelRef.current?.offsetWidth || currentWidth;
      const ch = panelRef.current?.offsetHeight || currentHeight;
      const p = clampPos(
        dragRef.current.left + ev.clientX - dragRef.current.startX,
        dragRef.current.top + ev.clientY - dragRef.current.startY,
        cw, ch,
      );
      setPos(p);
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const currentWidth = expanded ? Math.max(size.width, expandedWidth) : compactWidth;
  const currentHeight = expanded ? Math.max(size.height, expandedHeight) : compactHeight;

  const handleResizeStart = useCallback((e: React.MouseEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    const cw = expanded ? Math.max(size.width, expandedWidth) : compactWidth;
    const ch = expanded ? Math.max(size.height, expandedHeight) : compactHeight;
    resizeRef.current = { edge, startX: e.clientX, startY: e.clientY, w: cw, h: ch };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      let newW = resizeRef.current.w;
      let newH = resizeRef.current.h;
      if (resizeRef.current.edge.includes("e")) newW = Math.max(200, resizeRef.current.w + dx);
      if (resizeRef.current.edge.includes("s")) newH = Math.max(120, resizeRef.current.h + dy);
      setSize({ width: newW, height: newH });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [expanded, size, expandedWidth, compactWidth, expandedHeight, compactHeight]);

  return (
    <div className="mini-window-root" style={{ left: pos.x, top: pos.y }}>
      <div
        ref={panelRef}
        className="mini-window-panel"
        style={{ width: currentWidth, height: currentHeight }}
        onMouseDown={noHeader ? (e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button") || t.closest("input") || t.closest("textarea") || t.closest("select")) return;
          handleDragStart(e);
        } : undefined}
      >
        {headerContent ? (
          <div className="mini-window-header" onMouseDown={handleDragStart}>
            {headerContent}
            <button className="mini-window-toggle" type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? "\u2212" : "\u25a1"}
            </button>
            {onClose && (
              <button className="mini-window-close" type="button" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
        ) : noHeader ? (
          <div className="mini-window-header" onMouseDown={handleDragStart}
            style={{ minHeight: 36, borderBottom: '1px solid rgba(34,34,34,0.8)' }}>
            <span style={{ flex: 1, fontSize: 13, color: '#ccc' }}>{icon && <span className="mini-window-icon">{icon}</span>}{title}</span>
            <button className="mini-window-toggle" type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? "\u2212" : "\u25a1"}
            </button>
            {onClose && (
              <button className="mini-window-close" type="button" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
        ) : (
          <div className="mini-window-header" onMouseDown={handleDragStart}>
            {icon && <span className="mini-window-icon">{icon}</span>}
            <strong className="mini-window-title">{title}</strong>
            <button className="mini-window-toggle" type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? "\u2212" : "\u25a1"}
            </button>
            {onClose && (
              <button className="mini-window-close" type="button" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
        )}
        <div className="mini-window-body" style={{
          height: expanded ? "calc(100% - 60px)" : "calc(100% - 36px)",
        }}>
          {expanded ? expandedContent : compactContent}
        </div>
        {expanded && (
          <div className="mini-window-footer" onMouseDown={handleDragStart}>
            <span className="mini-window-footer-grip" />
          </div>
        )}
        <div className="mini-window-resize-se" onMouseDown={(e) => handleResizeStart(e, "se")}>
          <div className="mini-window-resize-grip" />
        </div>
        <div className="mini-window-resize-s" onMouseDown={(e) => handleResizeStart(e, "s")} />
        <div className="mini-window-resize-e" onMouseDown={(e) => handleResizeStart(e, "e")} />
      </div>
    </div>
  );
});
