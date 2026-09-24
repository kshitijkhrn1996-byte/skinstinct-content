// Saves voice-skill.txt as the current voice skill in Supabase. Re-run after editing the file.
import fs from "node:fs";
import { saveVoiceSkill } from "../lib/db.js";

await saveVoiceSkill(fs.readFileSync("voice-skill.txt", "utf8").trim());
console.log("Voice skill saved to meera_voice_skill.");
