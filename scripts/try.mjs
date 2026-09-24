// Runs one note through the pipeline locally, without Telegram or Supabase:
//   npm run try -- "note text"
import fs from "node:fs";
import { scoreNote, searchPhrase, fetchNews, draftPost, withVerifyFlag, PASS_SCORE } from "../lib/pipeline.js";

const note = process.argv.slice(2).join(" ");
const { score, reason } = await scoreNote(note);
console.log(`SCORE ${score}/10: ${reason}`);

if (score >= PASS_SCORE) {
  const phrase = await searchPhrase(note);
  const news = await fetchNews(phrase);
  console.log(`SEARCH: ${phrase}\nNEWS: ${JSON.stringify(news, null, 2)}`);
  const { post, used_news } = await draftPost(note, news, fs.readFileSync("voice-skill.txt", "utf8"));
  console.log("\n----- DRAFT -----\n" + (used_news && news ? withVerifyFlag(post, news) : post));
}
