'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
module.exports = function harness(source, options = {}) {
  const log = [], raw = new WeakMap(), ids = new WeakMap(), lights = [], generators = [], listeners = [];
  let operation = 0, vector = 0, color = 0;
  const repr = value => value && (typeof value === 'object' || typeof value === 'function') ? ids.get(value) || (typeof value === 'function' ? '[function]' : '[object]') : value;
  const record = (...entry) => { log.push(entry.map(repr)); if (++operation === options.failAt || options.fail?.(entry)) throw Error('injected operation'); };
  const wrap = (id, target) => {
    const p = new Proxy(target, {
      get(object, key, receiver) { if (typeof key !== 'symbol') record('get', id, key); return Reflect.get(object, key, receiver); },
      set(object, key, value, receiver) { record('set', id, key, value); return Reflect.set(object, key, value, receiver); },
    });
    ids.set(p,id); ids.set(target,id); raw.set(p,target); return p;
  };
  class Vector3 {
    constructor(x,y,z) {
      record('new','Vector3',x,y,z); const value = wrap('v'+(++vector),this);
      Object.assign(this,{x,y,z}); return value;
    }
    set(x,y,z) {record('setVector',this,x,y,z); Object.assign(this,{x,y,z});return this;}
    normalizeToNew() {record('normalize',this);const d=Math.hypot(this.x,this.y,this.z);return new Vector3(this.x/d,this.y/d,this.z/d);}
  }
  class Color3 {
    constructor(r,g,b) {record('new','Color3',r,g,b);Object.assign(this,{r,g,b});return wrap('c'+(++color),this);}
    static FromHexString(hex) {assert.equal(this,Color3);record('hex',hex);if(options.colorThrows)throw Error('color failure'); const c=new Color3(0,0,0); raw.get(c).hex=hex;return c;}
    copyFrom(c) {record('copyColor',this,c);raw.get(this).hex=c.hex;return this;}
  }
  const makeLight = kind => class {
    constructor(name, vector, givenScene) {
      assert.equal(givenScene,scene);record('new',kind,name,vector,givenScene);
      Object.assign(this,{name,position:kind==='DirectionalLight'?null:vector,diffuse:new Color3(1,1,1)});
      if(kind==='DirectionalLight')this.direction=vector;
      const light=wrap(name,this);lights.push(light);if(options.freezeLight===name)Object.freeze(this);return light;
    }
  };
  class ShadowGenerator {
    static QUALITY_LOW = 'QUALITY_LOW';
    constructor(size,light,fullFloat) {
      record('new','ShadowGenerator',size,light,fullFloat);Object.assign(this,{size,light,fullFloat});
      const map=wrap('shadowMap',{refreshRate:options.refreshRate??1,renderList:[]});
      this.getShadowMap=function(){assert.equal(this,generator);record('shadowMap',this);return map;};
      const generator=wrap('shadowGen',this);generators.push(generator);return generator;
    }
  }
  const scene=wrap('scene',{meshes:[],lights,onNewMaterialAddedObservable:wrap('materials',{
    add(callback) {assert.equal(this,raw.get(scene).onNewMaterialAddedObservable);record('listen',this,callback);listeners.push(callback);if(options.materialAtAdd)callback(options.materialAtAdd);},
  })});
  const engine=wrap('engine',{getCaps(){assert.equal(this,engine);record('caps',this);return wrap('caps',{maxTextureSize:options.maxTextureSize??8192});},webGLVersion:options.webGLVersion??2});
  const camera=wrap('camera',{radius:55});
  const B=wrap('B',{Vector3,Color3,HemisphericLight:makeLight('HemisphericLight'),DirectionalLight:makeLight('DirectionalLight'),PointLight:makeLight('PointLight'),ShadowGenerator,Engine:{ALPHA_ADD:'ALPHA_ADD'}});
  const state={activeMapId:'ritual_village',sky:{},mistLayers:[],location:wrap('location',{search:options.search||''})};
  const globals={B,engine,scene,camera};
  const matchMedia=function(query){assert.equal(this,undefined);record('matchMedia',query);return wrap('media',{matches:options.coarse||false});};
  // Keep the URLSearchParams instance's method receiver observable.
  state.URLSearchParams=function(search){record('new','URLSearchParams',search);const p=new URLSearchParams(search);const result=wrap('params',{get(key){assert.equal(this,result);record('param',key);return p.get(key);}});return result;};
  state.matchMedia=matchMedia;
  for(const name of ['activeMapId','sky','mistLayers','location','URLSearchParams','matchMedia'])Object.defineProperty(globals,name,{configurable:true,get(){record('global',name);if(options.tdz===name)throw new ReferenceError(name+' TDZ');return state[name];}});
  const context=vm.createContext(globals);
  const h={log,options,raw,lights,generators,listeners,scene,engine,camera,B,state,context,record,
    operations:()=>operation,
    clearLog(){log.length=0;},
    node(name,position={x:0,y:0,z:0}) {
      const node=wrap(name,{disposed:false,enabled:true,position,
        isDisposed(){assert.equal(this,node);record('disposed',name);return this.disposed;},
        getAbsolutePosition(){assert.equal(this,node);record('absolute',name);return this.position;},
        isEnabled(){assert.equal(this,node);record('enabled',name);return this.enabled;},
      });return node;
    },
    mesh(name,properties={}) {
      const mesh=wrap(name,{name,material:{},metadata:{},visibility:1,
        getBoundingInfo(){assert.equal(this,mesh);record('bounds',name);return {boundingBox:{maximumWorld:{y:1},minimumWorld:{y:0}}};},...properties});return mesh;
    },
    pool(){return lights.slice(3);},
    map(){return raw.get(generators[0]).getShadowMap.call(generators[0]);},
    snapshot(){return {lights:lights.map(l=>{const p=raw.get(l);return {name:p.name,intensity:p.intensity,range:p.range,shadowEnabled:p.shadowEnabled,spot:p.metadata?.spot?{x:p.metadata.spot.x,y:p.metadata.spot.y,z:p.metadata.spot.z,map:p.metadata.spot.map}:null};}),listeners:listeners.length};},
  };
  try {h.api=vm.runInContext('"use strict";\n'+source,context);}catch(error){h.initError=error;}
  return h;
};
