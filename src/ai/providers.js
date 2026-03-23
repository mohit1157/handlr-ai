const OpenAI = require("openai");
const config = require("../config");

let currentModel = config.MODEL;
let openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
let anthropicClient = null;

const MODEL_MAP = {
  "fast": "gpt-4o-mini",
  "standard": "gpt-4o",
  "reasoning": "o1-mini",
  "claude-sonnet": "claude-sonnet-4-20250514",
  "claude-haiku": "claude-haiku-4-5-20251001",
};

function setModel(name) {
  const mapped = MODEL_MAP[name] || name;
  currentModel = mapped;
  return { model: currentModel, name };
}

function getModel() {
  return currentModel;
}

function isAnthropicModel(model) {
  return model.startsWith("claude");
}

async function chatCompletion({ messages, tools, toolChoice }) {
  const model = currentModel;

  if (isAnthropicModel(model)) {
    return await anthropicCompletion({ model, messages, tools });
  }

  return await openaiCompletion({ model, messages, tools, toolChoice });
}

async function openaiCompletion({ model, messages, tools, toolChoice }) {
  const params = { model, messages };
  if (tools?.length) {
    params.tools = tools;
    params.tool_choice = toolChoice || "auto";
  }
  const response = await openaiClient.chat.completions.create(params);
  return response.choices[0].message;
}

async function anthropicCompletion({ model, messages, tools }) {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set. Add it to .env to use Claude models.");
    const Anthropic = require("@anthropic-ai/sdk");
    anthropicClient = new Anthropic({ apiKey });
  }

  // Convert OpenAI format to Anthropic format
  const systemMsg = messages.find(m => m.role === "system");
  const nonSystemMsgs = messages.filter(m => m.role !== "system");

  // Convert tool definitions
  const anthropicTools = (tools || []).map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Convert messages — handle tool_calls and tool results
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
      convertedMsgs.push({ role: "assistant", content });
    } else if (msg.role === "tool") {
      convertedMsgs.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }],
      });
    }
  }

  const response = await anthropicClient.messages.create({
    model,
    max_tokens: 4096,
    system: systemMsg?.content || "",
    messages: convertedMsgs,
    tools: anthropicTools.length ? anthropicTools : undefined,
  });

  // Convert Anthropic response to OpenAI format
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

module.exports = { chatCompletion, setModel, getModel, MODEL_MAP };
