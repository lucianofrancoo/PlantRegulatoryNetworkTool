
import { GoogleGenAI, Type } from "@google/genai";
import { IntegratedInteraction } from "../types";

export const analyzeNetwork = async (data: IntegratedInteraction[]) => {
  // Use process.env.API_KEY directly as a named parameter as per guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Sample data to avoid hitting token limits while providing context
  const topInteractions = data
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, 50);

  const prompt = `
    Analyze the following integrated gene regulation network data.
    The data contains Transcription Factors (TF), their target genes, and the number of supporting evidence sources.
    
    Data Summary:
    ${JSON.stringify(topInteractions.map(i => ({ tf: i.tf, target: i.target, evidence: i.evidenceCount })))}

    Please provide:
    1. A brief summary of the most prominent regulatory hubs (TFs with many targets or high evidence).
    2. Potential biological implications of these interactions.
    3. Suggestions for further experimental validation.
    
    Format the response as JSON with fields "summary" and "insights" (array of strings).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            insights: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "insights"]
        }
      }
    });

    // Correctly accessing the text property directly without calling it as a function.
    const text = response.text;
    return JSON.parse(text || "{}");
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      summary: "Error analyzing data. Please check your network and try again.",
      insights: ["Could not fetch biological insights at this time."]
    };
  }
};
