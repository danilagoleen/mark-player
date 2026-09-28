/**
 * MARKER_154.12A: MiniChat — compact chat overlay in DAG canvas.
 *
 * Compact: single input line + last response.
 * Expanded: full ArchitectChat with history.
 * Position: top-left.
 *
 * @phase 154
 * @wave 4
 * @status active
 */

// @ts-nocheck
// TODO (chat-extract): VETKA-specific imports — adapter required:
//   ../../store/useMCCStore  → @vetka/adapter-store
//   ../../config/api.config  → @vetka/adapter-config
//   ../../utils/dagLayout    → @vetka/adapter-utils
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MiniWindow } from './MiniWindow';
import { NOLAN_PALETTE } from '../../utils/dagLayout';
import type { MiniContextPayload } from './MiniContext';
import { useMCCStore } from '../../store/useMCCStore';
// MARKER_176.15: Centralized MCC API config import.
import { API_BASE } from '../../config/api.config';
import type { MycoHelperMode } from '../../store/useMCCStore';
import { resolveMiniChatCompactAvatar, resolveMiniStatsCompactRoleAsset, resolveRoleMotionAsset, resolveSystemMycoAsset, type MycoRolePreviewRole } from './mycoRolePreview';


interface MiniChatProps {
  context?: MiniContextPayload;
}

const MYCO_MODE_ORDER: MycoHelperMode[] = ['off', 'passive'];
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

function buildQuickChatNodePath(context: MiniContextPayload | undefined, role: string): string {
  const raw = String(
    context?.path
      || context?.taskId
      || context?.nodeId
      || context?.workflowId
      || context?.label
      || 'project',
  ).trim();
  const scope = String(context?.scope || 'project').trim().toLowerCase() || 'project';
  return `mcc::${role}::${scope}::${raw}`;
}


function nextMycoMode(mode: MycoHelperMode): MycoHelperMode {
  const idx = MYCO_MODE_ORDER.indexOf(mode);
  if (idx < 0) return 'off';
  return MYCO_MODE_ORDER[(idx + 1) % MYCO_MODE_ORDER.length];
}

type MycoAvatarVisualState = 'idle' | 'speaking' | 'ready';

function isMycoTrigger(message: string): boolean {
  const m = String(message || '').trim().toLowerCase();
  return m.startsWith('/myco') || m.startsWith('/help myco') || m === '?';
}

function emitMycoReplyEvent() {
  window.dispatchEvent(new CustomEvent('mcc-myco-reply', {
    detail: { ts: Date.now() },
  }));
}

// MARKER_164.P5.P1.MYCO.CHAT_STATUS_AWARE_NEXT_ACTIONS.V1:
// Chat guidance must branch by canonical task status with actionable next steps.
function buildWorkflowStatusAction(taskStatus: string): string {
  return taskStatus === 'running'
    ? 'monitor Stats/stream -> wait verify/eval gate -> retry only on fail'
    : taskStatus === 'done'
      ? 'inspect artifacts/result -> pick next queued/pending task in Tasks, else run targeted retry'
      : taskStatus === 'failed'
        ? 'open Context -> inspect failure cause -> retry from Tasks with corrected model/prompt'
        : 'start from Tasks -> then inspect Context/stream and iterate';
}

function buildWorkflowRoleGuidance(params: {
  role: string;
  label: string;
  kind: string;
  familyHint: string;
  statusAction: string;
}): string {
  const { role, label, kind, familyHint, statusAction } = params;
  const labelLow = label.toLowerCase();
  if (role === 'architect') {
    return `workflow is open; architect selected (${familyHint})\n- next: define/adjust subtasks -> choose team preset (Dragons/Titans/G3/Ralph) -> ${statusAction}`;
  }
  // MARKER_164.P5.P4.MYCO.SCOUT_RESEARCH_GUIDANCE_SPLIT.V1:
  // Recon roles must not collapse into generic agent guidance.
  if (role === 'scout') {
    return `workflow is open; scout selected (${familyHint})\n- next: inspect impacted files/deps in Context -> map code surface -> hand findings to coder/architect -> ${statusAction}`;
  }
  if (role === 'researcher') {
    return `workflow is open; researcher selected (${familyHint})\n- next: inspect docs/web evidence -> confirm approach/constraints -> hand findings to coder/architect -> ${statusAction}`;
  }
  if (role === 'coder') {
    return `coder selected (${familyHint})\n- next: open Context -> verify model/prompt -> ${statusAction}`;
  }
  // MARKER_164.P5.P4.MYCO.VERIFIER_EVAL_GUIDANCE_SPLIT.V1:
  // Verifier and eval agent need distinct next-step language.
  if (role === 'verifier') {
    return `verifier selected (${familyHint})\n- next: inspect acceptance criteria in Context -> verify code/output completeness -> ${statusAction}`;
  }
  if (role === 'eval') {
    return `eval selected (${familyHint})\n- next: inspect score/quality signals -> compare result vs target -> ${statusAction}`;
  }
  // MARKER_164.P5.P4.MYCO.QUALITY_DEPLOY_GUIDANCE_BRANCHES.V1:
  // Workflow artifact/gate nodes need explicit branch-aware guidance.
  if (kind === 'condition' || labelLow.includes('quality')) {
    return `quality gate selected (${familyHint})\n- next: inspect verifier/eval inputs -> decide retry vs approval path -> ${statusAction}`;
  }
  if (labelLow.includes('approval')) {
    return `approval gate selected (${familyHint})\n- next: review release decision -> approve deploy or send back to coder -> ${statusAction}`;
  }
  if (labelLow.includes('deploy')) {
    return `deploy step selected (${familyHint})\n- next: verify approval passed -> confirm release target -> ${statusAction}`;
  }
  if (labelLow.includes('measure')) {
    return `measure step selected (${familyHint})\n- next: inspect telemetry/test output -> feed verifier/eval -> ${statusAction}`;
  }
  return `workflow is open and agent ${role || label} is selected (${familyHint})\n- next: open Context -> check model/prompt -> ${statusAction}`;
}

