export type QuestionCategory =
  | 'Technical'
  | 'HR'
  | 'Behavioral'
  | 'Project'
  | 'Resume'
  | 'Coding'
  | 'General'
  | 'System Design'
  | 'Technical Concepts'
  | 'Coding & Algorithms'
  | 'Behavioral & Situational'
  | 'Project & Architecture'
  | 'Experience & Background'
  | 'HR & Culture Fit'
  | 'Contextual Follow-up'
  | (string & {});

export type AssistantStatus =
  | 'READY'
  | 'STARTING...'
  | 'LISTENING...'
  | 'UNDERSTANDING...'
  | 'QUESTION DETECTED'
  | 'ANALYZING...'
  | 'GENERATING...'
  | 'ANSWER READY';

export interface ProjectEntry {
  id: string;
  title: string;
  role: string;
  techStack: string;
  description: string;
  highlights: string;
}

export interface ExperienceEntry {
  id: string;
  role: string;
  company: string;
  period: string;
  description: string;
}

export interface CandidateProfile {
  name: string;
  email?: string;
  phone?: string;
  targetRole: string;
  degree: string;
  college: string;
  gradYear: string;
  summary: string;
  technicalSkills: string[];
  programmingLanguages: string[];
  frameworks: string[];
  testingAutomationSkills?: string[];
  toolsDatabases: string[];
  projects: ProjectEntry[];
  experience: ExperienceEntry[];
  internships?: ExperienceEntry[];
  certifications: string[];
  achievements?: string[];
  otherInfo: string;
}

export interface ConversationTurn {
  id: string;
  question: string;
  answer: string;
  category: QuestionCategory;
  intent: string;
  timestamp: number;
  durationMs?: number;
  isFavorite?: boolean;
}

export interface InterviewSettings {
  silenceThresholdMs: number; // 800, 1000, 1500, 2000
  answerStyle: 'concise' | 'detailed' | 'bullet';
  autoAnswer: boolean;
  enableSpeechSynthesisPreview: boolean;
  minWordCountToTrigger: number;
  customApiKey?: string;
}
