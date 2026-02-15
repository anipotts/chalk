import type { RefObject } from "react";
import type { VoiceState } from "@/hooks/useVoiceMode";
import type { TranscriptSegment, TranscriptSource, IntervalSelection } from "@/lib/video-utils";
import type { StoryboardLevel } from "@/lib/storyboard";
import type {
  ParsedQuiz,
  ParsedExplanation,
  LearnModePhase,
  LearnAction,
} from "@/hooks/useLearnMode";
import type { LearnOption } from "@/hooks/useLearnOptions";
import type { UnifiedExchange } from "./ExchangeMessage";
import type { ToolCallData } from "./ToolRenderers";

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
  onStopPlayback: () => void;
  duration: number;
  error: string | null;
}

export interface InteractionOverlayProps {
  phase: import('@/hooks/useOverlayPhase').OverlayPhase;
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
  onStopPlayback: () => void;

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

  onSeek: (seconds: number) => void;
  onClose: () => void;
  inputRef?: RefObject<HTMLElement | null>;
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
  onOpenLearnMode: () => void;
  onSelectAction: (action: LearnAction) => void;
  onFocusInput?: () => void;
  onSelectAnswer: (questionIndex: number, optionId: string) => void;
  onNextBatch: () => void;
  onStopLearnMode: () => void;

  // Curriculum context (cross-video playlist)
  curriculumContext?: string | null;
  curriculumVideoCount?: number;

  // Explore mode (from unified mode hook)
  exploreMode: boolean;
  onToggleExploreMode: () => void;
  onExploreSubmit: (text: string) => Promise<void>;
  onStopExploreStream: () => void;
  exploreError: string | null;
  explorePills: string[];
  isThinking: boolean;
  thinkingDuration: number | null;

  // Storyboard data for timestamp hover cards
  storyboardLevels?: StoryboardLevel[];

  // Interval selection
  interval?: IntervalSelection | null;
  onClearInterval?: () => void;

  // Side panel open state (disables Knowledge Drawer when true)
  sideOpen?: boolean;

  // Video paused state (for caret color)
  isPaused?: boolean;
}
