import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { getGoogleTtsApiKey } from "@/lib/llm/config";
import { TTS_LANGUAGES, TTS_MAX_INPUT_BYTES, type TtsLanguage } from "@/lib/speechText";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICE_NAME = "Despina";

export async function POST(request: NextRequest) {
  if (!isValidToken(getArondoToken(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getGoogleTtsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_TTS_API_KEY is not configured. Set it in Admin Settings." },
      { status: 501 },
    );
  }

  const body = await request.json();
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

  const upstream = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang, name: `${lang}-Chirp3-HD-${VOICE_NAME}` },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const message = data?.error?.message ?? `Google TTS failed (${upstream.status})`;
    console.error(`[tts] Google TTS ${upstream.status} (${lang}): ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return new NextResponse(Buffer.from(data.audioContent, "base64"), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}
