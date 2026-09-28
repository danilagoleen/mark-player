/**
 * MentionPopup - Dropdown for @mention autocomplete in chat input.
 * Shows system commands (always), group participants (group mode),
 * or tracked models (solo mode).
 *
 * @status active
 * @phase 117.3b
 * @depends react, lucide-react, MENTION_ALIASES
 * @used_by MessageInput
 */

import {
  ClipboardList,
  Code,
  TestTube,
  Building,
  Brain,
  Terminal,
  Cpu,
  Sparkles,
  Star,
  Search,
  Users,
  Bot,
  Flame,
  Stethoscope,
  GitBranch,
} from 'lucide-react';

const ICONS: Record<string, React.ReactNode> = {
  ClipboardList: <ClipboardList size={14} />,
  Code: <Code size={14} />,
  TestTube: <TestTube size={14} />,
  Building: <Building size={14} />,
  Brain: <Brain size={14} />,
  Terminal: <Terminal size={14} />,
  Cpu: <Cpu size={14} />,
  Sparkles: <Sparkles size={14} />,
  Star: <Star size={14} />,
  Search: <Search size={14} />,
  Users: <Users size={14} />,
  Bot: <Bot size={14} />,
};

// MARKER_117_3B: System commands — always visible in dropdown
const SYSTEM_COMMANDS = [
  { alias: '@dragon', label: 'Dragon (Orchestrator)', icon: <Flame size={14} />, searchAliases: ['dragon', 'build', 'fix'] },
  { alias: '@doctor', label: 'Doctor / Help (Diagnostic)', icon: <Stethoscope size={14} />, searchAliases: ['doctor', 'doc', 'help', 'support', 'diagnose'] },
  { alias: '@mycelium', label: 'Mycelium Pipeline', icon: <GitBranch size={14} />, searchAliases: ['mycelium', 'pipeline', 'spore'] },
];

// Shared button style
const btnStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid #222',
  cursor: 'pointer',
  textAlign: 'left',
};

// Shared section header style
const headerStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 10,
  color: '#666',
  background: '#111',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

// Phase 80.22: Group participant type with model info
interface GroupParticipant {
  agent_id: string;
  display_name: string;  // Contains "Role (Model)" format from backend
  role?: string;
  model_id?: string;
}

interface Props {
  filter: string;
  onSelect: (alias: string) => void;
  // Phase 80.22: When in group mode, show dynamic participants from group
  groupParticipants?: GroupParticipant[];
  isGroupMode?: boolean;
  // Phase 80.30: For solo chat - show only models that were used in this chat
  soloModels?: string[];  // Array of model IDs used in current solo chat
  // TODO_CAM_UI: Add CAM-ranked model suggestions in mention popup
  cam_ranked_models?: Array<{ id: string; name: string; cam_score: number }>;  // From GET /api/cam/suggestions
}

export function MentionPopup({ filter, onSelect, groupParticipants, isGroupMode, soloModels }: Props) {
  // MARKER_94.7_MENTION_POPUP: @ mention popup component
  // Phase 117.3b: Unified popup with system commands always on top

  // Filter system commands by typed text (including searchAliases like 'help' → doctor)
  const filterLower = filter.toLowerCase();
  const filteredCommands = SYSTEM_COMMANDS.filter(cmd =>
    cmd.alias.toLowerCase().includes(filterLower) ||
    cmd.label.toLowerCase().includes(filterLower) ||
    cmd.searchAliases.some(a => a.includes(filterLower))
  );

  // Build context-specific items below system commands
  let contextItems: React.ReactNode = null;
  let contextHeader: string | null = null;
  let hasContextItems = false;

  // Phase 80.30: Solo chat mode with tracked models
  if (!isGroupMode && soloModels && soloModels.length > 0) {
    const filteredModels = soloModels.filter(model =>
      model.toLowerCase().includes(filter.toLowerCase())
    );
    if (filteredModels.length > 0) {
      hasContextItems = true;
      contextHeader = 'Models in this chat';
      contextItems = filteredModels.map((model) => (
        <button
          key={model}
          onClick={() => onSelect(`@${model}`)}
          style={btnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#222')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ color: '#8a8a8a' }}>{ICONS.Bot}</span>
          <div>
            <div style={{ color: '#e0e0e0', fontSize: 13 }}>@{model.split('/').pop()}</div>
            <div style={{ color: '#666', fontSize: 11 }}>{model}</div>
          </div>
        </button>
      ));
    }
  }

  // In group mode with participants
  if (isGroupMode && groupParticipants && groupParticipants.length > 0) {
    const dynamicParticipants = groupParticipants
      .filter(p => {
        const alias = p.agent_id.replace('@', '').toLowerCase();
        const displayName = p.display_name?.toLowerCase() || '';
        return alias.includes(filter.toLowerCase()) || displayName.includes(filter.toLowerCase());
      })
      .map(p => ({
        alias: p.agent_id,
        label: p.display_name || p.agent_id,
        role: p.role,
      }));

    const showHostess = 'hostess'.includes(filter.toLowerCase());

    if (dynamicParticipants.length > 0 || showHostess) {
      hasContextItems = true;
      contextHeader = 'Group Members';
      contextItems = (
        <>
          {dynamicParticipants.map(({ alias, label }) => (
            <button
              key={alias}
              onClick={() => onSelect(alias)}
              style={btnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#222')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#8a8a8a' }}>{ICONS.Bot}</span>
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 13 }}>{alias}</div>
                <div style={{ color: '#666', fontSize: 11 }}>{label}</div>
              </div>
            </button>
          ))}
          {showHostess && (
            <button
              key="@hostess"
              onClick={() => onSelect('@hostess')}
              style={btnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#222')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#8a8a8a' }}>{ICONS.Users}</span>
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 13 }}>@hostess</div>
                <div style={{ color: '#666', fontSize: 11 }}>Hostess (Orchestrator)</div>
              </div>
            </button>
          )}
        </>
      );
    }
  }

  // Nothing to show at all
  if (filteredCommands.length === 0 && !hasContextItems) {
    return null;
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      left: 12,
      right: 12,
      marginBottom: 8,
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
      maxHeight: 300,
      overflowY: 'auto',
    }}>
      {/* MARKER_117_3B: System commands — always on top */}
      {filteredCommands.length > 0 && (
        <>
          <div style={headerStyle}>System Commands</div>
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.alias}
              onClick={() => onSelect(cmd.alias)}
              style={btnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2a1a1a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#e67e22' }}>{cmd.icon}</span>
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 13 }}>{cmd.alias}</div>
                <div style={{ color: '#666', fontSize: 11 }}>{cmd.label}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {/* Context-specific items (models or group members) */}
      {hasContextItems && contextHeader && (
        <>
          <div style={headerStyle}>{contextHeader}</div>
          {contextItems}
        </>
      )}
    </div>
  );
}
