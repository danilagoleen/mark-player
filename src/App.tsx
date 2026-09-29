import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeDreamScore,
  computeDisplayedBox,
  GeometrySnapshot,
  LAB_FOOTER_HEIGHT,
  ShellVariant,
  suggestShellSize,
} from "./lib/geometry";
import { configurePlayerWindow, isTauriRuntimeSync, openFileDialog, openFilesDialog, probeFile, saveFileDialog, saveFileDialogResult, openPanelWindow, shouldShowProbeOffline, toggleFullscreen, toAssetUrl } from "./lib/nativeWindow";
import type { SaveResult } from "./lib/nativeWindow";
import { resolveExportToast, VETKA_PROMO_MS, VETKA_PROMO_TOAST, type ExportKind } from "./lib/exportFeedback";
import { tooltipFor } from "./lib/transportTooltips";
import { FEEDBACK_MAILTO, GITHUB_RELEASES_URL, GITHUB_REPO_URL } from "./lib/aboutLinks";
import { FULLSCREEN_CHROME_TIMEOUT_MS } from "./lib/fullscreenChrome";
import { DOOR_IDS, checkModuleDoor, doorClickTransition, doorEndpoint, doorLabel, type DoorId, type ModuleDoor } from "./lib/moduleDoors";
import type { ProbeResult } from "./lib/nativeWindow";
import { createEmptyPlaylist, savePlaylist, loadPlaylist, addEntry, addEntryIfAbsent, getNextEntry, loadPlaybackMode } from "./lib/playlist";
import { isSameMediaPath, resolveMediaContentHash } from "./lib/mediaOpen";
import { mediaPlayability, mediaRefusalReason } from "./lib/mediaPlayability";
import { markerBelongsToMedia, resolveExternalMarkers, type MediaIdentity } from "./lib/markersSync";
import type { CutPlayerMenuAction } from "./lib/cutPlayerMenu";
import { useDragDrop } from "./lib/useDragDrop";
import { ReverseShuttle, getShuttleDisplay, resolveJumpTarget, resolvePlayerHotkey, resolveProportionalStep, shuttleSlotClass } from "./lib/playerHotkeys";
import {
  confirmClearMarkers,
  createMarkerHistory,
  historyPush,
  historyRedo,
  historyUndo,
  selectMarkersToClear,
} from "./lib/markerHistory";
import type { ClearScope } from "./lib/markerHistory";
import {
  VOLUME_STEP,
  createFrameCalibrator,
  hasRequestVideoFrameCallback,
  resolveFrameStepSeconds,
} from "./lib/fpsEstimator";
import { createSingleDoubleClick, type SingleDoubleClick } from "./lib/singleDoubleClick";
import MycoProbeApp from "./MycoProbeApp";
// Bell №2: agent chat is a separate module — no chat imports in the default
// player bundle. Chat components stay in the repo as extraction stock.
import { exportMarkersToSrtV2, exportToSidecar, exportMarkersToXmeml, exportPlaylistToXmeml, exportCommentsToText, resolvePlaylistMetadata, formatTimecode, resolveXmlFps, resolveXmlFpsSource, resolveXmlHasAudio } from "./srtUtils";
import type { PlaylistMeta, XmemlPlaylistItemInput } from "./srtUtils";
import { FileInfoRow } from "./components/info/FileInfoRow";

type PreviewQualityKey = "full" | "half" | "quarter" | "eighth" | "sixteenth" | "thirtysecond";
type PlayerMediaKind = "video" | "image" | null;

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
  status: "active";
  created_at: string;
  updated_at: string;
}

const MARKERS_STORAGE_KEY = "vetka_player_lab_markers_v1";
const PROVISIONAL_EVENTS_STORAGE_KEY = "vetka_player_lab_provisional_events_v1";
const VETKA_STATUS_STORAGE_KEY = "vetka_player_lab_in_vetka_v1";
const DEFAULT_PLAYER_LAB_API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

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

  const lowerName = fileName.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/.test(lowerName)) return "image";
  if (/\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|wmv)$/.test(lowerName)) return "video";
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

