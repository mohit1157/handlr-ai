const fs = require("fs");
const path = require("path");
const config = require("../config");

async function analyzeScreenshot({ screenshotPath, question }) {
  // Find latest screenshot if no path provided
  if (!screenshotPath) {
    const dir = config.SCREENSHOTS_DIR;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort().reverse();
    if (!files.length) return { error: "No screenshots found" };
    screenshotPath = path.join(dir, files[0]);
  }

  if (!fs.existsSync(screenshotPath)) return { error: `File not found: ${screenshotPath}` };

  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  const imageBuffer = fs.readFileSync(screenshotPath);
  const base64 = imageBuffer.toString("base64");
  const dataUri = `data:image/png;base64,${base64}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: question || "Describe what you see on this screen in detail." },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    max_tokens: 1000,
  });

  return { description: response.choices[0].message.content };
}

module.exports = { analyzeScreenshot };
