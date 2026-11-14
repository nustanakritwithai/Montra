import test from "node:test";
import assert from "node:assert/strict";
import {parseGuideQuestion,fallbackGuideSelection,selectGuideIntent,GuideGate} from "./TyphoonGuide.js";
import {guideAnswer,type GuideContext} from "./GuideAnswers.js";
import {questChoices,questAdvice,preferredQuestId} from "./QuestAdvisor.js";
import {FOREST_OBJECTIVES,objectiveAvailable,objectiveRanger} from "./ForestObjectives.js";

const sites=[{id:"moon_pass",name:"ด่านจันทรา"},{id:"tri_wiang_castle",name:"มหาปราสาทไตรเวียง"}];
test("questions are bounded and use only declared NPC fields",()=>{
  assert.deepEqual(parseGuideQuestion({npcId:"moon_pass_strategy",question:"  ด่านนี้   เปิดไหม  ",requestId:1}),{npcId:"moon_pass_strategy",question:"ด่านนี้ เปิดไหม",requestId:1});
  assert.equal(parseGuideQuestion({npcId:"x",question:"ก".repeat(181),requestId:1}),null);
  assert.equal(parseGuideQuestion({npcId:"x",question:"<script>",requestId:1}),null);
  assert.equal(parseGuideQuestion({npcId:"x",question:"สงคราม",requestId:1,bonus:999}),null);
});
test("Typhoon chooses only a known intent and map, with a local fallback",async()=>{
  const config={key:"unit-key",endpoint:"https://api.opentyphoon.ai/v1/chat/completions",model:"test-model"};
  const good=(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"intent":"war","siteId":"moon_pass"}'}}]}),{status:200})) as typeof fetch;
  assert.deepEqual(await selectGuideIntent("ด่านนี้เปิดไหม",sites,{config,fetcher:good,currentMapId:"moon_pass"}),{intent:"war",siteId:"moon_pass",source:"typhoon"});
  const invalid=(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"intent":"war","siteId":"invented"}'}}]}),{status:200})) as typeof fetch;
  assert.deepEqual(await selectGuideIntent("ไตรเวียงเปิดเมื่อไหร่",sites,{config,fetcher:invalid}),{intent:"war",siteId:"tri_wiang_castle",source:"rules"});
  const wrong=(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"intent":"event","siteId":"moon_pass"}'}}]}),{status:200})) as typeof fetch;
  assert.deepEqual(await selectGuideIntent("ด่านนี้เปิดตีไหม",sites,{config,fetcher:wrong,currentMapId:"moon_pass"}),{intent:"war",siteId:"moon_pass",source:"rules"});
  assert.equal(fallbackGuideSelection("เก็บเลเวลที่ไหน",sites).intent,"leveling");
});
test("answers use the server's live war deadline and never predict a fixed end after a battle",()=>{
  const now=Date.UTC(2026,10,4,4,0),context:GuideContext={mapName:"ด่านจันทรา",level:5,pathName:"ผู้ร่ายเวท",rebirthCount:0,guildName:null,
    wars:[{id:"moon_pass",name:"ด่านจันทรา",phase:"protected",owner:"กิลด์ทดสอบ",phaseEndsAt:now+2_700_000}],event:null,localTasks:[]};
  const answer=guideAnswer({intent:"war",siteId:"moon_pass",source:"typhoon"},context,now);
  assert.match(answer,/เหลือ 45 นาที 0 วินาที/);assert.match(answer,/กิลด์ทดสอบ/);
  context.wars[0]={...context.wars[0],phase:"battle"};
  assert.match(guideAnswer({intent:"war",siteId:"moon_pass",source:"rules"},context,now),/อาจจบก่อนกำหนด/);
  assert.match(guideAnswer({intent:"war",siteId:"moon_pass",source:"rules"},context,now),/คุ้มครอง 1 ชั่วโมง/);
  assert.match(guideAnswer({intent:"war",source:"rules"},context,now),/คุ้มครอง 1 ชั่วโมง/);
});
test("concurrent and repeated requests are bounded per character",()=>{
  const gate=new GuideGate(12_000,2);assert.equal(gate.begin("a",0),"ok");assert.equal(gate.begin("a",1),"busy");
  assert.equal(gate.begin("b",1),"ok");assert.equal(gate.begin("c",1),"busy");gate.end("a");
  assert.equal(gate.begin("a",11_999),"cooldown");assert.equal(gate.begin("a",12_000),"ok");
});
test("quest suggestions are reachable, available and keep the existing quest first",()=>{
  const choices=questChoices("forbidden_forest",4);assert.ok(choices.length>0);
  for(const choice of choices){assert.ok(objectiveAvailable(choice.id));assert.ok(objectiveRanger(choice.mapId));assert.ok(FOREST_OBJECTIVES[choice.id]);}
  assert.match(questAdvice("forbidden_forest",4,null,choices[0].id),new RegExp(choices[0].name));
  assert.match(questAdvice("forbidden_forest",4,{id:"west",progress:2}),/2\/8/);
  assert.match(questAdvice("forbidden_forest",100,null),/Lv\.100/);
  assert.equal(questChoices("unknown_map",4).length,0);
  assert.equal(fallbackGuideSelection("แนะนำภารกิจส่งเสบียง",sites).intent,"quest");
  const escort=choices.find(c=>c.kind==="escort");if(escort)assert.equal(preferredQuestId("แนะนำภารกิจคุ้มกัน",choices),escort.id);
});
test("Typhoon can only choose a server-approved quest",async()=>{
  const choices=questChoices("forbidden_forest",4),config={key:"unit-key",endpoint:"https://api.opentyphoon.ai/v1/chat/completions",model:"test-model"};
  assert.ok(choices.length>0);
  const good=(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:"quest",questId:choices[0].id})}}]}))) as typeof fetch;
  const result=await selectGuideIntent("แนะนำภารกิจ",sites,{config,fetcher:good,quests:choices});assert.equal(result.questId,choices[0].id);
  const bad=(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"intent":"quest","questId":"invented"}'}}]}))) as typeof fetch;
  assert.deepEqual(await selectGuideIntent("แนะนำภารกิจ",sites,{config,fetcher:bad,quests:choices}),{intent:"quest",source:"rules"});
});
