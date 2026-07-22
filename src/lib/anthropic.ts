import Anthropic from "@anthropic-ai/sdk";
import { env, hasAnthropic } from "./env";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export { hasAnthropic };

/** A JSON Schema object (structured-output constrained). */
export type JsonSchema = Record<string, unknown>;

// Only these models accept `thinking: {type: "adaptive"}`. Haiku 4.5 (our cheap
// tier) does NOT — sending it there returns a 400 — so we omit thinking for it.
const ADAPTIVE_THINKING_MODELS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
];

function supportsAdaptiveThinking(model: string): boolean {
  return ADAPTIVE_THINKING_MODELS.some((m) => model.startsWith(m));
}

/** Adaptive thinking where the model supports it; nothing otherwise. */
function thinkingFor(model: string) {
  return supportsAdaptiveThinking(model) ? { thinking: { type: "adaptive" as const } } : {};
}

/**
 * Turn raw Anthropic SDK errors into something an operator can act on. Without
 * this the API route surfaces a wall of JSON straight into the UI, which reads
 * like a crash rather than "top up your account".
 */
function friendlyError(e: unknown): Error {
  const err = e as { status?: number; error?: { error?: { message?: string; type?: string } }; message?: string };
  const detail = err?.error?.error?.message ?? err?.message ?? String(e);
  const status = err?.status;

  if (/credit balance is too low/i.test(detail))
    return new Error("Anthropic credits exhausted — top up at console.anthropic.com (Plans & Billing), then retry. Nothing was lost; existing drafts are safe.");
  if (status === 401 || /invalid x-api-key|authentication/i.test(detail))
    return new Error("Anthropic API key is invalid — check ANTHROPIC_API_KEY in .env.local.");
  if (status === 429 || /rate limit/i.test(detail))
    return new Error("Anthropic rate limit hit — wait a moment and retry.");
  if (status === 529 || /overloaded/i.test(detail))
    return new Error("Anthropic is temporarily overloaded — retry in a few seconds.");
  if (/model/i.test(detail) && status === 404)
    return new Error(`Model not available to this account: ${detail}`);
  return new Error(detail);
}

/** Run an Anthropic call, rewriting provider errors into actionable ones. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw friendlyError(e);
  }
}

/**
 * Ask Claude for a strictly-shaped JSON object. Uses structured outputs
 * (`output_config.format`) so the first text block is guaranteed valid JSON.
 */
export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: JsonSchema;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const model = opts.model ?? env.model;
  const res = await call(() =>
    getClient().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      ...thinkingFor(model),
      output_config: { format: { type: "json_schema", schema: opts.schema } },
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    })
  );
  // Structured outputs guarantee the first text block is valid JSON.
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text block in Claude response");
  return JSON.parse(text.text) as T;
}

/** Ask Claude for free-form prose (used for the email draft). */
export async function generateText(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const model = opts.model ?? env.model;
  const res = await call(() =>
    getClient().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      ...thinkingFor(model),
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    })
  );
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}

/**
 * Research a topic using Claude's server-side web_search tool, returning the
 * gathered notes as prose. Handles the server-tool `pause_turn` resume loop.
 * The web_search_20260209 tool needs an Opus/Sonnet-tier model, so this runs on
 * the writer model, not the cheap tier. Only called when ENABLE_WEB_SEARCH=true.
 */
export async function researchWithWebSearch(opts: {
  system: string;
  prompt: string;
  model?: string;
}): Promise<string> {
  const c = getClient();
  const model = opts.model ?? env.modelWriter;
  const tools = [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 5 }];
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  let res = await call(() =>
    c.messages.create({ model, max_tokens: 4000, ...thinkingFor(model), system: opts.system, tools, messages })
  );
  // The server-side tool loop can pause; re-send to resume until it finishes.
  let guard = 0;
  while (res.stop_reason === "pause_turn" && guard++ < 5) {
    messages = [...messages, { role: "assistant", content: res.content }];
    res = await call(() =>
      c.messages.create({ model, max_tokens: 4000, ...thinkingFor(model), system: opts.system, tools, messages })
    );
  }
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}
