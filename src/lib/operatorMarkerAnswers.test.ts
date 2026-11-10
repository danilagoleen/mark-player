// tb_1794347727_83767_1 (родитель tb_1794347625_83718_2): «Send to agent» терял
// маркеры, которые оператор ставит САМ внутри in/out записи: в answers.json
// шли только ответы на маркеры агента, свои comment/negative жили лишь в
// <видео>.sos.json. Данные — живой прогон reelsD-201336 (11.11, плеер 0.26.9):
// model4 (m4_D, 0–49.72) и igor (ig_D, 0–55).
import { describe, expect, it } from "vitest";
import {
  answersFromMarkers,
  buildAnswersDocument,
  mergeAnswerRecords,
  questionScopeFromMarkers,
  type AnswerRecord,
  type ExtractableMarker,
} from "./questionPlaylist";
import { materializeQuestionEntry } from "./questionMaterialize";

const M4 = "asset://localhost/%2FVolumes%2Ftempwork%2F261002_mone%2Frender%2Fcolor_D_reels_v1%2Fmodel4%2Fmodel4_color_D_v1.mov";
const IG = "asset://localhost/%2FVolumes%2Ftempwork%2F261002_mone%2Frender%2Fcolor_D_reels_v1%2Figor%2Figor_color_D_v1.mov";
const ASKED_AT = "2026-11-10T20:13:38.694Z";

const agentMarkers = (mediaPath: string, entry: Parameters<typeof materializeQuestionEntry>[0]): ExtractableMarker[] =>
  materializeQuestionEntry(entry, { mediaPath, author: "agent:Commander", now: ASKED_AT }) as unknown as ExtractableMarker[];

const M4_QUESTION = agentMarkers(M4, {
  question_id: "m4_D",
  question: "Модель 4 D без титров: можно отдавать?",
  in_sec: 0,
  out_sec: 49.72,
  markers: [
    { kind: "comment", t_sec: 2.6, text: "«до» крупно" },
    { kind: "comment", t_sec: 38.1, text: "«после»" },
  ],
});
const IG_QUESTION = agentMarkers(IG, {
  question_id: "ig_D",
  question: "Рилс Игоря D без титров: можно отдавать?",
  in_sec: 0,
  out_sec: 55,
});

// Собственные маркеры оператора — как лежат в localStorage плеера: reply_to и
// question_id пустые, у comment-маркеров created_at = null.
const op = (over: Partial<ExtractableMarker> & { marker_id: string; kind: string; media_path: string }): ExtractableMarker =>
  ({
    author: "danilagulin",
    reply_to: null,
    question_id: null,
    created_at: null,
    text: "",
    ...over,
  }) as ExtractableMarker;

const M4_SKIN = op({
  marker_id: "comment_mwb7lg38_8sqn",
  kind: "comment",
  media_path: M4,
  anchor_sec: 29.3508387,
  start_sec: 29.3508387,
  end_sec: 29.3508387,
  text: "кожа ухожит в небольшой пересвет",
});
const M4_AUDIO = op({
  marker_id: "comment_mwb82a7a_5xqh",
  kind: "comment",
  media_path: M4,
  anchor_sec: 3.877357415596778,
  start_sec: 3.877357415596778,
  end_sec: 3.877357415596778,
  text: "Тихая музыка, сделал новый мастеринг /Volumes/tempwork/261002_mone/audio/id_model4_d-cut05_uni1.wav",
});
const IG_NEGATIVE = op({
  marker_id: "marker_mwb80c34_u56426",
  kind: "negative",
  media_path: IG,
  anchor_sec: 15.97,
  start_sec: 15.47,
  end_sec: 16.47,
  created_at: "2026-11-10T21:47:05.392Z",
});
const IG_VERSION = op({
  marker_id: "comment_mwb80w9k_7luk",
  kind: "comment",
  media_path: IG,
  anchor_sec: 15.971645,
  start_sec: 15.971645,
  end_sec: 15.971645,
  text: "Не та версия, сделал новую /Volumes/tempwork/261002_mone/render/Igor_D-cut06-5_nocolor_422_25.mov",
});

