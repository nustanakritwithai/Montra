// Run with Babylon.js in NODE_PATH, as for authoritative-boss-model-runtime.cjs.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const B = require("babylonjs");
const {read,section} = require("./authoritative-boss-model-fixture.cjs");

class Canvas {
  constructor(width=128,height=128) { this.width=width; this.height=height; this.style={}; }
  getContext() {
    const gradient=()=>({addColorStop(){}});
    return new Proxy({
      canvas:this,createLinearGradient:gradient,createRadialGradient:gradient,
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      getImageData:()=>({data:new Uint8ClampedArray(this.width*this.height*4)}),
      measureText:()=>({width:10}),
    },{get:(value,key)=>key in value?value[key]:()=>{}});
  }
}
const portal=(id,targetMapId,x)=>({id,targetMapId,x,z:18,groundY:0});
const map=(id,portals)=>({
  id,name:id,portals,bounds:{minX:-45,maxX:45,minZ:-50,maxZ:50},
  paths:[],walls:[],obstacles:[],camps:[],restAreas:[],
});
const maps={
  ritual_village:map("ritual_village",[portal("village_to_forest","forbidden_forest",-10),portal("village_to_temple","bound_temple",14)]),
  forbidden_forest:map("forbidden_forest",[portal("forest_to_village","ritual_village",0),portal("forest_to_temple","bound_temple",14)]),
  bound_temple:map("bound_temple",[portal("temple_to_village","ritual_village",0)]),
  lotus_basin:map("lotus_basin",[portal("lotus_to_village","ritual_village",0)]),
};
const state={worldDefinition:JSON.stringify({version:1,maps})};
const clientSources=[
  "render/006-materials-atmosphere.js","world/011-roads-and-wards.js","world/013-ground-and-fortification.js",
  "world/014-ritual-village.js","world/015-forest-gates-and-services.js","world/016-forest-and-temple.js",
  "world/017-region-terrain.js","world/018-region-dressing.js","world/019-state-and-portals.js",
];

test("revisiting maps releases old scenery and keeps the shared gate texture",()=>{
  const originalCanvas=global.OffscreenCanvas;
  global.OffscreenCanvas=Canvas;
  const engine=new B.NullEngine();
  try {
    const scene=new B.Scene(engine);
    const camera=new B.ArcRotateCamera("test camera",1,1,55,B.Vector3.Zero(),scene);
    const motes=new B.ParticleSystem("shared atmosphere",12,scene);
    const texture=new B.DynamicTexture("shared atmosphere texture",16,scene);
    motes.particleTexture=texture;
    const noop=()=>{},element={classList:{remove:noop},querySelector:()=>({}),addEventListener:noop};
    const context={
      B,scene,camera,motes,state,performance,LITE:true,activeMapId:"ritual_village",mode:"demo",room:null,
      document:{createElement:()=>new Canvas()},window:{},ui:{},$:()=>element,sceneryPoint:noop,
      moon:{},keyLight:{},warm:{},mistLayers:[],sky:null,glowMats:new Set(),
      atmosphere:{ground:"#2a2a22"},attachNpcAvatar:noop,
      syncQuestRanger:noop,syncWarQuartermaster:noop,clearCombatVfx:noop,setTargetedSkill:noop,
      clearChatHistory:noop,applyAtmosphere:noop,renderForestObjectiveHud:noop,warmMaterials:noop,
      currentCityTradePin:noop,resetCombatFeatures:noop,requestWarBanner:noop,isPrivateHomeMap:()=>false,
      setTimeout:noop,clearTimeout:noop,warpPending:false,warpTimer:null,spellTargetId:null,
      territoryState:null,lanternPick:0,marker:{setEnabled:noop},
    };
    const lights=section(read("src/client/render/004-scene-camera-lights.js"),"  const LANTERN_POOL","  const lanternLights");
    const source=[lights,...clientSources.map(file=>read("src/client/"+file))].join("\n");
    // Keep Babylon and its mesh builders in one JS realm so array type checks work.
    const visit=new Function(...Object.keys(context),source+`
      return mapId=>{
        syncWorldDefinition(state,mapId);
        animatePortals(0,.016);
        return {
          lights:lightSpots.length,
          disposedLods:[...viewLods].filter(entry=>entry.mesh.isDisposed()).length,
          particleSystems:scene.particleSystems.length,
          gateLabels:scene.textures.filter(texture=>texture.name.startsWith("portal-label-")).length,
        };
      };`)(...Object.values(context));

    const route=["ritual_village","forbidden_forest","bound_temple","lotus_basin"];
    const baseline=new Map(route.map(id=>[id,visit(id)]));
    for(let repeat=0;repeat<3;repeat++){
      for(const id of route){
        const actual=visit(id);
        assert.deepEqual(actual,baseline.get(id),id+" retains resources after a visit");
        assert.equal(actual.disposedLods,0,id+" holds disposed geometry in its LOD registry");
        assert.ok(scene.textures.includes(texture),id+" lost the shared atmosphere texture");
      }
    }
    assert.equal(scene.textures.some(texture=>texture.name.endsWith(" terrain grain")),false);
  } finally {
    engine.dispose();
    if(originalCanvas===undefined)delete global.OffscreenCanvas;
    else global.OffscreenCanvas=originalCanvas;
  }
});
