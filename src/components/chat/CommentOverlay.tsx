import { useMemo, useState } from "react";
import { MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";
import { formatTimecode } from "../../srtUtils";
import { pairInOutRanges } from "../../lib/selectionDuration";
import { requestPlayerSeek } from "../../lib/markerSeek";
import { MiniWindow } from "./MiniWindow";

interface PlayerTimeMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  anchor_sec?: number;
  end_sec?: number;
  text?: string;
  label?: string;
  // tb_1791583578_64923_1: автор (опционален — легаси без него).
  // tb_1791654032_27281_1: статуса нет — задачи живут в таскборде.
  author?: string;
  // tb_1791585558_31907_1: ответ — ссылка на родителя (без неё — корень).
  reply_to?: string;
}

export type KindFilter = "all" | "favorite" | "negative" | "in" | "out" | "comment";

interface CommentOverlayProps {
  marker: PlayerTimeMarker | null;
  markers: PlayerTimeMarker[];
  onClose: () => void;
  onUpdateText: (markerId: string, text: string) => void;
  onDeleteMarker: (markerId: string) => void;
  // tb_1791586270_32802_2: ответ человека (опционален — без него кнопки Reply
  // нет). Родитель — корневой маркер, текст — из формы под строкой.
  onReply?: (parentId: string, text: string) => void;
  // tb_1791654032_27281_1: новый коммент (опционален — без него формы нет).
  // Окно НЕ создаёт коммент при открытии; рождается только по Save.
  onCreate?: (text: string) => void;
  // 0.20: Clear all — опциональный колбэк от standalone-окна (там confirm
  // и undo-стек). Без колбэка кнопки нет.
  onClearAll?: () => void;
  // 0.12 слайс 1: fps для HH:MM:SS:FF едет из главного окна в ?fps=
  // (та же цепочка probe→rVFC); нет параметра — честные 25.
  fps?: number;
  standalone?: boolean;
  // tb_1791690899_1275_3: стартовый kind-фильтр (?filter=comments при
  // открытии иконкой комментариев / M; лого Марка — без, all).
  // Переключатель в окне живёт дальше сам.
  initialKindFilter?: KindFilter;
}

const MONO = "'SF Mono', Menlo, ui-monospace, monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif";
// Окно нативное и непрозрачное: углы и рамку рисует система, внутри — только
// сплошной фон 0.94 (скруглённая карточка в квадратном окне выглядела нелепо).
// tb_1791654032_27281_1: тон — синеватый #121416 (как Playlist), вместо
// желтоватого rgb(30,30,30). Замер для архдоков: rgb(18,20,22).
const GLASS_BG = "rgba(18,20,22,0.94)";
const HAIRLINE = "1px solid rgba(255,255,255,0.10)";

// tb_1791146301_70644_18: глифы видов в строках (та же азбука, что транспорт).
const KIND_GLYPH: Record<string, string> = {
  favorite: "★",
  negative: "✗",
  in: "[",
  out: "]",
  comment: "💬",
};

// tb_1791654032_27281_1: kind-фильтр из упразднённого окна Markers — только
// иконки, кроме All. chat считается комментарием (тот же 💬).
const KIND_FILTERS: { id: KindFilter; glyph: string; title: string }[] = [
  { id: "all", glyph: "All", title: "All markers" },
  { id: "favorite", glyph: "★", title: "Favorites" },
  { id: "negative", glyph: "✗", title: "Negatives" },
  { id: "in", glyph: "[", title: "In points" },
  { id: "out", glyph: "]", title: "Out points" },
  { id: "comment", glyph: "💬", title: "Comments" },
];

function kindMatchesFilter(kind: string, filter: KindFilter): boolean {
  if (filter === "all") return true;
  if (filter === "comment") return kind === "comment" || kind === "chat";
  return kind === filter;
}

