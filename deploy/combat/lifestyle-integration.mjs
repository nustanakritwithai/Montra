import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Client} from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL, folder = process.env.MONTRA_CHARACTER_DIR;
const stage = process.env.MONTRA_LIFESTYLE_STAGE;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint ?? "") || new URL(endpoint).port === "4108" ||
    !folder || !path.basename(folder).startsWith("montra-lifestyle-test-") || !["write", "read"].includes(stage)) {
  throw Error("lifestyle test requires an isolated server and data");
}
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const token = digit => "mt1_" + digit.repeat(64);
const character = digit => createHash("sha256").update(token(digit)).digest("hex");
const request = n => "lifestyle_test_" + String(n).padStart(16,"0");
const rooms = [];

async function until(check, label, timeout = 8500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await pause(35);
  }
  throw Error("timeout: " + label);
}
async function seed(digit, mapId, x, z, items) {
  const id = character(digit), slots = Array(12).fill(null);
  slots[0] = {itemId:"health_potion",quantity:3};
  slots[1] = {itemId:"spirit_staff",quantity:1};
  items.forEach(([itemId, quantity], i) => { slots[4+i] = {itemId,quantity}; });
  await writeFile(path.join(folder,id+".json"),JSON.stringify({
    id, version:1, name:"Lifestyle "+digit, level:12, experience:0, pkKills:0, pkDeaths:0,
    x,y:0,z,hp:250, mapId, build:{path:"seer",ancestry:"shrine"}, updatedAt:new Date().toISOString(),
    inventory:{version:1,slots,equippedWeaponSlot:1},
  }),{flag:"wx"});
}
async function join(digit, roomId, homeVersion = 1) {
  const sdk = new Client(endpoint), options = {guestToken:token(digit),worldVersion:1,templeVersion:1,atlasVersion:1,homeVersion};
  const room = roomId ? await sdk.joinById(roomId,options) : await sdk.create("my_room",options);
  rooms.push(room);
  const events = [];
  room.onMessage("*",(type,data)=>events.push({type,data}));
  const me = () => room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"persistent character");
  return {room, events, me};
}
async function send(c, name, payload, type, accept = () => true) {
  const from = c.events.length;
  c.room.send(name,payload);
  try {
    return await until(()=>c.events.slice(from).find(e=>e.type===type && accept(e.data))?.data,name+" -> "+type);
  } catch (err) {
    throw Error(err.message+" "+JSON.stringify(c.events.slice(from).filter(e=>e.type==="command_rejected" || e.type==="economy_error").slice(-4)));
  }
}

