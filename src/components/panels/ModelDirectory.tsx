/**
 * ModelDirectory - Phone book style model selector with Telegram-like sidebar.
 * Displays cloud, local (Ollama), and MCP agent models with filtering and search.
 * Includes API key management drawer with smart auto-detection.
 *
 * @status active
 * @phase 96
 * @depends react, lucide-react
 * @used_by ChatPanel, ChatSidebar
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Phone, Zap, DollarSign, Crown, Cpu, Bot, Home, Key, ChevronDown, ChevronUp, ChevronRight, Mic, Volume2, Terminal, Eye, Layers, RefreshCw } from 'lucide-react';
import { useMCCStore } from '../../store/useMCCStore';

interface Model {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  description?: string;
  isLocal?: boolean;
  type?: string;  // Phase 60.5: local | cloud_free | cloud_paid | voice
  capabilities?: string[];  // Phase 60.5: tts | stt | code | chat | etc.
  // MARKER_112_MODEL_SOURCE: Source tracking for multi-provider models
  source?: 'direct' | 'openrouter' | 'polza' | 'poe' | 'nanogpt' | 'local';  // Phase 112: Extended sources
  source_display?: string;  // Phase 112: Display label (xAI, OR, Direct, Polza, etc.)
  // Phase 112: All available routes for this model
  routes?: Array<{ type: string; display: string; id: string }>;
  // TODO_CAM_INDICATOR: Add CAM relevance ranking from backend
  cam_score?: number;  // 0.0-1.0 from GET /api/cam/model-rank?model_id=... (used for sorting/highlighting)
  // Phase 111: Timestamp for NEW marker
  created?: number;  // Unix timestamp when model was added
}

// Phase 57: API Keys types
interface APIKeyInfo {
  id: string;
  provider: string;
  key: string;
  status: 'active' | 'backup' | 'invalid' | 'rate_limited';
  balance?: number;         // MARKER_117_UI
  balance_limit?: number;   // MARKER_117_UI
  balance_percent?: number; // MARKER_117_UI
}

interface ProviderKeys {
  provider: string;
  keys: APIKeyInfo[];
  isLocal?: boolean;
  status?: 'running' | 'stopped';
}

// Phase 93.11: Model status for online/offline indicator
interface ModelStatus {
  status: 'online' | 'offline' | 'unknown';
  last_success: number | null;
  last_error: number | null;
  error_code: number | null;
  via_openrouter: boolean;
  call_count: number;
}

interface ModelDirectoryProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  // Phase 111.9: Added modelSource for multi-provider routing
  onSelect: (modelId: string, modelName: string, modelSource?: string) => void;
  // Phase 56.6: Group creation mode support
  isGroupMode?: boolean;
  // Phase 111.9: Added modelSource for multi-provider routing
  onSelectForGroup?: (modelId: string, modelName: string, modelSource?: string) => void;
  // Phase 80.19: Direct model addition to existing group
  activeGroupId?: string | null;
  hasActiveSlot?: boolean;
  onModelAddedDirect?: (participant: any) => void;
}

type FilterType = 'all' | 'local' | 'free' | 'cheap' | 'premium' | 'voice' | 'mcp';

// Phase 80.3: Category groups for sidebar
interface CategoryGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  filters: FilterType[];
  expanded?: boolean;
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'base',
    label: 'Models',
    icon: Bot,
    filters: ['all', 'local', 'free'],
    expanded: true
  },
  {
    id: 'pricing',
    label: 'By Price',
    icon: DollarSign,
    filters: ['cheap', 'premium']
  },
  {
    id: 'special',
    label: 'Special',
    icon: Layers,
    filters: ['voice', 'mcp']
  }
];

// Phase 112.5: Mapping API key provider to model filter criteria
// Fixes the mismatch between key names (MISTRAL, POE) and model source/provider fields
const KEY_TO_MODEL_FILTER: Record<string, {
  sources?: string[],
  providers?: string[],
  idPrefixes?: string[]
}> = {
  'openrouter': { sources: ['openrouter'] },
  'poe': { sources: ['poe'] },
  'polza': { sources: ['polza'] },
  'nanogpt': { sources: ['nanogpt'] },
  'xai': { sources: ['direct'], providers: ['xai'], idPrefixes: ['x-ai/'] },
  'mistral': { idPrefixes: ['mistralai/', 'mistral/'] },
  'openai': { sources: ['direct'], providers: ['openai'], idPrefixes: ['openai/', 'gpt-'] },
  'anthropic': { sources: ['direct'], providers: ['anthropic'], idPrefixes: ['anthropic/', 'claude-'] },
  'gemini': { sources: ['gemini_direct'], idPrefixes: ['google/', 'gemini'] },
  'google': { sources: ['gemini_direct'], idPrefixes: ['google/', 'gemini'] },
  'perplexity': { sources: ['perplexity'], idPrefixes: ['perplexity/'] },
};

export const ModelDirectory: React.FC<ModelDirectoryProps> = ({
  isOpen,
  onClose,
  embedded = false,
  onSelect,
  isGroupMode = false,
  onSelectForGroup,
  // Phase 80.19: Direct model addition props
  activeGroupId = null,
  hasActiveSlot = false,
  onModelAddedDirect
}) => {
  const emitMycoKeyInventory = useCallback((providerRows: ProviderKeys[]) => {
    const providersList = providerRows
      .filter((provider) => !provider.isLocal && Array.isArray(provider.keys) && provider.keys.length > 0)
      .map((provider) => provider.provider.toLowerCase().trim());
    const totalKeys = providerRows.reduce((sum, provider) => {
      if (provider.isLocal || !Array.isArray(provider.keys)) return sum;
      return sum + provider.keys.length;
    }, 0);
    window.dispatchEvent(new CustomEvent('vetka-myco-key-inventory-refresh', {
      detail: {
        providers: providersList,
        totalKeys,
      },
    }));
  }, []);

  const [models, setModels] = useState<Model[]>([]);
  const [localModels, setLocalModels] = useState<Model[]>([]);
  const [mcpAgents, setMcpAgents] = useState<Model[]>([]); // Phase 80.3: MCP Agents
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [error, setError] = useState<string | null>(null);
  // Phase 80.3: Expanded category groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    base: true,
    pricing: false,
    special: false
  });

  // Phase 57: API Keys state
  const [showKeys, setShowKeys] = useState(false);
  const [providers, setProviders] = useState<ProviderKeys[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Phase 57.1: Smart key detection state
  const [smartKeyInput, setSmartKeyInput] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<{
    provider: string;
    display_name: string;
    category: string;
    confidence: number;
    note?: string;
    base_url?: string;
  } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Phase 93.11: Model status for online/offline indicators
  const [modelStatus, setModelStatus] = useState<Record<string, ModelStatus>>({});

  // Phase 111: Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Phase 112: Source filter - filter models by provider/source
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  // MARKER_152.FIX3: Starred keys & models from store
  const favoriteKeys = useMCCStore(s => s.favoriteKeys);
  const favoriteModels = useMCCStore(s => s.favoriteModels);
  const toggleFavoriteKey = useMCCStore(s => s.toggleFavoriteKey);
  const toggleFavoriteModel = useMCCStore(s => s.toggleFavoriteModel);
  const loadFavorites = useMCCStore(s => s.loadFavorites);

  // MARKER_152.FIX3: Load favorites on mount + auto-filter starred keys
  useEffect(() => {
    if (isOpen) {
      loadFavorites();
    }
  }, [isOpen, loadFavorites]);

  // Fetch models when opened (cloud, local, and MCP agents)
  useEffect(() => {
    if (isOpen && models.length === 0) {
      setLoading(true);
      setError(null);

      // MARKER_138.S2_5_MODELDIR_AUTODETECT: Unified dynamic inventory endpoint
      fetch('/api/models/autodetect')
        .then(r => r.json())
        .then((data) => {
          const cloudModels = (data.cloud_models || []).map((m: Model) => ({
            ...m,
            isLocal: false
          }));

          const local = (data.local_models || []).map((m: any) => ({
            id: m.id || m.name,
            name: m.name || m.id,
            provider: m.provider || 'local',
            context_length: m.context_length || 0,
            pricing: m.pricing || { prompt: '0', completion: '0' },
            type: m.type,
            capabilities: m.capabilities || [],
            source: m.source,
            source_display: m.source_display || 'Local',
            isLocal: true
          }));

          const mcp = (data.mcp_agents || []).map((m: any) => ({
            ...m,
            provider: m.provider || 'mcp',
            context_length: m.context_window || m.context_length || 200000,
            pricing: m.pricing || { prompt: '0', completion: '0' },
            type: m.type || 'mcp_agent',
            isLocal: false
          }));

          setModels(cloudModels);
          setLocalModels(local);
          setMcpAgents(mcp);
        })
        .catch(err => {
          setError(err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, models.length]);

  // Phase 93.11: Fetch model status with polling every 60s
  useEffect(() => {
    if (!isOpen) return;

    const fetchStatus = () => {
      fetch('/api/models/status')
        .then(r => r.json())
        .then(data => setModelStatus(data.models || {}))
        .catch(err => console.warn('[ModelDirectory] Status fetch error:', err));
    };

    fetchStatus();  // Initial fetch
    const interval = setInterval(fetchStatus, 60000);  // Poll every 60s

    return () => clearInterval(interval);
  }, [isOpen]);

  // Phase 111: Refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/models/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // MARKER_138.S2_5_MODELDIR_AUTODETECT: Refresh also rehydrates from autodetect inventory
        // Reload from unified autodetect endpoint
        const resAll = await fetch('/api/models/autodetect?force_refresh=true');
        const allData = await resAll.json();
        setModels((allData.cloud_models || []).map((m: Model) => ({ ...m, isLocal: false })));
        setLocalModels((allData.local_models || []).map((m: any) => ({
          ...m,
          provider: m.provider || 'local',
          pricing: m.pricing || { prompt: '0', completion: '0' },
          isLocal: true
        })));
        setMcpAgents((allData.mcp_agents || []).map((m: any) => ({
          ...m,
          type: m.type || 'mcp_agent',
          pricing: m.pricing || { prompt: '0', completion: '0' }
        })));

        // Show toast with new count
        setToastMessage(data.message || `Refreshed: ${data.count} models`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error('[ModelDirectory] Refresh failed:', err);
      setToastMessage('Refresh failed');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Phase 111: NEW marker helper - models created within 7 days
  const isNewModel = useCallback((model: Model): boolean => {
    if (!model.created) return false;
    const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
    const now = Date.now() / 1000; // Unix timestamp
    return (now - model.created) < SEVEN_DAYS_SECONDS;
  }, []);

  // Phase 80.3: Combined models (local first, then MCP, then cloud)
  const allModels = useMemo(() => {
    return [...localModels, ...mcpAgents, ...models];
  }, [localModels, mcpAgents, models]);

  // MARKER_152.FIX3: Helper — check if model matches a key filter
  const matchesKeyFilter = useCallback((m: Model, sf: string): boolean => {
    const mapping = KEY_TO_MODEL_FILTER[sf.toLowerCase()];
    if (mapping) {
      if (mapping.sources?.includes(m.source || '')) return true;
      if (mapping.providers?.includes(m.provider?.toLowerCase() || '')) return true;
      if (mapping.idPrefixes?.some(prefix =>
        m.id?.toLowerCase().startsWith(prefix.toLowerCase())
      )) return true;
      return false;
    }
    return m.source === sf ||
           m.provider?.toLowerCase() === sf ||
           m.source_display?.toLowerCase() === sf ||
           m.id?.toLowerCase().includes(sf);
  }, []);

  // MARKER_152.FIX3: Extract provider names from starred keys (e.g. "polza:pza_****9PUM" → "polza")
  const starredProviders = useMemo(() => {
    return favoriteKeys.map(k => k.split(':')[0].toLowerCase());
  }, [favoriteKeys]);

  // Filter models - Phase 48.1: Fixed premium threshold ($1/1M = 0.000001 per token)
  // Phase 112: Added sourceFilter for filtering by provider/source
  // MARKER_152.FIX3: + starred keys compound filter + starred models sort to top
  const filteredModels = useMemo(() => {
    const filtered = allModels.filter(m => {
      // Search filter
      const matchSearch = !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.provider.toLowerCase().includes(search.toLowerCase());

      // Phase 112.5 + MARKER_152.FIX3: Source filter
      // Priority: manual sourceFilter > starred keys auto-filter
      let matchSource = true;
      if (sourceFilter) {
        matchSource = matchesKeyFilter(m, sourceFilter);
      } else if (starredProviders.length > 0) {
        // Auto-filter: show models from ANY starred provider
        matchSource = starredProviders.some(sp => matchesKeyFilter(m, sp));
      }

      // Price/type filter
      const pricePerToken = parseFloat(m.pricing?.prompt || '0');
      const pricePerMillion = pricePerToken * 1000000;

      let matchPrice = true;
      if (filter === 'local') {
        matchPrice = m.isLocal === true && m.type !== 'voice';
      } else if (filter === 'free') {
        matchPrice = (pricePerToken === 0 || m.isLocal === true) && m.type !== 'voice';
      } else if (filter === 'cheap') {
        matchPrice = pricePerToken > 0 && pricePerMillion < 1.0 && !m.isLocal && m.type !== 'voice';
      } else if (filter === 'premium') {
        matchPrice = pricePerMillion >= 1.0 && !m.isLocal && m.type !== 'voice';
      } else if (filter === 'voice') {
        matchPrice = m.type === 'voice';
      } else if (filter === 'mcp') {
        matchPrice = m.type === 'mcp_agent';
      }

      return matchSearch && matchPrice && matchSource;
    });

    // MARKER_152.FIX3: Starred models sort to top
    if (favoriteModels.length > 0) {
      const starred = filtered.filter(m => favoriteModels.includes(m.id));
      const unstarred = filtered.filter(m => !favoriteModels.includes(m.id));
      return [...starred, ...unstarred];
    }
    return filtered;
  }, [allModels, search, filter, sourceFilter, starredProviders, favoriteModels, matchesKeyFilter]);

  // Handle model selection
  // Phase 111.9: Pass model.source for multi-provider routing
  const handleSelect = useCallback((model: Model) => {
    onSelect(model.id, model.name, model.source);
    onClose();
  }, [onSelect, onClose]);

  // Phase 80.19: Handle direct model addition to existing group
  const handleAddModelDirect = useCallback(async (model: Model) => {
    if (!activeGroupId) {
      console.error('[ModelDirectory] No active group for direct add');
      return;
    }

    try {
      const response = await fetch(`/api/groups/${activeGroupId}/models/add-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: model.id,
          role: 'worker'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setToastMessage(`Added ${model.name} to group`);
        setTimeout(() => setToastMessage(null), 2500);
        onModelAddedDirect?.(data.participant);
      } else {
        setToastMessage(data.detail || 'Failed to add model');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (error) {
      console.error('[ModelDirectory] Direct add failed:', error);
      setToastMessage('Network error');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [activeGroupId, onModelAddedDirect]);

  // Phase 57: Fetch API keys
  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      const data = await res.json();
      if (data.providers) {
        setProviders(data.providers);
        emitMycoKeyInventory(data.providers);
      }
    } catch (err) {
      console.error('[ModelDirectory] Failed to fetch keys:', err);
    }
  }, [emitMycoKeyInventory]);

  // Load keys when drawer opens
  useEffect(() => {
    if (showKeys && providers.length === 0) {
      fetchKeys();
    }
  }, [showKeys, providers.length, fetchKeys]);

  // MARKER_117_UI: Fetch balance data for providers
  const fetchBalances = useCallback(async () => {
    try {
      const res = await fetch('/api/keys/balance');
      const data = await res.json();
      if (data.success && data.balances) {
        // Merge balance data into providers
        setProviders((prevProviders) =>
          prevProviders.map((provider) => {
            const balanceData = data.balances[provider.provider];
            if (!balanceData || balanceData.error) {
              return provider;
            }

            // Update keys with balance info
            const updatedKeys = provider.keys.map((key) => ({
              ...key,
              balance: balanceData.balance,
              balance_limit: balanceData.limit,
              balance_percent: balanceData.percent,
            }));

            return { ...provider, keys: updatedKeys };
          })
        );
      }
    } catch (err) {
      console.error('[ModelDirectory] Failed to fetch balances:', err);
    }
  }, []);

  // MARKER_117_UI: Load balances after keys are loaded
  useEffect(() => {
    if (showKeys && providers.length > 0) {
      fetchBalances();
    }
  }, [showKeys, providers.length, fetchBalances]);

  // Phase 57.1: Auto-detect provider from key input
  const handleSmartKeyInput = useCallback(async (value: string) => {
    setSmartKeyInput(value);

    // Reset detection if too short
    if (value.length < 10) {
      setDetectedProvider(null);
      return;
    }

    // Debounce detection
    setIsDetecting(true);
    try {
      const res = await fetch('/api/keys/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: value })
      });
      const data = await res.json();
      // Phase 57.12: API returns object with provider info directly
      if (data.success && data.detected) {
        setDetectedProvider({
          provider: data.provider,
          display_name: data.display_name,
          category: data.category || 'llm',
          confidence: data.confidence || 0.9,
          note: data.note
        });
      } else {
        setDetectedProvider(null);
      }
    } catch (err) {
      console.error('[ModelDirectory] Detection failed:', err);
      setDetectedProvider(null);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  // Phase 57.1: Add key with smart detection
  const handleSmartAddKey = useCallback(async () => {
    if (!smartKeyInput.trim() || !detectedProvider) return;

    try {
      const res = await fetch('/api/keys/add-smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: smartKeyInput })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSmartKeyInput('');
        setDetectedProvider(null);
        fetchKeys();
        setToastMessage(`${data.display_name || data.provider} key added`);
        setTimeout(() => setToastMessage(null), 2500);
      } else {
        setToastMessage(data.error || 'Failed to add key');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error('[ModelDirectory] Smart add failed:', err);
      setToastMessage('Network error');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [smartKeyInput, detectedProvider, fetchKeys]);

  // Phase 57: Remove key
  const handleRemoveKey = useCallback(async (provider: string, keyId: string) => {
    try {
      const res = await fetch(`/api/keys/${provider.toLowerCase()}/${keyId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        fetchKeys();
      }
    } catch (err) {
      console.error('[ModelDirectory] Failed to remove key:', err);
    }
  }, [fetchKeys]);

  // Get price display
  const formatPrice = (price: string) => {
    const num = parseFloat(price || '0');
    if (num === 0) return 'Free';
    const perMillion = num * 1000000;
    if (perMillion < 0.01) return `$${perMillion.toFixed(4)}/1M`;
    return `$${perMillion.toFixed(2)}/1M`;
  };

  // Phase 93.11: Format last seen timestamp
  const formatLastSeen = (timestamp: number | null): string => {
    if (!timestamp) return '';

    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Phase 111: Spin animation for refresh button */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          position: embedded ? 'relative' : 'fixed',
          left: embedded ? undefined : 0,
          top: embedded ? undefined : 0,
          width: embedded ? '100%' : '380px',
          height: embedded ? '100%' : '100vh',
          background: 'rgba(10, 10, 10, 0.88)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRight: '1px solid rgba(34, 34, 34, 0.8)',
          zIndex: embedded ? undefined : 1000,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: embedded ? undefined : '4px 0 20px rgba(0,0,0,0.5)'
        }}
      >
        {/* Header - Phase 62.1: Semi-transparent */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid rgba(34, 34, 34, 0.8)',
        background: 'rgba(17, 17, 17, 0.7)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={20} color="#888" />
            <h3 style={{ margin: 0, color: '#ccc', fontSize: 16 }}>
              Model Directory
            </h3>
            <span style={{
              fontSize: 11,
              color: '#666',
              background: '#222',
              padding: '2px 6px',
              borderRadius: 4
            }}>
              {filteredModels.length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Phase 111: Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh model list"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: isRefreshing ? 'wait' : 'pointer',
                padding: 4,
                opacity: isRefreshing ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <RefreshCw
                size={16}
                color="#666"
                style={{
                  animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
                }}
              />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#0a0a0a',
          borderRadius: 8,
          padding: '8px 12px',
          gap: 8,
          border: '1px solid #222'
        }}>
          <Search size={16} color="#555" />
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#ccc',
              fontSize: 14,
              outline: 'none'
            }}
          />
        </div>

        </div>

      {/* Phase 80.3: Two-column layout - Sidebar + Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left Sidebar - Telegram-style category groups */}
        <div style={{
          width: 54,
          background: '#0a0a0a',
          borderRight: '1px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 8,
          overflow: 'hidden'
        }}>
          {CATEGORY_GROUPS.map(group => {
            const GroupIcon = group.icon;
            const isExpanded = expandedGroups[group.id];
            const isActiveGroup = group.filters.includes(filter);

            return (
              <div key={group.id}>
                {/* Group header button */}
                <button
                  onClick={() => setExpandedGroups(prev => ({
                    ...prev,
                    [group.id]: !prev[group.id]
                  }))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '8px 4px',
                    background: isActiveGroup ? '#1a1a1a' : 'transparent',
                    border: 'none',
                    borderLeft: isActiveGroup ? '2px solid #444' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  title={group.label}
                >
                  <GroupIcon size={16} color={isActiveGroup ? '#aaa' : '#555'} />
                  <span style={{
                    fontSize: 8,
                    color: isActiveGroup ? '#888' : '#444',
                    marginTop: 2,
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px'
                  }}>
                    {group.label.slice(0, 6)}
                  </span>
                  {isExpanded ? (
                    <ChevronDown size={10} color="#444" style={{ marginTop: 2 }} />
                  ) : (
                    <ChevronRight size={10} color="#333" style={{ marginTop: 2 }} />
                  )}
                </button>

                {/* Expanded filter buttons */}
                {isExpanded && (
                  <div style={{ padding: '4px 0', background: '#0f0f0f' }}>
                    {group.filters.map(f => {
                      const filterConfig: Record<FilterType, { label: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
                        all: { label: 'All', icon: Bot },
                        local: { label: 'Local', icon: Home },
                        free: { label: 'Free', icon: Zap },
                        cheap: { label: '$', icon: DollarSign },
                        premium: { label: '$$', icon: Crown },
                        voice: { label: 'Voice', icon: Mic },
                        mcp: { label: 'MCP', icon: Terminal }
                      };
                      const cfg = filterConfig[f];
                      const FilterIcon = cfg.icon;
                      const isActive = filter === f;

                      return (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '6px 4px',
                            background: isActive ? '#222' : 'transparent',
                            border: 'none',
                            borderLeft: isActive ? '2px solid #555' : '2px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.1s'
                          }}
                          title={cfg.label}
                        >
                          <FilterIcon size={12} color={isActive ? '#ccc' : '#555'} />
                          <span style={{
                            fontSize: 7,
                            color: isActive ? '#aaa' : '#444',
                            marginTop: 1
                          }}>
                            {cfg.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      {/* Model List */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px 0'
      }}>
        {loading && (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: '#666'
          }}>
            <Cpu size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 8 }}>Loading models...</div>
          </div>
        )}

        {error && (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: '#888'
          }}>
            Error: {error}
          </div>
        )}

        {/* Phase 112.4b: Use compound key to prevent React dedup of same model from different sources */}
        {!loading && !error && filteredModels.map(model => (
          <div
            key={(model as any)._compound_key || `${model.id}@${model.source || 'unknown'}`}
            onClick={() => {
              // Phase 57.3: In group mode, ONLY call onSelectForGroup (don't switch to chat)
              // In solo mode, call handleSelect to insert @model and switch to chat
              // Phase 80.19: If in group mode with active group but no active slot,
              // add model directly to group via API
              // Phase 111.9: Pass model.source for multi-provider routing
              if (isGroupMode) {
                if (hasActiveSlot && onSelectForGroup) {
                  // Fill the active role slot
                  onSelectForGroup(model.id, model.name, model.source);
                } else if (activeGroupId) {
                  // Phase 80.19: Add directly to existing group
                  handleAddModelDirect(model);
                } else if (onSelectForGroup) {
                  // Creating new group - pass to parent for slot handling
                  onSelectForGroup(model.id, model.name, model.source);
                }
              } else {
                handleSelect(model);
              }
            }}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #1a1a1a',
              cursor: isGroupMode ? 'crosshair' : 'pointer',
              transition: 'all 0.2s',
              background: 'transparent',
              borderLeft: '2px solid transparent'
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#1a1a1a';
              if (isGroupMode) {
                (e.currentTarget as HTMLElement).style.borderLeft = '2px solid #555';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.borderLeft = '2px solid transparent';
            }}
          >
            {/* MARKER_152.FIX3: Flex wrapper for star on right */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
            {/* Model name */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              {/* Phase 93.11: StatusDot - blue=online, gray=offline */}
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: (() => {
                  // MCP agents, voice, local have their own gray indicators
                  if (model.type === 'mcp_agent') return '#888';
                  if (model.type === 'voice') return '#666';
                  if (model.isLocal) return '#777';
                  // Cloud models: check status
                  const status = modelStatus[model.id];
                  if (status?.status === 'online') return '#7ab3d4';  // VETKA blue
                  if (status?.status === 'offline') return '#555';    // Gray
                  return '#444';  // Unknown
                })()
              }} />
              <span style={{
                fontWeight: 500,
                color: '#ccc',
                fontSize: 13
              }}>
                {model.name}
              </span>
              {/* Phase 111: NEW marker for recently added models */}
              {isNewModel(model) && (
                <span style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  background: '#333',
                  color: '#fff',
                  borderRadius: 3,
                  marginLeft: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontWeight: 600
                }}>
                  NEW
                </span>
              )}
              {/* Phase 80.3: Monochrome badges */}
              {model.isLocal && model.type !== 'voice' && model.type !== 'mcp_agent' && (
                <span style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  background: '#1a1a1a',
                  color: '#888',
                  borderRadius: 3,
                  marginLeft: 4
                }}>
                  Local
                </span>
              )}
              {/* Phase 80.3: MCP Agent badge with role */}
              {model.type === 'mcp_agent' && (
                <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                  <span style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    background: '#1a1a1a',
                    color: '#aaa',
                    borderRadius: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2
                  }}>
                    {(model as any).icon === 'terminal' ? <Terminal size={10} /> : <Eye size={10} />}
                    {(model as any).role || 'MCP'}
                  </span>
                </div>
              )}
              {/* Phase 60.5: Voice capability badges - monochrome */}
              {model.type === 'voice' && (
                <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                  {model.capabilities?.includes('tts') && (
                    <span style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      background: '#1a1a1a',
                      color: '#888',
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2
                    }}>
                      <Volume2 size={10} /> TTS
                    </span>
                  )}
                  {model.capabilities?.includes('stt') && (
                    <span style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      background: '#1a1a1a',
                      color: '#888',
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2
                    }}>
                      <Mic size={10} /> STT
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Model ID + Last Seen */}
            <div style={{
              fontSize: 11,
              color: '#555',
              marginTop: 4,
              marginLeft: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>{model.id}</span>
              {/* Phase 93.11: Last seen timestamp */}
              {modelStatus[model.id]?.last_success && (
                <span style={{ fontSize: 9, color: '#555' }}>
                  {formatLastSeen(modelStatus[model.id].last_success)}
                </span>
              )}
            </div>

            {/* Stats + MARKER_94.4_SOURCE_BADGE: Show price, context, provider, and API source */}
            <div style={{
              display: 'flex',
              gap: 12,
              marginTop: 6,
              marginLeft: 14,
              fontSize: 10,
              color: '#666'
            }}>
              <span>
                {formatPrice(model.pricing?.prompt)}
              </span>
              <span>
                {(model.context_length / 1000).toFixed(0)}K ctx
              </span>
              <span>
                {model.provider}
              </span>
              {/* MARKER_94.4_SOURCE_BADGE: API source on bottom line (xAI, OR, Direct) */}
              {model.source_display && !model.isLocal && model.type !== 'mcp_agent' && (
                <span style={{
                  color: model.source === 'direct' ? '#888' : '#555',
                  fontWeight: model.source === 'direct' ? 500 : 400
                }}>
                  via {model.source_display}
                </span>
              )}
            </div>
            </div>{/* end content wrapper */}
            {/* MARKER_152.FIX3: Star button for favorite model (right side, matching ChatSidebar) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavoriteModel(model.id, model.name);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                marginTop: 2,
              }}
              title={favoriteModels.includes(model.id) ? 'Remove from favorites' : 'Star model (sort to top)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24"
                fill={favoriteModels.includes(model.id) ? '#fff' : 'none'}
                stroke={favoriteModels.includes(model.id) ? '#fff' : '#444'}
                strokeWidth="1.5"
              >
                <path d="M12 3.7l2.6 5.2 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
              </svg>
            </button>
            </div>{/* end flex wrapper */}
          </div>
        ))}

        {!loading && !error && filteredModels.length === 0 && (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#555'
          }}>
            No models found
          </div>
        )}
      </div>

      </div>{/* End of two-column flex container */}

      {/* Phase 57: API Keys Drawer (IKEA style) */}
      <div style={{
        borderTop: '1px solid #222',
        background: '#111'
      }}>
        {/* Drawer toggle */}
        <button
          onClick={() => setShowKeys(!showKeys)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a1a'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666' }}>
            <Key size={14} />
            <span style={{ fontSize: 12 }}>API Keys</span>
          </span>
          {showKeys ? <ChevronUp size={14} color="#555" /> : <ChevronDown size={14} color="#555" />}
        </button>

        {/* Drawer content */}
        {showKeys && (
          <div style={{ padding: '0 16px 12px' }}>
            {/* Phase 57.1: Smart Key Input - ONE FIELD FOR ALL PROVIDERS */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10,
                color: '#555',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Add API Key (auto-detect)
              </div>

              {/* Smart input field */}
              <input
                type="text"
                name="smart_api_key_input"
                autoComplete="off"
                data-form-type="other"
                value={smartKeyInput}
                onChange={(e) => handleSmartKeyInput(e.target.value)}
                placeholder="Paste any API key..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: 4,
                  color: '#ccc',
                  fontSize: 11,
                  outline: 'none',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && detectedProvider && detectedProvider.confidence >= 0.5) {
                    handleSmartAddKey();
                  }
                  if (e.key === 'Escape') {
                    setSmartKeyInput('');
                    setDetectedProvider(null);
                  }
                }}
              />

              {/* Detection result */}
              {isDetecting && (
                <div style={{ marginTop: 6, fontSize: 10, color: '#555' }}>
                  Detecting...
                </div>
              )}

              {detectedProvider && !isDetecting && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: '#0f0f0f',
                  border: '1px solid #222',
                  borderRadius: 4
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: detectedProvider.note ? 6 : 0
                  }}>
                    {/* Confidence indicator - Phase 80.3: Monochrome */}
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: detectedProvider.confidence >= 0.9 ? '#aaa'
                        : detectedProvider.confidence >= 0.7 ? '#777'
                        : detectedProvider.confidence >= 0.5 ? '#555'
                        : '#333'
                    }} />
                    <span style={{ fontSize: 11, color: '#aaa' }}>
                      {detectedProvider.display_name}
                    </span>
                    <span style={{
                      fontSize: 9,
                      color: '#555',
                      marginLeft: 'auto'
                    }}>
                      {Math.round(detectedProvider.confidence * 100)}%
                    </span>
                  </div>

                  {/* Warning note if low confidence - Phase 80.3: Monochrome */}
                  {detectedProvider.note && (
                    <div style={{
                      fontSize: 9,
                      color: '#888',
                      marginBottom: 8
                    }}>
                      {detectedProvider.note}
                    </div>
                  )}

                  {/* Add button */}
                  <button
                    onClick={handleSmartAddKey}
                    disabled={detectedProvider.confidence < 0.5}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: detectedProvider.confidence >= 0.5 ? '#1a1a1a' : '#111',
                      border: '1px solid #333',
                      borderRadius: 4,
                      color: detectedProvider.confidence >= 0.5 ? '#888' : '#444',
                      fontSize: 10,
                      cursor: detectedProvider.confidence >= 0.5 ? 'pointer' : 'not-allowed',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (detectedProvider.confidence >= 0.5) {
                        e.currentTarget.style.background = '#222';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (detectedProvider.confidence >= 0.5) {
                        e.currentTarget.style.background = '#1a1a1a';
                      }
                    }}
                  >
                    {detectedProvider.confidence >= 0.5
                      ? `Add ${detectedProvider.display_name} Key`
                      : 'Confidence too low'
                    }
                  </button>
                </div>
              )}

              {/* No detection hint - Phase 57.9: Button to ask Hostess */}
              {smartKeyInput.length >= 10 && !detectedProvider && !isDetecting && (
                <div style={{
                  marginTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <div style={{ fontSize: 9, color: '#666' }}>
                    Unknown key type
                  </div>
                  <button
                    onClick={() => {
                      // Phase 57.9: Emit event to trigger Hostess in chat
                      const event = new CustomEvent('askHostessAboutKey', {
                        detail: { key: smartKeyInput }
                      });
                      window.dispatchEvent(event);
                      // Close the panel
                      onClose();
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: 4,
                      color: '#aaa',
                      fontSize: 10,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#252525';
                      e.currentTarget.style.borderColor = '#555';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#1a1a1a';
                      e.currentTarget.style.borderColor = '#444';
                    }}
                  >
                    <Bot size={12} />
                    Ask @hostess to add this key
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{
              borderTop: '1px solid #1a1a1a',
              marginBottom: 12
            }} />

            {/* SAVED KEYS - Scrollable drum/barrel list */}
            <div style={{
              fontSize: 10,
              color: '#555',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Saved Keys
            </div>

            {/* Scrollable keys container (drum) */}
            <div style={{
              maxHeight: 200,
              overflowY: 'auto',
              marginBottom: 12,
              paddingRight: 4,
              // Custom scrollbar
              scrollbarWidth: 'thin',
              scrollbarColor: '#333 #111'
            }}>
              {/* Phase 112: Source filter indicator */}
              {sourceFilter && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  marginBottom: 8,
                  background: '#1a1a2a',
                  borderRadius: 4,
                  fontSize: 10,
                  border: '1px solid #234'
                }}>
                  <span style={{ color: '#68a' }}>
                    Filtering by: <strong>{sourceFilter}</strong>
                  </span>
                  <button
                    onClick={() => setSourceFilter(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#68a',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: 11
                    }}
                  >
                    ✕ Clear
                  </button>
                </div>
              )}
              {/* MARKER_152.FIX3: Starred keys auto-filter indicator */}
              {!sourceFilter && starredProviders.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 10px',
                  marginBottom: 8,
                  background: '#111118',
                  borderRadius: 4,
                  fontSize: 10,
                  border: '1px solid #222'
                }}>
                  <span style={{ color: '#889' }}>
                    ★ Showing: <strong>{starredProviders.join(', ')}</strong>
                  </span>
                </div>
              )}

              {/* Flatten all provider keys into single list — MARKER_152.FIX3: starred keys first */}
              {(() => {
                // Build flat list of all key items, then sort starred to top
                const allKeyItems = providers.filter(p => !p.isLocal).flatMap(provider =>
                  provider.keys.map((apiKey, idx) => ({
                    provider,
                    apiKey,
                    idx,
                    providerName: provider.provider.toLowerCase().trim(),
                    favKeyId: `${provider.provider.toLowerCase().trim()}:${apiKey.key}`,
                  }))
                );
                // Sort: starred first
                allKeyItems.sort((a, b) => {
                  const aStarred = favoriteKeys.includes(a.favKeyId) ? 0 : 1;
                  const bStarred = favoriteKeys.includes(b.favKeyId) ? 0 : 1;
                  return aStarred - bStarred;
                });

                return allKeyItems.map(({ provider, apiKey, idx, providerName, favKeyId }) => {
                  const isSelected = sourceFilter === providerName;
                  const isStarredKey = favoriteKeys.includes(favKeyId);

                  return (
                  <div
                    key={`${provider.provider}-${apiKey.id}-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation(); // Phase 112: Prevent bubbling
                      // Phase 112: Toggle source filter on key click
                      if (isSelected) {
                        setSourceFilter(null);
                      } else {
                        setSourceFilter(providerName);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      marginBottom: 4,
                      background: isStarredKey ? '#1a1a20' : isSelected ? '#1a1a2a' : '#0a0a0a',
                      borderRadius: 4,
                      fontSize: 11,
                      borderLeft: isStarredKey ? '2px solid #9ab' : isSelected ? '2px solid #68a' : '2px solid #444',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isStarredKey) {
                        (e.currentTarget as HTMLElement).style.background = '#111';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isStarredKey) {
                        (e.currentTarget as HTMLElement).style.background = '#0a0a0a';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                      {/* Provider tag + status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 8,
                          padding: '1px 4px',
                          borderRadius: 2,
                          background: '#1a1a1a',
                          color: '#aaa',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px'
                        }}>
                          {provider.provider}
                        </span>
                        {provider.keys.length > 1 && (
                          <span style={{ fontSize: 8, color: '#444' }}>
                            #{idx + 1}
                          </span>
                        )}
                        <span style={{
                          fontSize: 8,
                          padding: '1px 4px',
                          borderRadius: 2,
                          background: '#1a1a1a',
                          color: apiKey.status === 'active' ? '#888' : '#555' // Phase 80.3: Monochrome
                        }}>
                          {apiKey.status}
                        </span>
                      </div>
                      {/* Masked key */}
                      <span style={{
                        color: '#666',
                        fontFamily: 'monospace',
                        fontSize: 10,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {apiKey.key}
                      </span>
                      {/* MARKER_117_UI: Balance status bar */}
                      {apiKey.balance !== undefined && apiKey.balance !== null && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 3,
                        }}>
                          <div style={{
                            flex: 1,
                            height: 3,
                            background: '#1a1a1a',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(apiKey.balance_percent || 0, 100)}%`,
                              height: '100%',
                              background: (apiKey.balance_percent || 0) > 20 ? '#7ab3d4' : '#555',
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                          <span style={{
                            fontSize: 8,
                            color: '#666',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                          }}>
                            ${typeof apiKey.balance === 'number' ? apiKey.balance.toFixed(2) : '—'}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* MARKER_152.FIX3: Star button for favorite key (right side, matching ChatSidebar) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteKey(favKeyId);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        marginLeft: 6,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={isStarredKey ? 'Remove from favorites' : 'Add to favorites (auto-filter)'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24"
                        fill={isStarredKey ? '#fff' : 'none'}
                        stroke={isStarredKey ? '#fff' : '#555'}
                        strokeWidth="1.5"
                      >
                        <path d="M12 3.7l2.6 5.2 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Phase 112: Prevent triggering parent click
                        handleRemoveKey(provider.provider, apiKey.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#333',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        fontSize: 14,
                        marginLeft: 8,
                        borderRadius: 3
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#844';
                        e.currentTarget.style.background = '#1a1111';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#333';
                        e.currentTarget.style.background = 'transparent';
                      }}
                      title="Remove key"
                    >
                      ×
                    </button>
                  </div>
                );
                });
              })()}

              {/* No keys message */}
              {providers.filter(p => !p.isLocal).every(p => p.keys.length === 0) && (
                <div style={{
                  fontSize: 10,
                  color: '#444',
                  textAlign: 'center',
                  padding: '16px 0'
                }}>
                  No API keys saved yet. Paste a key above to add.
                </div>
              )}
            </div>

            {/* Ollama status */}
            {providers.filter(p => p.isLocal).map(provider => (
              <div key={provider.provider} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: '#0a0a0a',
                borderRadius: 4,
                fontSize: 11,
                borderLeft: '2px solid #555'
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: provider.status === 'running' ? '#888' : '#444' // Phase 80.3: Monochrome
                }} />
                <span style={{ color: '#666', textTransform: 'uppercase', fontSize: 8, letterSpacing: '0.3px' }}>
                  {provider.provider}
                </span>
                <span style={{ color: '#888' }}>localhost:11434</span>
                <span style={{ color: '#555', marginLeft: 'auto' }}>{provider.status}</span>
              </div>
            ))}

            {providers.length === 0 && (
              <div style={{ fontSize: 10, color: '#444', textAlign: 'center', padding: 8 }}>
                Loading...
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        {!showKeys && (
          <div style={{
            padding: '6px 16px 10px',
            fontSize: 10,
            color: '#444',
            textAlign: 'center'
          }}>
            {isGroupMode
              ? (hasActiveSlot
                  ? 'Click a model to add to team slot'
                  : activeGroupId
                    ? 'Click a model to add directly to group'  // Phase 80.19
                    : 'Click a model to add to team slot')
              : 'Click a model to use in chat'
            }
          </div>
        )}
      </div>

      {/* Phase 57: Toast notification */}
      {toastMessage && (
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: toastMessage.includes('error') || toastMessage.includes('Invalid') || toastMessage.includes('failed') ? '#2a1a1a' : '#1a1a2a',
          border: `1px solid ${toastMessage.includes('error') || toastMessage.includes('Invalid') || toastMessage.includes('failed') ? '#442' : '#234'}`,
          color: toastMessage.includes('error') || toastMessage.includes('Invalid') || toastMessage.includes('failed') ? '#a86' : '#68a',
          padding: '8px 16px',
          borderRadius: 6,
          fontSize: 11,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          zIndex: 1001,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMessage}
        </div>
      )}
      </div>
    </>
  );
};

export default ModelDirectory;
