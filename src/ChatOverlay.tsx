import { useCallback, useEffect, useState } from "react";
import { Clock, Phone } from "lucide-react";
import type { FoveaContext, VisionAnalysis } from "./fovea";
import { analyzeFrame } from "./fovea";
import { sendChatMessage } from "./chatApi";
import type { ChatMessage } from "./types/chat";
import { MiniWindow } from "./components/chat/MiniWindow";
import { MessageList } from "./components/chat/MessageList";
import { MessageInput } from "./components/chat/MessageInput";

interface Props {
  foveaContext: FoveaContext | null;
  open: boolean;
  onClose: () => void;
  mentionToInsert: string | null;
  onMentionConsumed: () => void;
  onOpenPhonebook: () => void;
  onOpenChatHistory?: () => void;
  selectedModel?: { id: string; name: string; source?: string } | null;
  onClearModel?: () => void;
  standalone?: boolean;
}

const VISION_FIELDS: { key: keyof VisionAnalysis; label: string }[] = [
  { key: "shot_scale", label: "Shot" },
  { key: "angle", label: "Angle" },
  { key: "light_profile", label: "Light" },
  { key: "scene_class", label: "Scene" },
];

interface ReplyTarget {
  id: string;
  model: string;
  text: string;
}

function toChatMessage(msg: { id: string; role: "user" | "assistant" | "system"; text: string; timecode?: string; created_at: string }): ChatMessage {
  return {
    id: msg.id,
    role: msg.role === "system" ? "system" : msg.role,
    content: msg.text,
    type: "text" as const,
    timestamp: msg.created_at,
    timecode: msg.timecode,
  };
}

const btnStyle = {
  background: "none", border: "none", color: "#9ca3af",
  cursor: "pointer", padding: "3px 6px", borderRadius: 4,
  display: "flex", alignItems: "center", gap: 3,
  fontSize: 11,
};

export function ChatOverlay({
  foveaContext,
  open,
  onClose,
  mentionToInsert,
  onMentionConsumed,
  onOpenPhonebook,
  onOpenChatHistory,
  selectedModel,
  onClearModel,
  standalone,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [vision, setVision] = useState<VisionAnalysis | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  useEffect(() => {
    if (mentionToInsert) {
      setInput((prev) => prev + mentionToInsert + " ");
      onMentionConsumed();
    }
  }, [mentionToInsert, onMentionConsumed]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    setIsLoading(true);

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      type: "text",
      timestamp: new Date().toISOString(),
      metadata: replyTo ? {
        in_reply_to: replyTo.id,
        reply_to_preview: {
          id: replyTo.id,
          role: "assistant",
          model: replyTo.model,
          text_preview: replyTo.text.slice(0, 100),
          timestamp: new Date().toISOString(),
        },
      } : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setReplyTo(null);

    try {
      const modelId = replyTo?.model ?? selectedModel?.id ?? null;
      const modelSource = replyTo?.model ? null : (selectedModel?.source ?? null);
      const reply = await sendChatMessage(text, foveaContext, vision, modelId, modelSource);
      setMessages((prev) => [...prev, toChatMessage(reply)]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `err_${Date.now()}`,
        role: "system",
        content: err instanceof Error ? err.message : "Error sending message",
        type: "text",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, foveaContext, vision, replyTo]);

  const handleVisionCapture = useCallback(async () => {
    if (!foveaContext?.frame_b64) return;
    try {
      const result = await analyzeFrame(foveaContext.frame_b64);
      setVision(result);
    } catch {
      setVision(null);
    }
  }, [foveaContext]);

  const handleReply = useCallback((target: ReplyTarget) => {
    setReplyTo(target);
  }, []);

  const headerContent = (
    <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
      <strong style={{ fontSize: 12, color: "#e4e6eb" }}>Chat</strong>
      <div style={{ flex: 1 }} />
      {onOpenChatHistory && (
        <button type="button" onClick={onOpenChatHistory} style={btnStyle} title="Chat history" aria-label="Chat history">
          <Clock size={14} />
        </button>
      )}
      <button type="button" onClick={onOpenPhonebook} style={btnStyle} title="Model Directory" aria-label="Model Directory">
        <Phone size={14} />
      </button>
    </span>
  );

  const compactContent = (
    <div style={{ padding: "6px 10px", fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
      <span>{messages.length > 0 ? `${messages.length} messages` : "Chat"}</span>
      {isLoading && <span style={{ color: "#888", fontSize: 10 }}>...</span>}
    </div>
  );

  const expandedContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>


      {vision && (
        <div style={{
          display: "flex", gap: 6, padding: "4px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexWrap: "wrap", flexShrink: 0,
          fontSize: 10, color: "#9ca3af",
        }}>
          {VISION_FIELDS.filter((f) => vision[f.key]).map((f) => (
            <span key={f.key}>
              <strong>{f.label}:</strong> {vision[f.key]}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setVision(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: "auto" }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        <MessageList
          messages={messages}
          isTyping={isLoading}
          onReply={handleReply}
        />
      </div>

      {replyTo && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 8px", fontSize: 11, color: "#9ca3af",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          flexShrink: 0,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            Reply to <strong>{replyTo.model.split("/").pop()}</strong>: {replyTo.text.slice(0, 60)}
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, padding: "2px 4px" }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ flexShrink: 0 }}>
        {foveaContext && (
          <button
            type="button"
            onClick={handleVisionCapture}
            style={{
              width: "100%",
              background: vision ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              border: "none", borderTop: "1px solid rgba(255,255,255,0.08)",
              color: "#9ca3af", cursor: "pointer", fontSize: 11,
              padding: "4px 8px", textAlign: "center",
            }}
            title="Analyze current frame"
          >
            {vision ? "Vision ✓" : "Vision"}
          </button>
          )}
          {selectedModel && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", fontSize: 11, color: "#58beff",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(88,190,255,0.06)",
              flexShrink: 0,
            }}>
              ▶ {selectedModel.name}
              {onClearModel && (
                <button
                  type="button"
                  onClick={onClearModel}
                  style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: "0 2px", lineHeight: 1, marginLeft: "auto" }}
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <MessageInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          isLoading={isLoading}
          replyTo={replyTo?.model}
          replyToModel={replyTo?.model}
          hideHelp
        />
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
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {expandedContent}
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <MiniWindow
      windowId="chat-overlay"
      title="Chat"
      headerContent={headerContent}
      defaultExpanded
      position={{ x: 270, y: 64 }}
      expandedWidth={380}
      expandedHeight={460}
      compactContent={compactContent}
      expandedContent={expandedContent}
      onClose={onClose}
    />
  );
}
