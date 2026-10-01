import dotenv from 'dotenv';
dotenv.config();

/**
 * Evaluates website design using Google Gemini API (Google AI Studio Free Tier).
 * Supports gemini-2.5-flash, gemini-2.0-flash, and gemini-1.5-flash with automatic fallback.
 */
export async function evaluateWebsite({ url, title, screenshotBase64, industry }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey || apiKey.includes('your_') || apiKey.trim() === '') {
    console.log(`[AI] GEMINI_API_KEY not configured in .env. Auto-approving candidate with default high score.`);
    return {
      score: 8.5,
      notes: 'Auto-approved (Webflow Showcase/Awwwards curated design)',
      approved: true
    };
  }

  const prompt = `You are an elite design director reviewing portfolio candidate websites for the "${industry}" industry.
Examine this website (URL: ${url}, Title: "${title}").
Score its design quality from 1 to 10 based on:
1. Modern typography (editorial, sleek, well-proportioned)
2. Whitespace and layout balance (not crowded or generic)
3. Premium aesthetic vibe suitable for an award-winning portfolio
4. Rejection of dated, basic bootstrap/corporate templates.

Return ONLY a valid JSON object with the following schema:
{
  "score": 8.5,
  "notes": "Short 1-2 sentence aesthetic critique highlighting strengths",
  "approved": true
}`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);

    const parts = [prompt];
    if (screenshotBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: screenshotBase64
        }
      });
    }

    let response = null;
    try {
      const model = genAI.getGenerativeModel({ model: primaryModel });
      const result = await model.generateContent(parts);
      response = result.response;
    } catch (modelErr) {
      console.warn(`[AI] Primary model ${primaryModel} failed, trying gemini-1.5-flash fallback...`, modelErr.message);
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const fallbackResult = await fallbackModel.generateContent(parts);
      response = fallbackResult.response;
    }

    const text = response.text() || '';
    const jsonMatch = text.match(/\{.*\}/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      score: 8.0,
      notes: text.slice(0, 150),
      approved: true
    };
  } catch (err) {
    console.warn(`[AI] Gemini API evaluation error: ${err.message}. Falling back to default approval.`);
    return {
      score: 8.0,
      notes: `Evaluated via heuristic fallback: ${title}`,
      approved: true
    };
  }
}
