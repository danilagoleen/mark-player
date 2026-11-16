import { describe, expect, it } from "vitest";
import {
  buildReplyMarkerFull,
  isQuestionMarker,
  resolveReplyAuthorForParent,
} from "./markerReply";

describe("isQuestionMarker", () => {
  it("поле question_id побеждает", () => {
    expect(isQuestionMarker("whatever", "mrg-01")).toBe(true);
  });
  it("легаси — префикс id", () => {
    expect(isQuestionMarker("qmat_mrg-01_in", undefined)).toBe(true);
    expect(isQuestionMarker("comment_abc", undefined)).toBe(false);
    expect(isQuestionMarker("", undefined)).toBe(false);
    expect(isQuestionMarker(null, undefined)).toBe(false);
  });
});

describe("resolveReplyAuthorForParent", () => {
  it("свой автор побеждает везде", () => {
    expect(resolveReplyAuthorForParent(" me ", { marker_id: "qmat_a_in", author: "agent:Beta" })).toBe("me");
  });
  it("qmat-родитель: пустой свой — пусто, НЕ агент", () => {
    expect(resolveReplyAuthorForParent("", { marker_id: "qmat_a_in", author: "agent:Beta" })).toBe("");
    expect(resolveReplyAuthorForParent("", { marker_id: "x", author: "a", question_id: "q1" })).toBe("");
  });
  it("обычный родитель: fallback как раньше", () => {
    expect(resolveReplyAuthorForParent("", { marker_id: "comment_1", author: "Ann" })).toBe("Ann");
    expect(resolveReplyAuthorForParent("", { marker_id: "comment_1" })).toBe("");
    expect(resolveReplyAuthorForParent("", null)).toBe("");
  });
});

describe("buildReplyMarkerFull", () => {
  const parent = {
    marker_id: "qmat_mrg-01_in",
    start_sec: 7,
    end_sec: 7,
    anchor_sec: 7.5,
    media_path: "a.mp4",
    author: "agent:Beta",
    content_hash: null,
  };
  // tb_1794800630_73214_1: диапазон родителя в ответ больше не копируется —
  // в gold_keys_v1 пять ответов с якорями 3.18…94.07 несли 12.25–13.25 (диапазон
  // qmat_in на момент ответа). Свой диапазон ответа — от его якоря, как у обычного маркера.
  it("(d) ответ не наследует диапазон родителя: start/end считаются от своего якоря", () => {
    const movedParent = { ...parent, start_sec: 12.25, end_sec: 13.25, anchor_sec: 12.75 };
    const r = buildReplyMarkerFull({ parent: movedParent, text: "ok", author: "", label: "l", now: "n", playheadSec: 20.9 });
    expect(r?.anchor_sec).toBe(20.9);
    expect(r?.start_sec).toBe(20.4);
    expect(r?.end_sec).toBe(21.4);
    const early = buildReplyMarkerFull({ parent: movedParent, text: "ok", author: "", label: "l", now: "n", playheadSec: 0.2 });
    expect(early?.start_sec).toBe(0);
    expect(early?.end_sec).toBe(0.7);
  });
  it("(d) без playhead: диапазон от якоря родителя, не от диапазона родителя", () => {
    const movedParent = { ...parent, start_sec: 12.25, end_sec: 13.25, anchor_sec: 12.75 };
    const r = buildReplyMarkerFull({ parent: movedParent, text: "ok", author: "", label: "l", now: "n" });
    expect(r?.anchor_sec).toBe(12.75);
    expect(r?.start_sec).toBe(12.25);
    expect(r?.end_sec).toBe(13.25);
  });
  it("anchor = playhead, если известен", () => {
    const r = buildReplyMarkerFull({ parent, text: "ok", author: "", label: "l", now: "2026-10-12T00:00:00Z", playheadSec: 9.25 });
    expect(r?.anchor_sec).toBe(9.25);
    expect(r?.reply_to).toBe("qmat_mrg-01_in");
    expect(r?.created_at).toBe("2026-10-12T00:00:00Z");
    expect(r?.kind).toBe("comment");
  });
  it("без playhead — anchor родителя", () => {
    const r = buildReplyMarkerFull({ parent, text: "ok", author: "", label: "l", now: "n" });
    expect(r?.anchor_sec).toBe(7.5);
  });
  it("нет родителя — null", () => {
    expect(buildReplyMarkerFull({ parent: null, text: "x", author: "", label: "l", now: "n" })).toBeNull();
  });
  // tb_1791837678_26192_1: вердикт = тип маркера (карточка), окно — comment.
  it("kind по умолчанию comment (окно ↳)", () => {
    const r = buildReplyMarkerFull({ parent, text: "ok", author: "", label: "l", now: "n" });
    expect(r?.kind).toBe("comment");
  });
  it("kind=verdict из карточки: favorite/negative", () => {
    const fav = buildReplyMarkerFull({ parent, text: "[answer] (favorite)", author: "", label: "l", now: "n", kind: "favorite" });
    expect(fav?.kind).toBe("favorite");
    expect(fav?.reply_to).toBe("qmat_mrg-01_in");
    const neg = buildReplyMarkerFull({ parent, text: "[answer] (negative)", author: "", label: "l", now: "n", kind: "negative" });
    expect(neg?.kind).toBe("negative");
  });
});
