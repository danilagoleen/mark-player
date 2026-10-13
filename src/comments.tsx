import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommentOverlay } from "./components/chat/CommentOverlay";
import {
  confirmClearMarkers,
  countSparedQuestionReplies,
  createMarkerHistory,
  historyPush,
  historyRedo,
  historyUndo,
  selectMarkersToClear,
} from "./lib/markerHistory";
import { resolvePlayerHotkey } from "./lib/playerHotkeys";
import { markerBelongsToMedia, notifyMarkersReloaded, MEDIA_CHANGED_EVENT, MARKERS_CHANGED_EVENT, resolveEffectiveMedia, type MediaChangedPayload } from "./lib/markersSync";
import {
  buildReplyMarkerFull,
  resolveReplyAuthorForParent,
  type ReplyParent,
} from "./lib/markerReply";
import {
  applyAuthorPromptResult,
  loadCommentAuthorName,
  markCommentAuthorAsked,
  saveCommentAuthorName,
  wasCommentAuthorAsked,
} from "./lib/commentAuthor";
import "./index.css";

const MARKERS_STORAGE_KEY = "vetka_player_lab_markers_v1";

interface BareMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec?: number;
  // tb_1791690899_1275_3: якорь обязателен писателю (0.25.34 писал комменты
  // без anchor_sec — шкала клала их в 0:00 при верном ТК в окне).
  anchor_sec?: number;
  text?: string;
  media_path?: string;
  // tb_1791583578_64923_1: автор (опционален — легаси без него).
  // tb_1791654032_27281_1: статуса нет — задачи живут в таскборде.
  author?: string;
  // tb_1791585558_31907_1: ссылка ответа (группировка ↳ в оверлее).
  reply_to?: string;
  // 0.22: штамп содержимого — копия видео опознаётся и здесь.
  content_hash?: string | null;
  // tb_1791809796_24701_1: штамп ответа (выжимка answers: answered_at).
  created_at?: string;
}

// 0.10.16c: media-scope для СПИСКА, не только выбора — CommentOverlay
// получал всю кучу markers целиком и резал лишь по kind.
export function selectMediaFromSearch(search: string): string | null {
  try {
    return new URLSearchParams(search).get("media");
  } catch {
    return null;
  }
}

// Pure selector: scope to ?media= first (no media → null, never the global pile),
// then ?marker= wins when it points at a text-carrying marker of that media,
// else last text-carrying marker.
// [signal: media-scope режет чужие] [project: cut-player]
// 0.22: опциональный contentHash (?chash=) — та же identity, что у main:
// сначала хеш, затем путь.
export function selectHashFromSearch(search: string): string | null {
  try {
    return new URLSearchParams(search).get("chash");
  } catch {
    return null;
  }
}

// tb_1791146301_70644_18: список ВСЕХ видов своего media (для окна Comments) —
// без требования текста (в отличие от filterCommentMarkers). Сортировка по
// времени — в оверлее; здесь только scope.
export function filterAllMediaMarkers(
  markers: BareMarker[],
  media: string | null,
  contentHash: string | null = null,
): BareMarker[] {
  if (!media) return [];
  return markers.filter((m) => markerBelongsToMedia(m, { mediaKey: media, contentHash }));
}

// tb_1791146800_70644_20: окно правит ТЕКСТЫ, а не kind — виден любой маркер,
// несущий слова. comment — всегда (новые рождаются пустыми и дописываются
// здесь же); остальные виды — только с непустым текстом: fav/neg/in/out
// объясняют себя словами. Пустые не-комменты по-прежнему скрыты.
export function filterCommentMarkers(
  markers: BareMarker[],
  media: string | null,
  contentHash: string | null = null,
): BareMarker[] {
  if (!media) return [];
  return markers.filter(
    (m) =>
      markerBelongsToMedia(m, { mediaKey: media, contentHash }) &&
      (m.kind === "comment" || (m.text ?? "").trim() !== ""),
  );
}

export function selectCommentMarkerId(markers: BareMarker[], search: string): string | null {
  let queryId: string | null = null;
  try {
    queryId = new URLSearchParams(search).get("marker");
  } catch {
    queryId = null;
  }
  const comments = filterCommentMarkers(markers, selectMediaFromSearch(search), selectHashFromSearch(search));
  if (comments.length === 0) return null;
  if (queryId && comments.some((m) => m.marker_id === queryId)) return queryId;
  return comments[comments.length - 1].marker_id;
}

