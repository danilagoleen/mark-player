// Шаг 4/7 — ModuleDoor: достижимость точек бэкенда player-lab.
//
// Дверей три: probe, export-media, accurate-fps. Каждая висит на своём
// endpoint под API base. Классификация честная и минимальная:
//   - fetch бросил сетевую ошибку (connection refused) → missing:
//     сервер не поднят, дверь предлагает скачку+автостарт;
//   - пришёл любой HTTP-ответ (200..599) → available: сервер жив,
//     семантику конкретного endpoint решает вызывающий;
//   - abort/timeout → error: узел есть, но не отвечает.
//
// Клик по missing переводит дверь в downloading и запускает перепроверку
// (скачивание бинарника + старт выполняет внешний раннер; дверь его
// обнаруживает появлением сервера). Клик по error — повторная попытка.
// Клик по available/downloading — no-op.

export type DoorId = "probe" | "export-media" | "accurate-fps";

export type DoorStatus = "available" | "missing" | "downloading" | "error";

export interface ModuleDoor {
  id: DoorId;
  endpoint: string;
  status: DoorStatus;
  /** Человекочитаемая деталь: "http 404", "connection refused", ... */
  detail: string | null;
}

export const DOOR_ENDPOINTS: Record<DoorId, string> = {
  probe: "/player/probe",
  "export-media": "/player/export-media",
  "accurate-fps": "/player/accurate-fps",
};

export const DOOR_IDS: DoorId[] = ["probe", "export-media", "accurate-fps"];

export function doorEndpoint(id: DoorId, apiBase: string): string {
  return `${apiBase.replace(/\/$/, "")}${DOOR_ENDPOINTS[id]}`;
}

type FetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number }>;

export async function checkModuleDoor(
  id: DoorId,
  apiBase: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<ModuleDoor> {
  const endpoint = doorEndpoint(id, apiBase);
  try {
    const response = await fetchImpl(endpoint, { method: "GET" });
    return {
      id,
      endpoint,
      status: "available",
      detail: `http ${response.status}`,
    };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return {
        id,
        endpoint,
        status: "error",
        detail: `request ${name === "AbortError" ? "aborted" : "timed out"}`,
      };
    }
    return {
      id,
      endpoint,
      status: "missing",
      detail: error instanceof Error ? error.message : "connection refused",
    };
  }
}

/** Поведение клика по двери (фиксировано тестами, Шаг 4/7). */
export function doorClickTransition(door: ModuleDoor): ModuleDoor {
  if (door.status === "missing" || door.status === "error") {
    return { ...door, status: "downloading", detail: "download+autostart requested" };
  }
  return door;
}

const DOOR_LABELS: Record<DoorId, string> = {
  probe: "probe",
  "export-media": "export-media",
  "accurate-fps": "accurate-fps",
};

const DOOR_STATUS_LABELS: Record<DoorStatus, string> = {
  available: "up",
  missing: "missing — click to fetch+start",
  downloading: "fetching…",
  error: "unreachable",
};

export function doorLabel(door: ModuleDoor): string {
  return `${DOOR_LABELS[door.id]}: ${DOOR_STATUS_LABELS[door.status]}`;
}
