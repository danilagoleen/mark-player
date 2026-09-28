import { expect, test } from "@playwright/test";

const VIDEO_FIXTURE = "/Users/danilagulin/Documents/VETKA_Project/vetka_live_03/tools/back_to_ussr_app/docs/media/demo.mp4";

test("VETKA action stays provisional until Core/CUT connection exists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot?.sourceKind === "video");
  });

  let snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(snapshot?.activeContextAction).toBe("vetka");
  expect(snapshot?.inVetka).toBe(false);
  expect(snapshot?.markerCount).toBe(0);
  expect(snapshot?.provisionalEventCount).toBe(0);

  await page.getByTestId("context-action").click();

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.activeContextAction === "vetka" && snapshot?.provisionalEventCount === 1);
  });

  snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  const provisionalEvents = await page.evaluate(() => window.vetkaPlayerLab?.provisionalEvents?.() ?? []);

  expect(snapshot?.activeContextAction).toBe("vetka");
  expect(snapshot?.inVetka).toBe(false);
  expect(snapshot?.markerCount).toBe(0);
  expect(snapshot?.provisionalEventCount).toBe(1);
  expect(provisionalEvents).toHaveLength(1);
  expect(provisionalEvents?.[0]?.event_type).toBe("vetka_logo_capture");
  expect(provisionalEvents?.[0]?.migration_status).toBe("local_only");
  await expect(page.getByText("Moment registered locally. VETKA Core/CUT is needed for full workflow.")).toBeVisible();
});

test("Core/CUT connection flips contextual action to star only when explicitly enabled", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot?.sourceKind === "video");
  });

  await page.evaluate(() => {
    window.vetkaPlayerLab?.setInVetka(true);
    window.vetkaPlayerLab?.addMomentMarker("favorite");
  });

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.inVetka && snapshot?.activeContextAction === "favorite" && snapshot?.favoriteMomentCount === 1);
  });

  const snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(snapshot?.inVetka).toBe(true);
  expect(snapshot?.activeContextAction).toBe("favorite");
  expect(snapshot?.favoriteMomentCount).toBe(1);
});