const LIVE: ExtractableMarker[] = [
  ...M4_QUESTION,
  ...IG_QUESTION,
  M4_SKIN,
  M4_AUDIO,
  IG_NEGATIVE,
  IG_VERSION,
];

const own = (records: AnswerRecord[]) => records.filter((r) => r.origin === "operator_marker");

describe("answersFromMarkers: собственные маркеры оператора внутри in/out записи", () => {
  it("живой кейс reelsD: оба комментария model4 доходят до агента с текстом, t_sec и question_id", () => {
    const m4 = own(answersFromMarkers(LIVE)).filter((r) => r.question_id === "m4_D");
    expect(m4.map((r) => r.marker_id)).toEqual(["comment_mwb7lg38_8sqn", "comment_mwb82a7a_5xqh"]);
    expect(m4[0]).toMatchObject({
      question_id: "m4_D",
      verdict: "comment",
      comment: "кожа ухожит в небольшой пересвет",
      t_sec: 29.3508387,
      confirmed_by: "danilagulin",
      origin: "operator_marker",
    });
    expect(m4[1].comment).toContain("/Volumes/tempwork/261002_mone/audio/id_model4_d-cut05_uni1.wav");
    expect(m4[1].t_sec).toBeCloseTo(3.8774, 3);
  });

  it("живой кейс reelsD: negative и comment оператора на igor — ответ на ig_D; диапазон negative сохранён", () => {
    const ig = own(answersFromMarkers(LIVE)).filter((r) => r.question_id === "ig_D");
    expect(ig).toHaveLength(2);
    const negative = ig.find((r) => r.verdict === "negative")!;
    expect(negative.t_sec).toBe(15.97);
    expect(negative.marker_start_sec).toBe(15.47);
    expect(negative.marker_end_sec).toBe(16.47);
    expect(negative.comment).toBeUndefined();
    expect(negative.answered_at).toBe("2026-11-10T21:47:05.392Z");
    const note = ig.find((r) => r.verdict === "comment")!;
    expect(note.comment).toBe("Не та версия, сделал новую /Volumes/tempwork/261002_mone/render/Igor_D-cut06-5_nocolor_422_25.mov");
    // точечный маркер диапазона не выдумывает
    expect(note.marker_start_sec).toBeUndefined();
    expect(note.marker_end_sec).toBeUndefined();
  });

  it("ig_D больше не pending: свой negative + comment внутри записи = ответ на вопрос", () => {
    const doc = buildAnswersDocument(answersFromMarkers(LIVE), {
      playlistId: "queue_reelsD-201336",
      questionIds: ["m4_D", "ig_D"],
    });
    expect(doc.answered_question_ids).toEqual(["m4_D", "ig_D"]);
    expect(doc.pending_question_ids).toEqual([]);
    expect(doc.complete).toBe(true);
    expect(doc.answers).toHaveLength(4);
  });

  it("время ответа: created_at, а у маркера без него — из id (base36 от Date.now), иначе пусто", () => {
    const records = own(answersFromMarkers(LIVE));
    const skin = records.find((r) => r.marker_id === "comment_mwb7lg38_8sqn")!;
    expect(skin.answered_at).toBe(new Date(parseInt("mwb7lg38", 36)).toISOString());
    expect(skin.answered_at > ASKED_AT).toBe(true);
    const anon = op({ marker_id: "note", kind: "comment", media_path: M4, anchor_sec: 5, text: "без времени" });
    const [rec] = own(answersFromMarkers([...M4_QUESTION, anon]));
    expect(rec.answered_at).toBe("");
  });

  it("вне скобок вопроса (после OUT) и на другом файле — не ответ", () => {
    const late = op({ marker_id: "comment_late", kind: "comment", media_path: M4, anchor_sec: 60, text: "после OUT" });
    const elsewhere = op({ marker_id: "comment_other", kind: "comment", media_path: "asset://localhost/other.mov", anchor_sec: 5, text: "другой файл" });
    expect(own(answersFromMarkers([...M4_QUESTION, late, elsewhere]))).toEqual([]);
  });

  it("не свои: маркер агента, reply-треды, пустой comment, in/out/chat — в ответы не идут", () => {
    const agent = op({ marker_id: "comment_agent", kind: "comment", media_path: M4, anchor_sec: 5, text: "от агента", author: "agent:Beta" });
    const reply = op({ marker_id: "reply_x", kind: "comment", media_path: M4, anchor_sec: 5, text: "в треде", reply_to: "comment_mwb7lg38_8sqn" });
    const emptyComment = op({ marker_id: "comment_empty", kind: "comment", media_path: M4, anchor_sec: 6, text: "  " });
    const bracketIn = op({ marker_id: "in_x", kind: "in", media_path: M4, anchor_sec: 7, text: "скобка" });
    const bracketOut = op({ marker_id: "out_x", kind: "out", media_path: M4, anchor_sec: 8, text: "скобка" });
    const chat = op({ marker_id: "chat_x", kind: "chat", media_path: M4, anchor_sec: 9, text: "чат" });
    const qmatLike = op({ marker_id: "qmat_m4_D_c9", kind: "comment", media_path: M4, anchor_sec: 10, text: "id вопроса" });
    expect(own(answersFromMarkers([...M4_QUESTION, agent, reply, emptyComment, bracketIn, bracketOut, chat, qmatLike]))).toEqual([]);
  });

  it("ответ карточки (reply на qmat) разбирается как раньше и не дублируется как «свой маркер»", () => {
    const card = op({
      marker_id: "reply_mwb7m2qd_f364",
      kind: "favorite",
      media_path: M4,
      anchor_sec: 38.1,
      start_sec: 0,
      end_sec: 0,
      reply_to: "qmat_m4_D_in",
      text: "[answer] confirm (favorite)",
      created_at: "2026-11-10T21:36:00.085Z",
    });
    // одиночный head «confirm» становится choice, когда он есть в вариантах вопроса
    const records = answersFromMarkers([...M4_QUESTION, card], { choicesOf: () => ["confirm", "reject"] });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ question_id: "m4_D", verdict: "favorite", choice: "confirm", out_sec: 49.72 });
    expect(records[0].origin).toBeUndefined();
  });

  it("favorite оператора внутри записи — тоже ответ (★ без текста)", () => {
    const star = op({ marker_id: "marker_star", kind: "favorite", media_path: M4, anchor_sec: 12, start_sec: 12, end_sec: 12, created_at: "2026-11-10T21:00:00.000Z" });
    const [rec] = own(answersFromMarkers([...M4_QUESTION, star]));
    expect(rec).toMatchObject({ question_id: "m4_D", verdict: "favorite", t_sec: 12 });
    expect(rec.comment).toBeUndefined();
  });

  it("маркер оператора, поставленный ДО импорта вопроса (старый прогон на том же файле), новому вопросу не приписывается", () => {
    const earlier = op({
      marker_id: "comment_old_run",
      kind: "comment",
      media_path: M4,
      anchor_sec: 5,
      text: "это про r2",
      created_at: "2026-11-02T10:00:00.000Z",
    });
    expect(own(answersFromMarkers([...M4_QUESTION, earlier]))).toEqual([]);
    const sameInstant = op({ marker_id: "comment_same", kind: "comment", media_path: M4, anchor_sec: 5, text: "в ту же секунду", created_at: ASKED_AT });
    expect(own(answersFromMarkers([...M4_QUESTION, sameInstant]))).toHaveLength(1);
  });

  it("общая граница окон на одном файле: t=20 — окну, которое начинается; закрытый конец — только если других нет", () => {
    const P = "asset://localhost/captcha.mp4";
    const windows = [
      ...agentMarkers(P, { question_id: "q_a", in_sec: 10, out_sec: 20 }),
      ...agentMarkers(P, { question_id: "q_b", in_sec: 20, out_sec: 30 }),
    ];
    const at = (id: string, t: number) =>
      op({ marker_id: id, kind: "comment", media_path: P, anchor_sec: t, text: id, created_at: "2026-11-10T21:00:00.000Z" });
    const records = own(answersFromMarkers([...windows, at("on_20", 20), at("on_15", 15), at("on_30", 30), at("on_35", 35)]));
    const qidOf = (marker: string) => records.find((r) => r.marker_id === marker)?.question_id;
    expect(qidOf("on_15")).toBe("q_a");
    expect(qidOf("on_20")).toBe("q_b");
    expect(qidOf("on_30")).toBe("q_b");
    expect(qidOf("on_35")).toBeUndefined();
  });

  it("вопрос на весь файл (_whole, без скобок): любой маркер оператора на этом файле — его", () => {
    const photo = agentMarkers("asset://localhost/photo.jpg", { question_id: "cap-3", question: "годится?" });
    const note = op({ marker_id: "comment_photo", kind: "negative", media_path: "asset://localhost/photo.jpg", anchor_sec: 0, text: "мимо", created_at: "2026-11-10T21:00:00.000Z" });
    const [rec] = own(answersFromMarkers([...photo, note]));
    expect(rec).toMatchObject({ question_id: "cap-3", verdict: "negative", comment: "мимо" });
  });

  it("человек сдвинул OUT вопроса — граница берётся из текущего маркера, как у ответов карточки", () => {
    const moved = M4_QUESTION.map((m) => (m.marker_id === "qmat_m4_D_out" ? { ...m, start_sec: 20, anchor_sec: 20 } : m));
    expect(own(answersFromMarkers([...moved, M4_SKIN]))).toEqual([]); // 29.35 уже за новым OUT
    expect(own(answersFromMarkers([...moved, M4_AUDIO]))).toHaveLength(1); // 3.88 внутри
  });
});

