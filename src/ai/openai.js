const fs = require("fs");
const config = require("../config");
const buildSystemPrompt = require("./systemPrompt");
const tools = require("./tools");
const { executeTool, setContext } = require("./toolExecutor");
const { needsApproval, requestApproval } = require("../security/approval");
const history = require("../memory/chatHistory");
const { chatCompletion, getModel } = require("./providers");
const mem0 = require("../memory/mem0");

/**
 * Agentic chat loop with tool calling and mem0 memory.
 */
async function chat(chatId, userMessage, bot) {
  history.addMessage(chatId, { role: "user", content: userMessage });
  setContext(bot, chatId);

  const screenshotPaths = [];

  // Retrieve relevant memories for context
  let memoryContext = "";
  try {
    memoryContext = await mem0.searchMemory(chatId, userMessage);
  } catch {}

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
      mem0.addMemory(chatId, [
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantMsg.content },
      ]).catch(() => {});
      return { text: assistantMsg.content, screenshots: screenshotPaths };
    }

    // Execute each tool call
    for (const toolCall of assistantMsg.tool_calls) {
      const { name, arguments: argsJson } = toolCall.function;
      let args;
      try {
        args = JSON.parse(argsJson);
      } catch {
        args = {};
      }

      let result;
      const approval = needsApproval(name, args, chatId);

      if (approval === "blocked") {
        result = { error: "This command is blocked for safety reasons." };
      } else if (approval === true) {
        // Ask user for approval
        const approved = await requestApproval(bot, chatId, name, args, config.APPROVAL_TIMEOUT);
        if (approved) {
          await bot.sendMessage(chatId, `✅ Approved. Executing...`);
          result = await executeTool(name, args);
        } else {
          result = { denied: true, message: "Action was denied or timed out." };
          await bot.sendMessage(chatId, `❌ Denied.`);
        }
      } else {
        // Auto-execute (read-only)
        result = await executeTool(name, args);
      }

      // If result has a document, send it
      if (result.documentPath) {
        try {
          await bot.sendDocument(chatId, result.documentPath, {
            caption: result.documentName || "Document",
          });
        } catch (err) {
          console.error("Failed to send document:", err.message);
        }
      }

      // If result has a screenshot, send it and track
      if (result.screenshotPath) {
        try {
          await bot.sendPhoto(chatId, result.screenshotPath, {
            caption: result.title ? `${result.title}\n${result.url || ""}` : undefined,
          });
          screenshotPaths.push(result.screenshotPath);
        } catch (err) {
          console.error("Failed to send screenshot:", err.message);
        }
      }

      // Add tool result to history
      const resultContent = typeof result === "string" ? result : JSON.stringify(result);
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
