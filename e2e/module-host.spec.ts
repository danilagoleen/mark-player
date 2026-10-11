import { expect, test } from "@playwright/test";

// tb_1791156678_82609_2: окно-хост модульной страницы (§11).
// Живой мост (iframe + MCP) — только в десктопе (проверяет оператор);
// здесь — честные отказы: без query и без Tauri окно говорит, чего нет.

test("без query — ошибка хоста, а не пустое окно", async ({ page }) => {
  await page.goto("/module-host.html");
  await expect(page.getByTestId("module-host-error")).toBeVisible();
  await expect(page.getByTestId("module-host-error")).toContainText("manifest");
});

test("query без page — ошибка валидации", async ({ page }) => {
  await page.goto("/module-host.html?manifest=/m.json&window=w");
  await expect(page.getByTestId("module-host-error")).toBeVisible();
});

test("в браузере (без Tauri) — честно просит десктоп", async ({ page }) => {
  await page.goto("/module-host.html?manifest=/m.json&window=w&page=/m/x.html&title=T");
  await expect(page.getByTestId("module-host-error")).toContainText("desktop app");
});
