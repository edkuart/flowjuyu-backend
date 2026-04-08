type OpenAIRole = "system" | "user";

export type OpenAITextMessage = {
  role: OpenAIRole;
  content: string;
};

export type OpenAITextCompletionParams = {
  messages: OpenAITextMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type OpenAITextCompletionResult = {
  text: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  raw: unknown;
};

export type OpenAIImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type OpenAITextContentPart = {
  type: "text";
  text: string;
};

export type OpenAIMultimodalMessage = {
  role: OpenAIRole;
  content: Array<OpenAITextContentPart | OpenAIImageContentPart>;
};

export type OpenAIMultimodalCompletionParams = {
  messages: OpenAIMultimodalMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getTimeoutMs(): number {
  const value = Number(process.env.OPENAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return value;
}

function getRequestTimeoutMs(override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return override;
  }

  return getTimeoutMs();
}

export async function createOpenAITextCompletion(
  params: OpenAITextCompletionParams
): Promise<OpenAITextCompletionResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: params.model || DEFAULT_OPENAI_MODEL,
        temperature: params.temperature ?? 0.4,
        max_tokens: params.maxTokens ?? 500,
        messages: params.messages,
      }),
      signal: controller.signal,
    });

    const raw: any = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        raw?.error?.message ||
        `OpenAI request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    const text = raw?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("OpenAI response did not include content");
    }

    return {
      text,
      model: raw?.model || params.model || DEFAULT_OPENAI_MODEL,
      usage: {
        promptTokens: raw?.usage?.prompt_tokens ?? null,
        completionTokens: raw?.usage?.completion_tokens ?? null,
        totalTokens: raw?.usage?.total_tokens ?? null,
      },
      raw,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${getTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createOpenAIMultimodalCompletion(
  params: OpenAIMultimodalCompletionParams
): Promise<OpenAITextCompletionResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const requestTimeoutMs = getRequestTimeoutMs(params.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: params.model || DEFAULT_OPENAI_MODEL,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 500,
        messages: params.messages,
      }),
      signal: controller.signal,
    });

    const raw: any = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        raw?.error?.message ||
        `OpenAI multimodal request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    const text = raw?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("OpenAI multimodal response did not include content");
    }

    return {
      text,
      model: raw?.model || params.model || DEFAULT_OPENAI_MODEL,
      usage: {
        promptTokens: raw?.usage?.prompt_tokens ?? null,
        completionTokens: raw?.usage?.completion_tokens ?? null,
        totalTokens: raw?.usage?.total_tokens ?? null,
      },
      raw,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
