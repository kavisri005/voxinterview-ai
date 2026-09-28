import { Router, Request, Response } from 'express';
import {
  streamAnswerGeneration,
  streamAudioAnswerGeneration,
  createLiveSessionToken,
  classifyQuestion,
  getGeminiClient,
} from './geminiService.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    modelCascade: ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Test generate endpoint for a specific model
apiRouter.get('/test-generate', async (req: Request, res: Response) => {
  const model = (req.query.model as string) || 'gemini-3.7-flash';
  const start = Date.now();
  try {
    const client = getGeminiClient();
    const result = await client.models.generateContent({
      model,
      contents: 'Respond with the word SUCCESS in one word.',
    });
    res.json({
      model,
      timeMs: Date.now() - start,
      text: result.text,
    });
  } catch (err: any) {
    res.status(500).json({
      model,
      timeMs: Date.now() - start,
      error: err?.message || err,
    });
  }
});

// Analyze partial or complete question
apiRouter.post('/analyze', (req: Request, res: Response) => {
  const { question } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question text is required' });
  }

  const trimmed = question.trim();
  const classification = classifyQuestion(trimmed);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const isQuestionLike =
    trimmed.endsWith('?') ||
    /^(can|could|would|how|what|why|where|when|tell|explain|walk|describe|have|do|does|is|are)/i.test(
      trimmed
    );

  res.json({
    question: trimmed,
    category: classification.category,
    intent: classification.intent,
    wordCount,
    isComplete: wordCount >= 3 && isQuestionLike,
  });
});

// Stream answer generation for detected question via real Server-Sent Events (SSE)
apiRouter.post('/answer', async (req: Request, res: Response) => {
  const { question, profile, candidateProfile, conversationHistory, style, preAnalysis, customApiKey } = req.body || {};
  const clientKey =
    customApiKey ||
    (req.headers['x-gemini-key'] as string) ||
    (req.headers['authorization'] ? (req.headers['authorization'] as string).replace(/^Bearer\s+/i, '') : '') ||
    (typeof req.query.key === 'string' ? req.query.key : '');

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Valid question text is required' });
  }

  const cleanQuestion = question.trim();
  const activeProfile = candidateProfile || profile;
  const classification =
    preAnalysis?.category && preAnalysis?.intent
      ? preAnalysis
      : classifyQuestion(cleanQuestion);

  // Set up Server-Sent Events (SSE) headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial meta packet immediately
  res.write(
    `event: meta\ndata: ${JSON.stringify({
      category: classification.category,
      intent: classification.intent,
      timestamp: Date.now(),
    })}\n\n`
  );
  (res as any).flush?.();

  try {
    const result = await streamAnswerGeneration(
      {
        question: cleanQuestion,
        profile: activeProfile,
        conversationHistory,
        style,
        customApiKey: clientKey,
      },
      (chunk) => {
        res.write(`event: chunk\ndata: ${JSON.stringify({ chunk })}\n\n`);
        (res as any).flush?.();
      }
    );

    res.write(
      `event: end\ndata: ${JSON.stringify({
        fullAnswer: result.text,
        category: result.category,
        intent: result.intent,
      })}\n\n`
    );
    (res as any).flush?.();
    res.end();
  } catch (error: any) {
    console.error('Gemini answer generation error:', error);
    const errorMessage =
      error?.message ||
      'Failed to generate answer. Please check network connection and try again.';
    res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`);
    (res as any).flush?.();
    res.end();
  }
});

// Create short-lived ephemeral token for Gemini Live API WebSocket access
apiRouter.all('/live-token', async (req: Request, res: Response) => {
  try {
    const clientKey =
      (req.headers['x-gemini-key'] as string) ||
      (req.headers['authorization'] ? (req.headers['authorization'] as string).replace(/^Bearer\s+/i, '') : '') ||
      (typeof req.query.key === 'string' ? req.query.key : '') ||
      (req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey : '');

    const session = await createLiveSessionToken(clientKey);
    // Return only the short-lived token and minimal required configuration
    res.json({
      token: session.token,
    });
  } catch (err: any) {
    console.error('Error generating ephemeral token:', err);
    res.status(500).json({
      error: err?.message || 'Failed to create live session token',
    });
  }
});

// Stream answer directly from recorded audio bytes (SSE)
apiRouter.post('/audio-answer', async (req: Request, res: Response) => {
  const { audioBase64, mimeType, profile, candidateProfile, conversationHistory, style } =
    req.body || {};

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'Audio data is required' });
  }

  const activeProfile = candidateProfile || profile;

  // Set up Server-Sent Events (SSE) headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const result = await streamAudioAnswerGeneration(
      {
        audioBase64,
        mimeType: mimeType || 'audio/wav',
        profile: activeProfile,
        conversationHistory,
        style,
      },
      (chunk) => {
        res.write(`event: chunk\ndata: ${JSON.stringify({ chunk })}\n\n`);
        (res as any).flush?.();
      }
    );

    res.write(
      `event: end\ndata: ${JSON.stringify({
        fullAnswer: result.text,
        question: result.question,
        category: result.category,
        intent: result.intent,
      })}\n\n`
    );
    (res as any).flush?.();
    res.end();
  } catch (error: any) {
    console.error('Gemini audio answer generation error:', error);
    const errorMessage =
      error?.message ||
      'Failed to understand audio and generate answer. Please check network connection and try again.';
    res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`);
    (res as any).flush?.();
    res.end();
  }
});
