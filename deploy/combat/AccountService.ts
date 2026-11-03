import { mkdirSync } from "node:fs";
import path from "node:path";
import { AccountStore } from "./AccountStore.js";
import { characterStore } from "./CharacterStore.js";

let store: AccountStore | undefined;
export function accounts(): AccountStore {
  if (!store) {
    mkdirSync(characterStore.directory, {recursive:true, mode:0o700});
    store = new AccountStore(path.join(characterStore.directory, "player-accounts.sqlite"));
  }
  return store;
}