describe("questionScopeFromMarkers: какие вопросы видны в маркерах", () => {
  it("вопросы, чьи маркеры-родители (_in / _whole) лежат в хранилище", () => {
    const photo = agentMarkers("asset://localhost/photo.jpg", { question_id: "cap-3" });
    expect(questionScopeFromMarkers([...M4_QUESTION, ...photo]).sort()).toEqual(["cap-3", "m4_D"]);
    expect(questionScopeFromMarkers([])).toEqual([]);
  });
});

describe("mergeAnswerRecords: маркеры оператора — зеркало текущих маркеров, ответы карточки — только дописывание", () => {
  const card: AnswerRecord = { question_id: "m4_D", verdict: "favorite", choice: "confirm", answered_at: "2026-11-10T21:36:00.085Z", t_sec: 38.1 };
  const oldNote: AnswerRecord = {
    question_id: "m4_D",
    verdict: "comment",
    comment: "старый текст",
    t_sec: 29.35,
    answered_at: "2026-11-10T21:30:00.000Z",
    origin: "operator_marker",
    marker_id: "comment_a",
  };
  const goneNote: AnswerRecord = { ...oldNote, marker_id: "comment_gone", comment: "удалили маркер" };
  const editedNote: AnswerRecord = { ...oldNote, comment: "новый текст" };

  it("правка текста заменяет запись, удалённый маркер уходит; ответ карточки цел", () => {
    const merged = mergeAnswerRecords([card, oldNote, goneNote], [editedNote], { replaceOperatorMarkersIn: ["m4_D"] });
    expect(merged).toEqual([card, editedNote]);
  });

  it("вопрос вне области (маркеров вопроса нет в хранилище) — записи оператора остаются как есть", () => {
    const merged = mergeAnswerRecords([card, oldNote, goneNote], [], { replaceOperatorMarkersIn: ["ig_D"] });
    expect(merged).toEqual([card, oldNote, goneNote]);
  });

  it("без области — прежняя семантика: дописывание с дедупом по содержимому", () => {
    expect(mergeAnswerRecords([card, oldNote], [oldNote, card])).toEqual([card, oldNote]);
    expect(mergeAnswerRecords([card], [oldNote])).toEqual([card, oldNote]);
  });
});
