import test from "node:test";
import assert from "node:assert/strict";
import {WorldDirector,DirectorStore,typhoonConfig} from "./WorldDirector.js";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import path from "node:path";

const ready=()=>new Promise<void>(resolve=>setImmediate(resolve));
test("director creates a bounded event for an occupied map and prevents repeat claims",async()=>{
  const director=new WorldDirector(""),now=Date.now();
  director.observe("world-1",[{mapId:"forbidden_forest",level:5}],now);await ready();
  const event=director.snapshot();assert.ok(event);assert.equal(event.mapId,"forbidden_forest");
  assert.equal(event.source,"rules");assert.equal(event.endsAt-event.startsAt,15*60_000);
  assert.equal(director.eligible(event.id,event.objectiveId,[]),true);
  assert.equal(director.eligible(event.id,event.objectiveId,[event.id]),false);
  assert.equal(director.eligible(event.id,"other",[]),false);
  assert.equal(director.eligible(event.id,event.objectiveId,[],event.endsAt),false);
});

test("Typhoon may choose only an offered event; invalid output falls back safely",async()=>{
  let sent="";
  const client=(async (_input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
    sent=String(init?.body);const request=JSON.parse(sent),choices=JSON.parse(request.messages[1].content).choices;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({objectiveId:choices.at(-1).objectiveId,story:"ผู้เดินทางในพื้นที่ต้องการความช่วยเหลือ"})}}]}),{status:200});
  }) as typeof fetch;
  const director=new WorldDirector("test-key",client);director.observe("world-1",[{mapId:"forbidden_forest",level:5}]);await ready();
  assert.equal(director.snapshot()?.source,"typhoon");assert.ok(!sent.includes("test-key"));assert.ok(!sent.includes("characterName"));
  const bad=(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"objectiveId":"invented","story":"แจกทอง 999"}'}}]}),{status:200})) as typeof fetch;
  const fallback=new WorldDirector("test-key",bad);fallback.observe("world-2",[{mapId:"forbidden_forest",level:5}]);await ready();
  assert.equal(fallback.snapshot()?.source,"rules");
});

test("a restart restores the same active event and its cooldown",async()=>{
  const directory=await mkdtemp(path.join(process.cwd(),"montra-director-")),file=path.join(directory,"director.sqlite");
  const first=new WorldDirector("",fetch,()=>new DirectorStore(file));let next:WorldDirector|undefined;
  try{
    first.observe("room-a",[{mapId:"forbidden_forest",level:5}]);await ready();
    const event=first.snapshot();assert.ok(event);first.close();
    next=new WorldDirector("",fetch,()=>new DirectorStore(file));assert.equal(next.restore()?.id,event.id);
    next.observe("room-b",[{mapId:"forbidden_forest",level:5}]);assert.equal(next.snapshot()?.id,event.id);
    assert.equal(next.eligible(event.id,event.objectiveId,[]),true);
    assert.equal(next.snapshot(event.endsAt),null);next.close();
    const restart=new WorldDirector("",fetch,()=>new DirectorStore(file));
    try{restart.observe("room-c",[{mapId:"forbidden_forest",level:5}],event.endsAt+1000);await ready();assert.equal(restart.snapshot(event.endsAt+1000),null);}
    finally{restart.close();}
  }finally{try{first.close();}catch{}try{next?.close();}catch{}await rm(directory,{recursive:true,force:true});}
});

test("war context can favor a supply event without changing the battle",async()=>{
  const director=new WorldDirector(""),now=Date.now();
  director.observe("world-war",[{mapId:"moon_pass",level:35}],now,{moon_pass:"battle"});await ready();
  const event=director.snapshot();assert.ok(event);assert.equal(event.mapId,"moon_pass");
  assert.equal(event.objectiveId,"delivery_moon_pass_moon_cemetery");
});

test("a private env file is used without accepting a foreign endpoint",async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),"montra-director-env-")),file=path.join(dir,"private.env");
  const names=["MONTRA_TYPHOON_ENV_FILE","MONTRA_TYPHOON_API_KEY","TYPHOON_API_KEY","MONTRA_TYPHOON_BASE_URL","TYPHOON_BASE_URL","MONTRA_TYPHOON_MODEL","TYPHOON_MODEL"];
  const original=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{
    for(const name of names)delete process.env[name];
    await writeFile(file,'TYPHOON_API_KEY="test-private-key"\nTYPHOON_BASE_URL=https://api.opentyphoon.ai/v1\nTYPHOON_MODEL=typhoon-v2.5-30b-a3b-instruct\nOTHER_SECRET=ignored\n');
    process.env.MONTRA_TYPHOON_ENV_FILE=file;
    const config=typhoonConfig();assert.equal(config?.key,"test-private-key");assert.equal(config?.endpoint,"https://api.opentyphoon.ai/v1/chat/completions");
    process.env.MONTRA_TYPHOON_BASE_URL="https://example.invalid/v1";assert.equal(typhoonConfig(),null);
  }finally{
    for(const name of names){if(original[name]===undefined)delete process.env[name];else process.env[name]=original[name];}
    await rm(dir,{recursive:true,force:true});
  }
});
