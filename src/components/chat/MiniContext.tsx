// @ts-nocheck
// TODO (chat-extract): VETKA-specific imports — adapter required:
//   ../../utils/dagLayout       → @vetka/adapter-utils
//   ../../utils/fileReadClient  → @vetka/adapter-utils
//   ../../types/dag             → @vetka/adapter-types
//   ../../store/useStore        → @vetka/adapter-store
//   ../../store/useMCCStore     → @vetka/adapter-store
/**
 * MARKER_155A.WA.MINICONTEXT_SHELL.V1:
 * MiniContext — universal context shell for selected DAG entity.
 *
 * Wave A/P4 scope:
 * - compact summary for current selection
 * - expanded human-readable sections (project/task/agent/file/directory)
 * - lightweight file preview for file nodes via existing read API
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MiniWindow } from './MiniWindow';
import { NOLAN_PALETTE } from '../../utils/dagLayout';
import { readFileViaApi } from '../../utils/fileReadClient';
import { NodeStreamView } from './NodeStreamView';
import type { DAGNode } from '../../types/dag';
import { useStore } from '../../store/useStore';
import { useMCCStore } from '../../store/useMCCStore';

export type MiniContextKind = 'project' | 'task' | 'agent' | 'file' | 'directory' | 'workflow' | 'node';

export interface MiniContextPayload {
  scope: 'project' | 'node';
  navLevel: string;
  focusScopeKey: string;
  workflowSourceMode: string;
  windowFocus?: string;
  windowFocusState?: 'compact' | 'expanded' | 'minimized';
  activeTaskId?: string | null;
  taskDrillState?: 'collapsed' | 'expanded';
  roadmapNodeDrillState?: 'collapsed' | 'expanded';
  workflowInlineExpanded?: boolean;
  roadmapNodeInlineExpanded?: boolean;
  selectedNodeIds: string[];
  nodeId: string | null;
  nodeKind: MiniContextKind;
  label: string;
  status?: string;
  role?: string;
  model?: string;
  taskId?: string;
  workflowId?: string;
  teamProfile?: string;
  workflowFamily?: string;
  graphKind?: string;
  path?: string;
}

interface MiniContextProps {
  context: MiniContextPayload;
  nodeData?: DAGNode | null;
  onSearchSelect?: (row: {
    path: string;
    title: string;
    snippet: string;
    score: number;
  }) => void;
  onViewArtifact?: (artifact: {
    id: string;
    name: string;
    status: string;
    artifact_type: string;
    language: string;
    file_path: string;
    size_bytes: number;
  }) => void;
  onOpenFile?: (path: string, mode?: 'pane' | 'fullscreen') => void;
}

interface ContextSearchRow {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

interface ModelInfo {
  id: string;
  provider: string;
  source: string;
}

interface TaskContextPacket {
  task?: {
    id?: string;
    title?: string;
    description?: string;
  };
  docs?: {
    architecture_docs?: string[];
    recon_docs?: string[];
  };
  governance?: {
    depends_on_docs?: string[];
    ownership_scope?: string;
    owner_agent?: string;
    allowed_paths?: string[];
  };
  code_scope?: {
    closure_files?: string[];
  };
  tests?: {
    closure_tests?: string[];
  };
  gaps?: string[];
}

interface DirectoryTreeNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  children?: DirectoryTreeNode[];
  truncated?: boolean;
}

function descendantLabel(generations: number): string {
  if (generations <= 1) return 'children';
  if (generations === 2) return 'grandchildren';
  if (generations === 3) return 'great-grandchildren';
  return `level ${generations}`;
}

const KEY_PROVIDER_TO_MODEL_SOURCE: Record<string, string[]> = {
  polza: ['polza'],
  openrouter: ['openrouter'],
  xai: ['direct'],
  openai: ['direct'],
  anthropic: ['direct'],
  google: ['gemini_direct'],
  nanogpt: ['nanogpt'],
  poe: ['poe'],
};

let _cachedModels: ModelInfo[] | null = null;
let _modelsFetching = false;
const _modelListeners: Array<(models: ModelInfo[]) => void> = [];

function fetchModelsOnce() {
  if (_cachedModels || _modelsFetching) return;
  _modelsFetching = true;
  fetch('/api/models')
    .then((r) => r.json())
    .then((data) => {
      const models: ModelInfo[] = (data.models || []).map((m: any) => ({
        id: String(m.id || ''),
        provider: String(m.provider || ''),
        source: String(m.source || ''),
      }));
      _cachedModels = models;
      _modelsFetching = false;
      _modelListeners.forEach((cb) => cb(models));
      _modelListeners.length = 0;
    })
    .catch(() => {
      _modelsFetching = false;
    });
}

function useModelList(): ModelInfo[] {
  const [models, setModels] = useState<ModelInfo[]>(_cachedModels || []);
  useEffect(() => {
    if (_cachedModels) {
      setModels(_cachedModels);
      return;
    }
    _modelListeners.push(setModels);
    fetchModelsOnce();
  }, []);
  return models;
}

function useTaskContextPacket(taskId?: string | null): { loading: boolean; packet: TaskContextPacket | null } {
  const [loading, setLoading] = useState(false);
  const [packet, setPacket] = useState<TaskContextPacket | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolvedTaskId = String(taskId || '').trim();
    if (!resolvedTaskId) {
      setPacket(null);
      return;
    }
    setLoading(true);
    fetch(`/api/mcc/tasks/${encodeURIComponent(resolvedTaskId)}/context-packet`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setPacket(data);
      })
      .catch(() => {
        if (!cancelled) setPacket(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return { loading, packet };
}

function useDirectoryTree(
  path?: string | null,
  enabled: boolean = true,
  projectId?: string | null,
): { loading: boolean; tree: DirectoryTreeNode | null } {
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<DirectoryTreeNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolvedPath = String(path || '').trim();
    if (!enabled || !resolvedPath) {
      setTree(null);
      return;
    }
    setLoading(true);
    const qs = new URLSearchParams({ path: resolvedPath, depth: '1' });
    if (projectId) qs.set('project_id', String(projectId));
    fetch(`/api/mcc/directory-tree?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setTree((data?.tree as DirectoryTreeNode) || null);
      })
      .catch(() => {
        if (!cancelled) setTree(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, path, projectId]);

  return { loading, tree };
}

// MARKER_155A.WC.MODEL_EDIT_BIND.V2:
// Inline model editor for agent context, persisted to active preset and
// filtered by provider selected in MiniBalance (selectedKey).
function AgentModelBinder({
  role,
  model,
}: {
  role?: string;
  model?: string;
}) {
  const selectedKey = useStore((s) => s.selectedKey);
  const activePreset = useMCCStore((s) => s.activePreset || 'dragon_silver');
  const fetchPresets = useMCCStore((s) => s.fetchPresets);
  const allModels = useModelList();
  const [currentModel, setCurrentModel] = useState(model || '');
  const [draftModel, setDraftModel] = useState(model || '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const roleKey = String(role || '').toLowerCase().trim();
  const effectiveRole = roleKey === 'eval' ? 'verifier' : roleKey;

  useEffect(() => {
    let cancelled = false;
    const direct = String(model || '').trim();
    if (direct) {
      setCurrentModel(direct);
      setDraftModel(direct);
      return () => {
        cancelled = true;
      };
    }
    if (!effectiveRole) {
      setCurrentModel('');
      setDraftModel('');
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/pipeline/presets/${encodeURIComponent(activePreset)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const roles = data?.preset?.roles || {};
        const presetModel = String(roles?.[effectiveRole] || '');
        setCurrentModel(presetModel);
        setDraftModel(presetModel);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentModel('');
      });
    return () => {
      cancelled = true;
    };
  }, [activePreset, effectiveRole, model]);

  const sourceFilter = useMemo(() => {
    const provider = String(selectedKey?.provider || '').toLowerCase().trim();
    if (!provider) return null;
    return KEY_PROVIDER_TO_MODEL_SOURCE[provider] || [provider];
  }, [selectedKey?.provider]);

  const modelOptions = useMemo(() => {
    let pool = allModels;
    if (sourceFilter && sourceFilter.length > 0) {
      pool = allModels.filter((m) => sourceFilter.includes(String(m.source || '').toLowerCase()));
    }
    const seen = new Set<string>();
    const deduped: ModelInfo[] = [];
    for (const m of pool) {
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        deduped.push(m);
      }
    }
    deduped.sort((a, b) => a.id.localeCompare(b.id));
    return deduped;
  }, [allModels, sourceFilter]);

  const isArchitectRole = effectiveRole === 'architect';
  const inScopeModelIds = useMemo(
    () => new Set(modelOptions.map((m) => m.id)),
    [modelOptions],
  );
  const isCurrentInScope = !currentModel || inScopeModelIds.has(currentModel);
  const isDraftInScope = !draftModel || inScopeModelIds.has(draftModel);
  const mustUseSelectedKeyScope = isArchitectRole && !!selectedKey;
  const guardBlocked = mustUseSelectedKeyScope && !isDraftInScope;
  const suggestScopedModel = useMemo(() => modelOptions[0]?.id || '', [modelOptions]);

  const handleSave = async () => {
    if (!effectiveRole || !draftModel || draftModel === currentModel || guardBlocked) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/pipeline/presets/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_name: activePreset,
          role: effectiveRole,
          model: draftModel,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentModel(draftModel);
        fetchPresets();
        window.dispatchEvent(new CustomEvent('mcc-model-updated', {
          detail: { role: effectiveRole, model: draftModel, preset: activePreset },
        }));
        setSaveMsg('saved');
      } else {
        setSaveMsg(`error: ${String(data.detail || 'unknown')}`);
      }
    } catch {
      setSaveMsg('network error');
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${NOLAN_PALETTE.borderDim}` }}>
      <div style={{ color: '#8f99a5', fontSize: 9, marginBottom: 6 }}>
        model edit ({activePreset})
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          value={draftModel}
          onChange={(e) => setDraftModel(e.target.value)}
          disabled={!effectiveRole || saving || modelOptions.length === 0}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'rgba(255,255,255,0.02)',
            color: '#c1cad4',
            border: `1px solid ${NOLAN_PALETTE.borderDim}`,
            borderRadius: 6,
            fontSize: 10,
            padding: '5px 6px',
            fontFamily: 'monospace',
          }}
        >
          {!draftModel ? <option value="">select model...</option> : null}
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!effectiveRole || !draftModel || saving || draftModel === currentModel || guardBlocked}
          onClick={handleSave}
          style={{
            border: `1px solid ${NOLAN_PALETTE.border}`,
            background: 'rgba(255,255,255,0.03)',
            color: '#d3dbe5',
            borderRadius: 6,
            fontSize: 10,
            padding: '5px 8px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {saving ? '...' : 'save'}
        </button>
      </div>
      {!isCurrentInScope && mustUseSelectedKeyScope ? (
        <div style={{ marginTop: 6, color: '#9aa4af', fontSize: 9, lineHeight: 1.35 }}>
          current model is outside selected key scope.
          {suggestScopedModel ? (
            <button
              type="button"
              onClick={() => setDraftModel(suggestScopedModel)}
              style={{
                marginLeft: 6,
                border: `1px solid ${NOLAN_PALETTE.border}`,
                background: 'rgba(255,255,255,0.03)',
                color: '#d3dbe5',
                borderRadius: 5,
                fontSize: 9,
                padding: '1px 6px',
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              align to key
            </button>
          ) : null}
        </div>
      ) : null}
      {guardBlocked ? (
        <div style={{ marginTop: 4, color: '#9aa4af', fontSize: 9 }}>
          save blocked: architect model must match active key provider
        </div>
      ) : null}
      <div style={{ marginTop: 6, color: '#8f99a5', fontSize: 9 }}>
        model: {currentModel || '-'}
      </div>
      <div style={{ marginTop: 4, color: '#8f99a5', fontSize: 9 }}>
        key filter: {selectedKey?.provider ? selectedKey.provider : 'auto (all)'}
        {saveMsg ? ` | ${saveMsg}` : ''}
      </div>
      {roleKey === 'eval' ? (
        <div style={{ marginTop: 4, color: '#8f99a5', fontSize: 9 }}>
          eval uses verifier preset model
        </div>
      ) : null}
    </div>
  );
}

// MARKER_155A.WC.ROLE_PREPROMPT_VIEW.V1:
// Read-only role preprompt preview inside MiniContext (agent scope).
function AgentPromptPreview({ role }: { role?: string }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [draftText, setDraftText] = useState('');
  const [temperature, setTemperature] = useState(0.3);
  const [draftTemperature, setDraftTemperature] = useState(0.3);
  const [fallbackModel, setFallbackModel] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const roleKey = String(role || '').toLowerCase().trim();
  const effectiveRole = roleKey === 'eval' ? 'verifier' : roleKey;

  useEffect(() => {
    let cancelled = false;
    if (!effectiveRole) {
      setText('');
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`/api/pipeline/prompts/${encodeURIComponent(effectiveRole)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const prompt = data?.prompt || {};
        const system = String(prompt?.system || '').trim();
        const temp = Number(prompt?.temperature);
        const normalizedTemp = Number.isFinite(temp) ? temp : 0.3;
        setText(system);
        setDraftText(system);
        setTemperature(normalizedTemp);
        setDraftTemperature(normalizedTemp);
        setFallbackModel(String(prompt?.model_fallback || prompt?.model || '').trim());
      })
      .catch(() => {
        if (cancelled) return;
        setError('prompt unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveRole]);

  if (!effectiveRole) return <div style={{ color: '#8f99a5' }}>role missing</div>;
  if (loading) return <div style={{ color: '#8f99a5' }}>loading prompt...</div>;
  if (error) return <div style={{ color: '#8f99a5' }}>{error}</div>;
  if (!text && !editing) return (
    <div style={{ color: '#8f99a5' }}>
      empty prompt
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          marginLeft: 8,
          border: `1px solid ${NOLAN_PALETTE.border}`,
          background: 'rgba(255,255,255,0.03)',
          color: '#d3dbe5',
          borderRadius: 5,
          fontSize: 9,
          padding: '2px 6px',
          cursor: 'pointer',
          fontFamily: 'monospace',
        }}
      >
        edit
      </button>
    </div>
  );

  const handleSave = async () => {
    if (!effectiveRole || saving || (draftText === text && draftTemperature === temperature)) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/pipeline/prompts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: effectiveRole, system: draftText, temperature: draftTemperature }),
      });
      const data = await res.json();
      if (data.success) {
        setText(draftText);
        setTemperature(draftTemperature);
        setEditing(false);
        setSaveMsg('saved');
      } else {
        setSaveMsg(`error: ${String(data.detail || 'unknown')}`);
      }
    } catch {
      setSaveMsg('network error');
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  if (editing) {
    return (
      <div>
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          style={{
            width: '100%',
            minHeight: 130,
            resize: 'vertical',
            background: 'rgba(255,255,255,0.02)',
            color: '#c5cfda',
            border: `1px solid ${NOLAN_PALETTE.borderDim}`,
            borderRadius: 6,
            padding: '7px 8px',
            fontSize: 10,
            fontFamily: 'monospace',
            lineHeight: 1.4,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ color: '#8f99a5', fontSize: 9 }}>temperature</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={draftTemperature}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDraftTemperature(Number.isFinite(next) ? next : 0.3);
            }}
            style={{
              width: 70,
              background: 'rgba(255,255,255,0.02)',
              color: '#c5cfda',
              border: `1px solid ${NOLAN_PALETTE.borderDim}`,
              borderRadius: 5,
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: 'monospace',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (draftText === text && draftTemperature === temperature)}
            style={{
              border: `1px solid ${NOLAN_PALETTE.border}`,
              background: 'rgba(255,255,255,0.03)',
              color: '#d3dbe5',
              borderRadius: 5,
              fontSize: 9,
              padding: '3px 8px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {saving ? 'saving...' : 'save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftText(text);
              setDraftTemperature(temperature);
              setEditing(false);
            }}
            disabled={saving}
            style={{
              border: `1px solid ${NOLAN_PALETTE.borderDim}`,
              background: 'transparent',
              color: '#a7b0ba',
              borderRadius: 5,
              fontSize: 9,
              padding: '3px 8px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            cancel
          </button>
          {saveMsg ? <span style={{ color: '#8f99a5', fontSize: 9 }}>{saveMsg}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <pre
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: '#c5cfda',
          fontSize: 10,
          lineHeight: 1.42,
          maxHeight: 180,
          overflowY: 'auto',
        }}
      >
        {text}
      </pre>
      <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            border: `1px solid ${NOLAN_PALETTE.border}`,
            background: 'rgba(255,255,255,0.03)',
            color: '#d3dbe5',
            borderRadius: 5,
            fontSize: 9,
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          edit prompt
        </button>
        <span style={{ color: '#8f99a5', fontSize: 9 }}>
          temp: {temperature.toFixed(1)}
        </span>
        {fallbackModel ? (
          <span style={{ color: '#8f99a5', fontSize: 9, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            fallback: {fallbackModel}
          </span>
        ) : null}
        {saveMsg ? <span style={{ color: '#8f99a5', fontSize: 9 }}>{saveMsg}</span> : null}
        {roleKey === 'eval' ? (
          <span style={{ color: '#8f99a5', fontSize: 9 }}>
            eval uses verifier prompt
          </span>
        ) : null}
      </div>
    </div>
  );
}

function row(label: string, value: string | undefined) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: '#7d8691' }}>{label}</span>
      <span
        style={{
          color: '#b8c1cb',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function CodeBreadcrumbs({ path, onJump }: { path?: string; onJump?: (path: string) => void }) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div style={{ color: '#9aa4af', fontSize: 9, marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      <span style={{ color: '#d7dde5' }}>code scope switch:</span>
      {parts.map((part, idx) => {
        const partialPath = parts.slice(0, idx + 1).join('/');
        return (
          <span key={`${part}_${idx}`}>
            {idx > 0 ? ' / ' : ''}
            <button
              type="button"
              onClick={() => onJump?.(partialPath)}
              style={{
                border: 'none',
                background: 'transparent',
                color: idx === parts.length - 1 ? '#d7dde5' : '#9aa4af',
                padding: 0,
                cursor: 'pointer',
                fontSize: 9,
                fontFamily: 'monospace',
              }}
              title={`switch context to ${partialPath}`}
            >
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function kindLabel(kind: MiniContextKind): string {
  if (kind === 'directory') return 'Directory';
  if (kind === 'file') return 'File';
  if (kind === 'task') return 'Task';
  if (kind === 'agent') return 'Agent';
  if (kind === 'workflow') return 'Workflow';
  if (kind === 'project') return 'Project';
  return 'Node';
}

function workflowRuntimeHint(context: MiniContextPayload): string | null {
  if (context.nodeKind !== 'workflow' && context.nodeKind !== 'node') return null;
  const role = String(context.role || '').toLowerCase();
  const low = String(context.label || '').toLowerCase();
  if (low.includes('measure')) return 'measure: fork to verifier + eval';
  if (low.includes('quality')) return 'quality gate: pass -> approval, fail -> retry coder';
  if (low.includes('approval')) return 'approval gate: pass -> deploy';
  if (low.includes('deploy')) return 'deploy: promote runtime result';
  if (role === 'verifier') return 'verifier lane: checks (pass/fail)';
  if (role === 'eval') return 'eval lane: scoring (quality)';
  return null;
}

function ContextCompact({ context, onSearchSelect }: MiniContextProps) {
  if (context.scope === 'project') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 8 }}>
        <ContextSearchPanel compact onSelect={onSearchSelect} />
        <span style={{ color: '#aab3bd', fontSize: 9 }}>Project context</span>
        <span style={{ color: '#78818c' }}>Select a node to inspect details.</span>
        {row('project model', 'expand ↗')}
        {row('level', context.navLevel)}
        {row('source', context.workflowSourceMode)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 8 }}>
      <ContextSearchPanel compact onSelect={onSearchSelect} />
      <span style={{ color: '#aab3bd', fontSize: 9 }}>{context.label || 'Selected node'}</span>
      {row('kind', kindLabel(context.nodeKind))}
      {row('status', context.status)}
      {row('source', context.workflowSourceMode)}
      {row('role', context.role)}
      {row('model', context.model || (context.nodeKind === 'agent' ? 'from preset' : undefined))}
      {(context.nodeKind === 'agent') ? row('change model', 'expand ↗') : null}
      {(context.nodeKind === 'file' || context.nodeKind === 'directory') ? row('path', context.path) : null}
      {workflowRuntimeHint(context) ? (
        <span style={{ color: '#8f99a5', fontSize: 8 }}>
          {workflowRuntimeHint(context)}
        </span>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          color: '#a9b4be',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: 0.45,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          borderRadius: 6,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.01)',
          color: '#c1cad4',
          fontSize: 10,
          lineHeight: 1.45,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FilePreview({ path }: { path: string }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) return;
    setLoading(true);
    setError(null);
    setText('');
    readFileViaApi(path)
      .then((data) => {
        if (cancelled) return;
        const raw = String(data?.content || '');
        setText(raw.slice(0, 2400));
      })
      .catch(() => {
        if (cancelled) return;
        setError('File preview unavailable for this node.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loading) return <span style={{ color: '#8e98a4' }}>Loading file preview...</span>;
  if (error) return <span style={{ color: '#8e98a4' }}>{error}</span>;
  if (!text) return <span style={{ color: '#8e98a4' }}>No readable text preview.</span>;

  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: '#c5cfda',
        fontSize: 10,
        lineHeight: 1.45,
      }}
    >
      {text}
      {text.length >= 2400 ? '\n\n... (truncated)' : ''}
    </pre>
  );
}

function DirectoryTreeView({
  node,
  depth = 0,
  autoExpandDepth = 1,
  onPreviewFile,
  onOpenFile,
  onFocusFile,
}: {
  node: DirectoryTreeNode;
  depth?: number;
  autoExpandDepth?: number;
  onPreviewFile?: (path: string) => void;
  onOpenFile?: (path: string, mode?: 'pane' | 'fullscreen') => void;
  onFocusFile?: (path: string) => void;
}) {
  const activeProjectId = useMCCStore((s) => s.activeProjectId);
  const isDirectory = node.kind === 'directory';
  const isFile = node.kind === 'file';
  const shouldAutoExpand = isDirectory && depth < autoExpandDepth;
  const [expanded, setExpanded] = useState(shouldAutoExpand);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(shouldAutoExpand || (Array.isArray(node.children) && node.children.length > 0));
  const [children, setChildren] = useState<DirectoryTreeNode[]>(Array.isArray(node.children) ? node.children : []);

  useEffect(() => {
    setChildren(Array.isArray(node.children) ? node.children : []);
    setLoadedOnce(shouldAutoExpand || (Array.isArray(node.children) && node.children.length > 0));
    setExpanded(shouldAutoExpand);
  }, [depth, node.children, node.path, shouldAutoExpand]);

  const loadChildren = useCallback(async () => {
    if (!isDirectory || loadingChildren || loadedOnce) return;
    setLoadingChildren(true);
    try {
      const qs = new URLSearchParams({ path: node.path, depth: '1' });
      if (activeProjectId) qs.set('project_id', activeProjectId);
      const res = await fetch(`/api/mcc/directory-tree?${qs.toString()}`);
      const data = await (res.ok ? res.json() : Promise.resolve(null));
      setChildren(Array.isArray(data?.tree?.children) ? data.tree.children : []);
    } catch {
      setChildren([]);
    } finally {
      setLoadedOnce(true);
      setLoadingChildren(false);
    }
  }, [activeProjectId, isDirectory, loadedOnce, loadingChildren, node.path]);

  const handleToggle = useCallback(() => {
    if (!isDirectory) return;
    const next = !expanded;
    setExpanded(next);
    if (next) {
      void loadChildren();
    }
  }, [expanded, isDirectory, loadChildren]);

  useEffect(() => {
    if (shouldAutoExpand) {
      void loadChildren();
    }
  }, [loadChildren, shouldAutoExpand]);

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 12 }}>
      <div style={{ color: isDirectory ? '#d7dde5' : '#9fb3c8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleToggle}
          disabled={!isDirectory}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            padding: 0,
            fontSize: 10,
            cursor: isDirectory ? 'pointer' : 'default',
            fontFamily: 'monospace',
          }}
        >
          {isDirectory ? (expanded ? '▾' : '▸') : '·'} {node.name}
        </button>
        {isFile ? (
          <>
            <button
              type="button"
              onClick={() => onPreviewFile?.(node.path)}
              style={{ border: `1px solid ${NOLAN_PALETTE.borderDim}`, background: 'rgba(255,255,255,0.02)', color: '#c5cfda', borderRadius: 6, padding: '1px 6px', fontSize: 8, cursor: 'pointer' }}
            >
              preview
            </button>
            <button
              type="button"
              onClick={() => onOpenFile?.(node.path, 'pane')}
              style={{ border: `1px solid ${NOLAN_PALETTE.borderDim}`, background: 'rgba(255,255,255,0.02)', color: '#c5cfda', borderRadius: 6, padding: '1px 6px', fontSize: 8, cursor: 'pointer' }}
            >
              open
            </button>
            <button
              type="button"
              onClick={() => onOpenFile?.(node.path, 'fullscreen')}
              style={{ border: `1px solid ${NOLAN_PALETTE.borderDim}`, background: 'rgba(255,255,255,0.02)', color: '#c5cfda', borderRadius: 6, padding: '1px 6px', fontSize: 8, cursor: 'pointer' }}
            >
              full
            </button>
            <button
              type="button"
              onClick={() => onFocusFile?.(node.path)}
              style={{ border: `1px solid ${NOLAN_PALETTE.borderDim}`, background: 'rgba(255,255,255,0.02)', color: '#c5cfda', borderRadius: 6, padding: '1px 6px', fontSize: 8, cursor: 'pointer' }}
            >
              focus
            </button>
          </>
        ) : null}
      </div>
      {isDirectory && expanded ? (
        <>
          {loadingChildren ? (
            <div style={{ marginLeft: 12, color: '#8e98a4' }}>loading...</div>
          ) : null}
          {children.map((child) => (
            <DirectoryTreeView
              key={`${child.kind}:${child.path}`}
              node={child}
              depth={depth + 1}
              autoExpandDepth={autoExpandDepth}
              onPreviewFile={onPreviewFile}
              onOpenFile={onOpenFile}
              onFocusFile={onFocusFile}
            />
          ))}
          {node.truncated ? (
            <div style={{ marginLeft: 12, color: '#8e98a4' }}>... more entries truncated</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LinkedDocActions({
  path,
  source,
  onSearchSelect,
  onPreview,
  onOpenFile,
}: {
  path: string;
  source: string;
  onSearchSelect?: MiniContextProps['onSearchSelect'];
  onPreview?: (path: string) => void;
  onOpenFile?: (path: string, mode?: 'pane' | 'fullscreen') => void;
}) {
  const handleFocus = useCallback(() => {
    onSearchSelect?.({
      path,
      title: path.split('/').slice(-1)[0] || path,
      snippet: `linked ${source} doc`,
      score: 1,
    });
  }, [onSearchSelect, path, source]);

  const handleCopyPath = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(path);
    }
  }, [path]);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => onPreview?.(path)}
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          background: 'rgba(255,255,255,0.02)',
          color: '#c5cfda',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 9,
          cursor: 'pointer',
        }}
      >
        preview
      </button>
      <button
        type="button"
        onClick={handleFocus}
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          background: 'rgba(255,255,255,0.02)',
          color: '#c5cfda',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 9,
          cursor: 'pointer',
        }}
      >
        focus in DAG
      </button>
      <button
        type="button"
        onClick={() => onOpenFile?.(path, 'pane')}
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          background: 'rgba(255,255,255,0.02)',
          color: '#c5cfda',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 9,
          cursor: 'pointer',
        }}
      >
        open in pane
      </button>
      <button
        type="button"
        onClick={() => onOpenFile?.(path, 'fullscreen')}
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          background: 'rgba(255,255,255,0.02)',
          color: '#c5cfda',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 9,
          cursor: 'pointer',
        }}
      >
        open fullscreen
      </button>
      <button
        type="button"
        onClick={handleCopyPath}
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          background: 'rgba(255,255,255,0.02)',
          color: '#c5cfda',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 9,
          cursor: 'pointer',
        }}
      >
        copy path
      </button>
    </div>
  );
}

function ContextSearchPanel({
  compact = false,
  onSelect,
}: {
  compact?: boolean;
  onSelect?: (row: ContextSearchRow) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'keyword' | 'filename'>('keyword');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ContextSearchRow[]>([]);

  const runSearch = async () => {
    const q = String(query || '').trim();
    if (q.length < 2) {
      setRows([]);
      setError('enter at least 2 characters');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mcc/search/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: activeProjectId,
          query: q,
          limit: 8,
          mode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        setRows([]);
        setError(String(data?.detail || data?.error || `HTTP ${res.status}`));
        return;
      }
      const items = Array.isArray(data?.results) ? data.results : [];
      const nextRows: ContextSearchRow[] = items.map((item: any) => ({
        path: String(item?.path || ''),
        title: String(item?.title || item?.path || ''),
        snippet: String(item?.snippet || ''),
        score: Number(item?.score || 0),
      }));
      setRows(nextRows);
      if (nextRows.length === 0) {
        setError('no results');
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* MARKER_165.MCC.CONTEXT_SEARCH.UI_INPUT.V1 */}
      {/* MARKER_165.MCC.CONTEXT_SEARCH.UI_COMPACT_INPUT.V1 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="search in active project..."
          style={{
            flex: 1,
            minWidth: 0,
            background: 'rgba(255,255,255,0.02)',
            color: '#c5cfda',
            border: `1px solid ${NOLAN_PALETTE.borderDim}`,
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 10,
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        {!compact ? (
          <button
            type="button"
            onClick={() => setMode('keyword')}
            style={{
              border: `1px solid ${mode === 'keyword' ? NOLAN_PALETTE.border : NOLAN_PALETTE.borderDim}`,
              background: mode === 'keyword' ? 'rgba(255,255,255,0.04)' : 'transparent',
              color: '#c5cfda',
              borderRadius: 6,
              fontSize: 9,
              padding: '4px 7px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            KEY
          </button>
        ) : null}
        {!compact ? (
          <button
            type="button"
            onClick={() => setMode('filename')}
            style={{
              border: `1px solid ${mode === 'filename' ? NOLAN_PALETTE.border : NOLAN_PALETTE.borderDim}`,
              background: mode === 'filename' ? 'rgba(255,255,255,0.04)' : 'transparent',
              color: '#c5cfda',
              borderRadius: 6,
              fontSize: 9,
              padding: '4px 7px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            FILE
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => { void runSearch(); }}
          disabled={loading}
          style={{
            border: `1px solid ${NOLAN_PALETTE.border}`,
            background: 'rgba(255,255,255,0.03)',
            color: '#d3dbe5',
            borderRadius: 6,
            fontSize: 9,
            padding: '4px 8px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {loading ? '...' : 'SEARCH'}
        </button>
      </div>

      {/* MARKER_165.MCC.CONTEXT_SEARCH.UI_RESULTS.V1 */}
      <div
        style={{
          border: `1px solid ${NOLAN_PALETTE.borderDim}`,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.01)',
          maxHeight: compact ? 72 : 180,
          overflowY: 'auto',
          padding: '4px 6px',
        }}
      >
        {rows.length === 0 ? (
          <div style={{ color: '#8f99a5', fontSize: 9, padding: '6px 2px' }}>
            {error || 'type query and press Enter'}
          </div>
        ) : (
          rows.map((row, idx) => (
            <button
              key={`${row.path}_${idx}`}
              type="button"
              onClick={() => onSelect?.(row)}
              title={row.path || row.title}
              style={{
                borderBottom: idx < rows.length - 1 ? `1px solid ${NOLAN_PALETTE.borderDim}` : 'none',
                padding: '6px 2px',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: onSelect ? 'pointer' : 'default',
              }}
            >
              {/* MARKER_165.MCC.CONTEXT_SEARCH.UI_RESULT_SELECT.V1 */}
              <div
                style={{
                  color: '#c5cfda',
                  fontSize: 9,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={row.path || row.title}
              >
                {row.title || row.path}
              </div>
              <div style={{ color: '#8f99a5', fontSize: 8, marginTop: 2 }}>
                {row.snippet || row.path}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ContextExpanded({ context, nodeData, onSearchSelect, onViewArtifact, onOpenFile }: MiniContextProps) {
  const activeProjectId = useMCCStore((s) => s.activeProjectId);
  const contextTaskId = useMemo(
    () => context.taskId || context.activeTaskId || null,
    [context.activeTaskId, context.taskId],
  );
  const { loading: packetLoading, packet } = useTaskContextPacket(contextTaskId);
  const [selectedDocPath, setSelectedDocPath] = useState<string>('');
  const [directoryGenerations, setDirectoryGenerations] = useState(1);
  const { loading: directoryLoading, tree: directoryTree } = useDirectoryTree(
    context.nodeKind === 'directory' ? context.path || context.label : null,
    context.nodeKind === 'directory',
    activeProjectId,
  );
  const packetDocs = useMemo(() => {
    const docs = [
      ...((packet?.docs?.architecture_docs || []).map((path) => ({ path, source: 'architecture' }))),
      ...((packet?.docs?.recon_docs || []).map((path) => ({ path, source: 'recon' }))),
      ...((packet?.governance?.depends_on_docs || []).map((path) => ({ path, source: 'depends' }))),
    ];
    const seen = new Set<string>();
    return docs.filter((row) => {
      const path = String(row.path || '').trim();
      if (!path || seen.has(path)) return false;
      seen.add(path);
      return true;
    });
  }, [packet]);

  useEffect(() => {
    if (!packetDocs.length) {
      setSelectedDocPath('');
      return;
    }
    if (!selectedDocPath || !packetDocs.some((row) => row.path === selectedDocPath)) {
      setSelectedDocPath(packetDocs[0].path);
    }
  }, [packetDocs, selectedDocPath]);

  useEffect(() => {
    setDirectoryGenerations(1);
  }, [context.nodeKind, context.path, context.label]);

  const handleFocusLinkedPath = useCallback((path: string) => {
    onSearchSelect?.({
      path,
      title: path.split('/').slice(-1)[0] || path,
      snippet: 'code scope jump',
      score: 1,
    });
  }, [onSearchSelect]);

  const header = useMemo(
    () => (context.scope === 'project' ? 'Project Context' : `${kindLabel(context.nodeKind)} Context`),
    [context.scope, context.nodeKind],
  );

  return (
    <div style={{ padding: '12px 14px', fontFamily: 'monospace' }}>
      <div style={{ color: NOLAN_PALETTE.text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        {header}
      </div>
      {(context.nodeKind === 'file' || context.nodeKind === 'directory') ? <CodeBreadcrumbs path={context.path || context.label} onJump={handleFocusLinkedPath} /> : null}
      <div
        style={{
          color: '#8f99a5',
          fontSize: 9,
          marginBottom: 10,
          borderBottom: `1px solid ${NOLAN_PALETTE.borderDim}`,
          paddingBottom: 8,
        }}
      >
        Wave A/P4: readable context view.
      </div>

      {context.scope === 'project' ? (
        <>
          <Section title="Scope">
            <div>Canvas root is selected. Click any node to inspect details.</div>
            <div style={{ marginTop: 6 }}>
              level: {context.navLevel} | source mode: {context.workflowSourceMode}
            </div>
          </Section>
          <Section title="Project Architect">
            <div style={{ color: '#9aa4af', marginBottom: 6 }}>
              default model for project-level chat
            </div>
            <AgentModelBinder role="architect" model={undefined} />
          </Section>
          <Section title="Search">
            <ContextSearchPanel onSelect={onSearchSelect} />
          </Section>
          <Section title="Selection">
            focused ids: {context.selectedNodeIds.length}
          </Section>
        </>
      ) : (
        <>
          <Section title={(context.nodeKind === 'file' || context.nodeKind === 'directory') ? 'Code Summary' : 'Summary'}>
            <div>{context.label}</div>
            <div style={{ marginTop: 6 }}>
              type: {kindLabel(context.nodeKind)}
              {context.status ? ` | status: ${context.status}` : ''}
            </div>
            <div style={{ marginTop: 6 }}>
              source mode: {context.workflowSourceMode}
            </div>
            {workflowRuntimeHint(context) ? (
              <div style={{ marginTop: 6 }}>
                {workflowRuntimeHint(context)}
              </div>
            ) : null}
            {context.path ? <div style={{ marginTop: 6 }}>path: {context.path}</div> : null}
          </Section>

          {context.nodeKind === 'agent' ? (
            <Section title="Agent">
              <div>role: {context.role || '-'}</div>
              <div style={{ marginTop: 6 }}>model: {context.model || '-'}</div>
              <div style={{ marginTop: 6 }}>task: {context.taskId || '-'}</div>
              <AgentModelBinder role={context.role} model={context.model} />
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${NOLAN_PALETTE.borderDim}` }}>
                <div style={{ color: '#8f99a5', fontSize: 9, marginBottom: 6 }}>
                  role preprompt
                </div>
                <AgentPromptPreview role={context.role} />
              </div>
            </Section>
          ) : null}

          {context.nodeKind === 'task' ? (
            <Section title="Task">
              <div>task id: {context.taskId || '-'}</div>
              <div style={{ marginTop: 6 }}>graph kind: {context.graphKind || '-'}</div>
              {packet?.governance?.ownership_scope ? (
                <div style={{ marginTop: 6 }}>scope: {packet.governance.ownership_scope}</div>
              ) : null}
            </Section>
          ) : null}

          {(context.nodeKind === 'task' || context.nodeKind === 'agent' || context.nodeKind === 'workflow' || context.nodeKind === 'node') && contextTaskId ? (
            <Section title="Task Packet">
              {packetLoading ? (
                <div style={{ color: '#8e98a4' }}>Loading task packet...</div>
              ) : packet ? (
                <>
                  <div>task packet: {packet.task?.id || contextTaskId}</div>
                  {packet.governance?.owner_agent ? (
                    <div style={{ marginTop: 6 }}>owner: {packet.governance.owner_agent}</div>
                  ) : null}
                  {packet.gaps && packet.gaps.length ? (
                    <div style={{ marginTop: 6 }}>gaps: {packet.gaps.join(' | ')}</div>
                  ) : null}
                  {packet.code_scope?.closure_files?.length ? (
                    <div style={{ marginTop: 6 }}>
                      closure files: {packet.code_scope.closure_files.slice(0, 3).join(', ')}
                    </div>
                  ) : null}
                  {packet.tests?.closure_tests?.length ? (
                    <div style={{ marginTop: 6 }}>
                      closure tests: {packet.tests.closure_tests.slice(0, 2).join(' | ')}
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: '#8e98a4' }}>Task packet unavailable for this node.</div>
              )}
            </Section>
          ) : null}

          {(context.nodeKind === 'task' || context.nodeKind === 'agent' || context.nodeKind === 'workflow' || context.nodeKind === 'node') && contextTaskId ? (
            <Section title="Documents">
              {packetLoading ? (
                <div style={{ color: '#8e98a4' }}>Loading linked documents...</div>
              ) : !packetDocs.length ? (
                <div style={{ color: '#8e98a4' }}>No linked documents in the current task packet.</div>
              ) : (
                <>
                  <div style={{ color: '#9aa4af', marginBottom: 8 }}>
                    linked docs: {packetDocs.length} | click to preview
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {packetDocs.map((row) => {
                      const active = row.path === selectedDocPath;
                      return (
                        <div
                          key={`${row.source}:${row.path}`}
                          style={{
                            border: `1px solid ${active ? '#7ee787' : NOLAN_PALETTE.borderDim}`,
                            background: active ? 'rgba(126,231,135,0.12)' : 'rgba(255,255,255,0.02)',
                            color: active ? '#d7ffe0' : '#c5cfda',
                            borderRadius: 8,
                            padding: '6px 8px',
                            minWidth: 150,
                          }}
                          title={row.path}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDocPath(row.path)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'inherit',
                              padding: 0,
                              fontSize: 9,
                              cursor: 'pointer',
                              display: 'block',
                              textAlign: 'left',
                              width: '100%',
                            }}
                          >
                            {row.source}: {row.path.split('/').slice(-1)[0]}
                          </button>
                          <div style={{ color: '#8f99a5', fontSize: 8, marginTop: 4 }}>
                            {row.path}
                          </div>
                          <LinkedDocActions
                            path={row.path}
                            source={row.source}
                            onSearchSelect={onSearchSelect}
                            onPreview={setSelectedDocPath}
                            onOpenFile={onOpenFile}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {selectedDocPath ? (
                    <>
                      <div style={{ color: '#8f99a5', fontSize: 9, marginBottom: 6 }}>
                        previewing: {selectedDocPath}
                      </div>
                      <FilePreview path={selectedDocPath} />
                    </>
                  ) : null}
                </>
              )}
            </Section>
          ) : null}

          {context.nodeKind === 'directory' ? (
            <Section title="Directory">
              <div>directory path: {context.path || context.label}</div>
              <div style={{ marginTop: 8, color: '#8f99a5', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span>showing: {descendantLabel(directoryGenerations)}</span>
                {[1, 2, 3].map((level) => {
                  const active = directoryGenerations === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDirectoryGenerations(level)}
                      style={{
                        border: `1px solid ${active ? '#7ee787' : NOLAN_PALETTE.borderDim}`,
                        background: active ? 'rgba(126,231,135,0.12)' : 'rgba(255,255,255,0.02)',
                        color: active ? '#d7ffe0' : '#c5cfda',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 9,
                        cursor: 'pointer',
                      }}
                    >
                      {descendantLabel(level)}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setDirectoryGenerations((prev) => Math.min(prev + 1, 6))}
                  style={{
                    border: `1px solid ${NOLAN_PALETTE.borderDim}`,
                    background: 'rgba(255,255,255,0.02)',
                    color: '#c5cfda',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 9,
                    cursor: 'pointer',
                  }}
                >
                  +1 deeper
                </button>
              </div>
              {directoryLoading ? (
                <div style={{ marginTop: 6, color: '#98a3af' }}>Loading directory tree...</div>
              ) : directoryTree ? (
                <div style={{ marginTop: 8 }}>
                  <DirectoryTreeView
                    node={directoryTree}
                    autoExpandDepth={directoryGenerations}
                    onPreviewFile={setSelectedDocPath}
                    onOpenFile={onOpenFile}
                    onFocusFile={handleFocusLinkedPath}
                  />
                </div>
              ) : (
                <div style={{ marginTop: 6, color: '#98a3af' }}>
                  Directory tree unavailable for this node.
                </div>
              )}
            </Section>
          ) : null}

          {context.nodeKind === 'file' && context.path ? (
            <Section title="File Preview">
              <LinkedDocActions path={context.path} source="file" onSearchSelect={onSearchSelect} onPreview={() => {}} onOpenFile={onOpenFile} />
              <FilePreview path={context.path} />
            </Section>
          ) : null}

          {(context.nodeKind === 'task' || context.nodeKind === 'agent' || context.nodeKind === 'node' || context.nodeKind === 'workflow') && nodeData ? (
            <Section title="Stream / Output / Artifacts">
              <div style={{ height: 320, minHeight: 220 }}>
                <NodeStreamView node={nodeData} onViewArtifact={onViewArtifact} />
              </div>
            </Section>
          ) : null}

          {context.nodeKind === 'node' || context.nodeKind === 'workflow' ? (
            <Section title="Details">
              <div>graph kind: {context.graphKind || '-'}</div>
              <div style={{ marginTop: 6 }}>node id: {context.nodeId || '-'}</div>
            </Section>
          ) : null}

          <Section title="Search">
            <ContextSearchPanel onSelect={onSearchSelect} />
          </Section>
        </>
      )}
    </div>
  );
}

export function MiniContext({ context, nodeData, onSearchSelect, onViewArtifact, onOpenFile }: MiniContextProps) {
  return (
    <MiniWindow
      windowId="context"
      title="Context"
      icon="👁"
      position="bottom-right"
      compactWidth={220}
      compactHeight={190}
      compactContent={<ContextCompact context={context} onSearchSelect={onSearchSelect} />}
      expandedContent={
        <ContextExpanded
          context={context}
          nodeData={nodeData}
          onSearchSelect={onSearchSelect}
          onViewArtifact={onViewArtifact}
          onOpenFile={onOpenFile}
        />
      }
    />
  );
}
