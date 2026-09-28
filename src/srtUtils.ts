export const MARKER_PREFIX = {
  FAVORITE: "\u2605 ",
  NEGATIVE: "\u2717 ",
  IN: "\u21d2 ",
  OUT: "\u2190 ",
  NOTE: "\u00b7 ",
} as const;

const MARKER_KIND_TO_PREFIX: Record<string, string> = {
  favorite: MARKER_PREFIX.FAVORITE,
  negative: MARKER_PREFIX.NEGATIVE,
  in: MARKER_PREFIX.IN,
  out: MARKER_PREFIX.OUT,
  note: MARKER_PREFIX.NOTE,
  comment: MARKER_PREFIX.NOTE,
  chat: MARKER_PREFIX.NOTE,
};

const KIND_PREFIX: Record<string, string> = {
  favorite: "\u2605 FAVORITE",
  negative: "\u2717 NEGATIVE",
  inout: "\u2912 IN-OUT",
  note: "\u00B7 NOTE",
};

// 0.10.27: глиф для имён с label («✗ Negative») — символ без слова-дубля.
const KIND_GLYPH: Record<string, string> = {
  favorite: "\u2605",
  negative: "\u2717",
  inout: "\u2912",
  note: "\u00B7",
  comment: "\u00B7",
  chat: "\u00B7",
};

// 0.10.27: цвет маркера для Premiere (<pproColor>). Живой факт из
// IMG_9127.MOV_1_for_red.xml: 4281740498 = 0xFF362CD2 читается как
// ABGR(R210 G44 B54) = красный. Упаковка: 0xFF | B<<16 | G<<8 | R.
// Значения ниже — чистые цвета видов в той же упаковке; ABGR-гипотеза
// проверяется глазами при импорте (если цвета поплывут — пересчитать).
const KIND_PPRO_COLOR: Record<string, number> = {
  negative: 4278190335, // 0xFF0000FF — красный
  favorite: 4278255360, // 0xFF00FF00 — зелёный
  comment: 4294901760, // 0xFFFF0000 — синий
  note: 4294901760, // 0xFFFF0000 — синий
  chat: 4294901760, // 0xFFFF0000 — синий
};

const PREFIX_TO_KIND: Record<string, string> = {};
for (const [kind, prefix] of Object.entries(KIND_PREFIX)) {
  PREFIX_TO_KIND[prefix] = kind;
}

function toSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function parseSrtTime(str: string): number {
  const [h, m, rest] = str.split(":");
  const [s, ms] = rest.split(",");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

interface SrtExportable {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  label: string;
  text: string;
  media_path: string;
}

interface SrtImportResult {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  label: string;
  text: string;
  media_path: string;
}

export function exportMarkersToSrt(markers: SrtExportable[]): string {
  if (!markers.length) return "";
  return markers
    .map((m, i) => {
      const prefix = KIND_PREFIX[m.kind] || m.kind.toUpperCase();
      const text = m.text ? ` | ${m.text}` : "";
      return `${i + 1}\n${toSrtTime(m.start_sec)} --> ${toSrtTime(m.end_sec)}\n${prefix} | ${m.label}${text}`;
    })
    .join("\n\n") + "\n";
}

export function importSrtToMarkers(srt: string, mediaPath: string): SrtImportResult[] {
  if (!srt.trim()) return [];
  const blocks = srt.trim().split(/\n\n+/);
  const results: SrtImportResult[] = [];
  let index = 0;

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const textLine = lines.slice(2).join(" ");
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/,
    );
    if (!timeMatch) continue;
    const startSec = parseSrtTime(timeMatch[1]);
    const endSec = parseSrtTime(timeMatch[2]);

    let kind = "favorite";
    let label = textLine;
    let text = "";
    for (const [prefix, k] of Object.entries(PREFIX_TO_KIND)) {
      if (textLine.startsWith(prefix)) {
        kind = k;
        label = textLine.slice(prefix.length).replace(/^\s*\|\s*/, "").trim();
        const pipeIdx = textLine.indexOf("|", prefix.length);
        if (pipeIdx !== -1) {
          const afterKind = textLine.slice(pipeIdx + 1).trim();
          const parts = afterKind.split("|").map((s) => s.trim());
          label = parts[0] || "";
          text = parts.slice(1).join(" | ").trim();
        }
        break;
      }
    }

    const anchorSec = (startSec + endSec) / 2;
    index++;
    results.push({
      marker_id: `srt_imported_${index}_${Date.now().toString(36)}`,
      kind,
      start_sec: startSec,
      end_sec: endSec,
      anchor_sec: anchorSec,
      label: label || kind,
      text,
      media_path: mediaPath,
    });
  }

  return results;
}

