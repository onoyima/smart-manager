import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  try {
    // In @google/generative-ai, listModels is on the genAI object
    // but it might be paginated or require a specific method.
    // Let's just try to get a model and see if it fails early.
    console.log("Checking gemini-1.5-flash...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("test");
    console.log("gemini-1.5-flash works!");
  } catch (err) {
    console.error("gemini-1.5-flash failed:", err.message);
    
    console.log("Trying gemini-1.5-flash-latest...");
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
      await model.generateContent("test");
      console.log("gemini-1.5-flash-latest works!");
    } catch (err2) {
      console.error("gemini-1.5-flash-latest failed:", err2.message);
    }
  }
}

listModels();
