import { useEffect, useMemo, useState } from "react";
import { useMCCStore } from "../../store/useMCCStore";
import { DEBUG_API } from "../../config/api.config";

interface BalanceRecord {
  provider: string;
  key_masked: string;
  balance_usd: number | null;
  exhausted: boolean;
  cost_usd?: number;
  tokens_in?: number;
  tokens_out?: number;
}

function formatUsd(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "--";
  return `$${v.toFixed(2)}`;
}

export function BalancesPanel() {
  const selectedKey = useMCCStore((s) => s.selectedKey);
  const setSelectedKey = useMCCStore((s) => s.setSelectedKey);
  const favoriteKeys = useMCCStore((s) => s.favoriteKeys);
  const toggleFavoriteKey = useMCCStore((s) => s.toggleFavoriteKey);

  const [records, setRecords] = useState<BalanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${DEBUG_API}/usage/balances`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.records)) {
          setRecords(data.records);
        }
      } catch {
        // noop
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    const map = new Map<string, BalanceRecord>();
    for (const r of records) {
      const key = `${r.provider}:${r.key_masked}`;
      if (!map.has(key)) map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aFav = favoriteKeys.includes(`${a.provider}:${a.key_masked}`) ? 0 : 1;
      const bFav = favoriteKeys.includes(`${b.provider}:${b.key_masked}`) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      if (a.exhausted !== b.exhausted) return a.exhausted ? 1 : -1;
      return a.provider.localeCompare(b.provider);
    });
  }, [records, favoriteKeys]);

  return (
    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#e0e0e0" }}>
      <div style={{ color: "#888", fontSize: 10, marginBottom: 4 }}>
        keys: {sorted.length} {selectedKey ? `· active: ${selectedKey.provider}` : ""}
      </div>
      {loading && <div style={{ color: "#555" }}>loading...</div>}
      {!loading && sorted.length === 0 && <div style={{ color: "#555" }}>no records</div>}
      {sorted.map((r) => {
        const favId = `${r.provider}:${r.key_masked}`;
        const isFav = favoriteKeys.includes(favId);
        const isSelected = selectedKey?.provider === r.provider && selectedKey?.key_masked === r.key_masked;
        return (
          <div
            key={favId}
            onClick={() => setSelectedKey({ provider: r.provider, key_masked: r.key_masked })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              background: isSelected ? "rgba(255,255,255,0.06)" : "transparent",
              cursor: "pointer",
            }}
          >
            <span
              onClick={(e) => { e.stopPropagation(); toggleFavoriteKey(favId); }}
              style={{ cursor: "pointer", color: isFav ? "#e0c060" : "#555", width: 16, textAlign: "center" }}
            >
              {isFav ? "★" : "☆"}
            </span>
            <span style={{ fontWeight: isSelected ? 600 : 400, minWidth: 80 }}>{r.provider}</span>
            <span style={{ color: "#888", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.key_masked}
            </span>
            <span style={{ color: r.exhausted ? "#8a6a6a" : "#6a8a6a", textAlign: "right", minWidth: 50 }}>
              {formatUsd(r.balance_usd)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
