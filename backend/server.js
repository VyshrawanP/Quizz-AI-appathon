import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ✅ Health check route
app.get("/", (req, res) => {
  res.send("✅ Gemini Quiz API is running fine.");
});

// ✅ Quiz generation route
app.post("/generate_quiz", async (req, res) => {
  const { text, count, difficulty, language } = req.body;

  const langLine = language
    ? `Generate the quiz and its explanations entirely in ${language}.`
    : "Generate the quiz in English.";

  const difficultyLine = difficulty === "hard"
    ? "Make questions challenging and reasoning-based."
    : "Use balanced difficulty suitable for learning.";

  const prompt = `
You are a multilingual quiz generator.
${langLine}
${difficultyLine}

Generate ${count || 5} multiple-choice questions from the following text:
${text}

Return valid JSON like:
[
  {"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}
]
Ensure the JSON is valid.
`;

  try {
    const result = await model.generateContent(prompt);
    let output = result.response.text();

    // Clean Gemini markdown wrappers
    output = output.replace(/```json|```/g, "").trim();

    const jsonStart = output.indexOf("[");
    const jsonEnd = output.lastIndexOf("]");
    const clean = output.slice(jsonStart, jsonEnd + 1);

    const questions = JSON.parse(clean);
    res.json({ questions });

  } catch (err) {
    console.error("❌ Error generating quiz:", err);
    res.status(500).json({ error: "Failed to generate quiz.", details: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Gemini Quiz API running on port ${PORT}`));
