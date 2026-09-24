// Telegram delivers every message in Meera's capture channel here (see setWebhook in README).
import { waitUntil } from "@vercel/functions";
import { scoreNote, searchPhrase, fetchNews, draftPost, withVerifyFlag, PASS_SCORE } from "../lib/pipeline.js";
import { latestVoiceSkill, saveNote, saveScore, saveDraft, decideDraft } from "../lib/db.js";

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

// Telegram caps a message at 4096 chars. Returns the ids of every message sent.
async function send(chatId, text, replyTo) {
  const ids = [];
  for (let i = 0; i < text.length; i += 4000) {
    const msg = await tg("sendMessage", {
      chat_id: chatId,
      text: text.slice(i, i + 4000),
      link_preview_options: { is_disabled: true },
      ...(replyTo && i === 0 ? { reply_parameters: { message_id: replyTo } } : {}),
    });
    ids.push(msg.message_id);
  }
  return ids;
}

async function handleNote(chatId, messageId, note) {
  const noteId = await saveNote(chatId, messageId, note);

  const { score, reason } = await scoreNote(note);
  await saveScore(noteId, score, reason);
  if (score < PASS_SCORE) {
    await send(chatId, `No draft (score ${score}/10): ${reason}`, messageId);
    return;
  }

  const [voiceSkill, news] = await Promise.all([latestVoiceSkill(), searchPhrase(note).then(fetchNews)]);
  const { post, used_news } = await draftPost(note, news, voiceSkill);
  const draft = used_news && news ? withVerifyFlag(post, news) : post;

  const ids = await send(
    chatId,
    `Score ${score}/10: ${reason}\n\n${draft}\n\nReply APPROVE or REJECT to this message.`,
    messageId,
  );
  await saveDraft(noteId, draft, used_news ? news : null, ids);
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (text === "/start") {
    await send(chatId, `Send notes here and I'll reply with a LinkedIn draft for the ones worth developing. This chat's id is ${chatId}.`);
    return;
  }
  if (String(chatId) !== process.env.ALLOWED_CHAT_ID) return; // only Meera's channel
  if (!text) {
    await send(chatId, "I can only read text for now. Paste the voice-note transcription instead.", msg.message_id);
    return;
  }

  const decision = text.toUpperCase().match(/^(APPROVE|REJECT)D?\.?$/)?.[1];
  if (decision) {
    const replyTo = msg.reply_to_message?.message_id;
    const found = replyTo && (await decideDraft(replyTo, decision === "APPROVE" ? "approved" : "rejected"));
    await send(
      chatId,
      found
        ? decision === "APPROVE"
          ? "Approved and saved. Copy it to LinkedIn when you're ready. Nothing has been posted."
          : "Rejected and kept for review."
        : "Reply APPROVE or REJECT directly to the draft message.",
      msg.message_id,
    );
    return;
  }

  await handleNote(chatId, msg.message_id, text);
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Skinstinct webhook is live.");
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const msg = req.body?.message ?? req.body?.channel_post;
  if (msg) {
    // Answer Telegram at once (so it doesn't retry) and keep working in the background.
    waitUntil(
      handle(msg).catch(async (err) => {
        console.error(err);
        await send(msg.chat.id, `Something went wrong: ${err.message}`).catch(() => {});
      }),
    );
  }
  res.status(200).end();
}
