// Pure terrain sampling and path smoothing. No world, scene, storage or network state.
// Classic-script module: preserve the original arithmetic and input behavior.
"use strict";
globalThis.MontraWorldMath = (() => {
  function terrainCell(cuts,v){
    const i=cuts.findIndex(n=>n>v);
    return i<0?cuts.length-2:Math.max(0,i-1);
  }
  function terrainHeight(t,x,z){
    x=Math.max(t.xs[0],Math.min(t.xs.at(-1),x));z=Math.max(t.zs[0],Math.min(t.zs.at(-1),z));
    const i=terrainCell(t.xs,x),j=terrainCell(t.zs,z);
    const u=(x-t.xs[i])/(t.xs[i+1]-t.xs[i]),v=(z-t.zs[j])/(t.zs[j+1]-t.zs[j]);
    const a=t.heights[j][i],b=t.heights[j][i+1],c=t.heights[j+1][i],d=t.heights[j+1][i+1];
    return a+(u>=v?(b-a)*u+(d-b)*v:(d-c)*u+(c-a)*v);
  }
  function smoothPath(points, iterations = 3) {
    let p = points.map(q => ({ x: q.x, z: q.z }));
    for (let it = 0; it < iterations; it++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push({ x: a.x * .75 + b.x * .25, z: a.z * .75 + b.z * .25 }, { x: a.x * .25 + b.x * .75, z: a.z * .25 + b.z * .75 });
      }
      out.push(p[p.length - 1]); p = out;
    }
    return p;
  }
  return Object.freeze({ terrainCell, terrainHeight, smoothPath });
})();