const CSS = `
.cm-ghost{background:none;border:none;color:#fff;opacity:.55;cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;transition:opacity .12s}
.cm-ghost:hover,.cm-ghost:focus-visible{opacity:1;outline:none}
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
  // tb_1791583578_64923_1: автор строкой под временем (пассивно, без полей).
  author: { fontSize: 12, opacity: 0.55, marginBottom: 4, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const },
  authorAi: { fontSize: 10, fontWeight: 700, opacity: 0.8, border: "1px solid rgba(255,255,255,0.25)", borderRadius: 4, padding: "0 4px", marginLeft: 6, verticalAlign: "1px" },
  // tb_1791585558_31907_1: строка ответа под родителем (плоско, без дерева).
  reply: { display: "flex" as const, alignItems: "flex-start" as const, gap: 6, marginTop: 8, paddingTop: 8, borderTop: HAIRLINE, fontSize: 13, lineHeight: 1.4 },
  replyText: { margin: 0, flex: 1, wordBreak: "break-word" as const, color: "rgba(255,255,255,0.92)" },
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

export function CommentOverlay({ marker, markers, onClose, onUpdateText, onDeleteMarker, onReply, onCreate, onClearAll, fps = 25, standalone, initialKindFilter }: CommentOverlayProps) {
  // Баг 2026-09-27: editing был boolean + Edit только для marker из ?marker=
  // (query не обновляется когда окно уже открыто) — правился один коммент.
  // Теперь editingId на каждый айтем, Edit/Delete у всех.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // tb_1791586270_32802_2: форма ответа под корневой строкой (плоско, без
  // дерева — как показ ↳). Один открытый ответ за раз.
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  // tb_1791654032_27281_1: новый коммент — полем сверху, только по Save.
  const [newDraft, setNewDraft] = useState("");
  // tb_1791662788_27409_4: удаление в один клик — двухкликовый arm
  // (первый клик штриховал, второй в течение 3с удалял) не считывался:
  // клик → полоски → таймаут → маркер на месте. Случайный клик покрывает
  // ⌘Z (undo-стек standalone-окна).
  const handleDeleteClick = (id: string) => {
    if (editingId === id) setEditingId(null);
    onDeleteMarker(id);
  };
  // tb_1791654032_27281_1: kind-фильтр вместо статусов (дефолт all;
  // tb_1791690899_1275_3: старт — initialKindFilter из ?filter=).
  const [kindFilter, setKindFilter] = useState<KindFilter>(initialKindFilter ?? "all");

  // tb_1791146301_70644_18: окно показывает ВСЕ виды (сортировка по времени),
  // правка текстов — только у comment (не ломаем Edit/Delete текстовых).
  // Клик по строке — прыжок плейхеда (мост markerSeek, как в окне маркеров).
  // У спаренных in/out — хрон сегмента.
  const allRows = useMemo(
    () => [...markers]
      .sort((a, b) => Number(a.start_sec || 0) - Number(b.start_sec || 0))
      .filter((m) => kindMatchesFilter(m.kind, kindFilter)),
    [markers, kindFilter],
  );

  const spanById = useMemo(() => {
    const inOut = allRows
      .filter((m) => m.kind === "in" || m.kind === "out")
      .map((m) => ({
        marker_id: m.marker_id,
        kind: m.kind,
        anchor_sec: Number(m.anchor_sec ?? m.start_sec ?? 0),
      }));
    return pairInOutRanges(inOut).spanById;
  }, [allRows]);

  const jumpTo = (m: PlayerTimeMarker) => {
    requestPlayerSeek(Number(m.anchor_sec ?? m.start_sec ?? 0));
  };

  // tb_1791585558_31907_1: плоская группировка ответов под родителем
  // («↳ автор: текст», без дерева — дерево в CUT Player). Сирота (родителя
  // нет в списке — отфильтрован или чужой) — обычной строкой.
  const roots = useMemo(() => {
    const ids = new Set(allRows.map((r) => r.marker_id));
    return allRows.filter((r) => !r.reply_to || !ids.has(r.reply_to));
  }, [allRows]);
  const repliesByParent = useMemo(() => {
    const ids = new Set(allRows.map((r) => r.marker_id));
    const map = new Map<string, PlayerTimeMarker[]>();
    for (const r of allRows) {
      if (r.reply_to && ids.has(r.reply_to)) {
        const list = map.get(r.reply_to) ?? [];
        list.push(r);
        map.set(r.reply_to, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => Number(a.start_sec || 0) - Number(b.start_sec || 0));
    return map;
  }, [allRows]);

  const expandedContent = (
    <div style={S.overlay}>
      {!standalone && <style>{CSS}</style>}
      {onCreate ? (
        <div style={{ padding: "10px 16px", borderBottom: HAIRLINE }} data-testid="comment-new-form" onClick={(e) => e.stopPropagation()}>
          <textarea
            style={{ ...S.textarea, minHeight: 40 }}
            data-testid="comment-new-input"
            aria-label="New comment"
            placeholder="Add a comment…"
            value={newDraft}
            onChange={(e) => setNewDraft(e.target.value)}
            rows={2}
          />
          <div style={{ ...S.actions, marginTop: 6 }}>
            <button
              style={S.btn(true)}
              type="button"
              data-testid="comment-new-save"
              disabled={newDraft.trim() === ""}
              onClick={() => { onCreate(newDraft.trim()); setNewDraft(""); }}
            >Save</button>
          </div>
        </div>
      ) : null}
      {allRows.length === 0 ? (
        <div style={S.empty}>No markers yet.</div>
      ) : (
        <ul style={S.list}>
          {roots.map((row) => {
            const isComment = row.kind === "comment";
            const span = spanById.get(row.marker_id);
            const glyph = KIND_GLYPH[row.kind] ?? "•";
            const rowText = (row.text ?? "").trim() || (row.label ?? "").trim() || row.kind;
            // tb_1791583578_64923_1: автор строкой (agent:<роль> — с бейджем ИИ).
            const author = (row.author ?? "").trim();
            const isAgent = author.startsWith("agent:") && author.length > 6;
            return (
            <li
              key={row.marker_id}
              className="cm-row"
              data-testid="comment-row"
              data-kind={row.kind}
              style={{ ...S.item(marker !== null && row.marker_id === marker.marker_id) }}
              onClick={() => { if (editingId !== row.marker_id) jumpTo(row); }}
              title={`Jump to ${formatTimecode(Number(row.anchor_sec ?? row.start_sec ?? 0), fps)}`}
            >
              <div style={S.time}>
                {glyph} {formatTimecode(row.start_sec, fps)}
                {span !== undefined ? ` · sel ${formatTimecode(span, fps)}` : ""}
              </div>
              {author ? (
                <div style={S.author} data-testid="comment-author">
                  {author}
                  {isAgent ? <span style={S.authorAi}>AI</span> : null}
                </div>
              ) : null}
              {editingId === row.marker_id && isComment ? (
                <div style={S.edit} onClick={(e) => e.stopPropagation()}>
                  <textarea
                    style={S.textarea}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div style={S.actions}>
                    <button style={S.btn(true)} type="button" onClick={() => { onUpdateText(row.marker_id, draft); setEditingId(null); }}>Save</button>
                    <button style={S.btn(false)} type="button" onClick={() => { setDraft(""); setEditingId(null); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={S.body}>
                  <p style={S.textContent}>{rowText || "No comment text."}</p>
                  <div style={S.icons} onClick={(e) => e.stopPropagation()}>
                    {onReply ? (
                    <button className="cm-ghost" type="button" data-testid="comment-reply-btn" aria-label="Reply to comment" title="Reply" onClick={() => { setEditingId(null); setReplyToId(row.marker_id); setReplyDraft(""); }}>
                      <Reply size={16} />
                    </button>
                    ) : null}
                    {isComment ? (
                    <button className="cm-ghost" type="button" aria-label="Edit comment" title="Edit" onClick={() => { setDraft(row.text ?? ""); setEditingId(row.marker_id); }}>
                      <Pencil size={16} />
                    </button>
                    ) : null}
                    <button className="cm-ghost" type="button" aria-label={isComment ? "Delete comment" : "Delete marker"} title="Delete" onClick={() => handleDeleteClick(row.marker_id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  </div>
              )}
              {onReply && replyToId === row.marker_id ? (
                <div style={S.edit} data-testid="comment-reply-form" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    style={S.textarea}
                    data-testid="comment-reply-input"
                    aria-label="Reply text"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div style={S.actions}>
                    <button
                      style={S.btn(true)}
                      type="button"
                      data-testid="comment-reply-send"
                      disabled={replyDraft.trim() === ""}
                      onClick={() => { onReply(row.marker_id, replyDraft.trim()); setReplyToId(null); setReplyDraft(""); }}
                    >Send</button>
                    <button style={S.btn(false)} type="button" onClick={() => { setReplyToId(null); setReplyDraft(""); }}>Cancel</button>
                  </div>
                </div>
              ) : null}
              {(repliesByParent.get(row.marker_id) ?? []).map((rep) => {
                const repAuthor = (rep.author ?? "").trim();
                const repText = (rep.text ?? "").trim() || (rep.label ?? "").trim() || "reply";
                return (
                  <div
                    key={rep.marker_id}
                    style={S.reply}
                    data-testid="comment-reply"
                    onClick={(e) => { e.stopPropagation(); jumpTo(rep); }}
                    title={`Jump to ${formatTimecode(Number(rep.anchor_sec ?? rep.start_sec ?? 0), fps)}`}
                  >
                    <p style={S.replyText}>
                      ↳ {repAuthor ? `${repAuthor}: ` : ""}{repText}
                      {repAuthor.startsWith("agent:") && repAuthor.length > 6 ? <span style={S.authorAi}>AI</span> : null}
                    </p>
                  </div>
                );
              })}
            </li>
            );
          })}
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
          Markers
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              style={{
                ...S.clearAllBtn,
                marginLeft: 0,
                border: kindFilter === f.id
                  ? "1px solid rgba(255,255,255,0.55)"
                  : "1px solid rgba(255,255,255,0.20)",
                ...(kindFilter === f.id ? { color: "#fff" } : null),
              }}
              type="button"
              data-testid={`comment-filter-${f.id}`}
              aria-pressed={kindFilter === f.id}
              title={f.title}
              onClick={() => setKindFilter(f.id)}
            >
              {f.glyph}
            </button>
          ))}
          {onClearAll && allRows.length > 0 && (
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
      title="Markers"
      icon={<MessageSquare size={14} />}
      position={{ x: 370, y: 340 }}
      expandedWidth={320}
      expandedHeight={400}
      defaultExpanded
        compactContent={
          <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af" }}>
            <MessageSquare size={12} />
            <span>{allRows.length > 0 ? `${allRows.length} markers` : "Markers"}</span>
          </div>
        }
      expandedContent={expandedContent}
      onClose={onClose}
    />
  );
}
