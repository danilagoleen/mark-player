import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:1424",
    headless: true,
  },
  webServer: {
    // cwd НЕ задаём: команда выполняется из каталога этого конфига.
    // Было захардкожено на мёртвый ворктри cut-player — e2e проверяли чужой код.
    // [task:tb_1791169872_2308_5]
    command: "npm run dev -- --host 127.0.0.1",
    port: 1424,
    // В CI всегда свежий сервер; локально переиспользуем уже поднятый.
    reuseExistingServer: !process.env.CI,
  },
});
