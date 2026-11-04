// tb_1793567711_43420_2: самоисцеление карточки. Если вопрос карточки есть в
// загруженном плейлисте, а маркеров qmat у него нет, плеер сам материализует
// плейлист (дедуп пропускает существующие) — оператор не переимпортирует.
// Не больше одной попытки на пару «вопрос + медиа», иначе при любом сбое
// записи лечение крутилось бы по кругу.

export interface HealCheck {
  qid: string | null | undefined;
  hasMarkers: boolean;
  isQuestionPlaylist: boolean;
  inPlaylist: boolean;
  attempted: ReadonlySet<string>;
  mediaKey: string | null | undefined;
}

export function healKey(qid: string, mediaKey: string | null | undefined): string {
  return `${qid}|${mediaKey ?? ""}`;
}

export function shouldHealQuestionMarkers(check: HealCheck): boolean {
  const qid = typeof check.qid === "string" ? check.qid.trim() : "";
  if (!qid) return false;
  if (check.hasMarkers) return false;
  if (!check.isQuestionPlaylist || !check.inPlaylist) return false;
  return !check.attempted.has(healKey(qid, check.mediaKey));
}