export function appendMarkerToSrt(srt: string, marker: SrtExportable): string {
  const blocks = srt.trim() ? srt.trim().split(/\n\n+/) : [];
  const idx = blocks.length + 1;
  const prefix = MARKER_KIND_TO_PREFIX[marker.kind] || MARKER_PREFIX.NOTE;
  const textPart = marker.text ? ` | ${marker.text}` : "";
  const entry = `${idx}\n${toSrtTime(marker.start_sec)} --> ${toSrtTime(marker.end_sec)}\n${prefix}${marker.label}${textPart}`;
  return srt.trim() ? `${srt.trim()}\n\n${entry}\n` : `${entry}\n`;
}

export function exportMarkersToSrtV2(markers: SrtExportable[]): string {
  if (!markers.length) return "";
  return markers
    .map((m, i) => {
      const prefix = MARKER_KIND_TO_PREFIX[m.kind] || MARKER_PREFIX.NOTE;
      const textPart = m.text ? ` | ${m.text}` : "";
      return `${i + 1}\n${toSrtTime(m.start_sec)} --> ${toSrtTime(m.end_sec)}\n${prefix}${m.label}${textPart}`;
    })
    .join("\n\n") + "\n";
}

interface SidecarMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  label: string;
  text: string;
  created_at?: string;
}

interface SidecarProvisionalEvent {
  provisional_event_id: string;
  event_type: string;
  start_sec: number;
  end_sec: number;
  text: string;
  created_at?: string;
}

export function exportToSidecar(
  markers: SidecarMarker[],
  provisionalEvents: SidecarProvisionalEvent[],
  mediaPath: string,
): string {
  const sidecar = {
    sos_version: "0.3",
    source: "cut_player",
    media_path: mediaPath,
    generated_at: new Date().toISOString(),
    markers: markers.map((m) => ({
      marker_id: m.marker_id,
      kind: m.kind,
      start_sec: m.start_sec,
      end_sec: m.end_sec,
      anchor_sec: m.anchor_sec,
      label: m.label,
      text: m.text,
      created_at: m.created_at || "",
    })),
    provisional_events: provisionalEvents.map((e) => ({
      provisional_event_id: e.provisional_event_id,
      event_type: e.event_type,
      start_sec: e.start_sec,
      end_sec: e.end_sec,
      text: e.text,
      created_at: e.created_at || "",
    })),
    vision: null,
  };
  return JSON.stringify(sidecar, null, 2);
}

function secToTimecode(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const f = Math.round((totalSec % 1) * 25);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

export function exportMarkersToXml(
  markers: { marker_id: string; kind: string; start_sec: number; end_sec: number; label: string; text: string }[],
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<cut_markers>",
    markers.length === 0 ? "  <!-- no markers -->" : "",
  ];

  for (const m of markers) {
    lines.push("  <marker>");
    lines.push(`    <id>${escapeXml(m.marker_id)}</id>`);
    lines.push(`    <kind>${escapeXml(m.kind)}</kind>`);
    lines.push(`    <start_sec>${m.start_sec.toFixed(3)}</start_sec>`);
    lines.push(`    <end_sec>${m.end_sec.toFixed(3)}</end_sec>`);
    lines.push(`    <start_tc>${secToTimecode(m.start_sec)}</start_tc>`);
    lines.push(`    <end_tc>${secToTimecode(m.end_sec)}</end_tc>`);
    if (m.label) lines.push(`    <label>${escapeXml(m.label)}</label>`);
    if (m.text) lines.push(`    <text>${escapeXml(m.text)}</text>`);
    lines.push("  </marker>");
  }

  lines.push("</cut_markers>");
  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const XMEML_TICKS_PER_SECOND = 254016000000;

export interface XmemlExportOptions {
  fps: number;
  width: number;
  height: number;
  // 0.10.25: фолбэк-чейн probe ?? naturalSize ?? 1280×720. naturalSize —
  // метадата <video> из браузера, probe не нужен (мёртвый probe больше не
  // роняет вертикалку в ландшафтный таймлайн).
  naturalWidth?: number;
  naturalHeight?: number;
  durationSec: number;
  sourcePath: string;
  sequenceName?: string;
  hasAudio?: boolean;
}

interface XmemlMarkerInput {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec: number;
  label: string;
  text: string;
}

// Bell №3: fps-цепочка XML = probe → rVFC-оценка → 25. Раньше XML брал только
// probe (в релизе мёртвый) и всегда врал timebase 25.
export function resolveXmlFps(
  probeFps: number | null | undefined,
  estimatedFps: number | null | undefined,
): number {
  if (probeFps && probeFps > 0) return probeFps;
  if (estimatedFps && estimatedFps > 0) return estimatedFps;
  return 25;
}

export type XmlFpsSource = "probe" | "estimated" | "fallback";
// EN-тост estimated fps (E2E Premiere 46 vs 50): источник наружу — та же
// цепочка, что resolveXmlFps, чтобы тост и timebase не разъезжались.
export function resolveXmlFpsSource(
  probeFps: number | null | undefined,
  estimatedFps: number | null | undefined,
): XmlFpsSource {
  if (probeFps && probeFps > 0) return "probe";
  if (estimatedFps && estimatedFps > 0) return "estimated";
  return "fallback";
}

// 0.12 слайс 1: взрослый таймкод HH:MM:SS:FF как в Premiere — всегда 11
// знаков (табличный моноширинный рендер фиксирует ширину тулбара).
// Кадры — из той же fps-цепочки, что XML timebase (не дублировать резолв).
export function formatTimecode(seconds: number, fps: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00:00";
  const rate = Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.round(fps)) : 25;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const frames = Math.min(rate - 1, Math.floor((seconds - whole) * rate));
  const p2 = (n: number) => n.toString().padStart(2, "0");
  return `${p2(hours)}:${p2(mins)}:${p2(secs)}:${p2(frames)}`;
}

