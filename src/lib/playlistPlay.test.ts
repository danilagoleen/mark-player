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
