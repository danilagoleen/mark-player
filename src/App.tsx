import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  computeDreamScore,
  computeDisplayedBox,
  GeometrySnapshot,
  LAB_FOOTER_HEIGHT,
  ShellVariant,
  suggestShellSize,
} from "./lib/geometry";
import { configurePlayerWindow, inspectMediaContainer, isTauriRuntimeSync, openFileDialog, openFilesDialog, probeFile, saveFileDialog, saveFileDialogResult, openPanelWindow, shouldShowProbeOffline, toggleFullscreen, toAssetUrl } from "./lib/nativeWindow";
import type { SaveResult } from "./lib/nativeWindow";
import {
  mediaLoadProblemReason,
  type MediaContainerInfo,
} from "./lib/mediaDiagnostics";
import { resolveExportToast, VETKA_PROMO_MS, type ExportKind } from "./lib/exportFeedback";
import { tooltipFor } from "./lib/transportTooltips";
import { FEEDBACK_MAILTO, GITHUB_RELEASES_URL, GITHUB_REPO_URL } from "./lib/aboutLinks";
import { FULLSCREEN_CHROME_TIMEOUT_MS } from "./lib/fullscreenChrome";
import {
  FULLSCREEN_TRANSITION_TIMEOUT_MS,
  captureFullscreenTrace,
  isFullscreenLayoutSane,
  rectOf,
  type FullscreenGeometryTrace,
} from "./lib/fullscreenLayout";
import { sumSelectionSeconds, pairInOutRanges } from "./lib/selectionDuration";
import {
  buildPlaybackSegments,
  firstInAnchor,
  isManualSeekSuppressed,
  markManualSeek,
  outCrossAction,
  questionOutCrossed,
  readInOutPlayEnabled,
  wouldNestInPair,
  writeInOutPlayEnabled,
  INOUT_PLAY_STORAGE_KEY,
} from "./lib/inOutPlayback";
import { pushTransportTrace, shouldHideTransport, type TransportTraceEntry } from "./lib/transportVisibility";
import { SCRUB_PREVIEW_TIMEOUT_MS, isScrubSettled } from "./lib/scrubSeek";
import { PLAYER_SEEK_REQUEST_KEY, parseSeekRequest } from "./lib/markerSeek";
import { parseCutsheet, resolveCutsheetForMedia, type CutsheetSegment } from "./lib/cutsheet";
import { PLAYER_PLAY_REQUEST_KEY, PLAYLIST_RELOAD_EVENT, notifyPlaylistReloaded, parsePlayRequest } from "./lib/playlistPlay";
import { buildUIManifest, type UIManifest } from "./lib/uiManifest";
import { DOOR_IDS, checkModuleDoor, doorClickTransition, doorEndpoint, doorLabel, type DoorId, type ModuleDoor } from "./lib/moduleDoors";
import type { ProbeResult } from "./lib/nativeWindow";
import { createEmptyPlaylist, savePlaylist, loadPlaylist, addEntry, getNextEntryFromCursor, loadPlaybackMode, sanitizePlaylistFilename, trackOpenedFile, type QuestionPlaylistEntry } from "./lib/playlist";
import { answersFromMarkers, filterAnswersToPlaylist, findQuestionEntryAtTime, formatAnswerReplyText, lerpQuestionBox, mergeAnswerRecords, normalizeQuestionEntry, readAnswersOutbox, readQuestionPlaylistPath, rememberQuestionPlaylistPath, resolveActiveEntry, resolveQuestionSnapTime, serializeAnswersFile, writeAnswersOutbox, isQuestionPlaylist, type AnswerRecord, type AnswerVerdict, type QuestionBox, type QuestionEntry } from "./lib/questionPlaylist";
import { isSameMediaPath, resolveMediaContentHash } from "./lib/mediaOpen";
import { isAudioMedia, mediaPlayability, mediaRefusalReason } from "./lib/mediaPlayability";
import { markerBelongsToMedia, notifyMarkersChanged, notifyMediaChanged, resolveExternalMarkers, MARKERS_CHANGED_EVENT, MARKERS_RELOAD_EVENT, type MediaIdentity } from "./lib/markersSync";
import { isSameImportedMarker, matchGroupToPath, parseXmemlMarkers, type ImportedMarker } from "./lib/xmemlImport";
import type { CutPlayerMenuAction } from "./lib/cutPlayerMenu";
import { useDragDrop } from "./lib/useDragDrop";
import { ReverseShuttle, getShuttleDisplay, resolveJumpTarget, resolvePlayerHotkey, resolveProportionalStep, shuttleSlotClass } from "./lib/playerHotkeys";
import {
  confirmClearMarkers,
  countSparedQuestionReplies,
  createMarkerHistory,
  historyPush,
  historyRedo,
  historyUndo,
  selectMarkersToClear,
} from "./lib/markerHistory";
import type { ClearScope } from "./lib/markerHistory";
import { hitTestPlayhead, markerDragThresholdPassed, type PlayheadHitMarker } from "./lib/playheadHit";
import { pauseBeforeMarkerJump } from "./lib/markerJump";
import { normalizeImportedMarker } from "./lib/markersJson";
import { decideMarkersImportTarget, readSidecarBinding, singlePlaylistMediaPath } from "./lib/markersImport";
import {
  loadCommentAuthorName,
  parseReplyText,
} from "./lib/commentAuthor";
import {
  buildReplyMarkerFull,
  resolveReplyAuthorForParent,
} from "./lib/markerReply";
import { markerDedupKey, materializePlaylistQuestions, materializedMarkerId, materializedMarkerPrefix } from "./lib/questionMaterialize";
import {
  VOLUME_STEP,
  createFrameCalibrator,
  hasRequestVideoFrameCallback,
  resolveFrameStepSeconds,
} from "./lib/fpsEstimator";
import { loadContainerFps } from "./lib/mp4Fps";
import { checkForUpdatesNow, checkForUpdatesSilent } from "./lib/appUpdater";
import {
  parseSubtitleSrt,
  findCuesAt,
  looksLikeMarkers,
  decodeSubtitleBytes,
  loadSubtitleStore,
  resolveSubtitleTrackKey,
  saveSubtitleTrack,
  removeSubtitleTrack,
  type SubtitleStore,
} from "./lib/subtitles";
import { SubtitleOverlay } from "./components/subtitles/SubtitleOverlay";
import type { Update } from "@tauri-apps/plugin-updater";
import { createSingleDoubleClick, type SingleDoubleClick } from "./lib/singleDoubleClick";
import MycoProbeApp from "./MycoProbeApp";
// Bell №2: agent chat is a separate module — no chat imports in the default
// player bundle. Chat components stay in the repo as extraction stock.
import { exportMarkersToSrtV2, exportToSidecar, exportMarkersToXmeml, exportPlaylistToXmeml, exportCommentsToText, resolvePlaylistMetadata, formatTimecode, resolveXmlFps, resolveXmlFpsSource, resolveXmlHasAudio, reviewMarkerName, exportMarkersToEdl, exportPlaylistToEdl, describeFpsHonesty, fpsMismatchNote, splitMarkerPrefixLine } from "./srtUtils";
import {
  buildVisualReviewHtml,
  editorPackageDir,
  editorPackagePlan,
  frameToDataUrl,
  resolveSnapshotSize,
  snapshotDirForFile,
  snapshotFileName,
  SNAPSHOT_JPEG_QUALITY,
  SNAPSHOT_SEEK_TIMEOUT_MS,
  type CapturedFrame,
} from "./lib/frameSnapshots";
import { buildPlaylistReviewText } from "./lib/playlistReview";
import type { PlaylistReviewSection } from "./lib/playlistReview";
import { buildPlaylistMarkersJson, shiftSrtMarkers, playlistReelName } from "./lib/playlistMediaExports";
import { buildPlaylistVisualRows, playlistFrameFileName } from "./lib/playlistVisualReview";
import type { PlaylistVisualFrame, PlaylistVisualSection } from "./lib/playlistVisualReview";
import type { SrtExportable } from "./srtUtils";
import type { PlaylistMeta, XmemlPlaylistItemInput } from "./srtUtils";
import { FileInfoRow } from "./components/info/FileInfoRow";
import {
  MODULE_MANIFEST_LS_KEY,
  candidateOutDir,
  manifestDirOf,
  mediaFsPath,
  moduleHostQuery,
  modulePanelLabel,
  parseModuleManifest,
  resolveModuleFile,
  type ModuleManifest,
} from "./lib/moduleHost";
import {
  clearLastOpen,
  readLastOpen,
  resolveResumeRequest,
  writeLastOpen,
} from "./lib/lastOpen";

type PreviewQualityKey = "full" | "half" | "quarter" | "eighth" | "sixteenth" | "thirtysecond";
type PlayerMediaKind = "video" | "audio" | "image" | null;

const PREVIEW_QUALITY_OPTIONS: { key: PreviewQualityKey; label: string; scale: number }[] = [
  { key: "full", label: "1x", scale: 1 },
  { key: "half", label: "1/2", scale: 0.5 },
  { key: "quarter", label: "1/4", scale: 0.25 },
  { key: "eighth", label: "1/8", scale: 0.125 },
  { key: "sixteenth", label: "1/16", scale: 0.0625 },
  { key: "thirtysecond", label: "1/32", scale: 0.03125 },
];

type PlayerMarkerKind = "favorite" | "negative" | "in" | "out" | "comment" | "chat";
type PlayerLabImportPreview = {
  markers: PlayerTimeMarker[];
  provisionalEvents: ProvisionalCaptureEvent[];
  kindCounts: Record<string, number>;
};

type ProvisionalEventType = "vetka_logo_capture";

interface ProvisionalCaptureEvent {
  provisional_event_id: string;
  event_type: ProvisionalEventType;
  media_path: string;
  start_sec: number;
  end_sec: number;
  text: string;
  created_at: string;
  export_mode: "srt_comment";
  migration_status: "local_only" | "migrated";
  migrated_to_marker_id: string | null;
}

interface PlayerTimeMarker {
  marker_id: string;
  schema_version: "cut_time_marker_v1";
  project_id: string;
  timeline_id: string;
  media_path: string;
  // 0.22: content-hash identity — копия/переименование не теряет разметку.
  // Пусто у легаси-меток: они ищутся по media_path (fallback).
  content_hash?: string | null;
  kind: PlayerMarkerKind;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  score: number;
  label: string;
  text: string;
  author: string;
  context_slice: null;
  cam_payload: null;
  chat_thread_id: null;
  comment_thread_id: null;
  source_engine: string;
  // tb_1791654032_27281_1: статуса нет — задачи живут в таскборде.
  // Старые файлы со status читаются как раньше (лишнее поле игнорируется).
  // tb_1791585558_31907_1: ответ — ссылка на родителя (marker_id).
  // Опциональна: старые маркеры без неё — корни.
  reply_to?: string;
  // tb_1791809796_24701_1: id вопроса у qmat-маркера (выжимка ответов).
  question_id?: string;
  created_at: string;
  updated_at: string;
}

const MARKERS_STORAGE_KEY = "vetka_player_lab_markers_v1";
const PROVISIONAL_EVENTS_STORAGE_KEY = "vetka_player_lab_provisional_events_v1";
const VETKA_STATUS_STORAGE_KEY = "vetka_player_lab_in_vetka_v1";
const DEFAULT_PLAYER_LAB_API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

// tb_1791679886_1275_2: зонд видимости тулбаров — всё JSON-сериализуемо,
// файл только basename (приватность: пути и кадры наружу не едут).
interface TransportUiState {
  appVersion: string;
  showTransport: boolean;
  chromeHidden: boolean;
  isFullscreen: boolean;
  isMoving: boolean;
  mediaKind: string | null;
  hasSrc: boolean;
  file: string;
  video: { paused: boolean; ended: boolean; t: number; d: number } | null;
  dockOpacity: string | null;
  dockRect: { x: number; y: number; w: number; h: number } | null;
  overlayMounted: boolean;
  overlayOpacity: string | null;
  barRect: { x: number; y: number; w: number; h: number } | null;
}

declare global {
  interface Window {
    vetkaPlayerLab?: {
      snapshot: () => GeometrySnapshot;
      print: () => GeometrySnapshot;
      markers: () => PlayerTimeMarker[];
      provisionalEvents: () => ProvisionalCaptureEvent[];
      setVariant: (variant: ShellVariant) => void;
      setSyntheticSize: (width: number, height: number) => void;
      setPreviewQuality: (quality: PreviewQualityKey) => void;
      setInVetka: (next: boolean) => void;
      addMomentMarker: (kind?: PlayerMarkerKind, text?: string) => PlayerTimeMarker | null;
      applySuggestedShell: () => GeometrySnapshot;
      resetShell: () => void;
      toggleDebug: () => void;
      toggleFullscreen: () => Promise<boolean | null>;
      isTauri: () => boolean;
      openFile: () => Promise<string | null>;
      getFileName: () => string;
      getNativeDialogAvailable: () => boolean;
      // tb_1791156671_82609_1: крючки дорожки субтитров для e2e.
      importSubtitlesText: (text: string, mediaPath?: string) => number;
      setSubtitlesVisible: (visible: boolean) => void;
      getSubtitleCues: () => { start: number; end: number; text: string }[];
      // tb_1791146301_70644_14: последний трейс фулскрин-геометрии для e2e/отладки.
      fullscreenTrace: () => import("./lib/fullscreenLayout").FullscreenGeometryTrace | null;
      // tb_1791679886_1275_2: зонд видимости тулбаров — флаги + живой DOM
      // (opacity/rect), только basename файла, без путей и кадров.
      uiState: () => TransportUiState;
      // tb_1791233033_7043_2: манифест агента — контролы (testid) + api.
      manifest: () => UIManifest;
    };
  }
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    mode: params.get("mode") || "player",
    src: params.get("src") || "",
    variant: (params.get("variant") as ShellVariant | null) || "fixed-footer",
    mockWidth: Number(params.get("mockWidth") || 0),
    mockHeight: Number(params.get("mockHeight") || 0),
    applySuggestedShell: params.get("applySuggestedShell") === "1",
    debug: params.get("debug") === "1",
    apiBase: params.get("apiBase") || "",
    sandboxRoot: params.get("sandboxRoot") || "",
    projectId: params.get("projectId") || "",
    timelineId: params.get("timelineId") || "main",
  };
}

function resolvePlayerLabApiBase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_PLAYER_LAB_API_BASE;
  return trimmed.replace(/\/$/, "");
}

function normalizePlayerLabImportPayload(raw: unknown): PlayerLabImportPreview {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const markers = Array.isArray(record.markers)
    ? record.markers
    : Array.isArray(raw)
      ? raw
      : [];
  const provisionalEvents = Array.isArray(record.provisionalEvents)
    ? record.provisionalEvents
    : Array.isArray(record.provisional_events)
      ? record.provisional_events
      : [];
  const kindCounts: Record<string, number> = {};
  for (const marker of markers) {
    if (!marker || typeof marker !== "object") continue;
    const kind = String((marker as Record<string, unknown>).kind || "favorite");
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }
  return {
    markers: markers.filter((item): item is PlayerTimeMarker => Boolean(item && typeof item === "object")),
    provisionalEvents: provisionalEvents.filter((item): item is ProvisionalCaptureEvent => Boolean(item && typeof item === "object")),
    kindCounts,
  };
}

function formatName(value: string) {
  if (!value) return "Mark Player";
  const tail = value.split("/").pop() || value;
  return tail.length > 52 ? `${tail.slice(0, 49)}...` : tail;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getSeekStep(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0.1;
  return Math.max(0.1, Number((seconds / 100).toFixed(2)));
}

function inferMediaKind(fileName: string, mimeType = ""): PlayerMediaKind {
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.startsWith("video/")) return "video";
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.startsWith("audio/")) return "audio";

  const lowerName = fileName.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/.test(lowerName)) return "image";
  if (/\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|wmv)$/.test(lowerName)) return "video";
  // Аудио (P3 tb_1791571305_29299_2): тот же <video>, тот же транспорт.
  if (isAudioMedia(lowerName)) return "audio";
  return null;
}

function getAvailableScreenBounds() {
  const availWidth = Math.max(
    360,
    Math.floor(
      window.screen?.availWidth ||
        window.screen?.width ||
        window.innerWidth ||
        360,
    ),
  );
  const availHeight = Math.max(
    240,
    Math.floor(
      window.screen?.availHeight ||
        window.screen?.height ||
        window.innerHeight ||
        240,
    ),
  );

  return { availWidth, availHeight };
}

