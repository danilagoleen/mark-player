/**
 * ReflexInsight — Compact tool selection visibility for REFLEX events.
 *
 * MARKER_174.REFLEX_LIVE
 *
 * Renders REFLEX metadata as inline pills in chat messages:
 * - Recommendation: tool scores as colored pills
 * - Filter: schema reduction summary
 * - Outcome: tools used + feedback count
 * - Verifier: pass/fail status + feedback
 *
 * @status active
 * @phase 174
 * @depends ChatMessage type (reflex metadata)
 * @used_by MessageBubble
 */

import { useState, memo } from 'react';
import { Sparkles, Filter, BarChart3, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';

interface Props {
  message: ChatMessage;
}

/** Score → color mapping for tool pills */
function scoreColor(score: number): string {
  if (score >= 0.8) return '#22c55e'; // green
  if (score >= 0.5) return '#eab308'; // yellow
  return '#ef4444'; // red
}

/** Tier → badge label */
function tierBadge(tier?: string): string {
  if (!tier) return '';
  const labels: Record<string, string> = {
    gold: 'Gold',
    silver: 'Silver',
    bronze: 'Bronze',
  };
  return labels[tier] || tier;
}

function ReflexInsightComponent({ message }: Props) {
  const [expanded, setExpanded] = useState(false);
  const reflex = message.metadata?.reflex;

  if (!reflex) return null;

  const toggle = () => setExpanded(!expanded);
  const ExpandIcon = expanded ? ChevronDown : ChevronRight;

  // Common styles
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '6px',
    background: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.15)',
    fontSize: '11px',
    lineHeight: '16px',
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    flexWrap: 'wrap' as const,
    marginTop: '2px',
    marginBottom: '2px',
  };

  const pillStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '1px 6px',
    borderRadius: '10px',
    background: `${color}20`,
    color: color,
    fontSize: '10px',
    fontWeight: 500,
    fontFamily: 'monospace',
    whiteSpace: 'nowrap' as const,
  });

  const labelStyle: React.CSSProperties = {
    color: 'rgba(139, 92, 246, 0.9)',
    fontWeight: 600,
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  };

  const subtaskStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '10px',
    marginLeft: 'auto',
  };

  // ── Recommendation ──────────────────────────────────────
  if (reflex.event === 'recommendation') {
    const tools = reflex.tools || [];
    return (
      <div style={containerStyle} onClick={toggle} title="REFLEX tool recommendations">
        <Sparkles size={12} color="rgba(139, 92, 246, 0.9)" />
        <span style={labelStyle}>REFLEX</span>
        {tools.slice(0, expanded ? tools.length : 3).map((t) => (
          <span key={t.id} style={pillStyle(scoreColor(t.score ?? 0))}>
            {t.id.replace('vetka_', '')}
            {t.score != null && <span>{t.score.toFixed(2)}</span>}
          </span>
        ))}
        {!expanded && tools.length > 3 && (
          <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '10px' }}>
            +{tools.length - 3}
          </span>
        )}
        {reflex.tier && (
          <span style={pillStyle('rgba(139, 92, 246, 0.8)')}>
            {tierBadge(reflex.tier)}
          </span>
        )}
        <span style={subtaskStyle}>{reflex.subtask}</span>
        <ExpandIcon size={10} color="rgba(255, 255, 255, 0.3)" />
      </div>
    );
  }

  // ── Filter ──────────────────────────────────────────────
  if (reflex.event === 'filter') {
    const orig = reflex.original_count ?? 0;
    const filtered = reflex.filtered_count ?? 0;
    const reduction = orig > 0 ? Math.round(((orig - filtered) / orig) * 100) : 0;
    return (
      <div style={containerStyle} title="REFLEX schema filtering">
        <Filter size={12} color="rgba(234, 179, 8, 0.9)" />
        <span style={labelStyle}>FILTER</span>
        <span style={pillStyle('#eab308')}>
          {orig} → {filtered}
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px' }}>
          -{reduction}%
        </span>
        {reflex.tier && (
          <span style={pillStyle('rgba(139, 92, 246, 0.8)')}>
            {tierBadge(reflex.tier)}
          </span>
        )}
        <span style={subtaskStyle}>{reflex.subtask}</span>
      </div>
    );
  }

  // ── Outcome ─────────────────────────────────────────────
  if (reflex.event === 'outcome') {
    const tools = reflex.tools_used || [];
    return (
      <div style={containerStyle} onClick={toggle} title="REFLEX tool usage outcome">
        <BarChart3 size={12} color="rgba(59, 130, 246, 0.9)" />
        <span style={labelStyle}>USED</span>
        {tools.slice(0, expanded ? tools.length : 3).map((id) => (
          <span key={id} style={pillStyle('#3b82f6')}>
            {id.replace('vetka_', '')}
          </span>
        ))}
        {!expanded && tools.length > 3 && (
          <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '10px' }}>
            +{tools.length - 3}
          </span>
        )}
        {(reflex.feedback_count ?? 0) > 0 && (
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px' }}>
            {reflex.feedback_count} feedback
          </span>
        )}
        <span style={subtaskStyle}>{reflex.subtask}</span>
        <ExpandIcon size={10} color="rgba(255, 255, 255, 0.3)" />
      </div>
    );
  }

  // ── Verifier ────────────────────────────────────────────
  if (reflex.event === 'verifier') {
    const passed = reflex.passed ?? false;
    const Icon = passed ? CheckCircle : XCircle;
    const statusColor = passed ? '#22c55e' : '#ef4444';
    const statusLabel = passed ? 'PASS' : 'FAIL';
    return (
      <div style={containerStyle} title="REFLEX verifier feedback">
        <Icon size={12} color={statusColor} />
        <span style={{ ...labelStyle, color: statusColor }}>{statusLabel}</span>
        {(reflex.tools || []).slice(0, 3).map((id) => (
          <span key={typeof id === 'string' ? id : String(id)} style={pillStyle(statusColor)}>
            {(typeof id === 'string' ? id : '').replace('vetka_', '')}
          </span>
        ))}
        {(reflex.feedback_count ?? 0) > 0 && (
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px' }}>
            {reflex.feedback_count} feedback
          </span>
        )}
        <span style={subtaskStyle}>{reflex.subtask}</span>
      </div>
    );
  }

  // Unknown event type — fallback to nothing
  return null;
}

export const ReflexInsight = memo(ReflexInsightComponent);
