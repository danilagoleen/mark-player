export type PanelRoute = "player" | "chat" | "chat-history" | "phonebook" | "comments";

const ROUTES: Record<string, PanelRoute> = {
  "chat": "chat",
  "chat-history": "chat-history",
  "phonebook": "phonebook",
  "comments": "comments",
};

export function getPanelRoute(): PanelRoute {
  if (typeof window === "undefined") return "player";
  const path = window.location.pathname.replace(/^\//, "");
  return ROUTES[path] ?? "player";
}

export type PanelRegistration = {
  label: string;
  route: string;
  title: string;
  width: number;
  height: number;
};

export const PANEL_REGISTRATIONS: Record<PanelRoute, PanelRegistration | null> = {
  player: null,
  chat: { label: "panel-chat", route: "chat", title: "Chat", width: 380, height: 560 },
  "chat-history": { label: "panel-chat-history", route: "chat-history", title: "Chat History", width: 420, height: 560 },
  phonebook: { label: "panel-phonebook", route: "phonebook", title: "Model Directory", width: 400, height: 560 },
  comments: { label: "panel-comments", route: "comments", title: "Comments", width: 360, height: 480 },
};

export const PANEL_LABEL_PREFIX = "panel-";
