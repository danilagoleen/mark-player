# Mark Player 0.18 beta, by VETKA lab

Marker-first video review. Open a file, watch, drop markers, comment, export —
to SRT subtitles, Premiere XML timeline, or JSON sidecar. No FFmpeg, no probe
daemon, no account. Light by design (≤10 MB).

Agent chat is a **separate module** (not bundled): when it ships, it arrives
as a one-button upgrade, same as the future CUT Player (FFprobe/FFmpeg build
with render-by-markers).

## Download

Grab the latest beta from
**[Releases](https://github.com/danilagoleen/mark-player/releases)**:

- **macOS Apple Silicon** — `Mark Player_0.18.0_aarch64.dmg`
- **macOS Intel** — `Mark Player_0.18.0_x64.dmg`
- **Windows 10/11** — `Mark Player_0.18.0_x64-setup.exe`

## Installation (macOS)

Download the `.dmg`, drag **Mark Player** to Applications.

> **Mark Player is not notarized yet**, so macOS shows a security warning on
> first launch. To open it: **right-click the app → Open → Open** in the dialog.
> It asks only once.
>
> Or remove the quarantine flag once via Terminal:
>
> ```bash
> xattr -cr "/Applications/Mark Player.app"
> ```
>
> Safari sometimes quarantines downloads more aggressively — the same command
> fixes it. Many open-source video tools ship this way (IINA, mpv).

## Installation (Windows)

Run the `setup.exe` from Releases. The build is unsigned, so SmartScreen
warns on first launch: **More info → Run anyway**. It asks only once.

## Run from source

```bash
npm ci
npm run dev        # http://127.0.0.1:1424
npm test           # vitest
npm run tauri:dev  # native shell (needs main player closed: single pilot socket)
npm run tauri:build
```

Native bundles land in
`src-tauri/target/release/bundle/{dmg/*.dmg,nsis/*.exe,msi/*.msi}`.

## What it does

- **Markers:** ★ Favorite (`F`), ✗ Negative (`N`), `[` / `]` In / Out (`I` / `O`),
  · Comment (`M`, opens comment window). Flags on the timeline, drag to move,
  double-click a flag to delete.
- **Scale (bottom):** ruler + flags + in/out, click seeks, playhead follows.
- **Marker pill (top):** ★ ✗ `[` `]` 💬 — creation buttons over the picture.
- **Volume:** `↑` / `↓` (5% steps), OSD percent top-right, `M` is Comment —
  mute lives in the Audio menu.
- **Shuttle:** `J` back / `K` stop / `L` forward (`JJ`/`LL` = ×2), `←` / `→`
  one frame (probe → rVFC estimate → 25 fps fallback), `Shift` + `←` / `→`
  five frames, `Home` / `End` jumps.
- **Export:** File → Export or `⌘S` (SRT), JSON sidecar, XMEML timeline XML
  for one video or the whole playlist (Premiere-ready sequence).
  Every export answers: `Saved: <file>` / `No markers to export.` /
  `Export failed: <reason>`. Markers store locally
  (`vetka_player_lab_markers_v1`); files leave only via save dialog.
- **Gate:** only honest failures open a refusal — heavy containers
  (mkv/avi/…) get an EN Pro-engine offer toast, current video keeps playing.
  The Open dialog lists native formats only, by design.

## Shortcuts

| Keys | Action |
|------|--------|
| `Space` | Play / pause |
| `J` / `K` / `L` | Shuttle back / stop / forward (double-tap = ×2) |
| `←` / `→` | ±1 frame; `Shift` = ±5 frames |
| `↑` / `↓` | Volume ±5% |
| `I` / `O` | Mark in / out |
| `F` / `N` | Favorite / negative marker |
| `M` | Comment marker + comment window |
| `Q` | Preview quality cycle |
| `Home` / `End` | Go to start / end |
| `Esc` | Exit fullscreen |
| `⌘O` / `⌘S` / `⇧⌘O` | Open file / export SRT / import SRT |
| `⌘L` | Playlist |
| `⌘F` / `⌘I` | Fullscreen / media info |

## Modules (SPORA)

The player is a spore: markers, export and playlist ship inside; agent chat,
scanner, THALAMUS board and CUT NLE attach later as modules.
