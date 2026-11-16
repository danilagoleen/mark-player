// tb_1794800630_73214_1 (e): собственная пара in/out оператора ВНУТРИ зоны
// вопроса едет агенту в answers.json нейтральным диапазоном
// (origin = operator_range, без вердикта: смысл задаёт сам вопрос).
// Раньше in/out были «навигацией, не вердиктом» и агенту не доставлялись —
// поставив скобки «в фокусе / не в фокусе», оператор ничего не передавал.
import { describe, expect, it } from "vitest";
import {
  answersFromMarkers,
  mergeAnswerRecords,
  OPERATOR_RANGE_ORIGIN,
  type AnswerRecord,
  type ExtractableMarker,
} from "./questionPlaylist";
import { materializeQuestionEntry } from "./questionMaterialize";

const MEDIA = "asset://localhost/%2FVolumes%2Ftempwork%2Fgold%2FP1755075.mov";
const OTHER = "asset://localhost/%2FVolumes%2Ftempwork%2Fgold%2FP1755095.mov";
const ASKED_AT = "2026-11-16T02:00:00.000Z";
const LATER = "2026-11-16T03:00:00.000Z";

const zone = (media: string, qid: string, inSec: number, outSec: number): ExtractableMarker[] =>
  materializeQuestionEntry(
    { question_id: qid, question: "Что в фокусе?", in_sec: inSec, out_sec: outSec },
    { mediaPath: media, author: "agent:Commander", now: ASKED_AT },
  ) as unknown as ExtractableMarker[];

const own = (id: string, kind: "in" | "out", t: number, extra: Partial<ExtractableMarker> = {}): ExtractableMarker => ({
  marker_id: id,
  kind,
  anchor_sec: t,
  start_sec: t,
  end_sec: t,
  media_path: MEDIA,
  author: "Danila",
  created_at: LATER,
  ...extra,
});

const ranges = (records: AnswerRecord[]): AnswerRecord[] => records.filter((r) => r.origin === OPERATOR_RANGE_ORIGIN);

describe("(e) своя пара внутри зоны → answers.json", () => {
  it("зона на весь клип + своя пара 15–20: одна запись operator_range", () => {
    const markers = [...zone(MEDIA, "gold_P1755075", 0, 97), own("in_1", "in", 15), own("out_1", "out", 20)];
    const got = ranges(answersFromMarkers(markers));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      question_id: "gold_P1755075",
      verdict: "comment",
      origin: "operator_range",
      t_sec: 15,
      marker_start_sec: 15,
      marker_end_sec: 20,
      marker_id: "in_1",
      marker_out_id: "out_1",
      confirmed_by: "Danila",
    });
    expect(got[0].comment).toBeUndefined();
    expect(got[0].choice).toBeUndefined();
  });
  it("несколько своих пар внутри зоны — по записи на пару", () => {
    const markers = [
      ...zone(MEDIA, "q1", 0, 97),
      own("in_1", "in", 15), own("out_1", "out", 20),
      own("in_2", "in", 40), own("out_2", "out", 55),
    ];
    expect(ranges(answersFromMarkers(markers)).map((r) => [r.marker_start_sec, r.marker_end_sec])).toEqual([[15, 20], [40, 55]]);
  });
  it("пара вне зоны, одинокая скобка и пара без зоны на файле — не доставляются", () => {
    const outside = [...zone(MEDIA, "q1", 10, 40), own("in_1", "in", 50), own("out_1", "out", 60)];
    expect(ranges(answersFromMarkers(outside))).toHaveLength(0);
    const lonely = [...zone(MEDIA, "q1", 0, 97), own("in_1", "in", 15)];
    expect(ranges(answersFromMarkers(lonely))).toHaveLength(0);
    const noZone = [own("in_1", "in", 15), own("out_1", "out", 20)];
    expect(ranges(answersFromMarkers(noZone))).toHaveLength(0);
  });
  it("скобки на другом файле не приписываются вопросу этого файла", () => {
    const markers = [...zone(MEDIA, "q1", 0, 97), own("in_1", "in", 15, { media_path: OTHER }), own("out_1", "out", 20, { media_path: OTHER })];
    expect(ranges(answersFromMarkers(markers))).toHaveLength(0);
  });
  it("пара старше самого вопроса (прошлый прогон на файле) вопросу не приписывается", () => {
    const old = { created_at: "2026-10-01T00:00:00.000Z" };
    const markers = [...zone(MEDIA, "q1", 0, 97), own("in_1", "in", 15, old), own("out_1", "out", 20, old)];
    expect(ranges(answersFromMarkers(markers))).toHaveLength(0);
  });
  it("агентские скобки зоны сами диапазоном оператора не считаются", () => {
    expect(ranges(answersFromMarkers(zone(MEDIA, "q1", 0, 97)))).toHaveLength(0);
  });
  it("чужая зона (другой вопрос на том же файле) не ловит пару: пара принадлежит зоне, в которой начинается", () => {
    const markers = [
      ...zone(MEDIA, "qa", 0, 30),
      ...zone(MEDIA, "qb", 50, 90),
      own("in_1", "in", 55), own("out_1", "out", 60),
    ];
    const got = ranges(answersFromMarkers(markers));
    expect(got.map((r) => r.question_id)).toEqual(["qb"]);
  });
  it("зеркало: удалённая пара уходит из файла при пересборке, чужие записи остаются", () => {
    const first = answersFromMarkers([...zone(MEDIA, "q1", 0, 97), own("in_1", "in", 15), own("out_1", "out", 20)]);
    expect(ranges(first)).toHaveLength(1);
    const cardAnswer: AnswerRecord = { question_id: "q1", verdict: "favorite", answered_at: ASKED_AT };
    const afterDelete = answersFromMarkers([...zone(MEDIA, "q1", 0, 97)]);
    const merged = mergeAnswerRecords([...first, cardAnswer], afterDelete, { replaceOperatorMarkersIn: ["q1"] });
    expect(ranges(merged)).toHaveLength(0);
    expect(merged.some((r) => r.verdict === "favorite")).toBe(true);
  });
});
