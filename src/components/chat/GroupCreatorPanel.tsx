/**
 * GroupCreatorPanel - IKEA-style group creator for chat teams.
 * Supports creating new groups and editing existing ones.
 *
 * @status active
 * @phase 96
 * @depends react
 * @used_by ChatPanel
 */

// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';

interface Agent {
  role: string;
  model: string | null;
  // Phase 80.12: Track agent_id for existing participants
  agent_id?: string;
  // MARKER_109_10_PROVIDER: Phase 109.10 - Track model source/provider
  modelSource?: string;
}

// Phase 80.12: Participant data from API
interface Participant {
  agent_id: string;
  model_id: string;
  display_name: string;
  role: string;
}

// Phase 80.12: Group data from API
interface Group {
  id: string;
  name: string;
  description: string;
  admin_id: string;
  participants: Record<string, Participant>;
}

interface GroupCreatorPanelProps {
  selectedModel: string | null;
  // MARKER_109_10_PROVIDER: Phase 109.10 - Model source for provider persistence
  selectedModelSource?: string;
  onClearSelectedModel: () => void;
  onCreateGroup: (name: string, agents: Agent[]) => void;
  onAddCustomRole?: () => void;
  // Phase 60.4: Use VETKA artifact system for custom role template
  onOpenArtifact?: (data: { content: string; title: string; type?: 'text' | 'markdown' | 'code' }) => void;
  // Phase 80.12: Edit mode props
  editMode?: boolean;
  groupId?: string;
  onGroupUpdated?: () => void;
  onExitEditMode?: () => void;
  onOpenModelDirectory?: () => void;
}

// Phase 60.4: Added Researcher role
const DEFAULT_ROLES = ['PM', 'Architect', 'Dev', 'QA', 'Researcher'];

// Phase 80.25: Role icons - simple, minimalist SVG icons
const ROLE_ICONS: Record<string, React.ReactElement> = {
  'PM': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path d="M9 12h6m-6 4h6" />
    </svg>
  ),
  'Architect': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  ),
  'Dev': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  ),
  'QA': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  'Researcher': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
};

// Phase 60.4: Custom role template
const CUSTOM_ROLE_TEMPLATE = `# Custom Role: [RoleName]

## System Prompt
You are a specialized AI agent with the role of [RoleName].

Your responsibilities:
- [Define primary responsibility]
- [Define secondary responsibility]

## Behavior Guidelines
1. Always respond professionally
2. Focus on your area of expertise
3. Collaborate with other agents when needed

## Tools Available
- search_codebase
- create_artifact
- analyze_code
`;

