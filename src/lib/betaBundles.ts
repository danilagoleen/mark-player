// tb_1791684645_1275_1 — импорт рабочих форматов Беты в вопрос-плейлист.
//
// camera_calibration.json: {layer, tool, questions: [{id, file, shot,
//   start, end, candidate: {type, direction, confidence, basis}, answer}]}
// scene_proposals.json: {tool, status, scenes: [{id, label, files[], status,
//   basis}]}. Оба — не {entries}, импорт их раньше отвергал.
// Выход — обычный vetka.cut.question_playlist/1: дальше работают штатные
// механизмы (маркеры при импорте, старт с in, answers.json рядом с исходником).
// Пути: в файлах Беты имена голые — резолв с fs-проверками делает
// importBetaBundleText ниже (динамический import fs, в вебе — тождественный
// fallback). Сюда привозят resolve(bare)->path. Чистая, тестируемая.

import { generateId, type Playlist, type QuestionPlaylistEntry } from "./playlist";
import { QUESTION_PLAYLIST_SCHEMA } from "./questionPlaylist";

/** Вопрос-плейлист, собранный из формата Беты. */
export interface BetaConvertedPlaylist extends Playlist {
  schema: string;
  entries: QuestionPlaylistEntry[];
}

/** Варианты ответа калибровки камеры (поле how исходника). */
export const CAMERA_MOVE_CHOICES = ["hold", "pan", "tilt", "truck", "dolly", "orbit", "zoom", "mixed"];

/** Варианты ответа триажа сцен. */
export const SCENE_TRIAGE_CHOICES = ["confirm", "split", "rename"];

export interface BetaCalibrationQuestion {
  id?: unknown;
  file?: unknown;
  shot?: unknown;
  start?: unknown;
  end?: unknown;
  candidate?: unknown;
}

export interface BetaCalibrationDoc {
  layer?: unknown;
  tool?: unknown;
  questions?: unknown;
}

export interface BetaScene {
  id?: unknown;
  label?: unknown;
  files?: unknown;
  basis?: unknown;
}

export interface BetaSceneProposalsDoc {
  tool?: unknown;
  scenes?: unknown;
}

function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}

function finiteOrUndefined(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function bareName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split(/[\\/]/).pop()?.trim() ?? "";
}

/** Сырой parsed JSON — калибровка камеры Беты? */
export function isBetaCalibration(doc: unknown): doc is BetaCalibrationDoc {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = doc as Record<string, unknown>;
  if (Array.isArray(d.entries)) return false;
  if (!Array.isArray(d.questions) || d.questions.length === 0) return false;
  const q0 = d.questions[0] as Record<string, unknown> | null;
  return !!q0 && typeof q0 === "object" && bareName(q0.file).length > 0;
}

/** Сырой parsed JSON — пачка сцен Беты? */
export function isBetaSceneProposals(doc: unknown): doc is BetaSceneProposalsDoc {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = doc as Record<string, unknown>;
  if (Array.isArray(d.entries)) return false;
  if (!Array.isArray(d.scenes) || d.scenes.length === 0) return false;
  const s0 = d.scenes[0] as Record<string, unknown> | null;
  return (
    !!s0 &&
    typeof s0 === "object" &&
    Array.isArray(s0.files) &&
    s0.files.some((f) => bareName(f).length > 0)
  );
}

/**
 * Прямые кандидаты пути без листинга: сам файл рядом с JSON и его proxy.mp4.
 * Дерево source/sd* панель добирает листингом (карты разные — угадать нельзя).
 */
export function betaDirectCandidates(baseDir: string, bare: string): string[] {
  const tail = bareName(bare);
  if (!tail) return [];
  if (!baseDir) return [tail];
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const root = baseDir.endsWith("/") || baseDir.endsWith("\\") ? baseDir.slice(0, -1) : baseDir;
  return [`${root}${sep}${tail}`, `${root}${sep}${tail}${sep}proxy.mp4`];
}

