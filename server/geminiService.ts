import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

/**
 * Returns a GoogleGenAI client instance with the active API key.
 */
export function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const activeKey = customApiKey?.trim() || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey: activeKey,
  });
}

// Default export for backward compatibility
export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    const client = getGeminiClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export interface CandidateProfile {
  name: string;
  degree: string;
  college: string;
  gradYear?: string;
  targetRole?: string;
  summary: string;
  technicalSkills: string[];
  programmingLanguages: string[];
  frameworks: string[];
  toolsDatabases: string[];
  projects: Array<{
    title: string;
    role?: string;
    techStack: string;
    description: string;
    highlights?: string;
  }>;
  experience: Array<{
    role: string;
    company: string;
    period: string;
    description: string;
  }>;
  certifications: string[];
  otherInfo?: string;
}

export interface ConversationMessage {
  role: 'interviewer' | 'candidate';
  text: string;
  timestamp?: number;
}

export interface GenerateAnswerOptions {
  question: string;
  profile?: CandidateProfile;
  conversationHistory?: ConversationMessage[];
  style?: 'concise' | 'detailed' | 'bullet';
  customApiKey?: string;
}

/**
 * Builds an adaptive, high-impact prompt for general-purpose interview question answering.
 * Combines ChatGPT-style broad intelligence with candidate dossier truth.
 */
function buildSystemInstruction(profile?: CandidateProfile): string {
  let profileSection = 'No candidate profile specified. Answer general/technical questions with deep expertise, and role questions with articulate competence.';

  if (profile && (profile.name || profile.technicalSkills?.length || profile.projects?.length)) {
    const role = profile.targetRole || 'Software Engineer';
    const skills = [
      ...(profile.technicalSkills || []),
      ...(profile.programmingLanguages || []),
      ...(profile.frameworks || []),
      ...(profile.toolsDatabases || []),
    ].filter(Boolean).slice(0, 12).join(', ');

    const projects = (profile.projects || [])
      .slice(0, 3)
      .map(
        (p) =>
          `"${p.title}" (${p.techStack}): ${p.description}${p.highlights ? ` [Key Highlights: ${p.highlights}]` : ''}`
      )
      .join('; ');

    const experience = (profile.experience || [])
      .slice(0, 2)
      .map((e) => `${e.role} at ${e.company} (${e.period}): ${e.description}`)
      .join('; ');

    profileSection = `CANDIDATE DOSSIER (Ground Truth):
- Name: ${profile.name || 'Candidate'}
- Target Role: ${role}
- Core Skills: ${skills}
- Projects: ${projects || 'N/A'}
- Experience: ${experience || 'N/A'}
- Education: ${profile.degree || ''} ${profile.college ? `at ${profile.college}` : ''}
- Summary: ${profile.summary || 'N/A'}`;
  }

  return `You are VoxInterview AI, a state-of-the-art, general-purpose interview question answering agent and live co-pilot. You combine the broad, accurate reasoning of a top-tier conversational AI with personalized grounded responses.

CORE OPERATING PRINCIPLES:
1. UNRESTRICTED GENERAL-PURPOSE SCOPE:
   You answer ANY question asked by the interviewer. You are NOT restricted to predefined categories. Whether the question is technical, system design, architecture, live coding, algorithms, behavioral, HR, resume-specific, situational, domain knowledge, or general inquiry, directly provide an accurate, high-quality answer.

2. ADAPTIVE CONTEXT & PERSPECTIVE:
   - When the question is about the candidate (their background, resume, specific projects, decisions, teamwork, past challenges): Speak in a natural, confident first-person style ("I", "in my project...", "my approach was..."). Strictly draw from the CANDIDATE DOSSIER below. NEVER invent non-existent companies, degrees, or projects.
   - When the question is technical or conceptual (e.g. "How does the virtual DOM work?", "Explain event-driven architecture", "What is an index in SQL?"): Use your deep general model intelligence to give a crystal-clear, accurate explanation, with a small concrete example or syntax snippet when useful.
   - When the question is coding or algorithmic: Clearly outline the optimal algorithmic approach, time/space complexity, and clean code or pattern when appropriate.
   - When the question is behavioral: Provide a realistic, structured response grounded in the candidate's actual projects and experience.
   - When the question is project-related: Use only the candidate's actual project information and technical stack.

3. CONVERSATION MEMORY & FOLLOW-UP RESOLUTION:
   Maintain active conversation context across turns. For follow-ups like:
   "What did you use?" / "Why did you choose it?" / "How does it work?" / "Tell me more about that project" / "How would you optimize this approach?"
   seamlessly resolve pronouns ("it", "that", "this") from previous questions and answers.

4. AMBIGUOUS QUESTIONS:
   If a question is short or ambiguous, infer the most likely interview context and answer naturally. Never ask "could you clarify?" or return "unsupported question" or generic error fallbacks.

5. SPEAKABILITY & CONCISENESS:
   - Deliver the answer directly without repeating the question or adding conversational throat-clearing ("Sure, I can answer that...").
   - Keep answers speakable and concise enough for an active interview (typically 2 to 4 crisp sentences, or structured bullet/code points when technical depth is required).

${profileSection}`;
}

