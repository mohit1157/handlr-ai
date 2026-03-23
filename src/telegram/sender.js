const MAX_MSG_LENGTH = 4000;

function chunkMessage(text) {
  if (!text) return [];
  if (text.length <= MAX_MSG_LENGTH) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    // Try to break at newline
    let breakAt = MAX_MSG_LENGTH;
    if (remaining.length > MAX_MSG_LENGTH) {
      const nlIdx = remaining.lastIndexOf("\n", MAX_MSG_LENGTH);
      if (nlIdx > MAX_MSG_LENGTH * 0.5) breakAt = nlIdx + 1;
    }
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  return chunks;
}

async function sendText(bot, chatId, text) {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk, { parse_mode: "Markdown" }).catch(() => {
      // Retry without markdown if parsing fails
      return bot.sendMessage(chatId, chunk);
    });
  }
}

async function sendPhoto(bot, chatId, photoPath, caption) {
  await bot.sendPhoto(chatId, photoPath, { caption });
}

module.exports = { sendText, sendPhoto, chunkMessage };
