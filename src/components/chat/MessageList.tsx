/**
 * MessageList - Container for chat messages with typing indicator.
 * Renders MessageBubble components for each message.
 *
 * @status active
 * @phase 96
 * @depends MessageBubble, ChatMessage type, lucide-react
 * @used_by ChatPanel
 */

import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../types/chat';
import { Loader2 } from 'lucide-react';

// Phase 48.3: Reply message type
interface ReplyTarget {
  id: string;
  model: string;
  text: string;
}

interface Props {
  messages: ChatMessage[];
  isTyping?: boolean;
  onReply?: (msg: ReplyTarget) => void;
  onOpenArtifact?: (id: string, content: string, agent?: string) => void;  // Phase 48.5.1
  onReaction?: (messageId: string, reaction: string) => void;  // Phase 48.4
  // MARKER_C23B: Doctor quick-action handler
  onQuickAction?: (action: string) => void;
}

export function MessageList({ messages, isTyping, onReply, onOpenArtifact, onReaction, onQuickAction }: Props) {
  // Phase 111.17: Helper to look up message by ID for reply quotes
  const getMessageById = (id: string): ChatMessage | undefined => {
    return messages.find(m => m.id === id);
  };

  if (messages.length === 0 && !isTyping) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        textAlign: 'center',
        padding: 24,
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>{'💬'}</div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>No messages yet</div>
        <div style={{ fontSize: 12, color: '#444' }}>
          Type <span style={{ color: '#4a9eff' }}>@</span> to mention an agent or model
        </div>
      </div>
    );
  }

  return (
    <div>
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onReply={onReply}
          onOpenArtifact={onOpenArtifact}
          onReaction={onReaction}
          getMessageById={getMessageById}  // Phase 111.17: Pass lookup helper for replies
          onQuickAction={onQuickAction}  // MARKER_C23B: Doctor quick-action handler
        />
      ))}

      {isTyping && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          marginBottom: 12,
        }}>
          <Loader2 size={14} color="#4aff9e" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 12, color: '#666' }}>Agent is thinking...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