function buildMycoReply(context?: MiniContextPayload): string {
  const level = String(context?.navLevel || 'roadmap');
  const kind = String(context?.nodeKind || 'project');
  const graphKind = String(context?.graphKind || '');
  const label = String(context?.label || 'project');
  const role = String(context?.role || '').toLowerCase().trim();
  const workflowFamily = String(context?.workflowFamily || '').trim();
  const familyHint =
    workflowFamily === 'dragons'
      ? 'Dragons: faster + cheaper'
      : workflowFamily === 'titans'
        ? 'Titans: smarter + costlier'
        : workflowFamily === 'g3'
          ? 'G3: critic + coder'
          : workflowFamily === 'ralph_loop'
            ? 'Ralph loop: single-agent'
            : workflowFamily
              ? `${workflowFamily} workflow`
              : 'BMAD/default workflow';
  const taskDrillExpanded = context?.taskDrillState === 'expanded' || Boolean(context?.workflowInlineExpanded);
  const nodeUnfoldExpanded = context?.roadmapNodeDrillState === 'expanded' || Boolean(context?.roadmapNodeInlineExpanded);
  const workflowNodeContext = graphKind.startsWith('workflow_') || (kind === 'agent' && Boolean(context?.workflowId));
  const inWorkflow = level === 'workflow' || taskDrillExpanded || workflowNodeContext;
  const scopeLine = `you are in ${level} view`;
  const taskStatus = String(context?.status || '').toLowerCase().trim();
  const statusAction = buildWorkflowStatusAction(taskStatus);
  const windowFocus = String(context?.windowFocus || '').toLowerCase();
  const windowFocusState = String(context?.windowFocusState || '').toLowerCase();
  if (windowFocus === 'balance') {
    return `MYCO\n- ${scopeLine}\n- Balance window ${windowFocusState || 'focused'}\n- next: choose active API key (★) -> verify provider/model -> check cost/in-out before run`;
  }
  if (windowFocus === 'stats') {
    return `MYCO\n- ${scopeLine}\n- Stats window ${windowFocusState || 'focused'}\n- next: inspect scope/diagnostics -> verify success/cost -> then adjust task or model`;
  }
  if (windowFocus === 'tasks') {
    return `MYCO\n- ${scopeLine}\n- Tasks window ${windowFocusState || 'focused'}\n- next: select active task -> start/stop/retry -> monitor status + heartbeat`;
  }
  if (windowFocus === 'context') {
    return `MYCO\n- ${scopeLine}\n- Context window ${windowFocusState || 'focused'}\n- next: inspect role/model/prompt -> switch model if needed -> then run from Tasks`;
  }
  if (windowFocus === 'chat') {
    return `MYCO\n- ${scopeLine}\n- Chat window ${windowFocusState || 'focused'}\n- next: ask for concrete next steps on current node/task -> execute from Tasks`;
  }
  if (taskDrillExpanded || workflowNodeContext) {
    // MARKER_164.P5.P3.MYCO.WORKFLOW_NODE_PRIORITY_OVER_UNFOLD.V1:
    // If workflow node/agent is selected, keep workflow guidance priority over module-unfold fallback.
    // MARKER_162.P4.P2.MYCO.CHAT_REPLY_STATE_MATRIX.V1:
    // MARKER_162.P4.P4.MYCO.CHAT_REPLY_NODE_ROLE_WORKFLOW_MATRIX.V1:
    // Post-drill guidance matrix expanded by role + workflow family.
    // MARKER_164.P5.P4.MYCO.WORKFLOW_ROLE_STATUS_DEPTH_MATRIX.V1:
    // Workflow-open MYCO chat must branch by role/gate with status-aware next actions.
    if (kind === 'agent') {
      return `MYCO\n- ${scopeLine}\n- ${buildWorkflowRoleGuidance({ role, label, kind, familyHint, statusAction })}`;
    }
    if (kind === 'condition' || String(label || '').toLowerCase().includes('quality') || String(label || '').toLowerCase().includes('approval') || String(label || '').toLowerCase().includes('deploy') || String(label || '').toLowerCase().includes('measure')) {
      return `MYCO\n- ${scopeLine}\n- ${buildWorkflowRoleGuidance({ role, label, kind, familyHint, statusAction })}`;
    }
    if (kind === 'task' || graphKind === 'project_task') {
      return `MYCO\n- ${scopeLine}\n- task is active and workflow opened (${familyHint})\n- next: select agent node -> open Context -> ${statusAction}`;
    }
    // MARKER_164.P5.P4.MYCO.WORKFLOW_OPEN_NO_GENERIC_ROADMAP_FALLBACK.V1:
    // Once workflow focus is established, chat guidance must stay workflow-specific.
    return `MYCO\n- ${scopeLine}\n- workflow is already open for the active task (${familyHint})\n- next: select an agent node -> inspect Context/stream -> ${statusAction}`;
  }
  if (nodeUnfoldExpanded) {
    return `MYCO\n- ${scopeLine}\n- module unfold is active\n- next: double-click deeper -> pick code node -> create task in Tasks for this scope`;
  }
  if (inWorkflow) {
    return `MYCO\n- ${scopeLine}\n- you are inside workflow context (${familyHint})\n- next: select agent -> inspect Context -> adjust model -> run/retry from Tasks`;
  }
  if (!context || context.scope === 'project') {
    return `MYCO\n- ${scopeLine}\n- this is project-level context\n- next: click a node and ask again`;
  }
  if (kind === 'task') {
    return `MYCO\n- ${scopeLine}\n- selected task: ${label}\n- next: press Enter to drill into workflow`;
  }
  if (kind === 'agent') {
    return `MYCO\n- ${scopeLine}\n- selected agent: ${role || label}\n- next: open Context to review model/prompt`;
  }
  if (kind === 'file' || kind === 'directory') {
    return `MYCO\n- ${scopeLine}\n- selected code scope: ${label}\n- next: inspect Context and linked tasks`;
  }
  return `MYCO\n- ${scopeLine}\n- selected node: ${label}\n- next: ask architect or open Context`;
}

