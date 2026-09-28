export const LAB_FOOTER_HEIGHT = 56;
export const LAB_MIN_VIEWPORT_HEIGHT = 180;
// 0.10.21: CSS-shell никогда не уже нативного минимума (tauri.conf:
// minWidth 720 / minHeight 560). Раньше портрет 9:16 получал shell 360px,
// а окно Tauri приглаживалось к 720 — тулбар жил в 360px и умирал.
export const LAB_MIN_SHELL_WIDTH = 720;
export const LAB_MIN_SHELL_HEIGHT = 560;
// 0.10.21: дефолтная высота ландшафта — HD-флор (решение пользователя:
// «минимум HD у всех»).
export const LAB_DEFAULT_LANDSCAPE_HEIGHT = 720;

export type ShellVariant = "fixed-footer" | "flex-footer";

export interface GeometrySnapshot {
  ok: boolean;
  reason?: string;
  fileName: string;
  devicePixelRatio: number;
  nativeScaleFactor: number | null;
  windowInnerWidth: number;
  windowInnerHeight: number;
  nativeInnerLogicalWidth: number | null;
  nativeInnerLogicalHeight: number | null;
  nativeOuterLogicalWidth: number | null;
  nativeOuterLogicalHeight: number | null;
  nativeInnerPhysicalWidth: number | null;
  nativeInnerPhysicalHeight: number | null;
  nativeOuterPhysicalWidth: number | null;
  nativeOuterPhysicalHeight: number | null;
  topbarHeight: number;
  shellWidth: number;
  shellHeight: number;
  viewerWidth: number;
  viewerHeight: number;
  footerHeight: number;
  videoIntrinsicWidth: number;
  videoIntrinsicHeight: number;
  displayedWidth: number;
  displayedHeight: number;
  horizontalLetterboxPx: number;
  verticalLetterboxPx: number;
  naturalAspectRatio: number;
  viewerAspectRatio: number;
  aspectError: number;
  suggestedShellWidth: number;
  suggestedShellHeight: number;
  variant: ShellVariant;
  sourceKind: "video" | "image" | "synthetic";
  dreamScore: number;
  viewerDominanceRatio: number;
  chromeRatio: number;
  previewQualityLabel: string;
  previewScale: number;
  inVetka: boolean;
  markerCount: number;
  provisionalEventCount: number;
  favoriteMomentCount: number;
  commentMomentCount: number;
  activeContextAction: "vetka" | "favorite";
}

export function computeDreamScore(input: {
  windowInnerWidth: number;
  windowInnerHeight: number;
  topbarHeight: number;
  footerHeight: number;
  displayedWidth: number;
  displayedHeight: number;
  horizontalLetterboxPx: number;
  aspectError: number;
}) {
  const windowArea = Math.max(1, input.windowInnerWidth * input.windowInnerHeight);
  const displayedArea = Math.max(0, input.displayedWidth * input.displayedHeight);
  const viewerDominanceRatio = Number((displayedArea / windowArea).toFixed(4));
  const chromeRatio = Number(
    (
      Math.max(0, input.topbarHeight + input.footerHeight) /
      Math.max(1, input.windowInnerHeight)
    ).toFixed(4),
  );

  const dominancePenalty = Math.max(0, 0.48 - viewerDominanceRatio) * 90;
  const chromePenalty = Math.max(0, chromeRatio - 0.12) * 120;
  const letterboxPenalty = Math.min(30, input.horizontalLetterboxPx * 10);
  const aspectPenalty = Math.min(25, input.aspectError * 5000);
  const rawScore = 100 - dominancePenalty - chromePenalty - letterboxPenalty - aspectPenalty;

  return {
    dreamScore: Math.max(0, Math.min(100, Math.round(rawScore))),
    viewerDominanceRatio,
    chromeRatio,
  };
}

