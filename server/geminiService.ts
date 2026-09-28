import { GoogleGenAI } from '@google/genai';

// Initialize the GoogleGenAI instance with the server-side API key
const apiKey = process.env.GEMINI_API_KEY || '';

export const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
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
 * Builds a compact, high-impact prompt for Gemini low-latency generation.
 */
function buildSystemInstruction(profile?: CandidateProfile): string {
  let profileSection = 'No specific candidate profile provided. Answer as an articulate, competent software engineer speaking from personal experience.';

  if (profile && (profile.name || profile.technicalSkills?.length || profile.projects?.length)) {
    profileSection = `
CANDIDATE DOSSIER (Ground Truth - NEVER invent experiences, skills, or projects not listed here):
- Name: ${profile.name || 'Candidate'}
- Target Role: ${profile.targetRole || 'Software Engineer'}
- Education: ${profile.degree || 'Degree'} at ${profile.college || 'University'} (${profile.gradYear || ''})
- Summary: ${profile.summary || 'N/A'}
- Core Skills: ${(profile.technicalSkills || []).join(', ')}
- Languages: ${(profile.programmingLanguages || []).join(', ')}
- Frameworks & Tools: ${(profile.frameworks || []).concat(profile.toolsDatabases || []).join(', ')}
- Projects:
${(profile.projects || [])
  .map(
    (p, idx) =>
      `  [Project ${idx + 1}] "${p.title}" (Tech: ${p.techStack}): ${p.description} ${p.highlights ? `Key Achievements: ${p.highlights}` : ''}`
  )
  .join('\n')}
- Experience:
${(profile.experience || [])
  .map((e) => `  - ${e.role} at ${e.company} (${e.period}): ${e.description}`)
  .join('\n')}
- Certifications: ${(profile.certifications || []).join(', ')}
- Additional Info: ${profile.otherInfo || 'N/A'}
`;
  }

  return `You are a real-time interview co-pilot whisperer for a candidate sitting in an active live interview.
Your role is to produce natural, confident, direct first-person spoken answers ("I", "in my experience", "on my team", "in my project...") that the candidate can read and speak aloud naturally without hesitation.

CRITICAL RULES:
1. STRICT TRUTH TO CANDIDATE DOSSIER: NEVER invent companies, degrees, metrics, projects, or technologies that the candidate does not have in their dossier. If asked about a project or experience, draw strictly from their real projects.
2. ANSWER LENGTH & PACING: Keep answers between 2 to 4 punchy, natural sentences (around 50-85 words) by default. For deep system architecture or complex coding/technical questions, provide up to 5 structured sentences.
3. CONVERSATIONAL & EASY TO SPEAK: Avoid textbook definitions, bulleted fluff, or throat-clearing openings like "Certainly, I'd be happy to explain" or "That is a great question". Jump straight into the authentic answer.
4. FOLLOW-UP AWARENESS: If the interviewer asks a follow-up ("What technologies did you use in it?", "Why did you choose that?", "What was the hardest part?"), use the recent conversation history to identify what "it" refers to and answer seamlessly.
5. NO VOICE DIRECTIVES: Do not include stage directions like "(laughs)" or "(pause)". Output clean spoken text.
6. PUNCHY KEY CUES: At the end of your spoken response, you may add 1-2 high-yield bullet cues starting with "• " (e.g. • Key metric: 40ms sync latency • Stack: React, WebSockets, CRDTs) to give the candidate quick anchor points.

${profileSection}`;
}

/**
 * Classifies question intent and category.
 */
