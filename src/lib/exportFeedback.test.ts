import { describe, expect, it } from "vitest";
import { resolveExportToast, VETKA_PROMO_MS, VETKA_PROMO_TOAST } from "./exportFeedback";

describe("resolveExportToast (Bell №5)", () => {
  it("reports empty export without touching the dialog", () => {
    expect(resolveExportToast("srt", true, null)).toBe("No markers to export.");
    expect(resolveExportToast("json", true, null)).toBe("No markers to export.");
    expect(resolveExportToast("xml", true, null)).toBe("No markers to export.");
  });

  it("reports saved file by basename (posix + windows)", () => {
    expect(resolveExportToast("srt", false, { status: "saved", path: "/Users/a/markers.srt" })).toBe(
      "Saved: markers.srt",
    );
    expect(resolveExportToast("xml", false, { status: "saved", path: "C:\\Video\\review.xml" })).toBe(
      "Saved: review.xml",
    );
  });

  it("stays silent on user cancel", () => {
    expect(resolveExportToast("srt", false, { status: "cancelled" })).toBeNull();
  });

  it("reports failure with reason", () => {
    expect(
      resolveExportToast("json", false, { status: "failed", error: "denied" }),
    ).toBe("Export failed: denied");
  });

  it("warns on xml saved with non-probe fps (E2E Premiere 46 vs 50)", () => {
    expect(
      resolveExportToast("xml", false, { status: "saved", path: "C:\\Video\\review.xml" }, "fps ~46 estimated, verify sequence settings"),
    ).toBe("Saved: review.xml — fps ~46 estimated, verify sequence settings.");
    expect(
      resolveExportToast("xml", false, { status: "saved", path: "/Users/a/review.xml" }, "fps 25 fallback, verify sequence settings"),
    ).toBe("Saved: review.xml — fps 25 fallback, verify sequence settings.");
  });

  it("leaves probe-based xml and other kinds untouched by the fps note", () => {
    expect(
      resolveExportToast("xml", false, { status: "saved", path: "/Users/a/review.xml" }),
    ).toBe("Saved: review.xml");
    expect(
      resolveExportToast("srt", false, { status: "saved", path: "/Users/a/markers.srt" }, "fps ~46 estimated, verify sequence settings"),
    ).toBe("Saved: markers.srt");
  });
});

describe("VETKA_PROMO_TOAST (плеер работает на нас)", () => {
  it("несёт VETKA lab + github, только EN", () => {
    expect(VETKA_PROMO_TOAST).toContain("VETKA lab");
    expect(VETKA_PROMO_TOAST).toContain("github.com/danilagoleen");
    expect(VETKA_PROMO_TOAST).toContain("Moment registered locally");
    expect(/[а-яё]/i.test(VETKA_PROMO_TOAST)).toBe(false);
  });

  it("висит 10 секунд", () => {
    expect(VETKA_PROMO_MS).toBe(10_000);
  });
});