function stamp(): string {
  return new Date().toISOString();
}

/** Калибровка → вопрос-плейлист (25 планов). resolve: голое имя → играемый путь. */
export function calibrationToPlaylist(
  doc: BetaCalibrationDoc,
  resolve: (bare: string) => string,
): BetaConvertedPlaylist {
  const questions = (Array.isArray(doc.questions) ? doc.questions : []) as BetaCalibrationQuestion[];
  const layer = textOrUndefined(doc.layer) ?? "camera";
  const tool = textOrUndefined(doc.tool) ?? "beta";
  const entries: QuestionPlaylistEntry[] = [];
  for (const q of questions) {
    if (!q || typeof q !== "object") continue;
    const qid = textOrUndefined(q.id);
    const bare = bareName(q.file);
    if (!qid || !bare) continue;
    const shot = textOrUndefined(q.shot);
    const start = finiteOrUndefined(q.start);
    const end = finiteOrUndefined(q.end);
    const cand =
      q.candidate && typeof q.candidate === "object" ? (q.candidate as Record<string, unknown>) : null;
    const ctype = cand ? textOrUndefined(cand.type) : undefined;
    const cdir = cand ? textOrUndefined(cand.direction) : undefined;
    const cconf = cand ? finiteOrUndefined(cand.confidence) : undefined;
    const entry: QuestionPlaylistEntry = {
      path: resolve(bare),
      name: bare,
      duration: 0,
      addedAt: stamp(),
      question_id: qid,
      question: `${shot ?? bare}: тип движения?`,
      hypothesis:
        ctype || cdir
          ? `кандидат: ${[ctype, cdir].filter(Boolean).join(" ")}${cconf !== undefined ? ` (${cconf})` : ""} — направление ответь комментарием`
          : undefined,
      choices: [...CAMERA_MOVE_CHOICES],
      ref: { layer, id: shot ?? qid },
    };
    if (start !== undefined && start >= 0) entry.in_sec = start;
    if (end !== undefined && end > (start ?? -1)) entry.out_sec = end;
    entries.push(entry);
  }
  return {
    id: generateId(),
    name: `Beta calibration (${entries.length})`,
    entries,
    createdAt: stamp(),
    schema: QUESTION_PLAYLIST_SCHEMA,
    source: { by: tool, layer },
  };
}

/** Пачка сцен → вопрос-плейлист (представитель — первый файл, предсказуемо). */
export function proposalsToPlaylist(
  doc: BetaSceneProposalsDoc,
  resolve: (bare: string) => string,
): BetaConvertedPlaylist {
  const scenes = (Array.isArray(doc.scenes) ? doc.scenes : []) as BetaScene[];
  const tool = textOrUndefined(doc.tool) ?? "beta";
  const entries: QuestionPlaylistEntry[] = [];
  for (const s of scenes) {
    if (!s || typeof s !== "object") continue;
    const sid = textOrUndefined(s.id);
    const files = (Array.isArray(s.files) ? s.files : []).map(bareName).filter((f) => f.length > 0);
    if (!sid || files.length === 0) continue;
    const label = textOrUndefined(s.label) ?? sid;
    const basis = textOrUndefined(s.basis);
    const first = files[0];
    const last = files[files.length - 1];
    const span = first === last ? first : `${first}…${last}`;
    const entry: QuestionPlaylistEntry = {
      path: resolve(first),
      name: first,
      duration: 0,
      addedAt: stamp(),
      question_id: sid,
      question: `Сцена «${label}» — ${files.length} файлов (${span})? Подтвердить, разбить или переименовать?`,
      hypothesis: basis ? `${basis} · ${span} (${files.length})` : `${span} (${files.length})`,
      choices: [...SCENE_TRIAGE_CHOICES],
      ref: { layer: "scene", id: sid },
    };
    entries.push(entry);
  }
  return {
    id: generateId(),
    name: `Beta scenes (${entries.length})`,
    entries,
    createdAt: stamp(),
    schema: QUESTION_PLAYLIST_SCHEMA,
    source: { by: tool, layer: "scene" },
  };
}

