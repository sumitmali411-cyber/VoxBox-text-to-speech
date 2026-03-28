import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface TTSOptions {
  voiceName: VoiceName;
}

export async function generateSpeech(text: string, options: TTSOptions): Promise<{ data: string, mimeType: string }> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: options.voiceName },
          },
        },
      },
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData || !inlineData.data) {
      throw new Error("No audio data received from Gemini API");
    }
    return {
      data: inlineData.data,
      mimeType: inlineData.mimeType || 'audio/wav'
    };
  } catch (error) {
    console.error("TTS Generation Error:", error);
    throw error;
  }
}
