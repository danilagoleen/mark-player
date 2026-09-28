/**
 * Chat-related type definitions including messages, workflows, search, and mentions.
 *
 * @status active
 * @phase 96
 * @depends none
 * @used_by ./components/chat, ./utils/chatApi, ./hooks/useSearch, ./App
 */
export interface ChatMessage {
  id: string;
  workflow_id?: string;
  role: 'user' | 'assistant' | 'system';
  agent?: 'PM' | 'Dev' | 'QA' | 'Architect' | 'Hostess' | 'MYCO';
  content: string;
  // MARKER_156.VOICE.S1_CONTRACT_TYPES: Voice messages are first-class chat timeline items.
  // MARKER_174.REFLEX_LIVE: Added 'reflex' type for tool selection visibility
  type: 'text' | 'code' | 'plan' | 'compound' | 'voice' | 'reflex';
  timestamp: string;
  metadata?: {
    model?: string;
    model_source?: string;  // Phase 111.10.2: Provider source for Reply routing
    model_provider?: string; // MARKER_152.FIX2: Provider type for display (polza, xai, etc.)
    duration?: number;
    tokens?: number;
    score?: number;
    // Phase 46: Streaming metadata
    isStreaming?: boolean;
    tokens_output?: number;
    tokens_input?: number;
    // Phase 111.17: Reply metadata for group chat
    in_reply_to?: string;           // ID of the message being replied to
    reply_to_preview?: {            // Preview of the replied-to message
      id: string;
      role: 'user' | 'assistant' | 'system';
      agent?: string;
      model?: string;
      text_preview: string;         // First ~100 chars of the message
      timestamp: string;
    };
    // MARKER_174.REFLEX_LIVE: Tool selection visibility metadata
    reflex?: {
      event: 'recommendation' | 'outcome' | 'verifier' | 'filter';
      tools?: Array<{ id: string; score?: number }>;
      tools_used?: string[];
      feedback_count?: number;
      passed?: boolean;
      original_count?: number;
      filtered_count?: number;
      phase?: string;
      tier?: string;
      subtask?: string;
    };
    // MARKER_156.VOICE.S1_CONTRACT_AUDIO: Persisted audio payload contract for voice bubbles.
    audio?: {
      format?: string | null;
      duration_ms?: number | null;
      waveform?: number[];
      storage_id?: string | null;
      url?: string | null;
    };
    // MARKER_156.VOICE.S1_CONTRACT_VOICE: Voice identity metadata for model/provider lock logic.
    voice?: {
      voice_id?: string | null;
      tts_provider?: string | null;
      model_identity_key?: string;
      persona_tag?: string | null;
    };
  };
  timecode?: string;
  sections?: {
    pm_plan?: string;
    architecture?: string;
    implementation?: string;
    tests?: string;
  };
}

export interface WorkflowStatus {
  workflow_id: string;
  step: 'pm' | 'architect' | 'dev' | 'qa' | 'merge' | 'ops';
  status: 'running' | 'done' | 'error';
  timestamp: number;
}

export interface WorkflowResult {
  workflow_id: string;
  feature?: string;
  result?: string;
  message?: string;
  pm_plan?: string;
  architecture?: string;
  implementation?: string;
  tests?: string;
  status: 'complete' | 'error';
  duration: number;
  model?: string;
  score?: number;
  eval_score?: number;
}

export interface AgentChunk {
  workflow_id: string;
  agent: string;
  delta: string;
}

export interface MentionAlias {
  type: 'agent' | 'model';
  label: string;
  icon: string;
}

export const MENTION_ALIASES: Record<string, MentionAlias> = {
  // Agents (Phase 57.8.3)
  '@pm': { type: 'agent', label: 'PM (Project Manager)', icon: 'ClipboardList' },
  '@dev': { type: 'agent', label: 'Developer', icon: 'Code' },
  '@qa': { type: 'agent', label: 'QA Tester', icon: 'TestTube' },
  '@architect': { type: 'agent', label: 'Architect', icon: 'Building' },
  '@researcher': { type: 'agent', label: 'Researcher', icon: 'Search' },
  '@hostess': { type: 'agent', label: 'Hostess (Orchestrator)', icon: 'Users' },
  // Models
  '@deepseek': { type: 'model', label: 'DeepSeek Chat', icon: 'Brain' },
  '@coder': { type: 'model', label: 'DeepSeek Coder', icon: 'Terminal' },
  '@qwen': { type: 'model', label: 'Qwen (Local)', icon: 'Cpu' },
  '@llama': { type: 'model', label: 'Llama (Local)', icon: 'Cpu' },
  '@claude': { type: 'model', label: 'Claude', icon: 'Sparkles' },
  '@gemini': { type: 'model', label: 'Gemini', icon: 'Star' },
};

// ============================================
// Phase 68: Search Types
// ============================================

export interface SearchResult {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'code' | 'doc';
  relevance: number;
  preview?: string;
  source?: string;
  // Phase 68.2: Date fields for sorting
  created_time?: number;
  modified_time?: number;
  // Phase 69.4: Size for display
  size?: number;
}

export interface SearchQuery {
  text: string;
  limit?: number;
  mode?: 'hybrid' | 'semantic' | 'keyword';
  filters?: {
    type?: 'code' | 'docs' | 'all';
    paths?: string[];
  };
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took_ms: number;
  mode?: string;
  sources?: string[];
}

export interface SearchError {
  error: string;
  query: string;
}
