/** Messages are ephemeral; the client may supply only their plain text. */
export const CHAT_MAX_CODEPOINTS = 200;
export type ChatChannel = "map" | "world";
export type ChatCommand = { text: string; channel: ChatChannel };
const FORBIDDEN_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export function parseChatMessage(payload: unknown): ChatCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || typeof value.text !== "string" || value.text.length > 400 ||
      (value.channel !== "map" && value.channel !== "world")) return null;
  const text = value.text.normalize("NFC").trim();
  if (!text || FORBIDDEN_CONTROLS.test(text) || Array.from(text).length > CHAT_MAX_CODEPOINTS) return null;
  return { text, channel: value.channel };
}
