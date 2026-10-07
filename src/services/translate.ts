import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI client with GEMINI_API_KEY from environment
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Translates Hindi or Telugu text into English using the Gemini API.
 * Uses gemini-3.8-flash for rapid, accurate text translation.
 * If translation fails or API key is unavailable, returns the original text.
 */
export async function translateToEnglish(
  text: string,
  sourceLang: 'Hindi' | 'Telugu' | 'hi' | 'te'
): Promise<{ englishText: string; success: boolean; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { englishText: '', success: true };
  }

  const langName = sourceLang === 'Hindi' || sourceLang === 'hi' ? 'Hindi' : 'Telugu';

  if (!ai) {
    console.warn('Gemini API key not configured, returning original text');
    return { englishText: trimmed, success: false, error: 'GEMINI_API_KEY missing' };
  }

  try {
    const prompt = `You are an expert translator for sign language communication. Translate the following ${langName} text directly and accurately into clear, concise English suitable for sign language interpretation.
Translate ONLY the meaning into English. Do not add explanations, quotes, notes, or commentary.

${langName} text: "${trimmed}"

English translation:`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const translated = response.text ? response.text.trim().replace(/^["']|["']$/g, '') : '';
    if (translated) {
      return { englishText: translated, success: true };
    } else {
      return { englishText: trimmed, success: false, error: 'Empty translation response' };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Translation error with Gemini API:', errorMsg);
    return { englishText: trimmed, success: false, error: errorMsg };
  }
}
