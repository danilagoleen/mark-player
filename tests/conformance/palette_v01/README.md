# palette_v01 — проекция P для обмена с индекс-модулем

Эталон для контракта `AGENT_DATA_MANIFEST.md` §5.7. Проверяет, что
reference-экспортёр плеера не разошёлся с модулем по файловому
пространству.

## Файлы

| Файл | Назначение |
|---|---|
| `palette.json` | дескриптор модуля: 4 item, 2 блока, ★, title |
| `playlist.json` | выход `cut_player_playlist` — ровно `vetka.cut.question_playlist/1` |
| `probe.json` | метаданные источников для экспортёра |
| `expected.player.xml` | замороженный выход `exportPlaylistToXmeml` |
| `manifest.json` | контракт, `db_version`, P, sha256 expected |

## Проекция P

> P = XMEML без таймлайновых координат и без фильтров; сравниваются
> файловые in/out, имена, маркеры, ★ и порядок.

Сравниваются: порядок clipitem, `name` = basename, файловые `in`/`out`,
маркеры (`name`, `comment`, `in`, `out`, цвет), `question_id`/`ref`.
Игнорируются: `clip <start>/<end>`, `sequence <duration>`,
sequence-маркеры блоков, `<filter>`/Basic Motion.

## Обновление эталона

`expected.player.xml` — не ручная правка. При смене контракта его
пересобирает reference-экспортёр (`src/srtUtils.ts`,
`exportPlaylistToXmeml`) из `playlist.json` + `probe.json`, затем
обновляется `expected_sha256` в `manifest.json`.
Тест `src/lib/paletteConformance.test.ts` падает при любом дрейфе.

Полный модульный гейт (`expected.module.xml` с блоками и Basic Motion,
`expected.answers.json`, `expected_decisions.json`) живёт в фикстуре
`cut-player-mcp`; здесь только проекция плеера.
