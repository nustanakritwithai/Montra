import { mkdir, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Append-only private operational data; never includes guest tokens or chat history. */
export async function saveBugReport(characterDirectory:string, entry:{name:string;mapId:string;x:number;y:number;z:number;text:string}):Promise<string> {
  const directory=path.join(characterDirectory,"bug-reports"), id=randomUUID();
  await mkdir(directory,{recursive:true,mode:0o700});
  await appendFile(path.join(directory,"reports.jsonl"),JSON.stringify({id,createdAt:new Date().toISOString(),...entry})+"\n",{encoding:"utf8",mode:0o600});
  return id;
}
