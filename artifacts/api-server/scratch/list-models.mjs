import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found in env");
    return;
  }

  try {
    console.log("Fetching models with v1beta...");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    console.log("Models found:");
    if (data.models) {
      data.models.forEach((m) => {
        console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(", ")})`);
      });
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("Error listing models:", err);
  }
}

listModels();