// Bell №3: аудио по умолчанию считается присутствующим — выбросить реальную
// дорожку хуже, чем отдать пустую. Единственный честный «нет»: элемент знает
// треки (audioTracks поддерживается) и их ноль, либо живой probe без audio.
export function resolveXmlHasAudio(
  audioTracksLength: number | undefined,
  probeOk: boolean,
  probeAudio: boolean,
): boolean {
  if (typeof audioTracksLength === "number") return audioTracksLength > 0;
  if (probeOk) return probeAudio;
  return true;
}

// 0.18: общее ядро XMEML — парсинг in/out, маркеры с цветами ABGR,
// каркас документа. Одиночный экспорт ниже отдаёт сюда парсинг
// (splitSourceClips), плейлист — парсинг и сборку целиком.
interface XmemlClip {
  inF: number;
  outF: number;
}

interface XmemlClipMarker {
  name: string;
  comment: string;
  inF: number;
  outF: number;
  color: number | null;
}

function splitSourceClips(
  markers: XmemlMarkerInput[],
  toFrames: (sec: number) => number,
  durationFrames: number,
): { clips: XmemlClip[]; clipMarkers: XmemlClipMarker[] } {
  // in/out pairs → timeline clips (резка); everything else → clip markers.
  const sorted = [...markers].sort((a, b) => a.start_sec - b.start_sec);
  const clips: XmemlClip[] = [];
  const clipMarkers: XmemlClipMarker[] = [];
  let pendingIn: number | null = null;
  for (const m of sorted) {
    if (m.kind === "in") { pendingIn = toFrames(m.start_sec); continue; }
    if (m.kind === "out") {
      if (pendingIn !== null) {
        const outF = toFrames(m.start_sec);
        if (outF > pendingIn) clips.push({ inF: pendingIn, outF });
        pendingIn = null;
      }
      continue;
    }
    const prefix = KIND_PREFIX[m.kind] || "";
    // 0.10.27: имя — глиф + label («✗ Negative», «★ good»); слово-префикс
    // только когда label пуст (решение пользователя — символы оставить).
    const label = (m.label || "").trim();
    const glyph = KIND_GLYPH[m.kind] || "";
    clipMarkers.push({
      name: label ? (glyph ? `${glyph} ${label}` : label) : `${prefix}${m.kind}`.trim(),
      comment: m.text || "",
      color: KIND_PPRO_COLOR[m.kind] ?? null,
      inF: toFrames(m.start_sec),
      // out=-1 for single-frame markers (Premiere compat fix tb_1781243188)
      outF: m.end_sec > m.start_sec ? toFrames(m.end_sec) : -1,
    });
  }
  if (pendingIn !== null && pendingIn < durationFrames) clips.push({ inF: pendingIn, outF: durationFrames });
  if (clips.length === 0) clips.push({ inF: 0, outF: durationFrames });
  return { clips, clipMarkers };
}

interface XmemlSourceBuild {
  fileIdx: number;
  fileName: string;
  sourcePath: string;
  durationFrames: number;
  width: number;
  height: number;
  hasAudio: boolean;
  clipNameBase: string;
  clips: XmemlClip[];
  clipMarkers: XmemlClipMarker[];
}

interface XmemlSequenceSpec {
  timebase: number;
  ntsc: "TRUE" | "FALSE";
  name: string;
  width: number;
  height: number;
  totalFrames: number;
}

function xmemlNtsc(fps: number | undefined): "TRUE" | "FALSE" {
  return typeof fps === "number" && Number.isInteger(fps) && fps > 0 ? "FALSE" : "TRUE";
}

function xmemlRateBlock(timebase: number, ntsc: "TRUE" | "FALSE", indent: string): string {
  return `${indent}<rate>\n${indent}\t<timebase>${timebase}</timebase>\n${indent}\t<ntsc>${ntsc}</ntsc>\n${indent}</rate>`;
}

