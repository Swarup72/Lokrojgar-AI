import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/**
 * Transcribe Marathi or Hindi audio file and extract worker profile fields using LLM.
 *
 * @param {string} audioFilePath - Path to local audio file
 * @param {string} language - Audio language ('mr', 'hi', 'en')
 * @returns {Promise<{ transcript: string, extractedProfile: Object }>}
 */
export const processVoiceProfileAudio = async (audioFilePath, language = "mr") => {
  if (!genAI) {
    return {
      transcript: "Voice processing simulation (GEMINI_API_KEY required)",
      extractedProfile: {
        fullName: "Sample Worker",
        experienceYears: 2,
        expectedPay: 500,
        skills: ["General Work"],
        city: "Mumbai",
      },
    };
  }

  try {
    const fileBuffer = fs.readFileSync(audioFilePath);
    const base64Audio = fileBuffer.toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Listen to this audio in ${language === "mr" ? "Marathi" : language === "hi" ? "Hindi" : "English"}.
1. Provide an accurate transcript.
2. Extract worker profile details in JSON format:
{
  "transcript": "...",
  "extractedProfile": {
    "fullName": "...",
    "experienceYears": 0,
    "expectedPay": 0,
    "skills": ["..."],
    "city": "...",
    "bio": "..."
  }
}`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "audio/mp3",
          data: base64Audio,
        },
      },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      transcript: text,
      extractedProfile: {},
    };
  } catch (error) {
    console.error("AI Voice Processing Error:", error);
    throw new Error(`Failed to process voice profile: ${error.message}`);
  }
};
