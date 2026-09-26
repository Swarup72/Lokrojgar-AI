import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/**
 * Auto-translates input text from a source language into Marathi, Hindi, and English.
 * Returns a trilingual object { mr, hi, en }.
 *
 * @param {string} text - Source text to translate
 * @param {string} sourceLang - Source language ('mr', 'hi', or 'en')
 * @returns {Promise<{ mr: string, hi: string, en: string }>}
 */
export const translateTextToAllLanguages = async (text, sourceLang = "en") => {
  const result = {
    mr: sourceLang === "mr" ? text : "",
    hi: sourceLang === "hi" ? text : "",
    en: sourceLang === "en" ? text : "",
  };

  if (!text || typeof text !== "string" || text.trim() === "") {
    return result;
  }

  if (!genAI) {
    // Basic fallback if Gemini API Key is not set
    return {
      mr: result.mr || text,
      hi: result.hi || text,
      en: result.en || text,
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Translate the following text into Marathi, Hindi, and English. Return strictly a JSON object with keys "mr", "hi", and "en".

Text: "${text}"
Source Language: ${sourceLang}`;

    const response = await model.generateContent(prompt);
    const responseText = response.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        mr: parsed.mr || result.mr || text,
        hi: parsed.hi || result.hi || text,
        en: parsed.en || result.en || text,
      };
    }
  } catch (error) {
    console.error("Translation Service Error:", error.message);
  }

  return {
    mr: result.mr || text,
    hi: result.hi || text,
    en: result.en || text,
  };
};
