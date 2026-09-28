interface UseRealtimeVoiceOptions {
  chatMode?: boolean;
  model?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onLLMToken?: (token: string) => void;
  onModelSpeaking?: (speaking: boolean) => void;
  onError?: (error: string) => void;
}

interface UseRealtimeVoiceReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isModelSpeaking: boolean;
  audioLevel: number;
  startListening: () => void;
  stopListening: () => void;
}

export function useRealtimeVoice(_options: UseRealtimeVoiceOptions = {}): UseRealtimeVoiceReturn {
  return {
    isListening: false,
    isSpeaking: false,
    isModelSpeaking: false,
    audioLevel: 0,
    startListening: () => {},
    stopListening: () => {},
  };
}
