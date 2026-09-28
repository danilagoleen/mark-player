/**
 * WorkflowProgress - Visual progress indicator for multi-step workflows.
 * Shows PM, Architect, Dev, QA, Merge, and Ops steps.
 *
 * @status active
 * @phase 96
 * @depends lucide-react, WorkflowStatus type
 * @used_by ChatPanel
 */

import { Loader2 } from 'lucide-react';
import type { WorkflowStatus } from '../../types/chat';

const STEPS = ['pm', 'architect', 'dev', 'qa', 'merge', 'ops'];
const STEP_LABELS: Record<string, string> = {
  pm: 'PM',
  architect: 'Arch',
  dev: 'Dev',
  qa: 'QA',
  merge: 'Merge',
  ops: 'Ops',
};

interface Props {
  workflow: WorkflowStatus;
}

export function WorkflowProgress({ workflow }: Props) {
  const currentIndex = STEPS.indexOf(workflow.step);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      background: '#1a1a1a',
      borderRadius: 4,
    }}>
      {STEPS.slice(0, 4).map((step, i) => (
        <div
          key={step}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i < currentIndex
                ? '#4a9eff'
                : i === currentIndex
                  ? '#4aff9e'
                  : '#333',
              transition: 'background 0.3s',
            }}
          />
          <span style={{
            fontSize: 9,
            color: i === currentIndex ? '#4aff9e' : '#666',
            fontWeight: i === currentIndex ? 600 : 400,
          }}>
            {STEP_LABELS[step]}
          </span>
        </div>
      ))}
      {workflow.status === 'running' && (
        <Loader2
          size={12}
          style={{
            marginLeft: 4,
            color: '#4aff9e',
            animation: 'spin 1s linear infinite',
          }}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
