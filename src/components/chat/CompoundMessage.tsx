/**
 * CompoundMessage - Collapsible sections for workflow results.
 * Displays PM plan, architecture, implementation, and tests.
 *
 * @status active
 * @phase 96
 * @depends react, lucide-react, CodeViewer
 * @used_by MessageBubble
 */

import { useState, lazy, Suspense } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Building, Code, TestTube, Loader2 } from 'lucide-react';

const CodeViewer = lazy(() =>
  import('./CodeViewer').then((m) => ({ default: m.CodeViewer as React.ComponentType<{ content: string; filename?: string; readOnly?: boolean }> })).catch(() => ({ default: (({ content }: { content: string }) => <pre style={{ padding: 12, fontSize: 12, overflow: 'auto', background: '#111', borderRadius: 6, color: '#ccc' }}>{content}</pre>) as React.ComponentType<{ content: string }> }))
);

interface Props {
  sections: {
    pm_plan?: string;
    architecture?: string;
    implementation?: string;
    tests?: string;
  };
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  content: string;
  defaultOpen?: boolean;
  isCode?: boolean;
}

function Section({ title, icon, content, defaultOpen = false, isCode = false }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!content) return null;

  return (
    <div style={{
      background: '#111',
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid #222',
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#e0e0e0',
        }}
      >
        {isOpen ? <ChevronDown size={14} color="#666" /> : <ChevronRight size={14} color="#666" />}
        <span style={{ color: '#4a9eff' }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
      </button>

      {isOpen && (
        <div style={{
          borderTop: '1px solid #222',
          maxHeight: isCode ? 400 : 200,
          overflow: 'auto',
        }}>
          {isCode ? (
            <Suspense fallback={
              <div style={{ padding: 20, textAlign: 'center' }}>
                <Loader2 size={20} color="#666" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            }>
              <CodeViewer content={content} filename="code.py" readOnly />
            </Suspense>
          ) : (
            <div style={{
              padding: 12,
              fontSize: 13,
              color: '#aaa',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CompoundMessage({ sections }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <Section
        title="PM Plan"
        icon={<ClipboardList size={14} />}
        content={sections.pm_plan || ''}
      />
      <Section
        title="Architecture"
        icon={<Building size={14} />}
        content={sections.architecture || ''}
      />
      <Section
        title="Implementation"
        icon={<Code size={14} />}
        content={sections.implementation || ''}
        defaultOpen
        isCode
      />
      <Section
        title="Tests"
        icon={<TestTube size={14} />}
        content={sections.tests || ''}
        isCode
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