// Полный <file>: первый clipitem каждого источника определяет файл,
// остальные ссылаются (<file id="file-N" />) — паттерн боевого одиночного.
function pushXmemlFileDef(L: string[], s: XmemlSourceBuild, timebase: number, ntsc: "TRUE" | "FALSE", indent: string): void {
  const rateBlock = (ind: string) => xmemlRateBlock(timebase, ntsc, ind);
  L.push(`${indent}<file id="file-${s.fileIdx}">`);
  L.push(`${indent}\t<name>${escapeXml(s.fileName)}</name>`);
  L.push(`${indent}\t<pathurl>file://localhost${escapeXml(s.sourcePath)}</pathurl>`);
  L.push(rateBlock(`${indent}\t`));
  L.push(`${indent}\t<duration>${s.durationFrames}</duration>`);
  L.push(`${indent}\t<timecode>`);
  L.push(rateBlock(`${indent}\t\t`));
  L.push(`${indent}\t\t<string>00:00:00:00</string>`);
  L.push(`${indent}\t\t<frame>0</frame>`);
  L.push(`${indent}\t\t<displayformat>NDF</displayformat>`);
  L.push(`${indent}\t</timecode>`);
  L.push(`${indent}\t<media>`);
  L.push(`${indent}\t\t<video>`);
  L.push(`${indent}\t\t\t<samplecharacteristics>`);
  L.push(rateBlock(`${indent}\t\t\t\t`));
  L.push(`${indent}\t\t\t\t\t<width>${s.width}</width>`);
  L.push(`${indent}\t\t\t\t\t<height>${s.height}</height>`);
  L.push(`${indent}\t\t\t\t\t<anamorphic>FALSE</anamorphic>`);
  L.push(`${indent}\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>`);
  L.push(`${indent}\t\t\t\t\t<fielddominance>none</fielddominance>`);
  L.push(`${indent}\t\t\t\t</samplecharacteristics>`);
  L.push(`${indent}\t\t\t</video>`);
  if (s.hasAudio) {
    // Probe carries only the audio codec flag, not samplerate/depth:
    // standard 48kHz/16-bit/stereo assumed (follow-up: extend probe).
    L.push(`${indent}\t\t<audio>`);
    L.push(`${indent}\t\t\t<samplecharacteristics>`);
    L.push(`${indent}\t\t\t\t<depth>16</depth>`);
    L.push(`${indent}\t\t\t\t<samplerate>48000</samplerate>`);
    L.push(`${indent}\t\t\t</samplecharacteristics>`);
    L.push(`${indent}\t\t\t<channelcount>2</channelcount>`);
    L.push(`${indent}\t\t</audio>`);
  }
  L.push(`${indent}\t</media>`);
  L.push(`${indent}</file>`);
}

// 0.10.27: цвет маркера (порядок полей как у Premiere: после out).
function pushXmemlMarkers(L: string[], clipMarkers: XmemlClipMarker[], indent: string): void {
  for (const cm of clipMarkers) {
    L.push(`${indent}<marker>`);
    L.push(`${indent}\t<comment>${escapeXml(cm.comment)}</comment>`);
    L.push(`${indent}\t<name>${escapeXml(cm.name)}</name>`);
    L.push(`${indent}\t<in>${cm.inF}</in>`);
    L.push(`${indent}\t<out>${cm.outF}</out>`);
    if (cm.color !== null) L.push(`${indent}\t<pproColor>${cm.color}</pproColor>`);
    L.push(`${indent}</marker>`);
  }
}

