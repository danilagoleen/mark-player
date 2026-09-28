/**
 * Smart Voice-Aware Message Input with Realtime Pipeline.
 * Supports text input, @mentions, and voice recording with VAD-based turn detection.
 * Auto-detects voice models and switches between Send/Mic modes dynamically.
 *
 * @status active
 * @phase 96
 * @depends react, lucide-react, useRealtimeVoice, MentionPopup
 * @used_by ChatPanel
 */

// TODO (chat-extract): VETKA-specific import — adapter required:
//   ../../hooks/useRealtimeVoice  → @vetka/adapter-hooks
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Send, Square, Loader2, Volume2 } from 'lucide-react';
import { MentionPopup } from './MentionPopup';
import { useRealtimeVoice } from '../../hooks/useRealtimeVoice';

// Phase 57.8.3: Group participant type for filtering mentions
interface GroupParticipant {
  agent_id: string;
  display_name: string;
  role?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  disabled?: boolean;
  replyTo?: string;  // Display name for placeholder
  replyToModel?: string;  // Full model ID for voice detection
  isGroupMode?: boolean;
  groupParticipants?: GroupParticipant[];
  // Phase 80.30: Solo chat models for @mention dropdown
  soloModels?: string[];
  // Phase 60.5: Voice models list for smart detection
  voiceModels?: string[];
  // Phase 60.5: Selected model from ModelDirectory
  selectedModel?: string | null;
  // Phase 60.5: Voice-only mode (always show mic)
  voiceOnlyMode?: boolean;
  onVoiceOnlyModeChange?: (value: boolean) => void;
  // Phase 60.5: Auto-continue voice after response
  autoContinueVoice?: boolean;
  onAutoContinueVoiceChange?: (value: boolean) => void;
  // Phase 60.5.1: Realtime voice mode
  realtimeVoiceEnabled?: boolean;
  onRealtimeVoiceChange?: (enabled: boolean) => void;
  onVoiceRecorded?: (payload: {
    blob: Blob;
    waveform: number[];
    durationMs: number;
    mimeType: string;
  }) => void | Promise<void>;
  // TODO_CAM_UI: Pass CAM context suggestions to enrich input hints
  cam_suggestions?: string[];  // Show hot/warm files in placeholder or autocomplete
  hideHelp?: boolean;
}

// Voice mode types for wave animation
type VoiceMode = 'idle' | 'listening' | 'speaking' | 'playing';

// Get wave color based on mode (must be 6-char hex for gradient alpha suffix)
function getWaveColor(mode: VoiceMode): string {
  switch (mode) {
    case 'speaking': return '#4a9eff';   // Blue - user speaking
    case 'playing': return '#4aff9e';    // Green - model speaking
    case 'listening': return '#66aabb';  // Teal - waiting for speech
    default: return '#555555';           // Gray - idle
  }
}