function useChatModelLabel(context?: MiniContextPayload): string {
  const activePreset = useMCCStore((s) => s.activePreset || 'dragon_silver');
  const presets = useMCCStore((s) => s.presets);
  const fetchPresets = useMCCStore((s) => s.fetchPresets);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const presetRoles = ((presets?.[activePreset] as any)?.roles || {}) as Record<string, string>;
  const architectPresetModel = String(presetRoles?.architect || '');
  const roleKey = context?.role ? String(context.role).toLowerCase() : '';
  const effectiveRoleKey = roleKey === 'eval' ? 'verifier' : roleKey;
  const rolePresetModel = effectiveRoleKey ? String(presetRoles?.[effectiveRoleKey] || '') : '';

  if (!context || context.scope === 'project') {
    return architectPresetModel || 'from preset';
  }
  if (context.model) return context.model;
  if (context.nodeKind === 'agent' && rolePresetModel) return rolePresetModel;
  return 'from preset';
}

function useChatRuntimeTarget(context?: MiniContextPayload): { model: string; modelSource?: string } {
  const selectedKey = useMCCStore((s) => s.selectedKey);
  const activePreset = useMCCStore((s) => s.activePreset || 'dragon_silver');
  const presets = useMCCStore((s) => s.presets);
  const fetchPresets = useMCCStore((s) => s.fetchPresets);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const presetRoles = ((presets?.[activePreset] as any)?.roles || {}) as Record<string, string>;
  const roleKey = context?.role ? String(context.role).toLowerCase() : '';
  const effectiveRoleKey = roleKey === 'eval' ? 'verifier' : roleKey;
  const rolePresetModel = effectiveRoleKey ? String(presetRoles?.[effectiveRoleKey] || '') : '';
  const provider = String(selectedKey?.provider || '').toLowerCase().trim();
  const modelSource = provider ? (KEY_PROVIDER_TO_MODEL_SOURCE[provider]?.[0] || provider) : undefined;
  return {
    model: String(context?.model || rolePresetModel || presetRoles?.architect || 'grok-fast-4.1'),
    modelSource,
  };
}

function openContextModelChooser() {
  window.dispatchEvent(new CustomEvent('mcc-miniwindow-open', {
    detail: { windowId: 'context', expanded: true },
  }));
}

