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
  it("anchor = playhead, если известен; спан — родителя", () => {
    const r = buildReplyMarkerFull({ parent, text: "ok", author: "", label: "l", now: "2026-10-12T00:00:00Z", playheadSec: 9.25 });
    expect(r?.anchor_sec).toBe(9.25);
    expect(r?.start_sec).toBe(7);
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
});