function buildXmemlDocument(sources: XmemlSourceBuild[], seq: XmemlSequenceSpec): string {
  const { timebase } = seq;
  const toTicks = (frame: number) => Math.floor((frame * XMEML_TICKS_PER_SECOND) / timebase);
  const rateBlock = (indent: string) => xmemlRateBlock(timebase, seq.ntsc, indent);

  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push("<!DOCTYPE xmeml>");
  L.push('<xmeml version="4">');
  L.push(`\t<sequence id="sequence-playerlab">`);
  L.push(`\t\t<duration>${seq.totalFrames}</duration>`);
  L.push(rateBlock("\t\t"));
  L.push(`\t\t<name>${escapeXml(seq.name)}</name>`);
  if (sources.length === 0) L.push("\t\t<!-- no sources -->");
  L.push("\t\t<media>");
  L.push("\t\t\t<video>");
  L.push("\t\t\t\t<format>");
  L.push("\t\t\t\t\t<samplecharacteristics>");
  L.push(rateBlock("\t\t\t\t\t"));
  L.push(`\t\t\t\t\t\t<width>${seq.width}</width>`);
  L.push(`\t\t\t\t\t\t<height>${seq.height}</height>`);
  L.push("\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>");
  L.push("\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>");
  L.push("\t\t\t\t\t\t<fielddominance>none</fielddominance>");
  L.push("\t\t\t\t\t</samplecharacteristics>");
  L.push("\t\t\t\t</format>");
  L.push('\t\t\t\t<track TL.SQTrackShy="0" TL.SQTrackExpandedHeight="55" TL.SQTrackExpanded="0" MZ.TrackTargeted="1">');

  let n = 0;
  let timelinePos = 0;
  for (const s of sources) {
    let firstOfSource = true;
    for (const clip of s.clips) {
      n += 1;
      const len = clip.outF - clip.inF;
      L.push(`\t\t\t\t\t<clipitem id="clipitem-${n}">`);
      L.push(`\t\t\t\t\t\t<masterclipid>masterclip-${s.fileIdx}</masterclipid>`);
      L.push(`\t\t\t\t\t\t<name>${escapeXml(s.clipNameBase)} ${n}</name>`);
      L.push("\t\t\t\t\t\t<enabled>TRUE</enabled>");
      L.push(`\t\t\t\t\t\t<duration>${s.durationFrames}</duration>`);
      L.push(rateBlock("\t\t\t\t\t"));
      L.push(`\t\t\t\t\t\t<start>${timelinePos}</start>`);
      L.push(`\t\t\t\t\t\t<end>${timelinePos + len}</end>`);
      L.push(`\t\t\t\t\t\t<in>${clip.inF}</in>`);
      L.push(`\t\t\t\t\t\t<out>${clip.outF}</out>`);
      L.push(`\t\t\t\t\t\t<pproTicksIn>${toTicks(clip.inF)}</pproTicksIn>`);
      L.push(`\t\t\t\t\t\t<pproTicksOut>${toTicks(clip.outF)}</pproTicksOut>`);
      L.push("\t\t\t\t\t\t<alphatype>none</alphatype>");
      L.push("\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>");
      L.push("\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>");
      if (firstOfSource) {
        pushXmemlFileDef(L, s, timebase, seq.ntsc, "\t\t\t\t\t\t");
        firstOfSource = false;
      } else {
        L.push(`\t\t\t\t\t\t<file id="file-${s.fileIdx}" />`);
      }
      pushXmemlMarkers(L, s.clipMarkers, "\t\t\t\t\t\t");
      L.push("\t\t\t\t\t</clipitem>");
      timelinePos += len;
    }
  }
  L.push("\t\t\t\t\t<enabled>TRUE</enabled>");
  L.push("\t\t\t\t\t<locked>FALSE</locked>");
  L.push("\t\t\t\t</track>");
  L.push("\t\t\t</video>");

  if (sources.some((s) => s.hasAudio)) {
    L.push("\t\t<audio>");
    L.push('\t\t\t\t<track TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="0">');
    let an = 0;
    let audioPos = 0;
    for (const s of sources) {
      for (const clip of s.clips) {
        const len = clip.outF - clip.inF;
        // Немой источник не даёт clipitem, но его спан двигает позицию —
        // иначе звук рассинхронизируется с видео.
        if (!s.hasAudio) { audioPos += len; continue; }
        an += 1;
        L.push(`\t\t\t\t\t<clipitem id="clipitem-a${an}">`);
        L.push(`\t\t\t\t\t\t<masterclipid>masterclip-${s.fileIdx}</masterclipid>`);
        L.push(`\t\t\t\t\t\t<name>${escapeXml(s.clipNameBase)} ${an}</name>`);
        L.push("\t\t\t\t\t\t<enabled>TRUE</enabled>");
        L.push(`\t\t\t\t\t\t<duration>${s.durationFrames}</duration>`);
        L.push(rateBlock("\t\t\t\t\t"));
        L.push(`\t\t\t\t\t\t<start>${audioPos}</start>`);
        L.push(`\t\t\t\t\t\t<end>${audioPos + len}</end>`);
        L.push(`\t\t\t\t\t\t<in>${clip.inF}</in>`);
        L.push(`\t\t\t\t\t\t<out>${clip.outF}</out>`);
        L.push(`\t\t\t\t\t\t<pproTicksIn>${toTicks(clip.inF)}</pproTicksIn>`);
        L.push(`\t\t\t\t\t\t<pproTicksOut>${toTicks(clip.outF)}</pproTicksOut>`);
        L.push(`\t\t\t\t\t\t<file id="file-${s.fileIdx}" />`);
        L.push("\t\t\t\t\t</clipitem>");
        audioPos += len;
      }
    }
    L.push("\t\t\t\t\t<enabled>TRUE</enabled>");
    L.push("\t\t\t\t\t<locked>FALSE</locked>");
    L.push("\t\t\t\t</track>");
    L.push("\t\t\t</audio>");
  }

  L.push("\t\t</media>");
  L.push("\t\t<timecode>");
  L.push(rateBlock("\t\t"));
  L.push("\t\t\t<string>00:00:00:00</string>");
  L.push("\t\t\t<frame>0</frame>");
  L.push("\t\t\t<displayformat>NDF</displayformat>");
  L.push("\t\t</timecode>");
  L.push("\t</sequence>");
  L.push("</xmeml>");
  return L.join("\n");
}