try {
  if (stage === "write") {
    await seed("c","ritual_village",0,0,[["mat_wood_1",9],["mat_raw_stone_1",3],["mat_herb_1",7],["mat_fish_common",5],["mat_metal_1",1]]);
    await seed("d","forbidden_forest",-32,-17,[]);
    await seed("e","ritual_village",0,0,[]);
  }
  const artisan = await join("c");
  const mutateHome = (n,action,extra={}) => send(artisan,"home_action",{requestId:request(n),action,...extra},"home_state",v=>v.requestId===request(n));
  if (stage === "write") {
    const first = await send(artisan,"get_needs",{},"needs_state");
    assert.equal(first.water,100);
    const db = new DatabaseSync(path.join(folder,"economy.sqlite"));
    try { db.prepare("UPDATE needs SET food=60,water=30 WHERE actor=?").run(character("c")); }
    finally { db.close(); }
    const collected = await send(artisan,"collect_water",{requestId:request(1)},"water_collected");
    assert.equal(collected.itemId,"drink_clean_water");
    const inventory = artisan.events.findLast(e=>e.type==="inventory_state").data;
    const slot = inventory.slots.findIndex(item=>item?.itemId==="drink_clean_water");
    const drank = await send(artisan,"use_item",{slot},"item_used",v=>v.itemId==="drink_clean_water");
    assert.equal(drank.healed,0);
    assert.equal(artisan.events.findLast(e=>e.type==="needs_state").data.water,65);
    await pause(360);
    await send(artisan,"enter_home",{},"command_rejected",v=>v.reason==="home_required");
    await mutateHome(2,"buy");
    await send(artisan,"craft_weapon",{requestId:request(8),recipeId:"furniture_kitchen"},"economy_error",v=>v.reason==="home_build_location");
    const entry = await send(artisan,"enter_home",{},"warp_complete");
    assert.match(entry.mapId,/^personal_home_[a-f0-9]{32}$/);
    await until(()=>artisan.me()?.mapId===entry.mapId,"owner reaches separate house map");
    await send(artisan,"craft_weapon",{requestId:request(3),recipeId:"furniture_kitchen"},"craft_result");
    const home = await mutateHome(4,"place",{itemId:"furniture_kitchen",cell:2});
    assert.equal(home.cooking.kitchen,true);
    await pause(360);
    for (let serving=0; serving<5; serving++) {
      await send(artisan,"craft_weapon",{requestId:request(30+serving),recipeId:"food_herbal_fish_soup"},"craft_result");
      await pause(250);
    }
    const planted = await mutateHome(6,"plant",{plot:0});
    assert.equal(planted.cooking.level,2);
    assert.equal(planted.garden[0].readyAt,null);

    const build = JSON.parse(artisan.room.state.worldDefinition).homeMap.buildGrid;
    const cellPoint = cell => ({
      x:build.originX+(cell%8)*build.step, z:build.originZ+Math.floor(cell/8)*build.step,
    });
    const craft = (n,recipeId) => send(artisan,"craft_weapon",{requestId:request(n),recipeId},"craft_result",v=>v.requestId===request(n));
    const plantPart=(n,itemId,cell)=>mutateHome(n,"place_part",{itemId,cell,rotation:0});
    await pause(400);
    await craft(10,"furniture_plank_floor");
    await plantPart(11,"furniture_plank_floor",2);
    await pause(700);
    await craft(12,"furniture_wood_wall");
    await plantPart(13,"furniture_wood_wall",1);
    await pause(700);
    await craft(14,"furniture_doorway");
    const built = await plantPart(15,"furniture_doorway",0);
    assert.equal(built.parts.length,3);
    assert.equal(built.furniture[0].cell,2);
    const wall=cellPoint(1), door=cellPoint(0);
    const distance=point=>Math.hypot(artisan.me().x-point.x,artisan.me().z-point.z);
    artisan.room.send("move",wall);
    await until(()=>distance(wall)<1.25,"approach built wall");
    await pause(450);
    assert(distance(wall)>.34,"the owner cannot enter a wall");
    artisan.room.send("move",door);
    await until(()=>distance(door)<.2,"walk through the doorway");
    await send(artisan,"home_action",{requestId:request(16),action:"remove_part",layer:"structure",cell:0},
      "home_state",v=>v.requestId===request(16));
    await send(artisan,"home_action",{requestId:request(17),action:"move_part",layer:"structure",from:1,cell:0,rotation:1},
      "economy_error",v=>v.reason==="home_wall_blocked");
    await plantPart(18,"furniture_doorway",0);
    console.log("PASS: constructed walls block movement, doorways pass, and wall placement cannot overlap the owner");

    const other = await join("e",artisan.room.roomId);
    await until(()=>!other.room.state.players.has(artisan.room.sessionId),"private owner is hidden from village");
    await send(other,"home_action",{requestId:request(9),action:"buy"},"home_state",v=>v.level===1);
    const otherEntry=await send(other,"enter_home",{},"warp_complete");
    await until(()=>other.me()?.mapId===otherEntry.mapId,"second owner reaches their house");
    assert.notEqual(otherEntry.mapId,entry.mapId);
    assert.equal(other.room.state.players.has(artisan.room.sessionId),false);
    assert.equal(artisan.room.state.players.has(other.room.sessionId),false);
    assert.equal((await send(other,"get_home",{},"home_state")).furniture.length,0);

    await pause(3300); // The second owner just entered and still has a warp cooldown.
    const fighter = await join("d",artisan.room.roomId);
    assert.equal(fighter.me().pathId,"seer");
    assert.equal(fighter.me().mapId,"forbidden_forest");
    const target = await until(()=>fighter.room.state.monsters.get("forest_west_1"),"nearby monster");
    const id = fighter.room.sessionId;
    await send(fighter,"fly",{},"flight_finished",v=>v.playerId===id && v.flying);
    async function expectMeteorDenied() {
      await pause(700); // Rejections share a per-client 500 ms notice limit.
      const from = fighter.events.length;
      const stamina = fighter.me().stamina;
      await send(fighter,"meteor_slam",{},"command_rejected",v=>v.reason==="meteor_leader_required");
      assert.equal(fighter.me().stamina,stamina);
      assert.equal(fighter.me().flying,true);
      assert.equal(fighter.me().combatState,"idle");
      assert(!fighter.events.slice(from).some(e=>e.type==="meteor_impact" && e.data.ownerId===id));
    }
    async function formParty(leader, member) {
      const from = member.events.length, leaderId = leader.room.sessionId;
      await send(leader,"party_invite",{targetId:member.room.sessionId},"party_notice");
      const invite = await until(()=>member.events.slice(from).find(e=>e.type==="party_invitation" && e.data.fromId===leaderId)?.data,"Meteor party invitation");
      await send(member,"party_accept",{inviteId:invite.inviteId},"party_state",v=>v.leaderId===leaderId);
    }
    await expectMeteorDenied();
    await formParty(fighter,other);
    await expectMeteorDenied(); // Party leader without a guild.
    await send(fighter,"party_leave",{},"party_state",v=>v.leaderId===null);
    await send(fighter,"guild_create",{name:"Meteor Guard"},"guild_state",v=>v?.name==="Meteor Guard");
    await formParty(other,fighter);
    await expectMeteorDenied(); // Guild commander who is a regular party member.
    const from = fighter.events.length;
    await send(other,"party_leave",{},"party_state",v=>v.leaderId===null);
    await until(()=>fighter.events.slice(from).some(e=>e.type==="party_state" && e.data.leaderId===id),"Meteor party promotion");
    const impact = await send(fighter,"meteor_slam",{},"meteor_impact",v=>v.ownerId===id);
    assert(impact.targets.includes(target.id));
    assert(fighter.events.some(e=>e.type==="combat_hit" && e.data.source==="meteor" && e.data.targetId===target.id));
    const exit=await send(other,"leave_home",{},"warp_complete");
    assert.equal(exit.mapId,"ritual_village");
    await until(()=>other.me()?.mapId===exit.mapId,"exit returns to village");
    console.log("PASS: private home maps, construction restrictions, cooking, drinking and guild party leader Meteor landing");
  } else {
    const home = await send(artisan,"get_home",{},"home_state");
    assert.equal(home.level,1);
    assert.match(artisan.me().mapId,/^personal_home_[a-f0-9]{32}$/);
    assert.equal(home.furniture[0].itemId,"furniture_kitchen");
    assert.deepEqual(home.parts.map(part=>part.itemId),["furniture_doorway","furniture_wood_wall","furniture_plank_floor"]);
    const grid=JSON.parse(artisan.room.state.worldDefinition).homeMap.buildGrid;
    const target={x:grid.originX+grid.step,z:grid.originZ};
    artisan.room.send("move",target);
    await until(()=>Math.abs(artisan.me().x-target.x)<1.1,"approach the wall loaded from save");
    await pause(450);
    assert(Math.hypot(artisan.me().x-target.x,artisan.me().z-target.z)>.34,"the saved wall still blocks movement");
    assert.equal(home.garden[0].plot,0);
    assert.equal(home.cooking.level,2);
    const needs = await send(artisan,"get_needs",{},"needs_state");
    const saved = new DatabaseSync(path.join(folder,"economy.sqlite"),{readOnly:true});
    try {
      const water = saved.prepare("SELECT water, updated_at FROM needs WHERE actor=?").get(character("c"));
      assert.equal(Math.ceil(water.water),65);
      const elapsed = Math.max(0,needs.serverNow-water.updated_at);
      assert.equal(needs.water,Math.ceil(Math.max(0,water.water-elapsed/120_000)));
    } finally { saved.close(); }
    await artisan.room.leave();
    rooms.splice(rooms.indexOf(artisan.room),1);
    await pause(200);
    const legacy = await join("c",undefined,0);
    assert.equal(legacy.me().mapId,"ritual_village");
    console.log("PASS: owned home position and data survive restart, old clients return safely to the village");
  }
} finally { await Promise.allSettled(rooms.reverse().map(room=>room.leave())); }
