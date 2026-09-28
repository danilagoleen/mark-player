/**
 * MessageBubble - Individual chat message with reactions and TTS.
 * Renders user, assistant, system, and compound messages.
 *
 * @status active
 * @phase 98
 * @depends react, lucide-react, ChatMessage type, CompoundMessage
 * @used_by MessageList
 */

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { User, Bot, ClipboardList, Code, TestTube, Building, Sparkles, Reply, FileText, SmilePlus, Volume2, VolumeX, Play, Pause } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { CompoundMessage } from './CompoundMessage';
import { ReflexInsight } from './ReflexInsight';

// Phase 48.3: Max chars before showing "read more"
const MAX_PREVIEW_LENGTH = 500;

// Phase 48.4: Quick reactions
const QUICK_REACTIONS = ['👍', '👎', '❤️', '🔥', '💡', '🤔'];

// Phase 98: Emoji to reaction name mapping for CAM API
const EMOJI_TO_REACTION: Record<string, string> = {
  '👍': 'thumbs_up',
  '👎': 'thumbs_down',
  '❤️': 'heart',
  '🔥': 'fire',
  '💡': 'lightbulb',
  '🤔': 'thinking',
};

interface Props {
  message: ChatMessage;
  // Phase 111.10.2: Added source for Reply routing
  onReply?: (msg: { id: string; model: string; text: string; source?: string }) => void;
  onOpenArtifact?: (id: string, content: string, agent?: string) => void;  // Phase 48.5.1: Added agent
  onReaction?: (messageId: string, reaction: string) => void;
  // Phase 111.17: For looking up replied-to message content
  getMessageById?: (id: string) => ChatMessage | undefined;
  // MARKER_C23B: Doctor quick-action handler
  onQuickAction?: (action: string) => void;
}

// MARKER_C23B: Doctor quick-action definitions
const DOCTOR_ACTIONS: Record<string, { label: string; icon: string; style: 'primary' | 'secondary' | 'muted' }> = {
  '1d': { label: 'Dragons', icon: '🐉', style: 'primary' },
  '1t': { label: 'Titans', icon: '🏔️', style: 'primary' },
  '2d': { label: 'Queue D', icon: '📋', style: 'secondary' },
  '2t': { label: 'Queue T', icon: '📋', style: 'secondary' },
  'h': { label: 'Hold', icon: '⏸', style: 'muted' },
};

const AGENT_ICONS: Record<string, React.ReactNode> = {
  PM: <ClipboardList size={14} />,
  Dev: <Code size={14} />,
  QA: <TestTube size={14} />,
  Architect: <Building size={14} />,
  Hostess: <Sparkles size={14} />,
};

