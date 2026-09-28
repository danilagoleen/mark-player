import type { FoveaContext, VisionAnalysis } from "./fovea";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timecode?: string;
  vision?: VisionAnalysis | null;
  created_at: string;
}

let msgCounter = 0;

function genId(): string {
  msgCounter++;
  return `chat_${Date.now().toString(36)}_${msgCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

export async function sendChatMessage(
  text: string,
  fovea?: FoveaContext | null,
  vision?: VisionAnalysis | null,
  model?: string | null,
  modelSource?: string | null,
): Promise<ChatMessage> {
  try {
    const body: Record<string, unknown> = {
      text,
      fovea: fovea
        ? {
            timecode: fovea.timecode,
            frame_b64: fovea.frame_b64,
            width: fovea.width,
            height: fovea.height,
            duration: fovea.duration,
          }
        : null,
      vision: vision || null,
    };
    if (model) body.model = model;
    if (modelSource) body.model_source = modelSource;

    const response = await fetch(`${API_BASE}/cut/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const errMsg = body?.error?.message || `API error: HTTP ${response.status}`;
      return {
        id: genId(),
        role: "system",
        text: errMsg,
        created_at: new Date().toISOString(),
      };
    }

    const data = await response.json();
    return {
      id: data.id || genId(),
      role: "assistant",
      text: data.reply || data.text || "",
      timecode: fovea?.timecode,
      vision: data.vision || vision || null,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: genId(),
      role: "system",
      text: err instanceof Error ? err.message : "Unknown error",
      created_at: new Date().toISOString(),
    };
  }
}
