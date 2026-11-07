const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('main.js','utf8')+'\n'+fs.readFileSync('src/client-modules/pointer-gestures.js','utf8');
const start=source.indexOf('  const CAMERA_ZOOM_MIN ='),end=source.indexOf('  const lightingController =',start);assert(start>=0&&end>start);
class Vector3{constructor(x,y,z){Object.assign(this,{x,y,z});}}
class ArcRotateCamera{constructor(name,alpha,beta,radius,target){Object.assign(this,{name,alpha,beta,radius,target});}}
const {camera,setCameraZoom}=vm.runInNewContext(source.slice(start,end)+'\n({camera,setCameraZoom})',{B:{Vector3,ArcRotateCamera},scene:{}});
assert.equal(camera.radius,55);assert.equal(camera.beta,.70);assert.equal(camera.alpha,Math.PI/2);assert.equal(camera.lowerRadiusLimit,15);assert.equal(camera.upperRadiusLimit,85);
for(const [input,want]of[[-10,15],[100,85],[42,42],[NaN,42],[Infinity,42]]){setCameraZoom(input);assert.equal(camera.radius,want);}
const followStart=source.indexOf('      const follow = 1 - Math.exp(-dt * 3.8);'),followEnd=source.indexOf('\n    }',followStart);assert(followStart>=0&&followEnd>followStart);
camera.alpha=.9;camera.beta=1.1;vm.runInNewContext(source.slice(followStart,followEnd),{camera,me:{x:12,y:3,z:8},dt:.1});
assert(camera.target.x>0&&camera.target.y>0&&camera.target.z>0);assert.equal(camera.radius,42);assert.equal(camera.alpha,.9);assert.equal(camera.beta,1.1);
assert.match(source,/setCameraZoom\(pinchStart.radius \* pinchStart.separation \/ separation\)/);assert.match(source,/setCameraZoom\(camera.radius \+ Math.sign\(e.deltaY\) \* 2\)/);
console.log('Camera default, zoom limits, controls and follow preservation passed');
