import express, { type Application, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { accounts } from "./AccountService.js";
import { characterStore, claimCharacter, releaseCharacter } from "./CharacterStore.js";
import { guildStore } from "./GuildStore.js";

/** Mounted explicitly by app.config. Sessions use bearer headers, never cookies. */
export function installAccountRoutes(app: Application): void {
  const router = express.Router();
  const permitted = new Set(["https://nustanakritwithai.github.io", ...(process.env.MONTRA_ACCOUNT_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean)]);
  const buckets = new Map<string, {count: number; until: number}>();
  let globalBucket = {count:0, until:0};
  let activeHashes = 0;
  function rate(req: Request, res: Response, scope: string): boolean {
    const now = Date.now();
    if (globalBucket.until <= now) globalBucket = {count:0,until:now+60_000};
    if (++globalBucket.count > 240) { res.status(429).json({error:"try_later"}); return false; }
    if (buckets.size > 5000) for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    if (buckets.size > 6000) { res.status(429).json({error:"try_later"}); return false; }
    const user = typeof req.body?.username === "string" ? req.body.username.slice(0, 128).toLowerCase() :
      typeof req.body?.guestKey === "string" ? req.body.guestKey.slice(0,100) : "";
    const key = scope + ":" + createHash("sha256").update(user).digest("hex");
    const old = buckets.get(key);
    const bucket = old && old.until > now ? old : {count:0,until:now + 60_000};
    bucket.count++; buckets.set(key, bucket);
    if (bucket.count > (scope==="guest_create" ? 40 : 8) || activeHashes >= 4) { res.status(429).json({error:"try_later"}); return false; }
    return true;
  }
  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !permitted.has(origin)) { res.status(403).json({error:"origin_not_allowed"}); return; }
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });
  router.use(express.json({limit:"4kb", strict:true}));
  const run = (scope: string, handler: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    if (!rate(req,res,scope)) return;
    activeHashes++;
    try { res.json(await handler(req)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "account_error";
      const allowed = new Set(["invalid_account_details", "invalid_legacy_key", "account_unavailable", "legacy_already_linked", "invalid_credentials", "invalid_recovery", "invalid_guest_key", "guest_required"]);
      res.status(allowed.has(code) ? 400 : 503).json({error:allowed.has(code) ? code : "account_unavailable"});
    } finally { activeHashes--; }
  };
  router.post("/register", run("register", req => accounts().register(req.body?.username, req.body?.password, req.body?.legacyKey)));
  router.post("/login", run("login", req => accounts().login(req.body?.username, req.body?.password)));
  router.post("/reset", run("reset", req => accounts().resetPassword(req.body?.username, req.body?.recoveryCode, req.body?.password)));
  function bearer(req: Request): string { return /^Bearer (ms1_[0-9a-f]{64})$/.exec(req.headers.authorization || "")?.[1] || ""; }
  router.post("/guest", run("guest_create", async () => accounts().createGuest()));
  router.post("/guest-login", run("guest_login", async req => accounts().guestLogin(req.body?.guestKey)));
  router.post("/guest-upgrade", run("guest_upgrade", req => accounts().upgradeGuest(bearer(req),req.body?.username,req.body?.password)));
  router.post("/logout", (req, res) => { accounts().logout(bearer(req)); res.json({ok:true}); });
  async function finishRetirements():Promise<void> {
    for(const id of accounts().pendingRetirements()) {
      await characterStore.eraseCharacter(id);
      accounts().completeRetirement(id);
    }
  }
  router.get("/slots", async (req, res) => {
    try {
      const identity = accounts().resolve(bearer(req));
      if (!identity) { res.status(401).json({error:"login_required"}); return; }
      await finishRetirements();
      const slots=await characterStore.listSlots(identity.characterIds);
      res.json({guest:identity.guest,slots:slots.map((slot,index)=>({...slot,revision:identity.characterIds[index]}))});
    } catch { res.status(503).json({error:"account_unavailable"}); }
  });
  router.post("/delete-character", async (req,res)=>{
    const identity=accounts().resolve(bearer(req));
    if(!identity){res.status(401).json({error:"login_required"});return;}
    const slot=req.body?.slot,expected=req.body?.revision,confirmation=req.body?.name;
    if(!Number.isInteger(slot) || slot<1 || slot>3 || typeof expected!=="string" || identity.characterIds[slot-1]!==expected || typeof confirmation!=="string") {
      res.status(400).json({error:"slot_changed"});return;
    }
    const lease="delete:"+randomUUID();
    if(!claimCharacter(identity.accountId,lease)){res.status(409).json({error:"character_online"});return;}
    try {
      await finishRetirements();
      const current=accounts().resolve(bearer(req));
      if(!current || current.accountId!==identity.accountId || current.characterIds[slot-1]!==expected)throw Error("slot_changed");
      const summary=(await characterStore.listSlots(current.characterIds))[slot-1];
      const verified=accounts().resolve(bearer(req));
      if(!verified || verified.accountId!==identity.accountId || verified.characterIds[slot-1]!==expected)throw Error("slot_changed");
      if(!summary.occupied || summary.unavailable || summary.name!==confirmation)throw Error("confirm_name_mismatch");
      if(guildStore().hasMember(expected))throw Error("character_in_guild");
      if(characterStore.economyEnabled && characterStore.economy.hasOpenListings(expected))throw Error("character_has_listings");
      accounts().retireCharacter(identity.accountId,slot,expected);
      await characterStore.eraseCharacter(expected);
      accounts().completeRetirement(expected);
      res.json({ok:true});
    } catch(error) {
      const code=error instanceof Error ? error.message : "delete_failed";
      const known=new Set(["slot_changed","confirm_name_mismatch","character_in_guild","character_has_listings"]);
      res.status(known.has(code)?409:503).json({error:known.has(code)?code:"delete_failed"});
    } finally { releaseCharacter(identity.accountId,lease); }
  });
  // A crash between slot retirement and erasure is retried on server startup.
  void finishRetirements().catch(()=>console.error("MONTRA pending character deletion needs retry"));
  app.use("/montra/account", router);
}
