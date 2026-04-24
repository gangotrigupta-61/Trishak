import { GoogleGenAI, Type } from "@google/genai";
import { Incident } from "../types";

// Helper to determine if a value is a placeholder
const isPlaceholder = (val: string | undefined): boolean => {
  return !val || val.includes('YOUR_') || val.includes('MY_');
};

const getApiKey = () => {
    // 1. Check for user-provided key with VITE_ prefix (Standard Vite way)
    const viteKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (viteKey && !viteKey.includes('YOUR_GOOGLE_API_KEY')) return viteKey;
    
    // 2. Check for VITE_GOOGLE_API_KEY as a process.env (passed via define)
    const viteProcessKey = process.env.VITE_GOOGLE_API_KEY;
    if (viteProcessKey && !viteProcessKey.includes('YOUR_GOOGLE_API_KEY') && viteProcessKey !== "") return viteProcessKey;

    // 3. Check for GOOGLE_API_KEY as a process.env (passed via define)
    const googleKey = process.env.GOOGLE_API_KEY;
    if (googleKey && googleKey !== "" && googleKey !== "YOUR_GOOGLE_API_KEY") return googleKey;

    // 4. Fallback to platform-provided GEMINI_API_KEY
    const platformKey = process.env.GEMINI_API_KEY;
    if (platformKey && platformKey !== 'MY_GEMINI_API_KEY' && platformKey !== '') return platformKey;
    
    return "";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export const analyzeIncidentImage = async (base64Image: string, incidentType: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [{
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: "image/jpeg",
            },
          },
          {
            text: `Analyze this image for the following reported incident type: "${incidentType}".`,
          }
        ]
      }],
      config: {
        systemInstruction: `You are an AI Incident Commander performing rapid visual triage.
        
        Strict Operational Rules:
        1. Output MUST be 1-2 lines only.
        2. NO conversational filler (e.g., "I see", "Based on the image").
        3. IF the image matches the incident type ("${incidentType}"), you MUST use these exact phrases:
           - medical: "Image verified: possible medical emergency detected."
           - theft: "Image supports reported theft incident."
           - fire: "Smoke/fire indicators detected in uploaded image."
           - other/unknown: "Image verified: [1-word observation] detected."
        4. IF the image does NOT match the incident type:
           - "Uploaded image does not match the reported incident."
           - OR "Image unclear for this incident type."`,
        temperature: 0.1, // Low temperature for deterministic output
      }
    });
    return response.text;
  } catch (error) {
    console.error("Vision AI Error:", error);
    return "Image analysis failed: connection error.";
  }
};

export const generateIncidentSummary = async (incident: Incident) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a concise emergency incident summary for the following:
      Type: ${incident.type}
      Severity: ${incident.severity}
      Description: ${incident.description}
      Location: ${incident.location.address}, Floor: ${incident.location.floor}, Zone: ${incident.location.zone}`,
      config: {
        systemInstruction: "You are an AI Incident Commander. Provide a clear, professional summary for emergency responders. Use Google Maps data to verify the location if possible.",
        tools: [{ googleMaps: {} }]
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating summary.";
  }
};

export const generateResponsePlan = async (incident: Incident) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Create a step-by-step emergency response plan for:
      Type: ${incident.type}
      Severity: ${incident.severity}
      Description: ${incident.description}
      Location: ${incident.location.address}
      
      Return the plan strictly as a JSON object with the following structure:
      {
        "steps": [{"action": string, "priority": "immediate" | "secondary" | "follow-up", "assignedTo": string}],
        "evacuationRequired": boolean,
        "evacuationRoute": string,
        "nearbyResources": string[]
      }`,
      config: {
        systemInstruction: "You are an AI Incident Commander. Provide actionable, prioritized steps for staff and security teams. Use Google Maps data to identify nearby emergency resources like hospitals or fire stations. Return ONLY the JSON object.",
        tools: [{ googleMaps: {} }],
      },
    });
    
    const text = response.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
  } catch (error) {
    console.error("Gemini Error:", error);
    return { steps: [], evacuationRequired: false };
  }
};