export function classifyQuestion(question: string): {
  category: 'Technical' | 'HR' | 'Behavioral' | 'Project' | 'Resume' | 'Coding' | 'General';
  intent: string;
} {
  const lower = question.toLowerCase();
  
  if (lower.includes('project') || lower.includes('portfolio') || lower.includes('built') || lower.includes('app you worked on') || lower.includes('your application') || lower.includes('syncflow') || lower.includes('pipeline')) {
    return { category: 'Project', intent: 'Discussing candidate project architecture, decisions, and outcomes' };
  }
  if (lower.includes('resume') || lower.includes('background') || lower.includes('yourself') || lower.includes('walk me through') || lower.includes('experience at') || lower.includes('tell me about you')) {
    return { category: 'Resume', intent: 'Candidate background overview and career trajectory' };
  }
  if (lower.includes('tell me about a time') || lower.includes('conflict') || lower.includes('disagree') || lower.includes('challenge') || lower.includes('mistake') || lower.includes('failure') || lower.includes('weakness') || lower.includes('proudest')) {
    return { category: 'Behavioral', intent: 'Assessing soft skills, problem-solving, and behavioral adaptability' };
  }
  if (lower.includes('code') || lower.includes('algorithm') || lower.includes('complexity') || lower.includes('time complexity') || lower.includes('data structure') || lower.includes('implement') || lower.includes('function') || lower.includes('array') || lower.includes('binary tree') || lower.includes('dynamic programming') || lower.includes('polymorphism') || lower.includes('inheritance')) {
    return { category: 'Coding', intent: 'Live coding logic, OOP principles, and algorithmic patterns' };
  }
  if (lower.includes('salary') || lower.includes('why this company') || lower.includes('why us') || lower.includes('notice period') || lower.includes('relocate') || lower.includes('culture') || lower.includes('long term') || lower.includes('where do you see yourself')) {
    return { category: 'HR', intent: 'Company fit, logistical readiness, and motivation' };
  }
  if (lower.includes('react') || lower.includes('state') || lower.includes('hook') || lower.includes('typescript') || lower.includes('database') || lower.includes('sql') || lower.includes('nosql') || lower.includes('async') || lower.includes('api') || lower.includes('rest') || lower.includes('graphql') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('microservice') || lower.includes('system design') || lower.includes('cache') || lower.includes('redis') || lower.includes('security') || lower.includes('difference between') || lower.includes('how does')) {
    return { category: 'Technical', intent: 'Evaluating technical domain mastery, tools, and conceptual depth' };
  }
  
  return { category: 'General', intent: 'General interview inquiry and dialogue' };
}

/**
 * Streams answer generation using Gemini SDK with low-latency model cascade.
 */
export async function streamAnswerGeneration(
  options: GenerateAnswerOptions,
  onChunk: (chunk: string) => void
): Promise<{ text: string; category: string; intent: string }> {
  const { question, profile, conversationHistory = [], style = 'concise' } = options;

  const classification = classifyQuestion(question);
  const systemInstruction = buildSystemInstruction(profile);

  // Build compact conversation turns
  const contents: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];

  // Limit conversation history to the last 4 turns for low latency and compact context
  const recentHistory = conversationHistory.slice(-4);
  for (const turn of recentHistory) {
    contents.push({
      role: turn.role === 'interviewer' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    });
  }

  // Current turn with specific style modifier
  let promptText = question;
  if (style === 'detailed') {
    promptText += '\n[Instruction: Provide a comprehensive technical response with architectural reasoning in 4-5 sentences.]';
  } else if (style === 'bullet') {
    promptText += '\n[Instruction: Provide a concise opening sentence followed by 2-3 clear, impactful bullet points.]';
  } else {
    promptText += '\n[Instruction: Keep answer concise, natural, and directly speakable in 2-3 sentences.]';
  }

  contents.push({
    role: 'user',
    parts: [{ text: promptText }],
  });

  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
  let lastError: any = null;
  const activeAi = options.customApiKey?.trim()
    ? new GoogleGenAI({
        apiKey: options.customApiKey.trim(),
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      })
    : ai;

  for (const modelName of candidateModels) {
    try {
      const responseStream = await activeAi.models.generateContentStream({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.6,
          topP: 0.9,
        },
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
          text: fullAnswer,
          category: classification.category,
          intent: classification.intent,
        };
      }
    } catch (err: any) {
      console.warn(`Model ${modelName} stream attempt error:`, err?.message || err);
      lastError = err;
      // Retry next candidate model on 503 or quota spike
      continue;
    }
  }

  throw lastError || new Error('Failed to generate answer from candidate models.');
}

/**
 * Creates a short-lived ephemeral token for client-side Gemini Live API WebSocket access.
 * Keeps permanent server API key secure and returns strictly the token.
 */
export async function createLiveSessionToken(customApiKey?: string): Promise<{ token: string }> {
  const activeKey = customApiKey?.trim() || process.env.GEMINI_API_KEY || apiKey;
  if (!activeKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
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

  return {
    token: token.name || '',
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

  const candidateModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
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