// MARKER_C23B: Parse backtick-wrapped quick actions from doctor messages
function parseDoctorActions(content: string): string[] {
  if (!content) return [];
  // Match backtick-wrapped action codes like `1d`, `1t`, `2d`, `2t`, `h`
  const matches = content.match(/`([12][dt]|h)`/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/`/g, ''));
}

// MARKER_C23B: Check if message is from doctor agent
function isDoctorMessage(message: ChatMessage): boolean {
  const agent = message.agent?.toLowerCase() || '';
  const model = message.metadata?.model?.toLowerCase() || '';
  return agent === 'doctor' || agent.includes('doctor') || model.includes('doctor');
}

// Phase 111.21: React.memo to prevent unnecessary re-renders
// Only re-renders when message.id or message.content changes
function MessageBubbleComponent({ message, onReply, onOpenArtifact, onReaction, getMessageById, onQuickAction }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isCompound = message.type === 'compound';
  // MARKER_174.REFLEX_LIVE: Tool selection visibility
  const isReflex = message.type === 'reflex';
  // MARKER_174.TOGGLE: Gate REFLEX pills by user preference
  const showReflexInsight = true;

  // Phase 48.4: Emoji reactions state
  const [showReactions, setShowReactions] = useState(false);
  const [reactions, setReactions] = useState<string[]>([]);

  // MARKER_156.VOICE.S4_UI_BUBBLE: Voice bubble playback state and controls.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const createdObjectUrlRef = useRef<string | null>(null);
  const streamObjectUrlRef = useRef<string | null>(null);
  const synthRequestIdRef = useRef(0);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceRate, setVoiceRate] = useState<1 | 1.5 | 2>(1);
  const [voiceCurrentMs, setVoiceCurrentMs] = useState(0);
  const [voiceDurationMs, setVoiceDurationMs] = useState<number>(message.metadata?.audio?.duration_ms || 0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [streamChunkUrl, setStreamChunkUrl] = useState<string>('');

  // Phase 98: Handle reaction with CAM API integration
  const handleReaction = async (emoji: string) => {
    const isRemoving = reactions.includes(emoji);

    setReactions(prev => {
      // Toggle reaction
      if (prev.includes(emoji)) {
        return prev.filter(r => r !== emoji);
      }
      return [...prev, emoji];
    });
    setShowReactions(false);
    onReaction?.(message.id, emoji);

    // Phase 98: POST to CAM API for weight boost (only when adding, not removing)
    if (!isRemoving) {
      const reactionName = EMOJI_TO_REACTION[emoji] || 'thinking';
      const modelId = message.metadata?.model || message.agent || 'unknown';

      try {
        const response = await fetch('/api/cam/reaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message_id: message.id,
            reaction: reactionName,
            model_id: modelId,
            context: {
              topic: message.content?.slice(0, 100),  // First 100 chars as topic hint
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`[CAM] Reaction recorded: ${reactionName} for ${modelId}, weight delta: ${data.weight_delta}`);
        }
      } catch (error) {
        console.warn('[CAM] Failed to record reaction:', error);
        // Silent fail - don't disrupt UX for analytics
      }
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  const formatDuration = (ms: number) => {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const isVoiceMessage = message.type === 'voice';
  const audioMeta = message.metadata?.audio;
  const voiceMeta = message.metadata?.voice;
  const streamMeta = (message.metadata as any)?.stream;
  const audioUrl = useMemo(() => {
    const direct = audioMeta?.url?.trim();
    if (direct) return direct;
    const storageId = audioMeta?.storage_id?.trim();
    if (storageId) return `/api/voice/storage/${encodeURIComponent(storageId)}`;
    return '';
  }, [audioMeta?.url, audioMeta?.storage_id]);
  const waveform = useMemo(() => {
    const source = Array.isArray(audioMeta?.waveform) ? audioMeta?.waveform : [];
    return source.length > 0 ? source.slice(0, 40) : [];
  }, [audioMeta?.waveform]);

  const streamChunkAudio = useMemo(() => {
    const chunks = Array.isArray(streamMeta?.chunks) ? streamMeta.chunks : [];
    const firstPlayable = chunks.find((chunk: any) => typeof chunk?.audio === 'string' && chunk.audio.length > 0);
    return typeof firstPlayable?.audio === 'string' ? firstPlayable.audio : '';
  }, [streamMeta?.chunks]);

  const detectAudioMime = (bytes: Uint8Array): string => {
    if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return 'audio/ogg';
    }
    if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return 'audio/wav';
    }
    if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return 'audio/mpeg';
    }
    return 'audio/wav';
  };

  useEffect(() => {
    if (!streamChunkAudio) {
      if (streamObjectUrlRef.current) {
        URL.revokeObjectURL(streamObjectUrlRef.current);
        streamObjectUrlRef.current = null;
      }
      setStreamChunkUrl('');
      return;
    }

    try {
      const binary = atob(streamChunkAudio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const mime = detectAudioMime(bytes);
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      if (streamObjectUrlRef.current) {
        URL.revokeObjectURL(streamObjectUrlRef.current);
      }
      streamObjectUrlRef.current = objectUrl;
      setStreamChunkUrl(objectUrl);
    } catch {
      setStreamChunkUrl('');
    }
  }, [streamChunkAudio]);

  const attachAudioElement = useCallback((src: string) => {
    if (audioRef.current && audioRef.current.src !== src) {
      // Prevent parallel playback from stale synth responses.
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (!audioRef.current || audioRef.current.src !== src) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setVoiceDurationMs(Math.round(audio.duration * 1000));
        }
      };
      audio.ontimeupdate = () => {
        setVoiceCurrentMs(Math.round((audio.currentTime || 0) * 1000));
      };
      audio.onended = () => {
        setVoicePlaying(false);
        setVoiceCurrentMs(0);
      };
      audio.onerror = () => {
        setVoicePlaying(false);
        setVoiceError('Qwen audio playback failed');
      };
      audioRef.current = audio;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = voiceRate;
    }
  }, [voiceRate]);

  const synthesizeQwenPreview = useCallback(async (): Promise<string | null> => {
    const text = String(message.content || '').trim();
    if (!text) return null;
    const speaker = String(voiceMeta?.voice_id || 'ryan');
    const response = await fetch('/api/voice/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speaker,
        speed: voiceRate,
      }),
    });
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(details || `TTS ${response.status}`);
    }
    const data = await response.json();
    const apiUrl = String(data?.url || '').trim();
    if (apiUrl) return apiUrl;
    const audioB64 = String(data?.audio_b64 || '').trim();
    if (!audioB64) return null;
    const binary = atob(audioB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    if (createdObjectUrlRef.current) {
      URL.revokeObjectURL(createdObjectUrlRef.current);
    }
    createdObjectUrlRef.current = objectUrl;
    return objectUrl;
  }, [message.content, voiceMeta?.voice_id, voiceRate]);

  const toggleVoicePlayback = useCallback(async () => {
    setVoiceError(null);
    try {
      if (voiceLoading) return;
      let resolvedUrl = audioUrl || streamChunkUrl;
      if (!resolvedUrl) {
        setVoiceLoading(true);
        const reqId = ++synthRequestIdRef.current;
        resolvedUrl = await synthesizeQwenPreview() || '';
        // Drop stale synth results (race: multiple async requests for same bubble).
        if (reqId !== synthRequestIdRef.current) {
          return;
        }
      }
      if (!resolvedUrl) {
        setVoiceError('Qwen audio unavailable');
        return;
      }
      attachAudioElement(resolvedUrl);
      const audio = audioRef.current;
      if (!audio) {
        setVoiceError('Qwen audio unavailable');
        return;
      }
      if (audio.paused) {
        await audio.play();
        setVoicePlaying(true);
      } else {
        audio.pause();
        setVoicePlaying(false);
      }
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Qwen TTS failed');
    } finally {
      setVoiceLoading(false);
    }
  }, [attachAudioElement, audioUrl, streamChunkUrl, synthesizeQwenPreview, voiceLoading]);

  useEffect(() => {
    if (!audioRef.current?.paused && !audioRef.current?.ended) {
      return;
    }
    if (!audioRef.current || audioRef.current.paused || audioRef.current.ended) {
      setVoicePlaying(false);
    }
  }, [voiceCurrentMs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = voiceRate;
    }
  }, [voiceRate]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (createdObjectUrlRef.current) {
        URL.revokeObjectURL(createdObjectUrlRef.current);
        createdObjectUrlRef.current = null;
      }
      if (streamObjectUrlRef.current) {
        URL.revokeObjectURL(streamObjectUrlRef.current);
        streamObjectUrlRef.current = null;
      }
    };
  }, []);

  // Phase 111.17: Get reply preview data
  const getReplyPreview = () => {
    const replyToId = message.metadata?.in_reply_to;
    if (!replyToId) return null;
    
    // First try to get from metadata (if backend provides it)
    if (message.metadata?.reply_to_preview) {
      return message.metadata.reply_to_preview;
    }
    
    // Fallback: look up via getMessageById if provided
    if (getMessageById) {
      const repliedMessage = getMessageById(replyToId);
      if (repliedMessage) {
        return {
          id: repliedMessage.id,
          role: repliedMessage.role,
          agent: repliedMessage.agent,
          model: repliedMessage.metadata?.model,
          text_preview: (repliedMessage.content || '').slice(0, 100),
          timestamp: repliedMessage.timestamp,
        };
      }
    }
    
    return null;
  };

  // Phase 111.17: Reply Quote Block Component
  const ReplyQuote = () => {
    const preview = getReplyPreview();
    if (!preview) return null;
    
    const isRepliedUser = preview.role === 'user';
    const authorName = preview.agent || preview.model || (isRepliedUser ? 'You' : 'Assistant');
    const authorColor = isRepliedUser ? '#4a9eff' : '#4aff9e';
    
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 8,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          borderLeft: `3px solid ${authorColor}`,
          fontSize: 12,
          opacity: 0.8,
          cursor: 'pointer',
        }}
        onClick={() => {
          // TODO: Scroll to the replied message
          console.log('[Reply] Clicked quote for message:', preview.id);
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 4, 
            marginBottom: 2,
            color: authorColor,
            fontWeight: 500,
          }}>
            {isRepliedUser ? <User size={10} /> : <Bot size={10} />}
            <span>{authorName}</span>
          </div>
          <div style={{ 
            color: '#888', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
          }}>
            {preview.text_preview}...
          </div>
        </div>
      </div>
    );
  };

  // System message - Phase 57: Grayscale style
  if (isSystem) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        marginBottom: 12,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#555',
          flexShrink: 0
        }} />
        <span style={{ color: '#888', fontSize: 12 }}>{message.content}</span>
      </div>
    );
  }

  // User message
  if (isUser) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginBottom: 12,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 10, color: '#666' }}>{formatTime(message.timestamp)}</span>
          <User size={14} color="#4a9eff" />
        </div>
        <div style={{
          maxWidth: '85%',
          padding: '10px 14px',
          background: '#1a3a5c',
          borderRadius: '16px 16px 4px 16px',
          color: '#e0e0e0',
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          {/* Phase 111.17: Reply quote for user messages */}
          <ReplyQuote />
          {isVoiceMessage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={toggleVoicePlayback}
                  style={{
                    background: voicePlaying ? '#1f3a2a' : '#20364a',
                    border: '1px solid #2d4b66',
                    borderRadius: 999,
                    color: voicePlaying ? '#7fffb2' : '#cfe8ff',
                    fontSize: 11,
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                  title={voicePlaying ? 'Pause voice message' : 'Play voice message'}
                >
                  {voicePlaying ? <Pause size={12} color="#cfe8ff" /> : <Play size={12} color="#cfe8ff" />}
                </button>
                <span style={{ fontSize: 10, color: '#9db4c9' }}>
                  {formatDuration(voiceCurrentMs)} / {formatDuration(voiceDurationMs || 0)}
                </span>
              </div>

              {waveform.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24 }}>
                  {waveform.map((amp, idx) => (
                    <div
                      key={`${message.id}-wf-user-${idx}`}
                      style={{
                        width: 4,
                        borderRadius: 2,
                        height: `${Math.max(4, Math.round(amp * 24))}px`,
                        background: '#7aa6d1',
                        opacity: 0.9,
                      }}
                    />
                  ))}
                </div>
              )}

              <div style={{ height: 4, background: '#24415d', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${voiceDurationMs > 0 ? Math.min(100, (voiceCurrentMs / voiceDurationMs) * 100) : 0}%`,
                    background: '#8fc8ff',
                    transition: 'width 120ms linear',
                  }}
                />
              </div>

              <div style={{ whiteSpace: 'pre-wrap', color: '#d9ebfa', fontSize: 12 }}>
                {message.content || ''}
              </div>
            </div>
          ) : (
            message.content
          )}
        </div>
      </div>
    );
  }

  // MARKER_174.REFLEX_LIVE: REFLEX tool selection insight (gated by toggle)
  if (isReflex && showReflexInsight && message.metadata?.reflex) {
    return <ReflexInsight message={message} />;
  }

  // Compound message (workflow result)
  if (isCompound && message.sections) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}>
          <Bot size={14} color="#4aff9e" />
          <span style={{ fontSize: 12, color: '#4aff9e', fontWeight: 500 }}>
            Workflow Complete
          </span>

          {/* Duration */}
          {message.metadata?.duration && (
            <span style={{ fontSize: 10, color: '#666' }}>
              ({(message.metadata.duration / 1000).toFixed(1)}s)
            </span>
          )}

          {/* Score */}
          {message.metadata?.score != null && (
            <span style={{
              fontSize: 10,
              color: '#f0c040',
              padding: '2px 6px',
              background: 'rgba(240, 192, 64, 0.1)',
              borderRadius: 4
            }}>
              ⭐ {message.metadata.score}
            </span>
          )}

          {/* Model */}
          {message.metadata?.model && (
            <span style={{ fontSize: 10, color: '#666' }}>
              · {message.metadata.model}
            </span>
          )}
        </div>
        <CompoundMessage sections={message.sections} />
      </div>
    );
  }

  // Assistant message
  const isStreaming = message.metadata?.isStreaming;
  const firstChunkReceived = Boolean(streamMeta?.chunks?.some((chunk: { seq: number }) => chunk.seq === 0));
  const showVoiceTranscript = firstChunkReceived || !isStreaming || Boolean(voiceError);
  // Phase 48.3: Long message handling
  // Phase 74 fix: Guard against null/undefined content
  const isLong = (message.content?.length || 0) > MAX_PREVIEW_LENGTH;
  const modelName = message.metadata?.model || message.agent || 'assistant';
  const renderAssistantContent = () => {
    if (isVoiceMessage) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={toggleVoicePlayback}
              style={{
                background: voicePlaying ? '#1f3a2a' : '#202020',
                border: '1px solid #2d2d2d',
                borderRadius: 999,
                color: voicePlaying ? '#7fffb2' : '#cfcfcf',
                fontSize: 11,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
              title={voicePlaying ? 'Pause voice message' : 'Play voice message'}
            >
              {voicePlaying ? <Pause size={12} color="#cfcfcf" /> : <Play size={12} color="#cfcfcf" />}
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setVoiceRate(rate as 1 | 1.5 | 2)}
                  style={{
                    background: voiceRate === rate ? '#2a2a2a' : 'transparent',
                    border: '1px solid #333',
                    borderRadius: 6,
                    color: voiceRate === rate ? '#e6e6e6' : '#8b8b8b',
                    fontSize: 10,
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {rate}x
                </button>
              ))}
            </div>
            <span style={{ fontSize: 10, color: '#7c7c7c' }}>
              {formatDuration(voiceCurrentMs)} / {formatDuration(voiceDurationMs || 0)}
            </span>
          </div>

          {waveform.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24 }}>
              {waveform.map((amp, idx) => (
                <div
                  key={`${message.id}-wf-${idx}`}
                  style={{
                    width: 4,
                    borderRadius: 2,
                    height: `${Math.max(4, Math.round(amp * 24))}px`,
                    background: '#5f5f5f',
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
          )}

          <div style={{ height: 4, background: '#242424', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${voiceDurationMs > 0 ? Math.min(100, (voiceCurrentMs / voiceDurationMs) * 100) : 0}%`,
                background: '#4a9eff',
                transition: 'width 120ms linear',
              }}
            />
          </div>

          {(voiceMeta?.voice_id || voiceMeta?.tts_provider) && (
            <div style={{ fontSize: 10, color: '#777' }}>
              {(voiceMeta?.voice_id || 'voice')} · {voiceMeta?.tts_provider || 'tts'}
            </div>
          )}

          {voiceError && (
            <div style={{ fontSize: 10, color: '#b07a7a' }}>
              {voiceError}
            </div>
          )}

          <div
            style={{ whiteSpace: 'pre-wrap', color: '#bfbfbf', fontSize: 12 }}
            aria-live={showVoiceTranscript ? 'polite' : 'assertive'}
            aria-label={
              showVoiceTranscript
                ? 'Voice transcript is available'
                : 'Voice response is being generated'
            }
          >
            {showVoiceTranscript ? message.content || '' : 'Генерирую голосовое сообщение...'}
          </div>
        </div>
      );
    }

    if (isLong && !isStreaming) {
      return (
        <>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {(message.content || '').slice(0, MAX_PREVIEW_LENGTH)}...
          </div>
          <button
            onClick={() => onOpenArtifact?.(message.id, message.content || '', modelName)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
              padding: '6px 10px',
              background: '#222',
              border: '1px solid #333',
              borderRadius: 6,
              color: '#888',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#2a2a2a';
              e.currentTarget.style.color = '#aaa';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#222';
              e.currentTarget.style.color = '#888';
            }}
          >
            <FileText size={14} />
            Read full response ({(message.content || '').length} chars)
          </button>
        </>
      );
    }

    return (
      <>
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content || ''}</div>
        {/* Phase 46: Streaming cursor */}
        {isStreaming && <span style={{ opacity: 0.7, animation: 'blink 0.5s infinite' }}>▊</span>}
      </>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      marginBottom: 12,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
      }}>
        {message.agent && AGENT_ICONS[message.agent] ? (
          <span style={{ color: '#4aff9e' }}>{AGENT_ICONS[message.agent]}</span>
        ) : (
          <Bot size={14} color="#4aff9e" />
        )}
        {/* Phase 49: Agent/model name - larger and bolder */}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>
          {message.agent || message.metadata?.model || 'assistant'}
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>{formatTime(message.timestamp)}</span>

        {/* Phase 46: Streaming indicator */}
        {isStreaming && (
          <span style={{
            fontSize: 10,
            color: '#4aff9e',
            animation: 'pulse 1s infinite',
          }}>
            streaming...
          </span>
        )}
      </div>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        background: '#1a1a1a',
        borderRadius: '4px 16px 16px 16px',
        color: '#e0e0e0',
        fontSize: 14,
        lineHeight: 1.5,
        border: '1px solid #222',
      }}>
        {/* Phase 111.17: Reply quote for assistant messages */}
        <ReplyQuote />

        {/* MARKER_C23B: Doctor quick-action buttons */}
        {isDoctorMessage(message) && onQuickAction && (() => {
          const actions = parseDoctorActions(message.content || '');
          if (actions.length === 0) return null;

          // Group actions by style for visual hierarchy
          const primaryActions = actions.filter(a => DOCTOR_ACTIONS[a]?.style === 'primary');
          const secondaryActions = actions.filter(a => DOCTOR_ACTIONS[a]?.style === 'secondary');
          const mutedActions = actions.filter(a => DOCTOR_ACTIONS[a]?.style === 'muted');

          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
              padding: '10px 12px',
              background: 'rgba(74, 255, 158, 0.03)',
              borderRadius: 8,
              border: '1px solid rgba(74, 255, 158, 0.1)',
            }}>
              <div style={{
                fontSize: 10,
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 4,
              }}>
                Quick Actions
              </div>

              {/* Primary actions row (Run now) */}
              {primaryActions.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {primaryActions.map(action => (
                    <button
                      key={action}
                      onClick={() => onQuickAction(action)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        background: '#1a2a1a',
                        border: '1px solid #2a4a2a',
                        borderRadius: 6,
                        color: '#6a9a6a',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#2a3a2a';
                        e.currentTarget.style.borderColor = '#3a5a3a';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#1a2a1a';
                        e.currentTarget.style.borderColor = '#2a4a2a';
                      }}
                    >
                      <span>{DOCTOR_ACTIONS[action]?.icon}</span>
                      <span>{DOCTOR_ACTIONS[action]?.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Secondary actions row (Queue) */}
              {secondaryActions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {secondaryActions.map(action => (
                    <button
                      key={action}
                      onClick={() => onQuickAction(action)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        background: 'transparent',
                        border: '1px solid #333',
                        borderRadius: 4,
                        color: '#888',
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#222';
                        e.currentTarget.style.color = '#aaa';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#888';
                      }}
                    >
                      <span>{DOCTOR_ACTIONS[action]?.icon}</span>
                      <span>{DOCTOR_ACTIONS[action]?.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Muted actions (Hold) */}
              {mutedActions.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {mutedActions.map(action => (
                    <button
                      key={action}
                      onClick={() => onQuickAction(action)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        background: 'transparent',
                        border: '1px solid #222',
                        borderRadius: 4,
                        color: '#555',
                        fontSize: 10,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#777';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#555';
                      }}
                    >
                      <span>{DOCTOR_ACTIONS[action]?.icon}</span>
                      <span>{DOCTOR_ACTIONS[action]?.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {renderAssistantContent()}
      </div>

      {/* Phase 46: Token metadata display */}
      {message.metadata?.tokens_output && !isStreaming && (
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 4,
          fontSize: 10,
          color: '#666',
        }}>
          <span>🧠 {message.metadata.tokens_output} tokens</span>
          {message.metadata.tokens_input && (
            <span>📥 {message.metadata.tokens_input} input</span>
          )}
        </div>
      )}

      {/* Phase 48.5: Emoji reactions + Reply button in same row */}
      {/* Phase 98: TODO_CAM_EMOJI IMPLEMENTED - reactions now POST to /api/cam/reaction
          Weight mapping: 👍=+0.1, 👎=-0.1, ❤️=+0.15, 🔥=+0.2, 💡=+0.1, 🤔=0 (tracked) */}
      {!isStreaming && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 6,
          position: 'relative'
        }}>
          {/* Show selected reactions */}
          {reactions.length > 0 && (
            <div style={{
              display: 'flex',
              gap: 2,
              padding: '2px 6px',
              background: '#1a1a1a',
              borderRadius: 12,
              border: '1px solid #333'
            }}>
              {reactions.map((r, i) => (
                <span
                  key={i}
                  style={{ fontSize: 14, cursor: 'pointer' }}
                  onClick={() => handleReaction(r)}
                  title="Click to remove"
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons: TTS + emoji + reply */}
          <div style={{ display: 'flex', gap: 4, marginLeft: reactions.length > 0 ? 0 : 0 }}>
            {/* Phase 60.5: TTS button (hidden for voice messages with dedicated controls) */}
            {!isVoiceMessage && (
              <button
                onClick={toggleVoicePlayback}
                style={{
                  background: voicePlaying ? '#1a2a3a' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  borderRadius: 4,
                  opacity: voicePlaying ? 1 : 0.4,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = voicePlaying ? '1' : '0.4')}
                title={voicePlaying ? 'Stop speaking' : 'Read aloud (Qwen TTS)'}
              >
                {voicePlaying ? (
                  <VolumeX size={14} color="#4a9eff" />
                ) : (
                  <Volume2 size={14} color="#666" />
                )}
              </button>
            )}

            {/* Add reaction button */}
            <button
              onClick={() => setShowReactions(!showReactions)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                opacity: 0.4,
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
              title="Add reaction"
            >
              <SmilePlus size={14} color="#666" />
            </button>

            {/* Reply button - Phase 48.5: moved here */}
            {/* Phase 111.10.2: Pass model_source for Reply routing */}
            {onReply && (
              <button
                onClick={() => onReply({
                  id: message.id,
                  model: modelName,
                  text: message.content,
                  source: message.metadata?.model_source,  // Phase 111.10.2
                })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  opacity: 0.4,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                title="Reply to this message"
              >
                <Reply size={14} color="#666" />
              </button>
            )}
          </div>

          {/* Reaction picker */}
          {showReactions && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              display: 'flex',
              gap: 4,
              padding: '6px 8px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              marginBottom: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  style={{
                    background: reactions.includes(emoji) ? '#333' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 4,
                    fontSize: 16,
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#333')}
                  onMouseLeave={e => (e.currentTarget.style.background = reactions.includes(emoji) ? '#333' : 'transparent')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 49: Keyframes for streaming cursor */}
      <style>{`
        @keyframes blink { 0%,50% {opacity:1} 51%,100% {opacity:0} }
        @keyframes pulse { 0%,100% {opacity:1} 50% {opacity:0.5} }
      `}</style>
    </div>
  );
}

// Phase 111.21: Export memoized component
// Only re-render if message content/streaming state changes
export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => {
  // Re-render if message changed
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.metadata?.isStreaming !== next.message.metadata?.isStreaming) return false;
  // Callbacks are stable (useCallback), so skip comparison
  return true;
});
