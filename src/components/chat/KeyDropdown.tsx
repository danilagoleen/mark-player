// @ts-nocheck
// TODO (chat-extract): VETKA-specific imports — adapter required:
//   ../../store/useStore        → @vetka/adapter-store
//   ../../store/useDevPanelStore → @vetka/adapter-store
//   ../../config/api.config     → @vetka/adapter-config
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useDevPanelStore } from '../../store/useDevPanelStore';
// MARKER_176.15: Centralized MCC API config import.
import { DEBUG_API } from '../../config/api.config';

interface BalanceRecord {
  provider: string;
  key_masked: string;
  balance_usd: number | null;
  exhausted: boolean;
}

interface BalancesResponse {
  success?: boolean;
  records?: BalanceRecord[];
}


function formatUsd(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '--';
  return `$${value.toFixed(2)}`;
}

export function KeyDropdown() {
  const setActiveTab = useDevPanelStore(s => s.setActiveTab);
  const selectedKey = useStore(s => s.selectedKey);
  const setSelectedKey = useStore(s => s.setSelectedKey);
  const clearSelectedKey = useStore(s => s.clearSelectedKey);
  const favoriteKeys = useStore(s => s.favoriteKeys);
  const toggleFavoriteKey = useStore(s => s.toggleFavoriteKey);

  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<BalanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, BalanceRecord>();
    for (const r of records) {
      const key = `${r.provider}:${r.key_masked}`;
      if (!map.has(key)) map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aFavId = `${a.provider.toLowerCase().trim()}:${a.key_masked}`;
      const bFavId = `${b.provider.toLowerCase().trim()}:${b.key_masked}`;
      const aFav = favoriteKeys.includes(aFavId) ? 0 : 1;
      const bFav = favoriteKeys.includes(bFavId) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      if (a.exhausted !== b.exhausted) return a.exhausted ? 1 : -1;
      return a.provider.localeCompare(b.provider);
    });
  }, [records, favoriteKeys]);

  const selectedBalance = useMemo(() => {
    if (!selectedKey) return null;
    return grouped.find(
      r => r.provider === selectedKey.provider && r.key_masked === selectedKey.key_masked
    ) || null;
  }, [grouped, selectedKey]);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${DEBUG_API}/usage/balances`);
      if (!res.ok) return;
      const data: BalancesResponse = await res.json();
      if (data.success && Array.isArray(data.records)) {
        setRecords(data.records);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalances();
    const onVisibility = () => {
      if (!document.hidden) fetchBalances();
    };
    window.addEventListener('task-board-updated', fetchBalances as EventListener);
    window.addEventListener('pipeline-stats', fetchBalances as EventListener);
    window.addEventListener('focus', fetchBalances);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('task-board-updated', fetchBalances as EventListener);
      window.removeEventListener('pipeline-stats', fetchBalances as EventListener);
      window.removeEventListener('focus', fetchBalances);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchBalances]);

  useEffect(() => {
    if (open) fetchBalances();
  }, [open, fetchBalances]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const buttonLabel = selectedKey
    ? `${selectedKey.provider}`
    : 'auto';
  const buttonBalance = selectedBalance?.balance_usd ?? null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: open ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: '1px solid #333',
          borderRadius: 3,
          color: '#ddd',
          fontSize: 10,
          fontFamily: 'monospace',
          cursor: 'pointer',
          minWidth: 130,
        }}
        title="API key selector for dispatch"
      >
        <span>🔑</span>
        <span style={{ maxWidth: 66, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {buttonLabel}
        </span>
        <span style={{ color: '#888' }}>{formatUsd(buttonBalance)}</span>
        <span style={{ marginLeft: 'auto', color: '#666' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 2,
            width: 300,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            fontFamily: 'monospace',
          }}
        >
          <div style={{ padding: '7px 10px', fontSize: 9, color: '#777', borderBottom: '1px solid #222' }}>
            api keys
          </div>

          <button
            onClick={() => {
              clearSelectedKey();
              setOpen(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #1b1b1b',
              color: !selectedKey ? '#4ecdc4' : '#aaa',
              padding: '8px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            auto-select key
          </button>

          {loading && grouped.length === 0 && (
            <div style={{ padding: '10px', fontSize: 10, color: '#777' }}>loading...</div>
          )}
          {!loading && grouped.length === 0 && (
            <div style={{ padding: '10px', fontSize: 10, color: '#777' }}>No usage records</div>
          )}

          {grouped.map(record => {
            const favKeyId = `${record.provider.toLowerCase().trim()}:${record.key_masked}`;
            const isFavorite = favoriteKeys.includes(favKeyId);
            const isSelected = selectedKey?.provider === record.provider
              && selectedKey?.key_masked === record.key_masked;
            return (
              <button
                key={`${record.provider}-${record.key_masked}`}
                onClick={() => {
                  setSelectedKey({ provider: record.provider, key_masked: record.key_masked });
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: isSelected ? 'rgba(78,205,196,0.15)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #1b1b1b',
                  color: record.exhausted ? '#666' : '#ddd',
                  padding: '8px 10px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: record.exhausted ? '#666' : '#4ecdc4' }} />
                <span style={{ minWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {record.provider}
                </span>
                <span style={{ color: '#888', minWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {record.key_masked}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteKey(favKeyId);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isFavorite ? '#ddd' : '#666',
                    cursor: 'pointer',
                    padding: '0 4px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                  }}
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {isFavorite ? '★' : '☆'}
                </span>
                <span style={{ marginLeft: 'auto', color: '#999' }}>
                  {formatUsd(record.balance_usd)}
                </span>
              </button>
            );
          })}

          <div style={{ padding: 8, borderTop: '1px solid #1b1b1b' }}>
            <button
              onClick={() => {
                setOpen(false);
                setActiveTab('balance');
              }}
              style={{
                width: '100%',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 3,
                color: '#bbb',
                padding: '5px 8px',
                fontSize: 10,
                fontFamily: 'monospace',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              View all {'->'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
