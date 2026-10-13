import { describe, expect, it } from "vitest";
import { resolveQuestionForPath } from "./questionSwitch";

const ENTRIES = [
  { path: "/v/a.mp4", question_id: "mrg-01", question: "Один?" },
  { path: "/v/b.mp4", question_id: "mrg-02", question: "Два?" },
  { path: "/v/b.mp4", question_id: "mrg-03", question: "Три?" },
  { path: "/v/c.mp4", name: "plain" },
];

describe("resolveQuestionForPath (tb_1791865804_84020_6)", () => {
  it("смена записи → вопрос текущей записи, а не первой", () => {
    expect(resolveQuestionForPath(ENTRIES, "/v/b.mp4")).toBe("mrg-02");
    expect(resolveQuestionForPath(ENTRIES, "/v/a.mp4")).toBe("mrg-01");
  });

  it("явный вопрос (клик панели) побеждает путь", () => {
    expect(resolveQuestionForPath(ENTRIES, "/v/b.mp4", "mrg-03")).toBe("mrg-03");
    expect(resolveQuestionForPath(ENTRIES, "/v/a.mp4", "mrg-03")).toBe("mrg-03");
  });

  it("путь без вопросов → null (карточку гасим)", () => {
    expect(resolveQuestionForPath(ENTRIES, "/v/c.mp4")).toBeNull();
    expect(resolveQuestionForPath(ENTRIES, "/v/nope.mp4")).toBeNull();
  });

  it("мусор на входе → null", () => {
    expect(resolveQuestionForPath(null, "/v/a.mp4")).toBeNull();
    expect(resolveQuestionForPath(ENTRIES, null)).toBeNull();
  });

  it("приёмка Commander: 3 записи → 3 разных question_id", () => {
    const qp = [
      { path: "/v/1.mp4", question_id: "q-a" },
      { path: "/v/2.mp4", question_id: "q-b" },
      { path: "/v/3.mp4", question_id: "q-c" },
    ];
    const got = ["/v/1.mp4", "/v/2.mp4", "/v/3.mp4"].map((p) => resolveQuestionForPath(qp, p));
    expect(got).toEqual(["q-a", "q-b", "q-c"]);
    expect(new Set(got).size).toBe(3);
  });
});