function readStoredMarkers(): PlayerTimeMarker[] {
  try {
    const raw = localStorage.getItem(MARKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

function IconVetka() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <path d="M12 12 L8 7" />
      <path d="M12 12 L16 7" />
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
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  // 1.2: Volume OSD — процент в правом верхнем углу вьюера (шрифт таймкода).
  const [volumeOsdVisible, setVolumeOsdVisible] = useState(false);
  const volumeOsdTimerRef = useRef<number | null>(null);
  const [showTransport, setShowTransport] = useState(true);
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
  const [provisionalEvents, setProvisionalEvents] = useState<ProvisionalCaptureEvent[]>(readStoredProvisionalEvents);
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
  // средний звен fps-цепочки: probe → rVFC → 25.
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // 0.10.22: ref-зеркало currentFilePath — playlist:play-listener живёт в
  // useEffect([]) и видит только mount-замыкание, стейт там всегда stale.
  const currentFilePathRef = useRef<string | null>(null);
  // 0.10.29: ref-зеркала для keydown-замыкания (эффект висит на
  // [duration, previewQuality], стейт probe/estimate там всегда stale).
  const probeFpsRef = useRef<number | null>(null);
  const estimatedFpsRef = useRef<number | null>(null);
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
    void toggleFullscreen();
  };
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const progressWrapRef = useRef<HTMLDivElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const autoSizedKeyRef = useRef("");
  const transportTimerRef = useRef<number | null>(null);
  const firstFramePrimedRef = useRef(false);
  const intrinsicSize = naturalSize.width > 0 && naturalSize.height > 0 ? naturalSize : syntheticSize;
  const sourceKind: GeometrySnapshot["sourceKind"] =
    naturalSize.width > 0 && naturalSize.height > 0
      ? mediaKind === "image"
        ? "image"
        : "video"
      : "synthetic";
  const footerReserve = sourceKind !== "synthetic" && !isDebugVisible ? 0 : LAB_FOOTER_HEIGHT;
  const isPureMode = !isDebugVisible;
  const previewQualityOption = PREVIEW_QUALITY_OPTIONS.find((option) => option.key === previewQuality) || PREVIEW_QUALITY_OPTIONS[0];
  const effectivePreviewScale = sourceKind === "video" ? previewQualityOption.scale : 1;
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
    () => markers.filter((marker) => markerBelongsToMedia(marker, mediaIdentity)),
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
  const inOutRanges = useMemo(() => {
    const inMarkers = mediaMarkers.filter((m) => m.kind === "in").sort((a, b) => a.start_sec - b.start_sec);
    const outMarkers = mediaMarkers.filter((m) => m.kind === "out").sort((a, b) => a.start_sec - b.start_sec);
    const pairs: { start: number; end: number }[] = [];
    const count = Math.min(inMarkers.length, outMarkers.length);
    for (let i = 0; i < count; i++) {
      pairs.push({ start: inMarkers[i].anchor_sec, end: outMarkers[i].anchor_sec });
    }
    return pairs;
  }, [mediaMarkers]);

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
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    if (isFullscreen) return;
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
  const addCommentAndOpenPanelRef = useRef(addCommentAndOpenPanel);
  addCommentAndOpenPanelRef.current = addCommentAndOpenPanel;
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
      // 0.10.29: честный покадровый шаг — fps-цепочка probe → rVFC → 25.
      // seekBy (боковые зоны) намеренно остаётся на duration/100: это грубая
      // перемотка по дизайну, а не покадровая.
      const frameStep = resolveFrameStepSeconds({
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
          break;
        case "frameStepForward":
          if (!video) break;
          event.preventDefault();
          video.currentTime = Math.min(duration || video.duration || 0, video.currentTime + frameStep);
          break;
        case "proportionalStepBack": {
          if (!video) break;
          event.preventDefault();
          const step = resolveProportionalStep(duration || video.duration || 0);
          video.currentTime = Math.max(0, video.currentTime - step);
          break;
        }
        case "proportionalStepForward": {
          if (!video) break;
          event.preventDefault();
          const step = resolveProportionalStep(duration || video.duration || 0);
          video.currentTime = Math.min(duration || video.duration || 0, video.currentTime + step);
          break;
        }
        case "jumpPrevMarker":
        case "jumpNextMarker": {
          if (!video) break;
          event.preventDefault();
          const anchors = markersRef.current
            // 0.22: прыжки — по той же identity, что таймлайн.
            .filter((m) => markerBelongsToMedia(m, { mediaKey: currentMediaKeyRef.current, contentHash: contentHashRef.current }))
            .map((m) => m.anchor_sec);
          const target = resolveJumpTarget(anchors, video.currentTime, action === "jumpPrevMarker" ? -1 : 1);
          if (target !== undefined) video.currentTime = target;
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
          break;
        case "goToEnd":
          if (!video) break;
          event.preventDefault();
          video.currentTime = video.duration || 0;
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
          addCommentAndOpenPanelRef.current();
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
        probeFps: probeResult?.fps && probeResult.fps > 0 ? probeResult.fps : null,
        estimatedFps,
      });
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        const dir = event.deltaX > 0 ? 1 : -1;
        const limit = duration || video.duration || 0;
        video.currentTime = Math.min(limit, Math.max(0, video.currentTime + dir * frameStep));
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
  }, [src, duration, probeResult, estimatedFps]);

  useEffect(() => {
    if (transportTimerRef.current) {
      window.clearTimeout(transportTimerRef.current);
      transportTimerRef.current = null;
    }
    if (!isMoving || isDebugVisible) {
      setShowTransport(true);
      return;
    }
    transportTimerRef.current = window.setTimeout(() => {
      setShowTransport(false);
    }, 1800);
    return () => {
      if (transportTimerRef.current) {
        window.clearTimeout(transportTimerRef.current);
        transportTimerRef.current = null;
      }
    };
  }, [isDebugVisible, isMoving, currentTime]);

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
    const timer = window.setTimeout(() => setContextToast(""), 2200);
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
      isTauri: () => isTauriRuntimeSync(),
      openFile: () => handleOpenClick().then(() => fileName),
      getFileName: () => fileName,
      getNativeDialogAvailable: () => isTauriRuntimeSync(),
      probe: () => probeResult,
      getPlaylist: () => loadPlaylist(),
    };
    window.vetkaPlayerLab = api;
    return () => {
      if (window.vetkaPlayerLab === api) delete window.vetkaPlayerLab;
    };
  }, [currentMediaKey, markers, provisionalEvents, snapshot]);

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
        file.text().then((text) => {
          try {
            const parsed = JSON.parse(text);
            const imported = Array.isArray(parsed)
              ? parsed
              : (parsed.markers && Array.isArray(parsed.markers) ? parsed.markers : []);
            if (!imported.length) { setContextToast("Markers JSON: file has no markers."); return; }
            const added: PlayerTimeMarker[] = [];
            for (const m of imported) {
              const kind = (["favorite", "negative", "in", "out", "comment", "chat"] as PlayerMarkerKind[]).includes(m.kind)
                ? m.kind as PlayerMarkerKind
                : "favorite";
              const marker = buildMarker(kind, m.text || m.label || "");
              if (marker) {
                marker.anchor_sec = Number(m.anchor_sec ?? m.time ?? marker.anchor_sec);
                marker.start_sec = Number(m.start_sec ?? marker.anchor_sec - 0.5);
                marker.end_sec = Number(m.end_sec ?? marker.anchor_sec + 0.5);
                added.push(marker);
              }
            }
            if (added.length) {
              pushMarkerHistory();
              setMarkers((prev) => [...prev, ...added]);
              setContextToast(`Markers imported: ${added.length}`);
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
    onExportReviewNotes: () => {
      void performExportReviewNotes();
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
  // 0.21: Clear по видам из Edit → Clear. Scope — только текущее видео.
  // Confirm с разбивкой по видам, сама очистка — в undo-стек.
  async function performClearMarkers(scope: ClearScope): Promise<void> {
    const media = currentMediaKeyRef.current;
    if (!media) { setContextToast("Clear: open a video first."); return; }
    const victims = selectMarkersToClear(markersRef.current, media, scope, contentHashRef.current);
    if (!victims.length) { setContextToast("Nothing to clear."); return; }
    if (!(await confirmClearMarkers(victims))) return;
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
    const fps = resolveXmlFps(probeResult?.fps, estimatedFps);
    const fpsSource = resolveXmlFpsSource(probeResult?.fps, estimatedFps);
    const fpsNote = fpsSource === "estimated"
      ? `fps ~${fps} estimated, verify sequence settings`
      : fpsSource === "fallback"
        ? `fps ${fps} fallback, verify sequence settings`
        : undefined;
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
    announceExport("xml", false, result, fpsNote);
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
    const chainProbe = (firstIsCurrent ? probeResult?.fps : null) ?? probeResult?.fps;
    const chainEst = (firstIsCurrent ? estimatedFps : null) ?? estimatedFps;
    const fps = resolveXmlFps(chainProbe, chainEst);
    const fpsSource = resolveXmlFpsSource(chainProbe, chainEst);
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
    const result = await saveFileDialogResult(exportPlaylistToXmeml(items, {
      fps,
      seqWidth,
      seqHeight,
      sequenceName: pl?.name || "Playlist",
    }), `${pl?.name || "playlist"}.xml`, {
      filters: [{ name: "XML", extensions: ["xml"] }],
    });
    announceExport("xml", false, result, note || undefined);
  }
  // 0.19: список правок человеческим языком (фидбэк Васи: продюсеры
  // боятся XML, монтажёр в CapCut — импорта XML там нет). Тост — по
  // тракту srt: формат имени не светится, только факт сохранения.
  async function performExportReviewNotes(): Promise<void> {
    const mm = markers.filter((m) => markerBelongsToMedia(m, mediaIdentity));
    if (!mm.length) { announceExport("srt", true, null); return; }
    const fps = resolveXmlFps(probeResult?.fps, estimatedFps);
    const txt = exportCommentsToText(mm, fps, `Review notes — ${fileName || "markers"}`);
    const result = await saveFileDialogResult(txt, `${fileName || "markers"}.review.txt`, {
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    announceExport("srt", false, result);
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
  menuHandlersRef.current.onExportReviewNotes = () => {
    void performExportReviewNotes();
  };
  menuHandlersRef.current.onUndo = () => {
    performUndoRef.current();
  };
  menuHandlersRef.current.onRedo = () => {
    performRedoRef.current();
  };
  menuHandlersRef.current.onImportSrt = () => {
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
      case "export_review_notes":
        menuHandlersRef.current.onExportReviewNotes();
        break;
      case "import_srt":
        menuHandlersRef.current.onImportSrt();
        break;
      case "fullscreen":
        void toggleFullscreen();
        break;
      case "mute":
        syncVolume(volume, !isMuted);
        break;
      case "play_pause":
        togglePlayback();
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
        addCommentAndOpenPanel();
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
        setContextToast("Media info: FileInfo строка над таймлайном.");
        break;
      case "screenshot":
        setContextToast("Screenshot — в разработке (Mark Player).");
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
        setContextToast("Audio device — системная настройка (заготовка).");
        break;
      case "frame_step_back":
        seekBy(-1);
        break;
      case "frame_step_forward":
        seekBy(1);
        break;
      case "jump_to_time":
        setContextToast("Jump to Time — заготовка (скоро).");
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
        setContextToast("Aspect Ratio — фит по умолчанию (заготовка).");
        break;
      case "subtitle_file":
        menuHandlersRef.current.onImportSrt();
        break;
      case "subtitle_track":
        setContextToast("Subtitle Track — заготовка.");
        break;
      case "subtitle_delay":
        setContextToast("Subtitle Delay — заготовка.");
        break;
      case "subtitle_style":
        setContextToast("Subtitle Style — заготовка.");
        break;
      case "show_controls":
        setShowTransport(true);
        break;
      case "show_markers_panel":
        setContextToast("Markers Panel — заготовка (см. Marker Bar).");
        break;
      case "show_comments":
        setContextToast("Comments");
        void openPanelWindow("panel-comments", "comments", "Comments", 380, 560, withContentHash(currentMediaKey ? `media=${encodeURIComponent(currentMediaKey)}` : undefined));
        break;
      case "theme":
        setContextToast("Theme — тёмная тема по умолчанию (заготовка).");
        break;
      case "minimize":
        void minimizeWindow();
        break;
      case "zoom":
        void zoomWindow();
        break;
      case "bring_all_front":
        setContextToast("Bring All to Front — системное поведение macOS.");
        break;
      case "comments_panel":
        void openPanelWindow("panel-comments", "comments", "Comments", 380, 560, withContentHash(currentMediaKey ? `media=${encodeURIComponent(currentMediaKey)}` : undefined));
        break;
      case "load_module_playlist":
        setContextToast("Load Playlist/Scanner Module — в разработке.");
        break;
      case "load_module_nle":
        setContextToast("Load CUT NLE Module — в разработке.");
        break;
      case "load_module_thalamus":
        setContextToast("Load THALAMUS Task Board — в разработке.");
        break;
      case "mcp_status":
        setContextToast("MCP Status — заготовка.");
        break;
      case "convert_transcode":
        setContextToast("Convert/Transcode — заготовка (Mark Player).");
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
        setContextToast("Task Board — в разработке (THALAMUS).");
        break;
      case "export_edl":
        setContextToast("Export EDL — в разработке (NLE).");
        break;
      case "export_otio":
        setContextToast("Export OTIO — в разработке (NLE).");
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
      case "updates":
        void openExternalLink(GITHUB_RELEASES_URL);
        break;
    }
  };

  async function openExternalLink(url: string): Promise<void> {
    try {
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
    void import("./lib/cutPlayerMenu").then(async ({ applyCutPlayerMenu }) => {
      await applyCutPlayerMenu((action) => {
        if (!disposed) menuActionRef.current(action);
      });
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const syncFullscreen = async () => {
      if (isTauriRuntimeSync()) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          setIsFullscreen(await getCurrentWindow().isFullscreen());
        } catch { /* ignore */ }
      } else {
        setIsFullscreen(Boolean(document.fullscreenElement));
      }
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

  useEffect(() => {
    if (!isTauriRuntimeSync()) return;
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ path: string }>("playlist:play", (event) => {
        const path = event.payload?.path;
        if (path) void handleOpenPath(path);
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  useDragDrop({
    onDrop: (paths) => {
      if (paths.length > 0) { void handleOpenPath(paths[0]); }
    },
  });

  function attachSource(nextUrl: string, name: string) {
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
    attachSource(nextUrl, file.name);
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

  async function handleOpenPath(path: string) {
    if (isSameMediaPath(path, currentFilePathRef.current)) {
      // 0.10.22: клик по уже открытому файлу — src не меняется, loadedmetadata
      // не выстрелит, а сброс naturalSize схлопнул бы сцену до 1px. No-op + resume.
      const current = videoRef.current;
      if (current && current.paused) {
        void current.play().catch(() => {});
      }
      return;
    }
    // Open-gate: стартовый open files / drop / плейлист / ?src= шли мимо
    // диалога прямо в <video> → чёрный экран. Отказ — до probe и attach,
    // предыдущее медиа остаётся.
    const playability = mediaPlayability(path);
    if (playability !== "native") {
      stopPlaybackForRefusal();
      setRefusalToast(mediaRefusalReason(path, playability));
      return;
    }
    setCurrentFilePath(path);
    // 0.22: identity содержимого — параллельно с probe, открытию не мешает.
    refreshContentHash({ path });
    if (isTauriRuntimeSync()) {
      void import("@tauri-apps/api/event").then(({ emit }) => {
        emit("playlist:current", { path }).catch(() => {});
      }).catch(() => {});
    }
    setProbeResult(null);
    probeFile(path, playerLabApiBase).then(setProbeResult);
    const assetUrl = await toAssetUrl(path);
    if (assetUrl) {
      attachSource(assetUrl, path.split("/").pop() || "media");
      rememberInPlaylist(path);
      return;
    }
    const response = await fetch(path);
    const blob = await response.blob();
    const file = new File([blob], path.split("/").pop() || "media", { type: blob.type });
    attachFile(file);
    rememberInPlaylist(path);
  }

  // 0.10.24: открытое видео само падает в плейлист (add-if-absent, без дублей).
  function rememberInPlaylist(path: string) {
    try {
      const base = loadPlaylist() ?? createEmptyPlaylist();
      savePlaylist(addEntryIfAbsent(base, { path, name: path.split("/").pop() || "media", duration: 0 }));
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
      const parsed = deserializePlaylist(await readTextFile(path));
      if (!parsed) {
        setContextToast("Not a playlist: unexpected JSON format.");
        return;
      }
      savePlaylist(parsed);
      setContextToast(`Playlist "${parsed.name}": ${parsed.entries.length} file${parsed.entries.length === 1 ? "" : "s"}.`);
      await openPanelWindow("panel-playlist", "playlist", "Playlist", 360, 500);
    } catch {
      setContextToast("Open Playlist: could not read the file.");
    }
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
      label: kind === "favorite" ? "Favorite" : kind === "negative" ? "Negative" : kind === "in" ? "In point" : kind === "out" ? "Out point" : kind === "comment" ? "Comment" : kind === "chat" ? "Agent chat" : "Marker",
      text,
      author: "player_lab",
      context_slice: null,
      cam_payload: null,
      chat_thread_id: null,
      comment_thread_id: null,
      source_engine: "player_lab",
      status: "active",
      created_at: now,
      updated_at: now,
    };
  }

  function addMomentMarker(kind: PlayerMarkerKind, text = "") {
    const marker = buildMarker(kind, text);
    if (!marker) return null;
    pushMarkerHistory();
    setMarkers((prev) => [...prev, marker]);
    return marker;
  }

  // Косметика 2026-09-25: M / меню / пилюля — один тракт: создать + открыть окно.
  function addCommentAndOpenPanel(): void {
    const m = addMomentMarker("comment", "");
    // 0.12 слайс 1: окно комментов показывает HH:MM:SS:FF — fps едет в query,
    // та же цепочка probe→rVFC, что XML timebase и таймкоды транспорта.
    const fps = resolveXmlFps(probeResult?.fps, estimatedFps);
    if (m) void openPanelWindow("panel-comments", "comments", "Comments", 380, 560, withContentHash(`marker=${encodeURIComponent(m.marker_id)}&media=${encodeURIComponent(m.media_path ?? currentMediaKey ?? "")}&fps=${fps}`));
  }

  function addProvisionalVetkaCapture() {
    if (!currentMediaKey) return null;
    const anchor = Math.max(0, Number(videoRef.current?.currentTime ?? currentTime ?? 0));
    const start = Math.max(0, Number((anchor - 0.5).toFixed(2)));
    const end = Number((anchor + 0.5).toFixed(2));
    const event: ProvisionalCaptureEvent = {
      provisional_event_id: createMarkerId(),
      event_type: "vetka_logo_capture",
      media_path: currentMediaKey,
      start_sec: start,
      end_sec: end,
      text: "Moment registered locally. Connect VETKA Core/CUT for full workflow.",
      created_at: new Date().toISOString(),
      export_mode: "srt_comment",
      migration_status: "local_only",
      migrated_to_marker_id: null,
    };
    setProvisionalEvents((prev) => [...prev, event]);
    return event;
  }

  function handleContextAction() {
    if (!isInVetka) {
      const event = addProvisionalVetkaCapture();
      if (event) {
        setVetkaToast(VETKA_PROMO_TOAST);
      }
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
              {probeResult?.ok ? <FileInfoRow probe={probeResult} /> : null}
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
          accept="video/*,image/*"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) attachFile(file);
          }}
        />

        <div className="stage-wrap">
          <div
            ref={shellRef}
            className={`viewer-shell player-shell ${variant} ${footerReserve === 0 ? "footerless" : ""}${isFullscreen && chromeHidden ? " fullscreen-chrome-hidden" : ""}`}
            style={shellSizeOverride && !isPureMode && !isFullscreen ? { width: `${shellSizeOverride.width}px`, height: `${shellSizeOverride.height}px` } : undefined}
          >
            <div ref={viewerRef} className="viewer-area player-canvas">
              {volumeOsdVisible ? (
                <div className="volume-osd" data-testid="volume-osd">
                  {isMuted ? "Muted" : `Volume ${Math.round(volume * 100)}%`}
                </div>
              ) : null}
              {src ? (
                <>
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
                          }}
                          onLoadedData={(event) => {
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
                          }}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onError={() => {
                            // 0.10.22: ошибки видео были немыми — чёрный экран без улик.
                            const code = videoRef.current?.error?.code ?? 0;
                            setContextToast(`Cannot play ${currentFilePath ?? fileName ?? "media"} (video error ${code})`);
                          }}
                          onTimeUpdate={(event) => setCurrentTime(Number(event.currentTarget.currentTime || 0))}
                          onDurationChange={(event) => setDuration(Number(event.currentTarget.duration || 0))}
                          onVolumeChange={(event) => {
                            setVolume(Number(event.currentTarget.volume || 0));
                            setIsMuted(Boolean(event.currentTarget.muted));
                          }}
                          onEnded={() => {
                            // 0.10.19: shuttle level must die with the clip,
                            // or the next file inherits a lying badge.
                            stopShuttleRef.current();
                            const pl = loadPlaylist();
                            if (!pl) return;
                            const next = getNextEntry(pl, currentFilePath, loadPlaybackMode());
                            if (!next) return;
                            if (next.path === currentFilePath) {
                              // loop one / единственная запись: src тот же — перезапуск на месте.
                              const video = videoRef.current;
                              if (video) {
                                video.currentTime = 0;
                                void video.play().catch(() => {});
                              }
                              return;
                            }
                            setCurrentFilePath(next.path);
                            setProbeResult(null);
                            probeFile(next.path, playerLabApiBase).then(setProbeResult);
                            void toAssetUrl(next.path).then((assetUrl) => {
                              if (assetUrl) {
                                attachSource(assetUrl, next.name);
                                return;
                              }
                              fetch(next.path).then((r) => r.blob()).then((blob) => {
                                const file = new File([blob], next.name, { type: blob.type });
                                attachFile(file);
                              });
                            });
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className={`topbar-dock ${showTransport ? "viewer-toolbar-visible" : "viewer-toolbar-hidden"}`}>
                    <div className="topbar-zone topbar-left">
                      <button
                        className="icon-button icon-button-ghost"
                        type="button"
                        onClick={() => handleContextAction()}
                        data-testid="context-action"
                        aria-label={isInVetka ? "Favorite this moment" : "Add to VETKA"}
                        title={isInVetka ? `Favorite this moment (${favoriteMomentCount})` : "Add to VETKA"}
                      >
                        {isInVetka ? <IconStar active={true} /> : <IconVetka />}
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
                    </div>
                    <div className="topbar-zone topbar-center">
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
                        <button className="transport-button" type="button" onClick={() => { addCommentAndOpenPanel(); }} data-testid="marker-comment" aria-label={tooltipFor("marker-comment")} title={tooltipFor("marker-comment")}>
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
                  {refusalToast ? <div className="context-toast refusal-toast" data-testid="refusal-toast">{refusalToast}</div> : null}
                  {vetkaToast ? <div className="context-toast vetka-promo-toast" data-testid="vetka-promo-toast">{vetkaToast}</div> : null}
                  {mediaKind === "video" ? (
                    <>
                      <div
                        className={`transport-overlay ${showTransport ? "transport-visible" : "transport-hidden"}`}
                        onMouseMove={() => setShowTransport(true)}
                        onMouseLeave={() => {
                          if (isMoving && !isDebugVisible) setShowTransport(false);
                        }}
                      >
                        <div className="transport-scrim" />
                        <div className="transport-bar">
                          <div className="transport-group">
                            <button className="transport-button transport-button-primary" type="button" onClick={() => togglePlayback()} aria-label={shuttleDisplay.label} title={`${shuttleDisplay.label} (Space)`} data-testid="transport-play-pause" data-shuttle={shuttle}>
                              {isMoving ? <IconPause /> : <IconPlay />}
                            </button>
                            <span className="transport-time-col">
                              <span className="transport-time">{formatTimecode(currentTime, resolveXmlFps(probeResult?.fps, estimatedFps))}</span>
                              <span className={shuttleSlotClass(shuttleDisplay.badge)} data-testid="transport-shuttle-badge" title={shuttleDisplay.label}>
                                {shuttleDisplay.badge ?? ""}
                              </span>
                            </span>
                            <div ref={progressWrapRef} className="transport-progress-wrap">
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
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        beginMarkerDrag(marker.marker_id);
                                      }}
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
                                    title={marker.kind === "in" ? "In point" : "Out point"}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        beginMarkerDrag(marker.marker_id);
                                      }}
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
                                min={0}
                                max={Math.max(duration, 0.001)}
                                step={0.01}
                                value={Math.min(currentTime, duration || 0)}
                                onChange={(event) => {
                                  const nextTime = Number(event.target.value || 0);
                                  setCurrentTime(nextTime);
                                  if (videoRef.current) videoRef.current.currentTime = nextTime;
                                }}
                                aria-label="Seek"
                              />
                              <div
                                className="transport-playhead"
                                style={{ left: `${(currentTime / Math.max(duration, 0.001)) * 100}%` }}
                              />
                            </div>
                            <span className="transport-time">{formatTimecode(duration, resolveXmlFps(probeResult?.fps, estimatedFps))}</span>
                          </div>
                          <div className="transport-group">
                            <div className="transport-volume-wrap">
                              <button className="transport-button" type="button" onClick={() => {
                                if (showVolume) {
                                  setShowVolume(false);
                                } else {
                                  setShowVolume(true);
                                }
                              }} aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}>
                                <IconVolume isMuted={isMuted || volume === 0} />
                              </button>
                              {showVolume ? (
                                <div className="volume-popup">
                                  <input
                                    className="volume-slider"
                                    type="range"
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
                        </div>
                      </div>
                      <button
                        className="seek-zone seek-zone-left"
                        type="button"
                        aria-label="Seek backward"
                        onClick={() => seekBy(-1)}
                      />
                      <button
                        className="seek-zone seek-zone-right"
                        type="button"
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
                    <button className="dropzone-open" type="button" onClick={handleOpenClick}>
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
