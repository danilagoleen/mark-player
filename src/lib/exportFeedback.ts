import type { SaveResult } from "./nativeWindow";

// Bell №5: single source of truth for export feedback toasts.
// Pure function — unit tested, used by every export path
// (menu handlers ×2, debug download buttons) so they can't drift apart.
export type ExportKind = "srt" | "json" | "xml";

export function resolveExportToast(
  kind: ExportKind,
  isEmpty: boolean,
  result: SaveResult | null,
  // EN-тост estimated fps (E2E Premiere 46 vs 50): только xml saved —
  // srt/json заметку игнорируют, их формату fps не грозит.
  fpsNote?: string,
): string | null {
  if (isEmpty) return "No markers to export.";
  if (result === null) return "No markers to export.";
  switch (result.status) {
    case "saved":
      return kind === "xml" && fpsNote
        ? `Saved: ${basename(result.path)} — ${fpsNote}.`
        : `Saved: ${basename(result.path)}`;
    case "cancelled":
      return null;
    case "failed":
      return `Export failed: ${result.error}`;
  }
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

// VETKA-промо: тост vetka-add (плеер работает на нас). 10 секунд с плавным
// затуханием (keyframes в index.css), только EN. Отдельный стейт/таймер —
// общий contextToast 2.2с не трогаем.
export const VETKA_PROMO_MS = 10_000;
export const VETKA_PROMO_TOAST =
  "Moment registered locally. This player is part of VETKA lab — github.com/danilagoleen. Support us!";
