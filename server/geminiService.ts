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
  email?: string;
  phone?: string;
  degree: string;
  college: string;
  gradYear?: string;
  targetRole?: string;
  summary: string;
  technicalSkills: string[];
  programmingLanguages: string[];
  frameworks: string[];
  testingAutomationSkills?: string[];
  toolsDatabases: string[];
  projects: Array<{
    id?: string;
    title: string;
    role?: string;
    techStack: string;
    description: string;
    highlights?: string;
  }>;
  experience: Array<{
    id?: string;
    role: string;
    company: string;
    period: string;
    description: string;
  }>;
  internships?: Array<{
    id?: string;
    role: string;
    company: string;
    period: string;
    description: string;
  }>;
  certifications: string[];
  achievements?: string[];
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
  let profileSection = 'No candidate profile specified. Answer questions with deep expertise, and role questions with articulate competence.';

  if (profile && (profile.name || profile.technicalSkills?.length || profile.projects?.length || profile.experience?.length || profile.testingAutomationSkills?.length)) {
    const role = profile.targetRole || 'Software Professional';
    
    // Keep dossier compact for minimum latency
    const techSkills = (profile.technicalSkills || []).slice(0, 12).join(', ');
    const languages = (profile.programmingLanguages || []).slice(0, 8).join(', ');
    const frameworks = (profile.frameworks || []).slice(0, 8).join(', ');
    const testingSkills = (profile.testingAutomationSkills || []).slice(0, 8).join(', ');
    const tools = (profile.toolsDatabases || []).slice(0, 8).join(', ');

    const projects = (profile.projects || [])
      .slice(0, 3)
      .map(
        (p) =>
          `"${p.title}" (${p.techStack}): ${p.description.slice(0, 150)}${p.highlights ? ` [Key: ${p.highlights.slice(0, 80)}]` : ''}`
      )
      .join('; ');

    const experience = (profile.experience || [])
      .slice(0, 2)
      .map((e) => `${e.role} at ${e.company} (${e.period}): ${e.description.slice(0, 120)}`)
      .join('; ');

    const internships = (profile.internships || [])
      .slice(0, 2)
      .map((i) => `${i.role} at ${i.company} (${i.period}): ${i.description.slice(0, 120)}`)
      .join('; ');

    const certs = (profile.certifications || []).filter(Boolean).slice(0, 5).join(', ');
    const achievements = (profile.achievements || []).filter(Boolean).slice(0, 4).join('; ');

    profileSection = `CANDIDATE DOSSIER (Ground Truth):
- Name: ${profile.name || 'Candidate'}
- Target Role / Title: ${role}
- Contact: ${[profile.email ? `Email: ${profile.email}` : '', profile.phone ? `Phone: ${profile.phone}` : ''].filter(Boolean).join(' | ') || 'N/A'}
- Professional Summary: ${(profile.summary || 'N/A').slice(0, 200)}
- Education: ${profile.degree || ''} ${profile.college ? `at ${profile.college}` : ''} ${profile.gradYear ? `(${profile.gradYear})` : ''}
- Core Technical Skills: ${techSkills || 'N/A'}
- Programming Languages: ${languages || 'N/A'}
- Frameworks & Libraries: ${frameworks || 'N/A'}
- Testing & Automation Skills: ${testingSkills || 'N/A'}
- Tools & Databases: ${tools || 'N/A'}
- Work Experience: ${experience || 'N/A'}
- Internships: ${internships || 'N/A'}
- Projects: ${projects || 'N/A'}
- Certifications: ${certs || 'N/A'}
- Achievements: ${achievements || 'N/A'}
${profile.otherInfo ? `- Additional Info: ${profile.otherInfo.slice(0, 120)}` : ''}`;
  }

  return `You are VoxInterview AI, a state-of-the-art, general-purpose interview question answering agent and live co-pilot. You combine the broad, accurate reasoning of a top-tier conversational AI with personalized grounded responses.

CORE OPERATING PRINCIPLES:
1. UNRESTRICTED GENERAL-PURPOSE SCOPE:
   You answer ANY question asked by the interviewer. You are NOT restricted to predefined categories. Whether the question is technical, system design, architecture, live coding, algorithms, behavioral, HR, resume-specific, situational, domain knowledge, or general inquiry, directly provide an accurate, high-quality answer.

2. ADAPTIVE CONTEXT & PERSPECTIVE:
   - When the question is about the candidate (their background, resume, specific projects, decisions, teamwork, past challenges): Speak in a natural, confident first-person style ("I", "in my project...", "my approach was..."). Strictly draw from the CANDIDATE DOSSIER below. NEVER invent non-existent companies, degrees, or projects.
   - When the question is technical or conceptual: Use deep model intelligence to give a crystal-clear, accurate explanation, with a small concrete example or snippet where useful.
   - When the question is coding or algorithmic: Clearly outline the optimal algorithmic approach, time/space complexity, and clean code or pattern.
   - When the question is behavioral: Provide a realistic, structured response grounded in the candidate's actual projects and experience.
   - When the question is project-related: Use only the candidate's actual project information and technical stack.

3. CONVERSATION MEMORY & FOLLOW-UP RESOLUTION:
   Maintain active conversation context across turns. For follow-ups like:
   "What did you use?" / "Why did you choose it?" / "How does it work?" / "Tell me more about that project"
   seamlessly resolve pronouns ("it", "that", "this") from previous questions and answers.

4. AMBIGUOUS QUESTIONS:
   If a question is short or ambiguous, infer the most likely interview context and answer naturally. Never ask "could you clarify?" or return "unsupported question" or generic error fallbacks.

5. CONCISENESS & SPEED (CRITICAL):
   - Deliver the answer directly without repeating the question or conversational filler ("Sure, I can help with that...").
   - Keep generated answers concise: normally 3 to 5 sentences. Speakable and crisp for an active live interview.

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
    promptText += '\n[Guidance: Provide a thorough, direct explanation in 4-6 sentences with a concrete example or snippet where helpful, concise enough to speak naturally.]';
  } else if (style === 'bullet') {
    promptText += '\n[Guidance: Provide a direct opening statement followed by 2-3 crisp bullet points (normally 3-5 sentences total).]';
  } else {
    promptText += '\n[Guidance: Answer directly, accurately, and naturally in strictly 3 to 5 concise sentences. If technical, include a small example if useful. If coding, outline approach and code. If about candidate, speak in first person using dossier.]';
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
        maxOutputTokens: 350,
      };

      // thinkingBudget is supported on flash models, but rejected with 400 on flash-lite models
      if (!modelName.includes('lite')) {
        config.thinkingConfig = {
          thinkingBudget: 0,
        };
      }

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

export interface ExtractResumeOptions {
  fileBase64: string;
  fileName: string;
  mimeType: string;
  customApiKey?: string;
}

/**
 * Extracts candidate profile information from a resume file (PDF or DOCX).
 * Uses local document parsing (pdf-parse / mammoth) with Gemini structured extraction.
 */
export async function extractResumeProfile(
  options: ExtractResumeOptions
): Promise<CandidateProfile> {
  const { fileBase64, fileName, mimeType, customApiKey } = options;
  const activeKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
  if (!activeKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please add GEMINI_API_KEY to environment variables or Settings.');
  }

  const fileBuffer = Buffer.from(fileBase64, 'base64');
  let extractedRawText = '';
  const lowerName = (fileName || '').toLowerCase();

  if (lowerName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedRawText = result.value || '';
    } catch (e: any) {
      console.warn('DOCX extraction warning:', e?.message || e);
    }
  } else if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: fileBuffer });
      await parser.load();
      const res = await parser.getText();
      extractedRawText = res?.text || '';
    } catch (e: any) {
      console.warn('PDFParse extraction warning:', e?.message || e);
    }
  } else {
    try {
      extractedRawText = fileBuffer.toString('utf-8');
    } catch {}
  }

  const prompt = `You are an expert resume parsing engine and ATS. Analyze the resume content below with absolute fidelity.