function resolveChatScope(context?: MiniContextPayload): { scope: 'project' | 'task' | 'agent' | 'node'; label: string } {
  if (!context || context.scope === 'project') {
    return { scope: 'project', label: 'Project architect' };
  }
  if (context.nodeKind === 'task') {
    return { scope: 'task', label: `Task architect: ${context.label}` };
  }
  if (context.nodeKind === 'agent') {
    return { scope: 'agent', label: `Agent context: ${context.role || context.label}` };
  }
  // MARKER_162.P4.P1.MYCO.NO_FILE_LABEL_NOISE_IN_CHAT.V1:
  // File/node names stay in Context window; chat header remains generic.
  return { scope: 'node', label: 'Node context' };
}

function buildMycoHeaderHint(context?: MiniContextPayload): string {
  if (!context || context.scope === 'project') return 'project context linked';
  if (context.nodeKind === 'task') return `task ${String(context.taskId || context.label || '')} linked`;
  if (context.nodeKind === 'agent') return `${String(context.role || context.label || 'agent')} context`;
  return String(context.label || context.nodeId || 'node context');
}

function buildMycoContextKey(context?: MiniContextPayload): string {
  return [
    String(context?.scope || 'project'),
    String(context?.navLevel || 'roadmap'),
    String(context?.focusScopeKey || ''),
    String(context?.nodeId || ''),
    String(context?.nodeKind || ''),
    String(context?.taskId || ''),
    String(context?.role || ''),
    String(context?.label || ''),
    (context?.selectedNodeIds || []).join('|'),
  ].join('::');
}

