import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  try {
    const result = await genAI.listModels();
    console.log("Available Models:");
    result.models.forEach((m) => {
      console.log(`- ${m.name} (${m.displayName}) - Methods: ${m.supportedGenerationMethods.join(", ")}`);
    });
  } catch (err) {
    console.error("Error listing models:", err);
  }
}

listModels();
