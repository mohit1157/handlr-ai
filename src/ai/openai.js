const fs = require("fs");
const config = require("../config");
const buildSystemPrompt = require("./systemPrompt");
const tools = require("./tools");
const { executeTool, setContext } = require("./toolExecutor");
const { needsApproval, requestApproval } = require("../security/approval");
const history = require("../memory/chatHistory");
const { chatCompletion, getModel } = require("./providers");
const vectorMemory = require("../memory/vectorMemory");
const longTermMemory = require("../memory/longTermMemory");

/**
 * Agentic chat loop with tool calling and vector memory.
 */
async function chat(chatId, userMessage, bot) {
  history.addMessage(chatId, { role: "user", content: userMessage });
  setContext(bot, chatId);

  const screenshotPaths = [];
  const licenseKey = config.LICENSE_KEY || String(chatId);

  // Retrieve relevant memories for context
  let memoryContext = "";
  try {
    memoryContext = await vectorMemory.searchMemories(licenseKey, userMessage);
  } catch {
    // Fallback to simple memory
    try {
      const all = longTermMemory.getAllMemories();
      if (all && Object.keys(all).length > 0) {
        const items = Object.entries(all).map(([k, v]) => `- ${k}: ${v.value}`);
        memoryContext = `\n\nRELEVANT MEMORIES:\n${items.join("\n")}`;
      }
    } catch {}
  }

  for (let round = 0; round < config.MAX_TOOL_ROUNDS; round++) {
    if (round > 0 && round % config.PROGRESS_INTERVAL === 0) {
      try { await bot.sendMessage(chatId, `Working... (step ${round}/${config.MAX_TOOL_ROUNDS})`); } catch {}
    }
    const systemPrompt = buildSystemPrompt() + memoryContext;
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.getHistoryForAPI(chatId),
    ];

    const assistantMsg = await chatCompletion({ messages, tools, toolChoice: "auto" });

    // Store the assistant message in history (may contain tool_calls)
    const historyEntry = { role: "assistant", content: assistantMsg.content || null };
    if (assistantMsg.tool_calls?.length) {
      historyEntry.tool_calls = assistantMsg.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    history.addMessage(chatId, historyEntry);

    // No tool calls = final text response
    if (!assistantMsg.tool_calls?.length) {
      // Store memories in background (fire-and-forget)
      vectorMemory.addMemories(licenseKey, userMessage, assistantMsg.content).catch(() => {});
      return { text: assistantMsg.content, screenshots: screenshotPaths };
    }

    // Execute each tool call — ALWAYS add tool result to history, even on error
    for (const toolCall of assistantMsg.tool_calls) {
      const { name, arguments: argsJson } = toolCall.function;
      let args;
      try {
        args = JSON.parse(argsJson);
      } catch {
        args = {};
      }

      let result;
      try {
        const approval = needsApproval(name, args, chatId);

        if (approval === "blocked") {
          result = { error: "This command is blocked for safety reasons." };
        } else if (approval === true) {
          try {
            const approved = await requestApproval(bot, chatId, name, args, config.APPROVAL_TIMEOUT);
            if (approved) {
              if (bot?.sendMessage) await bot.sendMessage(chatId, `✅ Approved. Executing...`);
              result = await executeTool(name, args);
            } else {
              result = { denied: true, message: "Action was denied or timed out." };
            }
          } catch {
            // Approval mechanism failed — auto-approve
            result = await executeTool(name, args);
          }
        } else {
          result = await executeTool(name, args);
        }
      } catch (err) {
        // Tool execution threw — capture error as result
        result = { error: `Tool ${name} failed: ${err.message}` };
        console.error(`Tool ${name} error:`, err.message);
      }

      // Send documents/screenshots if available
      if (result?.documentPath && bot?.sendDocument) {
        try { await bot.sendDocument(chatId, result.documentPath, { caption: result.documentName || "Document" }); } catch {}
      }
      if (result?.screenshotPath) {
        try {
          if (bot?.sendPhoto) await bot.sendPhoto(chatId, result.screenshotPath, { caption: result.title ? `${result.title}\n${result.url || ""}` : undefined });
          screenshotPaths.push(result.screenshotPath);
        } catch {}
      }

      // ALWAYS add tool result to history — prevents tool_calls chain corruption
      const resultContent = typeof result === "string" ? result : JSON.stringify(result || { error: "No result" });
      history.addMessage(chatId, {
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultContent.slice(0, config.TOOL_RESULT_MAX_LENGTH),
      });
    }
    // Loop back for AI to process results
  }

  return { text: "I've reached the maximum number of actions for this request. Let me know if you need more.", screenshots: [] };
}

module.exports = { chat };
