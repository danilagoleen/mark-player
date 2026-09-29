export type CutPlayerMenuAction =
  | "open"
  | "undo"
  | "redo"
  | "clear_comments"
  | "clear_favorites"
  | "clear_negatives"
  | "clear_inout"
  | "clear_all_markers"
  | "open_folder"
  | "open_playlist_file"
  | "save_playlist_file"
  | "export_srt"
  | "export_json"
  | "export_xml"
  | "export_playlist_xml"
  | "export_review_notes"
  | "export_visual_notes"
  | "import_srt"
  | "import_markers_json"
  | "screenshot"
  | "playlist"
  | "chat"
  | "media_info"
  | "fullscreen"
  | "mute"
  | "volume_up"
  | "volume_down"
  | "audio_track_next"
  | "audio_device"
  | "play_pause"
  | "stop"
  | "frame_step_back"
  | "frame_step_forward"
  | "jump_to_time"
  | "speed_0_5"
  | "speed_1"
  | "speed_1_5"
  | "speed_2"
  | "loop_toggle"
  | "mark_in"
  | "mark_out"
  | "favorite"
  | "comment"
  | "negative"
  | "cycle_quality"
  | "float_on_top"
  | "aspect_ratio"
  | "subtitle_file"
  | "subtitle_track"
  | "subtitle_delay"
  | "subtitle_style"
  | "show_controls"
  | "show_markers_panel"
  | "show_comments"
  | "always_on_top"
  | "theme"
  | "playlist_panel"
  | "chat_panel"
  | "phonebook_panel"
  | "chat_history_panel"
  | "comments_panel"
  | "task_board"
  | "minimize"
  | "zoom"
  | "bring_all_front"
  | "load_module_chat"
  | "load_module_playlist"
  | "load_module_nle"
  | "load_module_thalamus"
  | "mcp_status"
  | "convert_transcode"
  | "export_edl"
  | "export_otio"
  | "help"
  | "shortcuts"
  | "about"
  | "feedback"
  | "github"
  | "updates";

export type CutPlayerMenuActionHandler = (action: CutPlayerMenuAction) => void;

