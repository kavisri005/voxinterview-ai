/**
 * Utilities for cleaning live speech transcripts, stripping filler noise,
 * and checking question validity.
 */

const FILLER_WORDS_REGEX = /\b(um|uh|uhm|err|er|ah|like|you know|so basically|basically|actually)\b/gi;

export interface CleanTranscriptResult {
  cleaned: string;
  original: string;
  wordCount: number;
  isQuestionLike: boolean;
  isSubstantial: boolean;
}

/**
 * Cleans a spoken utterance by eliminating filler words and noise while
 * preserving technical terms and question intent.
 */
export function cleanTranscript(raw: string, minWords = 3): CleanTranscriptResult {
  if (!raw || typeof raw !== 'string') {
    return {
      cleaned: '',
      original: '',
      wordCount: 0,
      isQuestionLike: false,
      isSubstantial: false,
    };
  }

  const trimmed = raw.trim();

  // Strip common filler vocalizations
  let cleaned = trimmed
    .replace(FILLER_WORDS_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove leading conversational stutter like "So, ", "And, "
  cleaned = cleaned.replace(/^(so\s+|and\s+|okay\s+|alright\s+|now\s+)/i, '');

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  const words = cleaned.split(/\s+/).filter(Boolean);

  // Check if utterance is question-shaped
  const isQuestionLike =
    cleaned.endsWith('?') ||
    /^(can|could|would|how|what|why|where|when|tell|explain|walk|describe|have|do|does|is|are|which|who|should)\b/i.test(
      cleaned
    );

  // Auto-format trailing question mark for question inquiries
  if (isQuestionLike && !cleaned.endsWith('?') && !cleaned.endsWith('.')) {
    cleaned += '?';
  }

  return {
    cleaned,
    original: trimmed,
    wordCount: words.length,
    isQuestionLike,
    isSubstantial: words.length >= minWords,
  };
}
