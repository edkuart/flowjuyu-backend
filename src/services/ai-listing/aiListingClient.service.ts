import { createOpenAITextCompletion } from "../../lib/openai";

export type AiListingClientResponse = {
  title: string;
  description: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  raw: unknown;
};

function parseStructuredListingResponse(text: string): {
  title: string;
  description: string;
} {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const match = normalized.match(/TITLE:\s*([\s\S]*?)\nDESCRIPTION:\s*([\s\S]*)$/i);

  if (!match) {
    throw new Error("AI listing response did not match TITLE/DESCRIPTION format");
  }

  const title = match[1].trim();
  const description = match[2].trim();

  if (!title || !description) {
    throw new Error("AI listing response is incomplete");
  }

  return { title, description };
}

export async function requestAiListingContent(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<AiListingClientResponse> {
  const completion = await createOpenAITextCompletion({
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    temperature: 0.6,
    maxTokens: 420,
  });

  const parsed = parseStructuredListingResponse(completion.text);

  return {
    ...parsed,
    model: completion.model,
    usage: completion.usage,
    raw: completion.raw,
  };
}
