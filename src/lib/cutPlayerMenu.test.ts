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
      "file_import_project", "file_export_otio", "file_screenshot",
      "pb_jump", "audio_device", "audio_device_default",
      "video_aspect", "video_aspect_fit", "video_aspect_16_9", "video_aspect_4_3",
      "sub_track", "sub_track_next", "sub_delay", "sub_style",
      "view_chat", "view_markers", "view_theme", "view_theme_dark", "view_theme_light",
      "win_chat", "win_media_info", "win_task_board", "win_bring_front",
      "tools_lm_chat", "tools_lm_playlist", "tools_lm_nle", "tools_lm_thalamus",
      "tools_mcp", "tools_convert",
    ];
    for (const id of disabled) {
      expect(byId[id], `stub not disabled: ${id}`).toBeDefined();
      expect(byId[id].enabled, `stub enabled: ${id}`).toBe(false);
    }
    const enabled = [
      "file_open", "file_export_srt", "file_export_json", "file_export_xml",
      "file_export_playlist_xml", "file_export_review_notes", "file_export_visual_notes", "file_export_edl", "file_send_to_editor",
      "file_import_srt", "file_import_markers_xml", "edit_undo", "edit_redo",
      "edit_clear_comments", "edit_clear_favorites", "edit_clear_negatives",
      "edit_clear_inout", "edit_clear_all",
      "pb_play_pause", "pb_loop", "audio_mute",
      "video_fullscreen", "sub_file", "view_playlist", "win_playlist",
      "win_comments", "help_about", "help_feedback", "help_github", "help_updates",
      "app_about",
    ];
    for (const id of enabled) {
      expect(byId[id], `missing: ${id}`).toBeDefined();
      expect(byId[id].enabled ?? true, `working item disabled: ${id}`).toBe(true);
    }
  });

  it("Edit Undo/Redo are custom marker-history actions, not native (0.20)", () => {
    const spec = buildCutPlayerMenuSpec();
    const byId = Object.fromEntries(flattenItems(spec).map((i) => [i.id, i]));
    expect(byId.edit_undo.action).toBe("undo");
    expect(byId.edit_redo.action).toBe("redo");
    expect(byId.edit_undo.kind).not.toBe("predefined");
    expect(byId.edit_redo.kind).not.toBe("predefined");
    // Без accelerator: ⌘Z ловит DOM-хендлер с typing-guard, иначе двойной откат.
    expect(byId.edit_undo.accelerator).toBeUndefined();
    expect(byId.edit_redo.accelerator).toBeUndefined();
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

  it("Help exposes feedback/github/updates actions (About task)", () => {
    const help = buildCutPlayerMenuSpec().find((s) => s.id === "help")!;
    const byId = Object.fromEntries(flattenItems([help]).map((i) => [i.id, i]));
    expect(byId.help_feedback.action).toBe("feedback");
    expect(byId.help_github.action).toBe("github");
    expect(byId.help_updates.action).toBe("updates");
    expect(byId.help_about.action).toBe("about");
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