// 0.18: весь плейлист — один sequence для Premiere. Порядок — из entries,
// склейки — из in/out каждого элемента, offset нарастает длительностями.
// Timebase — fps-цепочка первого элемента (Premiere берёт fps первого видео).
export interface XmemlPlaylistItemInput {
  sourcePath: string;
  clipName: string;
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  markers: XmemlMarkerInput[];
}

export interface XmemlPlaylistOptions {
  fps: number;
  seqWidth: number;
  seqHeight: number;
  sequenceName: string;
}

export function exportPlaylistToXmeml(items: XmemlPlaylistItemInput[], opts: XmemlPlaylistOptions): string {
  const timebase = Math.max(1, Math.round(opts.fps || 25));
  const toFrames = (sec: number) => Math.max(0, Math.round(sec * timebase));
  const seqName = opts.sequenceName || "Playlist";
  const seqWidth = Math.max(1, Math.round(opts.seqWidth || 1280));
  const seqHeight = Math.max(1, Math.round(opts.seqHeight || 720));
  const sources: XmemlSourceBuild[] = items.map((it, i) => {
    const durationFrames = Math.max(1, toFrames(it.durationSec || 0));
    const { clips, clipMarkers } = splitSourceClips(it.markers, toFrames, durationFrames);
    return {
      fileIdx: i + 1,
      fileName: it.sourcePath.split(/[\\/]/).pop() || "media",
      sourcePath: it.sourcePath,
      durationFrames,
      width: Math.max(1, Math.round(it.width || seqWidth)),
      height: Math.max(1, Math.round(it.height || seqHeight)),
      hasAudio: it.hasAudio === true,
      clipNameBase: it.clipName || `Clip ${i + 1}`,
      clips,
      clipMarkers,
    };
  });
  const totalFrames = sources.reduce(
    (acc, s) => acc + s.clips.reduce((a, c) => a + (c.outF - c.inF), 0),
    0,
  );
  return buildXmemlDocument(sources, {
    timebase,
    ntsc: xmemlNtsc(opts.fps),
    name: seqName,
    width: seqWidth,
    height: seqHeight,
    totalFrames,
  });
}

