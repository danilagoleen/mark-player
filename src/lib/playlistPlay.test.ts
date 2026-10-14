import { describe, expect, it } from "vitest";
import {
  PLAYER_PLAY_REQUEST_KEY,
  encodePlayRequest,
  parsePlayRequest,
} from "./playlistPlay";

describe("parsePlayRequest", () => {
  it("свежий запрос разбирается", () => {
    expect(parsePlayRequest(encodePlayRequest("/v/a.mp4", 1000), 1000)).toEqual({ path: "/v/a.mp4" });
  });

  it("протухший (>15с) отбрасывается", () => {
    expect(parsePlayRequest(encodePlayRequest("/v/a.mp4", 1000), 1000 + 15_001)).toBeNull();
  });

  it("из будущего отбрасывается", () => {
    expect(parsePlayRequest(encodePlayRequest("/v/a.mp4", 2000), 1000)).toBeNull();
  });

  it("мусор и пустой путь — null", () => {
    expect(parsePlayRequest(null)).toBeNull();
    expect(parsePlayRequest("")).toBeNull();
    expect(parsePlayRequest("not json")).toBeNull();
    expect(parsePlayRequest(JSON.stringify({ path: "", at: 1000 }), 1000)).toBeNull();
    expect(parsePlayRequest(JSON.stringify({ path: 42, at: 1000 }), 1000)).toBeNull();
    expect(parsePlayRequest(JSON.stringify({ at: 1000 }), 1000)).toBeNull();
  });

  it("ключ стабилен", () => {
    expect(PLAYER_PLAY_REQUEST_KEY).toBe("vetka_player_lab_play_request_v1");
  });
});

describe("tb_1791876286_57716_1: play-запрос везёт точную запись", () => {
  it("entry + entryIndex переживают roundtrip", () => {
    const entry = { path: "/v/a.mov", question_id: "q", in_sec: 2919.75, out_sec: 2922.75 };
    const raw = encodePlayRequest("/v/a.mov", 1000, "q", entry, 3);
    expect(parsePlayRequest(raw, 1000)).toEqual({ path: "/v/a.mov", questionId: "q", entry, entryIndex: 3 });
  });
  it("без entry — как раньше", () => {
    expect(parsePlayRequest(encodePlayRequest("/v/a.mov", 1000, "q"), 1000)).toEqual({ path: "/v/a.mov", questionId: "q" });
  });
  it("мусор в entry/index отбрасывается, путь живёт", () => {
    const raw = JSON.stringify({ path: "/v/a.mov", at: 1000, entry: [1, 2], entryIndex: -5 });
    expect(parsePlayRequest(raw, 1000)).toEqual({ path: "/v/a.mov" });
  });
});
