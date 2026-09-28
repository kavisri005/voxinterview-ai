import { Router, Request, Response } from 'express';
import { streamAnswerGeneration, classifyQuestion } from './geminiService.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    modelCascade: ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'],
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
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
  const { question, profile, candidateProfile, conversationHistory, style, preAnalysis } = req.body || {};

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
