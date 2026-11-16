import { describe, expect, it } from "vitest";
import { selectVisibleRows } from "../components/chat/CommentOverlay";
import { commentsPanelFilterQuery, summarizeHiddenByFilter } from "./markerFilterHint";

// tb_1794846994_51008_1 А: оператор жмёт N/F и тулбар в плейлисте агента, маркеры
// ложатся на шкалу, а окно, открытое иконкой 💬/M, стартует с фильтром comments и
// молча их прячет (видны только ответы карточки). Окно обязано называть скрытое.
const MARKERS = [
  { marker_id: "qmat_q1_in", kind: "in", start_sec: 0, text: "Отметьте…", author: "agent:Commander" },
  { marker_id: "qmat_q1_out", kind: "out", start_sec: 45, author: "agent:Commander" },
  { marker_id: "ans1", kind: "negative", start_sec: 1.4, text: "[answer] (negative)", reply_to: "qmat_q1_in" },
  { marker_id: "n1", kind: "negative", start_sec: 0.1 },
  { marker_id: "n2", kind: "negative", start_sec: 1.4 },
  { marker_id: "f1", kind: "favorite", start_sec: 3 },
  { marker_id: "c1", kind: "comment", start_sec: 5, text: "муть" },
];

describe("summarizeHiddenByFilter", () => {
  it("под фильтром comment скрыты ★/✗ без текста — окно их считает и называет по видам", () => {
    const visible = selectVisibleRows(MARKERS, "comment");
    const hidden = summarizeHiddenByFilter(MARKERS, visible);
    // qmat_q1_in остаётся видимым: он родитель ответа ans1 (нитка); скрыты n1, n2, f1, qmat_q1_out
    expect(hidden.total).toBe(4);
    expect(hidden.byKind).toEqual({ favorite: 1, negative: 2, out: 1 });
    expect(hidden.text).toBe("★ 1 · ✗ 2 · ] 1");
  });

  it("при фильтре all скрытого нет", () => {
    const visible = selectVisibleRows(MARKERS, "all");
    const hidden = summarizeHiddenByFilter(MARKERS, visible);
    expect(hidden.total).toBe(0);
    expect(hidden.text).toBe("");
  });

  it("скрытые скобки считаются глифами [ и ]", () => {
    const only = [
      { marker_id: "i", kind: "in", start_sec: 1 },
      { marker_id: "o", kind: "out", start_sec: 2 },
      { marker_id: "c", kind: "comment", start_sec: 3 },
    ];
    const hidden = summarizeHiddenByFilter(only, selectVisibleRows(only, "comment"));
    expect(hidden.byKind).toEqual({ in: 1, out: 1 });
    expect(hidden.text).toBe("[ 1 · ] 1");
  });
});

describe("commentsPanelFilterQuery", () => {
  it("без вопросов иконка 💬/M — по-прежнему «только комментарии» (слово оператора tb_1791690899_1275_3)", () => {
    expect(commentsPanelFilterQuery("comment", [{ marker_id: "m1" }])).toBe("&filter=comments");
    expect(commentsPanelFilterQuery("comment", [])).toBe("&filter=comments");
  });

  it("на файле лежат маркеры вопроса qmat_* — окно открывается со ВСЕМИ маркерами", () => {
    expect(commentsPanelFilterQuery("comment", [{ marker_id: "qmat_q1_in" }, { marker_id: "n1" }])).toBe("");
  });

  it("лого Марка (без фильтра) — без query как раньше", () => {
    expect(commentsPanelFilterQuery(undefined, [{ marker_id: "qmat_q1_in" }])).toBe("");
    expect(commentsPanelFilterQuery(undefined, [])).toBe("");
  });
});
