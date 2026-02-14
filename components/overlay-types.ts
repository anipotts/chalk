import type { RefObject } from "react";
import type { VoiceState } from "@/hooks/useVoiceMode";
import type { TranscriptSegment, TranscriptSource } from "@/lib/video-utils";
import type {
  ParsedQuiz,
  ParsedExplanation,
  LearnModePhase,
  LearnAction,
} from "@/hooks/useLearnMode";
import type { LearnOption } from "@/hooks/useLearnOptions";
import type { UnifiedExchange } from "./ExchangeMessage";
import type { ToolCallData } from "./ToolRenderers";

export type ViewSize = "compact" | "default" | "expanded";

export interface LearnState {
  phase: LearnModePhase;
  selectedAction: LearnAction | null;
  quiz: ParsedQuiz | null;
  explanation: ParsedExplanation | null;
  introText: string;
  responseContent: string;
  exportableContent: string | null;
  answers: Map<number, string>;
  score: { correct: number; total: number };
  thinking: string | null;
  thinkingDuration: number | null;
  isLoading: boolean;
  error: string | null;
  options: LearnOption[];
  optionsLoading: boolean;
}

export interface LearnHandlers {
  onSelectAction: (action: LearnAction) => void;
  onFocusInput?: () => void;
  onSelectAnswer: (questionIndex: number, optionId: string) => void;
  onNextBatch: () => void;
  onStop: () => void;
}

export interface VoiceControls {
  state: VoiceState;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  duration: number;
  error: string | null;
}

export interface InteractionOverlayProps {
  expanded: boolean;
  phase?: import('@/hooks/useOverlayPhase').OverlayPhase;
  lingerProgress?: number;
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  transcriptSource?: TranscriptSource;
  voiceId: string | null;
  isVoiceCloning: boolean;

  // Voice state
  voiceState: VoiceState;
  voiceTranscript: string;
  voiceResponseText: string;
  voiceError: string | null;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;

  // Text state
  isTextStreaming: boolean;
  currentUserText: string;
  currentAiText: string;
  currentToolCalls?: ToolCallData[];
  currentRawAiText?: string;
  textError: string | null;
  onTextSubmit: (text: string) => Promise<void>;
  onStopTextStream: () => void;

  // Side panel
  onOpenVideo?: (
    videoId: string,
    title: string,
    channelName: string,
    seekTo?: number,
  ) => void;

  // Read aloud
  autoReadAloud: boolean;
  onToggleAutoReadAloud: (enabled: boolean) => void;
  playingMessageId: string | null;
  onPlayMessage: (id: string, text: string) => void;
  isReadAloudLoading: boolean;

  // Unified state
  exchanges: UnifiedExchange[];
  onClearHistory: () => void;

  videoDimLevel: number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
  onExpandOverlay?: () => void;
  onInteract?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  inputVisible?: boolean;
  pendingChar?: string | null;
  onPendingCharConsumed?: () => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;

  // Learn mode
  learnPhase: LearnModePhase;
  learnSelectedAction: LearnAction | null;
  learnQuiz: ParsedQuiz | null;
  learnExplanation: ParsedExplanation | null;
  learnIntroText: string;
  learnResponseContent: string;
  learnExportableContent: string | null;
  learnAnswers: Map<number, string>;
  learnScore: { correct: number; total: number };
  learnThinking: string | null;
  learnThinkingDuration: number | null;
  learnLoading: boolean;
  learnError: string | null;
  learnOptions: LearnOption[];
  learnOptionsLoading: boolean;
  onEnsureLearnOptions?: () => void;
  onOpenLearnMode: () => void;
  onSelectAction: (action: LearnAction) => void;
  onFocusInput?: () => void;
  onSelectAnswer: (questionIndex: number, optionId: string) => void;
  onNextBatch: () => void;
  onStopLearnMode: () => void;

  // Curriculum context (cross-video playlist)
  curriculumContext?: string | null;
  curriculumVideoCount?: number;

  // External streaming control (unified model)
  onAddExchange?: (exchange: UnifiedExchange) => void;
  onSetStreamingState?: (state: {
    userText?: string;
    aiText?: string;
    isStreaming?: boolean;
    toolCalls?: ToolCallData[];
  }) => void;
  currentMode?: 'chat' | 'explore';
  onSetCurrentMode?: (mode: 'chat' | 'explore') => void;

  // View size for scaling input strip + captions
  viewSize?: ViewSize;
}
