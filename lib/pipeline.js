// Note -> score -> search phrase -> Google News -> draft. Drafts only; nothing here publishes.
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const FAST_MODEL = "gemini-flash-latest"; // scoring + keywords: fast, cheap, mechanical
const DRAFT_MODEL = "gemini-pro-latest"; // drafting; falls back to Flash if Pro is rate-limited

export const PASS_SCORE = 6;

async function gemini(model, prompt, { system, schema } = {}) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(`Gemini ${model} ${res.status}: ${json.error?.message}`);
    err.status = res.status;
    throw err;
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned no text (${json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason})`);
  return JSON.parse(text);
}

// B1·1 - score before drafting.
export function scoreNote(note) {
  return gemini(
    FAST_MODEL,
    `You screen raw notes for Meera Pillai, a skincare founder (ex-pharma formulator) who writes science-led LinkedIn posts on ingredients, formulation, industry transparency, Indian climate/market context and her founder story.

Score this note 0-10 for whether it can become a strong LinkedIn post, with a one-line reason.
- 0-3: task reminders, logistics, half-sentences, venting, personal admin, or anything with no idea in it.
- 4-5: a real idea but too thin or vague to carry a full post without facts only she has.
- 6-8: a specific observation, data point, story or argument from her own work that can carry a 350-650 word post.
- 9-10: all of that plus a sharp, non-obvious point her audience will act on.
Be strict. Most raw notes should not pass. Also score low anything that names suppliers or customers, reveals unreleased products, or would be a sales pitch.

<note>
${note}
</note>`,
    {
      schema: {
        type: "object",
        required: ["score", "reason"],
        properties: { score: { type: "integer" }, reason: { type: "string" } },
      },
    },
  );
}

// B1·2 - keywords -> short search phrase.
export async function searchPhrase(note) {
  const { phrase } = await gemini(
    FAST_MODEL,
    `Pull 3-5 search terms from this note and combine them into one short news search phrase (2-5 words) that would find a current news story an Indian skincare audience would recognise. Prefer industry/regulation/science terms over brand names.

<note>
${note}
</note>`,
    {
      schema: {
        type: "object",
        required: ["keywords", "phrase"],
        properties: { keywords: { type: "array", items: { type: "string" } }, phrase: { type: "string" } },
      },
    },
  );
  return phrase;
}

// Unescape entities first: RSS descriptions are escaped HTML, so tags only appear after this.
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// B1·2 - top Google News result from the last 30 days. No key, no account.
export async function fetchNews(phrase) {
  const q = encodeURIComponent(`${phrase} when:30d`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
  const xml = await (await fetch(url)).text();
  const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
  if (!item) return null;
  const tag = (t) => decode(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
  const source = tag("source");
  const headline = tag("title").replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
  const summary = tag("description").replace(source, "").trim();
  return {
    headline,
    source,
    date: new Date(tag("pubDate")).toDateString(),
    url: tag("link"),
    summary: summary && summary !== headline ? summary : headline,
  };
}

// L3 + B1·2 - draft in Meera's voice, optionally using the news item.
export async function draftPost(note, news, voiceSkill) {
  const prompt = `Write a LinkedIn post in Meera's voice from this note.

<note>
${note}
</note>

<news_item>
${news ? `Headline: ${news.headline}\nFrom: ${news.source} · ${news.date}\nSummary: ${news.summary}` : "None found."}
</news_item>

If this news item is genuinely relevant, use it to make the post timely. If it doesn't fit naturally, ignore it.

Today is ${new Date().toDateString()}. Describe the news item's timing accurately from its date.

Rules:
- Only use facts from the note, the news item, or general formulation science. Never invent numbers, studies, anecdotes, customer quotes or Skinstinct facts, and never invent scene details (time of day, who said it, quantities, durations) or things Meera used to believe. If the post needs a fact only Meera has, write a placeholder like [CHECK: exact figure].
- The quotes and figures in the voice profile only illustrate her style. Don't reuse them, their phrases or their facts (e.g. 2mg per square centimetre, the 2021 pharma meeting) unless the note is about that topic.
- Only admit a mistake if the note describes one. Never make up her past decisions, beliefs or career events.
- 350-650 words in 5-8 paragraphs, separated by blank lines. No hashtags, no emojis, no bullet points, no call to action, no sales language.
- Never name suppliers or customers, or mention unreleased products.

Return "post" (the post text only) and "used_news" (true only if the post refers to the news item).`;
  const opts = {
    system: `You write LinkedIn posts for Meera Pillai, founder of Skinstinct. This is how she writes:\n\n${voiceSkill}`,
    schema: {
      type: "object",
      required: ["post", "used_news"],
      properties: { post: { type: "string" }, used_news: { type: "boolean" } },
    },
  };
  let result;
  try {
    result = await gemini(DRAFT_MODEL, prompt, opts);
  } catch (err) {
    if (err.status !== 429) throw err;
    console.warn(`${DRAFT_MODEL} rate-limited; drafting with ${FAST_MODEL}`);
    result = await gemini(FAST_MODEL, prompt, opts);
  }
  // Gemini sometimes double-escapes newlines inside the JSON string.
  return { ...result, post: result.post.replace(/\\n/g, "\n").trim() };
}

// B1·2 - the verify flag. Added by code, not the model, so it can never be left off.
export function withVerifyFlag(post, news) {
  const line = "─────────────────────────────────";
  return `${post}

${line}
NEWS SOURCE: ${news.headline}
FROM: ${news.source} · ${news.date}
LINK: ${news.url}
⚠ Check this before publishing — you are the author of this claim
${line}`;
}
