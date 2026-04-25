import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const result = await genAI.listModels();
    console.log("Available Models:");
    result.models.forEach((model) => {
      console.log(`- ${model.name} (Methods: ${model.supportedGenerationMethods.join(", ")})`);
    });
  } catch (err) {
    console.error("Error listing models:", err);
  }
}

listModels();
