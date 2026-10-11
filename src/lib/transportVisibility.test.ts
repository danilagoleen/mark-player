import { describe, expect, it } from "vitest";
import { pushTransportTrace, shouldHideTransport, type TransportTraceEntry } from "./transportVisibility";

describe("shouldHideTransport (tb_1791675182_1275_1: прячем только идущее)", () => {
  it("время ушло вперёд — прячем", () => {
    expect(shouldHideTransport({ armedTime: 10, firedTime: 12.5, paused: false, ended: false })).toBe(true);
  });
  it("stall (время стоит — probe/attach/fetch прокси) — не прячем", () => {
    expect(shouldHideTransport({ armedTime: 0, firedTime: 0, paused: false, ended: false })).toBe(false);
  });
  it("время назад (смена src/сброс) — не прячем", () => {
    expect(shouldHideTransport({ armedTime: 40, firedTime: 0.2, paused: false, ended: false })).toBe(false);
  });
  it("пауза/конец к моменту срабатывания — не прячем", () => {
    expect(shouldHideTransport({ armedTime: 10, firedTime: 12, paused: true, ended: false })).toBe(false);
    expect(shouldHideTransport({ armedTime: 10, firedTime: 12, paused: false, ended: true })).toBe(false);
  });
  it("мусор вместо времени — не прячем", () => {
    expect(shouldHideTransport({ armedTime: NaN, firedTime: 12, paused: false, ended: false })).toBe(false);
  });
});

describe("pushTransportTrace (tb_1791680717_1275_3: кольцо без консоли)", () => {
  const entry = (ts: number): TransportTraceEntry => ({
    ts, show: true, chrome: false, moving: true, kind: "video", file: "P1755123.MOV",
  });
  it("дописывает в пустое", () => {
    expect(pushTransportTrace([], entry(1))).toHaveLength(1);
  });
  it("держит не больше cap, сбрасывает старые", () => {
    let ring: TransportTraceEntry[] = [];
    for (let i = 0; i < 35; i++) ring = pushTransportTrace(ring, entry(i));
    expect(ring).toHaveLength(30);
    expect(ring[0].ts).toBe(5);
    expect(ring[29].ts).toBe(34);
  });
  it("исходный массив не мутирует", () => {
    const ring: TransportTraceEntry[] = [entry(1)];
    pushTransportTrace(ring, entry(2));
    expect(ring).toHaveLength(1);
  });
  it("опциональный mode проходит как есть", () => {
    const ring = pushTransportTrace([], { ...entry(1), mode: "Sall" });
    expect(ring[0].mode).toBe("Sall");
  });
});