export interface NewCommentInput {
  media: string;
  contentHash: string | null;
  author: string;
  at: number;
  text: string;
}

// tb_1791690899_1275_3: чистый конструктор (тестируем; корень бага «маркер
// в 0:00» — писатель не клал anchor_sec, шкала рендерит по нему).
export function buildCommentMarker(input: NewCommentInput): BareMarker {
  const at = Number.isFinite(input.at) && input.at >= 0 ? input.at : 0;
  return {
    marker_id: `comment_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    kind: "comment",
    start_sec: at,
    end_sec: at,
    anchor_sec: at,
    text: input.text,
    media_path: input.media,
    author: input.author,
    content_hash: input.contentHash,
  };
}

// tb_1791690899_1275_3: ответ — в точке родителя (у родителя тоже мог не
// быть anchor_sec — добиваем из start_sec, иначе второй ноль на шкале).
// tb_1791809796_24701_1: канон — один конструктор в lib/markerReply (окно
// Markers playhead не знает: anchor родителя). Здесь тонкий совместимый
// фасад (тесты и оверлей зовут его).
export function buildReplyMarker(parent: BareMarker, text: string, author: string): BareMarker | null {
  if (!parent || typeof parent !== "object") return null;
  const full = buildReplyMarkerFull({
    parent: parent as ReplyParent,
    text,
    author,
    label: "",
    now: new Date().toISOString(),
  });
  if (!full) return null;
  return {
    marker_id: full.marker_id,
    kind: full.kind,
    start_sec: full.start_sec,
    end_sec: full.end_sec,
    anchor_sec: full.anchor_sec,
    text: full.text,
    media_path: full.media_path,
    author: full.author,
    reply_to: full.reply_to,
    content_hash: full.content_hash,
    created_at: full.created_at,
  };
}

function loadAllMarkers(): BareMarker[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKERS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistMarkers(next: BareMarker[]): void {
  try {
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // panel stays usable in-memory when storage is unavailable
  }
  // tb_1791654032_27281_1: главное окно само не узнает (storage между вебвью
  // Tauri не ходит) — будим событием, иначе его следующий персист тихо
  // вернёт удалённое (регрессия «пустой коммент не удаляется»).
  notifyMarkersReloaded();
}

// tb_1791690899_1275_3: окно, открытое иконкой комментариев / M, стартует
// с фильтром «только комментарии» (?filter=comments); лого Марка — без
// флага, фильтр all. Мусор в query — all, не падаем.
export function selectFilterFromSearch(search: string): "comment" | "all" {
  try {
    const raw = new URLSearchParams(search).get("filter");
    if (raw === "comments" || raw === "comment") return "comment";
  } catch {
    // ignore — all
  }
  return "all";
}

// tb_1791654032_27281_1: якорь нового коммента (?at= кладёт главное окно —
// позиция плейхеда на момент M; нет/мусор — 0).
export function selectAtFromSearch(search: string): number {
  try {
    const raw = new URLSearchParams(search).get("at");
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function CommentsStandalone() {
  const [markers, setMarkers] = useState<BareMarker[]>(loadAllMarkers);
  // 0.20: ref-зеркало + своя история (main-окно историю комментов не видит —
  // правки идут мимо него через LS). Мутации считают "до" из ref, а не из
  // setState-апдейтера: апдейтеры в StrictMode двоятся, ref — нет.
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const historyRef = useRef(createMarkerHistory<BareMarker>());
  // tb_1791654032_27281_1: подпись как в главном окне — запомненное имя,
  // дефолт пассивно тянем из Tauri (os_username), без полей в UI.
  const authorRef = useRef<string>(loadCommentAuthorName());
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    if (loadCommentAuthorName()) return;
    let alive = true;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("os_username"))
      .then((name) => {
        if (!alive) return;
        const clean = typeof name === "string" ? name.trim().slice(0, 64) : "";
        if (clean) authorRef.current = clean;
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Main window persists markers to the same key — refresh when it writes.
  useEffect(() => {
    const reload = () => setMarkers(loadAllMarkers());
    window.addEventListener("storage", reload);
    // tb_1791654032_27281_1: storage между вебвью Tauri не ходит — окно
    // подхватывает чужие правки по фокусу (открытие поверх = свежее).
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
    };
  }, []);

  // tb_1791663832_27409_5: главное окно переключило видео — окно
  // перецеливается событием (иначе залипает на прошлом). Заодно
  // перечитываем хранилище: правки main мимо фокуса не видны.
  const [mediaOverride, setMediaOverride] = useState<MediaChangedPayload | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let unlistenMedia: (() => void) | null = null;
    let unlistenChanged: (() => void) | null = null;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      listen<MediaChangedPayload>(MEDIA_CHANGED_EVENT, (event) => {
        const p = event.payload;
        if (!p || typeof p !== "object") return;
        setMediaOverride({
          mediaKey: typeof p.mediaKey === "string" ? p.mediaKey : null,
          contentHash: typeof p.contentHash === "string" ? p.contentHash : null,
        });
        setMarkers(loadAllMarkers());
      }).then((fn) => { unlistenMedia = fn; }).catch(() => {});
      // tb_1791809796_24701_1: импорт плейлиста дописал маркеры напрямую —
      // перечитать, иначе вопрос в пилюле есть, а здесь его нет вообще.
      listen(MARKERS_CHANGED_EVENT, () => {
        setMarkers(loadAllMarkers());
      }).then((fn) => { unlistenChanged = fn; }).catch(() => {});
    }).catch(() => {});
    return () => { unlistenMedia?.(); unlistenChanged?.(); };
  }, []);

  const search = typeof window !== "undefined" ? window.location.search : "";
  const effectiveIdentity = resolveEffectiveMedia(selectMediaFromSearch(search), selectHashFromSearch(search), mediaOverride);
  const media = effectiveIdentity.mediaKey;
  // 0.22: identity из ?chash= — копия видео видит свои комменты.
  const contentHash = effectiveIdentity.contentHash;
  // 0.12 слайс 1: fps для HH:MM:SS:FF из ?fps= (главное окно кладёт цепочку
  // probe→rVFC); нет/мусор — честные 25 внутри CommentOverlay.
  let fps = 25;
  try {
    const raw = new URLSearchParams(search).get("fps");
    const parsed = raw === null ? NaN : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) fps = parsed;
  } catch {
    fps = 25;
  }
  // 0.10.16c: список тоже scoped — иначе панель показывает чужие видео.
  // tb_1791146301_70644_18: список — ВСЕ виды (filterAllMediaMarkers),
  // выбор/правка текстов — по-прежнему только несущие слова.
  const allRows = filterAllMediaMarkers(markers, media, contentHash);
  const visibleMarkers = filterCommentMarkers(markers, media, contentHash);
  const selectedId = selectCommentMarkerId(markers, search);
  const selectedMarker =
    visibleMarkers.find((m) => m.marker_id === selectedId) ??
    [...allRows].sort((a, b) => Number(a.start_sec || 0) - Number(b.start_sec || 0))[0] ??
    null;

  const handleUpdateText = useCallback((markerId: string, text: string) => {
    const prev = markersRef.current;
    historyRef.current = historyPush(historyRef.current, prev);
    const updated = prev.map((m) => (m.marker_id === markerId ? { ...m, text } : m));
    persistMarkers(updated);
    setMarkers(updated);
  }, []);

  const handleDeleteMarker = useCallback((markerId: string) => {
    const prev = markersRef.current;
    historyRef.current = historyPush(historyRef.current, prev);
    const updated = prev.filter((m) => m.marker_id !== markerId);
    persistMarkers(updated);
    setMarkers(updated);
  }, []);

  // tb_1791654032_27281_1: автор пассивно, как у корневого: запомненное имя
  // (дефолт — имя macOS из ref), при первом создании один раз prompt.
  // tb_1791754893_1275_4: пустое/отмена — не сохраняем, asked не ставим
  // (переспросит; раньше Esc давал вечного безымянного автора).
  const ensureAuthor = useCallback((): string => {
    let author = loadCommentAuthorName() || authorRef.current;
    if (!wasCommentAuthorAsked()) {
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        const outcome = applyAuthorPromptResult(author, window.prompt("Sign comments as:", author));
        author = outcome.name;
        if (outcome.save) saveCommentAuthorName(author);
        if (outcome.markAsked) markCommentAuthorAsked();
      }
    }
    return author;
  }, []);

  // tb_1791654032_27281_1: новый коммент рождается ТОЛЬКО по Save (окно при
  // открытии пустых не создаёт). Якорь — ?at= (позиция M), привязка — ?media=.
  const handleCreate = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !media) return;
    const prev = markersRef.current;
    const created = buildCommentMarker({
      media,
      contentHash,
      author: ensureAuthor(),
      at: Math.max(0, selectAtFromSearch(search)),
      text: clean,
    });
    historyRef.current = historyPush(historyRef.current, prev);
    const updated = [...prev, created];
    persistMarkers(updated);
    setMarkers(updated);
  }, [media, contentHash, search, ensureAuthor]);

  // tb_1791586270_32802_2: ответ человека — новый коммент в той же точке,
  // reply_to = родитель. Автор — тот же пассивный ensureAuthor.
  // tb_1791809796_24701_1: fallback на автора родителя запрещён только для
  // qmat-родителей (там agent:Beta); обычные треды — как раньше. Ответ на
  // qmat — это ответ на вопрос: выжимка answers его подберёт.
  const handleReply = useCallback((parentId: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const prev = markersRef.current;
    const parent = prev.find((m) => m.marker_id === parentId);
    if (!parent) return;
    const reply = buildReplyMarker(parent, clean, resolveReplyAuthorForParent(ensureAuthor(), parent as ReplyParent));
    if (!reply) return;
    historyRef.current = historyPush(historyRef.current, prev);
    const updated = [...prev, reply];
    persistMarkers(updated);
    setMarkers(updated);
  }, [ensureAuthor]);

  const performUndo = useCallback(() => {
    const undone = historyUndo(historyRef.current, markersRef.current);
    if (!undone) return;
    historyRef.current = undone.history;
    persistMarkers(undone.snapshot);
    setMarkers(undone.snapshot);
  }, []);

  const performRedo = useCallback(() => {
    const redone = historyRedo(historyRef.current, markersRef.current);
    if (!redone) return;
    historyRef.current = redone.history;
    persistMarkers(redone.snapshot);
    setMarkers(redone.snapshot);
  }, []);

  // 0.20: ⌘Z / ⇧⌘Z в окне комментов. Typing-guard внутри resolvePlayerHotkey:
  // в textarea остаётся нативный undo текста.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolvePlayerHotkey(event);
      if (action !== "undo" && action !== "redo") return;
      event.preventDefault();
      if (action === "undo") performUndo();
      else performRedo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [performUndo, performRedo]);

  // 0.21: Clear all чистит ВСЕ виды маркеров текущего видео (фидбэк
  // оператора: кнопка врала названием — сносила только текст). Scope тот же,
  // что у списка: только своё media. Confirm с разбивкой по видам, сама
  // очистка — в undo-стек: ⌘Z возвращает.
  const handleClearAll = useCallback(async () => {
    const prev = markersRef.current;
    const victims = selectMarkersToClear(prev, media, "all", contentHash);
    if (!victims.length) return;
    const sparedReplies = countSparedQuestionReplies(prev, media, "all", contentHash);
    if (!(await confirmClearMarkers(victims, sparedReplies))) return;
    historyRef.current = historyPush(historyRef.current, prev);
    const victimIds = new Set(victims.map((m) => m.marker_id));
    const updated = prev.filter((m) => !victimIds.has(m.marker_id));
    persistMarkers(updated);
    setMarkers(updated);
  }, [media, contentHash]);

  return (
    <CommentOverlay
      marker={selectedMarker}
      markers={allRows}
      initialKindFilter={selectFilterFromSearch(search)}
      onClose={() => { if (typeof window !== "undefined") window.close(); }}
      onUpdateText={handleUpdateText}
      onDeleteMarker={handleDeleteMarker}
      onReply={handleReply}
      onCreate={media ? handleCreate : undefined}
      onClearAll={allRows.length > 0 ? () => { void handleClearAll(); } : undefined}
      fps={fps}
      standalone
    />
  );
}

const root = document.getElementById("root");
if (root) {
  // Окно не прозрачное: без этого под контентом просвечивает градиент index.css.
  // tb_1791654032_27281_1: тон — синеватый #121416, как Playlist (замер для архдоков).
  document.body.style.background = "rgb(18,20,22)";
  createRoot(root).render(
    <StrictMode>
      <CommentsStandalone />
    </StrictMode>,
  );
}
