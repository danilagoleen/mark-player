import { describe, expect, it } from "vitest";
import { buildCutPlayerMenuSpec, isNleOnlyAccelerator } from "./cutPlayerMenu";
import type { CutPlayerMenuItemSpec } from "./cutPlayerMenu";

function flattenItems(spec: ReturnType<typeof buildCutPlayerMenuSpec>): CutPlayerMenuItemSpec[] {
  return spec.flatMap((s) =>
    s.items.flatMap((i) => (i.kind === "submenu" && i.items ? [i, ...flattenItems([{ id: s.id, label: s.label, items: i.items }])] : [i])),
  );
}

describe("cutPlayerMenu", () => {
  it("builds all VLC/QT sections in order", () => {
    const spec = buildCutPlayerMenuSpec();
    expect(spec.map((s) => s.id)).toEqual([
      "app", "file", "edit", "playback", "audio", "video", "subtitle", "view", "window", "tools", "help",
    ]);
  });

  it("File menu has Open, exports and import with required accelerators", () => {
    const file = buildCutPlayerMenuSpec().find((s) => s.id === "file")!;
    const byId = Object.fromEntries(flattenItems([file]).map((i) => [i.id, i]));
    expect(byId.file_open.accelerator).toBe("CmdOrCtrl+O");
    expect(byId.file_export_srt.accelerator).toBe("CmdOrCtrl+S");
    expect(byId.file_import_srt.accelerator).toBe("CmdOrCtrl+Shift+O");
    expect(byId.file_export_json.accelerator).toBeUndefined();
  });

  it("View menu announces Chat disabled (separate module, Bell №2/№4)", () => {
    const view = buildCutPlayerMenuSpec().find((s) => s.id === "view")!;
    const byId = Object.fromEntries(view.items.map((i) => [i.id, i]));
    expect(byId.view_playlist.accelerator).toBe("CmdOrCtrl+L");
    expect(byId.view_chat.enabled).toBe(false);
    expect(byId.view_chat.accelerator).toBeUndefined();
    expect(byId.view_chat.label).toMatch(/soon/);
  });

  it("all soon-stubs are disabled, working items stay enabled (Bell №4)", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    const disabled = [
      "file_import_project", "file_import_markers_xml", "file_export_otio", "file_screenshot",
      "pb_jump", "audio_device", "audio_device_default",
      "video_aspect", "video_aspect_fit", "video_aspect_16_9", "video_aspect_4_3",
      "sub_track", "sub_track_next", "sub_delay", "sub_style",
      "view_chat", "view_markers", "view_theme", "view_theme_dark", "view_theme_light",
      "win_chat", "win_media_info", "win_task_board",
      "tools_lm_chat", "tools_lm_playlist", "tools_lm_nle", "tools_lm_thalamus",
      "tools_lm_index",
      "tools_mcp", "tools_convert",
    ];
    for (const id of disabled) {
      expect(byId[id], `stub not disabled: ${id}`).toBeDefined();
      expect(byId[id].enabled, `stub enabled: ${id}`).toBe(false);
    }
    const enabled = [
      "file_open", "file_export_srt", "file_export_json", "file_export_xml",
      "file_export_playlist_xml", "file_export_playlist_srt", "file_export_playlist_json", "file_export_playlist_review_notes", "file_export_playlist_visual_notes", "file_export_playlist_editor", "file_export_playlist_edl", "file_export_review_notes", "file_export_visual_notes", "file_export_edl", "file_send_to_editor",
      "file_import_srt", "edit_undo", "edit_redo",
      "edit_clear_comments", "edit_clear_favorites", "edit_clear_negatives",
      "edit_clear_inout", "edit_clear_all",
      "pb_play_pause", "pb_loop", "audio_mute",
      "video_fullscreen", "sub_file", "sub_show", "sub_remove", "view_playlist", "win_playlist",
      "win_comments", "win_bring_front", "help_about", "help_feedback", "help_github", "help_releases",
      "app_about", "app_updates",
    ];
    for (const id of enabled) {
      expect(byId[id], `missing: ${id}`).toBeDefined();
      expect(byId[id].enabled ?? true, `working item disabled: ${id}`).toBe(true);
    }
  });

  it("Edit Undo/Redo are custom marker-history actions, not native (0.20)", () => {    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.edit_undo.action).toBe("undo");
    expect(byId.edit_redo.action).toBe("redo");
    expect(byId.edit_undo.kind).not.toBe("predefined");
    expect(byId.edit_redo.kind).not.toBe("predefined");
    // Без accelerator: ⌘Z ловит DOM-хендлер с typing-guard, иначе двойной откат.
    expect(byId.edit_undo.accelerator).toBeUndefined();
    expect(byId.edit_redo.accelerator).toBeUndefined();
  });

  it("tb_1791566368_28503_1: Edit несёт нативный clipboard (⌘X/C/V/A в webview)", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.edit_cut.kind).toBe("predefined");
    expect(byId.edit_cut.predefined).toBe("Cut");
    expect(byId.edit_copy.predefined).toBe("Copy");
    expect(byId.edit_paste.predefined).toBe("Paste");
    expect(byId.edit_select_all.predefined).toBe("SelectAll");
    for (const id of ["edit_cut", "edit_copy", "edit_paste", "edit_select_all"]) {
      expect(byId[id].enabled ?? true, `clipboard item disabled: ${id}`).toBe(true);
    }
  });

  it("tb_1791346290_38729_4: Load Module — весь soon до готовности облака (Bell №4)", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.tools_lm_index.action).toBe("load_module_index");
    expect(byId.tools_lm_index.enabled ?? true).toBe(false);
    expect(byId.tools_lm_index.label).toMatch(/soon/);
    expect(byId.win_module_review.action).toBe("module_review_panel");
    expect(byId.win_module_review.enabled ?? true).toBe(true);
  });

  it("Send to editor — свой action send_editor_package, не алиас XML", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.file_send_to_editor.action).toBe("send_editor_package");
  });

  it("tb_1791568755_28503_2: Export — два подменю, в Playlist нет слова Playlist", () => {
    const file = buildCutPlayerMenuSpec().find((s) => s.id === "file")!;
    const exportMenu = file.items.find((i) => i.id === "file_export")!;
    expect(exportMenu.kind).toBe("submenu");
    const subIds = (exportMenu.items ?? []).map((i) => i.id);
    expect(subIds).toEqual(["file_export_current", "file_export_playlist"]);
    const byId = Object.fromEntries(
      (exportMenu.items ?? []).flatMap((s) => s.items ?? []).map((i) => [i.id, i]),
    );
    // Сингл-пункты не тронуты: те же id, action, акселератор.
    expect(byId.file_export_srt.action).toBe("export_srt");
    expect(byId.file_export_srt.accelerator).toBe("CmdOrCtrl+S");
    expect(byId.file_export_xml.action).toBe("export_xml");
    // Живой пункт плейлиста — только Timeline XML; в подписях нет «Playlist».
    expect(byId.file_export_playlist_xml.action).toBe("export_playlist_xml");
    expect(byId.file_export_playlist_xml.enabled ?? true).toBe(true);
    for (const item of Object.values(byId) as CutPlayerMenuItemSpec[]) {
      if (item.id.startsWith("file_export_playlist_")) {
        expect(item.label, `лишнее слово в ${item.id}`).not.toMatch(/playlist/i);
      }
    }
    // Названия типов совпадают с синглом один в один (модуль soon-суффикса).
    const stripSoon = (l: string) => l.replace(/ *\(soon\) *$/, "");
    expect(stripSoon(byId.file_export_playlist_review_notes.label)).toBe("Review Notes (.txt)…");
    expect(stripSoon(byId.file_export_playlist_visual_notes.label)).toBe("Visual Review Notes (frames)…");
    expect(stripSoon(byId.file_export_playlist_edl.label)).toBe("Markers (EDL, DaVinci)…");
  });

  it("Edit → Clear submenu: по видам + всё (0.21)", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.edit_clear_comments.action).toBe("clear_comments");
    expect(byId.edit_clear_favorites.action).toBe("clear_favorites");
    expect(byId.edit_clear_negatives.action).toBe("clear_negatives");
    expect(byId.edit_clear_inout.action).toBe("clear_inout");
    expect(byId.edit_clear_all.action).toBe("clear_all_markers");
  });

  it("Window menu has Media Info accelerator, Video has Fullscreen, File has Screenshot", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.win_media_info.accelerator).toBe("CmdOrCtrl+I");
    expect(byId.video_fullscreen.accelerator).toBe("CmdOrCtrl+F");
    expect(byId.file_screenshot.accelerator).toBe("CmdOrCtrl+Shift+S");
  });

  it("Preferences… removed until settings exist (no dead buttons, Bell №4)", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.app_prefs).toBeUndefined();
  });

  it("HIG: updates live under product name, Help keeps releases link", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.app_updates.action).toBe("updates");
    expect(byId.help_releases.action).toBe("releases");
    expect(byId.help_updates).toBeUndefined();
    const help = spec.find((s) => s.id === "help")!;
    const helpById = Object.fromEntries(flattenItems([help]).map((i) => [i.id, i]));
    expect(helpById.help_feedback.action).toBe("feedback");
    expect(helpById.help_github.action).toBe("github");
    expect(helpById.help_releases.action).toBe("releases");
    expect(helpById.help_about.action).toBe("about");
  });

  // tb_1791156671_82609_1: Subtitle → Show (чекбокс текстом) + Remove, без хоткеев.
  it("Subtitle menu exposes show/remove without hotkeys", () => {
    for (const visible of [true, false, undefined]) {
      const spec = buildCutPlayerMenuSpec({ subtitlesVisible: visible });
      const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
      expect(byId.sub_show.action).toBe("subtitle_show");
      expect(byId.sub_remove.action).toBe("subtitle_remove");
      expect(byId.sub_show.accelerator).toBeUndefined();
      expect(byId.sub_remove.accelerator).toBeUndefined();
      expect(byId.sub_show.label).toBe(visible ? "✓ Show Subtitles" : "Show Subtitles");
    }
    // Дефолт без opts — как раньше (старые вызовы не ломаются).
    const plain = Object.fromEntries(flattenItems(buildCutPlayerMenuSpec()).map((i) => [i.id, i]));
    expect(plain.sub_show.label).toBe("Show Subtitles");
  });

  it("Mute appears only in Audio menu", () => {
    const spec = buildCutPlayerMenuSpec();
    for (const section of spec) {
      const muteItems = flattenItems([section]).filter((i) => i.action === "mute");
      if (section.id === "audio") {
        expect(muteItems).toHaveLength(1);
      } else {
        expect(muteItems).toHaveLength(0);
      }
    }
  });

  it("markers I/O/M/N/⇧M do not conflict with NLE-only keys", () => {
    const spec = buildCutPlayerMenuSpec();
    const accelerators = flattenItems(spec).map((i) => i.accelerator).filter(Boolean);
    for (const acc of accelerators) {
      expect(isNleOnlyAccelerator(acc), `NLE-only conflict: ${acc}`).toBe(false);
    }
  });

  it("accelerators are unique across the whole menu", () => {
    const spec = buildCutPlayerMenuSpec();
    const accelerators = flattenItems(spec).map((i) => i.accelerator).filter(Boolean);
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  it("every item has a stable id and every non-predefined non-submenu item has an action", () => {
    for (const section of buildCutPlayerMenuSpec()) {
      for (const item of flattenItems([section])) {
        expect(item.id).toMatch(/^[a-z0-9_]+$/);
        if (item.kind !== "predefined" && item.kind !== "submenu") {
          expect(item.action, `missing action for ${item.id}`).toBeDefined();
        }
      }
    }
  });

  it("isNleOnlyAccelerator detects reserved keys", () => {
    expect(isNleOnlyAccelerator("CmdOrCtrl+K")).toBe(true);
    expect(isNleOnlyAccelerator("CmdOrCtrl+1")).toBe(true);
    expect(isNleOnlyAccelerator("CmdOrCtrl+O")).toBe(false);
    expect(isNleOnlyAccelerator(undefined)).toBe(false);
  });
});