export function computeDisplayedBox(
  viewerWidth: number,
  viewerHeight: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
) {
  const safeViewerWidth = Math.max(0, viewerWidth);
  const safeViewerHeight = Math.max(0, viewerHeight);
  const safeIntrinsicWidth = Math.max(0, intrinsicWidth);
  const safeIntrinsicHeight = Math.max(0, intrinsicHeight);

  if (
    safeViewerWidth <= 0 ||
    safeViewerHeight <= 0 ||
    safeIntrinsicWidth <= 0 ||
    safeIntrinsicHeight <= 0
  ) {
    return {
      displayedWidth: 0,
      displayedHeight: 0,
      horizontalLetterboxPx: 0,
      verticalLetterboxPx: 0,
      viewerAspectRatio: 0,
      naturalAspectRatio: 0,
      aspectError: 0,
    };
  }

  const naturalAspectRatio = safeIntrinsicWidth / safeIntrinsicHeight;
  const viewerAspectRatio = safeViewerWidth / safeViewerHeight;
  const scale = Math.min(
    safeViewerWidth / safeIntrinsicWidth,
    safeViewerHeight / safeIntrinsicHeight,
  );
  const displayedWidth = Number((safeIntrinsicWidth * scale).toFixed(2));
  const displayedHeight = Number((safeIntrinsicHeight * scale).toFixed(2));

  return {
    displayedWidth,
    displayedHeight,
    horizontalLetterboxPx: Number(Math.max(0, (safeViewerWidth - displayedWidth) / 2).toFixed(2)),
    verticalLetterboxPx: Number(Math.max(0, (safeViewerHeight - displayedHeight) / 2).toFixed(2)),
    viewerAspectRatio: Number(viewerAspectRatio.toFixed(6)),
    naturalAspectRatio: Number(naturalAspectRatio.toFixed(6)),
    aspectError: Number(Math.abs(viewerAspectRatio - naturalAspectRatio).toFixed(6)),
  };
}

export function suggestShellSize(
  intrinsicWidth: number,
  intrinsicHeight: number,
  footerHeight: number,
  maxShellWidth: number,
  maxShellHeight: number,
  shellChromeWidth = 0,
  shellChromeHeight = 0,
) {
  const safeFooterHeight = Math.max(0, footerHeight);
  const safeChromeWidth = Math.max(0, shellChromeWidth);
  const safeChromeHeight = Math.max(0, shellChromeHeight);
  const safeMaxWidth = Math.max(LAB_MIN_SHELL_WIDTH, maxShellWidth - safeChromeWidth);
  const safeMaxHeight = Math.max(LAB_MIN_SHELL_HEIGHT, maxShellHeight - safeChromeHeight);
  const safeIntrinsicWidth = Math.max(0, intrinsicWidth);
  const safeIntrinsicHeight = Math.max(0, intrinsicHeight);

  if (safeIntrinsicWidth <= 0 || safeIntrinsicHeight <= 0) {
    return {
      shellWidth: 960 + safeChromeWidth,
      shellHeight: 540 + safeChromeHeight,
    };
  }

  const ratio = safeIntrinsicWidth / safeIntrinsicHeight;
  const maxViewerHeight = Math.max(LAB_MIN_VIEWPORT_HEIGHT, safeMaxHeight - safeFooterHeight);

  // 0.10.21: портрет растёт ввысь до экрана (дефолт БОЛЬШЕ, решение
  // пользователя), ландшафт стартует с HD-флора. Раньше обе ориентации
  // стартовали с 540 — вертикалка схлопывалась до min-width 360.
  const startShellHeight = ratio < 1 ? safeMaxHeight : Math.min(LAB_DEFAULT_LANDSCAPE_HEIGHT, safeMaxHeight);
  let shellHeight = startShellHeight;
  let viewerHeight = Math.max(LAB_MIN_VIEWPORT_HEIGHT, shellHeight - safeFooterHeight);
  let shellWidth = Math.round(viewerHeight * ratio);

  if (shellWidth > safeMaxWidth) {
    shellWidth = Math.round(safeMaxWidth);
    viewerHeight = Math.round(shellWidth / ratio);
    shellHeight = Math.round(viewerHeight + safeFooterHeight);
  }

  if (shellHeight > safeMaxHeight) {
    viewerHeight = Math.round(maxViewerHeight);
    shellWidth = Math.round(viewerHeight * ratio);
    shellHeight = Math.round(viewerHeight + safeFooterHeight);
  }

  return {
    shellWidth: Math.max(LAB_MIN_SHELL_WIDTH, shellWidth + safeChromeWidth),
    shellHeight: Math.max(LAB_MIN_SHELL_HEIGHT, shellHeight + safeChromeHeight),
  };
}