// Wave drawing for listening mode
function drawWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  intensity: number,
  mode: VoiceMode = 'listening',
  bars?: number[]
) {
  const centerY = height / 2;
  const amplitude = 10 * Math.max(0.3, intensity);
  const frequency = 0.025;
  const color = getWaveColor(mode);

  ctx.clearRect(0, 0, width, height);
  if (bars && bars.length > 0) {
    const barCount = bars.length;
    const gap = 2;
    const barWidth = Math.max(2, Math.floor((width - (barCount - 1) * gap) / barCount));
    for (let i = 0; i < barCount; i += 1) {
      const amp = Math.max(0.02, Math.min(1, bars[i]));
      const h = Math.max(3, Math.round(amp * (height - 4)));
      const x = i * (barWidth + gap);
      const y = Math.round((height - h) / 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2 + amp * 0.8;
      ctx.fillRect(x, y, barWidth, h);
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    const y =
      centerY +
      Math.sin(x * frequency + phase) * amplitude +
      Math.sin(x * frequency * 2.1 + phase * 1.3) * (amplitude * 0.5) +
      Math.sin(x * frequency * 0.6 + phase * 0.9) * (amplitude * 0.35);

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  // Gradient for wave with dynamic color
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(0.15, color + '30');
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(0.85, color + '30');
  gradient.addColorStop(1, 'transparent');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Glow effect
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * intensity;
  ctx.stroke();
  ctx.restore();
}

export function MessageInput({
  value,
  onChange,
  onSend,
  isLoading,
  disabled,
  replyTo,
  replyToModel,
  isGroupMode,
  groupParticipants,
  soloModels,
  voiceModels = [],
  selectedModel,
  voiceOnlyMode = false,
  onVoiceOnlyModeChange,
  autoContinueVoice = false,
  realtimeVoiceEnabled = false,
  onRealtimeVoiceChange,
  onVoiceRecorded,
  hideHelp = false,
}: Props) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [intensity, setIntensity] = useState(0.5);
  const [statusText, setStatusText] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleRafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const waveformRef = useRef<number[]>([]);
  const liveBarsRef = useRef<number[]>([]);
  const recordingStartRef = useRef<number>(0);
  const animationRef = useRef<number | undefined>(undefined);
  const phaseRef = useRef<number>(0);
  const intensityIntervalRef = useRef<any>(null);
  const autoSendTimerRef = useRef<number | null>(null);
  const [isSampleRecording, setIsSampleRecording] = useState(false);

  // Phase 60.5.1: Realtime voice hook
  // In realtime mode, we DON'T write transcript to input - it's pure audio pipeline
  const realtimeVoice = useRealtimeVoice({
    chatMode: true,
    model: selectedModel || undefined,
    onTranscript: (text, isFinal) => {
      if (isFinal && text.trim()) {
        // Route transcript into the normal chat send flow (provider routing + group policy).
        setStatusText(`"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`);
        onChange(text.trim());
        if (autoSendTimerRef.current) {
          window.clearTimeout(autoSendTimerRef.current);
        }
        autoSendTimerRef.current = window.setTimeout(() => {
          onSend();
          autoSendTimerRef.current = null;
        }, 60);
      }
    },
    onLLMToken: (_token) => {},
    onModelSpeaking: (speaking) => {
      if (speaking) {
        setStatusText('Responding...');
      } else {
        setStatusText(null);
      }
    },
    onError: (error) => {
      setStatusText(`Error: ${error}`);
      setTimeout(() => setStatusText(null), 3000);
    },
  });

  // Determine voice mode for wave animation
  const voiceMode: VoiceMode = realtimeVoice.isModelSpeaking
    ? 'playing'
    : realtimeVoice.isSpeaking
    ? 'speaking'
    : realtimeVoice.isListening
    ? 'listening'
    : 'idle';

  // Phase 60.5: Check if replying to a voice model
  const isReplyingToVoiceModel = useMemo(() => {
    if (!replyToModel || voiceModels.length === 0) return false;
    return voiceModels.some(vm =>
      vm.toLowerCase() === replyToModel.toLowerCase() ||
      vm.toLowerCase().includes(replyToModel.toLowerCase()) ||
      replyToModel.toLowerCase().includes(vm.toLowerCase())
    );
  }, [replyToModel, voiceModels]);

  // Phase 60.5: Trigger 1 - Check if selected model from ModelDirectory is a voice model
  const isSelectedModelVoice = useMemo(() => {
    if (!selectedModel || voiceModels.length === 0) return false;
    return voiceModels.some(vm =>
      vm.toLowerCase() === selectedModel.toLowerCase() ||
      vm.toLowerCase().includes(selectedModel.toLowerCase()) ||
      selectedModel.toLowerCase().includes(vm.toLowerCase())
    );
  }, [selectedModel, voiceModels]);

  // Phase 60.5: Detect if voice model is mentioned AND no text after it
  const voiceModelDetection = useMemo(() => {
    // Find @model_id pattern in text
    const mentionMatch = value.match(/@([a-zA-Z0-9\-_\/\.]+)/g);
    if (!mentionMatch || mentionMatch.length === 0) {
      return { hasVoiceModel: false, modelId: null, hasTextAfter: false };
    }

    // Get the last mention
    const lastMention = mentionMatch[mentionMatch.length - 1];
    const modelId = lastMention.slice(1); // Remove @

    // Check if it's a voice model
    const isVoiceModel = voiceModels.some(vm =>
      vm.toLowerCase() === modelId.toLowerCase() ||
      vm.toLowerCase().includes(modelId.toLowerCase()) ||
      modelId.toLowerCase().includes(vm.toLowerCase())
    );

    if (!isVoiceModel) {
      return { hasVoiceModel: false, modelId: null, hasTextAfter: false };
    }

    // Check if there's text AFTER the mention
    const lastMentionIndex = value.lastIndexOf(lastMention);
    const textAfterMention = value.slice(lastMentionIndex + lastMention.length).trim();
    const hasTextAfter = textAfterMention.length > 0;

    return { hasVoiceModel: true, modelId, hasTextAfter };
  }, [value, voiceModels]);

  // Determine button mode:
  // - isListening → Stop button
  // - only @model mentions (no user payload text) → Mic button
  // - user payload text present → Send button
  const escapeForRegex = useCallback((raw: string) => raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), []);
  const hasRawText = value.trim().length > 0;
  let payloadText = value
    .replace(/@[a-zA-Z0-9\-_/.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // S6.3: model picker can insert plain model id without @mention.
  // Treat standalone selected model token as routing hint, not user payload text.
  if (selectedModel) {
    const modelTokenRegex = new RegExp(`^${escapeForRegex(selectedModel)}\\s*`, 'i');
    payloadText = payloadText.replace(modelTokenRegex, '').trim();
  }
  const hasText = payloadText.length > 0;

  // Phase 60.5: Voice mode triggers:
  // 1. @mention of voice model (no text after)
  // 2. Reply to voice model message (empty input)
  // 3. Selected model from ModelDirectory is voice model (empty input)
  // 4. Voice-only mode toggle (always show mic unless typing)
  const showVoiceMode = !hasText && !isListening && !isSampleRecording && !disabled;

  // Combined active state (legacy or realtime)
  const isVoiceActive = isSampleRecording || isListening || realtimeVoice.isListening;
  const effectiveIntensity = realtimeVoice.isListening
    ? Math.min(1, realtimeVoice.audioLevel * 3)  // Scale audio level
    : intensity;

  // Wave animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isVoiceActive) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      const realtimeBars = isSampleRecording ? liveBarsRef.current : undefined;
      drawWave(ctx, canvas.width, canvas.height, phaseRef.current, effectiveIntensity, voiceMode, realtimeBars);
      phaseRef.current += 0.07;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVoiceActive, effectiveIntensity, voiceMode, isSampleRecording]);

  // Detect @ typing for mentions
  // MARKER_94.7_AT_DETECTION: @ symbol detection trigger
  useEffect(() => {
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && textAfterAt.length < 50) {
        setShowMentions(true);
        setMentionFilter(textAfterAt.toLowerCase());
        return;
      }
    }
    setShowMentions(false);
  }, [value]);

  const handleMentionSelect = useCallback(
    (alias: string) => {
      const lastAtIndex = value.lastIndexOf('@');
      const newValue = value.slice(0, lastAtIndex) + alias + ' ';
      onChange(newValue);
      setShowMentions(false);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  // Start voice recognition
  const startListening = useCallback(() => {
    if (disabled || isLoading || isListening) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatusText('Speech not supported');
      setTimeout(() => setStatusText(null), 2000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    let finalTranscript = '';
    const baseValue = value;

    recognition.onstart = () => {
      setIsListening(true);
      setStatusText('Listening...');
      intensityIntervalRef.current = setInterval(() => {
        setIntensity(0.35 + Math.random() * 0.65);
      }, 80);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript = transcript;
        }
      }

      const spoken = (finalTranscript + interimTranscript).trim();
      const newText = baseValue.trim()
        ? baseValue.trim() + ' ' + spoken
        : spoken;

      onChange(newText);
    };

    recognition.onerror = (event: any) => {
      console.error('[Voice] Error:', event.error);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setStatusText(`Error: ${event.error}`);
        setTimeout(() => setStatusText(null), 2000);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setStatusText(null);
      setIntensity(0.5);
      if (intensityIntervalRef.current) {
        clearInterval(intensityIntervalRef.current);
        intensityIntervalRef.current = null;
      }
      inputRef.current?.focus();
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('[Voice] Start failed:', e);
      setStatusText('Microphone access denied');
      setTimeout(() => setStatusText(null), 2000);
    }
  }, [disabled, isLoading, isListening, value, onChange]);

  // Stop voice recognition
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setStatusText(null);
    if (intensityIntervalRef.current) {
      clearInterval(intensityIntervalRef.current);
      intensityIntervalRef.current = null;
    }
  }, []);

  const normalizeWaveform = useCallback((samples: number[], points: number = 40) => {
    if (samples.length === 0) return new Array(points).fill(0.08);
    const out: number[] = [];
    const step = Math.max(1, Math.floor(samples.length / points));
    for (let i = 0; i < samples.length; i += step) {
      const chunk = samples.slice(i, i + step);
      const avg = chunk.reduce((acc, v) => acc + v, 0) / chunk.length;
      out.push(Math.max(0.02, Math.min(1, Number(avg.toFixed(4)))));
      if (out.length >= points) break;
    }
    while (out.length < points) out.push(out[out.length - 1] || 0.08);
    return out;
  }, []);

  const cleanupSampleRecording = useCallback(() => {
    if (sampleRafRef.current) {
      cancelAnimationFrame(sampleRafRef.current);
      sampleRafRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  const stopSampleRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      cleanupSampleRecording();
      setIsSampleRecording(false);
      setStatusText(null);
      setIntensity(0.5);
    }
  }, [cleanupSampleRecording]);

  const startSampleRecording = useCallback(async () => {
    if (disabled || isLoading || isSampleRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      waveformRef.current = [];
      recordingStartRef.current = Date.now();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      const freqArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const sampleLevel = () => {
        const analyser = analyserRef.current;
        if (!analyser) return;
        analyser.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        const level = Math.min(1, Math.max(0.02, rms * 5));
        setIntensity(level);
        waveformRef.current.push(level);
        analyser.getByteFrequencyData(freqArray);
        const barsCount = 28;
        const bucketSize = Math.max(1, Math.floor(freqArray.length / barsCount));
        const bars: number[] = [];
        for (let b = 0; b < barsCount; b += 1) {
          const start = b * bucketSize;
          const end = Math.min(freqArray.length, start + bucketSize);
          let sum = 0;
          for (let i = start; i < end; i += 1) sum += freqArray[i];
          const avg = end > start ? sum / (end - start) : 0;
          bars.push(Math.max(0.02, Math.min(1, avg / 255)));
        }
        liveBarsRef.current = bars;
        sampleRafRef.current = requestAnimationFrame(sampleLevel);
      };

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const durationMs = Math.max(1, Date.now() - recordingStartRef.current);
        const finalMime = mimeType || recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const waveform = normalizeWaveform(waveformRef.current);

        setIsSampleRecording(false);
        setStatusText('Sending voice...');
        cleanupSampleRecording();
        liveBarsRef.current = [];
        setIntensity(0.5);

        try {
          await onVoiceRecorded?.({
            blob,
            waveform,
            durationMs,
            mimeType: finalMime,
          });
        } finally {
          setStatusText(null);
        }
      };

      recorder.start(120);
      setIsSampleRecording(true);
      setStatusText('Recording...');
      sampleRafRef.current = requestAnimationFrame(sampleLevel);
    } catch (e) {
      console.error('[Voice] Sample record start failed:', e);
      setStatusText('Microphone access denied');
      setTimeout(() => setStatusText(null), 2500);
      cleanupSampleRecording();
      setIsSampleRecording(false);
    }
  }, [cleanupSampleRecording, disabled, isLoading, isSampleRecording, normalizeWaveform, onVoiceRecorded]);

  // Cleanup media/timers on unmount.
  useEffect(() => {
    return () => {
      if (autoSendTimerRef.current) {
        window.clearTimeout(autoSendTimerRef.current);
      }
      cleanupSampleRecording();
    };
  }, [cleanupSampleRecording]);

  // Keep ChatPanel aware of active voice mode for backend voice policy wiring.
  useEffect(() => {
    onRealtimeVoiceChange?.(realtimeVoice.isListening || realtimeVoice.isModelSpeaking || isSampleRecording);
  }, [isSampleRecording, onRealtimeVoiceChange, realtimeVoice.isListening, realtimeVoice.isModelSpeaking]);

  // If user starts typing, explicitly drop voice mode flags.
  useEffect(() => {
    if (hasText) {
      onRealtimeVoiceChange?.(false);
      onVoiceOnlyModeChange?.(false);
    }
  }, [hasText, onRealtimeVoiceChange, onVoiceOnlyModeChange]);

  // Phase 60.5: Trigger 3 - Auto-continue voice after model response
  // When isLoading goes from true to false and autoContinueVoice is on,
  // start listening again (simulates continuous voice dialog)
  const wasLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    // Only trigger when loading just finished
    if (wasLoading && !isLoading && autoContinueVoice) {
      // Check if we should auto-start voice (voice mode conditions met)
      const shouldAutoStart =
        (!hasText && hasRawText) ||
        (voiceModelDetection.hasVoiceModel && !voiceModelDetection.hasTextAfter) ||
        isReplyingToVoiceModel ||
        isSelectedModelVoice ||
        voiceOnlyMode;

      if (shouldAutoStart && !isListening && !realtimeVoice.isListening) {
        // Small delay to let the response render and audio finish
        const timer = setTimeout(() => {
          // Use realtime or legacy based on setting
          if (realtimeVoiceEnabled) {
            realtimeVoice.startListening();
          } else {
            startListening();
          }
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [isLoading, autoContinueVoice, hasText, hasRawText, voiceModelDetection, isReplyingToVoiceModel, isSelectedModelVoice, voiceOnlyMode, isListening, startListening, realtimeVoiceEnabled, realtimeVoice]);

  // Smart button click handler
  // Phase 60.5.1: Voice models now use realtime pipeline automatically
  // MARKER_90.1_START: Fix voice/text priority
  const handleButtonClick = useCallback(() => {
    // PRIORITY 0: sample recording must always stop on button click.
    if (isSampleRecording) {
      stopSampleRecording();
      return;
    }

    // PRIORITY 1: If user typed text, ALWAYS send text (regardless of voice model)
    if (hasText) {
      // Stop any active voice recording first
      if (isListening) stopListening();
      if (realtimeVoice.isListening) realtimeVoice.stopListening();
      onSend();
      return;
    }

    // PRIORITY 2: Voice mode active (empty input + voice model selected/mentioned)
    if (showVoiceMode || voiceOnlyMode || isSelectedModelVoice) {
      startSampleRecording();
      return;
    }

    // Legacy voice mode (for non-voice models with voiceOnlyMode)
    if (isListening) {
      stopListening();
    }
  }, [hasText, isListening, isSampleRecording, isSelectedModelVoice, onSend, realtimeVoice, showVoiceMode, startSampleRecording, stopListening, stopSampleRecording, voiceOnlyMode]);
  // MARKER_90.1_END

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isSampleRecording) {
          stopSampleRecording();
          return;
        }
        if (hasText) {
          if (isListening) stopListening();
          if (realtimeVoice.isListening) realtimeVoice.stopListening();
          onSend();
        } else if (showVoiceMode) {
          startSampleRecording();
        }
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        if (isSampleRecording) {
          stopSampleRecording();
          return;
        }
        if (isListening) stopListening();
        if (realtimeVoice.isListening) realtimeVoice.stopListening();
      }
    },
    [hasText, isListening, isSampleRecording, onSend, realtimeVoice, showVoiceMode, startSampleRecording, stopListening, stopSampleRecording]
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [value]);

  // Button styling - Nolan style (white/gray, subtle)
  const getButtonStyle = () => {
    if (isLoading) {
      return { bg: '#2a2a2a', color: '#555', shadow: 'none' };
    }
    if (isSampleRecording) {
      return { bg: '#1a2a3a', color: '#4a9eff', shadow: '0 0 22px rgba(74, 158, 255, 0.55)' };
    }
    // Phase 60.5.1: Realtime voice states
    if (realtimeVoice.isModelSpeaking) {
      // Model speaking - green glow
      return { bg: '#1a3a2a', color: '#4aff9e', shadow: '0 0 20px rgba(74, 255, 158, 0.5)' };
    }
    if (realtimeVoice.isSpeaking) {
      // User speaking - bright blue
      return { bg: '#1a2a3a', color: '#4a9eff', shadow: '0 0 25px rgba(74, 158, 255, 0.6)' };
    }
    if (realtimeVoice.isListening) {
      // Listening but not speaking - subtle blue
      return { bg: '#1a2a3a', color: '#4a9eff', shadow: '0 0 15px rgba(74, 158, 255, 0.4)' };
    }
    if (isListening) {
      // Legacy listening - blue glow
      return { bg: '#1a2a3a', color: '#4a9eff', shadow: '0 0 20px rgba(74, 158, 255, 0.5)' };
    }
    if (showVoiceMode) {
      // Voice model detected - subtle blue hint
      return { bg: '#1a2a30', color: '#6ab', shadow: '0 0 10px rgba(100, 170, 187, 0.25)' };
    }
    if (hasText) {
      // Ready to send - white (Nolan style, not green)
      return { bg: '#333', color: '#fff', shadow: '0 0 8px rgba(255, 255, 255, 0.15)' };
    }
    // Empty - subtle gray
    return { bg: '#2a2a2a', color: '#555', shadow: 'none' };
  };

  const btnStyle = getButtonStyle();

  // Help text
  const getHelpText = () => {
    // Phase 60.5.1: Realtime voice states
    if (realtimeVoice.isModelSpeaking) {
      return 'model speaking • click to interrupt';
    }
    if (realtimeVoice.isSpeaking) {
      return 'speak... • pause to send';
    }
    if (realtimeVoice.isListening) {
      return 'listening... • stop';
    }
    if (isListening) {
      return 'stop • Esc cancel';
    }
    if (showVoiceMode) {
      return 'voice mode • type for text';
    }
    return 'Enter — send • Shift+Enter — new line';
  };

  return (
    <div style={{ padding: 12, borderTop: '1px solid #222', position: 'relative' }}>
      {/* Mention popup */}
      {/* Phase 80.30: Pass soloModels for solo chat @mention dropdown */}
      {showMentions && (
        <MentionPopup
          filter={mentionFilter}
          onSelect={handleMentionSelect}
          isGroupMode={isGroupMode}
          groupParticipants={groupParticipants}
          soloModels={soloModels}
        />
      )}

      {/* Status indicator */}
      {statusText && (
        <div
          style={{
            position: 'absolute',
            top: -26,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f1a2a',
            color: '#4a9eff',
            padding: '4px 14px',
            borderRadius: 12,
            fontSize: 12,
            border: '1px solid #2a3a4a',
            whiteSpace: 'nowrap',
          }}
        >
          {statusText}
        </div>
      )}

      {/* Input container */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: '#1a1a1a',
          borderRadius: 14,
          padding: '10px 14px',
          border: isVoiceActive
            ? realtimeVoice.isModelSpeaking
              ? '1px solid #4aff9e50'
              : '1px solid #4a9eff50'
            : '1px solid #333',
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
          boxShadow: isVoiceActive
            ? realtimeVoice.isModelSpeaking
              ? '0 0 20px rgba(74, 255, 158, 0.15)'
              : '0 0 20px rgba(74, 158, 255, 0.15)'
            : 'none',
        }}
      >
        {/* Wave canvas - shown when listening (legacy or realtime) */}
        {isVoiceActive && (
          <canvas
            ref={canvasRef}
            width={100}
            height={36}
            style={{
              display: 'block',
              flexShrink: 0,
            }}
          />
        )}

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            realtimeVoice.isListening
              ? realtimeVoice.isSpeaking
                ? 'Speak...'
                : 'Listening...'
              : isSampleRecording
              ? 'Recording voice...'
              : isListening
              ? 'Speak...'
              : replyTo
              ? `Reply to ${replyTo}...`
              : 'Type a message...'
          }
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: '#fff',
            resize: 'none',
            outline: 'none',
            fontSize: 14,
            lineHeight: 1.4,
            minHeight: 22,
            maxHeight: 120,
            fontFamily: 'inherit',
            opacity: isVoiceActive ? 0.8 : 1,
          }}
          rows={1}
        />

        {/* Smart button: Send / Mic / Stop / Speaker */}
        <button
          onClick={handleButtonClick}
          disabled={disabled || (!hasText && !showVoiceMode && !isVoiceActive)}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: btnStyle.bg,
            color: btnStyle.color,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            boxShadow: btnStyle.shadow,
            opacity: disabled ? 0.5 : 1,
            flexShrink: 0,
          }}
          title={
            realtimeVoice.isModelSpeaking
              ? 'Interrupt model'
              : realtimeVoice.isListening
              ? 'Stop'
              : isSampleRecording
              ? 'Stop & send'
              : isListening
              ? 'Stop recording'
              : showVoiceMode
              ? 'Voice input'
              : 'Send (Enter)'
          }
        >
          {isLoading ? (
            <Loader2 size={18} className="vetka-spin" />
          ) : realtimeVoice.isModelSpeaking ? (
            <Volume2 size={18} />
          ) : realtimeVoice.isListening || isListening || isSampleRecording ? (
            <Square size={14} fill="currentColor" />
          ) : showVoiceMode ? (
            <Mic size={20} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>

      {!hideHelp && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            color: '#444',
            textAlign: 'center',
          }}
        >
          {getHelpText()}
        </div>
      )}

      <style>{`
        .vetka-spin { animation: vetka-spin 1s linear infinite; }
        @keyframes vetka-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
