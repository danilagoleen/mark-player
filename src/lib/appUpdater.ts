// Автообновление изнутри приложения (tb_1790710861_12931_16).
// Чистая логика поверх инжектированных Tauri-функций — тесты без рантайма.
// Политика тостов: ручная проверка говорит всё (есть/нет/ошибка),
// тихая при старте — только если обновление НАШЛОСЬ; сеть молчит всегда.

export interface UpdateInfo {
  version: string;
  currentVersion: string;
}

export interface UpdateDeps {
  currentVersion: string;
  check: () => Promise<UpdateInfo | null>;
  downloadAndInstall: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void>;
  relaunch: () => Promise<void>;
  toast: (msg: string) => void;
}

export interface UpdateStrings {
  checking: () => string;
  upToDate: (current: string) => string;
  available: (version: string) => string;
  availableSilent: (version: string) => string;
  downloading: (version: string) => string;
  progress: (pct: number) => string;
  restarting: (version: string) => string;
  failed: (detail: string) => string;
}

export const UPDATE_STRINGS: UpdateStrings = {
  checking: () => "Checking for updates…",
  upToDate: (current) => `You're up to date (${current}).`,
  available: (version) => `Update available: ${version}. Downloading…`,
  availableSilent: (version) => `Update ${version} available — install via Mark Player → Check for Updates.`,
  downloading: (version) => `Downloading update ${version}…`,
  progress: (pct) => `Downloading update… ${pct}%`,
  restarting: (version) => `Update ${version} installed. Restarting…`,
  failed: (detail) => `Update check failed: ${detail}`,
};

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown error";
  }
}

// Ручная проверка (меню Check for Updates): говорит всё.
// tb_1791172090_2308_6 п.5: первый тост — синхронно до сети, чтобы при
// висящем check() пользователь видел реакцию сразу, а не тишину.
export async function checkForUpdatesNow(deps: UpdateDeps, s: UpdateStrings = UPDATE_STRINGS): Promise<boolean> {
  deps.toast(s.checking());
  let info: UpdateInfo | null;
  try {
    info = await deps.check();
  } catch (e) {
    deps.toast(s.failed(errText(e)));
    return false;
  }
  if (!info) {
    deps.toast(s.upToDate(deps.currentVersion));
    return false;
  }
  deps.toast(s.available(info.version));
  try {
    let lastPct = -1;
    await deps.downloadAndInstall((downloaded, total) => {
      if (!total || total <= 0) return;
      const pct = Math.floor((downloaded / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        deps.toast(s.progress(pct));
      }
    });
  } catch (e) {
    deps.toast(s.failed(errText(e)));
    return false;
  }
  deps.toast(s.restarting(info.version));
  try {
    await deps.relaunch();
  } catch (e) {
    deps.toast(s.failed(errText(e)));
    return false;
  }
  return true;
}

// Тихая проверка при старте: тост только если обновление нашлось.
// Сеть и «всё свежо» молчат — старт приложения не замусориваем.
export async function checkForUpdatesSilent(deps: UpdateDeps, s: UpdateStrings = UPDATE_STRINGS): Promise<boolean> {
  let info: UpdateInfo | null;
  try {
    info = await deps.check();
  } catch {
    return false;
  }
  if (!info) return false;
  deps.toast(s.availableSilent(info.version));
  return true;
}
