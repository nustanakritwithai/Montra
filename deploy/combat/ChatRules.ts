/** Plain-text chat payloads only; identities and routing remain server-owned. */
export const CHAT_MAX_CODEPOINTS = 200;
export type ChatChannel = "map" | "world" | "party" | "private" | "bug";
export type ChatCommand = { text:string; channel:ChatChannel; targetId?:string };
const FORBIDDEN_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
export function parseChatMessage(payload:unknown):ChatCommand|null {
  if(!payload || typeof payload!=="object" || Array.isArray(payload)) return null;
  const value=payload as Record<string,unknown>;
  if(typeof value.text!=="string" || value.text.length>400 ||
    !["map","world","party","private","bug"].includes(value.channel as string)) return null;
  const channel=value.channel as ChatChannel, keys=Object.keys(value);
  if(channel==="private") {
    if(keys.length!==3 || typeof value.targetId!=="string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value.targetId)) return null;
  } else if(keys.length!==2 || !keys.includes("text") || !keys.includes("channel")) return null;
  const text=value.text.normalize("NFC").trim();
  if(!text || FORBIDDEN_CONTROLS.test(text) || Array.from(text).length>CHAT_MAX_CODEPOINTS) return null;
  return channel==="private" ? {text,channel,targetId:value.targetId as string} : {text,channel};
}