function createMarkerId() {
  return `marker_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultMarkerLabel(kind: PlayerMarkerKind): string {
  return kind === "favorite" ? "Favorite" : kind === "negative" ? "Negative" : kind === "in" ? "In point" : kind === "out" ? "Out point" : kind === "comment" ? "Comment" : kind === "chat" ? "Agent chat" : "Marker";
}

function createImportedMarker(m: ImportedMarker, mediaPath: string, contentHash: string | null): PlayerTimeMarker {
  const now = new Date().toISOString();
  return {
    marker_id: createMarkerId(),
    schema_version: "cut_time_marker_v1",
    project_id: "cut_demo",
    timeline_id: "main",
    media_path: mediaPath,
    content_hash: contentHash,
    kind: m.kind,
    start_sec: m.start_sec,
    end_sec: m.end_sec,
    anchor_sec: m.anchor_sec,
    score: m.kind === "favorite" ? 0.85 : 0.6,
    label: m.label || defaultMarkerLabel(m.kind),
    text: m.text,
    author: "xmeml_import",
    context_slice: null,
    cam_payload: null,
    chat_thread_id: null,
    comment_thread_id: null,
    source_engine: "xmeml_import",
    created_at: now,
    updated_at: now,
  };
}

function readStoredMarkers(): PlayerTimeMarker[] {
  try {
    const raw = localStorage.getItem(MARKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // tb_1791654032_27281_1: без миграций — старые поля (status) просто
    // игнорируются типом, чтение не ломается.
    return parsed as PlayerTimeMarker[];
  } catch {
    return [];
  }
}

function readStoredProvisionalEvents(): ProvisionalCaptureEvent[] {
  try {
    const raw = localStorage.getItem(PROVISIONAL_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readStoredVetkaStatusMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(VETKA_STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function IconOpen() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l2 2h5.5A2.5 2.5 0 0 1 20 10.5v7A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M12 6V3.5M12 3.5l-2 2M12 3.5l2 2" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
    </svg>
  );
}

function IconVolume({ isMuted }: { isMuted: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none">
      {isMuted ? (
        <>
          <path d="M2 6h2l3-3v10L4 10H2a1 1 0 01-1-1V7a1 1 0 011-1z" fill="currentColor" />
          <line x1="11" y1="5.5" x2="14.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="14.5" y1="5.5" x2="11" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M3 6h2l3-3v10L5 10H3a1 1 0 01-1-1V7a1 1 0 011-1z" fill="currentColor" />
          <path d="M10.5 4.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M12.5 2.5a8 8 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function IconStar({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.7l2.6 5.2 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

function IconMarkerFavorite() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5l2 4 4.5.6-3.2 3.2.7 4.7L8 11.5l-4 2.5.7-4.7L1.5 6.1l4.5-.6z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function IconMarkerNegative() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="white" strokeWidth="1.3" />
      <line x1="5" y1="5" x2="11" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="5" x2="5" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMarkerIn() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M9 1H5V11H9" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMarkerOut() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 1H7V11H3" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// tb_1791146301_70644_16: ножницы in-out селекшна (та же школа иконок).
function IconScissors() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4.5" cy="4.5" r="2" fill="none" stroke="white" strokeWidth="1.3" />
      <circle cx="4.5" cy="11.5" r="2" fill="none" stroke="white" strokeWidth="1.3" />
      <path d="M6.2 5.8L14 12M6.2 10.2L14 4" fill="none" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconMarkerComment() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 3h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 6h4M6 8h3" stroke="white" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function IconMarkerChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="10" height="8" rx="1.5" />
      <circle cx="6" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <line x1="6" y1="12.5" x2="10" y2="12.5" />
      <line x1="8" y1="6" x2="8" y2="4" />
      <circle cx="8" cy="3.5" r="0.5" fill="currentColor" />
      <circle cx="18" cy="7" r="2.5" />
      <path d="M14 20v-3a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v3" />
    </svg>
  );
}

// Слайс 5.2: иконка плейлиста рядом с vetka-add (Soia-стиль) —
// открывает панель плейлиста (panel-playlist window).
function IconPlaylist() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 6h9M4 12h9M4 18h9" />
      <circle cx="18" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function App() {
  const initialQuery = useMemo(readQuery, []);
  if (initialQuery.mode === "myco") {
    return <MycoProbeApp />;
  }
  const [variant, setVariant] = useState<ShellVariant>(initialQuery.variant);
  const [src, setSrc] = useState<string>(initialQuery.src);
  const [fileName, setFileName] = useState<string>(formatName(initialQuery.src));
  const [mediaKind, setMediaKind] = useState<PlayerMediaKind>(
    initialQuery.src ? inferMediaKind(initialQuery.src) : null,
  );
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [syntheticSize, setSyntheticSize] = useState({
    width: initialQuery.mockWidth,
    height: initialQuery.mockHeight,
  });
  const [shellSizeOverride, setShellSizeOverride] = useState<{ width: number; height: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // tb_1791146301_70644_14: фулскрин-переход в полёте. Нативный фулскрин Tauri
  // применяется асинхронно (macOS-анимация), а isFullscreen — асинхронный опрос
  // win.isFullscreen(): пока флаг false, shellSizeOverride в px душит шелл и
  // ResizeObserver молчит → «пол-экрана чёрного». На время перехода шелл
  // считается фулскрином (без px-пина); страховка от зависшего флага — таймаут.
  const [fsTransition, setFsTransition] = useState(false);
  const isFullscreenRef = useRef(false);
  const fsTransitionTimerRef = useRef<number | null>(null);
  const fsTraceRef = useRef<FullscreenGeometryTrace | null>(null);
  const beginFullscreenTransition = () => {
    setFsTransition(true);
    if (fsTransitionTimerRef.current !== null) window.clearTimeout(fsTransitionTimerRef.current);
    fsTransitionTimerRef.current = window.setTimeout(() => {
      fsTransitionTimerRef.current = null;
      setFsTransition(false);
    }, FULLSCREEN_TRANSITION_TIMEOUT_MS);
  };
  const [isDragging, setIsDragging] = useState(false);
  const [isDebugVisible, setIsDebugVisible] = useState(initialQuery.debug);
  const [geometryTick, setGeometryTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // 0.10.19: shuttle level as React state — the J/L level used to live only in
  // the keydown-effect closure, so transport icons read isPlaying alone and
  // lied during reverse (video paused + ReverseShuttle stepping = showed Play).
  const [shuttle, setShuttleLevel] = useState(0);
  // 0.10.19: honest transport state — an active shuttle counts as moving,
  // so icons, auto-hide and HUD follow the shuttle, not video.paused alone.
  // Declared here (before the transport-timer effect) to satisfy TS2448.
  const shuttleDisplay = getShuttleDisplay(shuttle, isPlaying);
  const isMoving = shuttleDisplay.moving;
  const [currentTime, setCurrentTime] = useState(0);
  // tb_1791172090_2308_6 п.3: запрошенная перемотка, которую декодер ещё
  // не догнал. Пока seekTarget != null транспорт показывает ФАКТИЧЕСКУЮ
  // позицию (currentTime) + честный бейдж «seeking…». Чистит onSeeked.
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  // tb_1792441299_49541_7 + tb_1792443862_5828_1: scrub-preview. Пока тянем
  // плейхед, UI ведёт его за курсором, не дожидаясь медленного seek аудио
  // через asset-протокол. Промежуточных сиков НЕТ вообще: каждый
  // currentTime во время drag заново праймил аудио-пайплайн и звук рвался —
  // единственный seek уходит на отпускании кнопки.
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const scrubPreviewRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const scrubClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubDisplayTime = scrubPreview ?? currentTime;
  // tb_1791689190_1275_1: бейдж seeking… стробил при скрабе (тик ставит,
  // seeked тут же гасит). Честный сигнал остался: показываем только
  // зависший сик (>300мс), скраб идёт мимо бейджа.
  const [seekStuck, setSeekStuck] = useState(false);
  useEffect(() => {
    if (seekTarget == null) {
      setSeekStuck(false);
      return;
    }
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => setSeekStuck(true), 300);
    return () => clearTimeout(timer);
  }, [seekTarget]);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  // 1.2: Volume OSD — процент в правом верхнем углу вьюера (шрифт таймкода).
  const [volumeOsdVisible, setVolumeOsdVisible] = useState(false);
  const volumeOsdTimerRef = useRef<number | null>(null);
  const [showTransport, setShowTransport] = useState(true);
  // tb_1791680717_1275_3: кольцо переходов тулбара для инспектора (без консоли).
  const [transportTrace, setTransportTrace] = useState<TransportTraceEntry[]>([]);
  // 0.12 слайс: хром фулскрина (тулбары+курсор) — отдельный слой поверх
  // showTransport, живёт только пока isFullscreen.
  const [chromeHidden, setChromeHidden] = useState(false);
  const chromeTimerRef = useRef<number | null>(null);
  const [previewQuality, setPreviewQuality] = useState<PreviewQualityKey>("full");
  const [vetkaStatusMap, setVetkaStatusMap] = useState<Record<string, boolean>>(readStoredVetkaStatusMap);
  const [markers, setMarkers] = useState<PlayerTimeMarker[]>(readStoredMarkers);
  // 0.22: content-hash identity текущего медиа (копия/переименование —
  // разметка не теряется). null = хеш неизвестен/не посчитан: fallback на путь.
  const [contentHash, setContentHash] = useState<string | null>(null);
  const [srtContent, setSrtContent] = useState("");
  // tb_1791156671_82609_1: дорожка субтитров — одна на видео, ключ абс. путь.
  const [subStore, setSubStore] = useState<SubtitleStore>(() => loadSubtitleStore());
  const [subtitlesVisible, setSubtitlesVisible] = useState(true);
  // Часы реплик: rVFC-цикл пишет сюда только при смене активной реплики,
  // null = фолбэк на currentTime (timeupdate/seek).
  const [subtitleTime, setSubtitleTime] = useState<number | null>(null);
  // Хинт «это похоже на маркеры» с кнопкой создания (поверх автотоста 2.2с).
  const [markerHint, setMarkerHint] = useState<{ trackKey: string; cues: number } | null>(null);
  // tb_1791654032_27281_1: только чтение (создание по логотипу убрано) —
  // сеттер не нужен, импорт/экспорт sidecar идут через normalize-тракт.
  const [provisionalEvents] = useState<ProvisionalCaptureEvent[]>(readStoredProvisionalEvents);
  const [contextToast, setContextToast] = useState("");
  // Open-gate 1.1: отказ гейта — отдельный янтарный тост на 6с.
  // Общий contextToast гаснет за 2.2с — отказ в нём не замечают.
  const [refusalToast, setRefusalToast] = useState("");
  // VETKA-промо: тост vetka-add — 10с с плавным затуханием (плеер работает на нас).
  const [vetkaToast, setVetkaToast] = useState("");
  // Bell №2: chat state removed — agent chat is a separate module.
  const [showVolume, setShowVolume] = useState(false);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [playerLabApiBase, setPlayerLabApiBase] = useState(resolvePlayerLabApiBase(initialQuery.apiBase));
  const [importSandboxRoot, setImportSandboxRoot] = useState(initialQuery.sandboxRoot);
  const [importProjectId, setImportProjectId] = useState(initialQuery.projectId);
  const [importTimelineId, setImportTimelineId] = useState(initialQuery.timelineId);
  const [importPreview, setImportPreview] = useState<PlayerLabImportPreview | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  // Шаг 4/7: ModuleDoor — достижимость точек бэкенда player-lab.
  const [moduleDoors, setModuleDoors] = useState<Record<DoorId, ModuleDoor>>(() => {
    const base = resolvePlayerLabApiBase(initialQuery.apiBase);
    const initial = {} as Record<DoorId, ModuleDoor>;
    for (const id of DOOR_IDS) {
      initial[id] = { id, endpoint: doorEndpoint(id, base), status: "missing", detail: "not checked yet" };
    }
    return initial;
  });
  // 0.10.29: оценка fps через rVFC (калибровка на rate=1, 50 сэмплов) —
  // среднее звено fps-цепочки: container → probe → rVFC → 25.
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  // tb_1790752061_6128_1: fps из заголовка MP4/MOV (mdhd+stts) — первое звено
  // цепочки. Грузится асинхронно при смене src, открытию не мешает.
  const [containerFps, setContainerFps] = useState<number | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // tb_1792438559_20717_1: контейнер текущего файла (moov/mdat, размер) —
  // по нему называем причину молчащего >4 ГБ proxy, вместо чёрного экрана.
  const [mediaContainerInfo, setMediaContainerInfo] = useState<MediaContainerInfo | null>(null);
  // Провал загрузки/тишина — не 6-секундный тост: оператор смотрит в чёрный
  // кадр и не должен ловить сообщение в углу. Живёт до следующего файла,
  // успешного play или явного закрытия.
  const [mediaProblem, setMediaProblem] = useState("");
  // 0.10.22: ref-зеркало currentFilePath — playlist:play-listener живёт в
  // useEffect([]) и видит только mount-замыкание, стейт там всегда stale.
  const currentFilePathRef = useRef<string | null>(null);
  // tb_1791865711_84020_5: курсор текущей ЗАПИСИ (путь + вопрос) для
  // автоперехода. Пути не уникальны (несколько вопросов на одном видео) —
  // findIndex-первое вхождение прыгало назад; индекс — по вопросу.
  const currentEntryRef = useRef<{ path: string | null; questionId?: string | null; index?: number | null }>({ path: null });
  // tb_1791233024_7043_1: Resume — отложенная перемотка холодного старта
  // (позиция применяется в onLoadedMetadata, раньше декодер её роняет)
  // + троттл записи позиции (timeupdate ~4Гц, в LS пишем раз в 5с и точно
  // на паузе/конце/открытии).
  const resumeSeekRef = useRef<{ path: string; positionSec: number } | null>(null);
  const lastOpenWriteRef = useRef<{ path: string; positionSec: number } | null>(null);
  // tb_1791233039_7043_3: клик по пункту плейлиста → открывается И ИГРАЕТ.
  // play() раньше onLoadedData декодер роняет (src ещё не применён), поэтому
  // флаг: ставится источником открытия, потребляется в onLoadedData.
  const autoplayOnLoadRef = useRef(false);
  function recordPlaybackPosition(path: string | null, positionSec: number): void {
    if (!path) return;
    if (!Number.isFinite(positionSec) || positionSec < 0) return;
    const prev = lastOpenWriteRef.current;
    if (prev && prev.path === path && Math.abs(prev.positionSec - positionSec) < 5) return;
    lastOpenWriteRef.current = { path, positionSec };
    writeLastOpen(path, positionSec);
  }
  function recordPlaybackPositionExact(path: string | null, positionSec: number): void {
    if (!path) return;
    if (!Number.isFinite(positionSec) || positionSec < 0) return;
    lastOpenWriteRef.current = { path, positionSec };
    writeLastOpen(path, positionSec);
  }
  // 0.10.29: ref-зеркала для keydown-замыкания (эффект висит на
  // [duration, previewQuality], стейт probe/estimate там всегда stale).
  const probeFpsRef = useRef<number | null>(null);
  const estimatedFpsRef = useRef<number | null>(null);
  const containerFpsRef = useRef<number | null>(null);
  const wheelVolumeAtRef = useRef(0);
  // 0.10.29 (Шаг 3): различитель сингл/дабл по видео — инстанс в ref,
  // иначе ре-рендеры роняют pending-одиночный; колбэки — через зеркала,
  // иначе stale-замыкание (паттерн addMomentMarkerRef).
  const videoClickCtlRef = useRef<SingleDoubleClick | null>(null);
  const videoSingleRef = useRef(() => {});
  const videoDoubleRef = useRef(() => {});
  if (!videoClickCtlRef.current) {
    videoClickCtlRef.current = createSingleDoubleClick(
      () => videoSingleRef.current(),
      () => videoDoubleRef.current(),
      250,
    );
  }
  videoSingleRef.current = () => togglePlayback();
  videoDoubleRef.current = () => {
    beginFullscreenTransition();
    void toggleFullscreen();
  };
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const progressWrapRef = useRef<HTMLDivElement | null>(null);
  const transportBarRef = useRef<HTMLDivElement | null>(null);
  // tb_1791172090_2308_6 п.2: подъём субтитров над видимым транспортом, px.
  const [subtitleLift, setSubtitleLift] = useState(0);
  const topbarRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const autoSizedKeyRef = useRef("");
  const transportTimerRef = useRef<number | null>(null);
  // tb_1791675182_1275_1: позиция взвода хайда — прячем, только если время ушло вперёд.
  const hideArmedAtRef = useRef(0);
  // tb_1791679886_1275_2: зеркала для зонда uiState — синк каждый рендер
  // (эффект без deps ниже): зонд читает их в момент вызова, а не stale.
  const showTransportMirrorRef = useRef(true);
  const chromeHiddenMirrorRef = useRef(false);
  const isMovingMirrorRef = useRef(false);
  const mediaKindMirrorRef = useRef<PlayerMediaKind>(null);
  const hasSrcMirrorRef = useRef(false);
  const fileNameMirrorRef = useRef("");
  const firstFramePrimedRef = useRef(false);
  const intrinsicSize = naturalSize.width > 0 && naturalSize.height > 0 ? naturalSize : syntheticSize;
  const sourceKind: GeometrySnapshot["sourceKind"] =
    naturalSize.width > 0 && naturalSize.height > 0
      ? mediaKind === "image"
        ? "image"
        : "video"
      : "synthetic";
  // tb_1792435439_49541_1: у аудио кадра нет — нижняя полоса с именем файла
  // и жёлтым probe-offline не нужна вовсе (слово оператора 19.10).
  const footerReserve =
    mediaKind === "audio" ? 0 : sourceKind !== "synthetic" && !isDebugVisible ? 0 : LAB_FOOTER_HEIGHT;
  const isPureMode = !isDebugVisible;
  const previewQualityOption = PREVIEW_QUALITY_OPTIONS.find((option) => option.key === previewQuality) || PREVIEW_QUALITY_OPTIONS[0];
  const effectivePreviewScale = sourceKind === "video" ? previewQualityOption.scale : 1;
  // tb_1791571305_29299_2: видео и аудио — один носитель времени: транспорт,
  // шкала, плейхед и маркеры одинаковы (у аудио просто нет кадра).
  const isTimeMedia = mediaKind === "video" || mediaKind === "audio";
  const currentMediaKey = src && !src.startsWith("blob:") ? src : fileName;
  // Слайс 5.2: имя медиа — в заголовок окна (Soia-стиль), media-label удалён.
  // 0.22: identity текущего медиа — сначала content-hash, затем путь (fallback).
  const mediaIdentity: MediaIdentity = { mediaKey: currentMediaKey, contentHash };
  // Дефолт берём из document.title (штамп версии из tauri.conf), не дублируем.
  const defaultWindowTitleRef = useRef(
    typeof document !== "undefined" ? document.title : "Mark Player",
  );
  const isInVetka = Boolean(currentMediaKey && vetkaStatusMap[currentMediaKey]);
  const mediaMarkers = useMemo(
    // 0.22: сначала content-hash, затем путь (легаси-метки без хеша).
    // tb_1791690899_1275_3: добивка anchor (комменты Save 0.25.34 писались
    // без anchor_sec — шкала и движок клали их в 0; писателя чиним тоже,
    // это лечит уже лежащие).
    () => markers
      .filter((marker) => markerBelongsToMedia(marker, mediaIdentity))
      .map((marker) => (marker.anchor_sec === undefined ? { ...marker, anchor_sec: marker.start_sec ?? 0 } : marker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentMediaKey, contentHash, markers],
  );
  const mediaProvisionalEvents = useMemo(
    () => provisionalEvents.filter((event) => event.media_path === currentMediaKey),
    [currentMediaKey, provisionalEvents],
  );
  const favoriteMomentCount = useMemo(
    () => mediaMarkers.filter((marker) => marker.kind === "favorite").length,
    [mediaMarkers],
  );
  const commentMomentCount = useMemo(
    () => mediaMarkers.filter((marker) => marker.kind === "comment").length,
    [mediaMarkers],
  );
  // tb_1791143015_70644_7: In–Out Play одного видео (ON по умолчанию).
  // tb_1791685802_1275_3: ножницы — единственный рубильник (played-through
  // гейт «сначала досмотри» снесён приказом оператора: ON = скобки работают,
  // OFF = не работают, скрытых механизмов ноль).
  const [inOutPlayOn, setInOutPlayOn] = useState<boolean>(() => readInOutPlayEnabled());
  const inOutPlayOnRef = useRef(inOutPlayOn);
  const inOutPrevTRef = useRef(0);
  // tb_1791686462_1275_1: разовый авто-старт plain-записи с первой [
  // скобки (взводит commitAdvance, гасят failAdvance и ручной путь,
  // срабатывает эффектом ниже, одноразовый).
  const advanceInSeekRef = useRef<string | null>(null);
  const skipToastShownRef = useRef(false);
  const [skippedTotalSec, setSkippedTotalSec] = useState(0);
  // tb_1791333803_37784_1: превью монтажного листа одного видео (только
  // чтение). Активный лист подменяет источник сегментов движка _7;
  // played-through для него не нужен — строки уже решение монтажа.
  const [cutsheetPreview, setCutsheetPreview] = useState<{ name: string; segments: CutsheetSegment[] } | null>(null);
  const cutsheetPreviewRef = useRef<{ name: string; segments: CutsheetSegment[] } | null>(null);
  function clearCutsheetPreview(): void {
    cutsheetPreviewRef.current = null;
    setCutsheetPreview(null);
  }
  // tb_1791521998_11250_5: активный вопрос плейлиста-вопроса (один файл =
  // «вот N мест для проверки»). Скобки вопроса подменяют источник сегментов
  // движка (как cutsheet), маркеры вопроса — транзитная overlay-метка на шкале.
  const [activeQuestion, setActiveQuestion] = useState<QuestionEntry | null>(null);
  const activeQuestionRef = useRef<QuestionEntry | null>(null);
  activeQuestionRef.current = activeQuestion;
  // tb_1791819024_26192_2: follow уже тостил про этот вопрос (не спамим).
  const followBlockedRef = useRef<string | null>(null);
  // tb_1791819024_26192_2: дабл-клик по вердикту — один ответ (scn-03 ×2).
  const answerBusyRef = useRef(false);
  const lastAnswerRef = useRef<{ qid: string; verdict: AnswerVerdict; at: number }>({ qid: "", verdict: "comment", at: 0 });
  const questionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const questionPathRef = useRef<string | null>(null);
  // tb_1792439791_49541_5: ручной сик за пределы скобок вопроса — это намерение
  // оператора, а не проигрывание. Снап к IN молчит, пока плейхед не вернётся
  // в окно вопроса (или пока не активируют другой вопрос).
  const questionSnapSuspendedRef = useRef(false);
  const questionSnapKeyRef = useRef<string | null>(null);
  const [questionChoice, setQuestionChoice] = useState<string | null>(null);
  const [questionComment, setQuestionComment] = useState("");
  function clearActiveQuestion(): void {
    questionRangeRef.current = null;
    questionPathRef.current = null;
    followBlockedRef.current = null;
    setActiveQuestion(null);
    setQuestionChoice(null);
    setQuestionComment("");
  }
  // tb_1791819024_26192_2: плейлист пересобрали (Clear/импорт в панели) —
  // карточки мёртвой записи не держим. Зовут слушатели reload (refs свежие).
  function revalidateActiveQuestion(): void {
    const q = activeQuestionRef.current;
    if (!q?.question_id) return;
    try {
      const pl = loadPlaylist();
      const alive = Array.isArray(pl?.entries) &&
        (pl.entries as QuestionEntry[]).some((e) => e.question_id === q.question_id);
      if (!alive) clearActiveQuestion();
    } catch {
      // ignore — карточка остаётся
    }
  }
  // tb_1791809796_24701_1: канон «одна правда — маркеры». Ответ = reply-маркер
  // на qmat (общий конструктор lib/markerReply, anchor = playhead); answers.json
  // — чистая выжимка answersFromMarkers из всех маркеров, второго пути записи
  // в файл больше нет. Без родителя-qmat — только reply в Comments + тост
  // (в выжимку непривязанный ответ не идёт, честно).
  // tb_1791819024_26192_2: подписи кнопок для тоста сохранения (оператор
  // должен видеть, что записалось: мимо кнопки видно сразу).
  const ANSWER_BUTTON_LABEL: Record<AnswerVerdict, string> = { favorite: "Confirm", negative: "Reject", comment: "Not sure" };
  async function answerQuestion(verdict: AnswerVerdict): Promise<void> {
    const q = activeQuestion;
    if (!q || !q.question_id) return;
    const qid = q.question_id;
    // Дабл-клик — один ответ (scn-03 ×2 с разрывом 0.09с).
    if (answerBusyRef.current) return;
    const last = lastAnswerRef.current;
    if (last.qid === qid && last.verdict === verdict && Date.now() - last.at < 1500) return;
    answerBusyRef.current = true;
    const recordAnswer = () => {
      answerBusyRef.current = false;
      lastAnswerRef.current = { qid, verdict, at: Date.now() };
    };
    const comment = questionComment.trim();
    const t = videoRef.current?.currentTime;
    const playhead = typeof t === "number" && Number.isFinite(t) && t >= 0 ? t : undefined;
    const replyParent =
      mediaMarkers.find((m) => m.marker_id === materializedMarkerId(qid, "in")) ??
      mediaMarkers.find((m) => m.marker_id.startsWith(materializedMarkerPrefix(qid))) ??
      null;
    const replyText = formatAnswerReplyText({ verdict, choice: questionChoice ?? undefined, comment: comment || undefined });
    const now = new Date().toISOString();
    const replyAuthor = resolveReplyAuthorForParent(commentAuthorRef.current, replyParent);
    const reply = replyParent && currentMediaKey
      ? buildReplyMarkerFull({
        parent: {
          marker_id: replyParent.marker_id,
          start_sec: replyParent.start_sec,
          end_sec: replyParent.end_sec,
          anchor_sec: replyParent.anchor_sec,
          media_path: currentMediaKey,
          author: replyParent.author,
          content_hash: contentHashRef.current ?? null,
          question_id: replyParent.question_id ?? qid,
        },
        text: replyText,
        author: replyAuthor,
        label: `[answer] ${qid}`.slice(0, 80),
        now,
        // tb_1791837678_26192_1: вердикт = тип маркера (Confirm→★,
        // Reject→✕) — мимо кнопки видно на таймлайне и в Comments.
        kind: verdict,
        playheadSec: playhead,
      })
      : null;
    if (!reply) {
      answerBusyRef.current = false;
      // tb_1791839608_26192_1: честно — ответ НЕ сохранён (было «kept in
      // Comments only», врало: ничего никуда не писалось). С гардом кнопок
      // сюда не попасть из UI, ветка — страховка.
      setContextToast("Answer NOT saved: no question markers for this entry — reimport the playlist.");
      return;
    }
    pushMarkerHistory();
    const updated = [...markersRef.current, reply as PlayerTimeMarker];
    setMarkers(updated);
    const playlist = loadPlaylist();
    const entries = Array.isArray(playlist?.entries) ? playlist.entries as QuestionEntry[] : [];
    const records = answersFromMarkers(updated, {
      resolveLegacyQuestionId: (parentId) =>
        entries.find((e) => e.question_id && parentId.startsWith(materializedMarkerPrefix(e.question_id)))?.question_id,
      choicesOf: (questionId) => {
        const hit = entries.find((e) => e.question_id === questionId);
        return Array.isArray(hit?.choices) ? hit.choices as string[] : undefined;
      },
    });
    setQuestionComment("");
    if (isTauriRuntimeSync()) {
      const playlistPath = readQuestionPlaylistPath();
      if (playlistPath) {
        try {
          const fs = await import("@tauri-apps/plugin-fs");
          const { answersPathFor, parseAnswersFile } = await import("./lib/questionPlaylist");
          const answersPath = answersPathFor(playlistPath);
          // Слияние, не перезапись: легаси 0.25.54 цело («не стирает»).
          let existing: AnswerRecord[] = [];
          try {
            existing = parseAnswersFile(await fs.readTextFile(answersPath));
          } catch {
            // файла ещё нет — выжимка первая
          }
          // tb_1792431205_48582_4: в файле могли остаться чужие ответы
          // (до правки outbox был общим на браузер) — держим только вопросы
          // этого плейлиста и то, что пришло прямо сейчас.
          const ownIds = new Set<string>([
            ...entries.map((e) => e.question_id).filter((x): x is string => !!x),
            ...records.map((r) => r.question_id),
          ]);
          existing = filterAnswersToPlaylist(existing, ownIds);
          await fs.writeTextFile(answersPath, serializeAnswersFile(mergeAnswerRecords(existing, records)));
          recordAnswer();
          setContextToast(`Saved ${ANSWER_BUTTON_LABEL[verdict]} (${verdict}) → ${qid} + reply in Comments.`);
          return;
        } catch {
          answerBusyRef.current = false;
          setContextToast("Answer: could not write answers file.");
          return;
        }
      }
    }
    // Пути плейлиста нет — слияние целиком в аутбокс (та же семантика).
    // tb_1792431205_48582_4: и здесь не тащим чужие плейлисты из старого
    // общего аутбокса — только вопросы этого плейлиста.
    const ownIds = new Set<string>([
      ...entries.map((e) => e.question_id).filter((x): x is string => !!x),
      ...records.map((r) => r.question_id),
    ]);
    writeAnswersOutbox(mergeAnswerRecords(filterAnswersToPlaylist(readAnswersOutbox(), ownIds), records));
    recordAnswer();
    setContextToast(
      isTauriRuntimeSync()
        ? `Saved ${ANSWER_BUTTON_LABEL[verdict]} (${verdict}) → ${qid} locally (open the question playlist from file for answers.json) + reply in Comments.`
        : `Saved ${ANSWER_BUTTON_LABEL[verdict]} (${verdict}) → ${qid} (web outbox) + reply in Comments.`,
    );
  }
  // tb_1791839608_26192_1: гард карточки — ответу нужен маркер-родитель.
  // Без qmat кнопки гаснут (кейс 0.25.57: Confirm молча ничего не создал).
  function questionHasMarkers(qid: string | null | undefined): boolean {
    if (!qid) return false;
    const inId = materializedMarkerId(qid, "in");
    const prefix = materializedMarkerPrefix(qid);
    return mediaMarkers.some((m) => m.marker_id === inId || m.marker_id.startsWith(prefix));
  }
  // tb_1791876286_57716_1: entry/entryIndex — точная запись (сиблинги A/B
  // делят qid, trk-10 — и path+qid). Переданная валидная запись важнее
  // лукапа; иначе resolveActiveEntry: индекс → пара path+qid → qid → путь.
  function activateQuestionFor(path: string, questionId?: string | null, entry?: unknown, entryIndex?: number | null): void {
    try {
      const { entry: hit } = resolveActiveEntry(loadPlaylist()?.entries, {
        entryIndex: entryIndex ?? null,
        entry: entry && typeof entry === "object" ? (entry as { path?: unknown; question_id?: unknown; in_sec?: unknown; out_sec?: unknown }) : null,
        path,
        questionId: questionId ?? null,
      });
      if (!hit || (hit as QuestionPlaylistEntry).question_id === undefined) {
        clearActiveQuestion();
        return;
      }
      const norm = { ...(hit as QuestionEntry), ...normalizeQuestionEntry(hit) } as QuestionEntry;
      setActiveQuestion(norm);
      setQuestionChoice(null);
      setQuestionComment("");
      questionPathRef.current = path;
      questionRangeRef.current =
        norm.in_sec !== undefined && norm.out_sec !== undefined && norm.out_sec > norm.in_sec
          ? { start: norm.in_sec, end: norm.out_sec }
          : null;
    } catch {
      clearActiveQuestion();
    }
  }
  // tb_1791865804_84020_6: смена носителя (handleOpenPath) и переход по
  // маркеру-вопросу — карточка из текущей записи, а не залипание на первой
  // (кейс Beta v01: 28 ответов с question_id=mrg-01). Ввод бережём как
  // follow: недописанный ответ — блок + один тост, а не снос.
  function switchCardToQuestion(path: string, questionId: string | null, entry?: unknown, entryIndex?: number | null): void {
    if (questionComment.trim() !== "" || questionChoice !== null) {
      if (questionId && followBlockedRef.current !== questionId) {
        followBlockedRef.current = questionId;
        setContextToast(`Question ${questionId} is here — finish or clear your input to switch.`);
      }
      return;
    }
    followBlockedRef.current = null;
    activateQuestionFor(path, questionId, entry, entryIndex);
  }
  function toggleInOutPlay(): void {
    const next = !inOutPlayOnRef.current;
    inOutPlayOnRef.current = next;
    setInOutPlayOn(next);
    writeInOutPlayEnabled(next);
    setContextToast(next ? "In–Out Play: on." : "In–Out Play: off.");
  }
  // tb_1791346266_38729_2: единый источник пар — pairInOutRanges
  // (sequential, как движок и экспорт): пилюля, хрон и гард не разъезжаются.
  const inOutRanges = useMemo(() => {
    const { pairs } = pairInOutRanges(
      mediaMarkers
        .filter((m) => m.kind === "in" || m.kind === "out")
        .map((m) => ({ marker_id: m.marker_id, kind: m.kind, anchor_sec: m.anchor_sec })),
    );
    return pairs.map((p) => ({ start: p.start, end: p.end }));
  }, [mediaMarkers]);
  // tb_1791146301_70644_16: хрон селекшна — сумма in-out, пересчёт на каждое
  // изменение маркеров (inOutRanges уже memo от mediaMarkers).
  const selectionSeconds = useMemo(
    () => sumSelectionSeconds(inOutRanges, duration),
    [inOutRanges, duration],
  );

  const timelineTicks = useMemo(() => {
    if (duration <= 0) return [] as { sec: number; label: string; major: boolean }[];
    const fakeKey = geometryTick;
    const wrapEl = progressWrapRef.current;
    const wrapWidth = wrapEl?.getBoundingClientRect().width || 400;
    void fakeKey;
    const minPxPerMajor = 64;
    const idealCount = Math.max(1, Math.floor(wrapWidth / minPxPerMajor));
    const rawInterval = duration / idealCount;
    const niceIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    let interval = niceIntervals.find((n) => n >= rawInterval) || niceIntervals[niceIntervals.length - 1];
    const ticks: { sec: number; label: string; major: boolean }[] = [];
    for (let s = 0; s <= duration; s += interval) {
      ticks.push({ sec: s, label: formatTime(s), major: true });
      if (interval > 1) {
        const minorStep = interval / 2;
        const minor = s + minorStep;
        if (minor <= duration) {
          ticks.push({ sec: minor, label: "", major: false });
        }
      }
    }
    return ticks;
  }, [duration, geometryTick]);

  useEffect(() => {
    const shellNode = shellRef.current;
    const viewerNode = viewerRef.current;
    if (!shellNode && !viewerNode) return;

    const observer = new ResizeObserver(() => {
      setGeometryTick((tick) => tick + 1);
    });

    if (shellNode) observer.observe(shellNode);
    if (viewerNode) observer.observe(viewerNode);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => setGeometryTick((tick) => tick + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // tb_1791172090_2308_6 п.2: транспорт — оверлей поверх низа кадра.
  // Пока он виден, субтитры поднимаются над ним (высота бара + зазор),
  // когда спрятан (фулскрин-автохайд) — возвращаются на базовые 8%.
  useEffect(() => {
    const measure = () => {
      const covered = showTransport && !(isFullscreen && chromeHidden);
      const h = covered ? transportBarRef.current?.offsetHeight ?? 0 : 0;
      setSubtitleLift(h > 0 ? h + 12 : 0);
    };
    measure();
    // Бар монтируется/меняет размер при загрузке медиа — следим за ним,
    // а не только за флагами (иначе замер на пустом маунте даёт 0 навсегда).
    const bar = transportBarRef.current;
    const observer = typeof ResizeObserver !== "undefined" && bar
      ? new ResizeObserver(() => measure())
      : null;
    if (bar && observer) observer.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [showTransport, isFullscreen, chromeHidden, src]);

  // Слайс 5.2: имя медиа в шапку окна; пусто — дефолтный титр со штампом.
  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    const title = src.trim() && fileName ? fileName : defaultWindowTitleRef.current;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().setTitle(title).catch((error) => {
        console.warn("[Mark Player] setTitle failed (needs core:window:allow-set-title):", error);
      });
    }).catch(() => {});
  }, [fileName, src]);

  // Шаг 4/7: двери перепроверяются при смене API base. Клик по missing/
  // error → downloading + перепроверка (скачка+автостарт снаружи).
  useEffect(() => {
    let cancelled = false;
    const base = resolvePlayerLabApiBase(playerLabApiBase);
    void (async () => {
      const next = {} as Record<DoorId, ModuleDoor>;
      for (const id of DOOR_IDS) {
        next[id] = await checkModuleDoor(id, base);
        if (cancelled) return;
        setModuleDoors((prev) => ({ ...prev, [id]: next[id] }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerLabApiBase]);

  // Open-gate: стартовый ?src= шёл мимо всех дверей прямо в <video>.
  useEffect(() => {
    if (!initialQuery.src) return;
    const playability = mediaPlayability(initialQuery.src);
    if (playability === "native") return;
    stopPlaybackForRefusal();
    setSrc("");
    setFileName("Mark Player");
    setMediaKind(null);
    setRefusalToast(mediaRefusalReason(initialQuery.src, playability));
  }, []);

  // tb_1791233024_7043_1: Resume — холодный старт без явного ?src= и только
  // в десктопе (браузерный File-путь переоткрыть нельзя, currentFilePath там
  // всегда null). Файла уже нет — молча чистим запись, обычное пустое окно.
  useEffect(() => {
    const request = resolveResumeRequest(initialQuery.src, readLastOpen());
    if (!request) return;
    if (!isTauriRuntimeSync()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { stat } = await import("@tauri-apps/plugin-fs");
        await stat(request.path);
      } catch {
        if (!cancelled) clearLastOpen();
        return;
      }
      if (cancelled) return;
      resumeSeekRef.current = request;
      await handleOpenPath(request.path);
      if (cancelled) return;
      // Открытие пишет (path, 0) — возвращаем честную позицию: метаданные
      // ещё не загружены, саму перемотку сделает onLoadedMetadata.
      recordPlaybackPositionExact(request.path, request.positionSec);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDoorClick = (id: DoorId) => {    const door = moduleDoors[id];
    const transitioned = doorClickTransition(door);
    if (transitioned === door) return;
    setModuleDoors((prev) => ({ ...prev, [id]: transitioned }));
    const base = resolvePlayerLabApiBase(playerLabApiBase);
    // Перепроверка после запроса скачки: дверь обнаруживает поднявшийся сервер.
    window.setTimeout(() => {
      void checkModuleDoor(id, base).then((checked) => {
        setModuleDoors((prev) =>
          prev[id].status === "downloading" ? { ...prev, [id]: checked } : prev,
        );
      });
    }, 3000);
  };

  const snapshot = useMemo<GeometrySnapshot>(() => {
    const viewerRect = viewerRef.current?.getBoundingClientRect();
    const shellRect = shellRef.current?.getBoundingClientRect();
    const topbarRect = topbarRef.current?.getBoundingClientRect();
    const viewerWidth = Number(viewerRect?.width || 0);
    const viewerHeight = Number(viewerRect?.height || 0);
    const shellWidth = Number(shellRect?.width || 0);
    const shellHeight = Number(shellRect?.height || 0);
    const topbarHeight = Number(topbarRect?.height || 0);
    const displayed = computeDisplayedBox(
      viewerWidth,
      viewerHeight,
      intrinsicSize.width,
      intrinsicSize.height,
    );
    const availableScreen = isTauriRuntimeSync()
      ? getAvailableScreenBounds()
      : {
          availWidth: Math.max(360, Math.floor(window.innerWidth || 360)),
          availHeight: Math.max(240, Math.floor(window.innerHeight || 240)),
        };
    const suggested = suggestShellSize(
      intrinsicSize.width,
      intrinsicSize.height,
      footerReserve,
      Math.floor(availableScreen.availWidth * 0.92),
      Math.floor(availableScreen.availHeight * 0.92),
      isPureMode ? 0 : 2,
      isPureMode ? 0 : 2,
    );
    const review = computeDreamScore({
      windowInnerWidth: Number(window.innerWidth || 0),
      windowInnerHeight: Number(window.innerHeight || 0),
      topbarHeight,
      footerHeight: footerReserve,
      displayedWidth: displayed.displayedWidth,
      displayedHeight: displayed.displayedHeight,
      horizontalLetterboxPx: displayed.horizontalLetterboxPx,
      aspectError: displayed.aspectError,
    });

    return {
      ok: Boolean(viewerWidth > 0 && viewerHeight > 0 && intrinsicSize.width > 0 && intrinsicSize.height > 0),
      reason: intrinsicSize.width > 0 ? undefined : "video_metadata_unavailable",
      fileName: fileName || (sourceKind === "synthetic" ? "Synthetic probe" : "No file loaded"),
      devicePixelRatio: Number(window.devicePixelRatio || 1),
      nativeScaleFactor: null,
      windowInnerWidth: Number(window.innerWidth || 0),
      windowInnerHeight: Number(window.innerHeight || 0),
      nativeInnerLogicalWidth: null,
      nativeInnerLogicalHeight: null,
      nativeOuterLogicalWidth: null,
      nativeOuterLogicalHeight: null,
      nativeInnerPhysicalWidth: null,
      nativeInnerPhysicalHeight: null,
      nativeOuterPhysicalWidth: null,
      nativeOuterPhysicalHeight: null,
      topbarHeight: Number(topbarHeight.toFixed(2)),
      shellWidth: Number(shellWidth.toFixed(2)),
      shellHeight: Number(shellHeight.toFixed(2)),
      viewerWidth: Number(viewerWidth.toFixed(2)),
      viewerHeight: Number(viewerHeight.toFixed(2)),
      footerHeight: footerReserve,
      videoIntrinsicWidth: intrinsicSize.width,
      videoIntrinsicHeight: intrinsicSize.height,
      displayedWidth: displayed.displayedWidth,
      displayedHeight: displayed.displayedHeight,
      horizontalLetterboxPx: displayed.horizontalLetterboxPx,
      verticalLetterboxPx: displayed.verticalLetterboxPx,
      naturalAspectRatio: displayed.naturalAspectRatio,
      viewerAspectRatio: displayed.viewerAspectRatio,
      aspectError: displayed.aspectError,
      suggestedShellWidth: suggested.shellWidth,
      suggestedShellHeight: suggested.shellHeight,
      variant,
      sourceKind,
      dreamScore: review.dreamScore,
      viewerDominanceRatio: review.viewerDominanceRatio,
      chromeRatio: review.chromeRatio,
      previewQualityLabel: previewQualityOption.label,
      previewScale: effectivePreviewScale,
      inVetka: isInVetka,
      markerCount: mediaMarkers.length,
      provisionalEventCount: mediaProvisionalEvents.length,
      favoriteMomentCount,
      commentMomentCount,
      activeContextAction: isInVetka ? "favorite" : "vetka",
    };
  }, [
    commentMomentCount,
    effectivePreviewScale,
    fileName,
    favoriteMomentCount,
    geometryTick,
    isInVetka,
    intrinsicSize.height,
    intrinsicSize.width,
    footerReserve,
    mediaMarkers.length,
    mediaProvisionalEvents.length,
    previewQualityOption.label,
    sourceKind,
    variant,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem("vetka_player_lab_snapshot", JSON.stringify(snapshot));
    } catch {
      // ignore storage errors
    }
  }, [snapshot]);

  // tb_1791754893_1275_4: рамка-лицо прямо сейчас: lerp bbox→bbox_end за
  // in..out («трекинг для бедных»); без скобок/конца — статичный bbox.
  // tb_1791809796_24701_1: вне скобок вопроса рамку не рисуем (Beta: квадратик
  // висел в пустоте). Карточку гейт не трогает — введённый ответ не теряется.
  const questionBoxNow: QuestionBox | null = useMemo(() => {
    const entry = activeQuestion;
    const box = entry?.bbox;
    if (!box || questionPathRef.current !== currentFilePath) return null;
    const end = entry?.bbox_end ?? box;
    const inSec = entry?.in_sec;
    const outSec = entry?.out_sec;
    if (
      typeof inSec === "number" && typeof outSec === "number" &&
      Number.isFinite(inSec) && Number.isFinite(outSec) && outSec > inSec
    ) {
      if (currentTime < inSec || currentTime > outSec) return null;
      return lerpQuestionBox(box, end, (currentTime - inSec) / (outSec - inSec));
    }
    return box;
  }, [activeQuestion, currentFilePath, currentTime]);

  useEffect(() => {
    try {
      localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
    } catch {
      // ignore storage errors
    }
  }, [markers]);

  useEffect(() => {
    // 0.10.26: standalone-панель пишет маркеры в LS напрямую — подхватываем
    // чужие записи. Свои записи storage не ловит (эха нет). Инвариант:
    // main persists после каждого изменения, поэтому replace безопасен.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MARKERS_STORAGE_KEY) return;
      const incoming = resolveExternalMarkers(event.newValue ?? localStorage.getItem(MARKERS_STORAGE_KEY));
      if (incoming) setMarkers(incoming as unknown as PlayerTimeMarker[]);
    };
    window.addEventListener("storage", onStorage);
    // tb_1791654032_27281_1: панель пишет в то же хранилище, но storage
    // между вебвью Tauri не ходит — слушаем markers:reload и перечитываем.
    // tb_1791809796_24701_1: импорт плейлиста тоже пишет напрямую (панель
    // плейлиста) — markers:changed перечитываем так же, иначе шкала пуста,
    // пока видео не переоткроют.
    // tb_1791819024_26192_2: плейлист пересобрали (Clear/импорт) — карточка
    // мёртвой записи гаснет (revalidate). Web: storage чужого документа.
    const onPlaylistStorage = (event: StorageEvent) => {
      if (event.key !== "vetka_player_lab_playlist_v1") return;
      revalidateActiveQuestion();
    };
    window.addEventListener("storage", onPlaylistStorage);
    let unlisten: (() => void) | null = null;
    let unlistenChanged: (() => void) | null = null;
    let unlistenPlaylist: (() => void) | null = null;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) => {
        listen(MARKERS_RELOAD_EVENT, () => {
          setMarkers(readStoredMarkers());
        }).then((fn) => { unlisten = fn; }).catch(() => {});
        listen(MARKERS_CHANGED_EVENT, () => {
          setMarkers(readStoredMarkers());
        }).then((fn) => { unlistenChanged = fn; }).catch(() => {});
        listen(PLAYLIST_RELOAD_EVENT, () => {
          revalidateActiveQuestion();
        }).then((fn) => { unlistenPlaylist = fn; }).catch(() => {});
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("storage", onPlaylistStorage);
      unlisten?.();
      unlistenChanged?.();
      unlistenPlaylist?.();
    };
  }, []);

  // tb_1791663832_27409_5: переключили видео — открытое окно Markers
  // перецеливаем событием (без фокуса: Rust location.replace крадёт).
  // Окна может не быть — notify best-effort.
  useEffect(() => {
    notifyMediaChanged({ mediaKey: currentMediaKey, contentHash });
  }, [currentMediaKey, contentHash]);

  useEffect(() => {
    const srtMarkers = markers
      .filter((m) => markerBelongsToMedia(m, mediaIdentity))
      .map((m) => ({
        marker_id: m.marker_id,
        kind: m.kind,
        start_sec: m.start_sec,
        end_sec: m.end_sec,
        anchor_sec: m.anchor_sec,
        label: m.label,
        text: m.text,
        // tb_1791583578_64923_1: автор в 3-й сегмент (пустой — как раньше).
        author: m.author,
        // tb_1791585558_31907_1: ссылка ответа (экспорт вернёт ↳ <id>: в текст).
        reply_to: m.reply_to,
        media_path: m.media_path,
      }));
    setSrtContent(exportMarkersToSrtV2(srtMarkers));
  }, [markers, currentMediaKey, contentHash]);

  useEffect(() => {
    try {
      localStorage.setItem(PROVISIONAL_EVENTS_STORAGE_KEY, JSON.stringify(provisionalEvents));
    } catch {
      // ignore storage errors
    }
  }, [provisionalEvents]);

  useEffect(() => {
    try {
      localStorage.setItem(VETKA_STATUS_STORAGE_KEY, JSON.stringify(vetkaStatusMap));
    } catch {
      // ignore storage errors
    }
  }, [vetkaStatusMap]);

  useEffect(() => {
    const key = `${src}|${snapshot.videoIntrinsicWidth}x${snapshot.videoIntrinsicHeight}`;
    if (!snapshot.ok) return;
    if (!src && sourceKind !== "synthetic") return;
    if (isFullscreen || fsTransition) return;
    if (autoSizedKeyRef.current === key) return;

    const next = {
      width: snapshot.suggestedShellWidth,
      height: snapshot.suggestedShellHeight,
    };
    autoSizedKeyRef.current = key;
    setShellSizeOverride(next);
    void configurePlayerWindow(next.width, next.height, snapshot.videoIntrinsicWidth, snapshot.videoIntrinsicHeight);
  }, [
    snapshot.ok,
    snapshot.suggestedShellHeight,
    snapshot.suggestedShellWidth,
    snapshot.videoIntrinsicHeight,
    snapshot.videoIntrinsicWidth,
    sourceKind,
    src,
    isFullscreen,
    fsTransition,
  ]);

  useEffect(() => {
    if (!initialQuery.applySuggestedShell) return;
    if (!snapshot.ok) return;
    setShellSizeOverride({
      width: snapshot.suggestedShellWidth,
      height: snapshot.suggestedShellHeight,
    });
  }, [initialQuery.applySuggestedShell, snapshot.ok, snapshot.suggestedShellHeight, snapshot.suggestedShellWidth]);

  const addMomentMarkerRef = useRef(addMomentMarker);
  addMomentMarkerRef.current = addMomentMarker;
  const openCommentsPanelRef = useRef(openCommentsPanel);
  openCommentsPanelRef.current = openCommentsPanel;
  // tb_1791143015_70644_7: тумблер In–Out Play из keydown (S) — тем же
  // ref-паттерном, замыкание эффекта stale.
  const toggleInOutPlayRef = useRef(toggleInOutPlay);
  toggleInOutPlayRef.current = toggleInOutPlay;
  // Фикс залипания прыжков 27.09: keydown-эффект висит на
  // [duration, previewQuality] — markers/mediaKey там всегда stale
  // (см. комментарий у probeFpsRef выше). Зеркалим тем же паттерном,
  // позицию берём из живого video.currentTime.
  const markersRef = useRef(markers);
  markersRef.current = markers;
  // 0.20: undo/redo истории маркеров. Стек живёт в ref (не в state —
  // перерендер на каждый push не нужен); "текущим" для future служит
  // markersRef. Чужие записи из storage-событий стек не пушат: last-writer-wins.
  const markerHistoryRef = useRef(createMarkerHistory<PlayerTimeMarker>());
  const performUndoRef = useRef(() => {});
  const performRedoRef = useRef(() => {});
  const currentMediaKeyRef = useRef(currentMediaKey);
  currentMediaKeyRef.current = currentMediaKey;
  // 0.22: зеркало хеша + токен stale-защиты: хеш считается асинхронно,
  // открытие второго файла до готовности первого — чужой хеш не садится.
  const contentHashRef = useRef<string | null>(null);
  const contentHashTokenRef = useRef(0);
  // 0.10.29: зеркала fps для stale-замыканий (тот же паттерн, что выше).
  probeFpsRef.current = probeResult?.fps && probeResult.fps > 0 ? probeResult.fps : null;
  estimatedFpsRef.current = estimatedFps;
  containerFpsRef.current = containerFps;
  // tb_1791583578_64923_1: подпись новых маркеров (имя macOS / запомненное).
  // Синхронный сид из LS; Tauri-имя пользователя подтягивается эффектом ниже.
  const commentAuthorRef = useRef<string>(loadCommentAuthorName());

  useEffect(() => {
    // Имя пользователя macOS — дефолт подписи (пассивно, без полей в UI).
    // Не Tauri / invoke упал — честно пусто, подпись как раньше отсутствует.
    if (!isTauriRuntimeSync()) return;
    if (loadCommentAuthorName()) return;
    let alive = true;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("os_username"))
      .then((name) => {
        if (!alive) return;
        const clean = typeof name === "string" ? name.trim().slice(0, 64) : "";
        if (clean) commentAuthorRef.current = clean;
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const reverse = new ReverseShuttle(
      () => videoRef.current?.currentTime ?? 0,
      (t) => {
        if (videoRef.current) videoRef.current.currentTime = t;
        setCurrentTime(t);
      },
    );
    let shuttleLevel = 0;
    const setShuttle = (next: number) => {
      shuttleLevel = Math.max(-3, Math.min(3, next));
      setShuttleLevel(shuttleLevel);
      const video = videoRef.current;
      if (!video) return;
      if (shuttleLevel === 0) {
        reverse.stop();
        video.playbackRate = 1;
        video.pause();
        return;
      }
      if (shuttleLevel < 0) {
        video.pause();
        reverse.start(-shuttleLevel);
        return;
      }
      reverse.stop();
      video.playbackRate = shuttleLevel;
      void video.play();
    };
    stopShuttleRef.current = () => setShuttle(0);
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolvePlayerHotkey(event);
      if (!action) return;
      const video = videoRef.current;
      // 0.10.29: честный покадровый шаг — fps-цепочка container → probe → rVFC → 25.
      // seekBy (боковые зоны) намеренно остаётся на duration/100: это грубая
      // перемотка по дизайну, а не покадровая.
      const frameStep = resolveFrameStepSeconds({
        containerFps: containerFpsRef.current,
        probeFps: probeFpsRef.current,
        estimatedFps: estimatedFpsRef.current,
      });
      switch (action) {
        case "toggleDebug":
          event.preventDefault();
          setIsDebugVisible((value) => !value);
          break;
        case "toggleFullscreen":
          event.preventDefault();
          beginFullscreenTransition();
          void toggleFullscreen();
          break;
        case "cycleQuality": {
          const currentIndex = PREVIEW_QUALITY_OPTIONS.findIndex((option) => option.key === previewQuality);
          const nextOption = PREVIEW_QUALITY_OPTIONS[(currentIndex + 1) % PREVIEW_QUALITY_OPTIONS.length];
          setPreviewQuality(nextOption.key);
          break;
        }
        case "playPause":
          if (!video) break;
          event.preventDefault();
          if (shuttleLevel !== 0) {
            setShuttle(0);
            break;
          }
          if (video.paused) {
            void video.play();
          } else {
            video.pause();
          }
          break;
        case "frameStepBack":
          if (!video) break;
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - frameStep);
          markManualSeek();
          break;
        case "frameStepForward":
          if (!video) break;
          event.preventDefault();
          video.currentTime = Math.min(duration || video.duration || 0, video.currentTime + frameStep);
          markManualSeek();
          break;
        case "proportionalStepBack": {
          if (!video) break;
          event.preventDefault();
          const step = resolveProportionalStep(duration || video.duration || 0);
          video.currentTime = Math.max(0, video.currentTime - step);
          markManualSeek();
          break;
        }
        case "proportionalStepForward": {
          if (!video) break;
          event.preventDefault();
          const step = resolveProportionalStep(duration || video.duration || 0);
          video.currentTime = Math.min(duration || video.duration || 0, video.currentTime + step);
          markManualSeek();
          break;
        }
        case "jumpPrevMarker":
        case "jumpNextMarker": {
          if (!video) break;
          event.preventDefault();
          const scoped = markersRef.current
            // 0.22: прыжки — по той же identity, что таймлайн.
            .filter((m) => markerBelongsToMedia(m, { mediaKey: currentMediaKeyRef.current, contentHash: contentHashRef.current }));
          const target = resolveJumpTarget(scoped.map((m) => m.anchor_sec), video.currentTime, action === "jumpPrevMarker" ? -1 : 1);
          if (target !== undefined) {
            // tb_1791860202_84020_2: прыжок из play — сначала пауза (как в
            // Premiere), иначе плейхед дёргается между play и seek.
            pauseBeforeMarkerJump(video);
            video.currentTime = target;
            markManualSeek();
            // tb_1791865804_84020_6: приземлились на маркер-вопрос — карточка
            // из текущей записи (target — элемент массива, равенство точное).
            const landed = scoped.find((m) => m.anchor_sec === target);
            const landedQid = typeof landed?.question_id === "string" && landed.question_id ? landed.question_id : null;
            if (landedQid) {
              const p = currentFilePathRef.current;
              if (p) switchCardToQuestion(p, landedQid);
            }
          }
          break;
        }
        case "volumeUp":
          event.preventDefault();
          syncVolume((video?.volume ?? 1) + VOLUME_STEP, false);
          setShowTransport(true);
          break;
        case "volumeDown":
          event.preventDefault();
          syncVolume((video?.volume ?? 1) - VOLUME_STEP, false);
          setShowTransport(true);
          break;
        case "goToStart":
          if (!video) break;
          event.preventDefault();
          video.currentTime = 0;
          markManualSeek();
          break;
        case "goToEnd":
          if (!video) break;
          event.preventDefault();
          video.currentTime = video.duration || 0;
          markManualSeek();
          break;
        case "playBack":
          if (!video) break;
          event.preventDefault();
          setShuttle(shuttleLevel <= 0 ? shuttleLevel - 1 : -1);
          break;
        case "stop":
          if (!video) break;
          event.preventDefault();
          setShuttle(0);
          break;
        case "playForward":
          if (!video) break;
          event.preventDefault();
          setShuttle(shuttleLevel >= 0 ? shuttleLevel + 1 : 1);
          break;
        case "markIn":
          event.preventDefault();
          addMomentMarkerRef.current("in");
          break;
        case "markOut":
          event.preventDefault();
          addMomentMarkerRef.current("out");
          break;
        case "addFavoriteMarker":
          event.preventDefault();
          addMomentMarkerRef.current("favorite");
          break;
        case "addNegativeMarker":
          event.preventDefault();
          addMomentMarkerRef.current("negative");
          break;
        case "addCommentMarker":
          event.preventDefault();
          openCommentsPanelRef.current("comment");
          break;
        case "inOutPlayToggle":
          event.preventDefault();
          toggleInOutPlayRef.current();
          break;
        case "undo":
          event.preventDefault();
          performUndoRef.current();
          break;
        case "redo":
          event.preventDefault();
          performRedoRef.current();
          break;
        case "exitFullscreen": {
          event.preventDefault();
          beginFullscreenTransition();
          if (isTauriRuntimeSync()) {
            void (async () => {
              try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const win = getCurrentWindow();
                if (await win.isFullscreen()) await win.setFullscreen(false);
              } catch { /* ignore */ }
            })();
          } else if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      reverse.stop();
    };
  }, [duration, previewQuality]);

  useEffect(() => {
    if (!src) {
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setShuttleLevel(0);
      stopShuttleRef.current();
      setShowTransport(true);
      return;
    }
    const video = videoRef.current;
    if (video) {
      void video.play().catch(() => {});
    }
  }, [src]);

  // 0.10.29 (Шаг 3): гасим pending-одиночный при размонтировании.
  useEffect(() => () => videoClickCtlRef.current?.dispose(), []);

  // 0.10.29: rVFC-калибровка fps (UPD 13): 50 сэмплов на rate=1,
  // fps = n/Σ. Без поддержки в WebKit — молча остаёмся на probe/25.
  useEffect(() => {
    setEstimatedFps(null);
    const video = videoRef.current;
    if (!src || !video || !hasRequestVideoFrameCallback(video)) return;
    type RvfcVideo = HTMLVideoElement & {
      requestVideoFrameCallback: (
        cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void,
      ) => number;
    };
    const rvfc = video as RvfcVideo;
    let alive = true;
    const calibrator = createFrameCalibrator((fps) => {
      if (alive) setEstimatedFps(fps);
    });
    const loop = (_now: number, meta: { mediaTime: number; presentedFrames: number }) => {
      if (!alive || calibrator.done) return;
      calibrator.pushSample(meta.mediaTime, meta.presentedFrames, video.playbackRate);
      if (!calibrator.done) rvfc.requestVideoFrameCallback(loop);
    };
    rvfc.requestVideoFrameCallback(loop);
    return () => {
      alive = false;
    };
  }, [src]);

  // tb_1790752061_6128_1: fps из заголовка контейнера (moov mdhd+stts) —
  // голова/хвост по Range, мимо сети — молча null, цепочка падает дальше.
  useEffect(() => {
    setContainerFps(null);
    if (!src) return;
    let alive = true;
    loadContainerFps(src).then((r) => {
      if (alive) setContainerFps(r ? r.fps : null);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  // tb_1790710861_12931_16: тихая проверка обновлений при старте — тост,
  // только если обновление нашлось; сеть и «всё свежо» молчат. Только
  // главное окно (панели — те же бандлы, свой чек не нужен), с задержкой,
  // чтобы не мешать открытию видео.
  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          if (getCurrentWindow().label !== "main") return;
        } catch {
          return;
        }
        if (alive) await checkForUpdatesSilent(updaterDeps());
      })();
    }, 10000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  // 0.10.29: тачпад двумя пальцами — горизонталь = покадровый скраб,
  // вертикаль = громкость (троттлинг 50мс). Нативный listener с
  // passive:false: React вешает wheel как passive, preventDefault бы игнорил.
  useEffect(() => {
    const node = viewerRef.current;
    const video = videoRef.current;
    if (!node || !video) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const frameStep = resolveFrameStepSeconds({
        containerFps,
        probeFps: probeResult?.fps && probeResult.fps > 0 ? probeResult.fps : null,
        estimatedFps,
      });
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        const dir = event.deltaX > 0 ? 1 : -1;
        const limit = duration || video.duration || 0;
        video.currentTime = Math.min(limit, Math.max(0, video.currentTime + dir * frameStep));
        // tb_1791843935_63972_2: покадровый скраб — навигация, ножницы молчат.
        markManualSeek();
      } else {
        const now = performance.now();
        if (now - wheelVolumeAtRef.current < 50) return;
        wheelVolumeAtRef.current = now;
        const dir = event.deltaY > 0 ? -1 : 1;
        syncVolume((video.volume ?? 1) + dir * VOLUME_STEP, false);
      }
      setShowTransport(true);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
    };
  }, [src, duration, probeResult, estimatedFps, containerFps]);

  useEffect(() => {
    if (transportTimerRef.current) {
      window.clearTimeout(transportTimerRef.current);
      transportTimerRef.current = null;
    }
    if (!isMoving || isDebugVisible) {
      setShowTransport(true);
      return;
    }
    // tb_1791675182_1275_1: корень залипа — таймер гасил панель при stall
    // (isMoving висит, тиков нет: probe/attach, fetch→blob прокси,
    // 4K-буфер), а показать её обратно было некому. Прячем, только если
    // время реально ушло вперёд с момента взвода.
    hideArmedAtRef.current = Number(videoRef.current?.currentTime ?? currentTime ?? NaN);
    transportTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (shouldHideTransport({
        armedTime: hideArmedAtRef.current,
        firedTime: Number(video?.currentTime ?? NaN),
        paused: video?.paused ?? true,
        ended: video?.ended ?? true,
      })) setShowTransport(false);
    }, 1800);
    return () => {
      if (transportTimerRef.current) {
        window.clearTimeout(transportTimerRef.current);
        transportTimerRef.current = null;
      }
    };
  }, [isDebugVisible, isMoving, currentTime]);

  // tb_1791679886_1275_2: синк зеркал зонда uiState — без deps, каждый рендер.
  useEffect(() => {
    showTransportMirrorRef.current = showTransport;
    chromeHiddenMirrorRef.current = chromeHidden;
    isMovingMirrorRef.current = isMoving;
    mediaKindMirrorRef.current = mediaKind;
    hasSrcMirrorRef.current = src.length > 0;
    fileNameMirrorRef.current = fileName;
  });

  // tb_1791680717_1275_3: кольцо переходов тулбара — пишет только смены
  // (deps), последние 30, файл только basename. Открытие инспектора само
  // пишет запись (isDebugVisible форсит show) — история ДО не сгорает.
  useEffect(() => {
    const entry: TransportTraceEntry = {
      ts: Math.round(performance.now()),
      show: showTransport,
      chrome: chromeHidden,
      moving: isMoving,
      kind: mediaKind,
      file: fileName,
      mode: (() => {
        try {
          const m = loadPlaybackMode();
          return `${m.shuffle ? "S" : "s"}${m.loop}`;
        } catch {
          return undefined;
        }
      })(),
    };
    setTransportTrace((prev) => {
      // tb_1791683106_1275_5: дедуп подряд идущих идентичных (двойной эффект).
      const last = prev[prev.length - 1];
      if (
        last &&
        last.show === entry.show &&
        last.chrome === entry.chrome &&
        last.moving === entry.moving &&
        last.kind === entry.kind &&
        last.file === entry.file &&
        last.mode === entry.mode
      ) {
        return prev;
      }
      return pushTransportTrace(prev, entry);
    });
  }, [showTransport, chromeHidden, isMoving, mediaKind, fileName]);

  // 0.12 слайс: автоскрытие хрома ТОЛЬКО в фулскрине. Вход — спрятать сразу,
  // движение мыши — показать + рестарт 2с, выход — показать и забыть.
  // Оконный режим не трогаем: тулбары висят всегда (плеер для маркирования).
  useEffect(() => {
    if (chromeTimerRef.current) {
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = null;
    }
    if (!isFullscreen) {
      setChromeHidden(false);
      return;
    }
    setChromeHidden(true);
    const poke = () => {
      setChromeHidden(false);
      if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = window.setTimeout(() => {
        setChromeHidden(true);
      }, FULLSCREEN_CHROME_TIMEOUT_MS);
    };
    window.addEventListener("mousemove", poke);
    return () => {
      window.removeEventListener("mousemove", poke);
      if (chromeTimerRef.current) {
        window.clearTimeout(chromeTimerRef.current);
        chromeTimerRef.current = null;
      }
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!contextToast) return;
    // tb_1791837678_26192_1: 6.5с — 2.2с не прочитать (оператор).
    const timer = window.setTimeout(() => setContextToast(""), 6500);
    return () => window.clearTimeout(timer);
  }, [contextToast]);

  useEffect(() => {
    if (!vetkaToast) return;
    const timer = window.setTimeout(() => setVetkaToast(""), VETKA_PROMO_MS);
    return () => window.clearTimeout(timer);
  }, [vetkaToast]);

  useEffect(() => {
    if (!refusalToast) return;
    const timer = window.setTimeout(() => setRefusalToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [refusalToast]);

  useEffect(() => {
    if (!draggingMarkerId) return;
    const wrap = progressWrapRef.current;
    if (!wrap) return;
    const onMouseMove = (e: MouseEvent) => {
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, x / rect.width));
      const newTime = fraction * Math.max(duration, 0.001);
      setMarkers((prev) =>
        prev.map((m) =>
          m.marker_id === draggingMarkerId
            ? { ...m, start_sec: Math.max(0, Number((newTime - 0.5).toFixed(2))), anchor_sec: Number(newTime.toFixed(2)), end_sec: Number((newTime + 0.5).toFixed(2)) }
            : m,
        ),
      );
    };
    const onMouseUp = () => setDraggingMarkerId(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [draggingMarkerId, duration]);

  useEffect(() => {
    const api = {
      snapshot: () => snapshot,
      print: () => {
        console.info("MARKER_168.VIDEOPLAYER.LAB.SNAPSHOT", snapshot);
        return snapshot;
      },
      markers: () => markers,
      provisionalEvents: () => provisionalEvents,
      setVariant: (next: ShellVariant) => setVariant(next),
      setSyntheticSize: (width: number, height: number) => {
        setSyntheticSize({
          width: Math.max(0, Math.floor(width)),
          height: Math.max(0, Math.floor(height)),
        });
        setNaturalSize({ width: 0, height: 0 });
        setMediaKind(null);
        setSrc("");
        setFileName("Synthetic probe");
        autoSizedKeyRef.current = "";
      },
      setPreviewQuality: (quality: PreviewQualityKey) => setPreviewQuality(quality),
      setInVetka: (next: boolean) => {
        if (!currentMediaKey) return;
        setVetkaStatusMap((prev) => ({ ...prev, [currentMediaKey]: next }));
      },
      addMomentMarker: (kind: PlayerMarkerKind = "favorite", text = "") => addMomentMarker(kind, text),
      applySuggestedShell: () => {
        const next = {
          width: snapshot.suggestedShellWidth,
          height: snapshot.suggestedShellHeight,
        };
        setShellSizeOverride(next);
        void configurePlayerWindow(next.width, next.height, snapshot.videoIntrinsicWidth, snapshot.videoIntrinsicHeight);
        return { ...snapshot, shellWidth: next.width, shellHeight: next.height };
      },
      resetShell: () => {
        setShellSizeOverride(null);
        autoSizedKeyRef.current = "";
      },
      toggleDebug: () => setIsDebugVisible((value) => !value),
      toggleFullscreen: () => toggleFullscreen(),
      fullscreenTrace: () => fsTraceRef.current,
      // tb_1791679886_1275_2: зонд видимости тулбаров — читает зеркала
      // (свежие на каждый рендер) + живой DOM в момент вызова.
      uiState: (): TransportUiState => {
        const readOpacity = (selector: string): string | null => {
          try {
            const el = document.querySelector(selector);
            return el ? getComputedStyle(el).opacity : null;
          } catch {
            return null;
          }
        };
        const readRect = (selector: string) => {
          try {
            const el = document.querySelector(selector);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x * 10) / 10,
              y: Math.round(r.y * 10) / 10,
              w: Math.round(r.width * 10) / 10,
              h: Math.round(r.height * 10) / 10,
            };
          } catch {
            return null;
          }
        };
        const video = videoRef.current;
        return {
          appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
          showTransport: showTransportMirrorRef.current,
          chromeHidden: chromeHiddenMirrorRef.current,
          isFullscreen: isFullscreenRef.current,
          isMoving: isMovingMirrorRef.current,
          mediaKind: mediaKindMirrorRef.current,
          hasSrc: hasSrcMirrorRef.current,
          file: fileNameMirrorRef.current,
          video: video
            ? {
              paused: video.paused,
              ended: video.ended,
              t: Math.round(video.currentTime * 100) / 100,
              d: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : -1,
            }
            : null,
          dockOpacity: readOpacity(".topbar-dock"),
          dockRect: readRect(".topbar-dock"),
          overlayMounted: document.querySelector(".transport-overlay") !== null,
          overlayOpacity: readOpacity(".transport-overlay"),
          barRect: readRect(".transport-bar"),
        };
      },
      isTauri: () => isTauriRuntimeSync(),
      openFile: () => handleOpenClick().then(() => fileName),
      getFileName: () => fileName,
      getNativeDialogAvailable: () => isTauriRuntimeSync(),
      probe: () => probeResult,
      getPlaylist: () => loadPlaylist(),
      importSubtitlesText: (text: string, mediaPath?: string) =>
        importSubtitleText(text, "test.srt", mediaPath ?? currentFilePath ?? currentMediaKey ?? null),
      // tb_1791333803_37784_1: превью листа — тот же путь, что меню-диалог.
      openCutsheetText: (text: string, sheetPath: string) => openCutsheetText(text, sheetPath),
      closeCutsheetPreview: () => {
        clearCutsheetPreview();
        return true;
      },      setSubtitlesVisible: (visible: boolean) => setSubtitlesVisible(visible),
      getSubtitleCues: () => activeSubtitleTrack?.cues ?? [],
      // tb_1791233033_7043_2: манифест агента. api — по факту (дрейф имён
      // исключён), testid-статика — в lib/uiManifest (покрыта unit-тестами).
      manifest: () => buildUIManifest(
        typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
        Object.keys(api).sort(),
      ),
    };
    window.vetkaPlayerLab = api;
    return () => {
      if (window.vetkaPlayerLab === api) delete window.vetkaPlayerLab;
    };
  }, [currentMediaKey, currentFilePath, subStore, markers, provisionalEvents, snapshot]);

  const menuHandlersRef = useRef({
    onOpen: () => { void handleOpenClick(); },
    onUndo: () => {},
    onRedo: () => {},
    onImportMarkersJson: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        void file.text().then(async (text) => {
          try {
            const parsed: unknown = JSON.parse(text);
            const imported = Array.isArray(parsed)
              ? parsed
              : (parsed !== null && typeof parsed === "object" &&
                "markers" in parsed &&
                Array.isArray((parsed as { markers: unknown }).markers)
                ? (parsed as { markers: unknown[] }).markers
                : []);
            if (!imported.length) { setContextToast("Markers JSON: file has no markers."); return; }
            // tb_1791854416_63972_5: файл везёт видео — SOS пишет media_path +
            // content_hash, раньше импорт их игнорировал и клал маркеры на
            // текущее видео (без видео — в пустоту). Открываем видео файла,
            // затем маркеры; голый массив без привязки — как раньше.
            const binding = readSidecarBinding(parsed);
            const target = decideMarkersImportTarget(binding, currentFilePathRef.current, isTauriRuntimeSync());
            let openedBase: string | null = null;
            if (target.mode === "open") {
              await handleOpenPath(target.path);
              openedBase = target.path.split(/[\\/]/).pop() || target.path;
            } else if (target.mode === "need-video") {
              setContextToast("Markers JSON: open a video first to attach markers.");
              return;
            }
            const media = currentMediaKeyRef.current;
            if (!media) { setContextToast("Markers JSON: open a video first to attach markers."); return; }
            const hash = contentHashRef.current ?? binding.contentHash;
            const playhead = Math.max(0, Number(videoRef.current?.currentTime ?? 0));
            const seen = new Set(markersRef.current.map((m) => m.marker_id));
            const added: PlayerTimeMarker[] = [];
            let dupes = 0;
            const now = new Date().toISOString();
            for (const m of imported) {
              // tb_1791146800_70644_20: нормализация в чистом модуле (тест round-trip).
              const norm = normalizeImportedMarker(m);
              if (!norm) continue;
              const raw = m as Record<string, unknown>;
              // id из файла сохраняем (цепочки reply_to/question_id целы
              // при round-trip); повторный импорт тех же id — пропускаем.
              const rawId = typeof raw.marker_id === "string" && raw.marker_id ? raw.marker_id : createMarkerId();
              if (seen.has(rawId)) { dupes += 1; continue; }
              seen.add(rawId);
              const rawLabel = typeof raw.label === "string" ? raw.label.trim().slice(0, 64) : "";
              const anchor = norm.anchorSec ?? playhead;
              added.push({
                marker_id: rawId,
                schema_version: "cut_time_marker_v1",
                project_id: "cut_demo",
                timeline_id: "main",
                media_path: media,
                content_hash: hash,
                kind: norm.kind,
                start_sec: norm.startSec ?? anchor - 0.5,
                end_sec: norm.endSec ?? anchor + 0.5,
                anchor_sec: anchor,
                score: norm.kind === "favorite" ? 0.85 : 0.6,
                label: rawLabel || defaultMarkerLabel(norm.kind),
                text: norm.text,
                // tb_1791583578_64923_1: автор из файла (agent:<роль>) едет
                // в маркер, иначе подпись текущего подписанта.
                author: norm.author ?? commentAuthorRef.current,
                context_slice: null,
                cam_payload: null,
                chat_thread_id: null,
                comment_thread_id: null,
                source_engine: "player_lab",
                // tb_1791585558_31907_1: ссылка ответа.
                ...(norm.reply_to ? { reply_to: norm.reply_to } : {}),
                // tb_1791809796_24701_1: id вопроса (выжимка ответов).
                ...(norm.question_id ? { question_id: norm.question_id } : {}),
                created_at: now,
                updated_at: now,
              });
            }
            if (added.length) {
              pushMarkerHistory();
              setMarkers((prev) => [...prev, ...added]);
              const dupNote = dupes ? ` (${dupes} already present)` : "";
              const openNote = openedBase ? ` Opened ${openedBase}.` : "";
              setContextToast(`Markers imported: ${added.length}${dupNote}.${openNote}`);
            } else if (dupes) {
              setContextToast(`Nothing new: ${dupes} marker${dupes === 1 ? "" : "s"} already present.`);
            } else {
              setContextToast("Markers JSON: open a video first to attach markers.");
            }
          } catch {
            setContextToast("Markers JSON: could not read the file.");
          }
        });
      };
      input.click();
    },
    onExportSrt: () => {
      void performExportSrt();
    },
    onExportJson: () => {
      void performExportJson();
    },
    onExportXml: () => {
      void performExportXml();
    },
    onExportPlaylistXml: () => {
      void performExportPlaylistXml();
    },
    onExportPlaylistReviewNotes: () => {
      void performExportPlaylistReviewNotes();
    },
    onExportPlaylistVisualNotes: () => {
      void performExportPlaylistVisualNotes();
    },
    onExportPlaylistJson: () => {
      void performExportPlaylistJson();
    },
    onExportPlaylistSrt: () => {
      void performExportPlaylistSrt();
    },
    onExportPlaylistEdl: () => {
      void performExportPlaylistEdl();
    },
    onExportPlaylistEditorPackage: () => {
      void performExportPlaylistEditorPackage();
    },
    onExportReviewNotes: () => {
      void performExportReviewNotes();
    },
    onExportVisualNotes: () => {
      void performExportVisualNotes();
    },
    onSendEditorPackage: () => {
      void performSendEditorPackage();
    },
    onImportSrt: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".srt,.txt";
      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        file.text().then((text) => {
          if (text.includes("-->")) {
            setSrtContent(text);
            setContextToast("SRT imported.");
          }
        });
      };
      input.click();
    },
  });
  menuHandlersRef.current.onOpen = () => { void handleOpenClick(); };

  // 0.20: undo/redo. Push — снимок "до" каждой ЛОКАЛЬНОЙ мутации маркеров
  // (создание/удаление/старт перетаскивания/импорт). Перетаскивание пушит
  // один раз на mousedown, а не на каждый mousemove. Persist-эффект пишет
  // LS после setMarkers — окно комментов подхватывает откат само.
  function pushMarkerHistory(): void {
    markerHistoryRef.current = historyPush(markerHistoryRef.current, markersRef.current);
  }
  function performUndo(): void {
    const undone = historyUndo(markerHistoryRef.current, markersRef.current);
    if (!undone) { setContextToast("Nothing to undo."); return; }
    markerHistoryRef.current = undone.history;
    setMarkers(undone.snapshot);
  }
  function performRedo(): void {
    const redone = historyRedo(markerHistoryRef.current, markersRef.current);
    if (!redone) { setContextToast("Nothing to redo."); return; }
    markerHistoryRef.current = redone.history;
    setMarkers(redone.snapshot);
  }
  function deleteMarkerById(markerId: string): void {
    pushMarkerHistory();
    setMarkers((prev) => prev.filter((m) => m.marker_id !== markerId));
    setContextToast("Marker deleted.");
  }
  function beginMarkerDrag(markerId: string): void {
    pushMarkerHistory();
    setDraggingMarkerId(markerId);
  }
  // tb_1791844731_63972_4: плейхед-вертикаль — единый слой указателя (§3.2).
  // Сик одним трактом: факт в video + setSeekTarget; ручной — с меткой
  // markManualSeek (ножницы молчат 800мс, как мосты markers:seek).
  // tb_1792441299_49541_7: scrub-preview снимаем, когда декодер догнал
  // запрошенную точку (onSeeked), либо страховочным таймаутом.
  function clearScrubPreview(): void {
    if (scrubClearTimerRef.current !== null) {
      clearTimeout(scrubClearTimerRef.current);
      scrubClearTimerRef.current = null;
    }
    scrubbingRef.current = false;
    scrubPreviewRef.current = null;
    setScrubPreview(null);
  }
  function showScrubPreview(target: number): void {
    // Новая протяжка отменяет страховочный таймаут прошлой — иначе он
    // погасил бы preview прямо посреди drag.
    if (scrubClearTimerRef.current !== null) {
      clearTimeout(scrubClearTimerRef.current);
      scrubClearTimerRef.current = null;
    }
    scrubPreviewRef.current = target;
    setScrubPreview(target);
  }
  function issueScrubSeek(target: number): void {
    // tb_1792443862_5828_1: ровно один сик — на отпускании. Если цель уже
    // совпала с фактической позицией (клик по шкале в текущей точке),
    // не дёргаем декодер зря.
    const video = videoRef.current;
    const actual = video && Number.isFinite(video.currentTime) ? video.currentTime : null;
    if (actual !== null && Math.abs(target - actual) < 0.02) return;
    seekTransportTo(target, true, true);
  }
  function finishScrubPreview(target: number): void {
    issueScrubSeek(target);
    scrubbingRef.current = false;
    showScrubPreview(target);
    if (scrubClearTimerRef.current !== null) clearTimeout(scrubClearTimerRef.current);
    scrubClearTimerRef.current = setTimeout(() => {
      scrubClearTimerRef.current = null;
      scrubPreviewRef.current = null;
      setScrubPreview(null);
    }, SCRUB_PREVIEW_TIMEOUT_MS);
  }
  function seekTransportTo(sec: number, manual: boolean, scrub = false): void {
    if (!Number.isFinite(sec) || sec < 0) return;
    // Любой не-скрабовый сик (клавиши, маркер, плейлист) отменяет preview.
    if (!scrub && !scrubbingRef.current) clearScrubPreview();
    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = sec;
      } catch {
        // ignore — останется внешнее
      }
    }
    setSeekTarget(sec);
    if (manual) markManualSeek();
  }
  // Значки для hitTest — из тех же mediaMarkers, что отрисованы: центры по
  // anchor_sec, полуширина по CSS (.transport-marker 21px, скобки ~16px).
  function timelineHitMarkers(rectWidth: number): PlayheadHitMarker[] {
    const span = Math.max(duration, 0.001);
    return mediaMarkers.map((m) => ({
      id: m.marker_id,
      x: (m.anchor_sec / span) * rectWidth,
      halfWidth: m.kind === "in" || m.kind === "out" ? 8 : 10.5,
    }));
  }
  function resolveTimelineRow(target: EventTarget | null): "ruler" | "lane" {
    const el = target as HTMLElement | null;
    return el && typeof el.closest === "function" && el.closest(".time-ruler") ? "ruler" : "lane";
  }
  // Один mousedown на весь transport-progress-wrap: hitTest решает, кого
  // хватаем. У значков своих onMouseDown больше нет (только dblclick).
  function handleTimelinePress(e: ReactMouseEvent): void {
    if (e.button !== 0 || duration <= 0) return;
    const wrap = progressWrapRef.current;
    if (!wrap) return;
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    const span = Math.max(duration, 0.001);
    const timeAt = (x: number): number => Math.max(0, Math.min(1, x / rect.width)) * span;
    const playheadX = (Math.min(currentTime, span) / span) * rect.width;
    const hit = hitTestPlayhead({
      row: resolveTimelineRow(e.target),
      x: e.clientX - rect.left,
      playheadX,
      markers: timelineHitMarkers(rect.width),
      altKey: e.altKey,
    });
    if (hit.target === "marker") {
      // §3.3: нажатие — ещё не перетаскивание. Порог 4px — жестом: раньше —
      // клик (плейхед на anchor_sec), позже — beginMarkerDrag (история + везём).
      const id = hit.markerId;
      const x0 = e.clientX - rect.left;
      let crossed = false;
      const onMove = (ev: MouseEvent): void => {
        if (crossed) return;
        if (markerDragThresholdPassed(x0, ev.clientX - rect.left)) {
          crossed = true;
          beginMarkerDrag(id);
        }
      };
      const onUp = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (crossed) return;
        const m = markersRef.current.find((mm) => mm.marker_id === id);
        const anchor = Number(m?.anchor_sec);
        if (Number.isFinite(anchor) && anchor >= 0) {
          // tb_1791860202_84020_2: клик по значку из play — тоже сначала пауза.
          pauseBeforeMarkerJump(videoRef.current);
          seekTransportTo(Math.min(anchor, span), true);
          // tb_1791865804_84020_6: клик по маркеру-вопросу — карточка из текущей записи.
          const clickQid = typeof m?.question_id === "string" && m.question_id ? m.question_id : null;
          if (clickQid) {
            const p = currentFilePathRef.current;
            if (p) switchCardToQuestion(p, clickQid);
          }
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }
    // playhead/scrub (§3.2 п.1/п.2/п.5): прыжок в точку + протяжка.
    // tb_1792441299_49541_7: плейхед ведём за курсором (preview), не дожидаясь
    // отстающего currentTime.
    // tb_1792443862_5828_1: во время drag currentTime НЕ трогаем вовсе —
    // каждый seek заново праймит аудио-пайплайн (звук рвётся, плейхед
    // откатывается к отстающему факту). Один seek — на отпускании.
    const pointAt = (clientX: number): number => timeAt(clientX - rect.left);
    const first = pointAt(e.clientX);
    scrubbingRef.current = true;
    showScrubPreview(first);
    const onMove = (ev: MouseEvent): void => {
      showScrubPreview(pointAt(ev.clientX));
    };
    const onUp = (ev: MouseEvent): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      finishScrubPreview(pointAt(ev.clientX));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  // §3.4: курсор без ре-рендеров — прямо в style слоя (App большой).
  function handleTimelineHover(e: ReactMouseEvent): void {
    if (e.buttons !== 0 || duration <= 0) return;
    const wrap = progressWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    const span = Math.max(duration, 0.001);
    const hit = hitTestPlayhead({
      row: resolveTimelineRow(e.target),
      x: e.clientX - rect.left,
      playheadX: (Math.min(currentTime, span) / span) * rect.width,
      markers: timelineHitMarkers(rect.width),
      altKey: e.altKey,
    });
    wrap.style.cursor = hit.target === "playhead" ? "ew-resize" : hit.target === "scrub" ? "default" : "";
  }
  // 0.21: Clear по видам из Edit → Clear. Scope — только текущее видео.
  // Confirm с разбивкой по видам, сама очистка — в undo-стек.
  async function performClearMarkers(scope: ClearScope): Promise<void> {
    const media = currentMediaKeyRef.current;
    if (!media) { setContextToast("Clear: open a video first."); return; }
    const victims = selectMarkersToClear(markersRef.current, media, scope, contentHashRef.current);
    if (!victims.length) { setContextToast("Nothing to clear."); return; }
    const sparedReplies = countSparedQuestionReplies(markersRef.current, media, scope, contentHashRef.current);
    if (!(await confirmClearMarkers(victims, sparedReplies))) return;
    pushMarkerHistory();
    const victimIds = new Set(victims.map((m) => m.marker_id));
    setMarkers((prev) => prev.filter((m) => !victimIds.has(m.marker_id)));
    setContextToast(victims.length === 1 ? "Cleared 1 marker." : `Cleared ${victims.length} markers.`);
  }
  performUndoRef.current = performUndo;
  performRedoRef.current = performRedo;

  // Bell №5: единый тракт экспорта — все пути (меню ×2, кнопки debug-панели)
  // идут через эти три функции, иначе копии разъезжаются.
  // Вердикт оператора 2026-09-25: кнопка громкости открывает попап-слайдер
  // by design (пункт 9a Белла отклонён), здесь не трогаем.
  function announceExport(kind: ExportKind, isEmpty: boolean, result: SaveResult | null, fpsNote?: string): void {
    const toast = resolveExportToast(kind, isEmpty, result, fpsNote);
    if (toast) setContextToast(toast);
  }

  async function performExportSrt(): Promise<void> {
    if (!srtContent) { announceExport("srt", true, null); return; }
    const result = await saveFileDialogResult(srtContent, `${fileName || "markers"}.srt`, {
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    announceExport("srt", false, result);
  }

  async function performExportJson(): Promise<void> {
    const mediaMarkers = markers.filter((m) => markerBelongsToMedia(m, mediaIdentity));
    const mediaEvents = provisionalEvents.filter((e) => e.media_path === currentMediaKey);
    if (!mediaMarkers.length && !mediaEvents.length) { announceExport("json", true, null); return; }
    const json = exportToSidecar(mediaMarkers, mediaEvents, currentMediaKey || "", contentHash);
    const result = await saveFileDialogResult(json, `${fileName || "markers"}.sos.json`, {
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    announceExport("json", false, result);
  }

  async function performExportXml(): Promise<void> {
    const mm = markers.filter((m) => markerBelongsToMedia(m, mediaIdentity));
    if (!mm.length) { announceExport("xml", true, null); return; }
    // Bell №3: fps-цепочка probe → rVFC → 25 (раньше только probe, в релизе
    // мёртвый — XML всегда врал 25); аудио по умолчанию присутствует; тост
    // про probe убран — деградации больше нет, есть честная резолюция.
    // EN-тост estimated fps (E2E Premiere 46 vs 50): fps не из probe —
    // предупреждение в том же тосте, что и факт сохранения.
    const fps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const fpsSource = resolveXmlFpsSource(containerFps, probeResult?.fps, estimatedFps);
    const fpsNote = fpsSource === "estimated"
      ? `fps ~${fps} estimated, verify sequence settings`
      : fpsSource === "fallback"
        ? `fps ${fps} fallback, verify sequence settings`
        : undefined;
    // tb_1791143015_70644_11: NTSC-несоответствие — в тот же тост.
    const honestyNote = fpsMismatchNote(describeFpsHonesty(containerFps, probeResult?.fps, estimatedFps));
    const combinedNote = [fpsNote, honestyNote].filter(Boolean).join(" ") || undefined;
    const videoEl = videoRef.current as (HTMLVideoElement & { audioTracks?: { length: number } }) | null;
    const result = await saveFileDialogResult(exportMarkersToXmeml(mm, {
      fps,
      width: probeResult?.width || 0,
      height: probeResult?.height || 0,
      // 0.10.25: dims — probe ?? naturalSize ?? 1280×720 (резолв внутри).
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      durationSec: duration || probeResult?.duration_sec || Math.max(...mm.map((m) => m.end_sec)),
      sourcePath: currentFilePath || currentMediaKey || "media",
      sequenceName: fileName || "Review",
      hasAudio: resolveXmlHasAudio(videoEl?.audioTracks?.length, Boolean(probeResult?.ok), Boolean(probeResult?.audio_codec)),
    }), `${fileName || "markers"}.xml`, {
      filters: [{ name: "XML", extensions: ["xml"] }],
    });
    announceExport("xml", false, result, combinedNote);
  }
  // 0.18: метаданные неоткрытого файла — скрытый video preload="metadata",
  // без полной загрузки. Таймаут 10с: битый файл не должен вешать экспорт.
  async function loadPlaylistEntryMeta(rawPath: string): Promise<PlaylistMeta | null> {
    const url = await toAssetUrl(rawPath);
    if (!url) return null;
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      const timer = window.setTimeout(() => { v.removeAttribute("src"); resolve(null); }, 10000);
      v.onloadedmetadata = () => {
        window.clearTimeout(timer);
        const meta: PlaylistMeta = {
          durationSec: Number.isFinite(v.duration) ? v.duration : 0,
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
        };
        v.removeAttribute("src");
        resolve(meta);
      };
      v.onerror = () => {
        window.clearTimeout(timer);
        v.removeAttribute("src");
        resolve(null);
      };
      v.src = url;
    });
  }

  // 0.18: весь плейлист — один Premiere sequence. Порядок из entries,
  // склейки из in/out каждого элемента, offset нарастает длительностями.
  async function performExportPlaylistXml(): Promise<void> {
    const pl = loadPlaylist();
    const entries = pl?.entries ?? [];
    if (!entries.length) { announceExport("xml", true, null); return; }
    // Сиды: длительность из entries + всё известное о текущем медиа.
    const seeds: Record<string, { durationSec?: number; width?: number; height?: number }> = {};
    for (const e of entries) {
      if (e.duration > 0) seeds[e.path] = { durationSec: e.duration };
    }
    if (currentFilePath) {
      seeds[currentFilePath] = {
        durationSec: duration || probeResult?.duration_sec || undefined,
        width: probeResult?.width || naturalSize.width || undefined,
        height: probeResult?.height || naturalSize.height || undefined,
      };
    }
    const meta = await resolvePlaylistMetadata(entries.map((e) => e.path), seeds, loadPlaylistEntryMeta);
    // Timebase — fps-цепочка первого элемента; его probe известен, только
    // если первый элемент сейчас открыт. Иначе — цепочка текущего, иначе 25.
    const firstIsCurrent = entries[0]?.path === currentFilePath;
    const chainContainer = firstIsCurrent ? containerFps : null;
    const chainProbe = (firstIsCurrent ? probeResult?.fps : null) ?? probeResult?.fps;
    const chainEst = (firstIsCurrent ? estimatedFps : null) ?? estimatedFps;
    const fps = resolveXmlFps(chainContainer, chainProbe, chainEst);
    const fpsSource = resolveXmlFpsSource(chainContainer, chainProbe, chainEst);
    const fpsNote = fpsSource === "estimated"
      ? `fps ~${fps} estimated, verify sequence settings`
      : fpsSource === "fallback"
        ? `fps ${fps} fallback, verify sequence settings`
        : undefined;
    const firstMeta = meta[entries[0].path];
    const seqWidth = firstMeta?.width
      || (firstIsCurrent ? probeResult?.width || naturalSize.width : 0)
      || 1280;
    const seqHeight = firstMeta?.height
      || (firstIsCurrent ? probeResult?.height || naturalSize.height : 0)
      || 720;
    const videoEl = videoRef.current as (HTMLVideoElement & { audioTracks?: { length: number } }) | null;
    const items: XmemlPlaylistItemInput[] = [];
    let skipped = 0;
    for (const e of entries) {
      const assetUrl = e.path === currentFilePath && !currentMediaKey.startsWith("blob:")
        ? currentMediaKey
        : await toAssetUrl(e.path);
      if (!assetUrl) { skipped += 1; continue; }
      const entryMarkers = markers.filter((m) => m.media_path === assetUrl);
      const m = meta[e.path];
      const extent = entryMarkers.length ? Math.max(...entryMarkers.map((mk) => mk.end_sec)) : 0;
      const dur = (m?.durationSec || 0) > 0 ? (m?.durationSec as number) : extent;
      if (!dur || dur <= 0) { skipped += 1; continue; }
      items.push({
        sourcePath: e.path,
        clipName: e.name || "Clip",
        durationSec: dur,
        width: m?.width || seqWidth,
        height: m?.height || seqHeight,
        hasAudio: e.path === currentFilePath
          ? resolveXmlHasAudio(videoEl?.audioTracks?.length, Boolean(probeResult?.ok), Boolean(probeResult?.audio_codec))
          : true,
        markers: entryMarkers,
      });
    }
    if (!items.length) { announceExport("xml", true, null); return; }
    const skippedNote = skipped === 1
      ? "Skipped 1 unreadable file."
      : skipped > 1
        ? `Skipped ${skipped} unreadable files.`
        : undefined;
    const note = [fpsNote, skippedNote].filter(Boolean).join(" ");
    // tb_1791143015_70644_11: NTSC-несоответствие первого элемента — в тот же тост.
    const honestyNote = fpsMismatchNote(describeFpsHonesty(chainContainer, chainProbe, chainEst));
    const fullNote = [note, honestyNote].filter(Boolean).join(" ") || undefined;
    const result = await saveFileDialogResult(exportPlaylistToXmeml(items, {
      fps,
      seqWidth,
      seqHeight,
      sequenceName: pl?.name || "Playlist",
    }), `${sanitizePlaylistFilename(pl?.name)}.xml`, {
      filters: [{ name: "XML", extensions: ["xml"] }],
    });
    announceExport("xml", false, result, fullNote);
  }
  // 0.19: список правок человеческим языком (фидбэк Васи: продюсеры
  // боятся XML, монтажёр в CapCut — импорта XML там нет). Тост — по
  // тракту srt: формат имени не светится, только факт сохранения.
  async function performExportReviewNotes(): Promise<void> {
    const mm = markers.filter((m) => markerBelongsToMedia(m, mediaIdentity));
    if (!mm.length) { announceExport("srt", true, null); return; }
    const fps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const txt = exportCommentsToText(
      mm,
      fps,
      `Review notes — ${fileName || "markers"}`,
      undefined,
      // tb_1791143015_70644_11: несоответствие — шапкой файла.
      fpsMismatchNote(describeFpsHonesty(containerFps, probeResult?.fps, estimatedFps)),
    );
    const result = await saveFileDialogResult(txt, `${fileName || "markers"}.review.txt`, {
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    announceExport("srt", false, result);
  }
  // tb_1791568763_28503_3: Review Notes на весь плейлист — один общий
  // документ по файлам подряд. Маркеры чужих файлов — по media_path
  // через toAssetUrl (та же связка, что XML-экспорт); fps чужого файла
  // неизвестен — честный фолбэк 25 с пометкой в секции.
  async function performExportPlaylistReviewNotes(): Promise<void> {
    const pl = loadPlaylist();
    const entries = pl?.entries ?? [];
    if (!entries.length) { announceExport("srt", true, null); return; }
    const currentFps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const sections: PlaylistReviewSection[] = [];
    for (const e of entries) {
      const isCurrent = e.path === currentFilePath;
      const assetUrl = isCurrent && !currentMediaKey.startsWith("blob:")
        ? currentMediaKey
        : await toAssetUrl(e.path);
      const entryMarkers = assetUrl ? markers.filter((m) => m.media_path === assetUrl) : [];
      sections.push({
        fileName: e.name || e.path,
        markers: entryMarkers,
        fps: isCurrent ? currentFps : 25,
        honestyNote: isCurrent
          ? fpsMismatchNote(describeFpsHonesty(containerFps, probeResult?.fps, estimatedFps))
          : "fps unknown — timecodes at 25fps",
      });
    }
    const txt = buildPlaylistReviewText(pl?.name || "Playlist", sections);
    const result = await saveFileDialogResult(txt, `${sanitizePlaylistFilename(pl?.name)}.review.txt`, {
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    announceExport("srt", false, result);
  }
  // 0.24: маркеры для DaVinci — ввоз через Timeline Markers from EDL
  // (XMEML-маркеры он игнорит). Чистый текст, те же метки, что таймлайн.
  async function performExportEdl(): Promise<void> {
    const mm = markers
      .filter((m) => markerBelongsToMedia(m, mediaIdentity))
      .sort((a, b) => a.anchor_sec - b.anchor_sec);
    if (!mm.length) { announceExport("srt", true, null); return; }
    const fps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const stem = ((fileName || "markers").replace(/\.[^.]+$/, "") || "markers");
    const edl = exportMarkersToEdl(mm, fps, `Review notes — ${fileName || "markers"}`);
    const edlResult = await saveFileDialogResult(edl, `${stem}.markers.edl`, {
      filters: [{ name: "EDL", extensions: ["edl"] }],
    });
    // tb_1791143015_70644_11: NTSC-несоответствие — в тост (у EDL нет timebase-поля).
    announceExport("srt", false, edlResult, fpsMismatchNote(describeFpsHonesty(containerFps, probeResult?.fps, estimatedFps)));
  }
  // 0.23: Visual Review Notes (таск Белла) — кадры в точках маркеров.
  // seek → canvas → JPEG из уже открытого <video>: ни FFmpeg, ни новых
  // зависимостей. Позицию и play-state возвращаем; зависший seek (HEVC)
  // пропускаем по таймауту, прогресс — честным тостом.
  function seekVideoTo(video: HTMLVideoElement, sec: number): Promise<boolean> {
    return new Promise((resolve) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      const timer = window.setTimeout(() => { cleanup(); resolve(false); }, SNAPSHOT_SEEK_TIMEOUT_MS);
      const onSeeked = () => { cleanup(); resolve(true); };
      const onError = () => { cleanup(); resolve(false); };
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      try {
        video.currentTime = Math.max(0, sec);
      } catch {
        cleanup();
        resolve(false);
      }
    });
  }
  async function captureMarkerFrames(
    targets: { marker_id: string; anchor_sec: number }[],
    fps: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<CapturedFrame[]> {
    const video = videoRef.current;
    if (!video) return [];
    const wasPaused = video.paused;
    const prevTime = video.currentTime;
    video.pause();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames: CapturedFrame[] = [];
    try {
      let done = 0;
      for (const t of targets) {
        const ok = await seekVideoTo(video, t.anchor_sec);
        done += 1;
        onProgress(done, targets.length);
        if (!ok || !ctx) continue;
        const { width, height } = resolveSnapshotSize(video.videoWidth || 0, video.videoHeight || 0);
        if (width === 0 || height === 0) continue;
        canvas.width = width;
        canvas.height = height;
        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch {
          continue;
        }
        const blob: Blob | null = await new Promise((r) => {
          try {
            canvas.toBlob(r, "image/jpeg", SNAPSHOT_JPEG_QUALITY);
          } catch {
            r(null);
          }
        });
        if (!blob) continue;
        const jpeg = new Uint8Array(await blob.arrayBuffer());
        const timecode = formatTimecode(t.anchor_sec, fps);
        frames.push({
          marker_id: t.marker_id,
          anchor_sec: t.anchor_sec,
          timecode,
          fileName: snapshotFileName(timecode),
          jpeg,
          width,
          height,
        });
      }
    } finally {
      try {
        video.currentTime = prevTime;
      } catch {
        // позицию возвращаем best-effort — экспорту мешать не должна
      }
      if (!wasPaused) void video.play().catch(() => {});
    }
    return frames;
  }
  async function performExportVisualNotes(): Promise<void> {
    const mm = markers
      .filter((m) => markerBelongsToMedia(m, mediaIdentity))
      .sort((a, b) => a.anchor_sec - b.anchor_sec);
    if (!mm.length) { announceExport("srt", true, null); return; }
    if (!videoRef.current) { setContextToast("Visual notes: open a video first."); return; }
    const fps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const stem = ((fileName || "markers").replace(/\.[^.]+$/, "") || "markers");
    const title = `Review notes — ${fileName || "markers"}`;
    setContextToast(`Snapshots 0/${mm.length}…`);
    const frames = await captureMarkerFrames(
      mm.map((m) => ({ marker_id: m.marker_id, anchor_sec: m.anchor_sec })),
      fps,
      (done, total) => setContextToast(`Snapshots ${done}/${total}…`),
    );
    const byId = new Map(frames.map((f) => [f.marker_id, f]));
    const txt = exportCommentsToText(mm, fps, title, (m) => byId.get(m.marker_id ?? "")?.fileName ?? null);
    const html = buildVisualReviewHtml({
      title,
      fps,
      frameCount: frames.length,
      markerCount: mm.length,
      rows: mm.map((m) => {
        const f = byId.get(m.marker_id);
        return {
          timecode: formatTimecode(m.anchor_sec, fps),
          kindLabel: m.kind,
          name: reviewMarkerName(m.kind, m.label, m.author, m.reply_to),
          text: m.text || "",
          fileName: f?.fileName ?? null,
          dataUrl: f ? frameToDataUrl(f.jpeg) : null,
        };
      }),
    });
    if (!isTauriRuntimeSync()) {
      // Браузер: только самодостаточный .html скачиванием; папка — десктоп.
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}.review.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setContextToast(frames.length
        ? `Saved .html with ${frames.length} frames. Frames folder needs the desktop app.`
        : "Saved .html (no frames captured).");
      return;
    }
    const htmlResult = await saveFileDialogResult(html, `${stem}.review.html`, {
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (htmlResult.status !== "saved") { announceExport("srt", false, htmlResult); return; }
    // Пакет рядом: X.review.html + X.review/X.review.txt + X.review/*.jpg.
    const folder = snapshotDirForFile(htmlResult.path, stem);
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      await fs.mkdir(folder, { recursive: true });
      await fs.writeTextFile(`${folder}/${stem}.review.txt`, txt);
      let written = 0;
      for (const f of frames) {
        try {
          await fs.writeFile(`${folder}/${f.fileName}`, f.jpeg);
          written += 1;
        } catch {
          // один битый кадр пакет не хоронит
        }
      }
      setContextToast(`Visual review saved: .html + .txt + ${written}/${frames.length} frames.`);
    } catch {
      // Папка запрещена песочницей — .html уже сохранён, кадры внутри него.
      setContextToast("Frames folder blocked by sandbox — .html saved with embedded frames.");
    }
  }
  // tb_1791568769_28503_4: Visual Review на весь плейлист — один общий
  // документ с секциями по файлам. Кадры чужих файлов снимаем по очереди:
  // открываем файл через handleOpenPath (без автоплея), ждём готовности
  // <video> по рефам, захватываем готовым captureMarkerFrames. В конце
  // возвращаем исходный файл и позицию, оставляем на паузе. HEVC-зависы
  // и чужие отказы open-gate — пропуском файла, пакет не хороним.
  async function waitForMediaReady(path: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    for (;;) {
      const v = videoRef.current;
      if (
        currentFilePathRef.current === path && v &&
        v.readyState >= 2 && v.duration > 0 && Number.isFinite(v.duration)
      ) return true;
      if (Date.now() - start >= timeoutMs) return false;
      await new Promise((r) => { setTimeout(r, 120); });
    }
  }
  async function performExportPlaylistVisualNotes(): Promise<void> {
    const pl = loadPlaylist();
    const entries = pl?.entries ?? [];
    if (!entries.length) { announceExport("srt", true, null); return; }
    if (!videoRef.current) { setContextToast("Visual notes: open a video first."); return; }
    const origPath = currentFilePathRef.current;
    const origTime = videoRef.current?.currentTime ?? 0;
    const currentFps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const title = `Review notes — ${pl?.name || "Playlist"}`;
    const stem = sanitizePlaylistFilename(pl?.name);
    const reviewSections: PlaylistReviewSection[] = [];
    const visualSections: PlaylistVisualSection[] = [];
    const savedFrames: { fileName: string; jpeg: Uint8Array }[] = [];
    let skipped = 0;
    let markerTotal = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      const isCurrent = e.path === currentFilePathRef.current;
      const assetUrl = isCurrent && !currentMediaKey.startsWith("blob:")
        ? currentMediaKey
        : await toAssetUrl(e.path);
      const entryMarkers = assetUrl ? markers.filter((m) => m.media_path === assetUrl) : [];
      const fps = isCurrent ? currentFps : 25;
      const honesty = isCurrent
        ? fpsMismatchNote(describeFpsHonesty(containerFps, probeResult?.fps, estimatedFps))
        : "fps unknown — timecodes at 25fps";
      if (!entryMarkers.length) {
        reviewSections.push({ fileName: e.name || e.path, markers: [], fps, honestyNote: honesty });
        visualSections.push({ title: `${i + 1}. ${e.name || e.path}`, markers: [], fps, frames: new Map() });
        continue;
      }
      autoplayOnLoadRef.current = false;
      await handleOpenPath(e.path);
      const ready = await waitForMediaReady(e.path, 20000);
      if (!ready) {
        skipped += 1;
        reviewSections.push({ fileName: e.name || e.path, markers: entryMarkers, fps, honestyNote: honesty });
        visualSections.push({
          title: `${i + 1}. ${e.name || e.path}`,
          markers: entryMarkers.map((m) => ({
            marker_id: m.marker_id, anchor_sec: m.anchor_sec, kind: m.kind, label: m.label, text: m.text,
            author: m.author, reply_to: m.reply_to,
          })),
          fps,
          frames: new Map(),
        });
        continue;
      }
      setContextToast(`Snapshots file ${i + 1}/${entries.length}…`);
      const frames = await captureMarkerFrames(
        entryMarkers.map((m) => ({ marker_id: m.marker_id, anchor_sec: m.anchor_sec })),
        fps,
        (done, total) => setContextToast(`Snapshots file ${i + 1}/${entries.length}: ${done}/${total}…`),
      );
      const byId = new Map<string, PlaylistVisualFrame>();
      for (const f of frames) {
        const prefixed = playlistFrameFileName(i, f.fileName);
        byId.set(f.marker_id, { marker_id: f.marker_id, fileName: prefixed, jpeg: f.jpeg });
        savedFrames.push({ fileName: prefixed, jpeg: f.jpeg });
      }
      markerTotal += entryMarkers.length;
      const sectionTitle = `${i + 1}. ${e.name || e.path}`;
      reviewSections.push({
        fileName: e.name || e.path,
        markers: entryMarkers,
        fps,
        honestyNote: honesty,
        frameNameOf: (m) => byId.get(m.marker_id ?? "")?.fileName ?? null,
      });
      visualSections.push({
        title: sectionTitle,
        markers: entryMarkers.map((m) => ({
          marker_id: m.marker_id, anchor_sec: m.anchor_sec, kind: m.kind, label: m.label, text: m.text,
        })),
        fps,
        frames: byId,
      });
    }
    // Возвращаем исходное медиа и позицию; экспорт — фоновая задача,
    // автовоспроизведение не возвращаем, оставляем на паузе.
    try {
      if (origPath) {
        autoplayOnLoadRef.current = false;
        await handleOpenPath(origPath);
        const v = videoRef.current;
        if (v) {
          try { v.currentTime = origTime; } catch { /* best-effort — экспорту не мешает */ }
          v.pause();
        }
      }
    } catch { /* возврат исходного — best-effort */ }
    const rows = buildPlaylistVisualRows(visualSections);
    const html = buildVisualReviewHtml({
      title,
      fps: currentFps,
      frameCount: savedFrames.length,
      markerCount: markerTotal,
      rows,
    });
    const txt = buildPlaylistReviewText(pl?.name || "Playlist", reviewSections);
    const skippedNote = skipped === 1
      ? "Skipped 1 unreadable file."
      : skipped > 1
        ? `Skipped ${skipped} unreadable files.`
        : "";
    if (!isTauriRuntimeSync()) {
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}.review.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setContextToast([`Saved .html with ${savedFrames.length} frames. Frames folder needs the desktop app.`, skippedNote].filter(Boolean).join(" "));
      return;
    }
    const htmlResult = await saveFileDialogResult(html, `${stem}.review.html`, {
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (htmlResult.status !== "saved") { announceExport("srt", false, htmlResult); return; }
    const folder = snapshotDirForFile(htmlResult.path, stem);
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      await fs.mkdir(folder, { recursive: true });
      await fs.writeTextFile(`${folder}/${stem}.review.txt`, txt);
      let written = 0;
      for (const f of savedFrames) {
        try {
          await fs.writeFile(`${folder}/${f.fileName}`, f.jpeg);
          written += 1;
        } catch {
          // один битый кадр пакет не хоронит
        }
      }
      setContextToast([`Visual review saved: .html + .txt + ${written}/${savedFrames.length} frames.`, skippedNote].filter(Boolean).join(" "));
    } catch {
      setContextToast("Frames folder blocked by sandbox — .html saved with embedded frames.");
    }
  }
  // tb_1791568777_28503_5: общий сборщик медиа-экспортов плейлиста.
  // Связка маркеров — media_path через toAssetUrl (как XML/txt/html);
  // fps чужого файла — 25; длительность — entry/meta, иначе экстент
  // маркеров (честная лента для SRT/EDL-сдвигов).
  interface PlaylistExportItem {
    path: string;
    name: string;
    assetUrl: string | null;
    markerList: PlayerTimeMarker[];
    fps: number;
    durationSec: number;
    width: number;
    height: number;
  }
  async function collectPlaylistExportItems(): Promise<{ playlistName: string; items: PlaylistExportItem[] } | null> {
    const pl = loadPlaylist();
    const entries = pl?.entries ?? [];
    if (!entries.length) return null;
    const currentFps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const seeds: Record<string, { durationSec?: number; width?: number; height?: number }> = {};
    for (const e of entries) {
      if (e.duration > 0) seeds[e.path] = { durationSec: e.duration };
    }
    if (currentFilePath) {
      seeds[currentFilePath] = {
        durationSec: duration || probeResult?.duration_sec || undefined,
        width: probeResult?.width || naturalSize.width || undefined,
        height: probeResult?.height || naturalSize.height || undefined,
      };
    }
    const meta = await resolvePlaylistMetadata(entries.map((e) => e.path), seeds, loadPlaylistEntryMeta);
    const items: PlaylistExportItem[] = [];
    for (const e of entries) {
      const isCurrent = e.path === currentFilePathRef.current;
      const assetUrl = isCurrent && !currentMediaKey.startsWith("blob:")
        ? currentMediaKey
        : await toAssetUrl(e.path);
      const markerList = assetUrl ? markers.filter((m) => m.media_path === assetUrl) : [];
      const m = meta[e.path];
      const extent = markerList.length ? Math.max(...markerList.map((mk) => mk.end_sec)) : 0;
      const dur = (m?.durationSec || 0) > 0 ? (m?.durationSec as number) : extent;
      items.push({
        path: e.path,
        name: e.name || e.path,
        assetUrl,
        markerList,
        fps: isCurrent ? currentFps : 25,
        durationSec: dur,
        width: m?.width || 0,
        height: m?.height || 0,
      });
    }
    return { playlistName: pl?.name || "Playlist", items };
  }
  async function performExportPlaylistJson(): Promise<void> {
    const col = await collectPlaylistExportItems();
    if (!col) { announceExport("json", true, null); return; }
    const files = col.items.map((it) => ({
      file: it.name,
      markers: it.markerList.map((m) => ({
        marker_id: m.marker_id, kind: m.kind, start_sec: m.start_sec, end_sec: m.end_sec,
        anchor_sec: m.anchor_sec, label: m.label, text: m.text, author: m.author, reply_to: m.reply_to,
        created_at: m.created_at,
      })),
      provisional_events: provisionalEvents
        .filter((e) => it.assetUrl && e.media_path === it.assetUrl)
        .map((e) => ({
          provisional_event_id: e.provisional_event_id, event_type: e.event_type,
          start_sec: e.start_sec, end_sec: e.end_sec, text: e.text, created_at: e.created_at,
        })),
    }));
    if (!files.some((f) => f.markers.length || f.provisional_events.length)) { announceExport("json", true, null); return; }
    const json = buildPlaylistMarkersJson(col.playlistName, files);
    const result = await saveFileDialogResult(json, `${sanitizePlaylistFilename(col.playlistName)}.markers.json`, {
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    announceExport("json", false, result);
  }
  async function performExportPlaylistSrt(): Promise<void> {
    const col = await collectPlaylistExportItems();
    if (!col) { announceExport("srt", true, null); return; }
    let offset = 0;
    const all: SrtExportable[] = [];
    for (const it of col.items) {
      const sorted = [...it.markerList].sort((a, b) => a.start_sec - b.start_sec);
      all.push(...shiftSrtMarkers(sorted, offset));
      offset += it.durationSec > 0 ? it.durationSec : 0;
    }
    if (!all.length) { announceExport("srt", true, null); return; }
    const srt = exportMarkersToSrtV2(all);
    const result = await saveFileDialogResult(srt, `${sanitizePlaylistFilename(col.playlistName)}.srt`, {
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    announceExport("srt", false, result);
  }
  async function performExportPlaylistEdl(): Promise<void> {
    const col = await collectPlaylistExportItems();
    if (!col) { announceExport("srt", true, null); return; }
    let offset = 0;
    const files = col.items.map((it, i) => {
      const recOffsetSec = offset;
      offset += it.durationSec > 0 ? it.durationSec : 0;
      return {
        reel: playlistReelName(it.name, i),
        markers: [...it.markerList].sort((a, b) => a.start_sec - b.start_sec),
        fps: it.fps,
        recOffsetSec,
      };
    });
    if (!files.some((f) => f.markers.length)) { announceExport("srt", true, null); return; }
    const edl = exportPlaylistToEdl(files, `Review notes — ${col.playlistName}`);
    const result = await saveFileDialogResult(edl, `${sanitizePlaylistFilename(col.playlistName)}.markers.edl`, {
      filters: [{ name: "EDL", extensions: ["edl"] }],
    });
    announceExport("srt", false, result);
  }
  // Пакет монтажёру на весь плейлист: одна папка, внутри подпапка
  // на файл (timeline XML + review txt + html + frames) + общее
  // playlist.review.txt сверху. Кадры — прогулкой как visual-ревью.
  async function performExportPlaylistEditorPackage(): Promise<void> {
    const col = await collectPlaylistExportItems();
    if (!col) { announceExport("srt", true, null); return; }
    const withMarkers = col.items.filter((it) => it.markerList.length);
    if (!withMarkers.length) { announceExport("srt", true, null); return; }
    if (!isTauriRuntimeSync()) {
      setContextToast("Send to editor needs the desktop app (folder package).");
      return;
    }
    let parentDir: string | null = null;
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const picked = await dialog.open({ directory: true, multiple: false, title: "Send playlist to editor — choose package folder" });
      if (!picked) return;
      parentDir = Array.isArray(picked) ? picked[0] ?? null : picked;
      if (!parentDir) return;
    } catch {
      setContextToast("Send to editor: could not open folder dialog.");
      return;
    }
    const stem = sanitizePlaylistFilename(col.playlistName);
    const folder = editorPackageDir(parentDir, `${stem}.playlist`);
    const origPath = currentFilePathRef.current;
    const origTime = videoRef.current?.currentTime ?? 0;
    const fs = await import("@tauri-apps/plugin-fs");
    const reviewSections: PlaylistReviewSection[] = [];
    try {
      await fs.mkdir(folder, { recursive: true });
      for (let i = 0; i < withMarkers.length; i += 1) {
        const it = withMarkers[i];
        const fileStem = (it.name.replace(/\.[^.]+$/, "") || it.name).slice(0, 60) || `file${i + 1}`;
        const sub = `${folder}/${fileStem}`;
        autoplayOnLoadRef.current = false;
        await handleOpenPath(it.path);
        const ready = await waitForMediaReady(it.path, 20000);
        let frames: { marker_id: string; anchor_sec: number; timecode: string; fileName: string; jpeg: Uint8Array; width: number; height: number }[] = [];
        if (ready && videoRef.current) {
          setContextToast(`Snapshots file ${i + 1}/${withMarkers.length}…`);
          frames = await captureMarkerFrames(
            it.markerList.map((m) => ({ marker_id: m.marker_id, anchor_sec: m.anchor_sec })),
            it.fps,
            (done, total) => setContextToast(`Snapshots file ${i + 1}/${withMarkers.length}: ${done}/${total}…`),
          );
        }
        const byId = new Map(frames.map((f) => [f.marker_id, f]));
        const mm = [...it.markerList].sort((a, b) => a.anchor_sec - b.anchor_sec);
        const txt = exportCommentsToText(mm, it.fps, `Review notes — ${it.name}`, (m) => byId.get(m.marker_id ?? "")?.fileName ?? null);
        const html = buildVisualReviewHtml({
          title: `Review notes — ${it.name}`,
          fps: it.fps,
          frameCount: frames.length,
          markerCount: mm.length,
          rows: mm.map((m) => {
            const f = byId.get(m.marker_id);
            return {
              timecode: formatTimecode(m.anchor_sec, it.fps),
              kindLabel: m.kind,
              name: reviewMarkerName(m.kind, m.label, m.author, m.reply_to),
              text: m.text || "",
              fileName: f?.fileName ?? null,
              dataUrl: f ? frameToDataUrl(f.jpeg) : null,
            };
          }),
        });
        const xml = exportMarkersToXmeml(mm, {
          fps: it.fps,
          width: it.width,
          height: it.height,
          naturalWidth: it.width,
          naturalHeight: it.height,
          durationSec: it.durationSec > 0 ? it.durationSec : Math.max(...mm.map((m) => m.end_sec)),
          sourcePath: it.path,
          sequenceName: it.name,
          hasAudio: true,
        });
        await fs.mkdir(`${sub}/frames`, { recursive: true });
        await fs.writeTextFile(`${sub}/${fileStem}.timeline.xml`, xml);
        await fs.writeTextFile(`${sub}/${fileStem}.review.txt`, txt);
        await fs.writeTextFile(`${sub}/${fileStem}.review.html`, html);
        for (const f of frames) {
          try { await fs.writeFile(`${sub}/frames/${f.fileName}`, f.jpeg); } catch { /* один битый кадр пакет не хоронит */ }
        }
        reviewSections.push({ fileName: it.name, markers: it.markerList, fps: it.fps });
      }
      await fs.writeTextFile(`${folder}/playlist.review.txt`, buildPlaylistReviewText(col.playlistName, reviewSections));
    } catch {
      setContextToast("Send to editor: package folder blocked by sandbox.");
      return;
    } finally {
      try {
        if (origPath) {
          autoplayOnLoadRef.current = false;
          await handleOpenPath(origPath);
          const v = videoRef.current;
          if (v) {
            try { v.currentTime = origTime; } catch { /* best-effort — экспорту не мешает */ }
            v.pause();
          }
        }
      } catch { /* возврат исходного — best-effort */ }
    }
    setContextToast(`Playlist editor package saved: ${withMarkers.length} files.`);
  }
  // Только регистрация module.json; окно живёт в модуле, мост — в module-host.
  async function performLoadModuleIndex(): Promise<void> {
    if (!isTauriRuntimeSync()) {
      setContextToast("Load Module needs the desktop app.");
      return;
    }
    const picked = await openFileDialog({ filters: [{ name: "Module manifest", extensions: ["json"] }] });
    if (!picked) return;
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const parsed = parseModuleManifest(await readTextFile(picked));
      if (!parsed.ok) {
        setContextToast(`Module manifest invalid: ${parsed.error}`);
        return;
      }
      localStorage.setItem(MODULE_MANIFEST_LS_KEY, picked);
      setContextToast(`Module loaded: ${parsed.manifest.title} — Window → Index Review to open.`);
    } catch {
      setContextToast("Load Module: could not read module.json.");
    }
  }
  async function performOpenModuleReview(): Promise<void> {
    const manifestPath = localStorage.getItem(MODULE_MANIFEST_LS_KEY);
    if (!manifestPath) {
      setContextToast("No module loaded — Tools → Load Module → Indexing… first.");
      return;
    }
    if (!isTauriRuntimeSync()) {
      setContextToast("Index Review needs the desktop app.");
      return;
    }
    let manifest: ModuleManifest;
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const parsed = parseModuleManifest(await readTextFile(manifestPath));
      if (!parsed.ok) {
        setContextToast(`Module manifest invalid: ${parsed.error}`);
        return;
      }
      manifest = parsed.manifest;
    } catch {
      setContextToast("Index Review: could not read module.json.");
      return;
    }
    const win = manifest.windows[0];
    const dir = manifestDirOf(manifestPath);
    const page = resolveModuleFile(dir, win.page);
    const mediaPath = mediaFsPath(currentMediaKey);
    const outDir = mediaPath ? candidateOutDir(mediaPath) : null;
    let outDirExists = false;
    if (outDir) {
      try {
        const fs = await import("@tauri-apps/plugin-fs");
        outDirExists = await fs.exists(outDir);
      } catch {
        outDirExists = false;
      }
    }
    const assetBase = outDir && outDirExists ? await toAssetUrl(outDir).then((u) => (u ? `${u.replace(/\/+$/, "")}/` : null)) : null;
    const query = moduleHostQuery({
      manifest: manifestPath,
      window: win.id,
      page,
      title: win.title,
      outDir,
      outDirExists,
      assetBase,
      bridge: win.bridge,
    });
    const ok = await openPanelWindow(modulePanelLabel(win.id), "module-host", win.title, 960, 720, query);
    if (!ok) setContextToast("Index Review: could not open panel window.");
  }
  // tb_1790711530_12931_17: пакет монтажёру одним кликом — <stem>.editor/:
  // timeline XML + review .txt со ссылками на кадры + frames/*.jpg +
  // .html с base64. Один диалог (выбор папки пакета), позиция и
  // play-state возвращаются (captureMarkerFrames), прогресс — тостами.
  async function performSendEditorPackage(): Promise<void> {
    const mm = markers
      .filter((m) => markerBelongsToMedia(m, mediaIdentity))
      .sort((a, b) => a.anchor_sec - b.anchor_sec);
    if (!mm.length) { announceExport("srt", true, null); return; }
    if (!videoRef.current) { setContextToast("Send to editor: open a video first."); return; }
    const fps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const stem = ((fileName || "markers").replace(/\.[^.]+$/, "") || "markers");
    const title = `Review notes — ${fileName || "markers"}`;
    if (!isTauriRuntimeSync()) {
      // Браузер: папку не выбрать — только самодостаточный .html скачиванием.
      setContextToast("Send to editor needs the desktop app (folder package).");
      return;
    }
    let parentDir: string | null = null;
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const picked = await dialog.open({ directory: true, multiple: false, title: "Send to editor — choose package folder" });
      if (!picked) return;
      parentDir = Array.isArray(picked) ? picked[0] ?? null : picked;
      if (!parentDir) return;
    } catch {
      setContextToast("Send to editor: could not open folder dialog.");
      return;
    }
    const folder = editorPackageDir(parentDir, stem);
    const plan = editorPackagePlan(stem, []);
    setContextToast(`Snapshots 0/${mm.length}…`);
    const frames = await captureMarkerFrames(
      mm.map((m) => ({ marker_id: m.marker_id, anchor_sec: m.anchor_sec })),
      fps,
      (done, total) => setContextToast(`Snapshots ${done}/${total}…`),
    );
    const byId = new Map(frames.map((f) => [f.marker_id, f]));
    const txt = exportCommentsToText(mm, fps, title, (m) => byId.get(m.marker_id ?? "")?.fileName ?? null);
    const html = buildVisualReviewHtml({
      title,
      fps,
      frameCount: frames.length,
      markerCount: mm.length,
      rows: mm.map((m) => {
        const f = byId.get(m.marker_id);
        return {
          timecode: formatTimecode(m.anchor_sec, fps),
          kindLabel: m.kind,
          name: reviewMarkerName(m.kind, m.label, m.author, m.reply_to),
          text: m.text || "",
          fileName: f?.fileName ?? null,
          dataUrl: f ? frameToDataUrl(f.jpeg) : null,
        };
      }),
    });
    const videoEl = videoRef.current as (HTMLVideoElement & { audioTracks?: { length: number } }) | null;
    const xml = exportMarkersToXmeml(mm, {
      fps,
      width: probeResult?.width || 0,
      height: probeResult?.height || 0,
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      durationSec: duration || probeResult?.duration_sec || Math.max(...mm.map((m) => m.end_sec)),
      sourcePath: currentFilePath || currentMediaKey || "media",
      sequenceName: fileName || "Review",
      hasAudio: resolveXmlHasAudio(videoEl?.audioTracks?.length, Boolean(probeResult?.ok), Boolean(probeResult?.audio_codec)),
    });
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      await fs.mkdir(folder, { recursive: true });
      await fs.mkdir(`${folder}/frames`, { recursive: true });
      await fs.writeTextFile(`${folder}/${plan[0]}`, xml);
      await fs.writeTextFile(`${folder}/${plan[1]}`, txt);
      await fs.writeTextFile(`${folder}/${plan[2]}`, html);
      let written = 0;
      for (const f of frames) {
        try {
          await fs.writeFile(`${folder}/frames/${f.fileName}`, f.jpeg);
          written += 1;
        } catch {
          // один битый кадр пакет не хоронит
        }
      }
      setContextToast(`Editor package saved: XML + .txt + .html + ${written}/${frames.length} frames.`);
    } catch {
      setContextToast("Editor package: folder write blocked by sandbox.");
    }
  }
  menuHandlersRef.current.onExportSrt = () => {
    void performExportSrt();
  };
  menuHandlersRef.current.onExportJson = () => {
    void performExportJson();
  };
  menuHandlersRef.current.onExportXml = () => {
    void performExportXml();
  };
  menuHandlersRef.current.onExportPlaylistXml = () => {
    void performExportPlaylistXml();
  };
  menuHandlersRef.current.onExportPlaylistReviewNotes = () => {
    void performExportPlaylistReviewNotes();
  };
  menuHandlersRef.current.onExportPlaylistVisualNotes = () => {
    void performExportPlaylistVisualNotes();
  };
  menuHandlersRef.current.onExportPlaylistJson = () => {
    void performExportPlaylistJson();
  };
  menuHandlersRef.current.onExportPlaylistSrt = () => {
    void performExportPlaylistSrt();
  };
  menuHandlersRef.current.onExportPlaylistEdl = () => {
    void performExportPlaylistEdl();
  };
  menuHandlersRef.current.onExportPlaylistEditorPackage = () => {
    void performExportPlaylistEditorPackage();
  };
  menuHandlersRef.current.onExportReviewNotes = () => {
    void performExportReviewNotes();
  };
  menuHandlersRef.current.onExportVisualNotes = () => {
    void performExportVisualNotes();
  };
  menuHandlersRef.current.onSendEditorPackage = () => {
    void performSendEditorPackage();
  };
  menuHandlersRef.current.onUndo = () => {
    performUndoRef.current();
  };
  menuHandlersRef.current.onRedo = () => {
    performRedoRef.current();
  };
  // tb_1791156671_82609_1: дорожка субтитров — одна на видео, ключ абс. путь.
  const subtitleTrackKey = resolveSubtitleTrackKey(currentFilePath, currentMediaKey);
  const activeSubtitleTrack = subtitleTrackKey ? subStore[subtitleTrackKey] : undefined;

  function importSubtitleText(text: string, sourceName: string, mediaKey: string | null): number {
    const { cues, errors } = parseSubtitleSrt(text);
    if (!mediaKey) { setContextToast("Subtitles: open a video first."); return 0; }
    if (!cues.length) {
      setContextToast(errors[0] ? `SRT: ${errors[0]}.` : "SRT: no cues found.");
      return 0;
    }
    const replaced = Boolean(subStore[mediaKey]);
    setSubStore(saveSubtitleTrack(mediaKey, cues, sourceName));
    setSrtContent(text); // §8: re-download сырого импорта не трогаем.
    setSubtitlesVisible(true);
    setSubtitleTime(null);
    setMarkerHint(null);
    if (looksLikeMarkers(cues)) {
      setMarkerHint({ trackKey: mediaKey, cues: cues.length });
    } else {
      setContextToast(replaced ? `Subtitles replaced: ${cues.length} cues.` : `Subtitles: ${cues.length} cues.`);
    }
    return cues.length;
  }

  function removeSubtitlesForCurrent(): void {
    if (!subtitleTrackKey || !subStore[subtitleTrackKey]) {
      setContextToast("No subtitles for this video.");
      return;
    }
    setSubStore(removeSubtitleTrack(subtitleTrackKey));
    setMarkerHint(null);
    setSubtitleTime(null);
    setContextToast("Subtitles removed.");
  }

  function createMarkersFromSubtitleHint(): void {
    if (!markerHint) return;
    const here = currentFilePath || currentMediaKey || null;
    if (markerHint.trackKey !== here) {
      setContextToast("Switch back to the subtitled video to create markers.");
      return;
    }
    const track = subStore[markerHint.trackKey];
    if (!track) { setMarkerHint(null); return; }
    const added: PlayerTimeMarker[] = [];
    for (const cue of track.cues) {
      const { kind, label, author, text } = splitMarkerPrefixLine(cue.text.split("\n").join(" "));
      const { replyTo, text: cleanText } = parseReplyText(text);
      const marker = buildMarker(kind as PlayerMarkerKind, cleanText);
      if (!marker) continue;
      marker.label = label || marker.label;
      // tb_1791583578_64923_1: автор из SRT-сегмента (иначе подписант).
      if (author) marker.author = author;
      // tb_1791585558_31907_1: ссылка ответа из префикса ↳ <id>:.
      if (replyTo) marker.reply_to = replyTo;      marker.start_sec = cue.start;
      marker.end_sec = cue.end;
      marker.anchor_sec = (cue.start + cue.end) / 2;
      added.push(marker);
    }
    if (!added.length) { setContextToast("Subtitles: open a video first."); return; }
    pushMarkerHistory();
    setMarkers((prev) => [...prev, ...added]);
    setMarkerHint(null);
    setContextToast(`Markers created: ${added.length}.`);
  }

  // Сброс часов и хинта при смене видео/видимости.
  useEffect(() => {
    setSubtitleTime(null);
    setMarkerHint(null);
  }, [subtitleTrackKey, subtitlesVisible]);

  // rVFC-цикл реплик: пишет subtitleTime только при смене активной реплики
  // (покадровая точность без ре-рендера каждый кадр). seeked/timeupdate —
  // страховка: на паузе rVFC не стреляет, скраб идёт через события.
  // Без rVFC — фолбэк на currentTime (timeupdate/seek) через subtitleTime === null.
  useEffect(() => {
    if (!subtitlesVisible || !activeSubtitleTrack) return;
    const video = videoRef.current;
    if (!video || !src) return;
    const cues = activeSubtitleTrack.cues;
    let stopped = false;
    let lastKey = "\0";
    const refresh = () => {
      if (stopped) return;
      const t = Number(video.currentTime || 0);
      const key = findCuesAt(cues, t).map((c) => c.start).join("|");
      if (key !== lastKey) { lastKey = key; setSubtitleTime(t); }
    };
    const step = () => {
      if (stopped) return;
      refresh();
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      if (typeof v.requestVideoFrameCallback === "function") {
        try { v.requestVideoFrameCallback(() => step()); return; } catch { /* fall through */ }
      }
      window.setTimeout(() => { if (!stopped) step(); }, 250);
    };
    video.addEventListener("seeked", refresh);
    video.addEventListener("timeupdate", refresh);
    step();
    return () => {
      stopped = true;
      video.removeEventListener("seeked", refresh);
      video.removeEventListener("timeupdate", refresh);
    };
  }, [src, subtitlesVisible, activeSubtitleTrack]);

  const subtitleClock = subtitleTime ?? currentTime;
  const activeSubtitleCues = subtitlesVisible && activeSubtitleTrack
    ? findCuesAt(activeSubtitleTrack.cues, subtitleClock)
    : [];

  menuHandlersRef.current.onImportSrt = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.txt";
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      // §1: байты → строгий UTF-8, иначе cp1251.
      file.arrayBuffer().then(
        (buf) => {
          const { text } = decodeSubtitleBytes(buf);
          importSubtitleText(text, file.name, currentFilePath || currentMediaKey || null);
        },
        () => setContextToast("SRT: could not read the file."),
      );
    };
    input.click();
  };
  const menuActionRef = useRef<(action: CutPlayerMenuAction) => void>(() => {});
  const stopShuttleRef = useRef<() => void>(() => {});
  menuActionRef.current = (action) => {
    switch (action) {
      case "open":
        void handleOpenMultiple();
        break;
      case "undo":
        menuHandlersRef.current.onUndo();
        break;
      case "redo":
        menuHandlersRef.current.onRedo();
        break;
      case "clear_comments":
        void performClearMarkers("comment");
        break;
      case "clear_favorites":
        void performClearMarkers("favorite");
        break;
      case "clear_negatives":
        void performClearMarkers("negative");
        break;
      case "clear_inout":
        void performClearMarkers("inout");
        break;
      case "clear_all_markers":
        void performClearMarkers("all");
        break;
      case "export_srt":
        menuHandlersRef.current.onExportSrt();
        break;
      case "export_json":
        menuHandlersRef.current.onExportJson();
        break;
      case "export_xml":
        menuHandlersRef.current.onExportXml();
        break;
      case "export_playlist_xml":
        menuHandlersRef.current.onExportPlaylistXml();
        break;
      case "export_playlist_review_notes":
        menuHandlersRef.current.onExportPlaylistReviewNotes();
        break;
      case "export_playlist_visual_notes":
        menuHandlersRef.current.onExportPlaylistVisualNotes();
        break;
      case "export_playlist_json":
        menuHandlersRef.current.onExportPlaylistJson();
        break;
      case "export_playlist_srt":
        menuHandlersRef.current.onExportPlaylistSrt();
        break;
      case "export_playlist_edl":
        menuHandlersRef.current.onExportPlaylistEdl();
        break;
      case "send_playlist_editor_package":
        menuHandlersRef.current.onExportPlaylistEditorPackage();
        break;
      case "export_review_notes":
        menuHandlersRef.current.onExportReviewNotes();
        break;
      case "export_visual_notes":
        menuHandlersRef.current.onExportVisualNotes();
        break;
      case "send_editor_package":
        menuHandlersRef.current.onSendEditorPackage();
        break;
      case "import_srt":
        menuHandlersRef.current.onImportSrt();
        break;
      case "fullscreen":
        beginFullscreenTransition();
        void toggleFullscreen();
        break;
      case "mute":
        syncVolume(volume, !isMuted);
        break;
      case "play_pause":
        togglePlayback();
        break;
      case "inout_play_toggle":
        toggleInOutPlay();
        break;
      case "stop": {
        const video = videoRef.current;
        if (video) video.pause();
        stopShuttleRef.current();
        break;
      }
      case "mark_in":
        addMomentMarker("in");
        break;
      case "mark_out":
        addMomentMarker("out");
        break;
      case "favorite":
        addMomentMarker("favorite");
        break;
      case "comment":
        openCommentsPanel("comment");
        break;
      case "negative":
        addMomentMarker("negative");
        break;
      case "cycle_quality": {
        const currentIndex = PREVIEW_QUALITY_OPTIONS.findIndex((option) => option.key === previewQuality);
        const nextOption = PREVIEW_QUALITY_OPTIONS[(currentIndex + 1) % PREVIEW_QUALITY_OPTIONS.length];
        setPreviewQuality(nextOption.key);
        break;
      }
      case "playlist":
        void openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500);
        break;
      case "media_info":
        setContextToast("Media info: FileInfo row above the timeline.");
        break;
      case "screenshot":
        setContextToast("Screenshot — coming soon (Mark Player).");
        break;
      case "open_folder":
        void handleOpenFolderClick();
        break;
      case "open_playlist_file":
        void handleOpenPlaylistFile();
        break;
      case "save_playlist_file":
        void handleSavePlaylistFile();
        break;
      case "import_markers_json":
        menuHandlersRef.current.onImportMarkersJson();
        break;
      case "import_markers_xml":
        void handleImportMarkersXml();
        break;
      case "import_cutsheet":
        void handleOpenCutsheetFile();
        break;
      case "volume_up":
        syncVolume(Math.min(1, volume + 0.1), isMuted);
        break;
      case "volume_down":
        syncVolume(Math.max(0, volume - 0.1), volume - 0.1 <= 0 ? true : isMuted);
        break;
      case "audio_track_next": {
        const video = videoRef.current as (HTMLVideoElement & { audioTracks?: { length: number; [index: number]: { enabled: boolean; label?: string; language?: string } } }) | null;
        if (!video || !video.audioTracks || !video.audioTracks.length) {
          setContextToast("Audio tracks: only one track (or not supported).");
          break;
        }
        const tracks = Array.from({ length: video.audioTracks.length }, (_, i) => video.audioTracks![i]);
        const currentIndex = tracks.findIndex((t) => t.enabled);
        const next = tracks[(currentIndex + 1) % tracks.length];
        tracks.forEach((t) => { t.enabled = false; });
        next.enabled = true;
        setContextToast(`Audio track: ${next.label || next.language || `#${currentIndex + 2}`}`);
        break;
      }
      case "audio_device":
        setContextToast("Audio device — system setting (stub).");
        break;
      case "frame_step_back":
        seekBy(-1);
        break;
      case "frame_step_forward":
        seekBy(1);
        break;
      case "jump_to_time":
        setContextToast("Jump to Time — coming soon.");
        break;
      case "speed_0_5":
        setMenuSpeed(0.5);
        break;
      case "speed_1":
        setMenuSpeed(1);
        break;
      case "speed_1_5":
        setMenuSpeed(1.5);
        break;
      case "speed_2":
        setMenuSpeed(2);
        break;
      case "loop_toggle": {
        const video = videoRef.current;
        if (!video) break;
        video.loop = !video.loop;
        setContextToast(video.loop ? "Loop: on." : "Loop: off.");
        break;
      }
      case "float_on_top":
        void toggleAlwaysOnTop();
        break;
      case "always_on_top":
        void toggleAlwaysOnTop();
        break;
      case "aspect_ratio":
        setContextToast("Aspect Ratio — fit by default (stub).");
        break;
      case "subtitle_file":
        menuHandlersRef.current.onImportSrt();
        break;
      case "subtitle_show":
        setSubtitlesVisible((v) => !v);
        break;
      case "subtitle_remove":
        removeSubtitlesForCurrent();
        break;
      case "subtitle_track":
        setContextToast("Subtitle Track — stub.");
        break;
      case "subtitle_delay":
        setContextToast("Subtitle Delay — stub.");
        break;
      case "subtitle_style":
        setContextToast("Subtitle Style — stub.");
        break;
      case "show_controls":
        setShowTransport(true);
        break;
      case "show_markers_panel":
        setContextToast("Markers Panel — stub (see Marker Bar).");
        break;
      case "show_comments":
        setContextToast("Markers");
        openCommentsPanel("comment");
        break;
      case "theme":
        setContextToast("Theme — dark by default (stub).");
        break;
      case "minimize":
        void minimizeWindow();
        break;
      case "zoom":
        void zoomWindow();
        break;
      case "bring_all_front":
        // tb_1791172090_2308_6 п.6: настоящий подъём всех окон, не заглушка.
        if (!isTauriRuntimeSync()) {
          setContextToast("Single window in browser.");
          break;
        }
        void import("./lib/nativeWindow").then(async ({ bringAllWindowsToFront }) => {
          const ok = await bringAllWindowsToFront();
          if (!ok) setContextToast("No windows to raise.");
        });
        break;
      case "comments_panel":
        openCommentsPanel("comment");
        break;
      case "load_module_index":
        void performLoadModuleIndex();
        break;
      case "module_review_panel":
        void performOpenModuleReview();
        break;
      case "load_module_playlist":
        setContextToast("Load Playlist/Scanner Module — coming soon.");
        break;
      case "load_module_nle":
        setContextToast("Load CUT NLE Module — coming soon.");
        break;
      case "load_module_thalamus":
        setContextToast("Load THALAMUS Task Board — coming soon.");
        break;
      case "mcp_status":
        setContextToast("MCP Status — stub.");
        break;
      case "convert_transcode":
        setContextToast("Convert/Transcode — stub (Mark Player).");
        break;
      case "help":
        setContextToast("Mark Player: open a video, mark moments (F favorite, N negative, I/O in/out, M comment), export via File → Export.");
        break;
      case "shortcuts":
        setContextToast("Hotkeys: J/K/L, I/O, F/M/N, ←/→, Space, ⌘O, ⌘S.");
        break;
      case "playlist_panel":
        void openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500);
        break;
      case "chat":
      case "chat_panel":
      case "load_module_chat":
      case "phonebook_panel":
      case "chat_history_panel":
        // Bell №4 + вердикт оператора: AI chat заявлен в меню (disabled soon),
        // в интерфейсе мёртвых кнопок нет. Defensive: любой путь сюда — честно.
        setContextToast("AI chat is a separate module — coming soon.");
        break;
      case "task_board":
        setContextToast("Task Board — coming soon (THALAMUS).");
        break;
      case "export_edl":
        void performExportEdl();
        break;
      case "export_otio":
        setContextToast("Export OTIO — coming soon (NLE).");
        break;
      case "about":
        void openPanelWindow("panel-about", "about", "About Mark Player", 400, 560);
        break;
      case "feedback":
        void openExternalLink(FEEDBACK_MAILTO);
        break;
      case "github":
        void openExternalLink(GITHUB_REPO_URL);
        break;
      case "releases":
        void openExternalLink(GITHUB_RELEASES_URL);
        break;
      case "updates":
        // tb_1790710861_12931_16: настоящая проверка изнутри приложения.
        // Вне десктопа (браузер) апдейтера нет — честный фолбэк на релизы.
        if (!isTauriRuntimeSync()) {
          void openExternalLink(GITHUB_RELEASES_URL);
          break;
        }
        void runManualUpdateCheck();
        break;
    }
  };

  // tb_1790710861_12931_16: настоящая проверка обновлений изнутри приложения
  // (tauri-plugin-updater). Объект Update живёт в ref между check и install.
  const pendingUpdateRef = useRef<Update | null>(null);

  function updaterDeps() {
    return {
      currentVersion: __APP_VERSION__,
      check: async () => {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = await check();
        if (!u) return null;
        pendingUpdateRef.current = u;
        return { version: u.version, currentVersion: u.currentVersion };
      },
      downloadAndInstall: async (onProgress: (downloaded: number, total: number | null) => void) => {
        const u = pendingUpdateRef.current;
        if (!u) throw new Error("update object lost");
        let downloaded = 0;
        let total: number | null = null;
        await u.downloadAndInstall((e) => {
          if (e.event === "Started") {
            total = e.data.contentLength ?? null;
          } else if (e.event === "Progress") {
            downloaded += e.data.chunkLength;
            onProgress(downloaded, total);
          }
        });
        pendingUpdateRef.current = null;
      },
      relaunch: async () => {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
      toast: (msg: string) => setContextToast(msg),
    };
  }

  async function runManualUpdateCheck(): Promise<void> {
    await checkForUpdatesNow(updaterDeps());
  }

  async function openExternalLink(url: string): Promise<void> {    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      // Фолбэк как в About: ссылка в clipboard + тост, а не молчание.
      try {
        await navigator.clipboard.writeText(url);
        setContextToast("Link copied.");
      } catch {
        setContextToast(`Link: ${url}`);
      }
    }
  }

  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    let disposed = false;
    // tb_1791156671_82609_1: пересборка при смене видимости субтитров (чекбокс ✓).
    // tb_1791143015_70644_7: и при смене тумблера In–Out Play (чекбокс ✓).
    void import("./lib/cutPlayerMenu").then(async ({ applyCutPlayerMenu }) => {
      await applyCutPlayerMenu(
        (action) => {
          if (!disposed) menuActionRef.current(action);
        },
        { subtitlesVisible, inOutPlayOn },
      );
    });
    return () => { disposed = true; };
  }, [subtitlesVisible, inOutPlayOn]);

  useEffect(() => {
    // tb_1791146301_70644_14 п.1: трейс геометрии на каждом приземлившемся
    // переходе — улики для плавающего «пол-экрана чёрного», видно в консоли
    // оператора и через vetkaPlayerLab.fullscreenTrace().
    const logFullscreenTrace = (landed: boolean) => {
      const trace = captureFullscreenTrace({
        isFullscreen: landed,
        windowInnerWidth: Number(window.innerWidth || 0),
        windowInnerHeight: Number(window.innerHeight || 0),
        devicePixelRatio: Number(window.devicePixelRatio || 1),
        shellRect: rectOf(shellRef.current),
        viewerRect: rectOf(viewerRef.current),
        videoRect: rectOf(videoRef.current ?? imageRef.current),
      });
      fsTraceRef.current = trace;
      if (isFullscreenLayoutSane(trace)) {
        console.debug("[Mark Player] fullscreen geometry:", trace);
      } else {
        console.warn("[Mark Player] fullscreen geometry INSANE (half-black signature):", trace);
      }
    };
    const settleAfterFlip = (landed: boolean) => {
      // Гонка layout vs fullscreenchange: ResizeObserver мог стрельнуть
      // посередине перехода (половинные rect) или не стрельнуть вовсе
      // (шелл был прибит px-пином). Даём layout два кадра, перечитываем геометрию.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setGeometryTick((tick) => tick + 1);
        logFullscreenTrace(landed);
      }));
    };
    const syncFullscreen = async () => {
      let next: boolean;
      if (isTauriRuntimeSync()) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          next = await getCurrentWindow().isFullscreen();
        } catch { return; }
      } else {
        next = Boolean(document.fullscreenElement);
      }
      // Оптимистично фиксируем в ref до setState: повторный опрос из соседнего
      // resize-события не должен устраивать двойной settle.
      if (next === isFullscreenRef.current) return;
      isFullscreenRef.current = next;
      setIsFullscreen(next);
      if (fsTransitionTimerRef.current !== null) {
        window.clearTimeout(fsTransitionTimerRef.current);
        fsTransitionTimerRef.current = null;
      }
      setFsTransition(false);
      settleAfterFlip(next);
    };
    void syncFullscreen();
    const onFsChange = () => void syncFullscreen();
    document.addEventListener("fullscreenchange", onFsChange);
    let unlistenWin: (() => void) | null = null;
    if (isTauriRuntimeSync()) {
      void import("@tauri-apps/api/event").then(({ listen }) => {
        listen("tauri://resize", onFsChange).then((fn) => { unlistenWin = fn; }).catch(() => {});
      }).catch(() => {});
    }
    window.addEventListener("resize", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", onFsChange);
      unlistenWin?.();
    };
  }, []);

  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);

  // tb_1792438559_20717_1 / 0.26: инспекция контейнера при смене файла. Два
  // seek в Rust, файл не читается. С 0.26 файлы выше порога asset-транспорта
  // уходят на loopback Range-сервер (toAssetUrl), поэтому упреждающего
  // предупреждения нет: причина устранена на транспорте. Инспекция остаётся
  // уликой для onError/сторожа тишины — там назовём транспорт, а не размер.
  useEffect(() => {
    if (!currentFilePath || !isTauriRuntimeSync()) {
      setMediaContainerInfo(null);
      return;
    }
    let cancelled = false;
    setMediaContainerInfo(null);
    void inspectMediaContainer(currentFilePath).then((info) => {
      if (cancelled) return;
      setMediaContainerInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [currentFilePath]);

  // tb_1792438559_20717_1: сторож тишины. onError у asset-протокола не
  // выстреливает — файл просто висит без кадра. Если через 15с метаданных
  // нет (readyState < HAVE_METADATA) или поток не готов (HAVE_FUTURE_DATA) —
  // это тот самый молчащий случай: говорим причину вслух.
  useEffect(() => {
    if (!src || !mediaContainerInfo) return;
    if (mediaKind !== "video" && mediaKind !== "audio") return;
    const timer = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && video.readyState >= 3) return;
      if (src.startsWith("blob:")) return;
      setMediaProblem(mediaLoadProblemReason(currentFilePathRef.current ?? fileName ?? "media", mediaContainerInfo));
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [src, mediaContainerInfo, mediaKind, fileName]);

  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ path: string; questionId?: string; entry?: Record<string, unknown>; entryIndex?: number }>("playlist:play", (event) => {
        const path = event.payload?.path;
        if (!path) return;
        autoplayOnLoadRef.current = true;
        const qid = event.payload?.questionId ?? null;
        // tb_1791876286_57716_1: точная запись из панели (индекс/объект) —
        // резолвим раз и везём вниз, иначе first-match поднимал сиблинга A.
        const { entry: playEntry, index: playIndex } = resolveActiveEntry(loadPlaylist()?.entries, {
          entryIndex: event.payload?.entryIndex ?? null,
          entry: event.payload?.entry ?? null,
          path,
          questionId: qid,
        });
        activateQuestionFor(path, qid, playEntry, playIndex);
        currentEntryRef.current = { path, questionId: qid, index: playIndex >= 0 ? playIndex : null };
        // tb_1791865804_84020_6: явный вопрос едет в открытие — успех
        // подтвердит его же, а не первую запись пути.
        void handleOpenPath(path, { questionId: qid, entry: playEntry, entryIndex: playIndex });
        // tb_1791688104_1275_2: ножницы везде — ручной клик по записи тоже
        // стартует с первой [ (вопрос — штатный эффект; ножницы OFF — как
        // раньше, с 0/Resume). handleOpenPath выше флаг гасит, взводим после
        // него; сик одноразовый, скраб и сики потом без ограничений.
        advanceInSeekRef.current = inOutPlayOnRef.current && qid === null ? path : null;
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  // tb_1791521998_11250_5: клик по записи-вопросу ведёт к in (медиа грузится
  // асинхронно — ждём duration, потом прыгаем).
  // tb_1791819024_26192_2: follow-переключение карточкой НЕ дёргает playhead:
  // он уже внутри скобок (проверка ниже), прыжок только с чужой точки.
  // tb_1791848907_63972_2: эффект бежит раньше follow и видел СТАРЫЙ вопрос —
  // любой прыжок из него дёргался назад (баунс cmd/shift-вперёд). Теперь
  // приземление внутри ЛЮБОГО вопроса — без рывка (карточку подхватит
  // follow), рывок только из щели.
  useEffect(() => {
    if (!activeQuestion) {
      questionSnapSuspendedRef.current = false;
      questionSnapKeyRef.current = null;
      return;
    }
    if (questionPathRef.current !== currentFilePathRef.current) return;
    const questionKey = `${questionPathRef.current ?? ""}|${activeQuestion.question_id ?? ""}|${activeQuestion.in_sec ?? ""}|${activeQuestion.out_sec ?? ""}`;
    if (questionSnapKeyRef.current !== questionKey) {
      questionSnapKeyRef.current = questionKey;
      questionSnapSuspendedRef.current = false;
    }
    const t = activeQuestion.in_sec;
    if (t === undefined || !(t >= 0) || !(t < duration)) return;
    const nowT = Number(videoRef.current?.currentTime ?? currentTime);
    if (!Number.isFinite(nowT)) return;
    const inT = Number(activeQuestion.in_sec);
    const outT = Number(activeQuestion.out_sec);
    const insideWindow = Number.isFinite(inT) && Number.isFinite(outT) && nowT >= inT && nowT <= outT;
    if (insideWindow) questionSnapSuspendedRef.current = false;
    // tb_1792439791_49541_5: во время play перетаскивание плейхеда за скобки
    // возвращалось к IN (и выглядело как «прыгнул назад и остановился»).
    // Ручной сик уважаем и после 800-мс окна ножниц; снап снова включается,
    // только когда плейхед сам вошёл в окно вопроса.
    if (isManualSeekSuppressed()) {
      if (!insideWindow) questionSnapSuspendedRef.current = true;
      return;
    }
    if (questionSnapSuspendedRef.current) return;
    // tb_1791871361_84020_1: ножницы ON — выход за OUT ведёт tail-advance
    // (следующее видео едет async-аттачем); снап назад гонялся с аттачем
    // и давал 3-5 повторов одной записи. Ножницы OFF — как раньше.
    const snap = resolveQuestionSnapTime(loadPlaylist()?.entries, currentFilePathRef.current, nowT, activeQuestion, inOutPlayOnRef.current);
    if (snap === null) return;
    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = snap;
      } catch {
        // ignore — останется внешнее
      }
    }
    setSeekTarget(snap);
  }, [activeQuestion, duration, currentTime]);

  // tb_1791819024_26192_2: карточка следует за playhead внутри одного файла
  // (капча: 28 слайдов — один mp4, смена файла не стреляет). Нашли чужую
  // запись под секундой — переключаем; вне скобок держим последнюю (без
  // мигания); ввод не теряем (dirty-guard + один тост на вопрос).
  useEffect(() => {
    if (mediaKind !== "video" || !currentFilePath) return;
    // tb_1791865804_84020_6: транзит на другой файл — карточкой владеет
    // открывающий тракт (playlist:play/handleOpenPath уже активировали
    // нужную); follow здесь видел СТАРЫЙ файл и откатывал карточку назад.
    if (questionPathRef.current !== null && questionPathRef.current !== currentFilePath) return;
    let hit: QuestionEntry | null = null;
    try {
      hit = findQuestionEntryAtTime(loadPlaylist()?.entries, currentFilePath, currentTime);
    } catch {
      return;
    }
    if (!hit?.question_id) return;
    if (hit.question_id === activeQuestion?.question_id && questionPathRef.current === currentFilePath) return;
    if (questionComment.trim() !== "" || questionChoice !== null) {
      if (followBlockedRef.current !== hit.question_id) {
        followBlockedRef.current = hit.question_id;
        setContextToast(`Question ${hit.question_id} is here — finish or clear your input to switch.`);
      }
      return;
    }
    followBlockedRef.current = null;
    activateQuestionFor(currentFilePath, hit.question_id, hit);
  }, [currentTime, currentFilePath, mediaKind, activeQuestion, questionComment, questionChoice]);

  // tb_1791686462_1275_1: авто-старт plain-записи со штатной [ скобки —
  // вопроса нет (activeQuestion пуст), а скобки на шкале есть. Разовый флаг
  // из commitAdvance; срабатывает когда подтянулись duration и маркеры
  // нового файла. Скобки нет — молча с нуля, как раньше.
  useEffect(() => {
    if (activeQuestion) return;
    const pending = advanceInSeekRef.current;
    if (!pending || pending !== currentFilePathRef.current || duration <= 0) return;
    advanceInSeekRef.current = null;
    const at = firstInAnchor(
      mediaMarkers.filter((m) => m.kind === "in").map((m) => m.anchor_sec),
      duration,
    );
    if (at === null) return;
    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = at;
      } catch {
        // ignore — останется внешнее
      }
    }
    setSeekTarget(at);
  }, [activeQuestion, duration, mediaMarkers, currentFilePath]);

  // tb_1791146301_70644_17: прыжки плейхеда из окна всех маркеров.
  // Браузер: localStorage-мост (storage стреляет только в чужом документе).
  useEffect(() => {
    const onStorageSeek = (event: StorageEvent) => {
      if (event.key !== PLAYER_SEEK_REQUEST_KEY) return;
      const sec = parseSeekRequest(event.newValue);
      if (sec === null) return;
      const video = videoRef.current;
      if (video) {
        video.currentTime = sec;
        setSeekTarget(sec);
        // tb_1791843935_63972_2: клик-сик из панели — навигация.
        markManualSeek();
      }
    };
    window.addEventListener("storage", onStorageSeek);
    return () => window.removeEventListener("storage", onStorageSeek);
  }, []);

  // Tauri: событие markers:seek от панели.
  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ sec: number }>("markers:seek", (event) => {
        const sec = Number(event.payload?.sec);
        if (!Number.isFinite(sec) || sec < 0) return;
        const video = videoRef.current;
        if (video) {
          video.currentTime = sec;
          setSeekTarget(sec);
          // tb_1791843935_63972_2: клик-сик из панели — навигация.
          markManualSeek();
        }
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  // tb_1791233039_7043_3: play-запрос из окна плейлиста, браузер/dev.
  // Браузер: localStorage-мост (storage стреляет только в чужом документе).
  useEffect(() => {
    const onStoragePlay = (event: StorageEvent) => {
      if (event.key !== PLAYER_PLAY_REQUEST_KEY) return;
      const request = parsePlayRequest(event.newValue);
      if (!request) return;
      autoplayOnLoadRef.current = true;
      const { entry: reqEntry, index: reqIndex } = resolveActiveEntry(loadPlaylist()?.entries, {
        entryIndex: request.entryIndex ?? null,
        entry: request.entry ?? null,
        path: request.path,
        questionId: request.questionId ?? null,
      });
      activateQuestionFor(request.path, request.questionId ?? null, reqEntry, reqIndex);
      currentEntryRef.current = { path: request.path, questionId: request.questionId ?? null, index: reqIndex >= 0 ? reqIndex : null };
      void handleOpenPath(request.path, { questionId: request.questionId ?? null, entry: reqEntry, entryIndex: reqIndex });
    };
    window.addEventListener("storage", onStoragePlay);
    return () => window.removeEventListener("storage", onStoragePlay);
  }, []);

  // tb_1791143015_70644_7: тумблер In–Out Play из окна плейлиста.
  useEffect(() => {
    const onStorageToggle = (event: StorageEvent) => {
      if (event.key !== INOUT_PLAY_STORAGE_KEY) return;
      const next = readInOutPlayEnabled();
      inOutPlayOnRef.current = next;
      setInOutPlayOn(next);
    };
    window.addEventListener("storage", onStorageToggle);
    return () => window.removeEventListener("storage", onStorageToggle);
  }, []);

  useDragDrop({
    onDrop: (paths) => {
      if (paths.length > 0) { void handleOpenPath(paths[0]); }
    },
  });

  function attachSource(nextUrl: string, name: string) {
    setMediaProblem("");
    setSrc((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return nextUrl;
    });
    setMediaKind(inferMediaKind(name));
    setFileName(name);
    setNaturalSize({ width: 0, height: 0 });
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    firstFramePrimedRef.current = false;
    autoSizedKeyRef.current = "";
    // tb_1791233039_7043_3: autoplay ждёт <video> — картинки его не дождутся,
    // протухший флаг гасим сразу, а не на следующем видео.
    // tb_1791571305_29299_2: аудио играется тем же <video> — флаг живёт.
    const attachedKind = inferMediaKind(name);
    if (attachedKind !== "video" && attachedKind !== "audio") autoplayOnLoadRef.current = false;
  }

  function attachFile(file: File) {
    // Open-gate: браузерный input уже отфильтровал по MIME, но перепроверяем —
    // единая дверь для всех путей.
    const playability = mediaPlayability(file.name, file.type);
    if (playability !== "native") {
      stopPlaybackForRefusal();
      setRefusalToast(mediaRefusalReason(file.name, playability));
      return;
    }
    refreshContentHash({ file });
    const nextUrl = URL.createObjectURL(file);
    // tb_1792438559_20717_1: blob — не путь, контейнерная улика прежнего
    // файла к нему не относится.
    setMediaContainerInfo(null);
    attachSource(nextUrl, file.name);
  }

  // tb_1791662784_27409_3: автопереход плейлиста — общий для onEnded и
  // OUT-хвоста ножниц (черновой монтаж: последнее OUT ведёт на следующее
  // видео). Возвращает false, когда идти некуда (нет плейлиста/следующего).
  function advanceToNextEntry(): boolean {
    // 0.10.19: shuttle level must die with the clip,
    // or the next file inherits a lying badge.
    stopShuttleRef.current();
    // tb_1791233024_7043_1: досмотрено до конца —
    // Resume начнёт сначала, а не с титров.
    recordPlaybackPositionExact(currentFilePathRef.current, 0);
    // tb_1791685802_1275_3: метка played-through больше не пишется —
    // гейт снесён, ножницы работают с первого кадра.
    const pl = loadPlaylist();
    if (!pl) return false;
    // tb_1791865711_84020_5: переход от курсора записи (путь + вопрос), а не
    // от findIndex-первого совпадения пути — дубли path уводили назад.
    const cursor = currentEntryRef.current.path ? currentEntryRef.current : { path: currentFilePath };
    const found = getNextEntryFromCursor(pl, cursor, loadPlaybackMode());
    if (!found) return false;
    const next = found.entry;
    const nextQuestionId = (next as QuestionPlaylistEntry).question_id ?? null;
    if (next.path === currentFilePath) {
      // tb_1791876286_57716_1: src тот же — перезагрузки и loadedmetadata
      // нет, но запись ДРУГАЯ: карточка/окно/курсор — от next-записи, плюс
      // ЯВНЫЙ сик на её in. Было: молчаливый перезапуск с нуля — B-стороны
      // (trk-10: то же видео, другое окно) стартовали с начала.
      // loop one / единственная plain-запись: окна нет — как раньше, с нуля.
      activateQuestionFor(next.path, nextQuestionId, next, found.index);
      currentEntryRef.current = { path: next.path, questionId: nextQuestionId, index: found.index };
      const video = videoRef.current;
      const inT = normalizeQuestionEntry(next as unknown as Record<string, unknown>).in_sec;
      if (video) {
        if (typeof inT === "number" && Number.isFinite(inT) && inT >= 0 && inT < (duration || Infinity)) {
          try {
            video.currentTime = inT;
          } catch {
            // ignore — останется внешнее
          }
          setSeekTarget(inT);
        } else {
          try {
            video.currentTime = 0;
          } catch {
            // ignore — останется внешнее
          }
        }
        void video.play().catch(() => {});
      }
      return true;
    }
    // tb_1791233039_7043_3: автопереход — тоже играть,
    // а не молча открывать (регрессия autoplay 0.10.14).
    autoplayOnLoadRef.current = true;
    setProbeResult(null);
    probeFile(next.path, playerLabApiBase).then(setProbeResult);
    // tb_1791681499_1275_4: два дефекта авто-пути. (1) kind выводили из
    // next.name (в записях без расширения — null) — mediaKind null
    // размонтировал транспорт при живом видео; берём хвост path, как
    // ручной путь. (2) currentFilePath коммитили ДО успеха загрузки —
    // при мёртвой записи UI врал (имя новое, кадр старый, маркеры чужие);
    // коммитим только на успешном attach + шлём playlist:current
    // (подсветка панели), иначе тост с basename и стоим на текущем.
    const nextName = next.path.split("/").pop() || next.name || "media";
    const commitAdvance = (attach: () => void) => {
      setCurrentFilePath(next.path);
      // tb_1791683106_1275_5: авто-старт с IN как ручной клик — поднимаем
      // вопрос next-записи; существующий эффект [activeQuestion, duration]
      // прыгнет на in_sec когда подтянется duration. Нет вопроса — clear.
      // tb_1791876286_57716_1: поднимаем ТОЧНУЮ next-запись (не first-match
      // по qid) + индекс в курсор, иначе B-стороны получали окно A.
      activateQuestionFor(next.path, nextQuestionId, next, found.index);
      currentEntryRef.current = { path: next.path, questionId: nextQuestionId, index: found.index };
      // tb_1791686462_1275_1: plain-запись без вопроса — авто-старт со
      // штатной [ скобки (разовый флаг, добьёт эффект выше). Ветвь
      // с вопросом — штатный эффект, флаг гасим.
      // tb_1791688104_1275_2: дыра 0.25.47 — флаг взводился и при
      // выключенных ножницах; OFF = как раньше, с нуля.
      advanceInSeekRef.current = nextQuestionId === null && inOutPlayOnRef.current ? next.path : null;
      // tb_1791233024_7043_1: автопереход идёт мимо handleOpenPath —
      // запоминаем вручную (только на успехе).
      recordPlaybackPositionExact(next.path, 0);
      if (isTauriRuntimeSync()) {
        void import("@tauri-apps/api/event").then(({ emit }) => {
          emit("playlist:current", { path: next.path }).catch(() => {});
        }).catch(() => {});
      }
      attach();
    };
    const failAdvance = () => {
      autoplayOnLoadRef.current = false;
      advanceInSeekRef.current = null;
      setContextToast(`Cannot open ${nextName} — file unreachable, staying on current.`);
    };
    void toAssetUrl(next.path).then((assetUrl) => {
      if (assetUrl) {
        // tb_1792025130_97848_4: attachSource сам хеш не считает (только
        // handleOpenPath/attachFile) — окно комментов и бар фильтровали по
        // старому хешу прошлого видео. Считаем, как ручное открытие.
        refreshContentHash({ path: next.path });
        commitAdvance(() => attachSource(assetUrl, nextName));
        return;
      }
      fetch(next.path).then((r) => {
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        return r.blob();
      }).then((blob) => {
        const file = new File([blob], nextName, { type: blob.type });
        commitAdvance(() => attachFile(file));
      }).catch(failAdvance);
    }).catch(failAdvance);
    return true;
  }

  // 0.22: окно комментов получает и chash — та же identity, что у main
  // (копия видео показывает свои метки и там). Хеша нет — как раньше.
  function withContentHash(query: string | undefined): string | undefined {
    const hash = contentHashRef.current;
    if (!query || !hash) return query;
    return `${query}&chash=${encodeURIComponent(hash)}`;
  }
  // 0.22: пересчёт content-hash identity при каждом открытии. Хеш едет
  // асинхронно (сэмпл 128KB + SHA-256 — миллисекунды, но чтение всё равно
  // не блокирует attach): токен отбрасывает опоздавший результат, если
  // пользователь уже открыл следующий файл.
  function refreshContentHash(target: { path?: string; file?: File }): void {
    const token = ++contentHashTokenRef.current;
    contentHashRef.current = null;
    setContentHash(null);
    void resolveMediaContentHash(target).then((hash) => {
      if (contentHashTokenRef.current !== token) return;
      contentHashRef.current = hash;
      setContentHash(hash);
    });
  }

  // 0.22: честный сайдкар в UI — метки подтянулись по содержимому, а не по
  // пути (копия/переименование). Обычное открытие молчит, чтобы не шуметь.
  const announcedHashLinkRef = useRef("");
  useEffect(() => {
    if (!contentHash || !currentMediaKey) return;
    const key = `${currentMediaKey}|${contentHash}`;
    if (announcedHashLinkRef.current === key) return;
    announcedHashLinkRef.current = key;
    const byHash = markers.filter((m) => m.content_hash === contentHash).length;
    if (byHash === 0) return;
    const byPath = markers.filter((m) => !m.content_hash && m.media_path === currentMediaKey).length;
    if (byPath > 0) return;
    setContextToast(
      `Linked ${byHash} marker${byHash === 1 ? "" : "s"} by content — copies and renames keep your notes.`,
    );
  }, [contentHash, currentMediaKey, markers]);

  async function handleOpenPath(path: string, opts?: { questionId?: string | null; entry?: unknown; entryIndex?: number | null }) {
    // tb_1791686462_1275_1: ручное открытие — без авто-сика на [,
    // чужой взведённый флаг гасим (ручной тракт не меняем).
    advanceInSeekRef.current = null;
    if (isSameMediaPath(path, currentFilePathRef.current)) {
      // 0.10.22: клик по уже открытому файлу — src не меняется, loadedmetadata
      // не выстрелит, а сброс naturalSize схлопнул бы сцену до 1px. No-op + resume.
      // tb_1791876286_57716_1: НО тот же файл — другая запись (trk-10 A→B
      // кликом: то же видео, другое окно): карточка и окно — от новой записи,
      // playhead — ЯВНО на её in (перезагрузки нет — сик руками).
      const qid = opts?.questionId ?? null;
      const { entry: sameEntry, index: sameIndex } = resolveActiveEntry(loadPlaylist()?.entries, {
        entryIndex: opts?.entryIndex ?? null,
        entry: opts?.entry && typeof opts.entry === "object"
          ? (opts.entry as { path?: unknown; question_id?: unknown; in_sec?: unknown; out_sec?: unknown })
          : null,
        path,
        questionId: qid,
      });
      const cur = currentEntryRef.current;
      const sameAsCurrent = cur.path === path &&
        (qid == null || cur.questionId === qid) &&
        (sameIndex < 0 || cur.index == null || cur.index === sameIndex);
      if (sameEntry && !sameAsCurrent) {
        const sameQid = (sameEntry as QuestionEntry).question_id ?? qid;
        switchCardToQuestion(path, sameQid, sameEntry, sameIndex);
        currentEntryRef.current = { path, questionId: sameQid, index: sameIndex >= 0 ? sameIndex : null };
        const inT = normalizeQuestionEntry(sameEntry as unknown as Record<string, unknown>).in_sec;
        const current = videoRef.current;
        if (current) {
          if (typeof inT === "number" && Number.isFinite(inT) && inT >= 0 && inT < (duration || Infinity)) {
            try {
              current.currentTime = inT;
            } catch {
              // ignore — останется внешнее
            }
            setSeekTarget(inT);
          }
          if (current.paused) {
            void current.play().catch(() => {});
          }
        }
        autoplayOnLoadRef.current = false;
        return;
      }
      const current = videoRef.current;
      if (current && current.paused) {
        void current.play().catch(() => {});
      }
      // tb_1791233039_7043_3: играть уже играет (или нечему) — флаг погашен,
      // иначе выстрелит на СЛЕДУЮЩЕМ открытии.
      autoplayOnLoadRef.current = false;
      return;
    }
    // Open-gate: стартовый open files / drop / плейлист / ?src= шли мимо
    // диалога прямо в <video> → чёрный экран. Отказ — до probe и attach,
    // предыдущее медиа остаётся.
    const playability = mediaPlayability(path);
    if (playability !== "native") {
      stopPlaybackForRefusal();
      setRefusalToast(mediaRefusalReason(path, playability));
      autoplayOnLoadRef.current = false;
      return;
    }
    setCurrentFilePath(path);
    // tb_1791333803_37784_1: новое видео гасит превью чужого листа.
    clearCutsheetPreview();
    // tb_1791233024_7043_1: Resume — открытие по пути запоминаем сразу
    // (позиция 0, дальше её уточнят пауза и троттл timeupdate).
    recordPlaybackPositionExact(path, 0);
    // 0.22: identity содержимого — параллельно с probe, открытию не мешает.
    refreshContentHash({ path });
    if (isTauriRuntimeSync()) {
      void import("@tauri-apps/api/event").then(({ emit }) => {
        emit("playlist:current", { path }).catch(() => {});
      }).catch(() => {});
    }
    setProbeResult(null);
    probeFile(path, playerLabApiBase).then(setProbeResult);
    // tb_1791876286_57716_1: точная запись из клика/перехода — резолвим раз
    // (иначе first-match поднимал сиблинга A при открытии B).
    const { entry: openedEntry, index: openedIndex } = resolveActiveEntry(loadPlaylist()?.entries, {
      entryIndex: opts?.entryIndex ?? null,
      entry: opts?.entry && typeof opts.entry === "object"
        ? (opts.entry as { path?: unknown; question_id?: unknown; in_sec?: unknown; out_sec?: unknown })
        : null,
      path,
      questionId: opts?.questionId ?? null,
    });
    // tb_1791685802_1275_3: ручное открытие мёртвого пути раньше падало
    // молча (fetch rejection в void-пути playlist:play — оператор: «видео
    // перестали открываться»). Отказ видно, как в авто-пути 0.25.43.
    try {
      const assetUrl = await toAssetUrl(path);
      if (assetUrl) {
        attachSource(assetUrl, path.split("/").pop() || "media");
        rememberInPlaylist(path);
        // tb_1791865804_84020_6: смена носителя — карточка из текущей записи
        // (явный вопрос клика важнее, иначе первая запись пути, иначе гасим).
        const openedQid = (openedEntry as QuestionEntry | null)?.question_id ?? null;
        switchCardToQuestion(path, openedQid, openedEntry, openedIndex);
        // tb_1791865711_84020_5: курсор записи для автоперехода (дубли path).
        // tb_1791876286_57716_1: + индекс (сиблинги делят path+qid).
        currentEntryRef.current = { path, questionId: openedQid, index: openedIndex >= 0 ? openedIndex : null };
        return;
      }
      const response = await fetch(path);
      if (!response.ok) throw new Error(`http ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], path.split("/").pop() || "media", { type: blob.type });
      attachFile(file);
      rememberInPlaylist(path);
      const openedQid = (openedEntry as QuestionEntry | null)?.question_id ?? null;
      switchCardToQuestion(path, openedQid, openedEntry, openedIndex);
      currentEntryRef.current = { path, questionId: openedQid, index: openedIndex >= 0 ? openedIndex : null };
    } catch {
      autoplayOnLoadRef.current = false;
      setContextToast(`Cannot open ${path.split("/").pop() || "media"}.`);
    }
  }

  // 0.10.24: открытое видео само падает в плейлист (add-if-absent, без дублей).
  // tb_1791563210_29299_4: в плейлист-вопрос не дописываем (см. trackOpenedFile).
  function rememberInPlaylist(path: string) {
    try {
      const base = loadPlaylist();
      const updated = trackOpenedFile(base, { path, name: path.split("/").pop() || "media", duration: 0 });
      savePlaylist(updated);
      notifyPlaylistReloaded();
      // tb_1791683106_1275_5: молчаливый отказ трекинга — только вопрос-лист:
      // addEntryIfAbsent возвращает тот же ref лишь при дубле, а дубль
      // исключён проверкой ниже. Подсказываем кнопку New вместо тишины.
      if (updated === base && base && !base.entries.some((e) => e.path === path)) {
        setContextToast("Question list is agent-owned — video not added. Press New in Playlist to collect your own list.");
      }
    } catch {
      // playlist is best-effort — открытию мешать не должен
    }
  }

  async function handleOpenClick(): Promise<string | null> {
    if (isTauriRuntimeSync()) {
      const path = await openFileDialog();
      if (!path) return null;
      await handleOpenPath(path);
      return path;
    } else {
      fileInputRef.current?.click();
      return null;
    }
  }

  async function handleOpenFolderClick(): Promise<void> {
    setContextToast("Open Folder: folders are not supported yet — pick a file.");
    const path = await openFileDialog();
    if (!path) return;
    await handleOpenPath(path);
  }

  async function handleImportMarkersXml(): Promise<void> {
    // File > Import > Markers (XML)…: обратный путь к экспорту — маркеры из
    // XMEML (наш экспорт, Premiere, DaVinci) на файлы, которые плеер знает
    // (открытое видео и плейлист). Неопознанный файл не угадываем.
    if (!isTauriRuntimeSync()) {
      setContextToast("Import Markers (XML) is available in the desktop app only.");
      return;
    }
    try {
      const path = await openFileDialog({ filters: [{ name: "Timeline XML", extensions: ["xml"] }] });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const parsed = parseXmemlMarkers(await readTextFile(path));
      if (!parsed.ok) {
        setContextToast(`Import Markers (XML): ${parsed.error}`);
        return;
      }
      const seqNote = parsed.skippedSequenceMarkers > 0
        ? ` ${parsed.skippedSequenceMarkers} sequence marker${parsed.skippedSequenceMarkers === 1 ? "" : "s"} skipped (timeline time, not tied to a file).`
        : "";
      if (!parsed.groups.length) {
        setContextToast(`No source-clip markers found in this XML.${seqNote}`);
        return;
      }
      const candidates = [
        ...(currentMediaKeyRef.current ? [currentMediaKeyRef.current] : []),
        ...((loadPlaylist()?.entries ?? []).map((e) => e.path)),
      ];
      const snapshot = markersRef.current;
      const added: PlayerTimeMarker[] = [];
      const unmatched: string[] = [];
      let alreadyThere = 0;
      for (const group of parsed.groups) {
        const target = matchGroupToPath(group, candidates);
        if (!target) { unmatched.push(group.name); continue; }
        const isCurrent = target === currentMediaKeyRef.current;
        const hash = isCurrent ? contentHashRef.current : null;
        const existing = snapshot.filter((m) => (isCurrent
          ? markerBelongsToMedia(m, { mediaKey: target, contentHash: hash })
          : m.media_path === target));
        for (const im of group.markers) {
          const dup = existing.some((m) => isSameImportedMarker(m, im, group.fps))
            || added.some((m) => m.media_path === target && isSameImportedMarker(m, im, group.fps));
          if (dup) { alreadyThere += 1; continue; }
          added.push(createImportedMarker(im, target, hash));
        }
      }
      const missing = unmatched.length
        ? ` No matching file in the player for: ${unmatched.slice(0, 3).join(", ")}${unmatched.length > 3 ? `, +${unmatched.length - 3}` : ""}.`
        : "";
      if (!added.length) {
        setContextToast(alreadyThere
          ? `Nothing new: ${alreadyThere} marker${alreadyThere === 1 ? "" : "s"} already present.${missing}${seqNote}`
          : `No markers imported.${missing || " Open the video first, or add it to the playlist."}${seqNote}`);
        return;
      }
      pushMarkerHistory();
      setMarkers((prev) => [...prev, ...added]);
      setContextToast(`Markers imported: ${added.length}${alreadyThere ? ` (${alreadyThere} already present)` : ""}.${missing}${seqNote}`);
    } catch {
      setContextToast("Import Markers (XML): could not read the file.");
    }
  }

  async function handleOpenPlaylistFile(): Promise<void> {
    // File > Open Playlist…: импорт JSON-плейлиста + открытие панели
    // [signal: меню открывает плейлист] [project: cut-player].
    if (!isTauriRuntimeSync()) {
      setContextToast("Open Playlist is available in the desktop app only.");
      return;
    }
    try {
      const path = await openFileDialog({ filters: [{ name: "Playlist JSON", extensions: ["json"] }] });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const { deserializePlaylist } = await import("./lib/playlist");
      const text = await readTextFile(path);
      const fileLabel = path.split(/[\\/]/).pop() || path;
      let parsed = deserializePlaylist(text);
      if (!parsed) {
        // tb_1791685802_1275_3: меню тоже ест рабочие форматы Беты —
        // раньше их знала только панель (оператор: File → Open Playlist
        // молча ничего не делал, а импорт из окна — работал).
        const { importBetaBundleText } = await import("./lib/betaBundles");
        parsed = await importBetaBundleText(text, path);
      }
      if (!parsed) {
        setContextToast(`Not a playlist: ${fileLabel} (needs {entries: [...]} or a Beta bundle).`);
        return;
      }
      savePlaylist(parsed);
      // tb_1791521998_11250_5: ответы лягут рядом с этим файлом
      rememberQuestionPlaylistPath(isQuestionPlaylist(parsed) ? path : null);
      // tb_1791563210_29299_4: уже открытая панель сама не узнает — будим событием
      notifyPlaylistReloaded();
      // tb_1791854416_63972_5: меню открывает видео файла (один path записей) —
      // раньше маркеры материализовались мимо currentMediaKey: Markers пуст,
      // гард гасил Confirm (окно плейлиста работает, т.к. оператор открывает
      // видео сам). Несколько разных — не гадаем, оператор выберет записью.
      let openedBase: string | null = null;
      if (isTauriRuntimeSync() && isQuestionPlaylist(parsed)) {
        const single = singlePlaylistMediaPath(parsed.entries);
        if (single) {
          const target = decideMarkersImportTarget(
            { mediaPath: single, contentHash: null },
            currentFilePathRef.current,
            true,
          );
          if (target.mode === "open") {
            await handleOpenPath(target.path);
            openedBase = target.path.split(/[\\/]/).pop() || target.path;
          }
        }
      }
      // tb_1791840835_63972_1: меню материализует вопросы так же, как панель
      // (раньше клало записи без маркеров — карточка молчала по гарду;
      // имя — fileLabel, поля name у файла Беты нет). Персист — эффектом
      // markers→LS, чужие окна — событием.
      const loadedLine = await materializePlaylistQuestions(parsed, fileLabel, {
        // tb_1791861762_84020_3: дедуп по паре id+медиа — тот же вопрос на
        // другом видео материализуется заново, а не режется как дубль.
        readStoredKeys: () => new Set(markersRef.current.map((m) => markerDedupKey(m.marker_id, m.media_path, m.anchor_sec))),
        appendMarkers: (fresh) => setMarkers((prev) => [...prev, ...(fresh as unknown as PlayerTimeMarker[])]),
        resolveMediaUrl: (p) => toAssetUrl(p),
        notifyChanged: () => notifyMarkersChanged(),
      });
      // tb_1792025130_97848_4: импорт обычного мульти-видео листа раньше
      // визуально ничего не делал (видео не открывалось — только тост).
      // Слово оператора 15.10: сразу показывать первое playable-видео
      // на СТОПЕ (без автоплея); окно плейлиста открывается ниже, как раньше.
      if (!openedBase && Array.isArray(parsed.entries) && parsed.entries.length > 0) {
        const first = parsed.entries.find(
          (e) => e && typeof e.path === "string" && mediaPlayability(e.path) === "native",
        );
        if (first) {
          autoplayOnLoadRef.current = false;
          await handleOpenPath(first.path);
          openedBase = first.path.split(/[\\/]/).pop() || first.path;
        }
      }
      setContextToast(openedBase ? `Opened ${openedBase}. ${loadedLine}` : loadedLine);
      await openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500);
    } catch {
      setContextToast("Open Playlist: could not read the file.");
    }
  }

  async function handleOpenCutsheetFile(): Promise<void> {
    // File > Import > Cutsheet preview: открыть .cutsheet.json (ADR-06)
    // для ОДНОГО видео — строки листа играют скип-движком In–Out.
    if (!isTauriRuntimeSync()) {
      setContextToast("Cutsheet preview is available in the desktop app only.");
      return;
    }
    try {
      const path = await openFileDialog({ filters: [{ name: "Cutsheet JSON", extensions: ["json"] }] });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      openCutsheetText(await readTextFile(path), path);
    } catch {
      setContextToast("Cutsheet preview: could not read the file.");
    }
  }

  function openCutsheetText(text: string, sheetPath: string): string {
    // Общий путь для меню-диалога и window.vetkaPlayerLab (e2e/агент).
    // Возвращает сообщение (оно же уходит в тост).
    const openPath = currentMediaKeyRef.current;
    if (!openPath) {
      const msg = "Cutsheet preview: open a video first, then its cutsheet.";
      setContextToast(msg);
      return msg;
    }
    const parsed = parseCutsheet(text);
    if (!parsed.ok) {
      const msg = `Cutsheet preview: not a cutsheet (${parsed.error}).`;
      setContextToast(msg);
      return msg;
    }
    const sheetDir = sheetPath.split("/").slice(0, -1).join("/") || ".";
    const resolved = resolveCutsheetForMedia(parsed.doc, sheetDir, openPath);
    if (!resolved.ok) {
      let msg: string;
      switch (resolved.error) {
        case "multi-media":
          msg = `Cutsheet preview: sheet spans ${resolved.mediaCount ?? "?"} files — open it in CUT Player.`;
          break;
        case "foreign-media":
          msg = `Cutsheet preview: sheet is for "${resolved.sheetPath ?? "?"}", current video is "${resolved.openPath ?? openPath}".`;
          break;
        case "bad-ticks":
          msg = `Cutsheet preview: row "${resolved.rowId ?? "?"} has bad ticks (whole numbers, max 2^53).`;
          break;
        case "bad-row":
          msg = `Cutsheet preview: row "${resolved.rowId ?? "?"} has src_out <= src_in.`;
          break;
        default:
          msg = "Cutsheet preview: no playable rows.";
          break;
      }
      setContextToast(msg);
      return msg;
    }
    const preview = { name: parsed.doc.title, segments: resolved.segments };
    cutsheetPreviewRef.current = preview;
    setCutsheetPreview(preview);
    const msg = `Cutsheet "${parsed.doc.title}": ${resolved.segments.length} segment${resolved.segments.length === 1 ? "" : "s"} — preview on.`;
    setContextToast(msg);
    return msg;
  }

  async function handleSavePlaylistFile(): Promise<void> {
    const pl = loadPlaylist() || createEmptyPlaylist();
    if (!pl.entries.length) { setContextToast("Playlist is empty — nothing to save."); return; }
    const ok = await saveFileDialog(JSON.stringify(pl, null, 2), "playlist.json", {
      filters: [{ name: "Playlist JSON", extensions: ["json"] }],
    });
    if (ok) setContextToast("Playlist saved.");
  }

  async function handleOpenMultiple(): Promise<void> {
    if (!isTauriRuntimeSync()) {
      fileInputRef.current?.click();
      return;
    }
    const paths = await openFilesDialog();
    if (!paths || !paths.length) return;
    // Open-gate: в плейлист — только перевариваемое; остальное — честный тост.
    const playable = paths.filter((p) => mediaPlayability(p) === "native");
    const skipped = paths.length - playable.length;
    const pl = loadPlaylist() || createEmptyPlaylist();
    let updated = pl;
    for (const p of playable) {
      const name = p.split(/[\\/]/).pop() || p;
      if (!updated.entries.some((e) => e.path === p)) {
        updated = addEntry(updated, { path: p, name, duration: 0 });
      }
    }
    if (updated !== pl) savePlaylist(updated);
    if (!playable.length) {
      stopPlaybackForRefusal();
      setRefusalToast(`No files added: ${paths.map((p) => mediaRefusalReason(p, mediaPlayability(p))).join(" ")}`);
      return;
    }
    setContextToast(
      `Added ${playable.length} file${playable.length === 1 ? "" : "s"} to playlist` +
        (skipped > 0 ? ` (skipped ${skipped}: needs proxy or not media).` : "."),
    );
    await handleOpenPath(playable[0]);
    void openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500, `path=${encodeURIComponent(playable[0])}`);
  }

  function setMenuSpeed(rate: number) {
    const video = videoRef.current;
    if (!video) return;
    stopShuttleRef.current();
    video.playbackRate = rate;
    setContextToast(`Speed: ${rate}x`);
  }

  async function toggleAlwaysOnTop(): Promise<void> {
    if (!isTauriRuntimeSync()) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const next = !(await win.isAlwaysOnTop());
      await win.setAlwaysOnTop(next);
      setContextToast(next ? "Always on Top: on." : "Always on Top: off.");
    } catch {
      setContextToast("Always on Top is not available.");
    }
  }

  async function minimizeWindow(): Promise<void> {
    if (!isTauriRuntimeSync()) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch { /* noop */ }
  }

  async function zoomWindow(): Promise<void> {
    if (!isTauriRuntimeSync()) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch { /* noop */ }
  }

  function syncVolume(nextVolume: number, nextMuted = false) {
    const video = videoRef.current;
    const safeVolume = Math.max(0, Math.min(1, nextVolume));
    setVolume(safeVolume);
    setIsMuted(nextMuted);
    pokeVolumeOsd();
    if (!video) return;
    video.volume = safeVolume;
    video.muted = nextMuted;
  }

  // 1.2: OSD кажет только пользовательские изменения (syncVolume — их
  // единственная точка); sync-back из <video> (loadedmetadata/volumechange)
  // OSD не трогает.
  function pokeVolumeOsd() {
    setVolumeOsdVisible(true);
    if (volumeOsdTimerRef.current) window.clearTimeout(volumeOsdTimerRef.current);
    volumeOsdTimerRef.current = window.setTimeout(() => setVolumeOsdVisible(false), 1500);
  }

  // 1.2: VLC-сценарий — при отказе плеер останавливается и отвечает,
  // а не молча продолжает играть старое.
  function stopPlaybackForRefusal() {
    try {
      videoRef.current?.pause();
    } catch {
      // pause — best-effort, отказу мешать не должен
    }
    setIsPlaying(false);
  }

  function togglePlayback() {
    // 0.10.19: an active shuttle owns playback (reverse = paused video +
    // ReverseShuttle stepping). First press stops the shuttle honestly
    // instead of starting forward play underneath the stepping timer.
    if (shuttle !== 0) {
      stopShuttleRef.current();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime > 0 && video.currentTime < 0.05) {
        video.currentTime = 0;
      }
      void video.play();
    } else {
      video.pause();
    }
  }

  function seekBy(direction: -1 | 1) {
    const video = videoRef.current;
    if (!video) return;
    const limit = duration || video.duration || 0;
    const step = getSeekStep(limit);
    video.currentTime = Math.min(limit, Math.max(0, video.currentTime + direction * step));
    setShowTransport(true);
  }

  function buildMarker(kind: PlayerMarkerKind, text = ""): PlayerTimeMarker | null {
    if (!currentMediaKey) return null;
    const anchor = Math.max(0, Number(videoRef.current?.currentTime ?? currentTime ?? 0));
    const start = Math.max(0, Number((anchor - 0.5).toFixed(2)));
    const end = Number((anchor + 0.5).toFixed(2));
    const now = new Date().toISOString();
    return {
      marker_id: createMarkerId(),
      schema_version: "cut_time_marker_v1",
      project_id: "cut_demo",
      timeline_id: "main",
      media_path: currentMediaKey,
      // 0.22: штамп содержимого на момент создания — копия файла опознается.
      content_hash: contentHashRef.current ?? null,
      kind,
      start_sec: start,
      end_sec: end,
      anchor_sec: Number(anchor.toFixed(2)),
      score: kind === "favorite" ? 0.85 : 0.6,
      label: defaultMarkerLabel(kind),
      text,
      // tb_1791583578_64923_1: подпись из ref (имя macOS / запомненное);
      // "" — как раньше, без автора.
      author: commentAuthorRef.current,
      context_slice: null,
      cam_payload: null,
      chat_thread_id: null,
      comment_thread_id: null,
      source_engine: "player_lab",
      created_at: now,
      updated_at: now,
    };
  }

  function addMomentMarker(kind: PlayerMarkerKind, text = "") {
    // tb_1791143015_70644_7: вложенные/пересекающиеся пары запрещены на
    // уровне создания — скобку внутрь закрытой пары поставить нельзя.
    if (kind === "in" || kind === "out") {
      const anchor = Math.max(0, Number(videoRef.current?.currentTime ?? currentTime ?? 0));
      const { pairs } = pairInOutRanges(mediaMarkers);
      if (wouldNestInPair(pairs, anchor)) {
        setContextToast("In–Out Play: brackets cannot nest inside a closed pair.");
        return null;
      }
    }
    const marker = buildMarker(kind, text);
    if (!marker) return null;
    pushMarkerHistory();
    setMarkers((prev) => [...prev, marker]);
    return marker;
  }

  // Косметика 2026-09-25: M / меню / пилюля — один тракт: только открыть окно.
  // tb_1791654032_27281_1: открытие НЕ создаёт комментарий. Комментарий
  // рождается кнопкой Save внутри окна; пустых не создаём.
  function openCommentsPanel(initialFilter?: "comment"): void {
    // 0.12 слайс 1: окно комментов показывает HH:MM:SS:FF — fps едет в query,
    // та же цепочка container→probe→rVFC, что XML timebase и таймкоды транспорта.
    // tb_1791690899_1275_3: открытие иконкой комментариев / M стартует с
    // фильтром «только комментарии» (?filter=comments); лого Марка — без.
    const fps = resolveXmlFps(containerFps, probeResult?.fps, estimatedFps);
    const at = Math.max(0, Number(videoRef.current?.currentTime ?? currentTime ?? 0));
    const filterQuery = initialFilter === "comment" ? "&filter=comments" : "";
    void openPanelWindow("panel-comments", "comments", "", 380, 560, withContentHash(currentMediaKey ? `media=${encodeURIComponent(currentMediaKey)}&fps=${fps}&at=${at.toFixed(2)}${filterQuery}` : undefined));
  }

  // tb_1791654032_27281_1: лого VETKA пока убрано — на его месте белый лого
  // Марка, открывает единое окно маркеров. VETKA вернётся кнопкой когда
  // будет готова (плюс updater на релизе).
  function handleContextAction() {
    if (!isInVetka) {
      openCommentsPanel();
      return;
    }
    addMomentMarker("favorite");
    setContextToast("Moment saved as a favorite marker.");
  }

  async function handleImportJsonFile(file: File | null) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const preview = normalizePlayerLabImportPayload(parsed);
      setImportPreview(preview);
      setImportStatus(
        `Loaded ${preview.markers.length} markers and ${preview.provisionalEvents.length} provisional events from ${file.name}.`,
      );
    } catch (error) {
      setImportPreview(null);
      setImportStatus(error instanceof Error ? error.message : "Player Lab JSON parse failed.");
    }
  }

  async function handleImportIntoCut() {
    if (!importPreview) {
      setImportStatus("Choose a Player Lab JSON export first.");
      return;
    }
    if (!importSandboxRoot.trim() || !importProjectId.trim()) {
      setImportStatus("Sandbox root and project id are required for CUT import.");
      return;
    }
    setImportBusy(true);
    try {
      const response = await fetch(`${resolvePlayerLabApiBase(playerLabApiBase)}/cut/markers/import-player-lab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandbox_root: importSandboxRoot.trim(),
          project_id: importProjectId.trim(),
          timeline_id: importTimelineId.trim() || "main",
          markers: importPreview.markers,
          provisional_events: importPreview.provisionalEvents,
        }),
      });
      const payload = await response.json() as {
        success?: boolean;
        imported_count?: number;
        skipped_duplicates?: number;
        error?: { message?: string } | null;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message || `CUT import failed: HTTP ${response.status}`);
      }
      const importedCount = Number(payload.imported_count || 0);
      const skippedDuplicates = Number(payload.skipped_duplicates || 0);
      setImportStatus(`Imported ${importedCount} markers into CUT. Skipped duplicates: ${skippedDuplicates}.`);
      setContextToast(`CUT import complete: ${importedCount} markers.`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "CUT import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <main
      className={`player-app ${isDebugVisible ? "debug-open" : ""} ${isPureMode ? "pure-mode" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) attachFile(file);
      }}
    >
      {isDebugVisible ? <div className="chrome-strip" /> : null}
      <section className="player-pane">
        {isDebugVisible ? (
          <header ref={topbarRef} className="topbar">
            <div className="title-block">
              <span className="eyebrow">Mark Player</span>
              <strong className="media-title">{fileName || "Drop a video to begin"}</strong>
              {probeResult?.ok ? (
                <FileInfoRow
                  probe={probeResult}
                  honesty={describeFpsHonesty(containerFps, probeResult?.fps, estimatedFps)}
                  skippedSeconds={skippedTotalSec}
                />
              ) : null}
            </div>
            <div className="topbar-actions">
              <button className="ghost-button icon-chip" type="button" onClick={handleOpenClick}>
                <IconOpen />
              </button>
              <button className="ghost-button subtle" type="button" onClick={() => setIsDebugVisible(false)}>
                Hide Debug
              </button>
              {srtContent ? (
                <button
                  className="ghost-button subtle"
                  type="button"
                  onClick={async () => {
                    await performExportSrt();
                  }}
                >
                  Download SRT
                </button>
              ) : null}
              {markers.length > 0 || provisionalEvents.length > 0 ? (
                <button
                  className="ghost-button subtle"
                  type="button"
                  onClick={async () => {
                    await performExportJson();
                  }}
                >
                  Download JSON
                </button>
              ) : null}
              {currentFilePath ? (
                <button
                  className="ghost-button subtle"
                  type="button"
                  onClick={() => {
                    const pl = loadPlaylist() || createEmptyPlaylist();
                    const updated = addEntry(pl, {
                      path: currentFilePath,
                      name: fileName || "media",
                      duration,
                    });
                    savePlaylist(updated);
                    setContextToast("Added to playlist.");
                  }}
                >
                  + Playlist
                </button>
              ) : null}
              <button className="ghost-button subtle" type="button" onClick={() => openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500)}>
                Playlist
              </button>
            </div>
          </header>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) attachFile(file);
          }}
        />

        <div className="stage-wrap">
          <div
            ref={shellRef}
            className={`viewer-shell player-shell ${variant} ${footerReserve === 0 ? "footerless" : ""}${isFullscreen && chromeHidden ? " fullscreen-chrome-hidden" : ""}${isFullscreen || fsTransition ? " is-fullscreen" : ""}`}
            // tb_1791679886_1275_2: вызов спрятанной панели движением мыши —
            // только вызов (setShowTransport(true)), без форсинга в attach-путях:
            // onMouseMove самого оверлея не долетает (pointer-events:none).
            onMouseMove={() => setShowTransport(true)}
            style={shellSizeOverride && !isPureMode && !isFullscreen && !fsTransition ? { width: `${shellSizeOverride.width}px`, height: `${shellSizeOverride.height}px` } : undefined}
          >
            <div ref={viewerRef} className="viewer-area player-canvas">
              {volumeOsdVisible ? (
                <div className="volume-osd" data-testid="volume-osd">
                  {isMuted ? "Muted" : `Volume ${Math.round(volume * 100)}%`}
                </div>
              ) : null}
              {src ? (
                <>
                  {/* tb_1791571305_29299_2: у аудио нет кадра — вместо
                      чёрной сцены честная плашка, транспорт/шкала/маркеры
                      работают как у видео. */}
                  {mediaKind === "audio" ? (
                    <div
                      className="audio-stage"
                      data-testid="audio-stage"
                      onClick={() => videoClickCtlRef.current?.click()}
                      onMouseMove={() => setShowTransport(true)}
                    >
                      {/* tb_1792441325_49541_8: оператор оставил один ключ —
                          только скрипичный, по центру, без новых цветов. */}
                      <div className="audio-stage-clefs" data-testid="audio-stage-clefs" aria-hidden="true">
                        <span className="audio-stage-clef">𝄞</span>
                      </div>
                      <span className="audio-stage-title">Audio</span>
                      <span className="audio-stage-name">{fileName || "Audio"}</span>
                      <span className="audio-stage-time">
                        {formatTimecode(duration, resolveXmlFps(containerFps, probeResult?.fps, estimatedFps))}
                      </span>
                    </div>
                  ) : null}
                  <div className={`video-stage ${effectivePreviewScale < 1 ? "preview-scaled" : ""}`}>
                    <div
                      className="video-raster"
                      style={{
                        width: `${Math.max(1, snapshot.displayedWidth * effectivePreviewScale)}px`,
                        height: `${Math.max(1, snapshot.displayedHeight * effectivePreviewScale)}px`,
                        transform: `scale(${1 / effectivePreviewScale})`,
                      }}
                    >
                      {mediaKind === "image" ? (
                        <img
                          ref={imageRef}
                          className="viewer-video viewer-image"
                          src={src}
                          alt={fileName || "Image preview"}
                          draggable={false}
                          onLoad={(event) => {
                            const image = event.currentTarget;
                            setNaturalSize({
                              width: Number(image.naturalWidth || 0),
                              height: Number(image.naturalHeight || 0),
                            });
                            setCurrentTime(0);
                            setDuration(0);
                            setIsPlaying(false);
                            if (!fileName) setFileName(formatName(src));
                          }}
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          className="viewer-video"
                          src={src}
                          controls={false}
                          playsInline
                          preload="auto"
                          onClick={() => videoClickCtlRef.current?.click()}
                          onLoadedMetadata={(event) => {
                            const video = event.currentTarget;
                            setNaturalSize({
                              width: Number(video.videoWidth || 0),
                              height: Number(video.videoHeight || 0),
                            });
                            setDuration(Number(video.duration || 0));
                            setCurrentTime(Number(video.currentTime || 0));
                            setVolume(Number(video.volume || 1));
                            setIsMuted(Boolean(video.muted));
                            if (!fileName) setFileName(formatName(src));
                            // tb_1791233024_7043_1: Resume — файл холодного
                            // старта загрузился, догоняем записанную позицию
                            // (раньше декодер её ронял). Конец клипа — не
                            // позиция: кламп за 0.25с до длительности.
                            const pendingResume = resumeSeekRef.current;
                            if (pendingResume && isSameMediaPath(pendingResume.path, currentFilePathRef.current)) {
                              resumeSeekRef.current = null;
                              const durationSec = Number(video.duration || 0);
                              const target = durationSec > 0
                                ? Math.min(pendingResume.positionSec, Math.max(0, durationSec - 0.25))
                                : pendingResume.positionSec;
                              if (Number.isFinite(target) && target > 0) {
                                try {
                                  video.currentTime = target;
                                } catch {
                                  // ignore — останется начало
                                }
                                setSeekTarget(target);
                              }
                            }
                          }}
                          onLoadedData={(event) => {
                            // tb_1792441299_49541_7: новый источник — preview
                            // от прошлого файла не должен залипать.
                            clearScrubPreview();
                            // tb_1792438559_20717_1: кадр пришёл — упреждающее
                            // «может не играть» больше не нужно.
                            setMediaProblem("");
                            const video = event.currentTarget;
                            if (firstFramePrimedRef.current) return;
                            firstFramePrimedRef.current = true;
                            if (video.paused && Number(video.currentTime || 0) === 0 && Number(video.duration || 0) > 0) {
                              const epsilon = Math.min(0.033, Math.max(0.001, Number(video.duration || 0) / 1000));
                              try {
                                video.currentTime = epsilon;
                              } catch {
                                // ignore seek priming failures
                              }
                            }
                            // tb_1791233039_7043_3: клик из плейлиста / автопереход —
                            // декодер готов, можно играть (раньше play() ронялся).
                            if (autoplayOnLoadRef.current) {
                              autoplayOnLoadRef.current = false;
                              void video.play().catch(() => {});
                            }
                          }}
                          onPlay={() => { setIsPlaying(true); setMediaProblem(""); }}
                          onPause={(event) => {
                            setIsPlaying(false);
                            // tb_1791233024_7043_1: пауза — точная запись позиции для Resume.
                            recordPlaybackPositionExact(currentFilePathRef.current, Number(event.currentTarget.currentTime || 0));
                          }}
                          onError={() => {
                            // tb_1792441299_49541_7: сик не удался — не врём
                            // плейхедом, возвращаемся к фактической позиции.
                            clearScrubPreview();
                            // 0.10.22: ошибки видео были немыми — чёрный экран без улик.
                            const code = videoRef.current?.error?.code ?? 0;
                            const label = currentFilePath ?? fileName ?? "media";
                            // tb_1792438559_20717_1 / 0.26: контейнер уже
                            // известен — называем причину громко (транспорт),
                            // а не сухой код ошибки.
                            if (mediaContainerInfo && !src.startsWith("blob:")) {
                              setMediaProblem(mediaLoadProblemReason(label, mediaContainerInfo));
                            } else {
                              setContextToast(`Cannot play ${label} (video error ${code})`);
                            }
                            // tb_1791233039_7043_3: битый файл — autoplay-флаг
                            // не должен пережить и выстрелить на следующем.
                            autoplayOnLoadRef.current = false;
                          }}
                          onTimeUpdate={(event) => {
                            const t = Number(event.currentTarget.currentTime || 0);
                            setCurrentTime(t);
                            // tb_1791233024_7043_1: троттл записи позиции (5с внутри record).
                            recordPlaybackPosition(currentFilePathRef.current, t);
                            // tb_1791143015_70644_7: In–Out Play одного видео.
                            // Прыжок только при пересечении OUT во время
                            // проигрывания (скраб свободный: большой скачок
                            // и video.seeking отфильтровываются в lib).
                            // tb_1791843935_63972_2: ручной сик — навигация,
                            // ножницы молчат 800мс (см. markManualSeek).
                            const video = event.currentTarget;
                            const prevT = inOutPrevTRef.current;
                            inOutPrevTRef.current = t;
                            if (
                              inOutPlayOn &&
                              isTimeMedia &&
                              !video.paused &&
                              !video.seeking &&
                              !video.ended &&
                              !isManualSeekSuppressed() &&
                              currentMediaKey &&
                              duration > 0
                            ) {
                              // tb_1791333803_37784_1: активный лист подменяет
                              // сегменты маркеров.
                              // tb_1791654032_27281_1: скобки вопроса живут
                              // штатными in/out — отдельного приоритета нет.
                              const sheetSegments = cutsheetPreviewRef.current?.segments ?? null;
                              const segments = sheetSegments ?? buildPlaybackSegments(
                                mediaMarkers.filter((m) => m.kind === "in").map((m) => m.anchor_sec),
                                mediaMarkers.filter((m) => m.kind === "out").map((m) => m.anchor_sec),
                                duration,
                              );
                              // tb_1791662784_27409_3: пересекли OUT — jump на
                              // следующий IN (черновой монтаж; loop one
                              // заворачивает на первый сегмент), tail без
                              // продолжения — автопереход плейлиста, а идти
                              // некуда — пауза на скобке (0.25.35).
                              // tb_1791885959_77379_1: активная запись-вопрос владеет
                              // проигрыванием — пересечение ЕЁ out уводит на
                              // следующую запись (tail), а не jump'ом в чужое
                              // окно того же файла (v07: 11 окон на одном
                              // 50-минутном прокси шли подряд). Plain-тракт —
                              // как раньше, через outCrossAction.
                              const qTail = questionOutCrossed(activeQuestion, currentFilePathRef.current, questionPathRef.current, prevT, t);
                              const qAt = qTail && typeof activeQuestion?.out_sec === "number" ? activeQuestion.out_sec : 0;
                              const action = qTail
                                ? { kind: "tail" as const, at: qAt }
                                : outCrossAction(segments, prevT, t, video.loop);
                              if (action?.kind === "tail" && advanceToNextEntry()) {
                                inOutPrevTRef.current = 0;
                              } else {
                                const pauseAt = action?.kind === "tail" ? action.at : null;
                                if (pauseAt !== null) {
                                  inOutPrevTRef.current = pauseAt;
                                  try {
                                    video.currentTime = pauseAt;
                                  } catch {
                                    // ignore — останется внешнее
                                  }
                                  video.pause();
                                  setSeekTarget(null);
                                  setCurrentTime(pauseAt);
                                }
                                const target = action?.kind === "jump" ? action.at : null;
                                if (target !== null) {
                                inOutPrevTRef.current = target;
                                try {
                                  video.currentTime = target;
                                } catch {
                                  // ignore — останется внешнее
                                }
                                setSeekTarget(target);
                                const skipped = Math.max(0, target - t);
                                if (skipped > 0) {
                                  setSkippedTotalSec((prev) => prev + skipped);
                                  if (!skipToastShownRef.current) {
                                    skipToastShownRef.current = true;
                                    setContextToast("In–Out Play: skipped outside segments (S toggles).");
                                  }
                                }
                                }
                              }
                            }
                          }}
                          // п.3: декодер догнал запрошенную позицию — цифра
                          // фактическая, честный статус снимаем.
                          onSeeked={(event) => {
                            const t = Number(event.currentTarget.currentTime || 0);
                            setCurrentTime(t);
                            setSeekTarget(null);
                            // tb_1792441299_49541_7: preview живёт до момента,
                            // когда декодер реально догнал точку.
                            const preview = scrubPreviewRef.current;
                            if (preview !== null && !scrubbingRef.current && isScrubSettled(preview, t)) {
                              clearScrubPreview();
                            }
                          }}
                          onDurationChange={(event) => setDuration(Number(event.currentTarget.duration || 0))}
                          onVolumeChange={(event) => {
                            setVolume(Number(event.currentTarget.volume || 0));
                            setIsMuted(Boolean(event.currentTarget.muted));
                          }}
                          onEnded={() => {
                            advanceToNextEntry();
                          }}
                        />
                      )}
                      {/* tb_1791156671_82609_1: дорожка поверх кадра (fullscreen/mini/вертикаль —
                          якорь video-raster уже в размере видимого кадра). */}
                      {subtitlesVisible ? (
                        <SubtitleOverlay cues={activeSubtitleCues} frameHeight={snapshot.displayedHeight || 0} liftPx={subtitleLift} />
                      ) : null}
                      {/* tb_1791754893_1275_4: рамка региона-лица поверх кадра.
                          Обычный режим: raster ровно размер кадра → доли
                          напрямую. Фулскрин: raster = весь вьювер, видео
                          contain — добавляем letterbox-офсеты из snapshot. */}
                      {mediaKind === "video" && questionBoxNow && snapshot.displayedWidth > 0 && snapshot.displayedHeight > 0 ? (
                        <div
                          data-testid="question-bbox"
                          className="question-bbox"
                          title={`Region ${(questionBoxNow.x * 100).toFixed(1)}%,${(questionBoxNow.y * 100).toFixed(1)}% ${activeQuestion?.question_id ?? ""}`}
                          style={{
                            left: (isFullscreen ? snapshot.horizontalLetterboxPx : 0) + questionBoxNow.x * snapshot.displayedWidth,
                            top: (isFullscreen ? snapshot.verticalLetterboxPx : 0) + questionBoxNow.y * snapshot.displayedHeight,
                            width: Math.max(2, questionBoxNow.w * snapshot.displayedWidth),
                            height: Math.max(2, questionBoxNow.h * snapshot.displayedHeight),
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className={`topbar-dock ${showTransport ? "viewer-toolbar-visible" : "viewer-toolbar-hidden"}`}>
                    <div className="topbar-zone topbar-left">
                      <button
                        className="icon-button icon-button-ghost"
                        type="button"
                        onClick={() => handleContextAction()}
                        data-testid="context-action"
                        aria-label={isInVetka ? "Favorite this moment" : "Open markers"}
                        title={isInVetka ? `Favorite this moment (${favoriteMomentCount})` : "Markers"}
                      >
                        {isInVetka ? <IconStar active={true} /> : <img src="/icons/mark_monro_64.png" alt="Mark" width={18} height={18} style={{ filter: "brightness(0) invert(1)" }} />}
                      </button>
                      <button
                        className="icon-button icon-button-ghost"
                        type="button"
                        onClick={() => openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500)}
                        data-testid="corner-playlist"
                        aria-label="Open playlist"
                        title="Playlist"
                      >
                        <IconPlaylist />
                      </button>
                      {/* tb_1791654032_27281_1: окно маркеров упразднено — единое
                          окно открывает лого Марка (context-action выше). */}
                    </div>
                    <div className="topbar-zone topbar-center">
                      {/* tb_1791764026_23730_1: пилюля ВСЕГДА цела — вопрос
                          её не подменяет (вердикт оператора 12.10:
                          маркеры — лицо плеера). Вопрос живёт отдельной
                          компактной карточкой справа вверху. */}
                      <div className="marker-dock">
                        <button className="transport-button" type="button" onClick={() => { addMomentMarker("favorite"); setContextToast("Favorite marked."); }} data-testid="marker-favorite" aria-label={tooltipFor("marker-favorite")} title={tooltipFor("marker-favorite")}>
                          <IconMarkerFavorite />
                        </button>
                        <button className="transport-button" type="button" onClick={() => { addMomentMarker("negative"); setContextToast("Negative marked."); }} data-testid="marker-negative" aria-label={tooltipFor("marker-negative")} title={tooltipFor("marker-negative")}>
                          <IconMarkerNegative />
                        </button>
                        <button className="transport-button" type="button" onClick={() => { addMomentMarker("in"); setContextToast("In point marked."); }} data-testid="marker-in" aria-label={tooltipFor("marker-in")} title={tooltipFor("marker-in")}>
                          <IconMarkerIn />
                        </button>
                        <button className="transport-button" type="button" onClick={() => { addMomentMarker("out"); setContextToast("Out point marked."); }} data-testid="marker-out" aria-label={tooltipFor("marker-out")} title={tooltipFor("marker-out")}>
                          <IconMarkerOut />
                        </button>
                        <button className="transport-button" type="button" onClick={() => { openCommentsPanel("comment"); }} data-testid="marker-comment" aria-label={tooltipFor("marker-comment")} title={tooltipFor("marker-comment")}>
                          <IconMarkerComment />
                          {commentMomentCount > 0 ? <span className="transport-count-badge">{commentMomentCount}</span> : null}
                        </button>
                        {/* Bell №2: agent-chat button removed — chat is a separate
                            module, not in the default bundle. Marker pill:
                            ★ ✗ [ ] 💬(comment). */}
                      </div>
                    </div>
                    <div className="topbar-zone topbar-right" />
                  </div>
                  {contextToast ? <div className="context-toast">{contextToast}</div> : null}
                  {/* tb_1791156671_82609_1: хинт «похоже на маркеры» — с кнопкой (§6).
                      Автотост 2.2с для кнопки не годится — живёт до действия. */}
                  {markerHint ? (
                    <div className="context-toast hint-toast" data-testid="marker-hint-toast">
                      <span>Looks like Mark Player markers ({markerHint.cues} cues). Import Markers JSON — or create markers from these subtitles.</span>
                      <button className="ghost-button subtle" type="button" onClick={() => createMarkersFromSubtitleHint()}>
                        Create markers
                      </button>
                      <button className="ghost-button subtle" type="button" onClick={() => setMarkerHint(null)} aria-label="Dismiss">
                        ✕
                      </button>
                    </div>
                  ) : null}
                  {refusalToast ? <div className="context-toast refusal-toast" data-testid="refusal-toast">{refusalToast}</div> : null}
                  {/* tb_1792438559_20717_1: молчащий файл — причина висит,
                      пока её не снимут: чёрный кадр сам ничего не объяснит. */}
                  {mediaProblem ? (
                    <div className="context-toast refusal-toast media-problem-toast" data-testid="media-problem-toast">
                      <span>{mediaProblem}</span>
                      <button className="ghost-button subtle" type="button" onClick={() => setMediaProblem("")} aria-label="Dismiss">
                        ✕
                      </button>
                    </div>
                  ) : null}
                  {vetkaToast ? <div className="context-toast vetka-promo-toast" data-testid="vetka-promo-toast">{vetkaToast}</div> : null}
                  {isTimeMedia ? (
                    <>
                      <div
                        className={`transport-overlay ${showTransport ? "transport-visible" : "transport-hidden"}`}
                        onMouseMove={() => setShowTransport(true)}
                        onMouseLeave={() => {
                          if (isMoving && !isDebugVisible) setShowTransport(false);
                        }}
                      >
                        <div className="transport-scrim" />
                        <div className="transport-bar" ref={transportBarRef}>
                          <div className="transport-group">
                            <button className="transport-button transport-button-primary" type="button" onClick={() => togglePlayback()} aria-label={shuttleDisplay.label} title={`${shuttleDisplay.label} (Space)`} data-testid="transport-play-pause" data-shuttle={shuttle}>
                              {isMoving ? <IconPause /> : <IconPlay />}
                            </button>
                            <span className="transport-time-col">
                              <span className="transport-time">{formatTimecode(scrubDisplayTime, resolveXmlFps(containerFps, probeResult?.fps, estimatedFps))}
                                {/* tb_1791689890_1275_2: сумма живёт ВНУТРИ строки
                                    таймкода (absolute под ней) — таймкод плейхеда
                                    стабилен всегда, пилюля не раздвигается. */}
                                {inOutRanges.length > 0 && selectionSeconds > 0 ? (
                                  <span
                                    className="transport-sum"
                                    data-testid="transport-sum"
                                    title={`In-out total ${selectionSeconds}s across ${inOutRanges.length} in-out segment(s)`}
                                  >
                                    [{formatTimecode(selectionSeconds, resolveXmlFps(containerFps, probeResult?.fps, estimatedFps))}]
                                  </span>
                                ) : null}
                              </span>
                              {seekTarget != null && seekStuck ? (
                                <span className="transport-seeking" data-testid="transport-seeking" title={`Seeking to ${seekTarget}s`}>
                                  seeking…
                                </span>
                              ) : null}
                              <span className={shuttleSlotClass(shuttleDisplay.badge)} data-testid="transport-shuttle-badge" title={shuttleDisplay.label}>
                                {shuttleDisplay.badge ?? ""}
                              </span>
                            </span>
                            <div
                              ref={progressWrapRef}
                              className="transport-progress-wrap"
                              onMouseDown={handleTimelinePress}
                              onMouseMove={handleTimelineHover}
                            >
                              <div className="time-ruler">
                                {timelineTicks.map((tick, i) => (
                                  <span
                                    key={i}
                                    className={`time-ruler-tick ${tick.major ? "time-ruler-tick-major" : "time-ruler-tick-minor"}`}
                                    style={{ left: `${(tick.sec / Math.max(duration, 0.001)) * 100}%` }}
                                  >
                                    {tick.major ? (
                                      <>
                                        <span className="tick-label">{tick.label}</span>
                                        <span className="tick-line tick-line-major" />
                                      </>
                                    ) : (
                                      <span className="tick-line tick-line-minor" />
                                    )}
                                  </span>
                                ))}
                              </div>
                              <div className="marker-lane">
                                {mediaMarkers.filter((m) => m.kind !== "in" && m.kind !== "out").map((marker) => {
                                  let icon = <IconMarkerFavorite />;
                                  if (marker.kind === "negative") icon = <IconMarkerNegative />;
                                  else if (marker.kind === "comment") icon = <IconMarkerComment />;
                                  else if (marker.kind === "chat") icon = <IconMarkerChat />;
                                  return (
                                    <span
                                      key={marker.marker_id}
                                      className={`transport-marker ${draggingMarkerId === marker.marker_id ? "transport-marker-dragging" : ""}`}
                                      style={{ left: `${(marker.anchor_sec / Math.max(duration, 0.001)) * 100}%` }}
                                      title={marker.label || marker.kind}
                                      onDoubleClick={() => {
                                        deleteMarkerById(marker.marker_id);
                                      }}
                                    >
                                      {icon}
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="transport-progress-inout">
                                {inOutRanges.map((range, i) => (
                                  <div
                                    key={i}
                                    className="transport-inout-range"
                                    style={{
                                      left: `${(range.start / Math.max(duration, 0.001)) * 100}%`,
                                      width: `${((range.end - range.start) / Math.max(duration, 0.001)) * 100}%`,
                                    }}
                                  />
                                ))}
                                {mediaMarkers.filter((m) => m.kind === "in" || m.kind === "out").map((marker) => (
                                  <span
                                    key={marker.marker_id}
                                    className={`transport-progress-inout-marker ${marker.kind === "in" ? "in" : "out"} ${draggingMarkerId === marker.marker_id ? "dragging" : ""}`}
                                    style={{ left: `${(marker.anchor_sec / Math.max(duration, 0.001)) * 100}%` }}
                                    // tb_1791689190_1275_1: опознание скобки — время +
                                    // автор (qmat_*/agent:* = импорт, своё имя = своя рука).
                                    title={`${marker.kind === "in" ? "In" : "Out"} point ${formatTimecode(marker.anchor_sec, resolveXmlFps(containerFps, probeResult?.fps, estimatedFps))}${marker.author ? ` · ${marker.author}` : ""}`}
                                      onDoubleClick={() => {
                                        deleteMarkerById(marker.marker_id);
                                      }}
                                  >
                                    {marker.kind === "in" ? "[" : "]"}
                                  </span>
                                ))}
                              </div>
                              <input
                                className="transport-progress"
                                type="range"
                                data-testid="transport-progress"
                                min={0}
                                max={Math.max(duration, 0.001)}
                                step={0.01}
                                value={Math.min(scrubDisplayTime, duration || 0)}
                                onChange={(event) => {
                                  const nextTime = Number(event.target.value || 0);
                                  // tb_1792443862_5828_1: нативный range тоже
                                  // тянет value во время drag — не даём ему
                                  // сделать второй, невидимый поток seek'ов
                                  // (именно он заново праймил аудио и рвал звук).
                                  if (scrubbingRef.current) {
                                    showScrubPreview(nextTime);
                                    return;
                                  }
                                  // п.3: без оптимизма — показываем факт + seeking…,
                                  // цифра догонит по onSeeked/timeupdate.
                                  if (videoRef.current && Math.abs(videoRef.current.currentTime - nextTime) < 0.02) return;
                                  setSeekTarget(nextTime);
                                  if (videoRef.current) videoRef.current.currentTime = nextTime;
                                }}
                                aria-label="Seek"
                              />
                              <div
                                className="transport-playhead"
                                style={{ left: `${(scrubDisplayTime / Math.max(duration, 0.001)) * 100}%` }}
                              />
                              {/* tb_1791844731_63972_4: линия вертикали 1px через
                                  все ряды — от верхнего шарика к нижнему. */}
                              <div
                                className="transport-playhead-line"
                                style={{ left: `${(scrubDisplayTime / Math.max(duration, 0.001)) * 100}%` }}
                              />
                            </div>
                            <span className="transport-time">{formatTimecode(duration, resolveXmlFps(containerFps, probeResult?.fps, estimatedFps))}</span>
                          </div>
                          <div className="transport-group">
                            <div className="transport-volume-wrap">
                              <button className="transport-button" type="button" onClick={() => {
                                if (showVolume) {
                                  setShowVolume(false);
                                } else {
                                  setShowVolume(true);
                                }
                              }} data-testid="transport-mute" aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}>
                                <IconVolume isMuted={isMuted || volume === 0} />
                              </button>
                              {showVolume ? (
                                <div className="volume-popup">
                                  <input
                                    className="volume-slider"
                                    type="range"
                                    data-testid="transport-volume"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={isMuted ? 0 : volume}
                                    onChange={(event) => {
                                      const nextVolume = Number(event.target.value || 0);
                                      syncVolume(nextVolume, nextVolume === 0);
                                    }}
                                    aria-label="Volume"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {/* tb_1791333803_37784_1: бейдж активного листа — виден
                              источник сегментов движка (маркеры или лист). */}
                          {mediaKind === "video" && cutsheetPreview ? (
                            <span
                              className="transport-selection"
                              data-testid="cutsheet-preview-badge"
                              title={`Cutsheet "${cutsheetPreview.name}": ${cutsheetPreview.segments.length} segment(s) in preview`}
                            >
                              <IconScissors />
                              <span>
                                Cutsheet &quot;{cutsheetPreview.name}&quot;: {cutsheetPreview.segments.length} seg
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {/* tb_1791764026_23730_1: вопрос — компактной карточкой
                          (план Б). Пилюлю не трогает. Текст режется ellipsis,
                          полный — в title.
                          tb_1791839608_26192_1: карточка в центре под пилюлей —
                          правый верх отдан тосту (приказ оператора). Без
                          маркеров вопроса кнопки гаснут + подсказка. */}
                      {mediaKind === "video" && activeQuestion && questionPathRef.current === currentFilePath ? (
                        <div
                          data-testid="question-card"
                          className="question-card-side"
                          title={activeQuestion.hypothesis || activeQuestion.question || activeQuestion.question_id}
                        >
                          <div className="question-card-side-head">
                            <span data-testid="question-text" className="question-card-side-text">
                              {activeQuestion.question || activeQuestion.question_id}
                            </span>
                            <button
                              type="button"
                              className="question-card-side-x"
                              data-testid="question-close"
                              onClick={clearActiveQuestion}
                              title="Dismiss question"
                            >
                              ✕
                            </button>
                          </div>
                          {(activeQuestion.choices ?? []).map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              className="question-card-side-choice"
                              data-testid="question-choice"
                              aria-pressed={questionChoice === choice}
                              onClick={() => setQuestionChoice((prev) => (prev === choice ? null : choice))}
                            >
                              {choice}
                            </button>
                          ))}
                          <div className="question-card-side-row">
                            <input
                              className="question-card-side-input"
                              data-testid="question-comment"
                              value={questionComment}
                              onChange={(e) => setQuestionComment(e.target.value)}
                              placeholder="Comment…"
                              aria-label="Answer comment"
                            />
                          </div>
                          <div className="question-card-side-row">
                            <button
                              type="button"
                              className="question-card-side-verdict"
                              data-testid="question-answer-favorite"
                              onClick={() => void answerQuestion("favorite")}
                              disabled={!questionHasMarkers(activeQuestion?.question_id)}
                              title={questionHasMarkers(activeQuestion?.question_id) ? "Confirm" : "No question markers — reimport the playlist"}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="question-card-side-verdict"
                              data-testid="question-answer-negative"
                              onClick={() => void answerQuestion("negative")}
                              disabled={!questionHasMarkers(activeQuestion?.question_id)}
                              title={questionHasMarkers(activeQuestion?.question_id) ? "Reject" : "No question markers — reimport the playlist"}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              className="question-card-side-verdict"
                              data-testid="question-answer-comment"
                              onClick={() => void answerQuestion("comment")}
                              disabled={!questionHasMarkers(activeQuestion?.question_id)}
                              title={questionHasMarkers(activeQuestion?.question_id) ? "Not sure (comment)" : "No question markers — reimport the playlist"}
                            >
                              Not sure
                            </button>
                          </div>
                          {!questionHasMarkers(activeQuestion?.question_id) ? (
                            <div className="question-card-side-row" data-testid="question-no-markers">
                              <span className="question-card-side-hint">No question markers for this entry — answers won&apos;t save. Reimport the playlist.</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <button
                        className="seek-zone seek-zone-left"
                        type="button"
                        data-testid="seek-backward"
                        aria-label="Seek backward"
                        onClick={() => seekBy(-1)}
                      />
                      <button
                        className="seek-zone seek-zone-right"
                        type="button"
                        data-testid="seek-forward"
                        aria-label="Seek forward"
                        onClick={() => seekBy(1)}
                      />
                    </>
                  ) : null}
                </>
              ) : intrinsicSize.width > 0 && intrinsicSize.height > 0 ? (
                <div className="synthetic-stage">
                  <div
                    className="synthetic-frame"
                    style={{
                      width: `${snapshot.displayedWidth}px`,
                      height: `${snapshot.displayedHeight}px`,
                    }}
                  >
                    <div className="synthetic-label">
                      {intrinsicSize.width} × {intrinsicSize.height}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`dropzone player-dropzone ${isDragging ? "dragging" : ""}`}>
                  <div>
                    <strong>Drop media here</strong>
                    <p className="dropzone-copy">
                      This shell auto-fits to video and images once dimensions are known.
                    </p>
                    <button className="dropzone-open" type="button" data-testid="viewer-open" onClick={handleOpenClick}>
                      Open media
                    </button>
                  </div>
                </div>
              )}
            </div>
            {footerReserve > 0 ? (
              <footer className="footer-bar player-footer">
                <span>{fileName || "No file loaded"}</span>
                {src.trim() && probeResult?.ok ? (
                  <span className={"probe-badge " + probeResult.playback_class}>
                    {probeResult.playback_class}
                    {" · "}
                    {probeResult.width}×{probeResult.height}
                    {probeResult.video_codec ? " · " + probeResult.video_codec : ""}
                  </span>
                ) : shouldShowProbeOffline(src, probeResult) ? (
                  <span className="probe-badge probe-offline" data-testid="probe-offline-badge" title="Media probe unavailable — XML export uses resolved fps (probe → estimate → 25) and assumes audio present">
                    probe offline
                  </span>
                ) : null}
                {isDebugVisible ? (
                  <span className="small">
                    score {snapshot.dreamScore}
                    {" · "}
                    {sourceKind}
                    {" · "}
                    {Math.round(snapshot.horizontalLetterboxPx * 100) / 100}px side bars
                  </span>
                ) : null}
              </footer>
            ) : null}
          </div>
        </div>
      </section>

      {isDebugVisible ? (
        <aside className="lab-panel metrics-panel debug-drawer">
          <h2>Geometry Inspector</h2>
          <dl className="metrics-table">
            <dt>Status</dt>
            <dd className={snapshot.ok ? "good" : "danger"}>{snapshot.ok ? "ready" : snapshot.reason}</dd>
            <dt>Source</dt>
            <dd>{snapshot.sourceKind}</dd>
            <dt>Window</dt>
            <dd>{snapshot.windowInnerWidth} × {snapshot.windowInnerHeight}</dd>
            <dt>Topbar</dt>
            <dd>{snapshot.topbarHeight}px</dd>
            <dt>Shell</dt>
            <dd>{snapshot.shellWidth} × {snapshot.shellHeight}</dd>
            <dt>Viewer</dt>
            <dd>{snapshot.viewerWidth} × {snapshot.viewerHeight}</dd>
            <dt>Footer</dt>
            <dd>{snapshot.footerHeight}px</dd>
            <dt>Video intrinsic</dt>
            <dd>{snapshot.videoIntrinsicWidth} × {snapshot.videoIntrinsicHeight}</dd>
            <dt>Displayed</dt>
            <dd>{snapshot.displayedWidth} × {snapshot.displayedHeight}</dd>
            <dt>Horizontal letterbox</dt>
            <dd className={snapshot.horizontalLetterboxPx > 4 ? "danger" : "good"}>{snapshot.horizontalLetterboxPx}px</dd>
            <dt>Vertical letterbox</dt>
            <dd>{snapshot.verticalLetterboxPx}px</dd>
            <dt>Natural AR</dt>
            <dd>{snapshot.naturalAspectRatio}</dd>
            <dt>Viewer AR</dt>
            <dd>{snapshot.viewerAspectRatio}</dd>
            <dt>Aspect error</dt>
            <dd>{snapshot.aspectError}</dd>
            <dt>DPR</dt>
            <dd>{snapshot.devicePixelRatio}</dd>
            <dt>Dream score</dt>
            <dd className={snapshot.dreamScore >= 80 ? "good" : snapshot.dreamScore >= 60 ? "" : "danger"}>
              {snapshot.dreamScore}/100
            </dd>
            <dt>Viewer dominance</dt>
            <dd>{snapshot.viewerDominanceRatio}</dd>
            <dt>Chrome ratio</dt>
            <dd>{snapshot.chromeRatio}</dd>
            <dt>In VETKA</dt>
            <dd>{snapshot.inVetka ? "yes" : "no"}</dd>
            <dt>Context action</dt>
            <dd>{snapshot.activeContextAction}</dd>
            <dt>Markers</dt>
            <dd>{snapshot.markerCount}</dd>
            <dt>Favorite moments</dt>
            <dd>{snapshot.favoriteMomentCount}</dd>
            <dt>Comment moments</dt>
            <dd>{snapshot.commentMomentCount}</dd>
          </dl>

          {/* tb_1791680717_1275_3: Transport без консоли — история переходов
              (улики ДО открытия инспектора не сгорают) + живой DOM. */}
          {/* tb_1791683106_1275_5: свёрнуто по умолчанию — стена не пугает. */}
          <div className="metrics-block">
            <details>
              <summary style={{ cursor: "pointer" }}>
                <h2 style={{ display: "inline" }}>Transport trace</h2>
                {" — "}show {showTransport ? 1 : 0} · {fileName || "no file"}
              </summary>
            <dl className="metrics-table">
              <dt>Now</dt>
              <dd>
                show {showTransport ? 1 : 0} · chrome {chromeHidden ? 1 : 0} · moving {isMoving ? 1 : 0} · {mediaKind ?? "none"} · {fileName || "no file"}
              </dd>
              {(() => {
                try {
                  const overlay = document.querySelector(".transport-overlay");
                  const dock = document.querySelector(".topbar-dock");
                  const bar = document.querySelector(".transport-bar");
                  const r = bar ? bar.getBoundingClientRect() : null;
                  return (
                    <>
                      <dt>Overlay</dt>
                      <dd>{overlay ? `mounted, opacity ${getComputedStyle(overlay).opacity}` : "UNMOUNTED"}</dd>
                      <dt>Topbar</dt>
                      <dd>{dock ? `opacity ${getComputedStyle(dock).opacity}` : "missing"}</dd>
                      <dt>Bar rect</dt>
                      <dd>{r ? `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)}` : "missing"}</dd>
                    </>
                  );
                } catch {
                  return (
                    <>
                      <dt>DOM</dt>
                      <dd>unreadable</dd>
                    </>
                  );
                }
              })()}
              <dt>History (last 15)</dt>
              <dd style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {transportTrace.length === 0
                  ? "empty"
                  : transportTrace
                    .slice(-15)
                    .map((e) => `+${(e.ts / 1000).toFixed(1)}s show=${e.show ? 1 : 0} chrome=${e.chrome ? 1 : 0} moving=${e.moving ? 1 : 0} ${e.kind ?? "-"} ${e.mode ?? "-"} ${e.file || "-"}`)
                    .join("\n")}
              </dd>
            </dl>
            </details>
          </div>

          <div className="metrics-block">
            <h2>Suggested Shell</h2>
            <dl className="metrics-table">
              <dt>Suggested width</dt>
              <dd>{snapshot.suggestedShellWidth}</dd>
              <dt>Suggested height</dt>
              <dd>{snapshot.suggestedShellHeight}</dd>
            </dl>
          </div>

          <div className="metrics-block">
            <h2>Lab Controls</h2>
            <div className="player-controls">
              <select className="pill" value={variant} onChange={(event) => setVariant(event.target.value as ShellVariant)}>
                <option value="fixed-footer">fixed footer shell</option>
                <option value="flex-footer">flex remainder shell</option>
              </select>
              <button className="pill" type="button" onClick={() => window.vetkaPlayerLab?.print()}>
                print snapshot
              </button>
              <select
                className="pill"
                value={previewQuality}
                onChange={(event) => setPreviewQuality(event.target.value as PreviewQualityKey)}
              >
                {PREVIEW_QUALITY_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} preview
                  </option>
                ))}
              </select>
              <button className="pill" type="button" onClick={() => setShellSizeOverride(null)}>
                reset shell
              </button>
            </div>
            <div className="player-controls metrics-row">
              <label className="metric-pill">
                synthetic width
                <input
                  type="number"
                  min={1}
                  value={syntheticSize.width || ""}
                  onChange={(event) =>
                    setSyntheticSize((prev) => ({
                      ...prev,
                      width: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="metric-pill">
                synthetic height
                <input
                  type="number"
                  min={1}
                  value={syntheticSize.height || ""}
                  onChange={(event) =>
                    setSyntheticSize((prev) => ({
                      ...prev,
                      height: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <button
                className="pill"
                type="button"
                onClick={() => {
                  setSrc("");
                  setFileName("Synthetic probe");
                  setNaturalSize({ width: 0, height: 0 });
                  autoSizedKeyRef.current = "";
                }}
              >
                synthetic mode
              </button>
            </div>
          </div>

          <div className="metrics-block">
            <h2>CUT Import</h2>
            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(event) => {
                void handleImportJsonFile(event.target.files?.[0] || null);
              }}
            />
            <div className="import-grid">
              <label className="import-field">
                API base
                <input value={playerLabApiBase} onChange={(event) => setPlayerLabApiBase(event.target.value)} />
              </label>
              <label className="import-field">
                Sandbox root
                <input value={importSandboxRoot} onChange={(event) => setImportSandboxRoot(event.target.value)} />
              </label>
              <label className="import-field">
                Project id
                <input value={importProjectId} onChange={(event) => setImportProjectId(event.target.value)} />
              </label>
              <label className="import-field">
                Timeline id
                <input value={importTimelineId} onChange={(event) => setImportTimelineId(event.target.value)} />
              </label>
            </div>
            <div className="doors-row" data-testid="module-doors">
              {DOOR_IDS.map((id) => {
                const door = moduleDoors[id];
                const clickable = door.status === "missing" || door.status === "error";
                return (
                  <button
                    key={id}
                    className={"door-pill door-" + door.status}
                    type="button"
                    disabled={!clickable}
                    title={door.detail ?? door.endpoint}
                    onClick={() => handleDoorClick(id)}
                  >
                    {doorLabel(door)}
                  </button>
                );
              })}
            </div>
            <div className="player-controls metrics-row">
              <button className="pill" type="button" onClick={() => importFileInputRef.current?.click()}>
                Open Player Lab JSON
              </button>
              <button className="pill" type="button" disabled={importBusy || !importPreview} onClick={() => void handleImportIntoCut()}>
                {importBusy ? "Importing..." : "Import markers"}
              </button>
            </div>
            <div className="small import-status">{importStatus || "Load a JSON export, preview counts, then import into CUT."}</div>
            {importPreview ? (
              <div className="import-preview">
                <div className="import-preview-row">
                  <span className="inline-token">{importPreview.markers.length} markers</span>
                  <span className="inline-token">{importPreview.provisionalEvents.length} provisional</span>
                </div>
                <div className="import-preview-row">
                  {Object.entries(importPreview.kindCounts).map(([kind, count]) => (
                    <span key={kind} className="import-preview-badge">{kind}: {count}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}
    </main>
  );
}

export default App;
