// tb_1793567711_43420_2: 0.26.7 теряла свежие qmat-маркеры при открытии плейлиста.
// Живой повод (оператор 02.11, плейлист beta-focus-check-f1): ack говорил
// materialized=35, а в localStorage маркеров qmat_focus_* ноль — карточка
// гасила кнопки ответа плашкой «No question markers».
// Механизм: appendMarkers клал маркеры в состояние (запись в LS — эффектом ПОСЛЕ
// рендера) и тут же слал markers:changed; главное окно получало СВОЁ эхо и
// делало setMarkers(readStoredMarkers()) — читало ещё не обновлённый LS.
import { describe, expect, it } from "vitest";
import appSrc from "../App.tsx?raw";
import { appendMarkersPersisted } from "./markersPersist";
import { healKey, shouldHealQuestionMarkers } from "./questionHeal";

interface M {
  marker_id: string;
  media_path: string;
}

const KEY = "vetka_player_lab_markers_v1";

function marker(id: string): M {
  return { marker_id: id, media_path: `asset://localhost/${id}.png` };
}

function fakeStorage(initial: M[] = []) {
  const map = new Map<string, string>();
  map.set(KEY, JSON.stringify(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    read: (): M[] => JSON.parse(map.get(KEY) ?? "[]"),
  };
}

describe("appendMarkersPersisted: маркеры лежат в LS до того, как кто-то эмитит событие", () => {
  it("пишет слитый массив в хранилище синхронно и возвращает его же", () => {
    const old = [marker("old_a"), marker("old_b")];
    const fresh = [marker("qmat_focus_1_whole"), marker("qmat_focus_2_whole")];
    const storage = fakeStorage(old);
    const merged = appendMarkersPersisted(old, fresh, storage, KEY);
    expect(merged.map((m) => m.marker_id)).toEqual(["old_a", "old_b", "qmat_focus_1_whole", "qmat_focus_2_whole"]);
    expect(storage.read()).toEqual(merged);
  });

  it("пустой fresh — ничего не пишет и отдаёт те же маркеры", () => {
    const old = [marker("old_a")];
    const storage = fakeStorage(old);
    let writes = 0;
    const counting = { setItem: (k: string, v: string) => { writes += 1; storage.setItem(k, v); } };
    const merged = appendMarkersPersisted(old, [], counting, KEY);
    expect(merged).toBe(old);
    expect(writes).toBe(0);
  });

  it("квота/запрет хранилища не роняют открытие плейлиста: маркеры всё равно вернутся", () => {
    const boom = { setItem: () => { throw new Error("QuotaExceededError"); } };
    const merged = appendMarkersPersisted([marker("a")], [marker("b")], boom, KEY);
    expect(merged.map((m) => m.marker_id)).toEqual(["a", "b"]);
  });

  it("нет хранилища (null) — тоже не падаем", () => {
    const merged = appendMarkersPersisted([marker("a")], [marker("b")], null, KEY);
    expect(merged.map((m) => m.marker_id)).toEqual(["a", "b"]);
  });
});

describe("модель гонки: собственное эхо markers:changed не затирает свежие маркеры", () => {
  // Окно плеера: state — то, что рисует карточка; эхо = setMarkers(readStoredMarkers()).
  function openPlaylistWindow(persistFirst: boolean) {
    const old = [marker("old_a"), marker("old_b")];
    const storage = fakeStorage(old);
    let state: M[] = old;
    const fresh = Array.from({ length: 35 }, (_, i) => marker(`qmat_focus_${i}_whole`));

    const echo = () => {
      state = storage.read(); // listen(MARKERS_CHANGED_EVENT, () => setMarkers(readStoredMarkers()))
    };
    const effectPersist = () => {
      storage.setItem(KEY, JSON.stringify(state)); // useEffect([markers]) — после рендера
    };

    if (persistFirst) {
      state = appendMarkersPersisted(state, fresh, storage, KEY);
    } else {
      state = [...state, ...fresh]; // как было: setMarkers(prev => [...prev, fresh])
    }
    // notifyChanged(): событие вернулось в это же окно раньше эффекта (тяжёлый рендер)
    echo();
    effectPersist();
    return { state, storage };
  }

  it("как было (запись эффектом) — 35 вопросов теряются: это и есть баг 0.26.7", () => {
    const { state } = openPlaylistWindow(false);
    expect(state.filter((m) => m.marker_id.startsWith("qmat_focus_"))).toHaveLength(0);
  });

  it("с appendMarkersPersisted эхо видит новые маркеры, ни один вопрос не теряется", () => {
    const { state, storage } = openPlaylistWindow(true);
    expect(state.filter((m) => m.marker_id.startsWith("qmat_focus_"))).toHaveLength(35);
    expect(storage.read().filter((m) => m.marker_id.startsWith("qmat_focus_"))).toHaveLength(35);
    expect(state.filter((m) => m.marker_id.startsWith("old_"))).toHaveLength(2);
  });
});

describe("shouldHealQuestionMarkers: самоисцеление вместо «Reimport the playlist»", () => {
  const base = { qid: "focus_f7ae588ead", hasMarkers: false, isQuestionPlaylist: true, inPlaylist: true, attempted: new Set<string>(), mediaKey: "asset://localhost/x.png" };

  it("карточка активна, вопрос в плейлисте, маркеров нет, ещё не пробовали → лечить", () => {
    expect(shouldHealQuestionMarkers(base)).toBe(true);
  });

  it("маркеры есть → не трогаем", () => {
    expect(shouldHealQuestionMarkers({ ...base, hasMarkers: true })).toBe(false);
  });

  it("один раз за вопрос и медиа: повторная попытка не зацикливает лечение", () => {
    const attempted = new Set<string>([healKey("focus_f7ae588ead", "asset://localhost/x.png")]);
    expect(shouldHealQuestionMarkers({ ...base, attempted })).toBe(false);
    // другое медиа — отдельная попытка
    expect(shouldHealQuestionMarkers({ ...base, attempted, mediaKey: "asset://localhost/y.png" })).toBe(true);
  });

  it.each([
    ["нет question_id", { qid: "" }],
    ["qid null", { qid: null }],
    ["плейлист не вопросный", { isQuestionPlaylist: false }],
    ["вопроса нет в загруженном плейлисте", { inPlaylist: false }],
  ])("%s → не лечим", (_name, patch) => {
    expect(shouldHealQuestionMarkers({ ...base, ...patch })).toBe(false);
  });
});

describe("проводка в App.tsx", () => {
  it("меню/очередь агента кладёт материализованные маркеры через appendMarkersPersisted", () => {
    const open = appSrc.slice(appSrc.indexOf("async function openPlaylistPath("), appSrc.indexOf("async function executeAgentVerb("));
    expect(open).toContain("questionMaterializeIO(");
    expect(open).not.toContain("setMarkers((prev) => [...prev, ...(fresh as unknown as PlayerTimeMarker[])])");
    const io = appSrc.slice(appSrc.indexOf("function questionMaterializeIO("), appSrc.indexOf("function questionHasMarkers("));
    expect(io).toContain("appendMarkersPersisted(");
    // запись в LS идёт раньше эмита: notifyChanged зовёт материализация уже после appendMarkers
    expect(io.indexOf("appendMarkers:")).toBeLessThan(io.indexOf("notifyChanged:"));
  });

  it("карточка сама материализует недостающие маркеры (shouldHealQuestionMarkers)", () => {
    expect(appSrc).toContain("shouldHealQuestionMarkers(");
    expect(appSrc).toContain("materializePlaylistQuestions(");
  });
});
