// tb_1794800630_73214_1 + tb_1794865760_47995_3: два инструмента в одном списке
// маркеров. «Черта» — qmat_<вопрос>_in/_out агента: подчёркивает, о каком участке
// опрос; оператор её не двигает. «Скобки» — in/out монтажа (ставит человек, позже
// и агент): инструмент выбора видео в монтаж, их можно двигать. Данные —
// воспроизведение оператора 16.11 на gold_keys_v1 (скрипт bracket_conflict.mts):
// спариваются, проверяются и играют раздельно.
import { describe, expect, it } from "vitest";
import {
  isMarkerDraggable,
  isQuestionLineMarker,
  bracketMarks,
  scissorsSegments,
  wouldNestInBracketPair,
  lineGroupKey,
  type LayerMark,
} from "./bracketLayers";
import { pairInOutRanges } from "./selectionDuration";

const inn = (id: string, t: number): LayerMark => ({ marker_id: id, kind: "in", anchor_sec: t });
const out = (id: string, t: number): LayerMark => ({ marker_id: id, kind: "out", anchor_sec: t });

describe("роль маркера: черта или скобка", () => {
  it("черта вопроса: qmat_<вопрос>_in/_out, вид совпадает с суффиксом", () => {
    expect(isQuestionLineMarker(inn("qmat_gold_P1_in", 0))).toBe(true);
    expect(isQuestionLineMarker(out("qmat_gold_P1_out", 9))).toBe(true);
  });
  it("скобка монтажа, комментарий агента и обычный маркер — не черта", () => {
    expect(isQuestionLineMarker(inn("marker_abc", 3))).toBe(false);
    expect(isQuestionLineMarker({ marker_id: "qmat_gold_P1_c0", kind: "comment" })).toBe(false);
    expect(isQuestionLineMarker({ marker_id: "qmat_gold_P1_whole", kind: "comment" })).toBe(false);
    // id говорит in, а вид другой — это не конец черты
    expect(isQuestionLineMarker({ marker_id: "qmat_x_in", kind: "comment" })).toBe(false);
  });
  it("ключ группы черты — префикс вопроса без in/out", () => {
    expect(lineGroupKey("qmat_gold_P1_in")).toBe("qmat_gold_P1_");
    expect(lineGroupKey("qmat_gold_P1_out")).toBe("qmat_gold_P1_");
  });
  it("(f) черту двигать нельзя, скобки монтажа и маркеры — можно", () => {
    expect(isMarkerDraggable(inn("qmat_gold_P1_in", 0))).toBe(false);
    expect(isMarkerDraggable(out("qmat_gold_P1_out", 9))).toBe(false);
    expect(isMarkerDraggable(inn("marker_abc", 3))).toBe(true);
    expect(isMarkerDraggable({ marker_id: "qmat_gold_P1_c0", kind: "comment" })).toBe(true);
    expect(isMarkerDraggable({ marker_id: "comment_1", kind: "favorite" })).toBe(true);
  });
  it("скобки монтажа: без черт, без остальных видов маркеров", () => {
    const marks: LayerMark[] = [
      inn("qmat_a_in", 10), out("qmat_a_out", 40),
      inn("br_in", 15), out("br_out", 20),
      { marker_id: "c1", kind: "comment", anchor_sec: 5 },
    ];
    expect(bracketMarks(marks).map((m) => m.marker_id)).toEqual(["br_in", "br_out"]);
  });
});

describe("(a) гард вложенности — только против пар скобок", () => {
  const lineWholeClip = [inn("qmat_gold_P1_in", 0), out("qmat_gold_P1_out", 97)];
  it("черта на весь клип не запрещает скобку внутри", () => {
    expect(wouldNestInBracketPair(lineWholeClip, 15)).toBe(false);
    expect(wouldNestInBracketPair(lineWholeClip, 96)).toBe(false);
  });
  it("закрытая пара скобок запрещает вложение внутрь неё, снаружи (но внутри черты) можно", () => {
    const marks = [...lineWholeClip, inn("br_in", 15), out("br_out", 20)];
    expect(wouldNestInBracketPair(marks, 18)).toBe(true);
    expect(wouldNestInBracketPair(marks, 30)).toBe(false);
    expect(wouldNestInBracketPair(marks, 15)).toBe(false); // на самой скобке — не строго внутри
  });
});

