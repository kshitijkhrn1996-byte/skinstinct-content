// B1·3 - memory layer (Supabase). Server-side only: uses the secret key.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

function check({ data, error }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function latestVoiceSkill() {
  const row = check(
    await db.from("meera_voice_skill").select("content").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  );
  if (!row) throw new Error("No voice skill saved yet. Run: npm run seed-voice");
  return row.content;
}

export async function saveVoiceSkill(content) {
  check(await db.from("meera_voice_skill").insert({ content }));
}

export async function saveNote(chatId, messageId, text) {
  return check(
    await db
      .from("meera_notes")
      .insert({ telegram_chat_id: chatId, telegram_message_id: messageId, text })
      .select("id")
      .single(),
  ).id;
}

export async function saveScore(noteId, score, reason) {
  check(await db.from("meera_notes").update({ score, score_reason: reason }).eq("id", noteId));
}

export async function saveDraft(noteId, post, news, messageIds) {
  check(
    await db.from("meera_drafts").insert({
      note_id: noteId,
      post,
      news_headline: news?.headline,
      news_source: news?.source,
      news_date: news?.date,
      news_url: news?.url,
      telegram_message_ids: messageIds,
    }),
  );
}

// Finds the draft whose Telegram message Meera replied to and sets its status.
export async function decideDraft(messageId, status) {
  const rows = check(
    await db
      .from("meera_drafts")
      .update({ status, decided_at: new Date().toISOString() })
      .contains("telegram_message_ids", [messageId])
      .select("id"),
  );
  return rows.length > 0;
}