// 0.18: метаданные элементов плейлиста. Сид — известное (длительность
// из entries, probe/natural текущего); остальное добирает loader —
// скрытый video preload="metadata", без полной загрузки файлов.
// Loader инжектируется: чистые тесты без DOM, боевое — через toAssetUrl.
export interface PlaylistMetaSeed {
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface PlaylistMeta {
  durationSec: number;
  width: number;
  height: number;
}

export async function resolvePlaylistMetadata(
  paths: string[],
  seeds: Record<string, PlaylistMetaSeed | undefined>,
  loadMeta: (path: string) => Promise<PlaylistMeta | null>,
): Promise<Record<string, PlaylistMeta>> {
  const out: Record<string, PlaylistMeta> = {};
  for (const p of paths) {
    const s = seeds[p] ?? {};
    const seedDur = s.durationSec ?? 0;
    const seedW = s.width ?? 0;
    const seedH = s.height ?? 0;
    if (seedDur > 0 && seedW > 0 && seedH > 0) {
      out[p] = { durationSec: seedDur, width: seedW, height: seedH };
      continue;
    }
    let loaded: PlaylistMeta | null = null;
    try {
      loaded = await loadMeta(p);
    } catch {
      loaded = null;
    }
    out[p] = {
      durationSec: seedDur > 0 ? seedDur : (loaded?.durationSec ?? 0),
      width: seedW > 0 ? seedW : (loaded?.width ?? 0),
      height: seedH > 0 ? seedH : (loaded?.height ?? 0),
    };
  }
  return out;
}

// XMEML v4 export for Adobe Premiere Pro import.
// Mirrors scripts/cut_xml_export.py (battle-tested 2026-07-15, RECON_XML_EXPORT_PREMIERE_v4):
// <sequence> directly under <xmeml>, ~15-field clipitems, pproTicks,
// markers inside clipitem, file://localhost pathurl, out=-1 for point markers.
// 0.18: shared core below (splitSourceClips/buildXmemlDocument) serves single + playlist.
// [signal: xmeml v4 каркас] [project: cut-player]
export function exportMarkersToXmeml(markers: XmemlMarkerInput[], opts: XmemlExportOptions): string {
  const timebase = Math.max(1, Math.round(opts.fps || 25));
  const ntsc = Number.isInteger(opts.fps) && opts.fps > 0 ? "FALSE" : "TRUE";
  const toFrames = (sec: number) => Math.max(0, Math.round(sec * timebase));
  const toTicks = (frame: number) => Math.floor((frame * XMEML_TICKS_PER_SECOND) / timebase);
  const rateBlock = (indent: string) =>
    `${indent}<rate>\n${indent}\t<timebase>${timebase}</timebase>\n${indent}\t<ntsc>${ntsc}</ntsc>\n${indent}</rate>`;

  const durationFrames = Math.max(1, toFrames(opts.durationSec || 0));
  const fileName = opts.sourcePath.split(/[\\/]/).pop() || "media";
  const seqName = opts.sequenceName || "Review";
  // 0.10.25: dims сиквенса — probe ?? naturalSize ?? 1280×720.
  const seqWidth = Math.max(1, Math.round(opts.width || opts.naturalWidth || 1280));
  const seqHeight = Math.max(1, Math.round(opts.height || opts.naturalHeight || 720));

  // 0.18: парсинг — общий splitSourceClips (тот же код, что был здесь inline).
  const { clips, clipMarkers } = splitSourceClips(markers, toFrames, durationFrames);

  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push("<!DOCTYPE xmeml>");
  L.push('<xmeml version="4">');
  L.push(`\t<sequence id="sequence-playerlab">`);
  L.push(`\t\t<duration>${durationFrames}</duration>`);
  L.push(rateBlock("\t\t"));
  L.push(`\t\t<name>${escapeXml(seqName)}</name>`);
  L.push("\t\t<media>");
  L.push("\t\t\t<video>");
  L.push("\t\t\t\t<format>");
  L.push("\t\t\t\t\t<samplecharacteristics>");
  L.push(rateBlock("\t\t\t\t\t"));
    L.push(`\t\t\t\t\t\t<width>${seqWidth}</width>`);
    L.push(`\t\t\t\t\t\t<height>${seqHeight}</height>`);
    L.push("\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>");
    L.push("\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>");
    L.push("\t\t\t\t\t\t<fielddominance>none</fielddominance>");
    L.push("\t\t\t\t\t</samplecharacteristics>");
    L.push("\t\t\t\t</format>");
  L.push('\t\t\t\t<track TL.SQTrackShy="0" TL.SQTrackExpandedHeight="55" TL.SQTrackExpanded="0" MZ.TrackTargeted="1">');

  let timelinePos = 0;
  clips.forEach((clip, idx) => {
    const n = idx + 1;
    L.push(`\t\t\t\t\t<clipitem id="clipitem-${n}">`);
    L.push("\t\t\t\t\t\t<masterclipid>masterclip-1</masterclipid>");
    L.push(`\t\t\t\t\t\t<name>${escapeXml(seqName)} ${n}</name>`);
    L.push("\t\t\t\t\t\t<enabled>TRUE</enabled>");
    L.push(`\t\t\t\t\t\t<duration>${durationFrames}</duration>`);
    L.push(rateBlock("\t\t\t\t\t"));
    L.push(`\t\t\t\t\t\t<start>${timelinePos}</start>`);
    L.push(`\t\t\t\t\t\t<end>${timelinePos + (clip.outF - clip.inF)}</end>`);
    L.push(`\t\t\t\t\t\t<in>${clip.inF}</in>`);
    L.push(`\t\t\t\t\t\t<out>${clip.outF}</out>`);
    L.push(`\t\t\t\t\t\t<pproTicksIn>${toTicks(clip.inF)}</pproTicksIn>`);
    L.push(`\t\t\t\t\t\t<pproTicksOut>${toTicks(clip.outF)}</pproTicksOut>`);
    L.push("\t\t\t\t\t\t<alphatype>none</alphatype>");
    L.push("\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>");
    L.push("\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>");
    if (idx === 0) {
      L.push('\t\t\t\t\t\t<file id="file-1">');
      L.push(`\t\t\t\t\t\t\t<name>${escapeXml(fileName)}</name>`);
      L.push(`\t\t\t\t\t\t\t<pathurl>file://localhost${escapeXml(opts.sourcePath)}</pathurl>`);
      L.push(rateBlock("\t\t\t\t\t\t"));
      L.push(`\t\t\t\t\t\t\t<duration>${durationFrames}</duration>`);
      L.push("\t\t\t\t\t\t\t<timecode>");
      L.push(rateBlock("\t\t\t\t\t\t\t"));
      L.push("\t\t\t\t\t\t\t\t<string>00:00:00:00</string>");
      L.push("\t\t\t\t\t\t\t\t<frame>0</frame>");
      L.push("\t\t\t\t\t\t\t\t<displayformat>NDF</displayformat>");
      L.push("\t\t\t\t\t\t\t</timecode>");
      L.push("\t\t\t\t\t\t\t<media>");
      L.push("\t\t\t\t\t\t\t\t<video>");
      L.push("\t\t\t\t\t\t\t\t\t<samplecharacteristics>");
      L.push(rateBlock("\t\t\t\t\t\t\t\t\t"));
      L.push(`\t\t\t\t\t\t\t\t\t\t<width>${seqWidth}</width>`);
      L.push(`\t\t\t\t\t\t\t\t\t\t<height>${seqHeight}</height>`);
      L.push("\t\t\t\t\t\t\t\t\t\t<anamorphic>FALSE</anamorphic>");
      L.push("\t\t\t\t\t\t\t\t\t\t<pixelaspectratio>square</pixelaspectratio>");
      L.push("\t\t\t\t\t\t\t\t\t\t<fielddominance>none</fielddominance>");
      L.push("\t\t\t\t\t\t\t\t\t</samplecharacteristics>");
      L.push("\t\t\t\t\t\t\t\t</video>");
      if (opts.hasAudio) {
        // Probe carries only the audio codec flag, not samplerate/depth:
        // standard 48kHz/16-bit/stereo assumed (follow-up: extend probe).
        L.push("\t\t\t\t\t\t\t\t<audio>");
        L.push("\t\t\t\t\t\t\t\t\t<samplecharacteristics>");
        L.push("\t\t\t\t\t\t\t\t\t\t<depth>16</depth>");
        L.push("\t\t\t\t\t\t\t\t\t\t<samplerate>48000</samplerate>");
        L.push("\t\t\t\t\t\t\t\t\t</samplecharacteristics>");
        L.push("\t\t\t\t\t\t\t\t\t<channelcount>2</channelcount>");
        L.push("\t\t\t\t\t\t\t\t</audio>");
      }
      L.push("\t\t\t\t\t\t\t</media>");
      L.push("\t\t\t\t\t\t</file>");
    } else {
      L.push('\t\t\t\t\t\t<file id="file-1" />');
    }
    for (const cm of clipMarkers) {
      L.push("\t\t\t\t\t\t<marker>");
      L.push(`\t\t\t\t\t\t\t<comment>${escapeXml(cm.comment)}</comment>`);
      L.push(`\t\t\t\t\t\t\t<name>${escapeXml(cm.name)}</name>`);
      L.push(`\t\t\t\t\t\t\t<in>${cm.inF}</in>`);
      L.push(`\t\t\t\t\t\t\t<out>${cm.outF}</out>`);
      // 0.10.27: цвет маркера (порядок полей как у Premiere: после out).
      if (cm.color !== null) L.push(`\t\t\t\t\t\t\t<pproColor>${cm.color}</pproColor>`);
      L.push("\t\t\t\t\t\t</marker>");
    }
    L.push("\t\t\t\t\t</clipitem>");
    timelinePos += clip.outF - clip.inF;
  });
  L.push("\t\t\t\t\t<enabled>TRUE</enabled>");
  L.push("\t\t\t\t\t<locked>FALSE</locked>");
  L.push("\t\t\t\t</track>");
  L.push("\t\t\t</video>");

  if (opts.hasAudio) {
    L.push("\t\t\t<audio>");
    L.push('\t\t\t\t<track TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="0">');
    let audioPos = 0;
    clips.forEach((clip, idx) => {
      const n = idx + 1;
      L.push(`\t\t\t\t\t<clipitem id="clipitem-a${n}">`);
      L.push("\t\t\t\t\t\t<masterclipid>masterclip-1</masterclipid>");
      L.push(`\t\t\t\t\t\t<name>${escapeXml(seqName)} ${n}</name>`);
      L.push("\t\t\t\t\t\t<enabled>TRUE</enabled>");
      L.push(`\t\t\t\t\t\t<duration>${durationFrames}</duration>`);
      L.push(rateBlock("\t\t\t\t\t"));
      L.push(`\t\t\t\t\t\t<start>${audioPos}</start>`);
      L.push(`\t\t\t\t\t\t<end>${audioPos + (clip.outF - clip.inF)}</end>`);
      L.push(`\t\t\t\t\t\t<in>${clip.inF}</in>`);
      L.push(`\t\t\t\t\t\t<out>${clip.outF}</out>`);
      L.push(`\t\t\t\t\t\t<pproTicksIn>${toTicks(clip.inF)}</pproTicksIn>`);
      L.push(`\t\t\t\t\t\t<pproTicksOut>${toTicks(clip.outF)}</pproTicksOut>`);
      L.push('\t\t\t\t\t\t<file id="file-1" />');
      L.push("\t\t\t\t\t</clipitem>");
      audioPos += clip.outF - clip.inF;
    });
    L.push("\t\t\t\t\t<enabled>TRUE</enabled>");
    L.push("\t\t\t\t\t<locked>FALSE</locked>");
    L.push("\t\t\t\t</track>");
    L.push("\t\t\t</audio>");
  }

  L.push("\t\t</media>");
  L.push("\t\t<timecode>");
  L.push(rateBlock("\t\t"));
  L.push("\t\t\t<string>00:00:00:00</string>");
  L.push("\t\t\t<frame>0</frame>");
  L.push("\t\t\t<displayformat>NDF</displayformat>");
  L.push("\t\t</timecode>");
  L.push("\t</sequence>");
  L.push("</xmeml>");
  return L.join("\n");
}
