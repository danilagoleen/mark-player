// tb_1793480340_10647_1: привязка ответа карточки к вопросу под плейхедом и
// скобки in/out в answers.json. Данные — живой прогон фото-капчи 261002
// (31.10, live1/live1b): один mp4 на 6 слайдов по 10 с, вопросы на части слайдов.
import { describe, expect, it } from "vitest";
import {
  WHOLE_FILE_MARKER_SUFFIX,
  answerGate,
  answersFromMarkers,
  findQuestionEntryAtTime,
  questionBracketOf,
} from "./questionPlaylist";
import { materializeQuestionEntry, type MaterializedMarker } from "./questionMaterialize";

const P = "/Volumes/tempwork/261002_mone/edit/calibration/captcha_21685_1_live1.mp4";
const entry = (question_id: string, in_sec?: number, out_sec?: number) => ({
  path: P,
  name: question_id,
  duration: 60,
  addedAt: "x",
  question_id,
  ...(in_sec !== undefined ? { in_sec } : {}),
  ...(out_sec !== undefined ? { out_sec } : {}),
});

// live1: порядок записей как отправил Beta (4/6, 1/6, 2/6); слайды 3, 5, 6 без вопросов.
const LIVE1 = [entry("q_d47b92c833", 30, 40), entry("q_fa6f9680fd", 0, 10), entry("q_97d0bd538e", 10, 20)];
// live1b: слайды 3, 5, 6; слайды 1, 2, 4 без вопросов.
const LIVE1B = [entry("q_fa83ce5fc3", 20, 30), entry("q_943d740a5b", 40, 50), entry("q_120dadeeef", 50, 60)];

const byId = (entries: ReturnType<typeof entry>[], id: string) => entries.find((e) => e.question_id === id)!;

describe("answerGate: ответ только внутри скобок вопроса карточки", () => {
  it("live1: ответы на своём слайде принимаются", () => {
    expect(answerGate(byId(LIVE1, "q_d47b92c833"), 37.9).ok).toBe(true);
    expect(answerGate(byId(LIVE1, "q_fa6f9680fd"), 5.49).ok).toBe(true);
    expect(answerGate(byId(LIVE1, "q_97d0bd538e"), 11.55).ok).toBe(true);
  });

  it("live1: q_97d0bd538e (10–20) не берёт ответы со слайдов 3, 5, 6 (t=26.7 / 41.8 / 52.2)", () => {
    const q = byId(LIVE1, "q_97d0bd538e");
    for (const t of [26.725, 41.789, 52.224]) {
      expect(answerGate(q, t)).toEqual({ ok: false, reason: "outside" });
    }
  });

  it("live1b: q_fa83ce5fc3 (20–30) принимает t=20 и t=30, но не t=0 / 10 / 50", () => {
    const q = byId(LIVE1B, "q_fa83ce5fc3");
    expect(answerGate(q, 20).ok).toBe(true);
    expect(answerGate(q, 30).ok).toBe(true); // пауза ровно на OUT — закрытый конец
    for (const t of [0, 10, 50]) expect(answerGate(q, t)).toEqual({ ok: false, reason: "outside" });
  });

  it("нет вопроса — нет ответа", () => {
    expect(answerGate(null, 5)).toEqual({ ok: false, reason: "no_question" });
  });

  it("запись без скобок (картинка, весь файл) принимает в любой точке и без позиции", () => {
    const whole = entry("cap-3");
    expect(answerGate(whole, 0).ok).toBe(true);
    expect(answerGate(whole, 999).ok).toBe(true);
    expect(answerGate(whole, undefined).ok).toBe(true);
    expect(answerGate(byId(LIVE1, "q_97d0bd538e"), NaN).ok).toBe(true);
  });

  it("одинокий IN — до конца файла, одинокий OUT — от начала", () => {
    expect(answerGate({ in_sec: 12 }, 11.9)).toEqual({ ok: false, reason: "outside" });
    expect(answerGate({ in_sec: 12 }, 500).ok).toBe(true);
    expect(answerGate({ out_sec: 8 }, 0).ok).toBe(true);
    expect(answerGate({ out_sec: 8 }, 8.5)).toEqual({ ok: false, reason: "outside" });
  });

  it("questionBracketOf: вырожденная пара out<=in — как одинокий IN", () => {
    expect(questionBracketOf({ in_sec: 5, out_sec: 5 })).toEqual({ in: 5, out: Number.POSITIVE_INFINITY });
    expect(questionBracketOf({})).toBeNull();
    expect(questionBracketOf(null)).toBeNull();
  });
});

