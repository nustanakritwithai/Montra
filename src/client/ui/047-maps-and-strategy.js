  // Inked night-map style shared by the minimap and the full map drawer.
  const MAP_THEMES = {
    ritual_village: { inner: "#1d2b2e", outer: "#080f12", land: "#2a3328", ink: "#e2c487", grid: "rgba(226,196,135,.06)" },
    forbidden_forest: { inner: "#1b2a22", outer: "#07100c", land: "#22301f", ink: "#cfe0a0", grid: "rgba(207,224,160,.06)" },
    bound_temple: { inner: "#2c1f1d", outer: "#0f0909", land: "#30241f", ink: "#f0c58c", grid: "rgba(240,197,140,.06)" },
  };
  // Night-map theme derived from an atlas region's palette.
  function shadeHex(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = v => Math.round(Math.min(255, v * f)).toString(16).padStart(2, "0");
    return "#" + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }
  function mapTheme(id) {
    if (MAP_THEMES[id]) return MAP_THEMES[id];
    const colors = regionStyles[id];
    if (!colors) return MAP_THEMES.ritual_village;
    return (MAP_THEMES[id] = { inner: shadeHex(colors[0], .42), outer: shadeHex(colors[0], .14), land: shadeHex(colors[0], .5),
      ink: colors[4], grid: "rgba(255,240,210,.06)", road: shadeHex(colors[1], .62), court: shadeHex(colors[2], .55), water: shadeHex(colors[5], .7), stone: shadeHex(colors[3], .8) });
  }
  const mapGrains = {};
  function mapGrain(mapId) {
    if (mapId in mapGrains) return mapGrains[mapId];
    if (mapId === "ritual_village") return (mapGrains[mapId] = null);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 48;
    const c = canvas.getContext("2d");
    for (let i = 0; i < 70; i++) {
      c.fillStyle = mapId === "bound_temple" ? (i % 2 ? "rgba(255,230,200,.08)" : "rgba(0,0,0,.18)") : (i % 2 ? "rgba(140,190,120,.12)" : "rgba(0,0,0,.2)");
      c.beginPath(); c.arc(noise(i, 171) * 48, noise(i, 172) * 48, .6 + noise(i, 173) * 1.6, 0, Math.PI * 2); c.fill();
    }
    if (mapId === "bound_temple") { c.strokeStyle = "rgba(0,0,0,.18)"; c.strokeRect(0, 0, 24, 12); c.strokeRect(12, 12, 24, 12); c.strokeRect(24, 24, 24, 12); }
    return (mapGrains[mapId] = canvas);
  }
  function mapText(ctx, text, x, y, size, color, weight = 600) {
    ctx.font = `${weight} ${size}px system-ui, "Noto Sans Thai", sans-serif`;
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * .32); ctx.strokeStyle = "rgba(6,8,8,.88)"; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function mapDot(ctx, x, y, r, fill, stroke = "rgba(5,6,6,.85)", glowColor) {
    if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = r * 2.5; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, r * .35); ctx.strokeStyle = stroke; ctx.stroke();
  }
  function huntRoute(map){return map?.huntTrail ?? map?.strategic?.huntTrail;}
  // Paint the static relief once; both map canvases update player markers several times a second.
  const terrainTints=new WeakMap();
  const terrainPalette=[[-6,30,53,69],[0,52,78,64],[3,88,104,76],[6,144,141,105],[12,177,161,121],[18,208,192,149]];
  function paintHeightPixel(data,k,h,shade){
    let hi=1;while(hi<terrainPalette.length-1 && h>terrainPalette[hi][0])hi++;
    const lo=terrainPalette[hi-1],up=terrainPalette[hi],mix=Math.max(0,Math.min(1,(h-lo[0])/(up[0]-lo[0])));
    for(let i=1;i<=3;i++)data[k++]=(lo[i]+mix*(up[i]-lo[i]))*shade;
    data[k]=255;
  }
  function showTerrainScale(t,canvas){
    let min=Infinity,max=-Infinity;
    for(const row of t.heights){min=Math.min(min,...row);max=Math.max(max,...row);}
    if(max<=min)return;
    const scale=document.createElement("div"),bar=document.createElement("i");
    scale.className="terrain-scale";bar.setAttribute("aria-hidden","true");
    const levels=[min,...terrainPalette.map(p=>p[0]).filter(h=>h>min && h<max),max];
    bar.style.background="linear-gradient(to right,"+levels.map(h=>{
      const rgb=new Uint8ClampedArray(4);paintHeightPixel(rgb,0,h,1);
      return "rgb("+rgb[0]+","+rgb[1]+","+rgb[2]+") "+((h-min)*100/(max-min))+"%";
    }).join(",")+")";
    scale.append("พื้นต่ำ "+Number(min.toFixed(1))+" ม.",bar,"พื้นสูง "+Number(max.toFixed(1))+" ม.");
    canvas.after(scale);
  }
  function terrainTint(t){
    let canvas=terrainTints.get(t);if(canvas)return canvas;
    canvas=document.createElement("canvas");canvas.width=384;canvas.height=320;
    const ink=canvas.getContext("2d"),pixels=ink.createImageData(canvas.width,canvas.height);
    // Use the same diagonal as the walkable mesh. Precompute column and row coordinates once per map.
    function samples(cuts,size){
      let cell=0;
      return Array.from({length:size},(_,i)=>{
        const coord=cuts[0]+(i+.5)/size*(cuts.at(-1)-cuts[0]);
        while(cell<cuts.length-2 && coord>cuts[cell+1])cell++;
        const span=cuts[cell+1]-cuts[cell];
        return {cell,fraction:(coord-cuts[cell])/span,span};
      });
    }
    const cols=samples(t.xs,canvas.width),rows=samples(t.zs,canvas.height);
    let k=0;
    for(const row of rows){
      const top=t.heights[row.cell],bottom=t.heights[row.cell+1];
      for(const col of cols){
        const i=col.cell,a=top[i],b=top[i+1],c=bottom[i],d=bottom[i+1],upper=col.fraction>=row.fraction;
        const dx=upper?b-a:d-c,dz=upper?d-b:c-a;
        const h=a+dx*col.fraction+dz*row.fraction;
        const shade=Math.max(.82,Math.min(1.18,1+.18*(dx/col.span+dz/row.span)));
        paintHeightPixel(pixels.data,k,h,shade);k+=4;
      }
    }
    ink.putImageData(pixels,0,0);
    terrainTints.set(t,canvas);return canvas;
  }
  const mapWaterPaths=new WeakMap();
  function drawMapWater(ctx,map,x,z,scale) {
    let path=mapWaterPaths.get(map);
    if(!path){
      path=new Path2D();
      for(const polygon of waterSurfacePolygons(map)){
        path.moveTo(polygon[0][0],polygon[0][1]);
        for(let i=1;i<polygon.length;i++)path.lineTo(polygon[i][0],polygon[i][1]);
        path.closePath();
      }
      mapWaterPaths.set(map,path);
    }
    ctx.save();
    ctx.translate(x,z);ctx.scale(scale,scale);
    ctx.fillStyle="#32645f";ctx.fill(path);
    ctx.restore();
  }
  function drawMap(ctx,width,height,large=false) {
    const theme = mapTheme(activeMapId);
    const map = worldDefinitions?.[activeMapId];
    const bounds = mapBounds(), pad = large ? 14 : 8;
    const scale = Math.min((width - pad * 2) / (bounds.maxX - bounds.minX), (height - pad * 2) / (bounds.maxZ - bounds.minZ));
    const sx = x => width / 2 + (x - (bounds.minX + bounds.maxX) / 2) * scale;
    const sy = z => height / 2 + (z - (bounds.minZ + bounds.maxZ) / 2) * scale;
    const u = large ? 1 : .62; // symbol size unit
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * .7);
    bg.addColorStop(0, theme.inner); bg.addColorStop(1, theme.outer);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    // Playable area as a soft plate with a fine survey grid.
    const left = sx(bounds.minX), top = sy(bounds.minZ), w = (bounds.maxX - bounds.minX) * scale, h = (bounds.maxZ - bounds.minZ) * scale;
    ctx.fillStyle = theme.land; ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 12;
    ctx.fillRect(left, top, w, h); ctx.shadowBlur = 0;
    if(map?.terrain){
      ctx.drawImage(terrainTint(map.terrain),left,top,w,h);
      if(large && map.id==="twin_neck_pass")for(const [x,z,label] of [[157,100,"เชิงเขา 0 ม."],[156,2,"ลานกลาง 3 ม."],[156,-95,"สันสูง 6 ม."]])
        mapText(ctx,label,sx(x),sy(z),11,"#ffedbd");
    }
    const grain = mapGrain(activeMapId);
    if (grain) { ctx.globalAlpha = .55; ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(left, top, w, h); ctx.globalAlpha = 1; }
    if (activeMapId === "forbidden_forest") {
      // Canopy crowding the map rim.
      for (let i = 0; i < 64; i++) {
        const t = i / 64, r = (5 + noise(i, 161) * 6) * scale, e = noise(i, 162) * 3 * scale;
        const [x, y] = t < .25 ? [left + w * t * 4, top - e] : t < .5 ? [left + w + e, top + h * (t - .25) * 4] : t < .75 ? [left + w * (1 - (t - .5) * 4), top + h + e] : [left - e, top + h * (1 - (t - .75) * 4)];
        ctx.fillStyle = i % 2 ? "#14261a" : "#1b3322"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (large) {
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.beginPath();
      const step = (bounds.maxX - bounds.minX) > 60 ? 20 : 5;
      for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.maxX; x += step) { ctx.moveTo(sx(x), top); ctx.lineTo(sx(x), top + h); }
      for (let z = Math.ceil(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) { ctx.moveTo(left, sy(z)); ctx.lineTo(left + w, sy(z)); }
      ctx.stroke();
    }
    const trail = (width_, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = width_; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const path of map?.paths || []) { ctx.beginPath(); (map.id === "ritual_village" || map.strategic || map.huntTrail ? path : smoothPath(path)).forEach((p, i) => i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z))); ctx.stroke(); }
    };
    if(map?.waterLevel!==undefined)drawMapWater(ctx,map,sx(0),sy(0),scale);
    if (activeMapId === "ritual_village") {
      for (const area of map?.waterLevel===undefined ? villageWaters : []) {
        const x0 = Math.max(bounds.minX,area.x), x1 = Math.min(bounds.maxX,area.x+area.width);
        const z0 = Math.max(bounds.minZ,area.z), z1 = Math.min(bounds.maxZ,area.z+area.length);
        const water = ctx.createLinearGradient(sx(x0), 0, sx(x1), 0);
        water.addColorStop(0, "#0e2a3a"); water.addColorStop(.5, "#14384b"); water.addColorStop(1, "#0e2a3a");
        ctx.fillStyle = water; ctx.fillRect(sx(x0), sy(z0), sx(x1)-sx(x0), sy(z1)-sy(z0));
        ctx.strokeStyle = "rgba(150,190,220,.18)"; ctx.lineWidth = 1;
        for (let z = z0 + 2; z < z1; z += 3.4) {
          const mid = (x0 + x1) / 2 + Math.sin(z) * 2;
          ctx.beginPath(); ctx.moveTo(sx(mid - 1.4), sy(z)); ctx.lineTo(sx(mid + 1.4), sy(z)); ctx.stroke();
        }
      }
      if(map?.paths?.length)trail(Math.max(1.5,4*scale),"#8f7a5a");
      for(const bridge of map?.walkBridges||[]){
        ctx.strokeStyle="#e3c486";ctx.lineWidth=Math.max(2,bridge.width*scale);
        ctx.beginPath();ctx.moveTo(sx(bridge.x[0]),sy(bridge.z));ctx.lineTo(sx(bridge.x[3]),sy(bridge.z));ctx.stroke();
        if(large)mapText(ctx,"สะพานตลาด",sx((bridge.x[1]+bridge.x[2])/2),sy(bridge.z)-8,10,"#ffedbd");
      }
      ctx.fillStyle = "#5a3e2b"; ctx.fillRect(sx(-5.55), sy(-18), sx(5.55) - sx(-5.55), sy(18)-sy(-18));
      if (large) {
        ctx.strokeStyle = "rgba(20,12,8,.45)"; ctx.lineWidth = 1; ctx.beginPath();
        for (let z = -18; z <= 18; z += 1.15) { ctx.moveTo(sx(-5.55), sy(z)); ctx.lineTo(sx(5.55), sy(z)); }
        ctx.stroke();
      }
      ctx.strokeStyle = "#2a1c13"; ctx.lineWidth = 1.5 * u; ctx.strokeRect(sx(-5.55), sy(-18), sx(5.55) - sx(-5.55), sy(18)-sy(-18));
      for (const [x, z, size] of [[-10,-13,4],[10,-13,3.5],[-10,-4,3.5],[10,3.4,4.1],[-10,12,3.5],[10,15,3.5]]) {
        const hx = sx(x - size / 2), hy = sy(z - size / 2), hs = size * scale;
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 2 * u;
        ctx.fillStyle = "#6e2c22"; ctx.fillRect(hx, hy, hs, hs);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "#c79a4c"; ctx.lineWidth = 1.2 * u;
        ctx.beginPath(); ctx.moveTo(sx(x), hy); ctx.lineTo(sx(x), hy + hs); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeRect(hx, hy, hs, hs);
      }
      mapDot(ctx, sx(-4.2), sy(-1.5), 3.4 * u, "#e9b95e", "#3a2410", "#ffb04a");
      for (const [x, z] of [[-6.1,-18],[6.1,-18],[-6.1,-9.6],[6.1,-9.6],[-6.1,-1.2],[6.1,-1.2],[-6.1,7.2],[6.1,7.2],[-6.1,15.6],[6.1,15.6]])
        if (large) mapDot(ctx, sx(x), sy(z), 1.6, "#ffcf7a", "rgba(0,0,0,0)", "#ff9d3a");
      if (fortRoot.isEnabled()) {
        ctx.strokeStyle = "#cdb48a"; ctx.lineWidth = large ? 5 : 3; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx(activeFort.x), sy(activeFort.z - activeFort.length / 2));
        ctx.lineTo(sx(activeFort.x), sy(activeFort.z + activeFort.length / 2));
        ctx.stroke(); ctx.lineCap = "butt";
        mapDot(ctx, sx(activeFort.ladderFootX), sy(activeFort.ladderFootZ), large ? 4 : 2.4, "#f1dda0");
      }
      mapDot(ctx, sx(1.1), sy(10.4), large ? 5.5 : 3, "#e15855", "#3a0d0d", "#ff4a3a");
    } else {
      if (activeMapId === "forbidden_forest") { ctx.fillStyle = "#4a3f2e"; ctx.fillRect(sx(-2.5), sy(-20), 5 * scale, 40 * scale); }
      for (const pool of map?.waterLevel===undefined ? map?.water||[] : []) {
        ctx.fillStyle = theme.water || "#14384b"; ctx.fillRect(sx(pool.x), sy(pool.z), pool.width * scale, pool.length * scale);
        ctx.strokeStyle = "rgba(170,210,230,.2)"; ctx.lineWidth = 1;
        for (let z = pool.z + 1.5; z < pool.z + pool.length; z += 3) { const x = pool.x + pool.width * noise(z, 177); ctx.beginPath(); ctx.moveTo(sx(x), sy(z)); ctx.lineTo(sx(x + 2.5), sy(z)); ctx.stroke(); }
      }
      trail(Math.max(3, 5.5 * scale), "rgba(10,8,6,.55)");
      trail(Math.max(2, 4 * scale), theme.road || (activeMapId === "bound_temple" ? "#8a7552" : "#7a6546"));
      const hunt=huntRoute(map);
      if(hunt && trackedHuntMap===activeMapId){
        ctx.save();ctx.strokeStyle="#ffdc83";ctx.lineWidth=large?2.6:1.5;ctx.setLineDash(large?[6,3]:[3,2]);ctx.beginPath();
        map.paths[hunt.path].forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.z)):ctx.moveTo(sx(p.x),sy(p.z)));ctx.stroke();ctx.restore();
      }
      const rail=map?.paths?.[map.strategic?.railPath];
      if(large && rail){
        ctx.save();ctx.strokeStyle="#d0c5a9";ctx.lineWidth=1.4;ctx.setLineDash([4,3]);ctx.beginPath();
        rail.forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.z)):ctx.moveTo(sx(p.x),sy(p.z)));ctx.stroke();ctx.restore();
      }
      for (const index of map?.strategic?.safeRoads || []) {
        ctx.strokeStyle = "#71d7b4"; ctx.lineWidth = Math.max(1, 1.5 * scale); ctx.beginPath();
        map.paths[index].forEach((p,i)=>i ? ctx.lineTo(sx(p.x),sy(p.z)) : ctx.moveTo(sx(p.x),sy(p.z)));
        ctx.stroke();
      }
      for (const camp of map?.camps || []) {
        const soil = campLooks[camp.id]?.soil || theme.court || "#7d6f63";
        if (activeMapId === "bound_temple") {
          ctx.fillStyle = "#6e6152"; ctx.fillRect(sx(camp.x - 10.5), sy(camp.z - 9.5), 21 * scale, 19 * scale);
          ctx.strokeStyle = "rgba(240,197,140,.55)"; ctx.lineWidth = 1.2 * u; ctx.strokeRect(sx(camp.x - 10.5), sy(camp.z - 9.5), 21 * scale, 19 * scale);
        } else {
          const g = ctx.createRadialGradient(sx(camp.x), sy(camp.z), 0, sx(camp.x), sy(camp.z), 12 * scale);
          g.addColorStop(0, soil); g.addColorStop(1, "rgba(30,35,25,.35)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx(camp.x), sy(camp.z), 12 * scale, 0, Math.PI * 2); ctx.fill();
          ctx.setLineDash([4 * u, 3 * u]); ctx.strokeStyle = "rgba(255,230,170,.45)"; ctx.lineWidth = 1.2 * u; ctx.stroke(); ctx.setLineDash([]);
        }
      }
      for (const o of map?.obstacles || []) {
        const x = sx(o.x), y = sy(o.z), r = Math.max(1, o.radius * scale);
        if (activeMapId !== "forbidden_forest") {
          ctx.fillStyle = theme.stone || "#6f6a5e"; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x + r * .25, y + r * .3, r, 0, Math.PI * 2); ctx.fill();
          const g = ctx.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
          g.addColorStop(0, o.id.includes("stone") ? "#8a948c" : "#3f6a46"); g.addColorStop(1, o.id.includes("stone") ? "#4d554f" : "#1f3a26");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (activeMapId === "forbidden_forest") mapDot(ctx, sx(0), sy(-12), 3.4 * u, "#c9b682", "#2b2414");
      for (const wall of map?.walls || []) {
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 2 * u;
        ctx.fillStyle = "#9b5f43"; ctx.fillRect(sx(wall.x), sy(wall.z), Math.max(1.3, scale * wall.width), Math.max(1.3, scale * wall.length));
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = "#e3b878"; ctx.lineWidth = 1; ctx.strokeRect(sx(wall.x), sy(wall.z), Math.max(1.3, scale * wall.width), Math.max(1.3, scale * wall.length));
      }
    }
    for(const bridge of map?.walkBridges || []){
      const [start,,,end]=bridge.x,vertical=bridge.axis==="z";
      const x=vertical?bridge.z-bridge.width/2:start,z=vertical?start:bridge.z-bridge.width/2;
      ctx.fillStyle="#c8a271";
      ctx.fillRect(sx(x),sy(z),(vertical?bridge.width:end-start)*scale,(vertical?end-start:bridge.width)*scale);
    }
    if(map?.blockedInner){
      const b=map.blockedInner,x=sx(b.minX),z=sy(b.minZ),w=sx(b.maxX)-x,h=sy(b.maxZ)-z;
      ctx.fillStyle="rgba(16,20,23,.46)";ctx.fillRect(x,z,w,h);
      ctx.strokeStyle="#d8ae6b";ctx.lineWidth=large?2:1;ctx.strokeRect(x,z,w,h);
    }
    const fogOrigin = getLocalAvatar();
    if (fogOrigin) {
      const x = sx(fogOrigin.x), y = sy(fogOrigin.z);
      const mist = ctx.createRadialGradient(x, y, FIELD_FOG_CLEAR_RADIUS * scale, x, y, FIELD_FOG_RADIUS * scale);
      mist.addColorStop(0, "rgba(13,24,26,0)");
      mist.addColorStop(.5, "rgba(13,24,26,.5)");
      mist.addColorStop(1, "#0d181a");
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, width, height);
    }
    if(resources?.mapId===activeMapId)for(const n of resources.nodes){
      if (!fieldPointVisible(n)) continue;
      const x=sx(n.x),y=sy(n.z),r=large?4:2;
      if(n.kind==="herb"){mapDot(ctx,x,y,r,n.stock?"#f0be72":"#777673","#534927");continue;}
      ctx.fillStyle=!n.stock?"#777673":n.kind==="wood"?"#8fe197":"#d6bfdc";ctx.beginPath();
      ctx.moveTo(x,y-r);ctx.lineTo(x+r,y+(n.kind==="wood"?r:0));
      if(n.kind==="stone")ctx.lineTo(x,y+r);
      ctx.lineTo(x-r,y+(n.kind==="wood"?r:0));ctx.closePath();ctx.fill();
    }
    const castleWar=territoryState?.local?.site===activeMapId && territoryState.local.inField && territoryState.local.phase==="battle"?territoryState.local:null;
    const fieldGates=castleWar?.river?.gates ?? castleWar?.pilot?.gates;
    if(large && fieldGates){
      for(const gate of map.strategic.rampart.gates){
        const state=fieldGates[gate.id],b=gate.box;
        const gx=sx(b.x+b.width/2),gz=sy(b.z+b.length/2);
        ctx.fillStyle=state.closed?"#331c20":"#113831";ctx.fillRect(gx-4,gz-4,8,8);
        ctx.strokeStyle=state.closed?"#ff9984":"#8ce5bf";ctx.lineWidth=1.5;ctx.strokeRect(gx-4,gz-4,8,8);
        if(state.closed){ctx.beginPath();ctx.moveTo(gx-2,gz-2);ctx.lineTo(gx+2,gz+2);ctx.moveTo(gx+2,gz-2);ctx.lineTo(gx-2,gz+2);ctx.stroke();}
      }
    }
    if(castleWar?.river)for(const post of map.strategic.riverCity.posts){
      const status=castleWar.river.posts.find(p=>p.id===post.id),color=status?.contested?"#ffce67":status?.owner==="attack"?"#ff947b":status?.owner==="defend"?"#80dfd7":"#eee3bd";
      ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(post.x),sy(post.z),large?6:3,0,Math.PI*2);ctx.stroke();
    }
    if(large && castleWar?.supply){
      for(const camp of map.strategic.forwardCamps || []){
        const info=castleWar.supply.camps.find(c=>c.id===camp.id),selected=castleWar.supply.selected===camp.id;
        if(info?.status!=="ready" && !selected)continue;
        const x=sx(camp.x),y=sy(camp.z),px=x+(camp.x<0?-12:12),py=y+14;
        ctx.strokeStyle=selected?"#ffe8a8":"#9be2c2";ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(px,py);ctx.lineTo(px,py-10);ctx.stroke();
        ctx.fillStyle=info?.status==="ready"?"#66c797":"#cf8274";
        ctx.beginPath();ctx.moveTo(px,py-10);ctx.lineTo(px+7,py-7);ctx.lineTo(px,py-4);ctx.closePath();ctx.fill();ctx.stroke();
      }
    }
    for(const obj of map?.strategic?.objectives || []){
      const active=map.strategic.activeObjectives.includes(obj.id),point=territoryState?.local?.pilot?.points.find(p=>p.id===obj.id);
      if(castleWar?.supply?.drums.includes(obj.id)){
        ctx.strokeStyle="#ffb283";ctx.lineWidth=large?2.5:1.5;ctx.beginPath();
        ctx.arc(sx(obj.x),sy(obj.z),large?12:4.8,0,2*Math.PI);ctx.stroke();
      }
      const locked=obj.id===7 && castleWar?.seconds>900;
      const color=point?.owner==="attack"?"#ff917d":point?.owner==="defend"?"#80e8db":locked?"#858b9c":active?"#ffcf76":"#a5aaa3";
      mapDot(ctx,sx(obj.x),sy(obj.z),large?8:2.5,color,"#122825");
      if(large)mapText(ctx,String(obj.id),sx(obj.x),sy(obj.z)+3,10,"#ffffff");
    }
    const war=territoryState?.local?.site===activeMapId?territoryState.local:null;
    const isolated=war?.civic;
    const relay=(war?.inField || !isolated?.entry ? isolated?.relay : null) || map?.strategic?.relay;
    if(relay){
      const control=territoryState?.local?.relay;
      const color=control?.contested?"#ffb984":control?.side==="attack"?"#ff9181":control?.side==="defend"?"#83dfd2":"#ffe2a1";
      const x=sx(relay.x),y=sy(relay.z);
      ctx.strokeStyle=color;ctx.lineWidth=large?2:1.3;ctx.beginPath();ctx.arc(x,y,large?7:3,0,Math.PI*2);ctx.stroke();
      if(large)mapText(ctx,relay.name,x,y+17,11,color);
    }
    const sites=map?.strategic?.sites || [];
    const flag=war?.inField?isolated?.flag:isolated?.entry || isolated?.flag;
    const landmarks=flag && !sites.some(s=>s.kind==="fort" && s.x===flag.x && s.z===flag.z)?[...sites,flag]:sites;
    for (const site of landmarks) {
      if(map?.strategic?.objectives)continue;
      const major=site.kind==="fort" || site.kind==="palace";
      if(!large && !major)continue;
      const x=sx(site.x),y=sy(site.z);
      mapDot(ctx,x,y,major?5*u:2.8*u,major?"#ffcf76":"#c3e0b1","#263732");
      if(large && site.kind!=="bridge" && (!relay || Math.hypot(site.x-relay.x,site.z-relay.z)>12)){
        const code=Object.entries(map?.strategic?.riverCity?.nodes || {}).find(([,p])=>p.x===site.x && p.z===site.z)?.[0];
        mapText(ctx,code || (relay && site.kind==="fort"?"ธงหลัก":site.name),x,y-7,(code || relay && major)?12:10,major?"#ffe5ab":"#dfebd4");
      }
    }
    for(const [i,s] of (map?.strategic?.rampart?.stairs || []).entries()){
      const x=sx(s.foot.x),y=sy(s.foot.z);mapDot(ctx,x,y,map.strategic.objectives?(large?2.2:1):large?4:2,"#a5ecff");
      if(large && !map.strategic.objectives && !relay)mapText(ctx,(map.strategic.riverCity?"U":"บันได ")+(i+1),x,y-6,10,"#c4f5ff");
    }
    for (const area of map?.restAreas || []) {
      const x = sx(area.x), y = sy(area.z), r = area.radius * scale;
      ctx.fillStyle = "rgba(133,246,221,.1)"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([3 * u, 2.5 * u]); ctx.strokeStyle = "#85f6dd"; ctx.lineWidth = 1.6 * u; ctx.stroke(); ctx.setLineDash([]);
      if(large && huntRoute(map) && trackedHuntMap===activeMapId && map.portals.every(p=>Math.hypot(p.x-area.x,p.z-area.z)>5))
        mapText(ctx,"พัก",x,y+3,11,"#b5ffe5");
    }
    const questNpc=forestObjectiveState?.keeper;
    if(questNpc?.mapId===activeMapId){mapDot(ctx,sx(questNpc.x),sy(questNpc.z),large?5:3,"#ffe08b");if(large)mapText(ctx,"ผู้มอบงาน",sx(questNpc.x),sy(questNpc.z)-10,10,"#ffe8ac");}
    const warBase=territoryState?.local?.site===activeMapId?territoryState.local.cargo?.base:null;
    if(warBase){mapDot(ctx,sx(warBase.x),sy(warBase.z),large?5:3,"#ffca76");if(large)mapText(ctx,"พลเสบียง",sx(warBase.x),sy(warBase.z)-10,10,"#ffe5ad");}
    const activeQuest=forestObjectiveState?.active,defense=activeQuest && forestObjectiveState?.options?.[activeQuest.id];
    if(defense?.kind==="defense" && defense.mapId===activeMapId && defense.defense){mapDot(ctx,sx(defense.defense.x),sy(defense.defense.z),large?6:3.5,"#ff9d69");if(large)mapText(ctx,"ป้องกันเสบียง",sx(defense.defense.x),sy(defense.defense.z)-10,10,"#ffe1c5");}
    if(defense?.kind==="escort" && defense.mapId===activeMapId && defense.escort){mapDot(ctx,sx(defense.escort.x),sy(defense.escort.z),large?6:3.5,"#b4dfff");if(large)mapText(ctx,"จุดหมายผู้เดินทาง",sx(defense.escort.x),sy(defense.escort.z)-10,10,"#d3eaff");}
    for(const npc of map?.serviceNpcs || [])if(Object.hasOwn(serviceNpcUi,npc.role))
      mapDot(ctx,sx(npc.x),sy(npc.z),large?4:2.5,npc.role==="war"?"#ef8277":"#f3c776");
    const drawMonster = m => {
      if (m?.mapId !== activeMapId || !m.alive || !fieldPointVisible(m)) return;
      const x = sx(m.x), y = sy(m.z);
      if (m.tier === "elite" || m.tier === "boss") {
        const r = (large ? 7 : 4) * (m.tier === "boss" ? 1.4 : 1);
        ctx.shadowColor = "#ffcf5a"; ctx.shadowBlur = r * 2;
        ctx.fillStyle = "#ffe084"; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = "#3a2508"; ctx.lineWidth = 1.2; ctx.stroke();
      } else mapDot(ctx, x, y, large ? 3.2 : 1.8, "#f1786c", "rgba(40,6,6,.9)");
    };
    drawMonster(villageMonsterState());
    room?.state?.monsters?.forEach(drawMonster);
    for (const portal of activePortals()) {
      if(portal.targetMapId===activeMapId && map?.strategic?.relay){
        const x=sx(portal.x),y=sy(portal.z),r=large?6:3;
        ctx.fillStyle="#23433e";ctx.strokeStyle="#b1f4df";ctx.lineWidth=1.3;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.strokeRect(x-r,y-r,2*r,2*r);
        if(large)mapText(ctx,map.strategic.relay.effect==="gate"?"รถราง":"เรือ",x,y+18,10,"#c4f5e9");
        continue;
      }
      // Spirit gate glyph: pointed arch over a plinth.
      const x = sx(portal.x), y = sy(portal.z), r = large ? 7.5 : 4.6;
      ctx.beginPath(); ctx.moveTo(x - r * .75, y + r * .8); ctx.lineTo(x - r * .75, y - r * .1);
      ctx.quadraticCurveTo(x - r * .75, y - r * .8, x, y - r * 1.25); ctx.quadraticCurveTo(x + r * .75, y - r * .8, x + r * .75, y - r * .1);
      ctx.lineTo(x + r * .75, y + r * .8); ctx.closePath();
      ctx.shadowColor = "#5fffe0"; ctx.shadowBlur = r * 2;
      ctx.fillStyle = "rgba(95,255,224,.35)"; ctx.fill();
      ctx.strokeStyle = "#c9fff2"; ctx.lineWidth = large ? 2.2 : 1.4; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#e8c06a"; ctx.fillRect(x - r, y + r * .8, r * 2, Math.max(1.5, r * .22));
    }
    if (marker.isEnabled()) {
      const mx = sx(marker.position.x), my = sy(marker.position.z);
      // Dotted guideline from player to destination
      const me = avatars.get(localId);
      if (me && Number.isFinite(me.x) && Number.isFinite(me.z)) {
        ctx.strokeStyle = "rgba(255, 218, 121, 0.45)";
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sx(me.x), sy(me.z));
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#ffe2a1"; ctx.lineWidth = 1.8; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(mx, my, large ? 7 : 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // Phase 7: Expanding radar pulse ring on destination
      const radarPhase = (performance.now() * 0.0018) % 1;
      const radarRadius = (large ? 7 : 4) + radarPhase * (large ? 18 : 10);
      ctx.strokeStyle = "rgba(255, 226, 161, " + ((1 - radarPhase) * 0.75) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, radarRadius, 0, Math.PI * 2); ctx.stroke();
    }
    for (const [ownerId, npc] of summonAvatars) if (fieldPointVisible(npc)) mapDot(ctx, sx(npc.x), sy(npc.z), large ? 4 : 2.2, ownerId === localId ? "#cb97f1" : "#78d5e2");
    for (const [id, a] of avatars) if (id !== localId && fieldPointVisible(a)) {
      const foe=territoryState?.teams?.[id] && territoryState.teams[id]!==territoryState.local?.side;
      mapDot(ctx,sx(a.x),sy(a.z),large?4.6:2.8,foe?"#ff917d":"#6de5df","rgba(4,24,24,.9)");
    }
    const me = avatars.get(localId);
    if (me) {
      // Heading arrow: avatars face atan2(-dx,-dz), so travel is (-sin, -cos).
      const x = sx(me.x), y = sy(me.z), r = large ? 9 : 6, h = Number(me.heading) || 0;
      // Phase 7: Field-of-view visual exploration cone ahead of player
      ctx.save();
      ctx.translate(x, y); ctx.rotate(-h);
      const coneRadius = large ? 46 : 26;
      const coneGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coneRadius);
      coneGrad.addColorStop(0, "rgba(255, 218, 121, 0.22)");
      coneGrad.addColorStop(0.85, "rgba(255, 218, 121, 0.05)");
      coneGrad.addColorStop(1, "rgba(255, 218, 121, 0)");
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const coneAngle = Math.PI * 0.28;
      ctx.arc(0, 0, coneRadius, -Math.PI / 2 - coneAngle / 2, -Math.PI / 2 + coneAngle / 2);
      ctx.closePath();
      if (!fogOrigin) ctx.fill();
      ctx.restore();

      ctx.translate(x, y); ctx.rotate(-h);
      ctx.shadowColor = "#ffcf6a"; ctx.shadowBlur = r * 1.6;
      ctx.fillStyle = "#ffda79"; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .7, r * .7); ctx.lineTo(0, r * .35); ctx.lineTo(-r * .7, r * .7); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#3a2508"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (large) {
      if (activeMapId === "ritual_village") {
        mapText(ctx, "ศาลพระภูมิ", sx(-4.2), sy(-1.5) - 10, 12, theme.ink);
        mapText(ctx, "เรือนพัก", sx(10), sy(-13) - 22, 12, theme.ink);
        mapText(ctx, "คลองตะวันตก", sx(-15), sy(4), 11, "#9fc3d8", 500);
        mapText(ctx, "คลองตะวันออก", sx(15), sy(-4), 11, "#9fc3d8", 500);
        mapText(ctx, "ท่าน้ำ", sx(0), sy(17.5), 12, theme.ink);
        mapText(ctx, "เขตผีสิง", sx(1.1), sy(10.4) + 18, 12, "#f09a8c");
      }
      for (const camp of map?.camps || []) {
        const lv="Lv "+(camp.levels.length===1?camp.levels[0]:Math.min(...camp.levels)+"–"+Math.max(...camp.levels));
        const ty = activeMapId === "bound_temple" ? sy(camp.z - 9.5) - 4 : sy(camp.z) - 12 * scale - 4;
        const hunt=huntRoute(map);
        const marked=hunt && trackedHuntMap===activeMapId && map.paths[hunt.path].some(p=>p.x===camp.x && p.z===camp.z);
        mapText(ctx,(camp.tier==="strong"?"◆ ":"")+lv,sx(camp.x),ty,12,"#fff0d0");
        if(marked)mapText(ctx,camp.name,sx(camp.x),sy(camp.z)+12*scale+9,11,"#ffdc83");
      }
      if (map?.guardian) mapText(ctx, "◆ ศาล Elite", sx(map.guardian.x), sy(map.guardian.z) - 11, 12, "#ffe095", 700);
      if (map?.boss) {
        ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(255,140,90,.7)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx(map.boss.x), sy(map.boss.z), 7 * scale, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        mapText(ctx, "◆ "+map.boss.name+" Lv."+map.boss.level, sx(map.boss.x), sy(map.boss.z) - 7 * scale - 20, 12, "#ffe5a8", 700);
      }
      for (const portal of activePortals()) {
        if (!portal.targetMapId || portal.targetMapId===activeMapId) continue;
        const dest = worldDefinitions?.[portal.targetMapId], py=sy(portal.z);
        const below=py<30 || ((huntRoute(map) || map?.strategic?.riverCity) && py>height/2 && py+22<height-4);
        mapText(ctx, "ไป" + (dest?.name || portal.targetMapId), Math.max(60, Math.min(width - 60, sx(portal.x))),
          py + (below ? 22 : -12), 12, "#c3faed");
      }
      // Compass rose.
      ctx.translate(width - 24, 26); ctx.fillStyle = theme.ink; ctx.globalAlpha = .85;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(4, 0); ctx.lineTo(0, 13); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
      mapText(ctx, "N", width - 24, 9, 10, theme.ink, 700);
    }
    // Phase 8: Tactical party ping beacon on minimap
    if (activePartyPing && performance.now() < activePartyPing.until) {
      const px = sx(activePartyPing.x), py = sy(activePartyPing.z);
      const pingPhase = ((performance.now() % 1000) / 1000);
      const pingR = (large ? 10 : 6) + pingPhase * (large ? 24 : 14);
      ctx.save();
      ctx.strokeStyle = activePartyPing.type === "help" ? "rgba(255, 68, 68, " + (1 - pingPhase) + ")" : "rgba(255, 215, 0, " + (1 - pingPhase) + ")";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(px, py, pingR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      mapDot(ctx, px, py, large ? 6 : 3.5, activePartyPing.type === "help" ? "#ff3344" : "#ffcc00", "#1a0808");
      mapText(ctx, activePartyPing.type === "help" ? "🆘" : "🚩", px, py + (large ? 4 : 2), large ? 14 : 9, "#ffffff", 800);
    }

    if (!large) {
      // Phase 7: Compact compass indicator for small minimap
      ctx.save();
      ctx.translate(width - 14, 14);
      ctx.fillStyle = "rgba(255, 218, 121, 0.85)";
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(2.5, 0); ctx.lineTo(0, 7); ctx.lineTo(-2.5, 0); ctx.closePath();
      ctx.fill();
      ctx.restore();
      mapText(ctx, "N", width - 14, 5, 8, "#ffe2a1", 700);
    }
    const objective=warObjectiveGuide(me);
    const huntPoint=objective?null:itemHuntGuide()?.to;
    if(huntPoint && Number.isFinite(huntPoint.x) && Number.isFinite(huntPoint.z)){
      const x=sx(huntPoint.x),y=sy(huntPoint.z),radius=large?8:4;
      ctx.strokeStyle="#ffe49a";ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(x,y-radius);ctx.lineTo(x+radius,y);ctx.lineTo(x,y+radius);ctx.lineTo(x-radius,y);ctx.closePath();ctx.stroke();
      if(large)mapText(ctx,"เป้าหมายล่า",x,y+18,11,"#ffe49a",700);
    }
    // Vignette pulls the eye to the centre and softens the edges.
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .35, width / 2, height / 2, Math.max(width, height) * .72);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, width, height);
    const boatDock = room?.state?.boatsAvailable ? map?.boatDock : null;
    if (boatDock) for(const port of map.boatPorts??[{shore:boatDock,name:"ท่าปล่อยเรือ"}]){
      const x = sx(port.shore.x), y = sy(port.shore.z);
      mapDot(ctx, x, y, large ? 8 : 6, "#16475a", "#9ee9ff");
      mapText(ctx, "⚓︎", x, y, large ? 12 : 9, "#e0f8ff", 700);
      if (large) mapText(ctx, port.name, Math.max(45, Math.min(width - 45, x)), y - 15, 12, "#bfefff", 700);
    }
    if(room?.state?.boatsAvailable)for(const gate of map?.waterGates||[]){
      const x=sx(gate.x),z=sy(gate.z),name=worldDefinitions?.[gate.targetMapId]?.name;
      mapDot(ctx,x,z,large?5:3,"#83e7d8","#173f45");
      if(large && name)mapText(ctx,"ล่องไป "+name,Math.max(64,Math.min(width-64,x)),z-10,10,"#bbfff2",700);
    }
    if(objective){
      const x=sx(objective.to.x),y=sy(objective.to.z),radius=large?12:6;
      ctx.strokeStyle="#ffdc84";ctx.lineWidth=large?2:1.5;
      if(me){
        ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(sx(me.x),sy(me.z));ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.stroke();
      mapDot(ctx,x,y,large?4.5:2.5,"#ffe39c","#352811");
      if(large)mapText(ctx,objective.title,Math.max(75,Math.min(width-75,x)),y<34?y+23:y-17,12,"#ffe9ab",800);
    }
    if(large){
      const note=$("warMapObjective");
      if(note){
        note.hidden=!objective;
        const label=objective?objective.title+" · "+objective.step:"";
        if(note.textContent!==label)note.textContent=label;
      }
    }
    ctx.restore();
  }
  // Coordinates set the atlas layout. Connectivity and route advice come from live portal pairs.
  const atlasCells = {
    ritual_village:[89,41], forbidden_forest:[82,125], bound_temple:[61,212],
    drowned_marsh:[189,201], moon_cemetery:[105,301], bamboo_frontier:[210,285],
    mantra_capital:[310,116], moon_pass:[245,391], hex_ridge:[70,429],
    twin_neck_pass:[168,467], naga_cavern:[66,519], river_watch:[193,556], sam_lan_estuary:[326,554], lotus_basin:[318,478],
    fallen_city:[107,637], tri_wiang_castle:[321,635], asura_peak:[222,710], spirit_rift:[112,780]
  };
  const provinceTitle={capital:"เมืองหลวง",territory:"ด่านสงคราม",hunting:"พื้นที่เก็บเลเวล"};
  const warErrors={
    war_schedule_required:"สนามนี้เปิดตามเวลาที่ประกาศ",war_schedule_unavailable:"ยังไม่มีรอบศึกสำหรับพื้นที่นี้",
    war_registration_locked:"รอบนี้ล็อกรายชื่อแล้ว",war_roster_locked:"ตัวละครนี้ไม่อยู่ในรายชื่อที่ล็อกไว้",
    war_roster_size:"รายชื่อเกินจำนวนที่นั่งของฝ่าย",war_roster_member:"รายชื่อมีตัวละครนอกกิลด์",
    war_route_unavailable:"ขบวนนี้ใช้ไม่ได้",war_route_destination:"กิลด์ต้องครองเมืองปลายทางและมีเส้นทางเชื่อม",
    war_route_cooldown:"กิลด์เปิดขบวนใหม่ได้วันละครั้ง",war_route_delivery:"ไปถึงเมืองปลายทางและรออย่างน้อย 30 วินาที",
    war_supply_unavailable:"ส่งเสบียงไม่ได้ในขณะนี้",war_supply_side:"สิทธิฝ่ายรบเปลี่ยนไป",war_supply_cooldown:"รอ 60 วินาทีหลังส่งเสบียงครั้งก่อน",war_supply_base:"กลับไปหาพลเสบียงที่ฐานและพ้นการต่อสู้ก่อน",war_supply_carrying:"กำลังถือเสบียงอยู่",war_supply_missing:"รับเสบียงที่ฐานก่อน",war_supply_destination:"นำเสบียงเดินจากฐานอย่างน้อย 15 เมตรและ 8 วินาทีไปยังจุดยุทธศาสตร์",war_supply_duplicate:"เสบียงชุดนี้ส่งไปแล้ว",war_supply_march:"ถือเสบียงอยู่ ต้องเดินทางไปเอง",war_focus_unchanged:"นโยบายนี้ใช้อยู่แล้ว",
    war_camp_cut:"ส่งกำลังไม่ได้ ตรวจธง ประตู และผู้ท้าชิงในวง",war_camp_base:"เลือกค่ายที่เปิดแล้วยืนที่ฐานรวมพลโดยพ้นการต่อสู้",war_camp_fallback:"ค่ายหน้าใช้ไม่ได้ คุณเกิดที่ฐานรวมพลเดิม",
    war_guild:"ต้องเป็นสมาชิกกิลด์ก่อนเข้าศึก",war_flag:"เดินเข้าวงธงกลางป้อมก่อนเปิดศึก",war_officer:"ให้ผู้บัญชาการหรือนายทหารเปิดศึก",
    war_other_guild:"สนามนี้มีฝ่ายบุกและฝ่ายรับแล้ว",war_side_full:"ผู้เล่นฝ่ายของคุณเต็มแล้ว",war_busy:"รอให้พ้นการต่อสู้และยืนบนพื้นในด่าน",
    war_gate_repair:"ต้องครองโรงช่างและประตูต้องพ้นการโจมตี 5 วินาที",war_gate_near:"ฝ่ายรับต้องยืนที่ประตูด้านใน",war_gate_occupied:"มีผู้เล่นยืนขวางประตู",war_gate_open:"ประตูเปิดอยู่",war_gate_inactive:"ประตูใช้การไม่ได้: พังแล้ว หรือเป็นเมืองร้างที่ประตูเปิดถาวร",
    war_ended:"ศึกนี้จบแล้ว",war_exit:"กลับห้องโลกผ่านหน้าด่านกิลด์",war_unavailable:"ด่านยังเปิดศึกไม่ได้",
    war_not_owner:"เฉพาะกิลด์ผู้ครองด่าน",war_government_role:"ตำแหน่งของคุณทำรายการนี้ไม่ได้",
    war_government_battle:"รอให้ศึกจบก่อนบริหารด่าน",war_government_stale:"บัญชีด่านเปลี่ยนแล้ว ตรวจยอดล่าสุดก่อนทำรายการ",
    war_no_income:"ยังไม่มีรายได้เต็มหน่วยให้เก็บ",war_building_max:"อาคารถึงระดับสูงสุดแล้ว",war_funds:"เงินคลังกิลด์ไม่พอ",
    war_repair_first:"ต้องซ่อมคลังเสบียงก่อนพัฒนาอาคาร",war_no_damage:"คลังเสบียงอยู่ในสภาพพร้อมใช้",war_government_location:"กลับห้องโลกและยืนบนพื้นในด่านที่ครอง"};
  function warGateText(s){
    if(s.river && !s.river.defended)return "เมืองร้าง ประตูเปิดถาวร (ไม่มีผู้ครอง จึงปิดหรือทุบประตูไม่ได้)";
    const defs=worldDefinitions?.[s.site]?.strategic?.rampart?.gates || [];
    const gates=s.river?.gates || s.pilot?.gates || s.gates;
    if(!gates)return "ประตู "+(s.gateHp<=0?"พังแล้ว":s.gateClosed?"ปิด":"เปิด")+" "+s.gateHp+"/120";
    return defs.filter(g=>gates[g.id]).map(g=>{const st=gates[g.id];return (g.name||"ประตู "+g.id)+" "+(st.hp<=0?"พังแล้ว":st.closed?"ปิด":"เปิด")+" "+st.hp+"/120";}).join(" · ");
  }
  const warPhase=p=>({open:"เปิดให้ท้าชิง",battle:"กำลังรบ",protected:"อยู่ในความคุ้มครอง",finished:"จบศึกแล้ว"})[p] || "กำลังตรวจด่าน";
  const warTime=s=>Math.floor(s/60)+" นาที "+s%60+" วินาที";
  let warMusterSite=null;
  function warObjectiveTarget(local,map,position,muster=false){
    if(!local || !map)return null;
    const strategic=map.strategic,river=strategic?.riverCity;
    const flag=local.civic?.flag || strategic?.sites?.find(site=>site.kind==="fort");
    const target=(point,title,radius,step)=>Number.isFinite(point?.x) && Number.isFinite(point.z)
      ?{to:point,title,radius,step}:null;
    if(!local.inField){
      if(!muster || !local.canStart || local.phase!=="open")return null;
      const entry=local.civic?.entry || flag;
      return target(river?.nodes?.A || entry,river?"ค่ายใต้ A · จุดเปิดศึก":"จุดเปิดศึก · "+(entry?.name || map.name),
        5,"เข้าใกล้จุดเปิดศึกบนพื้น แล้วเปิดกระดานศึก");
    }
    if(local.phase!=="battle")return null;
    const nearest=points=>{
      if(!position)return points[0];
      const distance=point=>Math.hypot(point.x-position.x,point.z-position.z);
      return points.reduce((best,point)=>!best || distance(point)<distance(best)?point:best,null);
    };
    if(local.pilot && strategic?.objectives?.length){
      const {pilot,side}=local,throne=pilot.throne,front=throne?.[side];
      if(local.seconds<=900 && front?.outer>=2 && front.middle>=2 && front.route && !throne.victor &&
        (!throne.defended || side==="attack")){
        const point=strategic.objectives.find(point=>point.id===7);
        if(point)return target(point,"7 "+point.name,7,"ยืนบนพื้นในวงบัลลังก์");
      }
      const points=strategic.objectives.filter(point=>point.id<7 && pilot.points.some(state=>state.id===point.id));
      const unheld=points.filter(point=>!pilot.points.some(state=>state.id===point.id && state.owner===side));
      const outer=unheld.filter(point=>point.id<=3);
      const options=throne && local.seconds>2100 && outer.length?outer:unheld.length?unheld:points;
      const point=nearest(options);
      if(point)return target(point,point.id+" "+point.name,7,"ยืนบนพื้นในวงจุดยึด · ดูทางผ่านประตูบนแผนที่");
    }
    if(river && local.river && !local.river.supplied){
      const suppliedPost=local.river.posts.some(post=>post.id!=="F" && post.owner===local.side && !post.contested);
      if(!suppliedPost){
        const post=nearest(river.posts.filter(post=>post.id==="M" || post.id==="S"));
        if(post)return target(post,post.id+" "+post.name,4,"ยึดตลาดหรือคลังเสบียงก่อนชิงลานบัญชาการ");
      }
      const gates=strategic.rampart?.gates || [],states=local.river.gates;
      for(const prefix of ["G1","G2"]){
        const ring=gates.filter(gate=>gate.id.startsWith(prefix) && states?.[gate.id]);
        if(!ring.length || ring.some(gate=>!states[gate.id].closed))continue;
        const gate=nearest(ring.map(({id,name,box})=>({id,name,x:box.x+box.width/2,z:box.z+box.length/2})));
        return target(gate,gate.name || gate.id,3,"เปิดทางผ่านประตูเพื่อให้เสบียงถึงลานบัญชาการ");
      }
    }
    return target(flag,river?"T ลานบัญชาการ":flag?.name || "ธงหลัก",5,"ยืนบนพื้นในวงธงเพื่อยึดจุด");
  }
  function warObjectiveGuide(position){
    const local=territoryState?.local;
    if(warMusterSite!==activeMapId || local?.inField || !local?.canStart || local.phase!=="open")warMusterSite=null;
    if(mode!=="live" || local?.site!==activeMapId)return null;
    return warObjectiveTarget(local,worldDefinitions?.[activeMapId],position,warMusterSite===activeMapId);
  }
  function syncWarQuartermaster(){
    const local=territoryState?.local,base=local?.cargo?.base,visible=Boolean(mode==="live" && local?.inField && local.site===activeMapId && base);
    quartermasterRoot.setEnabled(visible);if(visible)quartermasterRoot.position.set(base.x+1,base.y || 0,base.z);
  }
  const campStatus={ready:"เปิด",contested:"กำลังถูกชิง",cut:"เส้นทางขาด",unheld:"ยังไม่ได้ครอง"};
  function openWarPanel(back){
    openDrawer("war","ศึกชิงเมือง",`<div class="field-command">
      <button class="secondary field-back" id="warBack" type="button" hidden>← ข้อมูลเมือง</button>
      <section class="field-banner" aria-labelledby="warHeading">
        <div class="field-banner-head"><h3 class="gx-with-emblem" data-guild-icon="war" id="warHeading"></h3><span id="warStatus" class="field-status" role="status"></span></div>
        <p id="warOwner"></p>
        <div id="warBattle" class="war-battle" hidden>
          <div class="war-clock"><span class="gx-with-emblem" data-guild-icon="time">เวลาเหลือ</span><strong id="warClock"></strong></div>
          <dl class="field-stats war-sides">
            <div><dt>ฝ่ายบุก</dt><dd id="warAttackName"></dd><dd id="warAttackScore" hidden></dd></div>
            <div><dt>ฝ่ายรับ</dt><dd id="warDefendName"></dd><dd id="warDefendScore" hidden></dd></div>
          </dl>
          <div id="warCapture" hidden><label for="warGauge" id="warCaptureLabel"></label><progress id="warGauge" max="60"></progress></div>
        </div>
        <p id="warHint" class="note" hidden></p>
        <label class="field" id="castleFrontLabel" for="castleFront" hidden>แนวรวมพลครั้งแรก <select id="castleFront"></select></label>
        <button id="warAction" class="primary" type="button" hidden></button>
        <button id="warObjectiveMap" class="secondary gx-with-emblem" data-guild-icon="map" type="button" hidden></button>
        <button id="warAtlasLink" class="secondary gx-with-emblem" data-guild-icon="map" type="button" hidden>แผนที่ยุทธศาสตร์</button>
        <button id="castleRepair" class="secondary" type="button" hidden>ซ่อมประตู +10</button>
      </section>
      <p id="warParticipation" class="field-card" hidden></p>
      <section id="warCargoPanel" class="field-card" hidden><h3 class="gx-with-emblem" data-guild-icon="haul">เสบียงสนามรบ</h3><p id="warCargoStatus" role="status"></p>
        <div class="field-actions"><button id="warCargoPickup" type="button" class="secondary">รับเสบียงที่ฐาน</button><button id="warCargoDeliver" type="button" class="primary">ส่งเสบียงที่จุดยุทธศาสตร์</button></div></section>
      <details id="castleSupply" class="field-card" hidden><summary id="supplyTitle">ค่ายหน้า</summary><p id="campHelp"></p>
        <label class="field" for="respawnCamp">เกิดครั้งถัดไปที่ <select id="respawnCamp"><option value="0">ฐานรวมพลเดิม</option></select></label>
        <button class="secondary" type="button" id="campMarch">ส่งกำลังจากฐานไปค่าย</button></details>
      <details id="warDetails" class="field-card" hidden><summary>เป้าหมายและกติกาศึก</summary>
        <p class="note war-field-report" id="warFlag"></p><p class="war-field-report" id="warCount" hidden></p>
        <p class="note">สมาชิกกิลด์เข้าศึกได้ตั้งแต่ Lv.1 · ช่วยยึดจุด ประตู ฮีลหรือป้องกันเพื่อนที่กำลังรบใกล้จุดยุทธศาสตร์ และส่งเสบียงเพื่อรับผลงาน EXP กับวัสดุสงคราม</p>
        <div id="warLegacyRules" hidden><p class="note">ผู้บัญชาการหรือนายทหารเปิดศึกที่วงธง สมาชิกเข้าร่วมได้จากภายในด่าน ฝั่งละ 5 คน ศึกมีเวลา 5 นาที จำนวนคนที่ยืนวงมากกว่าจะดันเกจได้ เมื่อทั้งสองฝ่ายยืนเท่ากัน เกจจะหยุด</p>
        <p class="note">แตะบันไดหรือกดขึ้นกำแพงที่ตีนบันไดด้านใน เมื่อถึงหัวบันไดกดลงกำแพง วงเขียวคือฝ่ายเดียวกัน สามเหลี่ยมแดงคือฝ่ายตรงข้าม หลังจบศึกด่านคุ้มครอง 8 ชั่วโมง</p></div>
      </details>
      <section id="estatePanel" class="field-card" hidden><h3 class="gx-with-emblem" data-guild-icon="hall">การปกครองด่าน</h3>
        <dl class="field-stats"><div data-guild-icon="warehouse"><dt>คลังกิลด์ (หน่วย)</dt><dd id="estateBalance"></dd></div><div data-guild-icon="gold"><dt>รายได้รอเก็บ (หน่วย)</dt><dd id="estateAvailable"></dd></div></dl>
        <p id="estateRole"></p>
        <button class="primary" id="estateCollect" type="button">เก็บรายได้เข้าคลังกิลด์</button>
        <p id="estateDamage" hidden></p><button class="secondary" id="estateRepair" type="button" hidden></button>
        <details><summary>อาคารและนโยบาย</summary><p id="estateTerms"></p>
          <div class="field-actions"><button class="secondary gx-with-emblem" data-guild-icon="market" id="estateMarket" type="button"></button><button class="secondary gx-with-emblem" data-guild-icon="warehouse" id="estateWarehouse" type="button"></button><button class="secondary gx-with-emblem" data-guild-icon="forge" id="estateWorkshop" type="button"></button></div>
          <label class="field" for="estateFocus">นโยบายเมือง <select id="estateFocus"><option value="balanced">สมดุล</option><option value="trade">ส่งเสริมการค้า · รายได้ +20%</option><option value="storage">สำรองเสบียง · ความจุ +4 ชั่วโมง</option></select></label>
          <button id="estateFocusApply" type="button" class="secondary">เปลี่ยนนโยบาย</button><p id="estateHistory" class="note"></p>
        </details>
      </section>
      <section id="warSchedulePanel" class="field-card" hidden>
        <h3 class="gx-with-emblem" data-guild-icon="time">ตารางศึก</h3><label class="field" for="warScheduleCity">เมือง <select id="warScheduleCity"></select></label>
        <p id="warScheduleTime" role="status"></p><form id="warRosterForm" hidden><fieldset id="warRoster"></fieldset>
        <button class="primary" type="submit">บันทึกรายชื่อ</button><button id="warRosterWithdraw" class="secondary" type="button">ถอนรายชื่อ</button></form>
      </section>
      <section id="warTradePanel" class="field-card" hidden><h3 class="gx-with-emblem" data-guild-icon="haul">เส้นทางขนส่งกิลด์</h3><p id="warTradeStatus" role="status"></p><div id="warTradeActions" class="field-actions"></div></section>
    </div>`);
    if(typeof back==="function"){
      $("warBack").hidden=false;
      $("warBack").onclick=back;
    }
    $("warAtlasLink").onclick=()=>openStrategicMap(activeMapId,back);
    $("warObjectiveMap").onclick=()=>{
      const local=territoryState?.local;
      if(local?.site===activeMapId && local.canStart && !local.inField)warMusterSite=activeMapId;
      openMap();
    };
    $("respawnCamp").onchange=e=>room?.send("territory_camp",{action:"select",campId:Number(e.target.value)});
    $("campMarch").onclick=()=>room?.send("territory_camp",{action:"march",campId:Number($("respawnCamp").value)});
    $("castleRepair").onclick=()=>{
      const gateId=$("siegeGateButton").dataset.gate;
      if(gateId)room?.send("territory_gate",{gateId,repair:true});
    };
    renderWarPanel();
  }
  function warLocalDate(ms){
    return new Date(ms).toLocaleString("th-TH",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false});
  }
  function renderWarSchedule(){
    const panel=$("warSchedulePanel"),schedule=territoryState?.schedule;
    if(!panel)return;
    panel.hidden=!schedule;
    if(!schedule)return;
    const picker=$("warScheduleCity"),cities=Object.keys(schedule);
    if(picker.options.length!==cities.length || Array.from(picker.options).some((o,i)=>o.value!==cities[i])){
      const preferred=picker.value || activeMapId;
      picker.replaceChildren(...cities.map(site=>new Option(worldDefinitions?.[site]?.name || site,site)));
      if(cities.includes(preferred))picker.value=preferred;
    }
    picker.onchange=renderWarSchedule;
    const site=picker.value,window=schedule[site];
    if(!window)return;
    $("warScheduleTime").textContent=(window.current?"หน้าต่างศึกปัจจุบันถึง "+warLocalDate(window.current.endsAt)+" · ":"")+
      "รอบถัดไป "+warLocalDate(window.next.startsAt)+" · ล็อกรายชื่อ "+warLocalDate(window.next.locksAt)+" (เวลาเครื่อง)";
    const form=$("warRosterForm"),field=$("warRoster"),members=guildState?.members || [];
    form.hidden=!window.canRegister || !members.length;
    if(form.hidden)return;
    const key=JSON.stringify([site,window.next.startsAt,guildState?.id,window.memberIds,members.map(m=>[m.id,m.name])]);
    if(field.dataset.key!==key){
      field.dataset.key=key;
      const selected=new Set(window.memberIds || [guildState.ownId]);
      const legend=document.createElement("legend");legend.textContent="เลือกผู้ร่วมศึก สูงสุด "+window.seatsPerSide+" คน";
      field.replaceChildren(legend);
      for(const member of members){
        const label=document.createElement("label"),box=document.createElement("input");
        label.className="war-roster-choice";
        box.type="checkbox";box.value=member.id;box.checked=selected.has(member.id);
        label.append(box,document.createTextNode(member.name));field.append(label);
      }
    }
    const send=memberIds=>room?.send("territory_register",{site,startsAt:window.next.startsAt,memberIds});
    form.onsubmit=event=>{
      event.preventDefault();
      const selected=Array.from(field.querySelectorAll("input:checked"),input=>input.value);
      if(!selected.length || selected.length>window.seatsPerSide){toast("เลือกผู้ร่วมศึก 1–"+window.seatsPerSide+" คน");return;}
      send(selected);
    };
    $("warRosterWithdraw").hidden=!window.memberIds?.length;
    $("warRosterWithdraw").onclick=()=>send([]);
  }
  function renderWarRoutes(){
    const panel=$("warTradePanel"),state=territoryState?.routes;
    if(!panel)return;
    panel.hidden=!state || (!state.route && !state.destinations?.length);
    if(panel.hidden)return;
    const actions=$("warTradeActions"),status=$("warTradeStatus"),route=state.route;
    const waiting=state.nextDispatchAt>territoryState.serverNow;
    const key=JSON.stringify([state,activeMapId,waiting]);
    if(actions.dataset.key===key)return;
    actions.dataset.key=key;
    actions.replaceChildren();
    const city=site=>worldDefinitions?.[site]?.name || site;
    const add=(label,run)=>{
      const button=document.createElement("button");button.type="button";button.className="secondary";
      button.textContent=label;button.onclick=run;actions.append(button);
    };
    if(route){
      status.textContent="นำเสบียงไป "+city(route.destination)+" · ส่งได้ถึง "+warLocalDate(route.expires)+" (เวลาเครื่อง)";
      if(route.destination===activeMapId)add("ส่งขบวน",()=>room?.send("territory_route",{id:route.id,action:"deliver"}));
      add("ยกเลิกขบวน",()=>{if(window.confirm("ยกเลิกขบวนและเสียค่าจัดส่งที่จ่ายแล้ว?"))room?.send("territory_route",{id:route.id,action:"cancel"});});
      return;
    }
    if(waiting){
      status.textContent="เริ่มขบวนถัดไปได้ "+warLocalDate(state.nextDispatchAt)+" (เวลาเครื่อง)";
      return;
    }
    status.textContent="ค่าจัดส่ง "+state.fee+" · ส่งสำเร็จรับ "+state.reward+" หน่วยเข้าคลังกิลด์";
    for(const destination of state.destinations)add("ส่งไป "+city(destination),()=>{
      if(window.confirm("ใช้ "+state.fee+" หน่วยจากคลังกิลด์เพื่อเริ่มขบวน?"))
        room?.send("territory_route",{id:economyRequestId(),action:"dispatch",destination});
    });
  }
  function renderGovernment(s){
    const panel=$("estatePanel"),g=s?.site===activeMapId && !s.inField?s.government:null;
    const focus=$("estateFocus");
    panel.hidden=!g;
    if(!g){delete focus.dataset.policyKey;return;}
    const peace=s.phase!=="battle",send=action=>room?.send("territory_govern",{site:s.site,revision:g.revision,action});
    $("estateBalance").textContent=g.balance;
    $("estateAvailable").textContent=g.available;
    $("estateTerms").textContent="ตลาดผลิต "+g.rate+" หน่วย/ชั่วโมง · เก็บได้ "+g.hours+" ชั่วโมง ("+g.cap+" หน่วย)"+(g.upkeep?" · ค่าบำรุง "+g.upkeep+" หน่วย/ชั่วโมง":"")+" · ตลาดเพิ่มรายได้ คลังเสบียงเพิ่มความจุ โรงช่างลดค่าซ่อม";
    $("estateRole").textContent=!peace?"กำลังรบ · เปิดให้ทำรายการอีกครั้งเมื่อศึกจบ":g.commander?"ผู้บัญชาการ · เก็บรายได้ พัฒนาอาคาร และซ่อมคลังได้":g.officer?"นายทหาร · เก็บรายได้เข้าคลังกิลด์ได้":"สมาชิกกิลด์ · ดูรายได้และระดับอาคารได้";
    const apply=$("estateFocusApply"),policy=g.focus || "balanced",policyKey=s.site+":"+policy;
    if(focus.dataset.policyKey!==policyKey){focus.dataset.policyKey=policyKey;focus.value=policy;}
    focus.disabled=!peace || !g.commander;apply.textContent="เปลี่ยนนโยบาย · "+g.focusCost+" หน่วย";
    const syncFocus=()=>{apply.disabled=!peace || !g.commander || focus.value===policy || g.balance<g.focusCost;};
    focus.onchange=syncFocus;syncFocus();apply.onclick=()=>{if(window.confirm("เปลี่ยนนโยบายเมือง ใช้ "+g.focusCost+" หน่วยจากคลังกิลด์?"))send("focus_"+focus.value);};
    const labels={collect:"เก็บรายได้",repair:"ซ่อมคลัง",market:"พัฒนาตลาด",warehouse:"พัฒนาคลัง",workshop:"พัฒนาโรงช่าง",handover:"รายได้ก่อนเปลี่ยนผู้ครอง",war_supply:"เสบียงศึกที่ชนะ",route_dispatch:"ค่าจัดขบวน",route_delivery:"ส่งขบวน",focus_trade:"นโยบายการค้า",focus_storage:"นโยบายสำรอง",focus_balanced:"นโยบายสมดุล"};
    $("estateHistory").textContent=(g.history?.length?"รายการล่าสุด: "+g.history.map(h=>(labels[h.reason] || h.reason)+" "+(h.amount>0?"+":"")+h.amount).join(" · "):"ยังไม่มีรายการคลังในด่านนี้");
    $("estateCollect").disabled=!peace || !g.officer || g.available<1;$("estateCollect").onclick=()=>send("collect");
    for(const [kind,id,label] of [["market","estateMarket","ตลาด"],["warehouse","estateWarehouse","คลังเสบียง"],["workshop","estateWorkshop","โรงช่าง"]]){
      const b=$(id),cost=g.prices[kind];
      b.textContent=label+" Lv."+g[kind]+(cost===null?" · สูงสุด":" → "+(g[kind]+1)+" · "+cost+" หน่วย");
      b.disabled=!peace || !g.commander || g.damaged || cost===null || cost>g.balance;
      b.onclick=()=>{if(window.confirm("พัฒนา"+label+"เป็น Lv."+(g[kind]+1)+" ใช้ "+cost+" หน่วยจากคลังกิลด์?"))send(kind);};
    }
    $("estateDamage").hidden=!g.damaged;$("estateDamage").textContent="คลังเสียหายหลังประตูถูกตีแตก · ซ่อมเพื่อคืนความจุส่วนขยายและเปิดการพัฒนาอาคาร";
    const repair=$("estateRepair");repair.hidden=!g.damaged;repair.disabled=!peace || !g.commander || g.balance<g.repairCost;
    repair.textContent="ซ่อมคลังเสบียง · "+g.repairCost+" หน่วย";
    repair.onclick=()=>{if(window.confirm("ซ่อมคลังเสบียงโดยใช้ "+g.repairCost+" หน่วยจากคลังกิลด์?"))send("repair");};
  }
  function renderWarPanel(){
    const button=$("warAction");if(!button)return;
    const local=territoryState?.local,s=local?.site===activeMapId?local:null,map=worldDefinitions?.[activeMapId];
    const battle=s?.phase==="battle",isCastle=s?.site==="tri_wiang_castle",actionable=!!(s?.inField || s?.canStart || s?.canJoin);
    const status=$("warStatus"),hint=$("warHint");
    $("warHeading").textContent=map?.name || "ด่านกิลด์";
    const phaseLabel=s?warPhase(s.phase):"ไม่มีข้อมูลศึกในพื้นที่";
    if(status.textContent!==phaseLabel)status.textContent=phaseLabel;
    status.dataset.tone=s?.phase || "";
    $("warOwner").hidden=!s;
    $("warBattle").hidden=!battle;
    $("warDetails").hidden=!s;
    $("castleSupply").hidden=!(isCastle && s.supply);
    $("castleFrontLabel").hidden=!(isCastle && !s.inField && actionable);
    if(!(isCastle && battle && s.inField))$("castleRepair").hidden=true;
    $("warAtlasLink").hidden=actionable || !map;
    const objectiveButton=$("warObjectiveMap");
    objectiveButton.hidden=!warObjectiveTarget(s,map,null,true);
    objectiveButton.textContent=battle?"ดูจุดยึดบนแผนที่สนาม":"ดูจุดเปิดศึกบนแผนที่";
    button.hidden=!actionable;
    button.onclick=null;
    hint.textContent=!s?"เลือกด่านสงครามในแผนที่เพื่อดูเส้นทาง":
      battle?"สนามรบนี้ยังไม่เปิดให้ตัวละครของคุณเข้าร่วม":
      s.phase==="protected"?"รอพ้นช่วงคุ้มครองก่อนเปิดศึก":
      s.phase==="open"?"กิลด์ผู้ท้าชิงต้องให้ผู้บัญชาการหรือนายทหารเปิดศึกที่จุดท้าชิง":"";
    hint.hidden=actionable || !hint.textContent;
    renderGovernment(s);
    renderWarSchedule();
    renderWarRoutes();
    const cargo=s?.cargo,panel=$("warCargoPanel");panel.hidden=!cargo;
    const contribution=s?.participation;$("warParticipation").hidden=!contribution;
    if(!s)return;
    $("warOwner").textContent="ผู้ครอง · "+(s.owner || "เป็นกลาง")+(s.inField?" · คุณอยู่ฝ่าย"+(s.side==="attack"?"บุก":"รับ"):"");
    if(battle){
      const seconds=Math.max(0,Math.floor(s.seconds || 0)),clock=$("warClock"),score=isCastle?s.pilot?.score:null;
      clock.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
      clock.setAttribute("aria-label",warTime(seconds));
      $("warAttackName").textContent=s.attackName || "ไม่ทราบกิลด์";
      $("warDefendName").textContent=s.defendName || "รอคู่ชิง";
      for(const [id,value] of [["warAttackScore",score?.attack],["warDefendScore",score?.defend]]){
        const metric=$(id);metric.hidden=value===undefined;
        if(!metric.hidden)metric.textContent=value+" คะแนน";
      }
      $("warCapture").hidden=isCastle;
      if(!isCastle){
        const gauge=$("warGauge"),progress=Math.abs(s.progress);
        gauge.max=s.goal;gauge.value=progress;
        gauge.dataset.side=s.progress<0?"defend":s.progress>0?"attack":"";
        $("warCaptureLabel").textContent=(s.progress<0?"ฝ่ายรับยึดธง":s.progress>0?"ฝ่ายบุกยึดธง":"ยึดธง")+" · "+progress+"/"+s.goal;
      }
    }
    if(contribution)$("warParticipation").textContent=`ผลงานรอบรางวัล ${contribution.progressSeconds}/${contribution.goalSeconds} วินาที`+(contribution.supportActive?" · กำลังนับการสนับสนุนเพื่อน":"");
    if(cargo){
      const now=Number.isFinite(territoryState?.serverNow)?territoryState.serverNow+Math.max(0,performance.now()-territoryReceivedAt):Date.now();
      const cooldown=Math.max(0,Math.ceil((cargo.readyAt-now)/1000));
      $("warCargoStatus").textContent=`ฝ่ายเราส่งแล้ว ${cargo.delivered} ชุด · หากชนะ ได้เข้าคลังกิลด์ชุดละ ${cargo.treasuryPerDelivery} หน่วย สูงสุด ${cargo.treasuryCap} หน่วย · `+
        (cargo.carrying?"ถือเสบียงอยู่ เดินไปส่งที่จุดยุทธศาสตร์ หากล้มเสบียงจะหาย":cooldown?`รับชุดถัดไปได้ใน ${cooldown} วินาที`:cargo.atBase?"คุยกับพลเสบียงที่ฐานเพื่อรับของ":"กลับฐานรวมพลเพื่อรับเสบียง");
      $("warCargoPickup").disabled=cargo.carrying || !cargo.atBase || cooldown>0;
      $("warCargoDeliver").disabled=!cargo.carrying || !cargo.canDeliver;
      $("warCargoPickup").onclick=()=>room?.send("territory_supply",{action:"pickup"});
      $("warCargoDeliver").onclick=()=>room?.send("territory_supply",{action:"deliver"});
    }
    const fort=s.civic?.flag || map?.strategic?.sites?.find(site=>site.kind==="fort"),riverCity=map?.strategic?.riverCity;
    $("warFlag").textContent=fort?"ธง ("+fort.x+", "+fort.z+") · รัศมี 5 ม."+(s.civic?" · สนามแยกจากห้องโลก":" · ดูบันไดและประตูบนแผนที่"+(s.inField?" · "+warGateText(s):"")):"";
    $("warCount").textContent=battle && s.inField?"ในวงธง · บุก "+s.attack+" รับ "+s.defend:"";
    const relay=s.civic?.relay || map?.strategic?.relay;
    if(relay){
      const state=s.relay;
      const status=state?(state.contested?"กำลังแย่งชิง":state.side==="attack"?"ฝ่ายบุกคุม":state.side==="defend"?"ฝ่ายรับคุม":"วงว่าง"):"";
      const rule=relay.effect==="gate"?"ฝ่ายบุกคุม แรงทุบประตูเพิ่มเป็น 30 · ฝ่ายรับคุม ลดเหลือ 10 · ปกติ 15":"เมื่อฝ่ายที่คุมมีคนมากกว่าที่ธงหลัก เกจธงเดินเพิ่ม 1 หน่วยต่อวินาที";
      $("warFlag").textContent+=" · "+relay.name+" ("+relay.x+", "+relay.z+")"+(status?" · "+status:"")+"\n"+rule+" · ทั้งสองฝ่ายอยู่จุดเสริมพร้อมกัน โบนัสหยุด";
    }
    $("warLegacyRules").hidden=!!(territoryState?.schedule || s.civic || riverCity || isCastle);
    const duration=s.civic && Number.isFinite(s.civic.durationMs)?Math.round(s.civic.durationMs/60000)+" นาที":null;
    const details=duration && Number.isInteger(s.civic.seatsPerSide)
      ?s.civic.seatsPerSide+" ต่อ "+s.civic.seatsPerSide+" · "+duration:duration;
    if(details)$("warFlag").textContent+=" · "+details;
    button.textContent=s.inField?"กลับห้องโลก":s.canStart?(s.civic?.entry?"เปิดศึกที่จุดสมัคร · ":"เปิดศึกที่ธง · ")+(details || "5 นาที"):"เข้าร่วมสนามรบ";
    if(riverCity){
      $("warFlag").textContent="B01 · เปิดศึกที่ค่ายใต้ (0, 176) · 5 ต่อ 5 · 10 นาที · คุมตลาดหรือคลังให้ได้ก่อนชิงลานบัญชาการ กองบุกต้องมีช่องผ่านทั้งสองวงกำแพง คุมโรงช่างเพื่อทุบประตูแรงขึ้น";
      if(s.canStart)button.textContent="เปิดศึกที่ค่ายใต้ · 10 นาที";
      if(s.river && battle){
        const posts=s.river.posts.map((p,i)=>riverCity.posts[i].name+" · "+(p.contested?"แย่งชิง":p.owner==="attack"?"ฝ่ายบุก":p.owner==="defend"?"ฝ่ายรับ":Math.abs(p.progress)>0?"กำลังยึด "+Math.trunc(Math.abs(p.progress))+"/6":"เป็นกลาง"));
        $("warCount").textContent+="\n"+(s.river.supplied?"เสบียงถึงลานบัญชาการ · ยึดธงได้":"เสบียงยังไม่ถึง · ตรวจจุดที่ครองและทางผ่านประตู")+"\n"+posts.join(" · ");
      }
    }
    if(isCastle){
      $("warFlag").textContent="ธงท้าชิงอยู่ที่ประตูใต้"+(fort?" ("+fort.x+", "+fort.z+")":"")+" · แตะบันไดด้านในเพื่อขึ้นหรือลงกำแพง";
      const v=s.pilot;
      const sideName=side=>side==="attack"?"บุก":side==="defend"?"รับ":"กลาง";
      const lines=[];
      if(v && s.phase!=="open"){
        if(!battle)lines.push("คะแนนรวม   บุก "+v.score.attack+"   ·   รับ "+v.score.defend);
        if(v.throne){
          const th=v.throne;
          if(s.phase==="battle")lines.push(s.seconds>2100?"ช่วงเปิดแนวรบ":s.seconds>900?"ช่วงชิงเส้นส่งกำลัง":"ช่วงชิงบัลลังก์");
          for(const side of ["attack","defend"])if(v.networks[side].length)lines.push("ฝ่าย"+sideName(side)+" +20% ที่จุด "+v.networks[side].join("–"));
          if(s.phase==="battle" && s.seconds>900)lines.push("7 ท้องพระโรง · เปิดเมื่อเหลือ 15 นาที");
          else if(th.victor)lines.push("7 ท้องพระโรง · ฝ่าย"+sideName(th.victor)+" ยึดบัลลังก์สำเร็จ");
          else if(s.phase==="battle")for(const side of th.defended?["attack"]:["attack","defend"]){
            const f=th[side];
            lines.push("7 บัลลังก์ฝ่าย"+sideName(side)+" "+Math.floor(th.progress[side]/1000)+"/120 วิ · นอก "+f.outer+"/2 · กลาง "+f.middle+"/2 · "+(f.route?"เส้นทางเปิด":"เส้นทางขาด"));
          }
          if(s.phase==="protected" && !th.victor)lines.push("จบศึก · "+(s.owner?"ผู้ครองปราสาท "+s.owner:"ปราสาทยังเป็นกลาง"));
        }
        for(const p of v.points)lines.push(p.id+" "+p.name+" · "+sideName(p.owner)+(p.progress?" · "+sideName(p.progress>0?"attack":"defend")+" "+Math.abs(p.progress)+"%":""));
      }else{
        lines.push("ยึดจุด 1–6 เพื่อเก็บคะแนน กลุ่มที่เชื่อมกันตั้งแต่ 3 จุดได้เพิ่ม 20%",
          "นาทีที่ 30 เปิดท้องพระโรง ยึดจุดนอก 2 จุดและจุดกลาง 2 จุด เปิดทางเข้าพระราชฐาน แล้วยืนบัลลังก์ 120 วินาที");
      }
      const supply=s.supply,front=$("castleFront"),respawn=$("respawnCamp");
      const choices=battle && v && !v.throne?[2,4,5]:[1,2,3],frontKey=choices.join(",");
      if(front.dataset.choices!==frontKey){
        front.dataset.choices=frontKey;
        front.replaceChildren(...map.strategic.objectives.filter(p=>choices.includes(p.id)).map(p=>new Option(p.id+" "+p.name,String(p.id))));
      }
      if(supply){
        const camps=map.strategic.forwardCamps || [];
        if(respawn.options.length===1)for(const c of camps)respawn.add(new Option(c.name,String(c.id)));
        const ready=supply.camps.filter(c=>c.status==="ready");
        $("supplyTitle").textContent="ค่ายหน้า · เปิด "+ready.length+"/"+camps.length;
        for(const c of supply.camps){
          const opt=respawn.querySelector('option[value="'+c.id+'"]');
          if(!opt)continue;
          const label=c.id+" "+camps.find(p=>p.id===c.id).name+" · "+campStatus[c.status];
          if(opt.textContent!==label)opt.textContent=label;
          opt.disabled=c.status!=="ready";
        }
        if(respawn.value!==String(supply.selected))respawn.value=String(supply.selected);
        const chosen=ready.some(c=>c.id===supply.selected);
        $("campMarch").disabled=!supply.atBase || !chosen;
        $("campHelp").textContent=supply.selected && !chosen?"ค่ายที่เลือกใช้ไม่ได้ หากล้มจะกลับฐานรวมพล":supply.atBase?"อยู่ที่ฐาน เลือกค่ายที่เปิดเพื่อส่งกำลังได้ทันที":"เลือกค่ายสำหรับเกิดใหม่ได้ที่นี่ หากจะส่งกำลังขณะมีชีวิต ให้กลับฐานรวมพลประจำตัว";
        if(supply.drums.length)lines.unshift("เสียงกลอง · กำลังชิง "+supply.drums.map(id=>v.points.find(p=>p.id===id).name).join(" · "));
        else if(v.points.find(p=>p.id===5)?.owner===s.side)lines.push("กลองพร้อม · จุดกลางของฝ่ายเรายังสงบ");
      }
      $("warCount").textContent=lines.join("\n");
      if(s.canStart)button.textContent="เปิดสนามทดลอง 10 ต่อ 10 · 45 นาที";
    }
    $("warFlag").hidden=!$("warFlag").textContent;
    $("warCount").hidden=!$("warCount").textContent;
    if(actionable)button.onclick=()=>{if(s.inField)void connectOnline(currentCharacterEndpoint(),activeCharacterSlot,{world:true});
      else if(room)room.send(s.canStart?"territory_start":"territory_join",isCastle?{objectiveId:Number($("castleFront").value)}:{});};
  }
  function updateAtlasOwner(){
    const node=$("atlasOwner");
    if(node)node.textContent="ธงครองด่าน · "+(territoryState?.owners?.[node.dataset.site] || "เป็นกลาง");
  }
  function strategicWarLabel(entry,serverNow,compact=false){
    if(!entry)return "รอข้อมูล";
    if(entry.phase==="open")return compact?"พร้อมรบ":"พร้อมเปิดศึก";
    if(!Number.isFinite(entry.phaseEndsAt) || !Number.isFinite(serverNow))return "รอข้อมูล";
    const seconds=Math.max(0,Math.ceil((entry.phaseEndsAt-serverNow)/1000));
    if(!seconds)return "กำลังอัปเดต";
    const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),remainder=seconds%60;
    const clock=(hours?String(hours)+":"+String(minutes).padStart(2,"0"):String(minutes))+":"+String(remainder).padStart(2,"0");
    return (entry.phase==="battle"?"รบ ":compact?"พัก ":"คุ้มครอง ")+clock;
  }
  function updateAtlasWarTimes(){
    if(drawerActive!=="strategy")return;
    const route=cityMarkets?.tradeRoute?.contracts,panel=$("atlasTradeRoute");
    if(route && panel?.dataset.paused!==undefined && panel.dataset.paused!==String(cityTradeRoutePaused(route)))
      renderAtlasTradeRoute();
    updateAtlasTradeDeadline();
    const now=Number.isFinite(territoryState?.serverNow)?territoryState.serverNow+Math.max(0,performance.now()-territoryReceivedAt):NaN;
    for(const node of ui.drawerBody.querySelectorAll("[data-war-site]")){
      const site=node.dataset.warSite,entry=territoryState?.warTimes?.[site],button=node.closest(".atlas-cell");
      const schedule=territoryState?.schedule?.[site];
      node.textContent=strategicWarLabel(entry,now,Boolean(button));
      if(schedule && !button && entry?.phase==="open")
        node.textContent+=" · รอบนัดถัดไป "+warLocalDate(schedule.next.startsAt)+" (เวลาเครื่อง)";
      if(!button && Number.isFinite(entry?.phaseEndsAt) && entry.phaseEndsAt>now){
        const when=new Date(entry.phaseEndsAt).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false});
        node.textContent+=" · "+(entry.phase==="battle"?"จบไม่เกิน ":schedule?"สิ้นสุดคุ้มครอง ":"เปิดตีได้ ")+when+" (เวลาเครื่อง)";
      }
      if(button)button.setAttribute("aria-label",button.dataset.baseLabel+" · "+strategicWarLabel(entry,now));
    }
  }
  function updateAtlasCityMarket(){
    const price=$("atlasCityMarket");
    if(drawerActive!=="strategy" || !price)return;
    const markets=cityMarketRows();
    if(!markets.length){price.textContent="กำลังโหลดราคาตลาดเมือง…";return;}
    price.replaceChildren();
    for(const market of markets.filter(row=>row.site===price.dataset.site)){
      price.append(marketText("p","note",cityItemName(market.item??cityProduct)+" · "+cityMarketSummary(market)));
      const comparison=cityMarketRouteQuote(market,markets);
      if(comparison)price.append(marketText("p","note",comparison));
    }
  }
  function currentCityTradePin(){
    if(mode!=="live" || !cityTradePin || cityTradePin.actor!==ownServerCharacter()?.characterId)return null;
    return cityTradePin.contractId && cityTradePin.expires<=cityTradeNow()?null:cityTradePin;
  }
  function pinCityTradeRoute(site,job){
    const actor=ownServerCharacter()?.characterId;
    if(!actor || !Object.hasOwn(citySiteNames,site))return;
    cityTradePin={actor,site,contractId:job?.id??null,expires:job?.expires??null};
    openStrategicMap(site);
  }
  function cityTradeRoutePaused(contracts){
    return Boolean(contracts?.paused || [contracts?.source,contracts?.destination].some(site=>site &&
      territoryState?.warTimes?.[site]?.phase==="battle"));
  }
  function cityTradeHudGuide(){
    const pin=currentCityTradePin();
    if(!pin || territoryState?.local?.inField)return null;
    const title="เส้นทางค้า · "+citySiteNames[pin.site];
    const contracts=(cityMission?.serverNow??0)>(cityMarkets?.serverNow??0)?cityMission.tradeContracts:cityMarkets?.tradeRoute?.contracts;
    if(pin.contractId && cityTradeRoutePaused(contracts))
      return {title,step:"พักรับและส่งสัญญาระหว่างศึก"};
    const route=travelRoute(worldDefinitions,activeMapId,pin.site);
    if(!route.length)return {title,step:"เส้นทางจากจุดนี้ยังใช้ไม่ได้"};
    const map=worldDefinitions[activeMapId];
    const to=route.length>1?map.portals.find(gate=>gate.targetMapId===route[1]):map.serviceNpcs?.find(npc=>npc.role==="market");
    return {title,step:route.length>1?"ไปประตู "+worldDefinitions[route[1]].name:"ไปหานายหน้าตลาด",to};
  }
  function cityTradeEstimate(amount,prices,receivePrices,job,available){
    const total=entries=>entries.length>=amount?entries.slice(0,amount).reduce((sum,price)=>sum+price,0):null;
    const guaranteed=available && !job?.carrying && job?.amount===amount && Number.isFinite(job.total);
    return {cost:guaranteed?job.total:total(prices), spot:total(receivePrices), guaranteed:guaranteed?job.gold:null};
  }
  function updateAtlasTradeDeadline(refresh=true){
    const node=$("atlasTradeDeadline");
    if(!node)return;
    const remaining=Math.max(0,Math.ceil((Number(node.dataset.expires)-cityTradeNow())/1000));
    if(refresh && !remaining && node.dataset.running==="true"){
      renderAtlasTradeRoute();refreshCityMarkets();return;
    }
    const hours=Math.floor(remaining/3600),minutes=Math.floor(remaining%3600/60),seconds=remaining%60;
    node.textContent=remaining?"เหลือ "+hours+" ชม. "+minutes+" นาที "+seconds+" วิ":"สัญญาถึงกำหนดแล้ว · รีเฟรชสถานะ";
  }
  function renderAtlasReturnRoute(panel,origin,destination,selected){
    const section=marketText("section","gx-page");
    const note=text=>section.append(marketText("p","note",text));
    section.append(marketText("strong","","การค้า · "+citySiteNames[origin.site]+" → "+citySiteNames[destination.site]));
    for(const market of [origin,destination])note(citySiteNames[market.site]+" · "+cityMarketSummary(market,false));
    if(origin.prices.length && destination.prices.length){
      const max=Math.min(origin.prices.length,destination.prices.length);
      const label=marketText("label","field","จำนวนแร่เที่ยวกลับ"),amount=document.createElement("input");
      amount.id="atlasReturnAmount";amount.type="number";amount.inputMode="numeric";amount.min="1";amount.max=String(max);
      amount.value=String(cityPositive(selected,max)?selected:1);label.append(amount);section.append(label);
      const estimate=marketText("p","note");estimate.setAttribute("aria-live","polite");section.append(estimate);
      amount.oninput=()=>{
        const quantity=amount.valueAsNumber;
        if(!cityPositive(quantity,max)){estimate.textContent="เลือกจำนวน 1–"+max+" ชิ้น";return;}
        const {cost,spot}=cityTradeEstimate(quantity,origin.prices,destination.prices,null,false);
        const delta=spot-cost;
        estimate.textContent="ซื้อ "+cost+" ทอง · ขายประมาณ "+spot+" ทอง · ส่วนต่าง "+(delta>0?"+":"")+delta+" ทอง";
      };
      amount.oninput();
    }
    for(const [market,label] of [[origin,"ปักหมุดไปซื้อที่จันทรา"],[destination,"ปักหมุดไปขายที่สามลาน"]]){
      const button=marketText("button","secondary",label);
      button.type="button";button.onclick=()=>pinCityTradeRoute(market.site);section.append(button);
    }
    panel.append(section);
  }
  function renderAtlasTradeRoute(){
    const panel=$("atlasTradeRoute"),route=cityMarkets?.tradeRoute;
    if(!panel)return;
    const selected=$("atlasOutboundAmount")?.valueAsNumber,selectedReturn=$("atlasReturnAmount")?.valueAsNumber;
    panel.hidden=Boolean(cityMarkets && !route);
    panel.replaceChildren();
    if(!route){if(!panel.hidden)panel.textContent="กำลังโหลดสถานะการค้า…";return;}
    const {contracts,report}=route,{source,destination,job,manage,enabled}=contracts;
    const paused=cityTradeRoutePaused(contracts);
    panel.dataset.paused=String(paused);
    const rows=cityMarketRows(),markets=rows.filter(market=>(market.item??cityProduct)===cityProduct);
    const selling=markets.find(market=>market.site===source),buying=markets.find(market=>market.site===destination);
    const note=text=>panel.append(marketText("p","note",text));
    const button=(text,onclick)=>{
      const control=marketText("button","secondary",text);control.type="button";control.onclick=onclick;panel.append(control);
    };
    panel.append(marketText("strong","","การค้า · "+citySiteNames[source]+" → "+citySiteNames[destination]));
    note("ราคา ณ "+new Date(cityMarkets.serverNow).toLocaleTimeString("th-TH"));
    for(const market of [selling,buying])if(market)note(citySiteNames[market.site]+" · "+cityMarketSummary(market,false));
    const open=Boolean(job && !job.carrying && enabled && !paused && job.expires>cityTradeNow());
    if(paused)note("พักรับและส่งสัญญาระหว่างศึก");
    if(!job)note(enabled?"จันทรายังไม่มีสัญญาจัดซื้อเปิดอยู่":"พักเปิดสัญญาจัดซื้อ");
    else {
      const status=job.yours?"สัญญาที่คุณรับแล้ว":job.carrying?"มีพ่อค้ารับสัญญาแล้ว":"สัญญาจัดซื้อ";
      note(status+" · จันทราต้องการ "+job.amount+" ชิ้น · รับประกัน "+job.gold+" ทองเมื่อส่งครบ");
      if(open && job.total===null)note("แร่ที่คุณซื้อได้ตอนนี้ "+(selling?.prices.length??0)+" / "+job.amount+" ชิ้น");
      const deadline=marketText("p","note");deadline.id="atlasTradeDeadline";deadline.dataset.expires=String(job.expires);
      deadline.dataset.running=String(job.expires>cityTradeNow());
      panel.append(deadline);updateAtlasTradeDeadline(false);
    }
    const sourcePrices=selling?.prices??[],destinationPrices=buying?.prices??[];
    if(sourcePrices.length || open){
      const label=marketText("label","field","จำนวนแร่ที่เทียบราคา"),amount=document.createElement("input");
      amount.id="atlasOutboundAmount";amount.type="number";amount.inputMode="numeric";amount.min="1";amount.max="12";
      amount.value=String(cityPositive(selected,12)?selected:open?job.amount:1);
      label.append(amount);panel.append(label);
      const estimate=marketText("p","note");estimate.setAttribute("aria-live","polite");panel.append(estimate);
      amount.oninput=()=>{
        const quantity=amount.valueAsNumber;
        if(!cityPositive(quantity,12)){estimate.textContent="เลือกจำนวน 1–12 ชิ้น";return;}
        const {cost,spot,guaranteed}=cityTradeEstimate(quantity,sourcePrices,destinationPrices,job,open);
        const difference=value=>value-cost>0?"+"+(value-cost):String(value-cost);
        const lines=[cost===null?"แร่ต้นทางไม่ครบตามจำนวน":"ซื้อ "+quantity+" ชิ้น · "+cost+" ทอง"];
        if(guaranteed!==null)lines.push("ตามสัญญา "+guaranteed+" ทอง · ส่วนต่าง "+difference(guaranteed)+" ทอง");
        if(spot!==null && cost!==null)lines.push("ขายหน้าตลาดประมาณ "+spot+" ทอง · ส่วนต่าง "+difference(spot)+" ทอง");
        if(open && quantity!==job.amount)lines.push("สัญญาต้องส่งครบ "+job.amount+" ชิ้น");
        if(cost!==null && (cityMarkets.wallet<cost || cityMarkets.bagSpace<quantity))lines.push("ตรวจทองหรือพื้นที่กระเป๋าก่อนซื้อ");
        estimate.textContent=lines.join(" · ");
      };
      amount.oninput();
    }
    if(manage){
      note("ทองตลาดพร้อมใช้ "+manage.gold+" ทอง · คลังว่าง "+manage.free+" ชิ้น");
      if(manage.canOpen && manage.maxGold>0 && manage.maxAmount>0)
        button("เปิดกระดานเพื่อออกสัญญา",openCityMission);
    }
    button("รีเฟรชราคาและสัญญา",refreshCityMarkets);
    button(cityMarkets.contribution?"เปิดตลาดและสมทบทอง":"เปิดตลาดเมือง",openCityMarket);
    if(job)button("เปิดกระดานสัญญา",openCityMission);
    if(job?.yours && job.expires>cityTradeNow())button("ปักหมุดไปส่งที่จันทรา",()=>pinCityTradeRoute(destination,job));
    else button("ปักหมุดไปสามลาน",()=>pinCityTradeRoute(source,open?job:null));
    if(manage?.canOpen && contracts.atCity!==destination)
      button("ปักหมุดไปจันทรา",()=>pinCityTradeRoute(destination));
    const returnDestination=rows.find(market=>market.neutralReturn);
    const returnOrigin=rows.find(market=>market.site===destination && market.item===cityReturnProduct);
    if(returnDestination && returnOrigin)renderAtlasReturnRoute(panel,returnOrigin,returnDestination,selectedReturn);
    const pin=currentCityTradePin();
    if(pin){
      note("ปักหมุด "+citySiteNames[pin.site]);
      button("ล้างหมุดการค้า",()=>{cityTradePin=null;renderAtlasTradeRoute();});
    }
    const average=report.units?(report.gold/report.units).toLocaleString("th-TH",{maximumFractionDigits:2}):null;
    note("การค้า 7 วัน · ซื้อที่สามลาน "+report.deals+" ดีล · "+report.units+" ชิ้น · ส่งสัญญาสำเร็จ "+report.delivered+" งาน"+
      (average===null?"":" · เฉลี่ย "+average+" ทอง/ชิ้น"));
    if(report.lastPurchase){
      const {at,total,amount}=report.lastPurchase;
      note("ดีลล่าสุด "+amount+" ชิ้น · "+total+" ทอง · "+new Date(at).toLocaleString("th-TH"));
    }
  }
  function openStrategicMap(destination,back){
    const maps=worldDefinitions,origin=activeMapId;
    if(!maps?.[origin])return;
    openDrawer("strategy","แผนที่ยุทธศาสตร์",`<button class="atlas-back" id="backLocalMap">‹ แผนที่พื้นที่ปัจจุบัน</button>
      <div class="atlas-summary" id="atlasDetail" aria-live="polite"></div>
      ${room?.state?.cityMarketSupported===true?'<section class="atlas-summary" id="atlasTradeRoute"></section>':""}
      <p class="note">แตะพื้นที่เพื่อหาเส้นทาง · เลื่อนเพื่อดูอาณาจักรทั้งหมด</p>
      <div class="atlas-scroll"><div class="atlas-board" id="atlasBoard"></div></div>
      <div class="legend"><span>♛ เมืองหลวง</span><span>⚑ ด่านสงคราม</span><span>◆ เขตล่า</span><span>● จุดที่ยืน</span></div>`);
    const backButton=$("backLocalMap");
    if(typeof back==="function")backButton.textContent="← กลับหน้าก่อน";
    backButton.onclick=typeof back==="function"?back:openMap;
    const board=$("atlasBoard"),detail=$("atlasDetail"),cells=new Map(),lines=[];
    const ids=Object.keys(maps).filter(id=>atlasCells[id]);
    const linkLayer=document.createElementNS("http://www.w3.org/2000/svg","svg");
    linkLayer.setAttribute("viewBox","0 0 400 827");linkLayer.setAttribute("preserveAspectRatio","none");linkLayer.setAttribute("aria-hidden","true");board.append(linkLayer);
    for(const id of ids){
      const [x,y]=atlasCells[id],map=maps[id];
      for(const gate of map.portals){
        const other=gate.targetMapId;
        if(!atlasCells[other] || other<=id)continue;
        const line=document.createElementNS(linkLayer.namespaceURI,"line"),[endX,endY]=atlasCells[other];
        for(const [key,value] of Object.entries({x1:x,y1:y,x2:endX,y2:endY}))line.setAttribute(key,String(value));
        linkLayer.append(line);lines.push({id,other,line});
      }
      const kind=map.strategic?.kind || (id==="ritual_village"?"village":"hunting");
      const button=document.createElement("button");button.type="button";button.className="atlas-cell "+kind;
      button.style.left=(x/4)+"%";button.style.top=(y/827*100)+"%";
      const icon=document.createElement("b");icon.setAttribute("aria-hidden","true");
      icon.textContent=kind==="capital"?"♛":kind==="territory"?"⚑":kind==="village"?"⌂":"◆";
      const label=document.createElement("span");label.textContent=map.name;button.append(icon,label);
      if(kind==="territory" || territoryState?.warTimes?.[id]){const timer=document.createElement("small");timer.className="atlas-war-time";timer.dataset.warSite=id;button.append(timer);}
      button.dataset.baseLabel=map.name+(id===origin?" · คุณอยู่ที่นี่":"");button.setAttribute("aria-label",button.dataset.baseLabel);
      if(id===origin)button.classList.add("here");
      board.append(button);cells.set(id,button);button.onclick=()=>select(id);
    }
    function select(id){
      const map=maps[id],path=travelRoute(maps,origin,id);
      for(const [key,button] of cells)button.setAttribute("aria-pressed",String(key===id));
      for(const edge of lines)edge.line.classList.toggle("route",path.some((a,i)=>i>0 &&
        ((a===edge.id && path[i-1]===edge.other)||(a===edge.other && path[i-1]===edge.id))));
      const title=document.createElement("strong"),description=document.createElement("p"),directions=document.createElement("p");
      title.textContent=map.name+" · "+(provinceTitle[map.strategic?.kind] || (id==="ritual_village"?"หมู่บ้าน":"พื้นที่เก็บเลเวล"))+
        (map.region?.range?" · Lv."+map.region.range.join("–"):"");
      description.textContent=map.strategic?.hint || map.region?.hint || (id===origin?"คุณอยู่ที่นี่":"ประตูเชื่อม "+map.portals.map(p=>maps[p.targetMapId].name).join(" / "));
      const gate=maps[origin].portals.find(p=>p.targetMapId===path[1]);
      directions.textContent=gate?"ผ่าน "+(path.length-1)+" ประตู · "+path.map(p=>maps[p].name).join(" → ")+" · ประตูแรก ("+gate.x+", "+gate.z+")":id===origin?"● คุณอยู่ที่นี่":"ยังไม่มีเส้นทางจากจุดปัจจุบัน";
      detail.replaceChildren(title,description,directions);
      if(room?.state?.boatsAvailable && id!==origin){
        const waterPath=travelRoute(maps,origin,id,"waterGates");
        const next=maps[origin].waterGates?.find(gate=>gate.targetMapId===waterPath[1]);
        if(next){
          const route=document.createElement("p");
          route.textContent="ทางน้ำ · "+waterPath.map(key=>maps[key].name).join(" → ")+
            " · ประตูแรก ("+next.x+", "+next.z+")";
          detail.append(route);
          if(boatAtHelm()){
            const navigate=document.createElement("button");navigate.type="button";navigate.className="secondary";
            navigate.textContent="ล่องไป "+maps[next.targetMapId].name;
            navigate.onclick=()=>{if(sailThroughGate(next.id))closeDrawer();};
            detail.append(navigate);
          }
        }
      }
      if(room?.state?.cityMarketSupported===true && Object.hasOwn(citySiteNames,id)){
        const price=document.createElement("div");price.id="atlasCityMarket";price.dataset.site=id;
        const market=document.createElement("button");market.type="button";market.className="secondary";
        market.textContent="เปิดตลาดประจำเมือง";market.onclick=openCityMarket;
        detail.append(price,market);updateAtlasCityMarket();
      }
      if(territoryState && (map.strategic?.kind==="territory" || territoryState.warTimes?.[id])){
        const owner=document.createElement("p");owner.id="atlasOwner";owner.dataset.site=id;detail.append(owner);updateAtlasOwner();
        const timer=document.createElement("p");timer.dataset.warSite=id;timer.setAttribute("aria-live","off");detail.append(timer);updateAtlasWarTimes();
      }
    }
    const target=typeof destination==="string"?destination:currentCityTradePin()?.site;
    const selected=typeof target==="string" && maps[target] && atlasCells[target]?target:origin;
    select(selected);updateAtlasWarTimes();
    renderAtlasTradeRoute();
    if(mode==="live")room?.send("get_territories",{});
    if(room?.state?.cityMarketSupported===true)refreshCityMarkets();
    const scroll=board.parentElement;
    scroll.scrollTop=atlasCells[selected][1]-scroll.clientHeight/2;
  }
  function openMap() {
    const activeMap=worldDefinitions?.[activeMapId],boss=activeMap?.guardian ?? activeMap?.boss;
    const services=[...(activeMap?.serviceNpcs || [])],keeper=forestObjectiveState?.keeper;
    const inField=territoryState?.local?.site===activeMapId && territoryState.local.inField;
    const warLegend=services.some(npc=>npc.role==="war")?"<span>จุดแดงอ่อน · นายทหารรับศึก</span>":"";
    openDrawer("map",(inField?"แผนที่สนาม · ":"แผนที่")+(activeMap?.name || (activeMapId==="ritual_village"?"หมู่บ้านอาคม":"ป่าต้องห้าม")),
      `<p id="warMapObjective" class="war-map-objective" hidden></p><canvas id="bigMap" class="drawer-map" width="420" height="320"></canvas><div class="legend"><span><b>●</b> ตัวเรา</span><span>● ผู้เล่นอื่น</span><span>● ประตูวาร์ป</span><span>● มอนสเตอร์</span><span>● NPC ผู้ให้บริการ</span>${warLegend}<span>วงสีเขียว: เขตพัก</span>${inField?"<span>วงทองและเส้นประ · ทิศไปจุดยึด</span>":""}</div>`);
    const boatPorts=room?.state?.boatsAvailable ? activeMap?.boatPorts : null;
    if(boatPorts?.length){
      const list=document.createElement("details"),summary=document.createElement("summary");
      list.className="help-topic";summary.textContent="ท่าเรือในพื้นที่";list.append(summary);
      for(const port of boatPorts){
        const button=document.createElement("button");button.type="button";button.className="secondary";
        button.textContent=(boatAtHelm()?"เทียบ":"เดินไป")+port.name;
        button.onclick=()=>{
          const me=ownServerCharacter();
          if(boatAtHelm()){if(sailToPort(port.id))closeDrawer();return;}
          if(!me || me.flying || me.boatId){toast("ลงจอดหรือจับหางเสือก่อนเลือกท่าเรือ");return;}
          closeDrawer();pointMove(port.shore.x,port.shore.z);
        };
        list.append(button);
      }
      $("bigMap").parentElement.append(list);
    }
    if(keeper?.mapId===activeMapId)services.unshift(keeper);
    services.sort((a,b)=>Number(b.role==="war")-Number(a.role==="war"));
    if(services.length){
      const list=document.createElement("details"),summary=document.createElement("summary");list.className="help-topic";summary.textContent="NPC ในพื้นที่ · เดินไปหา";list.append(summary);
      for(const npc of services){
        const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent="เดินไปหา "+npc.name;
        button.onclick=()=>{const me=ownServerCharacter();if(!me || me.flying){toast("ลงจอดและเข้า LIVE ก่อนเดินไปหา NPC");return;}
          closeDrawer();pointMove(npc.x,npc.z);toast("เดินไปหา"+npc.name+" แล้วแตะตัว NPC เพื่อพูดคุย");};list.append(button);
      }
      $("bigMap").parentElement.append(list);
    }
    if(boss){
      const note=document.createElement("p");note.className="note";
      note.textContent="◆ "+boss.name+" · "+(activeMap.guardian?"Elite":"Boss")+" Lv."+boss.level+" · เกิดใหม่หลังถูกปราบ "+boss.respawnMs/60_000+" นาที";
      if(activeMap.guardian)note.textContent+=" · หลบวงฟาดสีส้ม · EXP ×3 แบ่งตามกฎปาร์ตี้ ผู้ได้รับ EXP รับยาคนละ 1 ขวดเมื่อกระเป๋ามีที่";
      $("bigMap").parentElement.append(note);
    }
    if(worldDefinitions?.spirit_rift){
      const note=document.createElement("p");note.className="note";
      const map=worldDefinitions[activeMapId],range=map.region?.range;
      note.textContent=map.name+(range?" · Lv."+range.join("–"):"")+" · ประตูไป"+map.portals.filter(p=>p.targetMapId!==activeMapId).map(p=>worldDefinitions[p.targetMapId].name).join(" / ");
      if(map.strategic?.objectives)note.textContent+=" · 1–6 จุดทำคะแนน · 7 บัลลังก์ · จุดฟ้าคือบันได · กากบาทแดงคือประตูปิด · ธงเขียวคือค่ายที่ส่งกำลังได้ วงส้มคือสัญญาณกลอง";
      if(map.strategic?.relay)note.textContent+=" · "+map.strategic.hint+" · วงทองคือจุดสนับสนุน กรอบสี่เหลี่ยมคือสถานี จุดฟ้าข้างธงคือบันไดกำแพง";
      const button=document.createElement("button");button.type="button";button.className="primary";button.id="openStrategicMap";
      button.textContent="เปิดแผนที่ยุทธศาสตร์ · "+Object.keys(worldDefinitions).length+" พื้นที่";button.onclick=openStrategicMap;
      if(inField)$("bigMap").after(button);else $("bigMap").parentElement.prepend(button);
      if(map.terrain)showTerrainScale(map.terrain,$("bigMap"));
      if(map.reliefLabels)note.textContent+=" · "+map.reliefLabels.map(p=>p.name+" "+terrainHeight(map.terrain,p.x,p.z).toFixed(1)+" ม.").join(" · ");
      else if(map.terrain)note.textContent+=" · "+map.region.hint;
      if(map.strategic?.riverCity){
        note.textContent+=" · 496 × 400 เมตร\nA ค่ายบุก · D ค่ายรับ · T ลานบัญชาการ · M ตลาด · S คลัง · F โรงช่าง · W บ่อน้ำ · U1–U4 บันไดขึ้นลง";
        note.style.whiteSpace="pre-line";
      }
      $("bigMap").parentElement.append(note);
      const hunt=huntRoute(map);
      if(hunt){
        note.textContent+=" · "+map.region.hint+" · ◆ กำกับค่ายที่มีศัตรูชั้น Strong";
        const track=document.createElement("button");track.type="button";track.id="huntTrailButton";track.className="secondary";
        const sync=()=>{const on=trackedHuntMap===activeMapId;track.setAttribute("aria-pressed",String(on));track.textContent=(on?"ซ่อน":"แสดง")+"เส้นทาง · "+hunt.name;};
        track.onclick=()=>{trackedHuntMap=trackedHuntMap===activeMapId?null:activeMapId;sync();drawMap($("bigMap").getContext("2d"),420,320,true);};
        sync();$("bigMap").before(track);
      }
    }
    if(territoryState?.local?.site===activeMapId){
      const button=document.createElement("button");button.className="secondary";button.textContent="⚑ ดูด่านและสงครามกิลด์";button.onclick=openWarPanel;
      $("bigMap").parentElement.prepend(button);
    }
    const info=document.createElement("p");info.id="resourceMapInfo";info.className="note";
    $("bigMap").after(info);updateResourceHud(ownServerCharacter());
    if(economyReady() && resources){
      const atlas=document.createElement("details"),title=document.createElement("summary"),rows=document.createElement("div");
      title.textContent="ทรัพยากรทั่วโลก";rows.id="resourceAtlasRows";atlas.append(title,rows);info.after(atlas);
      atlas.ontoggle=()=>{if(atlas.open){rows.textContent="กำลังอ่านสถานะพื้นที่…";room?.send("get_resource_atlas",{});}};
    }
    drawMap($("bigMap").getContext("2d"),420,320,true);
  }

  function openOnline() { closeDrawer(); window.MontraEntry?.open(); }
  let catalogKey = "", buildCatalog = null;
