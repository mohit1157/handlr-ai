const config = require("../config");

let currentModel = config.MODEL;

// Lazy-loaded clients
let openaiClient = null;
let anthropicClient = null;
let googleClient = null;

// ── Model Registry ──
const MODEL_MAP = {
  // OpenAI
  "fast": "gpt-4o-mini",
  "standard": "gpt-4o",
  "reasoning": "o1-mini",
  "o1": "o1-preview",
  "o3-mini": "o3-mini",
  "gpt4": "gpt-4o",
  "gpt4-mini": "gpt-4o-mini",

  // Anthropic Claude
  "claude-opus": "claude-opus-4-20250514",
  "claude-sonnet": "claude-sonnet-4-20250514",
  "claude-haiku": "claude-haiku-4-5-20251001",
  "opus": "claude-opus-4-20250514",
  "sonnet": "claude-sonnet-4-20250514",
  "haiku": "claude-haiku-4-5-20251001",

  // Google Gemini
  "gemini-pro": "gemini-2.5-pro-preview-06-05",
  "gemini-flash": "gemini-2.5-flash-preview-05-20",
  "gemini-thinking": "gemini-2.5-flash-preview-04-17",
  "gemini": "gemini-2.5-flash-preview-05-20",

  // DeepSeek
  "deepseek": "deepseek-chat",
  "deepseek-reasoner": "deepseek-reasoner",

  // Groq (fast inference)
  "groq-llama": "llama-3.3-70b-versatile",
  "groq-mixtral": "mixtral-8x7b-32768",

  // Smart routing aliases
  "best": "claude-opus-4-20250514",
  "cheap": "gpt-4o-mini",
  "balanced": "claude-sonnet-4-20250514",
};

// Provider detection
function getProvider(model) {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("deepseek")) return "deepseek";
  if (model.startsWith("llama") || model.startsWith("mixtral")) return "groq";
  return "openai";
}

// ── Client factories ──
function getOpenAI() {
  if (!openaiClient) {
    const OpenAI = require("openai");
    openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getAnthropic() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set. Add it to .env to use Claude models.");
    const Anthropic = require("@anthropic-ai/sdk");
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function getGoogle() {
  if (!googleClient) {
    const apiKey = process.env.GOOGLE_AI_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_KEY not set. Add it to .env to use Gemini models.");
    const { GoogleGenAI } = require("@google/genai");
    googleClient = new GoogleGenAI({ apiKey });
  }
  return googleClient;
}

function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set. Add it to .env to use DeepSeek models.");
  const OpenAI = require("openai");
  return new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
}

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set. Add it to .env to use Groq models.");
  const OpenAI = require("openai");
  return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
}

// ── Model management ──
function setModel(name) {
  const mapped = MODEL_MAP[name] || name;
  currentModel = mapped;
  const provider = getProvider(mapped);
  return { model: currentModel, name, provider };
}

function getModel() {
  return currentModel;
}

function listModels() {
  const available = [];
  // Check which API keys are configured
  if (config.OPENAI_API_KEY) {
    available.push(
      { alias: "fast / gpt4-mini", model: "gpt-4o-mini", provider: "openai", cost: "$0.15/M" },
      { alias: "standard / gpt4", model: "gpt-4o", provider: "openai", cost: "$2.50/M" },
      { alias: "reasoning / o1", model: "o1-preview", provider: "openai", cost: "$15/M" },
      { alias: "o3-mini", model: "o3-mini", provider: "openai", cost: "$1.10/M" },
    );
  }
  if (process.env.ANTHROPIC_API_KEY) {
    available.push(
      { alias: "haiku", model: "claude-haiku-4-5", provider: "anthropic", cost: "$0.80/M" },
      { alias: "sonnet", model: "claude-sonnet-4", provider: "anthropic", cost: "$3/M" },
      { alias: "opus", model: "claude-opus-4", provider: "anthropic", cost: "$15/M" },
    );
  }
  if (process.env.GOOGLE_AI_KEY) {
    available.push(
      { alias: "gemini-flash", model: "gemini-2.5-flash", provider: "google", cost: "$0.15/M" },
      { alias: "gemini-pro", model: "gemini-2.5-pro", provider: "google", cost: "$1.25/M" },
    );
  }
  if (process.env.DEEPSEEK_API_KEY) {
    available.push(
      { alias: "deepseek", model: "deepseek-chat", provider: "deepseek", cost: "$0.27/M" },
      { alias: "deepseek-reasoner", model: "deepseek-reasoner", provider: "deepseek", cost: "$2.19/M" },
    );
  }
  if (process.env.GROQ_API_KEY) {
    available.push(
      { alias: "groq-llama", model: "llama-3.3-70b", provider: "groq", cost: "Free tier" },
      { alias: "groq-mixtral", model: "mixtral-8x7b", provider: "groq", cost: "Free tier" },
    );
  }
  return { current: currentModel, provider: getProvider(currentModel), available };
}

