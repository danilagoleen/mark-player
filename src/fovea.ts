export interface FoveaContext {
  timecode: string;
  frame_b64: string | null;
  width: number;
  height: number;
  duration: number;
}

export interface VisionAnalysis {
  shot_scale: string | null;
  angle: string | null;
  dominant_colors: string[];
  light_profile: string | null;
  sharpness_score: number | null;
  scene_class: string | null;
  faces: number;
  objects: string[];
}

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

export async function analyzeFrame(
  frameB64: string,
): Promise<VisionAnalysis | null> {
  try {
    const res = await fetch(`${API_BASE}/cut/analyze-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_b64: frameB64 }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function formatTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function captureFrame(
  video: HTMLVideoElement,
  quality = 0.7,
): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function buildFoveaContext(video: HTMLVideoElement): FoveaContext {
  const frame_b64 = captureFrame(video);
  return {
    timecode: formatTimecode(video.currentTime || 0),
    frame_b64,
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
    duration: video.duration || 0,
  };
}
