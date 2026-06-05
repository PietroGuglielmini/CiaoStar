import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Migliora il testo della richiesta video dell'utente usando l'AI.
export const refineRequestText = async (
  originalText: string, 
  occasion: string, 
  talentName: string
): Promise<string> => {
  try {
    const prompt = `Sei un assistente per una piattaforma di video messaggi personalizzati chiamata CiaoStar. 
    L'utente vuole richiedere un video a ${talentName} per l'occasione "${occasion}".
    Il testo originale dell'utente è: "${originalText}".
    Riscrivi il testo in modo che sia più chiaro, coinvolgente e professionale, mantenendo però i dettagli fondamentali e il tono richiesto. 
    Restituisci esclusivamente il testo raffinato, senza commenti, introduzioni o virgolette.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
    });
    
    return response.text?.trim() || originalText;
  } catch (error) {
    console.error("Errore Gemini refineRequestText:", error);
    return originalText;
  }
};

// Modera il testo (nome o bio) per assicurarsi che non violi le policy.
export const moderateText = async (text: string, type: 'name' | 'bio'): Promise<{ safe: boolean, reason?: string }> => {
  try {
    const prompt = `Analizza questo ${type === 'name' ? 'nome' : 'testo'} per un profilo pubblico su una piattaforma di video messaggi: "${text}".
    Verifica se contiene volgarità, insulti, odio, riferimenti sessuali espliciti o spam.
    Rispondi in formato JSON con i campi "safe" (boolean) e "reason" (string, spiegazione in italiano se safe è false).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
          required: ["safe"],
        },
      },
    });

    const jsonStr = response.text?.trim();
    if (jsonStr) {
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        console.error("Errore parsing JSON moderazione:", e);
        return { safe: true };
      }
    }
    return { safe: true };
  } catch (error) {
    console.error("Errore Gemini moderateText:", error);
    return { safe: true };
  }
};

// Genera una biografia creativa basata su nome, categoria e bio esistente.
export const generateCreativeBio = async (name: string, category: string, existingBio: string): Promise<string> => {
  try {
    const prompt = `Sei un copywriter esperto. Crea una biografia accattivante e professionale per un Talent di nome "${name}" nella categoria "${category}".
    ${existingBio ? `Dati di partenza: "${existingBio}"` : "Crea una bio da zero basata sul nome e sulla categoria."}
    Usa un tono che invogli i fan a prenotare un video messaggio personalizzato. 
    Sii breve (massimo 300 caratteri). Restituisci solo il testo della bio.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
    });

    return response.text?.trim() || existingBio;
  } catch (error) {
    console.error("Errore Gemini generateCreativeBio:", error);
    return existingBio;
  }
};