// ── Main completion router ──
async function chatCompletion({ messages, tools, toolChoice }) {
  const model = currentModel;
  const provider = getProvider(model);

  switch (provider) {
    case "anthropic":
      return await anthropicCompletion({ model, messages, tools });
    case "google":
      return await geminiCompletion({ model, messages, tools });
    case "deepseek":
      return await openaiCompatCompletion(getDeepSeekClient(), { model, messages, tools, toolChoice });
    case "groq":
      return await openaiCompatCompletion(getGroqClient(), { model, messages, tools, toolChoice });
    default:
      return await openaiCompatCompletion(getOpenAI(), { model, messages, tools, toolChoice });
  }
}

// ── OpenAI-compatible completion (OpenAI, DeepSeek, Groq) ──
async function openaiCompatCompletion(client, { model, messages, tools, toolChoice }) {
  const params = { model, messages };
  if (tools?.length) {
    params.tools = tools;
    params.tool_choice = toolChoice || "auto";
  }
  const response = await client.chat.completions.create(params);
  return response.choices[0].message;
}

// ── Anthropic Claude completion ──
async function anthropicCompletion({ model, messages, tools }) {
  const client = getAnthropic();

  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  const anthropicTools = (tools || []).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const convertedMsgs = [];
  for (const msg of nonSystemMsgs) {
    if (msg.role === "user") {
      convertedMsgs.push({ role: "user", content: msg.content || "" });
    } else if (msg.role === "assistant") {
      const content = [];
      if (msg.content) content.push({ type: "text", text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input;
          try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      if (content.length) convertedMsgs.push({ role: "assistant", content });
    } else if (msg.role === "tool") {
      convertedMsgs.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }],
      });
    }
  }

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemMsg?.content || "",
    messages: convertedMsgs,
    tools: anthropicTools.length ? anthropicTools : undefined,
  });

  // Convert to OpenAI format
  const result = { role: "assistant", content: null, tool_calls: null };
  const textParts = [];
  const toolCalls = [];

  for (const block of response.content) {
    if (block.type === "text") textParts.push(block.text);
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }

  result.content = textParts.join("\n") || null;
  if (toolCalls.length) result.tool_calls = toolCalls;
  return result;
}

// ── Google Gemini completion ──
async function geminiCompletion({ model, messages, tools }) {
  const client = getGoogle();

  // Convert tools to Gemini format
  const geminiTools = tools?.length ? [{
    functionDeclarations: tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  }] : undefined;

  // Convert messages
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  const contents = [];
  for (const msg of nonSystemMsgs) {
    if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text: msg.content || "" }] });
    } else if (msg.role === "assistant") {
      const parts = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      if (parts.length) contents.push({ role: "model", parts });
    } else if (msg.role === "tool") {
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: "tool_response",
            response: { result: msg.content },
          },
        }],
      });
    }
  }

  const response = await client.models.generateContent({
    model,
    contents,
    systemInstruction: systemMsg?.content ? { parts: [{ text: systemMsg.content }] } : undefined,
    tools: geminiTools,
    config: { temperature: 0.7, maxOutputTokens: 8192 },
  });

  // Convert to OpenAI format
  const result = { role: "assistant", content: null, tool_calls: null };
  const textParts = [];
  const toolCalls = [];

  const candidate = response.candidates?.[0];
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) textParts.push(part.text);
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }
  }

  result.content = textParts.join("\n") || null;
  if (toolCalls.length) result.tool_calls = toolCalls;
  return result;
}

module.exports = { chatCompletion, setModel, getModel, listModels, MODEL_MAP };