describe("(b) пары не склеиваются: сценарии исследования 16.11", () => {
  it("черта 10–40 и скобки 5…50: две раздельные пары, черта не вложена в скобки", () => {
    const { pairs } = pairInOutRanges([inn("qmat_q1_in", 10), out("qmat_q1_out", 40), inn("op_in", 5), out("op_out", 50)]);
    const brackets = pairs.filter((p) => p.layer === "bracket").map((p) => [p.start, p.end]);
    const lines = pairs.filter((p) => p.layer === "line").map((p) => [p.start, p.end]);
    expect(brackets).toEqual([[5, 50]]);
    expect(lines).toEqual([[10, 40]]);
  });
  it("скобка IN ровно на OUT черты и OUT 60: черта [10–40] и пара скобок [40–60], не [10–60]", () => {
    const { pairs } = pairInOutRanges([inn("qmat_q1_in", 10), out("qmat_q1_out", 40), inn("op_in", 40), out("op_out", 60)]);
    expect(pairs.filter((p) => p.layer === "line").map((p) => [p.start, p.end])).toEqual([[10, 40]]);
    expect(pairs.filter((p) => p.layer === "bracket").map((p) => [p.start, p.end])).toEqual([[40, 60]]);
  });
  it("две черты разных вопросов на одном файле: [10–40] и [30–60], не [10–60] + [30–40]", () => {
    const { pairs } = pairInOutRanges([
      inn("qmat_A_in", 10), out("qmat_A_out", 40), inn("qmat_B_in", 30), out("qmat_B_out", 60),
    ]);
    expect(pairs.map((p) => [p.start, p.end, p.layer])).toEqual([[10, 40, "line"], [30, 60, "line"]]);
  });
  it("дубль OUT после сдвига: черта [10–40], одинокий OUT 90 не играет от нуля", () => {
    const marks = [inn("qmat_q1_in", 10), out("qmat_q1_out", 90), out("qmat_q1_out", 40)];
    const { pairs } = pairInOutRanges(marks);
    expect(pairs.map((p) => [p.start, p.end, p.layer])).toEqual([[10, 40, "line"]]);
    // ножницы без активного вопроса черту вовсе не берут: сегментов нет, «скачка» с нуля нет
    expect(scissorsSegments(marks, null, 100)).toEqual([]);
  });
  it("сиблинги одного вопроса (два окна на одном файле): обе черты", () => {
    const { pairs } = pairInOutRanges([
      inn("qmat_trk-10_in", 10), out("qmat_trk-10_out", 20), inn("qmat_trk-10_in", 30), out("qmat_trk-10_out", 40),
    ]);
    expect(pairs.map((p) => [p.start, p.end])).toEqual([[10, 20], [30, 40]]);
  });
  it("вложенность скобок по-прежнему LIFO: in,in,out → пара (in2,out)", () => {
    const { pairs } = pairInOutRanges([inn("a", 1), inn("b", 2), out("c", 3)]);
    expect(pairs.map((p) => [p.start, p.end, p.layer])).toEqual([[2, 3, "bracket"]]);
  });
});