import type { MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";

export interface CutPlayerMenuItemSpec {
  id: string;
  label: string;
  action?: CutPlayerMenuAction;
  accelerator?: string;
  separatorBefore?: boolean;
  // Bell №4: false = visible but greyed (soon-stub). Default true.
  enabled?: boolean;
  kind?: "item" | "predefined" | "submenu";
  predefined?: "About" | "Hide" | "Quit" | "Separator" | "Undo" | "Redo" | "Cut" | "Copy" | "Paste" | "SelectAll";
  items?: CutPlayerMenuItemSpec[];
}

export interface CutPlayerMenuSectionSpec {
  id: string;
  label: string;
  items: CutPlayerMenuItemSpec[];
}

const NLE_ONLY_KEYS = [",", ".", "F9", "F10", "F11", "F12", "C", "B", "V", "A", "Q", "W", "ArrowUp", "ArrowDown", "CmdOrCtrl+K", "CmdOrCtrl+1", "CmdOrCtrl+2", "CmdOrCtrl+3", "CmdOrCtrl+4", "CmdOrCtrl+5", "Y", "U", "R", "H", "Z"];

export function buildCutPlayerMenuSpec(): CutPlayerMenuSectionSpec[] {
  return [
    {
      id: "app",
      label: "Mark Player",
      items: [
        // About — наше окно (версия + кнопки), а не нативный диалог без кнопок.
        { id: "app_about", label: "About Mark Player", action: "about" },
        // Preferences убран: настроек нет, мёртвых кнопок не держим (Bell №4).
        // Вернуть когда появится первая настройка — вместе с CmdOrCtrl+,.
        { id: "app_hide", label: "Hide", kind: "predefined", predefined: "Hide", separatorBefore: true },
        { id: "app_quit", label: "Quit", kind: "predefined", predefined: "Quit", separatorBefore: true },
      ],
    },
    {
      id: "file",
      label: "File",
      items: [
        { id: "file_open", label: "Open File…", action: "open", accelerator: "CmdOrCtrl+O" },
        { id: "file_open_folder", label: "Open Folder…", action: "open_folder" },
        { id: "file_open_playlist", label: "Open Playlist…", action: "open_playlist_file" },
        { id: "file_save_playlist", label: "Save Playlist…", action: "save_playlist_file" },
        { id: "file_import", label: "Import", kind: "submenu", separatorBefore: true, items: [
          { id: "file_import_srt", label: "Subtitles (SRT)…", action: "import_srt", accelerator: "CmdOrCtrl+Shift+O" },
          { id: "file_import_markers", label: "Markers (JSON)…", action: "import_markers_json" },
          { id: "file_import_project", label: "Project… (NLE — soon)", action: "export_otio", enabled: false },
        ] },
        { id: "file_export", label: "Export", kind: "submenu", items: [
          { id: "file_export_srt", label: "Subtitles (SRT)…", action: "export_srt", accelerator: "CmdOrCtrl+S" },
          { id: "file_export_json", label: "Markers (JSON/SOS)…", action: "export_json" },
          { id: "file_export_xml", label: "Timeline (XML)…", action: "export_xml" },
          { id: "file_export_playlist_xml", label: "Playlist Timeline (XML)…", action: "export_playlist_xml" },
          { id: "file_export_review_notes", label: "Review Notes (.txt)…", action: "export_review_notes" },
          { id: "file_export_visual_notes", label: "Visual Review Notes (frames)…", action: "export_visual_notes" },
          { id: "file_send_to_editor", label: "Send to editor…", action: "export_playlist_xml" },
          { id: "file_export_edl", label: "EDL… (NLE)", action: "export_edl", enabled: false },
          { id: "file_export_otio", label: "OTIO/CUT Project… (NLE)", action: "export_otio", enabled: false },
        ] },
        { id: "file_screenshot", label: "Take Screenshot (soon)", action: "screenshot", accelerator: "CmdOrCtrl+Shift+S", separatorBefore: true, enabled: false },
        { id: "file_quit", label: "Quit", kind: "predefined", predefined: "Quit", separatorBefore: true },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        // 0.20: свои Undo/Redo поверх истории маркеров (нативные правили
        // бы только текст в фокусе). Без accelerator: ⌘Z ловит DOM-хендлер
        // с typing-guard (в инпутах остаётся нативный undo), иначе был бы
        // двойной откат — меню-акселератор плюс keydown.
        { id: "edit_undo", label: "Undo", action: "undo" },
        { id: "edit_redo", label: "Redo", action: "redo" },
        // 0.21: Clear по видам (фидбэк оператора). Confirm с разбивкой +
        // undo-стек — в performClearMarkers, здесь только спецификация.
        { id: "edit_clear", label: "Clear", kind: "submenu", separatorBefore: true, items: [
          { id: "edit_clear_comments", label: "Clear Comments", action: "clear_comments" },
          { id: "edit_clear_favorites", label: "Clear Favorites", action: "clear_favorites" },
          { id: "edit_clear_negatives", label: "Clear Negatives", action: "clear_negatives" },
          { id: "edit_clear_inout", label: "Clear In & Out", action: "clear_inout" },
          { id: "edit_clear_all", label: "Clear All Markers", action: "clear_all_markers", separatorBefore: true },
        ] },
        { id: "edit_markers", label: "Markers", kind: "submenu", separatorBefore: true, items: [
          { id: "edit_mark_in", label: "Mark In", action: "mark_in" },
          { id: "edit_mark_out", label: "Mark Out", action: "mark_out" },
          { id: "edit_favorite", label: "Add Favorite", action: "favorite", separatorBefore: true },
          { id: "edit_comment", label: "Add Comment", action: "comment" },
          { id: "edit_negative", label: "Add Negative", action: "negative" },
        ] },
      ],
    },
    {
      id: "playback",
      label: "Playback",
      items: [
        { id: "pb_play_pause", label: "Play/Pause", action: "play_pause" },
        { id: "pb_stop", label: "Stop", action: "stop" },
        { id: "pb_frame_back", label: "Frame Step Back", action: "frame_step_back", separatorBefore: true },
        { id: "pb_frame_forward", label: "Frame Step Forward", action: "frame_step_forward" },
        { id: "pb_jump", label: "Jump to Time… (soon)", action: "jump_to_time", separatorBefore: true, enabled: false },
        { id: "pb_speed", label: "Speed", kind: "submenu", items: [
          { id: "pb_speed_05", label: "0.5x", action: "speed_0_5" },
          { id: "pb_speed_1", label: "1x", action: "speed_1" },
          { id: "pb_speed_15", label: "1.5x", action: "speed_1_5" },
          { id: "pb_speed_2", label: "2x", action: "speed_2" },
        ] },
        { id: "pb_loop", label: "Loop / Repeat", action: "loop_toggle", separatorBefore: true },
      ],
    },
    {
      id: "audio",
      label: "Audio",
      items: [
        { id: "audio_track", label: "Audio Track", kind: "submenu", items: [
          { id: "audio_track_next", label: "Next Track", action: "audio_track_next" },
        ] },
        { id: "audio_volume_up", label: "Volume Up", action: "volume_up" },
        { id: "audio_volume_down", label: "Volume Down", action: "volume_down" },
        { id: "audio_mute", label: "Mute", action: "mute", separatorBefore: true },
        { id: "audio_device", label: "Audio Device (soon)", kind: "submenu", separatorBefore: true, enabled: false, items: [
          { id: "audio_device_default", label: "Default (system)", action: "audio_device", enabled: false },
        ] },
      ],
    },
    {
      id: "video",
      label: "Video",
      items: [
        { id: "video_fullscreen", label: "Full Screen", action: "fullscreen", accelerator: "CmdOrCtrl+F" },
        { id: "video_float", label: "Float on Top", action: "float_on_top" },
        { id: "video_aspect", label: "Aspect Ratio (soon)", kind: "submenu", separatorBefore: true, enabled: false, items: [
          { id: "video_aspect_fit", label: "Fit", action: "aspect_ratio", enabled: false },
          { id: "video_aspect_16_9", label: "16:9", action: "aspect_ratio", enabled: false },
          { id: "video_aspect_4_3", label: "4:3", action: "aspect_ratio", enabled: false },
        ] },
        { id: "video_quality", label: "Cycle Quality", action: "cycle_quality" },
      ],
    },
    {
      id: "subtitle",
      label: "Subtitle",
      items: [
        { id: "sub_file", label: "Add Subtitle File…", action: "subtitle_file" },
        { id: "sub_track", label: "Subtitle Track (soon)", kind: "submenu", separatorBefore: true, enabled: false, items: [
          { id: "sub_track_next", label: "Next Track", action: "subtitle_track", enabled: false },
        ] },
        { id: "sub_delay", label: "Delay… (soon)", action: "subtitle_delay", enabled: false },
        { id: "sub_style", label: "Style / Size… (soon)", action: "subtitle_style", enabled: false },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { id: "view_playlist", label: "Show/Hide Playlist", action: "playlist", accelerator: "CmdOrCtrl+L" },
        { id: "view_chat", label: "Chat (AI module — soon)", action: "chat", enabled: false },
        { id: "view_controls", label: "Show/Hide Controls", action: "show_controls" },
        { id: "view_markers", label: "Show/Hide Markers Panel (soon)", action: "show_markers_panel", enabled: false },
        { id: "view_comments", label: "Show/Hide Comments", action: "show_comments" },
        { id: "view_ontop", label: "Always on Top", action: "always_on_top", separatorBefore: true },
        { id: "view_theme", label: "Theme (soon)", kind: "submenu", enabled: false, items: [
          { id: "view_theme_dark", label: "Dark (default)", action: "theme", enabled: false },
          { id: "view_theme_light", label: "Light", action: "theme", enabled: false },
        ] },
      ],
    },
    {
      id: "window",
      label: "Window",
      items: [
        { id: "win_minimize", label: "Minimize", action: "minimize" },
        { id: "win_zoom", label: "Zoom", action: "zoom" },
        { id: "win_playlist", label: "Playlist", action: "playlist_panel", separatorBefore: true },
        { id: "win_chat", label: "Chat (AI module — soon)", action: "chat_panel", enabled: false },
        { id: "win_comments", label: "Comments", action: "comments_panel" },
        { id: "win_media_info", label: "Media Information (soon)", action: "media_info", accelerator: "CmdOrCtrl+I", enabled: false },
        { id: "win_task_board", label: "Task Board (THALAMUS, soon)", action: "task_board", separatorBefore: true, enabled: false },
        { id: "win_bring_front", label: "Bring All to Front (soon)", action: "bring_all_front", enabled: false },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      items: [
        { id: "tools_load_module", label: "Load Module", kind: "submenu", items: [
          { id: "tools_lm_chat", label: "Chat Module (soon)", action: "load_module_chat", enabled: false },
          { id: "tools_lm_playlist", label: "Playlist / Scanner (soon)", action: "load_module_playlist", enabled: false },
          { id: "tools_lm_nle", label: "CUT NLE (soon)", action: "load_module_nle", enabled: false },
          { id: "tools_lm_thalamus", label: "THALAMUS Task Board (soon)", action: "load_module_thalamus", enabled: false },
        ] },
        { id: "tools_mcp", label: "MCP Status… (soon)", action: "mcp_status", separatorBefore: true, enabled: false },
        { id: "tools_convert", label: "Convert / Transcode… (soon)", action: "convert_transcode", enabled: false },
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        { id: "help_help", label: "CUT Player Help", action: "help" },
        { id: "help_shortcuts", label: "Keyboard Shortcuts", action: "shortcuts" },
        { id: "help_feedback", label: "Send Feedback…", action: "feedback", separatorBefore: true },
        { id: "help_github", label: "GitHub Repository", action: "github" },
        { id: "help_updates", label: "Check for Updates", action: "updates" },
        { id: "help_about", label: "About Mark Player", action: "about", separatorBefore: true },
      ],
    },
  ];
}

export function isNleOnlyAccelerator(accelerator: string | undefined): boolean {
  if (!accelerator) return false;
  const hasModifier = accelerator.includes("+");
  return NLE_ONLY_KEYS.some((key) => {
    if (key.includes("+")) return accelerator === key;
    return !hasModifier && accelerator === key;
  });
}

export async function applyCutPlayerMenu(onAction: CutPlayerMenuActionHandler): Promise<boolean> {
  try {
    const { Menu, Submenu, MenuItem, PredefinedMenuItem } = await import("@tauri-apps/api/menu");
    const sections = buildCutPlayerMenuSpec();
    const items: (Submenu | MenuItem | PredefinedMenuItem)[] = [];

    async function buildChildren(specItems: CutPlayerMenuItemSpec[]): Promise<(MenuItem | PredefinedMenuItem | Submenu)[]> {
      const children: (MenuItem | PredefinedMenuItem | Submenu)[] = [];
      for (const item of specItems) {
        if (item.separatorBefore) {
          children.push(await PredefinedMenuItem.new({ item: "Separator" }));
        }
        if (item.kind === "predefined") {
          if (item.predefined === "About") {
            children.push(await PredefinedMenuItem.new({ item: { About: null } }));
          } else if (item.predefined) {
            children.push(await PredefinedMenuItem.new({ item: item.predefined }));
          }
        } else if (item.kind === "submenu") {
          const subChildren = await buildChildren(item.items ?? []);
          children.push(await Submenu.new({ text: item.label, items: subChildren, enabled: item.enabled ?? true }));
        } else {
          children.push(await MenuItem.new({
            id: item.id,
            text: item.label,
            accelerator: item.accelerator,
            enabled: item.enabled ?? true,
            action: item.action ? () => onAction(item.action!) : undefined,
          }));
        }
      }
      return children;
    }

    for (const section of sections) {
      const sectionChildren = await buildChildren(section.items);
      items.push(await Submenu.new({ text: section.label, items: sectionChildren }));
    }
    const menu = await Menu.new({ items });
    await menu.setAsAppMenu();
    return true;
  } catch {
    return false;
  }
}