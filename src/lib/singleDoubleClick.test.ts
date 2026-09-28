import { describe, expect, it, vi } from "vitest";
import { createSingleDoubleClick } from "./singleDoubleClick";

// [signal: даблклик-фулскрин 0.10.29] [project: cut-player]
// RED: модуля singleDoubleClick ещё нет.
// Контракт: одиночный клик срабатывает с задержкой; второй клик внутри
// окна отменяет одиночный и стреляет двойным (приоритет даблклика).

describe("createSingleDoubleClick", () => {
  it("одиночный клик → onSingle после задержки", () => {
    vi.useFakeTimers();
    const single = vi.fn();
    const dbl = vi.fn();
    const ctl = createSingleDoubleClick(single, dbl, 250);
    ctl.click();
    expect(single).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(single).toHaveBeenCalledTimes(1);
    expect(dbl).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("второй клик в окне → onDouble, onSingle молчит", () => {
    vi.useFakeTimers();
    const single = vi.fn();
    const dbl = vi.fn();
    const ctl = createSingleDoubleClick(single, dbl, 250);
    ctl.click();
    vi.advanceTimersByTime(100);
    ctl.click();
    vi.advanceTimersByTime(500);
    expect(dbl).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("dispose гасит pending-одиночный", () => {
    vi.useFakeTimers();
    const single = vi.fn();
    const ctl = createSingleDoubleClick(single, vi.fn(), 250);
    ctl.click();
    ctl.dispose();
    vi.advanceTimersByTime(500);
    expect(single).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
