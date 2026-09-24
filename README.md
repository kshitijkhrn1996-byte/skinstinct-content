# Skinstinct content pipeline (Case 1 / Meera)

Meera sends a note to her Telegram capture channel. The pipeline:

1. **Scores** it 0-10 with Gemini Flash. Below 6, it replies with the reason and stops.
2. **Finds a news angle.** Gemini Flash pulls a short search phrase, and Google News (free, no key)
   returns the top story from the last 30 days.
3. **Drafts** the post with Gemini, using `voice-skill.txt` (stored in Supabase) as the voice instruction.
   It uses the news item only if it genuinely fits.
4. **Adds the verify flag** (source, date, link, "⚠ Check this before publishing") whenever the draft
   uses news. Code adds this, not the model, so it can't be skipped.
5. **Stores everything** in Supabase: the note and score, then the draft with status `pending`.
6. Meera replies **APPROVE** or **REJECT** to the draft, and the status updates. Nothing is deleted.

It **never posts to LinkedIn**. That's the Cut (check 07, Judgment Protected): Meera stays the author
of everything published.

## Files

| File | What it does |
|---|---|
| `api/webhook.js` | Vercel function that Telegram calls on every message |
| `lib/pipeline.js` | score → search phrase → Google News → draft → verify flag |
| `lib/db.js` | Supabase reads/writes (`meera_notes`, `meera_drafts`, `meera_voice_skill`) |
| `voice-skill.txt` | Meera's voice profile (150-200 words, from `published/`) |
| `supabase/schema.sql` | the three tables |
| `scripts/try.mjs` | run one note locally: `npm run try -- "note"` |
| `scripts/seed-voice.mjs` | save `voice-skill.txt` to Supabase: `npm run seed-voice` |

The voice profile is used in `lib/pipeline.js` → `draftPost()` as Gemini's `systemInstruction`,
loaded from Supabase by `latestVoiceSkill()` in `api/webhook.js`.

## Setup

1. Copy `.env.example` to `.env` and fill it in. `.env` is in `.gitignore`, so never commit it.
2. Run `supabase/schema.sql` in the Supabase SQL editor, then `npm run seed-voice`.
3. Push to GitHub and import the repo in Vercel. Add every `.env` variable under Environment Variables, then deploy.
4. Connect Telegram, using the same secret as `TELEGRAM_WEBHOOK_SECRET`:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<VERCEL_URL>/api/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=["message","channel_post"]`
5. The bot must be an admin of the capture channel.
