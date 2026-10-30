#!/usr/bin/env node
/**
 * Verifies an ElevenLabs API key without spending characters.
 *
 *   ELEVENLABS_API_KEY=sk_... node scripts/check-elevenlabs.mjs
 *   node scripts/check-elevenlabs.mjs sk_...
 *   netlify env:get ELEVENLABS_API_KEY | node scripts/check-elevenlabs.mjs
 */
const key = (process.argv[2] || process.env.ELEVENLABS_API_KEY || "").trim();
const base = (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");

if (!key) {
  console.error("No key found. Pass it as an argument or set ELEVENLABS_API_KEY.");
  process.exit(2);
}

const headers = { "xi-api-key": key };

async function json(path) {
  const response = await fetch(`${base}${path}`, { headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, status: response.status, detail: detail.slice(0, 300) };
  }
  return { ok: true, body: await response.json() };
}

const subscription = await json("/v1/user/subscription");
if (!subscription.ok) {
  console.error(`✖ ElevenLabs rejected the key (HTTP ${subscription.status}).`);
  if (subscription.status === 401) console.error("  The key is incomplete, revoked, or expired.");
  if (subscription.detail) console.error(`  ${subscription.detail}`);
  process.exit(1);
}

const voiceId = (process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM").trim();
const voice = await json(`/v1/voices/${encodeURIComponent(voiceId)}`);

const { tier, character_count: used, character_limit: limit } = subscription.body;
console.log("✔ Key is valid");
console.log(`  plan: ${tier}`);
console.log(`  characters: ${used}/${limit} used (${limit - used} left)`);
console.log(`  voice ${voiceId}: ${voice.ok ? voice.body?.name ?? "ok" : `unavailable (HTTP ${voice.status})`}`);

const permissions = subscription.body?.can_extend_character_limit;
if (permissions === undefined) {
  console.log("  hint: check that Text to Speech is enabled on the key's restrictions.");
}
