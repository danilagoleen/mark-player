// tb_1792634443_73606_2: экспорт не должен молча падать в «последнюю
// открытую папку». Диалог получает явный defaultPath: папка медиа для
// видео-экспорта, папка плейлиста для playlist-экспорта. Путь показываем
// оператору в тосте (exportFeedback).

/** Папка пути (posix или windows); пустая строка — пути нет. */
export function dirOfPath(path: string | null | undefined): string {
  if (typeof path !== "string" || !path) return "";
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (slash <= 0) return "";
  return path.slice(0, slash);
}

/** Собрать defaultPath для диалога, сохранив родной разделитель папки. */
export function joinForDialog(dir: string | null | undefined, name: string): string {
  const base = typeof dir === "string" ? dir.replace(/[\\/]+$/, "") : "";
  if (!base) return name;
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return `${base}${sep}${name}`;
}