// Compact content: one-line input + last answer
function ChatCompact({ context }: MiniChatProps) {
  const [input, setInput] = useState('');
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [lastAnswerSource, setLastAnswerSource] = useState<'helper' | 'assistant' | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scope = useMemo(() => resolveChatScope(context), [context]);
  const modelLabel = useChatModelLabel(context);
  const runtimeTarget = useChatRuntimeTarget(context);
  const contextName = String(context?.label || context?.taskId || 'project');
  const mycoHeaderHint = useMemo(() => buildMycoHeaderHint(context), [context]);
  const helperMode = useMCCStore((s) => s.helperMode);
  const setHelperMode = useMCCStore((s) => s.setHelperMode);
  const [mycoAvatarState, setMycoAvatarState] = useState<MycoAvatarVisualState>('idle');
  const mycoAvatarTimersRef = useRef<number[]>([]);
  const proactiveContextKeyRef = useRef<string>('');
  const compactTriggerTimerRef = useRef<number | null>(null);
  const [compactTriggerRoleAvatar, setCompactTriggerRoleAvatar] = useState<string | null>(null);
  const compactRoleAvatar = useMemo(() => {
    return resolveMiniStatsCompactRoleAsset(context);
  }, [context]);
  const mycoAvatarSrc = useMemo(() => {
    // MARKER_168.MYCO.RUNTIME.MINI_CHAT_COMPACT_ROLE_PREVIEW.V1:
    // Compact MiniChat previews role-specific avatar only in architect/role mode.
    // In helper mode the compact chat must remain visually MYCO-aligned with the top helper.
    if (helperMode !== 'off') {
      // MARKER_168.MYCO.RUNTIME.MINI_CHAT_COMPACT_HELPER_STAYS_MYCO.V1:
      // Clicking top MYCO must never transiently replace chat MYCO with architect/role avatar.
      return resolveSystemMycoAsset(mycoAvatarState);
    }
    if (helperMode === 'off' && (compactTriggerRoleAvatar || compactRoleAvatar)) {
      // MARKER_168.MYCO.RUNTIME.MINI_CHAT_COMPACT_ROLE_STICKY.V1:
      // Once chat is in architect/role mode, compact avatar must stay on that role instead of
      // falling back to idle MYCO after the initial speaking animation ends.
      return compactTriggerRoleAvatar || compactRoleAvatar;
    }
    return resolveMiniChatCompactAvatar(context, mycoAvatarState);
  }, [compactRoleAvatar, compactTriggerRoleAvatar, context, helperMode, mycoAvatarState]);

  useEffect(() => {
    // MARKER_162.P4.P1.MYCO.OFF_MODE_NO_HELPER_ECHO.V1:
    // When helper is off (architect mode), stale helper reply must not stay visible in compact chat.
    if (helperMode !== 'off') return;
    if (lastAnswerSource === 'helper') {
      setLastAnswer(null);
      setLastAnswerSource(null);
    }
  }, [helperMode, lastAnswerSource]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const message = String(detail.message || '').trim();
      if (!message) return;
      setInput(message);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('mcc-chat-prefill', handlePrefill as EventListener);
    return () => window.removeEventListener('mcc-chat-prefill', handlePrefill as EventListener);
  }, []);

  useEffect(() => {
    const onActivate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const force = Boolean(detail.force);
      // MARKER_162.P2.MYCO.TOP_ACTIVATE_RACE_GUARD.V1:
      // `force` allows deterministic first response on top->chat handoff.
      if (helperMode === 'off' && !force) return;
      emitMycoReplyEvent();
      setLastAnswer(buildMycoReply(context));
      setLastAnswerSource('helper');
    };
    window.addEventListener('mcc-myco-activate', onActivate as EventListener);
    return () => window.removeEventListener('mcc-myco-activate', onActivate as EventListener);
  }, [context, helperMode]);

  useEffect(() => {
    // MARKER_162.P4.P1.MYCO.CONTEXT_PROACTIVE_CHAT_COMPACT.V1:
    // In helper mode, proactively answer on meaningful context change (deduped by stable key).
    if (helperMode === 'off') {
      setLastAnswerSource(null);
      proactiveContextKeyRef.current = '';
      return;
    }
    const key = `compact:${helperMode}:${buildMycoContextKey(context)}`;
    if (proactiveContextKeyRef.current === key) return;
    proactiveContextKeyRef.current = key;
    emitMycoReplyEvent();
    setLastAnswer(buildMycoReply(context));
    setLastAnswerSource('helper');
  }, [context, helperMode]);

  useEffect(() => {
    const clearTimers = () => {
      mycoAvatarTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      mycoAvatarTimersRef.current = [];
    };
    const onMycoReply = () => {
      clearTimers();
      setMycoAvatarState('speaking');
      const readyTimer = window.setTimeout(() => setMycoAvatarState('ready'), 1500);
      const idleTimer = window.setTimeout(() => setMycoAvatarState('idle'), 3900);
      mycoAvatarTimersRef.current = [readyTimer, idleTimer];
    };
    window.addEventListener('mcc-myco-reply', onMycoReply as EventListener);
    return () => {
      window.removeEventListener('mcc-myco-reply', onMycoReply as EventListener);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (helperMode === 'off') return;
    // MARKER_168.MYCO.RUNTIME.MINI_CHAT_TRIGGER_RESET_ON_HELPER.V1:
    // Leaving role-specific architect mode must clear transient role pulses so helper mode
    // always re-enters with canonical MYCO visuals.
    if (compactTriggerTimerRef.current !== null) {
      window.clearTimeout(compactTriggerTimerRef.current);
      compactTriggerTimerRef.current = null;
    }
    setCompactTriggerRoleAvatar(null);
  }, [helperMode]);

  useEffect(() => {
    const clearTriggerTimer = () => {
      if (compactTriggerTimerRef.current !== null) {
        window.clearTimeout(compactTriggerTimerRef.current);
        compactTriggerTimerRef.current = null;
      }
    };
    const onModelUpdated = (event: Event) => {
      if (helperMode !== 'off') return;
      if (context?.nodeKind !== 'agent' && !context?.role) return;
      const detail = (event as CustomEvent).detail || {};
      const normalized = String(detail.role || '').trim().toLowerCase();
      const resolvedRole: MycoRolePreviewRole | null =
        normalized === 'eval'
          ? 'verifier'
          : (normalized === 'architect' || normalized === 'coder' || normalized === 'researcher' || normalized === 'scout' || normalized === 'verifier'
              ? normalized
              : null);
      if (!resolvedRole) return;
      const asset = resolveRoleMotionAsset(
        resolvedRole,
        `model_selected:${normalized}:${String(context?.taskId || '')}:${String(context?.nodeId || '')}`,
      );
      if (!asset) return;
      // MARKER_168.MYCO.RUNTIME.MINI_CHAT_MODEL_SELECTED_TRANSITION.V1:
      // Model changes may briefly pulse the active role in compact chat, but only inside
      // role-specific agent context so architect/task chat is not hijacked.
      setCompactTriggerRoleAvatar(asset);
      clearTriggerTimer();
      compactTriggerTimerRef.current = window.setTimeout(() => {
        setCompactTriggerRoleAvatar(null);
        compactTriggerTimerRef.current = null;
      }, 2200);
    };
    window.addEventListener('mcc-model-updated', onModelUpdated as EventListener);
    return () => {
      window.removeEventListener('mcc-model-updated', onModelUpdated as EventListener);
      clearTriggerTimer();
    };
  }, [context?.nodeId, context?.nodeKind, context?.role, context?.taskId, helperMode]);

  const handleSend = useCallback(async () => {
    // MARKER_162.P4.P1.MYCO.COMPACT_NO_STALE_SETMESSAGES.V1:
    // Compact mode owns `lastAnswer` only; avoid expanded-chat state writes here.
    if (!input.trim() || loading) return;
    const message = input.trim();
    setInput('');
    setLastQuestion(message);
    if (isMycoTrigger(message) && helperMode !== 'off') {
      emitMycoReplyEvent();
      setLastAnswer(buildMycoReply(context));
      setLastAnswerSource('helper');
      return;
    }
    setLoading(true);
    setLastAnswer(null);

    try {
      const res = await fetch(`${API_BASE}/chat/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          role: helperMode !== 'off' ? 'helper_myco' : 'architect',
          context: {
            // MARKER_162.P4.P3.MYCO.CHAT_CONTEXT_DRILL_FIELDS.V1:
            // Send drill-state context so backend MYCO retrieval can key on real UI scenario.
            helper_mode: helperMode,
            chat_scope: scope.scope,
            nav_level: context?.navLevel,
            active_task_id: context?.activeTaskId,
            task_drill_state: context?.taskDrillState,
            roadmap_node_drill_state: context?.roadmapNodeDrillState,
            workflow_inline_expanded: context?.workflowInlineExpanded,
            roadmap_node_inline_expanded: context?.roadmapNodeInlineExpanded,
            window_focus: context?.windowFocus,
            window_focus_state: context?.windowFocusState,
            focus_scope_key: context?.focusScopeKey,
            node_id: context?.nodeId,
            node_kind: context?.nodeKind,
            task_id: context?.taskId,
            role: context?.role,
            graph_kind: context?.graphKind,
            workflow_id: context?.workflowId,
            team_profile: context?.teamProfile,
            workflow_family: context?.workflowFamily,
            label: context?.label,
            status: context?.status,
            model: runtimeTarget.model,
            model_source: runtimeTarget.modelSource,
            selected_key_provider: useMCCStore.getState().selectedKey?.provider || '',
            node_path: buildQuickChatNodePath(context, helperMode !== 'off' ? 'helper_myco' : 'architect'),
            path: context?.path,
            selected_node_ids: context?.selectedNodeIds || [],
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (helperMode !== 'off') emitMycoReplyEvent();
      setLastAnswer(data.response || data.message || '(no response)');
      setLastAnswerSource(helperMode !== 'off' ? 'helper' : 'assistant');
    } catch (err) {
      setLastAnswer('⚠ Failed to get response');
      setLastAnswerSource(helperMode !== 'off' ? 'helper' : 'assistant');
    } finally {
      setLoading(false);
    }
  }, [context, helperMode, input, loading, runtimeTarget.model, runtimeTarget.modelSource]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div
          style={{
            color: '#7f8893',
            fontSize: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.35,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
          title={helperMode !== 'off' ? `MYCO context: ${contextName}` : scope.label}
        >
          {helperMode !== 'off' ? (
            <button
              type="button"
              // MARKER_162.P2.MYCO.CHAT_SINGLE_LEFT_ANCHOR.V1:
              // In chat mode keep one MYCO anchor on the left; remove duplicated right-side icon.
              onClick={() => setHelperMode(nextMycoMode(helperMode))}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                color: '#b8c2cd',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'inherit',
                fontSize: 8,
              }}
              title="Disable helper and return MYCO to top bar"
            >
              <img
                src={mycoAvatarSrc || undefined}
                alt="Helper avatar"
                style={{ width: 24, height: 34, objectFit: 'contain' }}
              />
              <span style={{ textTransform: 'none', letterSpacing: 0, color: '#b8c2cd' }}>{mycoHeaderHint}</span>
            </button>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {compactRoleAvatar ? (
                <img
                  src={compactRoleAvatar}
                  alt="Architect avatar"
                  style={{ width: 24, height: 34, objectFit: 'contain' }}
                />
              ) : null}
              <span>{scope.label}</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {helperMode === 'off' && (
            <button
              type="button"
              onClick={openContextModelChooser}
              style={{
                border: `1px solid ${NOLAN_PALETTE.borderDim}`,
                background: 'transparent',
                color: '#9aa4af',
                borderRadius: 4,
                fontSize: 8,
                padding: '1px 5px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                maxWidth: 110,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={`Model: ${modelLabel}. Click to open Context model chooser.`}
            >
              {modelLabel}
            </button>
          )}
        </div>
      </div>
      {/* Last answer */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          color: lastAnswer ? NOLAN_PALETTE.textMuted : '#333',
          fontSize: 9,
          lineHeight: 1.4,
        }}
      >
        {lastQuestion ? <div style={{ color: '#697482', marginBottom: 6 }}>you: {lastQuestion.slice(0, 120)}</div> : null}
        {loading ? (
          <span style={{ color: '#555' }}>thinking...</span>
        ) : lastAnswer && !(helperMode === 'off' && lastAnswerSource === 'helper') ? (
          lastAnswer.slice(0, 200)
        ) : (
          helperMode !== 'off'
            ? `Я MYCO. Помочь с "${contextName}"? Нажми два раза, чтобы раскрыть ноду, или дай задание команде.`
            : 'Ask the architect...'
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={helperMode !== 'off' ? 'Ask MYCO...' : 'Ask...'}
          style={{
            flex: 1,
            background: NOLAN_PALETTE.bg,
            border: `1px solid ${NOLAN_PALETTE.border}`,
            borderRadius: 3,
            color: NOLAN_PALETTE.text,
            fontFamily: 'monospace',
            fontSize: 9,
            padding: '3px 6px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            background: NOLAN_PALETTE.bg,
            border: `1px solid ${NOLAN_PALETTE.border}`,
            borderRadius: 3,
            color: input.trim() ? NOLAN_PALETTE.text : '#444',
            fontSize: 9,
            cursor: input.trim() ? 'pointer' : 'default',
            padding: '2px 6px',
            fontFamily: 'monospace',
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}

// Expanded content: placeholder for full ArchitectChat
// In future, this imports and wraps ArchitectChat component with mode='expanded'
function ChatExpanded({ context }: MiniChatProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scope = useMemo(() => resolveChatScope(context), [context]);
  const modelLabel = useChatModelLabel(context);
  const runtimeTarget = useChatRuntimeTarget(context);
  const helperMode = useMCCStore((s) => s.helperMode);
  const setHelperMode = useMCCStore((s) => s.setHelperMode);
  const mycoHeaderHint = useMemo(() => buildMycoHeaderHint(context), [context]);
  const [mycoAvatarState, setMycoAvatarState] = useState<MycoAvatarVisualState>('idle');
  const mycoAvatarTimersRef = useRef<number[]>([]);
  const proactiveContextKeyRef = useRef<string>('');
  const mycoAvatarSrc = useMemo(() => {
    return resolveSystemMycoAsset(mycoAvatarState);
  }, [mycoAvatarState]);
  const historyPath = useMemo(() => buildQuickChatNodePath(context, helperMode !== 'off' ? 'helper_myco' : 'architect'), [context, helperMode]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/chat/history?path=${encodeURIComponent(historyPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const history = Array.isArray(data?.history) ? data.history : [];
        setMessages(history.map((row: any) => ({ role: String(row?.role || 'assistant'), content: String(row?.content || '') })));
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [historyPath]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const message = String(detail.message || '').trim();
      if (!message) return;
      setInput(message);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('mcc-chat-prefill', handlePrefill as EventListener);
    return () => window.removeEventListener('mcc-chat-prefill', handlePrefill as EventListener);
  }, []);

  useEffect(() => {
    // MARKER_162.P4.P1.MYCO.CONTEXT_PROACTIVE_CHAT_EXPANDED.V1:
    // Expanded helper chat mirrors compact proactive guidance on context switch.
    if (helperMode === 'off') {
      proactiveContextKeyRef.current = '';
      return;
    }
    const key = `expanded:${helperMode}:${buildMycoContextKey(context)}`;
    if (proactiveContextKeyRef.current === key) return;
    proactiveContextKeyRef.current = key;
    const reply = buildMycoReply(context);
    emitMycoReplyEvent();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'helper_myco' && last?.content === reply) return prev;
      return [...prev, { role: 'helper_myco', content: reply }];
    });
  }, [context, helperMode]);

  useEffect(() => {
    const clearTimers = () => {
      mycoAvatarTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      mycoAvatarTimersRef.current = [];
    };
    const onMycoReply = () => {
      clearTimers();
      setMycoAvatarState('speaking');
      const readyTimer = window.setTimeout(() => setMycoAvatarState('ready'), 1500);
      const idleTimer = window.setTimeout(() => setMycoAvatarState('idle'), 3900);
      mycoAvatarTimersRef.current = [readyTimer, idleTimer];
    };
    window.addEventListener('mcc-myco-reply', onMycoReply as EventListener);
    return () => {
      window.removeEventListener('mcc-myco-reply', onMycoReply as EventListener);
      clearTimers();
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const message = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    if (isMycoTrigger(message) && helperMode !== 'off') {
      emitMycoReplyEvent();
      setMessages(prev => [...prev, { role: 'helper_myco', content: buildMycoReply(context) }]);
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          role: helperMode !== 'off' ? 'helper_myco' : 'architect',
          context: {
            // MARKER_162.P4.P3.MYCO.CHAT_CONTEXT_DRILL_FIELDS.V1:
            // Send drill-state context so backend MYCO retrieval can key on real UI scenario.
            helper_mode: helperMode,
            chat_scope: scope.scope,
            nav_level: context?.navLevel,
            active_task_id: context?.activeTaskId,
            task_drill_state: context?.taskDrillState,
            roadmap_node_drill_state: context?.roadmapNodeDrillState,
            workflow_inline_expanded: context?.workflowInlineExpanded,
            roadmap_node_inline_expanded: context?.roadmapNodeInlineExpanded,
            window_focus: context?.windowFocus,
            window_focus_state: context?.windowFocusState,
            focus_scope_key: context?.focusScopeKey,
            node_id: context?.nodeId,
            node_kind: context?.nodeKind,
            task_id: context?.taskId,
            role: context?.role,
            graph_kind: context?.graphKind,
            workflow_id: context?.workflowId,
            team_profile: context?.teamProfile,
            workflow_family: context?.workflowFamily,
            label: context?.label,
            status: context?.status,
            model: runtimeTarget.model,
            model_source: runtimeTarget.modelSource,
            selected_key_provider: useMCCStore.getState().selectedKey?.provider || '',
            node_path: buildQuickChatNodePath(context, helperMode !== 'off' ? 'helper_myco' : 'architect'),
            path: context?.path,
            selected_node_ids: context?.selectedNodeIds || [],
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (helperMode !== 'off') {
        emitMycoReplyEvent();
        setMessages(prev => [...prev, { role: 'helper_myco', content: data.response || data.message || '' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response || data.message || '' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠ Error getting response' }]);
    } finally {
      setLoading(false);
    }
  }, [context, helperMode, historyPath, input, loading, runtimeTarget.model, runtimeTarget.modelSource]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        <div
          style={{
            color: '#7f8893',
            fontSize: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.35,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {helperMode !== 'off' ? (
              <button
                type="button"
                onClick={() => setHelperMode(nextMycoMode(helperMode))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  margin: 0,
                  color: '#b8c2cd',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'inherit',
                  fontSize: 8,
                }}
                title="Disable helper and return MYCO to top bar"
              >
                <img
                  src={mycoAvatarSrc || undefined}
                  alt="Helper avatar"
                  style={{ width: 24, height: 34, objectFit: 'contain' }}
                />
                <span style={{ textTransform: 'none', letterSpacing: 0, color: '#b8c2cd' }}>{mycoHeaderHint}</span>
              </button>
            ) : scope.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {helperMode === 'off' && (
              <button
                type="button"
                onClick={openContextModelChooser}
                style={{
                  border: `1px solid ${NOLAN_PALETTE.borderDim}`,
                  background: 'transparent',
                  color: '#9aa4af',
                  borderRadius: 4,
                  fontSize: 8,
                  padding: '1px 6px',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={`Model: ${modelLabel}. Click to open Context model chooser.`}
              >
                model: {modelLabel}
              </button>
            )}
          </div>
        </div>
        {messages.length === 0 && (
          <div style={{ color: '#444', fontSize: 10, textAlign: 'center', marginTop: 40 }}>
            {helperMode !== 'off'
              ? `Я MYCO. Помочь с "${String(context?.label || context?.taskId || 'project')}"?`
              : 'Ask the architect about your project...'}
          </div>
        )}
        {(helperMode === 'off'
          ? messages.filter((m) => m.role !== 'helper_myco')
          : messages
        ).map((msg, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{
              color: msg.role === 'user' ? NOLAN_PALETTE.textAccent : NOLAN_PALETTE.textMuted,
              fontSize: 8,
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              {msg.role === 'user' ? 'YOU' : msg.role === 'helper_myco' ? 'HELPER' : 'ARCHITECT'}
            </div>
            {msg.role === 'helper_myco' ? (
              <div
                // MARKER_162.P2.MYCO.CHAT_BUBBLE_TAIL.V1:
                // MYCO messages render as comic bubble with tail to emphasize speaker identity.
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  maxWidth: '95%',
                  color: NOLAN_PALETTE.text,
                  fontSize: 11,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  background: '#0b0d11',
                  border: `1px solid ${NOLAN_PALETTE.borderDim}`,
                  borderRadius: 10,
                  padding: '7px 9px',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: -9,
                    top: 10,
                    width: 0,
                    height: 0,
                    borderTop: '7px solid transparent',
                    borderBottom: '7px solid transparent',
                    borderRight: `9px solid ${NOLAN_PALETTE.borderDim}`,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: -7,
                    top: 11,
                    width: 0,
                    height: 0,
                    borderTop: '6px solid transparent',
                    borderBottom: '6px solid transparent',
                    borderRight: '8px solid #0b0d11',
                  }}
                />
                {msg.content}
              </div>
            ) : (
              <div style={{
                color: NOLAN_PALETTE.text,
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ color: '#555', fontSize: 10 }}>thinking...</div>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '8px 12px',
        borderTop: `1px solid ${NOLAN_PALETTE.border}`,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          style={{
            flex: 1,
            background: NOLAN_PALETTE.bg,
            border: `1px solid ${NOLAN_PALETTE.border}`,
            borderRadius: 4,
            color: NOLAN_PALETTE.text,
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '6px 10px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            padding: '4px 12px',
            background: input.trim() ? '#1a1a1a' : NOLAN_PALETTE.bg,
            border: `1px solid ${input.trim() ? NOLAN_PALETTE.text : NOLAN_PALETTE.border}`,
            borderRadius: 4,
            color: input.trim() ? NOLAN_PALETTE.text : '#555',
            fontSize: 11,
            cursor: input.trim() ? 'pointer' : 'default',
            fontFamily: 'monospace',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export function MiniChat({ context }: MiniChatProps) {
  return (
    <MiniWindow
      windowId="chat" // MARKER_155.DRAGGABLE.011: Unique ID for position persistence
      title="Chat"
      icon="💬"
      position="bottom-left"
      compactWidth={210}
      compactHeight={130}
      compactContent={<ChatCompact context={context} />}
      expandedContent={<ChatExpanded context={context} />}
    />
  );
}