// tb_1791685802_1275_3: единый вход импорта Beta-форматов — раньше жил
// локальной копией в PlaylistPanel, а меню File → Open Playlist его не знало
// (оператор: меню молча ничего не делает, панель — ест). sourcePath — откуда
// импортируем (Tauri-путь, fs-резолв), null в вебе (резолв тождественный).
// Возврат null = не Beta-формат (звать штатный deserializePlaylist).
export async function importBetaBundleText(
  text: string,
  sourcePath: string | null,
): Promise<BetaConvertedPlaylist | null> {
  let doc: unknown = null;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  const isCal = isBetaCalibration(doc);
  const isPro = !isCal && isBetaSceneProposals(doc);
  if (!isCal && !isPro) return null;
  const norm = (sourcePath ?? "").replace(/\\/g, "/");
  const baseDir = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
  const tailOf = (v: unknown): string => {
    const t = typeof v === "string" ? v.split(/[\\/]/).pop()?.trim() : "";
    return t ?? "";
  };
  const resolveOne = async (bare: string): Promise<string> => {
    const cands = betaDirectCandidates(baseDir, bare);
    if (sourcePath) {
      try {
        const fs = await import("@tauri-apps/plugin-fs");
        // tb_1791684645_1275_1: только файлы — <bare> часто директория
        // сайдкаров (exists бы её и взял, а играть нечего). Приоритет:
        // точный файл → proxy (быстрый триаж, без 4K-сталлов) → оригинал
        // в source → fallback (тост о недоступности скажет сам переход).
        const isFile = async (p: string): Promise<boolean> => {
          try {
            const st = await fs.stat(p);
            return !st.isDirectory;
          } catch {
            return false;
          }
        };
        for (const c of cands) {
          try {
            if (await isFile(c)) return c;
          } catch { /* next */ }
        }
        // дерево исходников рядом с index: ../source/sd*/*/<bare>
        try {
          const srcRoot = `${baseDir}/../source`;
          const sds = (await fs.readDir(srcRoot)) as unknown as Array<{ name: string; path?: string }>;
          for (const sd of sds) {
            const sdPath = sd.path ?? `${srcRoot}/${sd.name}`;
            let cards: Array<{ name: string; path?: string }> = [];
            try {
              cards = (await fs.readDir(sdPath)) as unknown as Array<{ name: string; path?: string }>;
            } catch {
              continue;
            }
            for (const card of cards) {
              const hit = `${card.path ?? `${sdPath}/${card.name}`}/${tailOf(bare)}`;
              try {
                if (await isFile(hit)) return hit;
              } catch { /* next */ }
            }
          }
        } catch { /* no source tree */ }
      } catch { /* fs unavailable */ }
    }
    return cands[0] ?? bare;
  };
  const bares = new Set<string>();
  if (isCal) {
    const qs = (doc as { questions?: unknown }).questions;
    if (Array.isArray(qs)) {
      for (const q of qs) {
        const t = tailOf((q as Record<string, unknown> | null)?.file);
        if (t) bares.add(t);
      }
    }
  } else {
    const ss = (doc as { scenes?: unknown }).scenes;
    if (Array.isArray(ss)) {
      for (const s of ss) {
        const files = (s as Record<string, unknown> | null)?.files;
        if (Array.isArray(files)) {
          for (const f of files) {
            const t = tailOf(f);
            if (t) bares.add(t);
          }
        }
      }
    }
  }
  const resolved = new Map<string, string>();
  await Promise.all(
    [...bares].map(async (b) => {
      resolved.set(b, await resolveOne(b));
    }),
  );
  const resolve = (bare: string): string => resolved.get(tailOf(bare)) ?? bare;
  if (isBetaCalibration(doc)) return calibrationToPlaylist(doc, resolve);
  if (isBetaSceneProposals(doc)) return proposalsToPlaylist(doc, resolve);
  return null;
}