export const GroupCreatorPanel: React.FC<GroupCreatorPanelProps> = ({
  selectedModel,
  selectedModelSource,  // MARKER_109_10_PROVIDER: Phase 109.10
  onClearSelectedModel,
  onCreateGroup,
  onAddCustomRole,
  onOpenArtifact,
  // Phase 80.12: Edit mode props
  editMode = false,
  groupId,
  onGroupUpdated,
  onExitEditMode,
  onOpenModelDirectory
}) => {
  const [groupName, setGroupName] = useState('');
  const [agents, setAgents] = useState<Agent[]>(
    DEFAULT_ROLES.map(role => ({ role, model: null }))
  );
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  // Phase 60.4: Custom role modal state
  const [showCustomRoleModal, setShowCustomRoleModal] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');

  // Phase 80.12: Edit mode state
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<Group | null>(null);

  // Phase 60.4: Computed template with role name
  const displayTemplate = useMemo(() => {
    return CUSTOM_ROLE_TEMPLATE.replace(/\[RoleName\]/g, customRoleName || '[RoleName]');
  }, [customRoleName]);

  // Phase 80.12: Load group data in edit mode
  useEffect(() => {
    if (editMode && groupId) {
      setLoading(true);
      fetch(`/api/groups/${groupId}`)
        .then(res => res.json())
        .then(data => {
          if (data.group) {
            setGroup(data.group);
            setGroupName(data.group.name);
            // Convert participants to agents array
            const participants = Object.values(data.group.participants) as Participant[];
            const loadedAgents: Agent[] = participants.map(p => ({
              role: p.agent_id.replace('@', ''),
              model: p.model_id,
              agent_id: p.agent_id
            }));
            setAgents(loadedAgents);
          }
        })
        .catch(err => {
          console.error('[GroupCreatorPanel] Error loading group:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else if (!editMode) {
      // Reset to default state when exiting edit mode
      setGroup(null);
      setGroupName('');
      setAgents(DEFAULT_ROLES.map(role => ({ role, model: null })));
      setActiveSlot(null);
    }
  }, [editMode, groupId]);

  // Phase 80.12: Handle model update for existing participant
  const handleUpdateParticipantModel = async (agentId: string, newModelId: string) => {
    if (!groupId) return;

    try {
      const response = await fetch(`/api/groups/${groupId}/participants/${encodeURIComponent(agentId)}/model`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: newModelId })
      });

      if (response.ok) {
        // Update local state
        setAgents(prev => prev.map(a =>
          a.agent_id === agentId ? { ...a, model: newModelId } : a
        ));
        onGroupUpdated?.();
      } else {
        console.error('[GroupCreatorPanel] Failed to update model:', response.status);
        alert('Failed to update model');
      }
    } catch (error) {
      console.error('[GroupCreatorPanel] Error updating model:', error);
      alert('Error updating model');
    }
  };

  // Phase 80.12: Handle role change for existing participant
  const handleUpdateParticipantRole = async (agentId: string, newRole: string) => {
    if (!groupId) return;

    try {
      const response = await fetch(`/api/groups/${groupId}/participants/${encodeURIComponent(agentId)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        onGroupUpdated?.();
      } else {
        console.error('[GroupCreatorPanel] Failed to update role:', response.status);
        alert('Failed to update role');
      }
    } catch (error) {
      console.error('[GroupCreatorPanel] Error updating role:', error);
      alert('Error updating role');
    }
  };

  // Phase 80.12: Handle remove participant
  const handleRemoveParticipant = async (agentId: string) => {
    if (!groupId || !group) return;

    // Don't allow removing admin
    if (agentId === group.admin_id) {
      alert('Cannot remove admin from group');
      return;
    }

    if (!confirm(`Remove ${agentId} from group?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/groups/${groupId}/participants/${encodeURIComponent(agentId)}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Update local state
        setAgents(prev => prev.filter(a => a.agent_id !== agentId));
        onGroupUpdated?.();
      } else {
        console.error('[GroupCreatorPanel] Failed to remove participant:', response.status);
        alert('Failed to remove participant');
      }
    } catch (error) {
      console.error('[GroupCreatorPanel] Error removing participant:', error);
      alert('Error removing participant');
    }
  };

  // When model is selected from left sidebar, fill the active slot
  // Phase 80.12: Also handle edit mode - update participant via API
  // MARKER_109_10_PROVIDER: Phase 109.10 - Include modelSource
  useEffect(() => {
    if (selectedModel && activeSlot !== null) {
      // Phase 80.12: In edit mode with existing agent, update via API
      const agent = agents[activeSlot];
      if (editMode && agent?.agent_id) {
        handleUpdateParticipantModel(agent.agent_id, selectedModel);
      } else {
        // Create mode - just update local state with modelSource
        setAgents(prev => prev.map((a, i) =>
          i === activeSlot ? { ...a, model: selectedModel, modelSource: selectedModelSource } : a
        ));
      }
      setActiveSlot(null);
      onClearSelectedModel();
    }
  }, [selectedModel, selectedModelSource, activeSlot, onClearSelectedModel, editMode, agents]);

  const filledAgents = agents.filter(a => a.model !== null);
  // Phase 60.4: Only require filled agents, groupName is optional
  const canCreate = filledAgents.length > 0;

  const handleCreate = () => {
    if (canCreate) {
      onCreateGroup(groupName, filledAgents);
      // Reset form
      setGroupName('');
      setAgents(DEFAULT_ROLES.map(role => ({ role, model: null })));
      setActiveSlot(null);
    }
  };

  const handleRemoveAgent = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setAgents(prev => prev.map((a, i) =>
      i === index ? { ...a, model: null } : a
    ));
  };

  // Phase 60.4: Open artifact or modal for custom role creation
  const handleAddCustomRole = () => {
    // Prefer VETKA artifact system if available
    if (onOpenArtifact) {
      onOpenArtifact({
        content: CUSTOM_ROLE_TEMPLATE,
        title: 'Custom Role Template',
        type: 'markdown'
      });
      // Add empty custom slot
      setAgents(prev => [...prev, { role: 'Custom', model: null }]);
      setActiveSlot(agents.length);
    } else {
      // Fallback to modal
      setShowCustomRoleModal(true);
    }
  };

  // Phase 60.4: Confirm custom role creation
  const handleConfirmCustomRole = () => {
    if (customRoleName.trim()) {
      setAgents(prev => [...prev, { role: customRoleName.trim(), model: null }]);
      setActiveSlot(agents.length);
      setCustomRoleName('');
      setShowCustomRoleModal(false);
      onAddCustomRole?.();
    }
  };

  // Phase 80.12: Loading state for edit mode
  if (editMode && loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0a0a'
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #222',
          background: '#0f0f0f'
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#999'
          }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0a0a0a'
    }}>
      {/* Header */}
      {/* Phase 80.12: Show different header for edit mode */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #222',
        background: '#0f0f0f',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#999'
        }}>
          {editMode ? 'Group Settings' : 'Group Creator'}
        </div>
        {/* Phase 80.12: Close button in edit mode */}
        {editMode && onExitEditMode && (
          <button
            onClick={onExitEditMode}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              padding: '2px 4px',
              fontSize: 16,
              lineHeight: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#888';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#555';
            }}
          >
            x
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: 16
      }}>
        {/* Group Name */}
        {/* MARKER_EDIT_NAME_GROUP: Group name editing field */}
        {/* Status: EDITABLE ONLY ON CREATE - Input field allows editing groupName state during creation */}
        {/* Issue: NO RENAME ENDPOINT - Once group is created, cannot rename it via API */}
        {/* Current: Only updateable during group creation, no update endpoint exists */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10,
            color: '#666',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Group Name
          </div>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g., Code Review Team"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#ccc',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#555';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#333';
            }}
          />
        </div>

        {/* Team Roles */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10,
            color: '#666',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>Team Roles</span>
            {activeSlot !== null && (
              <span style={{ color: '#888', textTransform: 'none' }}>
                select model on left
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {agents.map((agent, index) => {
              // Phase 80.12: Check if this is admin in edit mode
              const isAdmin = !!(editMode && group && agent.agent_id === group.admin_id);

              return (
                <div
                  key={agent.agent_id || index}
                  style={{
                    padding: '10px 12px',
                    background: activeSlot === index ? '#1a1a1a' : '#111',
                    border: activeSlot === index
                      ? '1px solid #555'
                      : agent.model
                      ? '1px solid #333'
                      : '1px dashed #333',
                    borderRadius: 4,
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Phase 80.12: Top row - role name + admin badge */}
                  <div
                    onClick={() => {
                      setActiveSlot(index);
                      onOpenModelDirectory?.();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      marginBottom: editMode && agent.model ? 8 : 0
                    }}
                    onMouseEnter={(e) => {
                      if (activeSlot !== index) {
                        (e.currentTarget.parentElement as HTMLElement).style.background = '#151515';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeSlot !== index) {
                        (e.currentTarget.parentElement as HTMLElement).style.background = '#111';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Phase 80.25: Role icons */}
                      {ROLE_ICONS[agent.role] && (
                        <span style={{ display: 'flex', alignItems: 'center', color: agent.model ? '#888' : '#555' }}>
                          {ROLE_ICONS[agent.role]}
                        </span>
                      )}
                      <span style={{
                        fontSize: 12,
                        color: agent.model ? '#ccc' : '#666'
                      }}>
                        {agent.role}
                      </span>
                      {/* Phase 80.25: Admin badge - neutral gray styling */}
                      {isAdmin && (
                        <span style={{
                          fontSize: 10,
                          color: '#888',
                          padding: '2px 6px',
                          background: '#2a2a2a',
                          borderRadius: 3,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          admin
                        </span>
                      )}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      {agent.model ? (
                        <>
                          <span style={{
                            fontSize: 11,
                            color: '#888',
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {agent.model.split('/').pop()}
                          </span>
                          {/* Phase 80.12: In edit mode, show Change button instead of X */}
                          {editMode ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSlot(index);
                                onOpenModelDirectory?.();
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid #444',
                                color: '#888',
                                cursor: 'pointer',
                                padding: '4px 8px',
                                borderRadius: 3,
                                fontSize: 10,
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#666';
                                e.currentTarget.style.color = '#aaa';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#444';
                                e.currentTarget.style.color = '#888';
                              }}
                            >
                              Change
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleRemoveAgent(index, e)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#555',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                fontSize: 14,
                                lineHeight: 1
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#888';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#555';
                              }}
                            >
                              x
                            </button>
                          )}
                        </>
                      ) : (
                        <span style={{
                          fontSize: 10,
                          color: activeSlot === index ? '#888' : '#444'
                        }}>
                          {activeSlot === index ? 'waiting...' : 'empty'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Phase 80.23: REMOVED ugly Role/Remove UI - editMode now uses same beautiful slot UI as create mode */}
                  {/* Users click on slot to change model via Model Directory - simple and elegant */}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Custom Role - Phase 80.12: Only in create mode */}
        {!editMode && (
          <button
            onClick={handleAddCustomRole}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              background: 'transparent',
              border: 'none',
              color: '#555',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#888';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#555';
            }}
          >
            <span>+</span>
            <span>Add Custom Role</span>
          </button>
        )}

        {/* Divider */}
        <div style={{
          borderTop: '1px solid #222',
          margin: '16px 0'
        }} />

        {/* Help text - Phase 80.12: Different text for edit mode */}
        {/* Phase 80.19: Added hint about direct model addition */}
        <div style={{
          fontSize: 10,
          color: '#444',
          lineHeight: 1.5
        }}>
          {editMode
            ? 'Click "Change" to update a model, or click a model in the directory to add it directly to the team.'
            : 'Click a role slot, then select a model from the left panel. After creating group, use @mention to talk to specific agents.'
          }
        </div>
      </div>

      {/* Footer - Create Button / Done Button (Phase 80.12) */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #222',
        background: '#0f0f0f'
      }}>
        {editMode ? (
          // Phase 80.12: Done button in edit mode
          <button
            onClick={onExitEditMode}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 4,
              border: 'none',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              background: '#333',
              color: '#ccc',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#333';
            }}
          >
            Done
          </button>
        ) : (
          // Create mode button
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 4,
              border: 'none',
              fontSize: 12,
              fontWeight: 500,
              cursor: canCreate ? 'pointer' : 'not-allowed',
              background: canCreate ? '#333' : '#1a1a1a',
              color: canCreate ? '#ccc' : '#555',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (canCreate) {
                e.currentTarget.style.background = '#444';
              }
            }}
            onMouseLeave={(e) => {
              if (canCreate) {
                e.currentTarget.style.background = '#333';
              }
            }}
          >
            {filledAgents.length === 0
              ? 'Assign at least one role'
              : `Create Group (${filledAgents.length} agents)`
            }
          </button>
        )}
      </div>

      {/* Phase 60.4: Custom Role Modal */}
      {showCustomRoleModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowCustomRoleModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 999,
            }}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#1a1a2e',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            zIndex: 1000,
            width: '500px',
            maxHeight: '70vh',
            overflow: 'auto',
          }}>
            <h3 style={{ color: '#fff', marginBottom: '16px', marginTop: 0 }}>
              Create Custom Role
            </h3>

            <input
              type="text"
              placeholder="Role Name (e.g., Security Auditor)"
              value={customRoleName}
              onChange={(e) => setCustomRoleName(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '12px',
                background: '#2a2a4e',
                border: '1px solid #3a3a5e',
                borderRadius: '8px',
                color: '#fff',
                marginBottom: '16px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customRoleName.trim()) {
                  handleConfirmCustomRole();
                }
              }}
            />

            <pre style={{
              background: '#0a0a1e',
              padding: '12px',
              borderRadius: '8px',
              color: '#888',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              maxHeight: '200px',
              overflow: 'auto',
              margin: 0,
            }}>
              {displayTemplate}
            </pre>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={handleConfirmCustomRole}
                disabled={!customRoleName.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: customRoleName.trim() ? '#4a9eff' : '#333',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: customRoleName.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
              >
                Add Role
              </button>
              <button
                onClick={() => {
                  setCustomRoleName('');
                  setShowCustomRoleModal(false);
                }}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid #666',
                  borderRadius: '8px',
                  color: '#999',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GroupCreatorPanel;