/**
 * Classifies question intent and category dynamically without ever restricting questions.
 */
export function classifyQuestion(question: string): {
  category: string;
  intent: string;
} {
  const lower = question.toLowerCase().trim();
  
  if (lower.includes('project') || lower.includes('portfolio') || lower.includes('built') || lower.includes('app you worked on') || lower.includes('your application') || lower.includes('pipeline') || lower.includes('architecture')) {
    return { category: 'Project & Architecture', intent: 'Analyzing project decisions, architecture, and engineering outcomes' };
  }
  if (lower.includes('resume') || lower.includes('background') || lower.includes('yourself') || lower.includes('walk me through') || lower.includes('experience at') || lower.includes('tell me about you') || lower.includes('career')) {
    return { category: 'Experience & Background', intent: 'Candidate background overview, career progression, and strengths' };
  }
  if (lower.includes('tell me about a time') || lower.includes('conflict') || lower.includes('disagree') || lower.includes('challenge') || lower.includes('mistake') || lower.includes('failure') || lower.includes('weakness') || lower.includes('proudest') || lower.includes('situation')) {
    return { category: 'Behavioral & Situational', intent: 'Assessing soft skills, problem-solving, and collaboration' };
  }
  if (lower.includes('code') || lower.includes('algorithm') || lower.includes('complexity') || lower.includes('time complexity') || lower.includes('data structure') || lower.includes('implement') || lower.includes('function') || lower.includes('array') || lower.includes('binary tree') || lower.includes('dynamic programming') || lower.includes('leetcode')) {
    return { category: 'Coding & Algorithms', intent: 'Algorithmic approach, data structures, and implementation logic' };
  }
  if (lower.includes('salary') || lower.includes('why this company') || lower.includes('why us') || lower.includes('notice period') || lower.includes('relocate') || lower.includes('culture') || lower.includes('long term') || lower.includes('where do you see yourself')) {
    return { category: 'HR & Culture Fit', intent: 'Company alignment, role motivation, and logistical readiness' };
  }
  if (lower.includes('system design') || lower.includes('scale') || lower.includes('microservice') || lower.includes('load balancer') || lower.includes('cache') || lower.includes('sharding') || lower.includes('kafka') || lower.includes('queue') || lower.includes('latency') || lower.includes('throughput')) {
    return { category: 'System Design', intent: 'Distributed systems, scalability patterns, and architectural trade-offs' };
  }
  if (lower.includes('react') || lower.includes('state') || lower.includes('hook') || lower.includes('typescript') || lower.includes('database') || lower.includes('sql') || lower.includes('nosql') || lower.includes('async') || lower.includes('api') || lower.includes('rest') || lower.includes('graphql') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('difference between') || lower.includes('how does') || lower.includes('what is') || lower.includes('explain')) {
    return { category: 'Technical Concepts', intent: 'Technical concept clarity, mechanics, and domain principles' };
  }
  if (/^(why|what did you|how did you|which one|it\b|that\b|this\b)/i.test(lower)) {
    return { category: 'Contextual Follow-up', intent: 'Deep-dive inquiry into preceding conversation context' };
  }
  
  return { category: 'General Interview Inquiry', intent: 'General domain inquiry and interview dialogue' };
}

/**
 * Streams answer generation using Gemini SDK with low-latency model cascade and multi-turn context.
 */