CRITICAL RULES:
- Preserve the exact information from the resume.
- Do NOT invent skills.
- Do NOT invent experience.
- Do NOT invent projects.
- Do NOT invent certifications.
- If information is missing or not mentioned in the resume, leave the field empty ("" or []).

Extract and categorize into this exact JSON schema:
{
  "name": string (Full Name),
  "email": string (Email address),
  "phone": string (Phone number),
  "targetRole": string (Current title or inferred role from experience),
  "degree": string (Degree / Education),
  "college": string (University / College name),
  "gradYear": string (Graduation year if mentioned),
  "summary": string (Professional summary from resume or brief objective),
  "technicalSkills": string[] (Core technical, architecture, or domain skills),
  "programmingLanguages": string[] (e.g. Java, Python, TypeScript, C++, etc.),
  "frameworks": string[] (e.g. React, Spring Boot, Node.js, Express, etc.),
  "testingAutomationSkills": string[] (e.g. Selenium, Cypress, Playwright, Automation Testing, JUnit, TestNG, Postman, etc.),
  "toolsDatabases": string[] (e.g. PostgreSQL, Redis, Docker, Git, Jira, Jenkins, etc.),
  "experience": [
    {
      "id": string (unique ID e.g. "exp-1"),
      "role": string,
      "company": string,
      "period": string,
      "description": string
    }
  ],
  "internships": [
    {
      "id": string (unique ID e.g. "int-1"),
      "role": string,
      "company": string,
      "period": string,
      "description": string
    }
  ],
  "projects": [
    {
      "id": string (unique ID e.g. "proj-1"),
      "title": string,
      "role": string,
      "techStack": string,
      "description": string,
      "highlights": string
    }
  ],
  "certifications": string[],
  "achievements": string[],
  "otherInfo": string
}

