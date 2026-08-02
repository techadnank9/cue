// convex/openaiVoice.ts
// Shared Whisper (speech-to-text) and TTS (text-to-speech) helpers used by
// both the Show Console voice cascade and the Fan Guide chat. Plain
// functions, not Convex functions — no query/mutation/action exports here,
// so this file isn't part of the public API surface. Server-only, called
// from inside actions.

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function transcribeAudio(audio: ArrayBuffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";
  try {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/webm" }), "command.webm");
    form.append("model", "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      console.error("transcribeAudio failed", res.status, await res.text());
      return "";
    }
    const data = await res.json();
    return data?.text ?? "";
  } catch (err) {
    console.error("transcribeAudio error", err);
    return "";
  }
}

// Returns a base64-encoded mp3, or null if no key / the call fails.
export async function synthesizeSpeech(text: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text.trim()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // "nova" reads as warm and friendly, female — the voice for Arlo.
        model: "tts-1",
        voice: "nova",
        input: text,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      console.error("synthesizeSpeech failed", res.status, await res.text());
      return null;
    }
    const buf = await res.arrayBuffer();
    return arrayBufferToBase64(buf);
  } catch (err) {
    console.error("synthesizeSpeech error", err);
    return null;
  }
}