describe("findQuestionEntryAtTime: какой вопрос под плейхедом", () => {
  it("live1b: t=50 — это начало q_120dadeeef, а не хвост q_fa83ce5fc3", () => {
    expect(findQuestionEntryAtTime(LIVE1B, P, 50, "q_fa83ce5fc3")?.question_id).toBe("q_120dadeeef");
    expect(findQuestionEntryAtTime(LIVE1B, P, 50)?.question_id).toBe("q_120dadeeef");
  });

  it("live1b: слайды без вопросов (t=0, 10, 35) — null, карточка не подменяется", () => {
    for (const t of [0, 10, 35]) expect(findQuestionEntryAtTime(LIVE1B, P, t, "q_fa83ce5fc3")).toBeNull();
  });

  it("общая граница 10: без текущего — окно, которое начинается; текущий держится на своей границе", () => {
    expect(findQuestionEntryAtTime(LIVE1, P, 10)?.question_id).toBe("q_97d0bd538e");
    expect(findQuestionEntryAtTime(LIVE1, P, 10, "q_fa6f9680fd")?.question_id).toBe("q_fa6f9680fd");
    expect(findQuestionEntryAtTime(LIVE1, P, 10.01, "q_fa6f9680fd")?.question_id).toBe("q_97d0bd538e");
  });

  it("порядок записей в файле не решает: 30–40 стоит первой, но t=5 — это 0–10", () => {
    expect(findQuestionEntryAtTime(LIVE1, P, 5)?.question_id).toBe("q_fa6f9680fd");
  });

  it("закрытый конец последнего окна (пауза на OUT) всё ещё внутри", () => {
    expect(findQuestionEntryAtTime(LIVE1, P, 40)?.question_id).toBe("q_d47b92c833");
    expect(findQuestionEntryAtTime(LIVE1, P, 20)?.question_id).toBe("q_97d0bd538e");
  });
});

describe("answersFromMarkers: in_sec / out_sec = скобки вопроса, а не точка in дважды", () => {
  const mk = (over: { marker_id: string; start_sec: number; end_sec: number; anchor_sec: number; kind: string }) => ({
    author: "agent:Beta",
    question_id: "q_97d0bd538e",
    ...over,
  });
  const inM = mk({ marker_id: "qmat_q_97d0bd538e_in", kind: "in", start_sec: 10, end_sec: 10, anchor_sec: 10 });
  const outM = mk({ marker_id: "qmat_q_97d0bd538e_out", kind: "out", start_sec: 20, end_sec: 20, anchor_sec: 20 });
  const reply = (over: Record<string, unknown> = {}) => ({
    marker_id: "reply_1",
    kind: "negative",
    start_sec: 10,
    end_sec: 10,
    anchor_sec: 11.55,
    text: "[answer] reject (negative)",
    author: "danilagulin",
    reply_to: "qmat_q_97d0bd538e_in",
    created_at: "2026-10-31T20:52:23.495Z",
    ...over,
  });

  it("live1 q_97d0bd538e: in 10, out 20 (было 10/10), t_sec — где стоял плейхед", () => {
    const [r] = answersFromMarkers([inM, outM, reply()]);
    expect(r.question_id).toBe("q_97d0bd538e");
    expect(r.in_sec).toBe(10);
    expect(r.out_sec).toBe(20);
    expect(r.t_sec).toBe(11.55);
  });

  it("человек сдвинул OUT — в ответе текущая позиция", () => {
    const moved = { ...outM, start_sec: 25, end_sec: 25, anchor_sec: 25 };
    expect(answersFromMarkers([inM, moved, reply()])[0].out_sec).toBe(25);
  });

  it("нет маркера OUT (одинокий IN) — out_sec не выдумываем и не равен in", () => {
    const [r] = answersFromMarkers([inM, reply()]);
    expect(r.in_sec).toBe(10);
    expect(r.out_sec).toBeUndefined();
  });

  it("OUT <= IN (сломанная пара) — не пишем", () => {
    const broken = { ...outM, start_sec: 10, end_sec: 10, anchor_sec: 10 };
    expect(answersFromMarkers([inM, broken, reply()])[0].out_sec).toBeUndefined();
  });

  it("вопрос на весь файл (_whole): ответ без in/out", () => {
    const whole = {
      marker_id: `qmat_cap-3_${WHOLE_FILE_MARKER_SUFFIX}`,
      kind: "comment",
      start_sec: 0,
      end_sec: 0,
      anchor_sec: 0,
      question_id: "cap-3",
      author: "agent:Beta",
      text: "Один ли человек?",
    };
    const [r] = answersFromMarkers([
      whole,
      { ...reply({ reply_to: whole.marker_id, anchor_sec: 0, text: "[answer] confirm (favorite)" }) },
    ]);
    expect(r.question_id).toBe("cap-3");
    expect(r.verdict).toBe("favorite");
    expect(r.in_sec).toBeUndefined();
    expect(r.out_sec).toBeUndefined();
  });

  it("сквозь материализацию: маркеры записи 10–20 → ответ несёт in 10 / out 20", () => {
    const CTX = { mediaPath: "asset://x.mp4", author: "agent:Beta", now: "2026-10-31T17:07:50Z" };
    const markers: MaterializedMarker[] = materializeQuestionEntry(
      { question_id: "q_97d0bd538e", question: "Один ли человек?", in_sec: 10, out_sec: 20 },
      CTX,
    );
    const [r] = answersFromMarkers([...markers, reply()]);
    expect(r.in_sec).toBe(10);
    expect(r.out_sec).toBe(20);
  });
});