export async function streamAnswerGeneration(
  options: GenerateAnswerOptions,
  onChunk: (chunk: string) => void
): Promise<{ text: string; category: string; intent: string }> {
  const { question, profile, conversationHistory = [], style = 'concise' } = options;

  const classification = classifyQuestion(question);
  const systemInstruction = buildSystemInstruction(profile);

  // Build full multi-turn conversation context (up to last 6 turns for pronoun & topic resolution)
  const contents: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];
  const recentHistory = conversationHistory.slice(-6);

  for (const item of recentHistory) {
    if ((item as any).question && (item as any).answer) {
      contents.push({ role: 'user', parts: [{ text: (item as any).question }] });
      contents.push({ role: 'model', parts: [{ text: (item as any).answer }] });
    } else if (item.role && item.text) {
      contents.push({
        role: item.role === 'interviewer' || (item.role as any) === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }],
      });
    }
  }

  // Current turn with specific style modifier
  let promptText = question;
  if (style === 'detailed') {
    promptText += '\n[Guidance: Provide a thorough, direct explanation with a concrete example or code where helpful, concise enough to speak naturally.]';
  } else if (style === 'bullet') {
    promptText += '\n[Guidance: Provide a direct opening statement followed by 2-3 crisp bullet points.]';
  } else {
    promptText += '\n[Guidance: Answer directly, accurately, and naturally. If technical, include a small example if useful. If coding, outline approach and code. If about candidate, speak in first person using dossier.]';
  }

  contents.push({
    role: 'user',
    parts: [{ text: promptText }],
  });

  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ];
  const activeKey = options.customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
  if (!activeKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please add GEMINI_API_KEY to environment variables or Settings.');
  }
  const activeAi = new GoogleGenAI({ apiKey: activeKey });
  const attemptErrors: string[] = [];

  for (const modelName of candidateModels) {
    try {
      const config: any = {
        systemInstruction: systemInstruction,
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 600,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      };

      const responseStream = await activeAi.models.generateContentStream({
        model: modelName,
        contents: contents,
        config: config,
      });

      let fullAnswer = '';
      for await (const chunk of responseStream) {
        const text = chunk.text || '';
        if (text) {
          fullAnswer += text;
          onChunk(text);
        }
      }

      if (fullAnswer.trim()) {
        return {
          text: fullAnswer.trim(),
          category: classification.category,
          intent: classification.intent,
        };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`Model ${modelName} stream attempt error:`, errMsg);
      attemptErrors.push(`[${modelName}]: ${errMsg}`);
      continue;
    }
  }

  throw new Error(`Failed to generate answer from candidate models. Errors: ${attemptErrors.join(' | ')}`);
}


/**
 * Creates a short-lived ephemeral token for client-side Gemini Live API WebSocket access.
 * Keeps permanent server API key secure and returns strictly the token.
 */
export async function createLiveSessionToken(customApiKey?: string): Promise<{ token: string }> {
  const activeKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
  if (!activeKey) {
    throw new Error('GEMINI_API_KEY is not configured on the production server. Please add GEMINI_API_KEY to Vercel environment variables or enter it in Settings.');
  }

  const client = new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: expireTime,
      newSessionExpireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });

  const tokenString =
    token?.name ||
    (token as any)?.token ||
    (typeof token === 'string' ? token : '');

  if (!tokenString) {
    throw new Error('Failed to obtain token from Gemini Live auth service');
  }

  return {
    token: tokenString,
  };
}

export interface GenerateAudioAnswerOptions {
  audioBase64: string;
  mimeType?: string;
  profile?: CandidateProfile;
  conversationHistory?: ConversationMessage[];
  style?: 'concise' | 'detailed' | 'bullet';
}

/**
 * Transcribes spoken audio and streams answer generation directly from audio bytes.
 */
export async function streamAudioAnswerGeneration(
  options: GenerateAudioAnswerOptions,
  onChunk: (chunk: string) => void
): Promise<{ text: string; question: string; category: string; intent: string }> {
  const { audioBase64, mimeType = 'audio/wav', profile, style = 'concise' } = options;
  const systemInstruction = buildSystemInstruction(profile);

  const styleGuide =
    style === 'detailed'
      ? 'Provide a comprehensive 4-5 sentence technical answer.'
      : style === 'bullet'
      ? 'Provide a concise opening sentence followed by 2-3 high-impact bullet points.'
      : 'Keep the spoken answer concise and natural in 2-3 sentences.';

  const promptText = `Listen carefully to the audio of the interviewer asking a question.
Required output format:
1. On the first line, output the interviewer's exact transcribed question prefixed with "QUESTION: ".
2. On subsequent lines, give the candidate's natural first-person spoken answer ("I", "in my experience...", "on my project...").
${styleGuide}
Ground truth: Adhere strictly to the candidate dossier. Never invent experiences or skills.`;

  const contents: any = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    },
  ];

  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ];
  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 600,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        const text = chunk.text || '';
        if (text) {
          fullText += text;
          onChunk(text);
        }
      }

      if (fullText.trim()) {
        let question = '';
        let answer = fullText.trim();
        const questionMatch = fullText.match(/^QUESTION:\s*([^\n\r]+)/i);
        if (questionMatch) {
          question = questionMatch[1].trim();
          answer = fullText.replace(/^QUESTION:\s*[^\n\r]+[\r\n]*/i, '').trim();
        }
        const classification = classifyQuestion(question || fullText);

        return {
          text: answer,
          question: question,
          category: classification.category,
          intent: classification.intent,
        };
      }
    } catch (err: any) {
      console.warn(`Model ${modelName} audio stream attempt error:`, err?.message || err);
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error('Failed to generate answer from audio.');
}

