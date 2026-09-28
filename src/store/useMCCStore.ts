import { create } from "zustand";

export interface MCCSelectedKey {
  provider: string;
  key_masked: string;
}

interface MCCState {
  selectedKey: MCCSelectedKey | null;
  favoriteKeys: string[];
  favoriteModels: string[];
  favoriteModelNames: Record<string, string>;
  setSelectedKey: (key: MCCSelectedKey | null) => void;
  toggleFavoriteKey: (key: string) => void;
  toggleFavoriteModel: (modelId: string, modelName?: string) => void;
  loadFavorites: () => Promise<void>;
}

const SELECTED_KEY_KEY = "mcc_selected_key";
const FAVORITE_KEYS_KEY = "mcc_favorite_keys";
const FAVORITE_MODELS_KEY = "mcc_favorite_models";
const FAVORITE_MODEL_NAMES_KEY = "mcc_favorite_model_names";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

export const useMCCStore = create<MCCState>((set, get) => ({
  selectedKey: loadFromStorage<MCCSelectedKey | null>(SELECTED_KEY_KEY, null),
  favoriteKeys: loadFromStorage<string[]>(FAVORITE_KEYS_KEY, []),
  favoriteModels: loadFromStorage<string[]>(FAVORITE_MODELS_KEY, []),
  favoriteModelNames: loadFromStorage<Record<string, string>>(FAVORITE_MODEL_NAMES_KEY, {}),

  setSelectedKey: (key) => {
    saveToStorage(SELECTED_KEY_KEY, key);
    set({ selectedKey: key });
  },

  toggleFavoriteKey: (key) => {
    const current = get().favoriteKeys;
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    saveToStorage(FAVORITE_KEYS_KEY, next);
    set({ favoriteKeys: next });
    fetch("/api/favorites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: next, models: get().favoriteModels }),
    }).catch(() => {});
  },

  toggleFavoriteModel: (modelId, modelName) => {
    const current = get().favoriteModels;
    const names = { ...get().favoriteModelNames };
    const isAdding = !current.includes(modelId);
    const next = isAdding
      ? [...current, modelId]
      : current.filter((m) => m !== modelId);
    if (isAdding && modelName) {
      names[modelId] = modelName;
    } else if (!isAdding) {
      delete names[modelId];
    }
    saveToStorage(FAVORITE_MODELS_KEY, next);
    saveToStorage(FAVORITE_MODEL_NAMES_KEY, names);
    set({ favoriteModels: next, favoriteModelNames: names });
    fetch("/api/favorites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: get().favoriteKeys, models: next }),
    }).catch(() => {});
  },

  loadFavorites: async () => {
    try {
      const res = await fetch("/api/favorites");
      if (res.ok) {
        const data = await res.json();
        const keys = data.keys || [];
        const models = data.models || [];
        saveToStorage(FAVORITE_KEYS_KEY, keys);
        saveToStorage(FAVORITE_MODELS_KEY, models);
        set({ favoriteKeys: keys, favoriteModels: models });
      }
    } catch { }
  },
}));
