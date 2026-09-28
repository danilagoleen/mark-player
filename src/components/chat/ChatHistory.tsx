import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { MiniWindow } from "./MiniWindow";

interface ChatSummary {
  id: string;
  display_name: string;
  file_name: string;
  message_count: number;
  topic: string | null;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent: string | null;
  model: string | null;
  timestamp: string;
}

interface ChatDetail {
  messages: ChatMessage[];
  display_name: string;
}

interface ChatHistoryProps {
  open: boolean;
  onClose: () => void;
  standalone?: boolean;
}

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export function ChatHistory({ open, onClose, standalone }: ChatHistoryProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open && !standalone) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/chats?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        const list = (data.chats || []) as ChatSummary[];
        list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setChats(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const loadChat = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    try {
      const r = await fetch(`${API_BASE}/chats/${id}`);
      const data = await r.json();
      setDetail({
        messages: (data.messages || []).reverse(),
        display_name: data.display_name || "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chat");
    }
  }, []);

  if (!open && !standalone) return null;

  const compactContent = (
    <div style={{ padding: "6px 10px", fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
      <Clock size={12} />
      <span>{chats.length > 0 ? `${chats.length} conversations` : "History"}</span>
    </div>
  );

  const headerContent = (
    <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
      {selectedId && (
        <button
          type="button"
          onClick={() => { setSelectedId(null); setDetail(null); }}
          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, padding: "2px 4px", lineHeight: 1 }}
        >
          ←
        </button>
      )}
      <Clock size={12} style={{ color: "#888", flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#ccc" }}>
        {selectedId ? (detail?.display_name || "Chat") : "Chat History"}
      </span>
    </span>
  );

  const expandedContent = (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && !selectedId && (
          <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>Loading...</div>
        )}
        {error && (
          <div style={{ padding: 20, textAlign: "center", color: "#ef4444", fontSize: 12 }}>{error}</div>
        )}

        {!selectedId && !loading && chats.length === 0 && !error && (
          <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>No chat history</div>
        )}

        {!selectedId && chats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => loadChat(c.id)}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
              background: "none", border: "none", borderBottom: "1px solid rgba(34,34,34,0.8)",
              cursor: "pointer", color: "#ccc", fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.display_name && c.display_name !== "not final CUT" ? c.display_name : c.file_name !== "unknown" ? c.file_name : `Chat ${c.id.slice(0, 8)}`}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 10, color: "#666" }}>
              <span>{c.message_count} messages</span>
              <span>{formatTime(c.updated_at)}</span>
              {c.topic && <span>{c.topic}</span>}
            </div>
          </button>
        ))}

        {selectedId && detail && detail.messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(34,34,34,0.8)",
              background: msg.role === "user" ? "rgba(255,255,255,0.02)" : "transparent",
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                color: msg.role === "system" ? "#888" : "#ccc",
              }}>
                {msg.role}
              </span>
              {msg.model && <span style={{ fontSize: 9, color: "#666" }}>{msg.model.split("/").pop()}</span>}
              <span style={{ fontSize: 9, color: "#666", marginLeft: "auto" }}>{formatTime(msg.timestamp)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5, wordBreak: "break-word" }}>
              {msg.content || "(empty)"}
            </div>
          </div>
        ))}
      </div>
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
        }}>
          {headerContent}
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {expandedContent}
        </div>
      </div>
    );
  }

  return (
    <MiniWindow
      windowId="chat-history"
      title="Chat History"
      headerContent={headerContent}
      defaultExpanded
      position={{ x: 320, y: 64 }}
      expandedWidth={380}
      expandedHeight={500}
      compactContent={compactContent}
      expandedContent={expandedContent}
      onClose={onClose}
    />
  );
}
