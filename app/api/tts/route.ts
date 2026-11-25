import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken, verifyProjectPermission, verifySessionPermission } from "@/lib/auth";
import { getTtsAudio, saveTtsAudio, ttsCacheKey } from "@/lib/tts-cache";
import { getGoogleTtsApiKey } from "@/lib/llm/config";
import { TTS_LANGUAGES, TTS_MAX_INPUT_BYTES, type TtsLanguage } from "@/lib/speechText";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const SAFE_ID = /^[\w-]+$/;
const VOICE_NAME = "Despina";

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : undefined;
  if (sessionId && !SAFE_ID.test(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }
  if (projectId && !SAFE_ID.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  }
  const allowed = sessionId
    ? await verifySessionPermission(sessionId, token)
    : projectId
      ? await verifyProjectPermission(projectId, token)
      : true;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cacheable = !!(sessionId || projectId);

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const lang = body?.lang as TtsLanguage;
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (!TTS_LANGUAGES.includes(lang)) {
    return NextResponse.json({ error: "Unsupported lang" }, { status: 400 });
  }
  if (Buffer.byteLength(text, "utf-8") > TTS_MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "text is too long" }, { status: 413 });
  }

  const voiceName = `${lang}-Chirp3-HD-${VOICE_NAME}`;
  const cacheKey = ttsCacheKey(lang, voiceName, text);
  if (cacheable) {
    const cached = await getTtsAudio(sessionId, projectId, cacheKey);
    if (cached) return audioResponse(cached);
  }

  const apiKey = getGoogleTtsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_TTS_API_KEY is not configured. Set it in Admin Settings." },
      { status: 501 },
    );
  }

  const upstream = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang, name: voiceName },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const message = data?.error?.message ?? `Google TTS failed (${upstream.status})`;
    console.error(`[tts] Google TTS ${upstream.status} (${lang}): ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const audio = Buffer.from(data.audioContent, "base64");
  if (cacheable) await saveTtsAudio(sessionId, projectId, cacheKey, audio);
  return audioResponse(audio);
}

function audioResponse(audio: Buffer) {
  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
}