Respond with ONLY valid JSON.`;

  const activeAi = new GoogleGenAI({ apiKey: activeKey });
  
  let contents: any[];
  // If we couldn't extract text and it's a PDF, pass PDF as multimodal inlineData
  if (!extractedRawText.trim() && (lowerName.endsWith('.pdf') || mimeType === 'application/pdf')) {
    contents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: fileBase64,
            },
          },
          { text: prompt },
        ],
      },
    ];
  } else {
    contents = [
      {
        role: 'user',
        parts: [
          {
            text: `${prompt}\n\n=== RESUME CONTENT ===\n${extractedRawText.trim() || 'No text extracted.'}`,
          },
        ],
      },
    ];
  }

  const response = await activeAi.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: contents,
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });

  const responseText = response.text || '{}';
  let parsed: any = {};
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  }

  const profile: CandidateProfile = {
    name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
    email: typeof parsed.email === 'string' ? parsed.email.trim() : '',
    phone: typeof parsed.phone === 'string' ? parsed.phone.trim() : '',
    targetRole: typeof parsed.targetRole === 'string' ? parsed.targetRole.trim() : '',
    degree: typeof parsed.degree === 'string' ? parsed.degree.trim() : '',
    college: typeof parsed.college === 'string' ? parsed.college.trim() : '',
    gradYear: typeof parsed.gradYear === 'string' ? parsed.gradYear.trim() : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    technicalSkills: Array.isArray(parsed.technicalSkills) ? parsed.technicalSkills.map((s: any) => String(s).trim()).filter(Boolean) : [],
    programmingLanguages: Array.isArray(parsed.programmingLanguages) ? parsed.programmingLanguages.map((s: any) => String(s).trim()).filter(Boolean) : [],
    frameworks: Array.isArray(parsed.frameworks) ? parsed.frameworks.map((s: any) => String(s).trim()).filter(Boolean) : [],
    testingAutomationSkills: Array.isArray(parsed.testingAutomationSkills) ? parsed.testingAutomationSkills.map((s: any) => String(s).trim()).filter(Boolean) : [],
    toolsDatabases: Array.isArray(parsed.toolsDatabases) ? parsed.toolsDatabases.map((s: any) => String(s).trim()).filter(Boolean) : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects.map((p: any, idx: number) => ({
      id: p.id || `proj-${idx + 1}`,
      title: p.title || `Project ${idx + 1}`,
      role: p.role || '',
      techStack: p.techStack || '',
      description: p.description || '',
      highlights: p.highlights || '',
    })) : [],
    experience: Array.isArray(parsed.experience) ? parsed.experience.map((e: any, idx: number) => ({
      id: e.id || `exp-${idx + 1}`,
      role: e.role || '',
      company: e.company || '',
      period: e.period || '',
      description: e.description || '',
    })) : [],
    internships: Array.isArray(parsed.internships) ? parsed.internships.map((i: any, idx: number) => ({
      id: i.id || `int-${idx + 1}`,
      role: i.role || '',
      company: i.company || '',
      period: i.period || '',
      description: i.description || '',
    })) : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications.map((c: any) => String(c).trim()).filter(Boolean) : [],
    achievements: Array.isArray(parsed.achievements) ? parsed.achievements.map((a: any) => String(a).trim()).filter(Boolean) : [],
    otherInfo: typeof parsed.otherInfo === 'string' ? parsed.otherInfo.trim() : '',
  };

  return profile;
}


