import { describe, expect, it } from "vitest";
import caps from "../../src-tauri/capabilities/default.json";
import { PLAYER_WRITE_ROOTS } from "./questionAnswersFile";

// tb_1795498927_72599_1 (находка Phi 24.11): ответы плейлиста-вопроса лежат рядом
// с плейлистом (<playlist>.answers.json, .session.json). Плейлист из /private/tmp
// плеер открывал (диалог даёт чтение именно этого файла), а писать рядом не мог:
// capabilities не пускали запись вне $HOME, /Volumes и $TEMP (на macOS $TEMP это
// /var/folders/.., не /private/tmp и не /tmp). Отказ был тихий.
//
// Этот тест держит три вещи: (1) /private/tmp и /tmp разрешены во всех fs-правах,
// которыми пользуется файловый контракт ответов; (2) права не расходятся между
// собой (запись есть, а чтения нет — санитайз при открытии падает тихо);
// (3) список корней в тексте отказа и в манифесте совпадает с файлом прав.

const FS_SCOPED = [
  "fs:allow-write-text-file",
  "fs:allow-write-file",
  "fs:allow-mkdir",
  "fs:allow-read-text-file",
  // санитайз при открытии проверяет, есть ли уже .bak, через fs.exists;
  // без своего scope exists на /Volumes и /tmp отказывает, а бэкап молча не делается
  "fs:allow-exists",
] as const;

type ScopedPermission = { identifier: string; allow: { path: string }[] };

function scopedPermission(id: string): ScopedPermission | undefined {
  return (caps.permissions as unknown[]).find(
    (p): p is ScopedPermission =>
      typeof p === "object" && p !== null && (p as { identifier?: string }).identifier === id,
  );
}

function pathsOf(id: string): string[] {
  return (scopedPermission(id)?.allow ?? []).map((a) => a.path);
}

describe("capabilities: корни записи файлов ответов", () => {
  for (const id of FS_SCOPED) {
    it(`${id}: разрешены /private/tmp/** и /tmp/**`, () => {
      const paths = pathsOf(id);
      expect(paths).toContain("/private/tmp/**");
      expect(paths).toContain("/tmp/**");
    });

    it(`${id}: прежние корни на месте ($HOME, /Volumes, $TEMP)`, () => {
      const paths = pathsOf(id);
      expect(paths).toContain("$HOME/**");
      expect(paths).toContain("/Volumes/**");
      expect(paths).toContain("$TEMP/**");
    });
  }

  it("права не расходятся: у всех fs-разрешений один и тот же набор корней", () => {
    const [first, ...rest] = FS_SCOPED.map((id) => [...pathsOf(id)].sort());
    for (const other of rest) expect(other).toEqual(first);
  });

  it("список корней для текста отказа и манифеста = корни из файла прав", () => {
    const fromFile = pathsOf("fs:allow-write-text-file").map((p) => p.replace(/\/\*\*$/, ""));
    expect([...PLAYER_WRITE_ROOTS].sort()).toEqual([...fromFile].sort());
  });
});