describe("(g) черты чужого плейлиста не участвуют", () => {
  const marks = [
    inn("qmat_A_in", 10), out("qmat_A_out", 40),
    inn("qmat_OLD_in", 13.75), out("qmat_OLD_out", 16.25),
    inn("br_in", 50), out("br_out", 60),
  ];
  it("без списка загруженных вопросов — все черты как есть", () => {
    expect(pairInOutRanges(marks).pairs.filter((p) => p.layer === "line")).toHaveLength(2);
  });
  it("со списком — чужая черта выпадает, своя и скобки остаются", () => {
    const { pairs, spanById } = pairInOutRanges(marks, { knownLinePrefixes: new Set(["qmat_A_"]) });
    expect(pairs.filter((p) => p.layer === "line").map((p) => [p.start, p.end])).toEqual([[10, 40]]);
    expect(pairs.filter((p) => p.layer === "bracket").map((p) => [p.start, p.end])).toEqual([[50, 60]]);
    expect(spanById.has("qmat_OLD_in")).toBe(false);
  });
});

// Слово оператора 17.11: пока у файла есть черта активного вопроса, ножницы
// играют ТОЛЬКО её (агент спрашивает про конкретный участок — оператору не
// нужно смотреть монтаж по своим скобкам, свои скобки там — ответ агенту).
// Нет черты — скобки работают как обычно. Решение 16.11 «скобки главнее»
// (tb_1794857689_47995_1) отменено.
describe("ножницы: черта активного вопроса первой, скобки — когда черты нет", () => {
  const marks = [
    inn("qmat_q1_in", 10), out("qmat_q1_out", 40),
    inn("op_in", 55), out("op_out", 60),
    inn("qmat_q2_in", 70), out("qmat_q2_out", 90),
  ];
  const lineOnly = [inn("qmat_q1_in", 10), out("qmat_q1_out", 40), inn("qmat_q2_in", 70), out("qmat_q2_out", 90)];
  it("без вопроса — только скобки (черты не играют)", () => {
    expect(scissorsSegments(marks, null, 100)).toEqual([{ start: 55, end: 60 }]);
  });
  it("с активным вопросом и скобками — играет черта, скобки в ножницах не играют", () => {
    expect(scissorsSegments(marks, { in_sec: 10, out_sec: 40 }, 100)).toEqual([{ start: 10, end: 40 }]);
  });
  it("скобки внутри черты активного вопроса — играет вся черта, а не скобки", () => {
    const inside = [inn("qmat_q1_in", 0), out("qmat_q1_out", 97), inn("op_in", 15), out("op_out", 20)];
    expect(scissorsSegments(inside, { in_sec: 0, out_sec: 97 }, 100)).toEqual([{ start: 0, end: 97 }]);
  });
  it("с активным вопросом и без скобок — играет его черта, чужие черты не мешают", () => {
    expect(scissorsSegments(lineOnly, { in_sec: 10, out_sec: 40 }, 100)).toEqual([{ start: 10, end: 40 }]);
  });
  it("активный вопрос без черты (весь файл) и скобок нет — сегментов нет", () => {
    expect(scissorsSegments(lineOnly, { question_id: "x" } as never, 100)).toEqual([]);
  });
  it("активный вопрос без черты (весь файл) — играют скобки", () => {
    expect(scissorsSegments(marks, { question_id: "x" } as never, 100)).toEqual([{ start: 55, end: 60 }]);
  });
  it("одинокий IN черты активного вопроса — до конца файла, скобки не мешают", () => {
    expect(scissorsSegments(lineOnly, { in_sec: 70 }, 100)).toEqual([{ start: 70, end: 100 }]);
    expect(scissorsSegments(marks, { in_sec: 70 }, 100)).toEqual([{ start: 70, end: 100 }]);
  });
  it("черта не длиннее нуля (out ≤ in) — как одинокий IN: до конца файла", () => {
    expect(scissorsSegments(lineOnly, { in_sec: 70, out_sec: 70 }, 100)).toEqual([{ start: 70, end: 100 }]);
  });
  it("OUT черты за концом файла обрезается по длительности", () => {
    expect(scissorsSegments(lineOnly, { in_sec: 70, out_sec: 130 }, 100)).toEqual([{ start: 70, end: 100 }]);
  });
});
