const DEFAULT_TRANSCRIPTION_MODEL =
  process.env.OPENAI_MODEL_TRANSCRIPTION || "gpt-4o-mini-transcribe";
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);
const MIN_TRANSCRIPTION_LENGTH = 3;

function getTranscriptionTimeoutMs(): number {
  const value = Number(process.env.OPENAI_TIMEOUT_MS || DEFAULT_TRANSCRIPTION_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TRANSCRIPTION_TIMEOUT_MS;
  return value;
}

function getFileExtension(mimeType: string): string {
  switch (mimeType) {
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/amr":
      return "amr";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return "audio";
  }
}

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTranscriptionTimeoutMs());

  try {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([buffer], { type: mimeType }),
      `whatsapp-audio.${getFileExtension(mimeType)}`
    );
    formData.append("model", DEFAULT_TRANSCRIPTION_MODEL);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
      signal: controller.signal,
    });

    const raw: any = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        raw?.error?.message ||
          `OpenAI transcription failed with status ${response.status}`
      );
    }

    const text = String(raw?.text ?? "").trim();
    if (text.length < MIN_TRANSCRIPTION_LENGTH) {
      throw new Error("Transcription is empty or too short");
    }

    return text;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(
        `OpenAI transcription timed out after ${getTranscriptionTimeoutMs()}ms`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
