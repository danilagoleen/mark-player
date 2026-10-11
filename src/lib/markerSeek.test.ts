import { describe, expect, it } from "vitest";
import {
  PLAYER_SEEK_REQUEST_KEY,
  encodeSeekRequest,
  parseSeekRequest,
} from "./markerSeek";

describe("parseSeekRequest", () => {
  it("свежий запрос разбирается", () => {
    expect(parseSeekRequest(encodeSeekRequest(12.5, 1000), 1000)).toBe(12.5);
  });

  it("протухший (>15с) отбрасывается", () => {
    expect(parseSeekRequest(encodeSeekRequest(12.5, 1000), 1000 + 15_001)).toBeNull();
  });

  it("из будущего отбрасывается", () => {
    expect(parseSeekRequest(encodeSeekRequest(12.5, 2000), 1000)).toBeNull();
  });

  it("мусор и отрицательные — null", () => {
    expect(parseSeekRequest(null)).toBeNull();
    expect(parseSeekRequest("")).toBeNull();
    expect(parseSeekRequest("not json")).toBeNull();
    expect(parseSeekRequest(JSON.stringify({ sec: -3, at: 1000 }), 1000)).toBeNull();
    expect(parseSeekRequest(JSON.stringify({ sec: "x", at: 1000 }), 1000)).toBeNull();
  });

  it("ключ стабилен", () => {
    expect(PLAYER_SEEK_REQUEST_KEY).toBe("vetka_player_lab_seek_v1");
  });
});
