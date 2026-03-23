/**
 * Vector Memory — Supabase pgvector powered semantic memory
 * Replaces mem0 with our own implementation using infrastructure we already have.
 *
 * How it works:
 * 1. After each conversation, AI extracts key facts
 * 2. Facts are embedded using OpenAI text-embedding-3-small
 * 3. Stored in Supabase with vector column
 * 4. Before each AI call, relevant memories are retrieved by similarity
 */
const config = require("../config");

let supabase = null;
let openai = null;

const EMBEDDING_MODEL = "text-embedding-3-small"; // $0.02/M tokens — essentially free
const EXTRACT_MODEL = "gpt-4o-mini";

function getSupabase() {
  if (!supabase) {
    const { createClient } = require("@supabase/supabase-js");
    const url = config.SUPABASE_URL;
    const key = config.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

function getOpenAI() {
  if (!openai) {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openai;
}

// ── Embed text → vector ──
async function embed(text) {
  const ai = getOpenAI();
  const res = await ai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

// ── Extract facts from a conversation turn ──
async function extractFacts(userMessage, assistantReply) {
  const ai = getOpenAI();

  const res = await ai.chat.completions.create({
    model: EXTRACT_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You extract important facts from conversations to remember for future interactions.
Extract ONLY facts worth remembering long-term. Skip transient stuff like "hi" or "thanks".

Categories: preference, personal, credential, technical, workflow, contact, schedule

Return JSON array: [{"fact": "...", "category": "..."}]
Return empty array [] if nothing worth remembering.`,
      },
      {
        role: "user",
        content: `User said: "${userMessage}"\nAssistant replied: "${assistantReply?.slice(0, 500)}"`,
      },
    ],
    response_format: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(res.choices[0].message.content);
    return Array.isArray(parsed) ? parsed : parsed.facts || parsed.memories || [];
  } catch {
    return [];
  }
}

// ── Store a memory ──
async function storeMemory(licenseKey, fact, category, sourceMessage) {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    // Check for duplicate/similar facts
    const vector = await embed(fact);
    const { data: existing } = await sb.rpc("search_memories", {
      query_embedding: vector,
      query_license_key: licenseKey,
      match_count: 1,
      match_threshold: 0.92, // Very similar = duplicate
    });

    if (existing?.length > 0) {
      // Update existing memory instead of creating duplicate
      await sb
        .from("memories")
        .update({
          fact,
          category,
          embedding: vector,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);
      return { updated: true, id: existing[0].id };
    }

    // Insert new memory
    const { data, error } = await sb.from("memories").insert({
      license_key: licenseKey,
      fact,
      category: category || "general",
      embedding: vector,
      source_message: sourceMessage?.slice(0, 500),
    }).select("id").single();

    if (error) throw error;
    return { created: true, id: data.id };
  } catch (err) {
    console.warn("storeMemory error:", err.message);
    return null;
  }
}

/**
 * Add memories from a conversation turn.
 * Call after each completed AI response (fire-and-forget).
 */
async function addMemories(licenseKey, userMessage, assistantReply) {
  if (!getSupabase()) return;

  try {
    const facts = await extractFacts(userMessage, assistantReply);
    for (const { fact, category } of facts) {
      if (fact && fact.length > 5) {
        await storeMemory(licenseKey, fact, category, userMessage);
      }
    }
  } catch (err) {
    console.warn("addMemories error:", err.message);
  }
}

/**
 * Search for relevant memories before an AI call.
 * Returns formatted string to inject into system prompt.
 */
async function searchMemories(licenseKey, query) {
  const sb = getSupabase();
  if (!sb) return "";

  try {
    const vector = await embed(query);
    const { data, error } = await sb.rpc("search_memories", {
      query_embedding: vector,
      query_license_key: licenseKey,
      match_count: 15,
      match_threshold: 0.65,
    });

    if (error || !data?.length) return "";

    const items = data.map((m) => `- [${m.category}] ${m.fact} (relevance: ${(m.similarity * 100).toFixed(0)}%)`);
    return `\n\nRELEVANT MEMORIES:\n${items.join("\n")}`;
  } catch (err) {
    console.warn("searchMemories error:", err.message);
    return "";
  }
}

/**
 * Get all memories for a user.
 */
async function getAllMemories(licenseKey) {
  const sb = getSupabase();
  if (!sb) return [];

  const { data } = await sb
    .from("memories")
    .select("id, fact, category, created_at, updated_at")
    .eq("license_key", licenseKey)
    .order("updated_at", { ascending: false })
    .limit(100);

  return data || [];
}

/**
 * Delete a specific memory.
 */
async function deleteMemory(memoryId) {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase not configured" };

  const { error } = await sb.from("memories").delete().eq("id", memoryId);
  return error ? { error: error.message } : { success: true };
}

/**
 * Save a specific fact (called by the save_memory tool).
 */
async function saveFact(licenseKey, key, value) {
  return storeMemory(licenseKey, `${key}: ${value}`, "general", null);
}

/**
 * Search for a specific fact (called by the recall_memory tool).
 */
async function recallFact(licenseKey, key) {
  if (key === "all") return getAllMemories(licenseKey);
  return searchMemories(licenseKey, key);
}

module.exports = {
  addMemories,
  searchMemories,
  getAllMemories,
  deleteMemory,
  saveFact,
  recallFact,
  storeMemory,
};
