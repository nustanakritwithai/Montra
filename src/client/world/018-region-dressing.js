  // ---- Atlas region dressing: decorative only, kept clear of every trail,
  // court, gate, rest ward, wall, pool and obstacle the server defines. ----
  const regionWaters=new Map();
  function regionWater(id){
    if(!regionWaters.has(id)){
      const m=water.clone(id+" water"),t=riverRipple.clone();t.uScale=3;t.vScale=1;m.emissiveTexture=t;
      if(["moon_pass","river_watch","lotus_basin","sam_lan_estuary"].includes(id)){
        // Opaque water keeps the available bridge gaps legible at the tactical camera distance.
        m.emissiveTexture=null;m.disableLighting=true;
        m.emissiveColor=B.Color3.FromHexString(id==="lotus_basin"?"#337b71":id==="moon_pass"?"#357782":"#396e8a");
      }
      if(id==="drowned_marsh" || id==="naga_cavern"){
        m.emissiveTexture=null;m.disableLighting=true;
        m.emissiveColor=B.Color3.FromHexString(id==="naga_cavern"?"#286579":"#32645f");
      }
      if(id==="spirit_rift"){
        m.diffuseColor=B.Color3.FromHexString("#33284e");m.emissiveColor=B.Color3.FromHexString("#483568");
      }
      regionWaters.set(id,m);
    }
    return regionWaters.get(id);
  }
  function crackTexture(name,rgb,glowRgb){
    return paintTexture(name,256,(c,s)=>{
      c.clearRect(0,0,s,s);c.lineCap="round";c.shadowColor=`rgb(${glowRgb})`;c.shadowBlur=10;
      for(let k=0;k<7;k++){
        let x=s/2,y=s/2,a=k*.9+noise(k,name.length)*1.2;
        c.strokeStyle=`rgba(${rgb},.9)`;c.lineWidth=4;c.beginPath();c.moveTo(x,y);
        for(let j=0;j<7;j++){a+=(noise(k*7+j,211)-.5)*1.1;x+=Math.cos(a)*17;y+=Math.sin(a)*17;c.lineTo(x,y);c.lineWidth=Math.max(1,4-j*.5);}
        c.stroke();
      }
    });
  }
  const decor={
    bone:mat("bone white","#d6cfbb"),ash:mat("ash grey","#3b3734"),deadWood:mat("dead wood","#4a4038"),
    rock:mat("dark rock","#36343a"),pine:mat("ridge pine","#1b2c22"),pineHi:mat("ridge pine high","#284032"),
    bamboo:mat("bamboo","#8a7a4a"),flagWhite:mat("funeral flag","#e7e1d2","#26241e"),
    ember:mat("ember","#ff8a3d","#ff5a1a"),willo:mat("will-o-wisp","#c4ff9e","#6aff5a"),
    crystal:mat("naga crystal","#86f5e8","#2fd8c8"),crystalV:mat("rift crystal","#c9a6ff","#8a4dff"),
    iron:mat("rusted iron","#4a3a32"),awning:mat("tattered awning","#8a6a2a"),
  };
  for(const m of [decor.ember,decor.willo,decor.crystal,decor.crystalV])glowMats.add(m);
  // Province materials: whitewashed Ayutthaya brick, war banners, foliage, silver ore, floating lamps.
  const provinceFx={
    brick:mat("whitewashed brick","#ffffff","#141210"),banner:mat("war banner","#a8261c","#4a0a06"),
    canopy:mat("rain tree canopy","#1f3a2a","#050c08"),canopyHi:mat("rain tree crown","#2c4a34","#08120c"),bark:mat("old bark","#3a2c22"),
    ribbon:mat("sacred ribbon","#d8a83a","#3a2808"),tent:mat("camp canvas","#8a7a5a","#141008"),ore:mat("moon silver","#cfe4ff","#6a8ac8"),
    floatLamp:mat("floating lamp","#ffd08a","#ff9a3a"),jar:mat("dragon jar","#5a3422","#120804"),naga:mat("naga lacquer","#3a7a6a","#0c2a24"),
  };
  glowMats.add(provinceFx.ore);glowMats.add(provinceFx.floatLamp);
  // Ayutthaya building stock: exposed Mon brick (thin red-orange bricks in
  // dark mortar), porous laterite blocks for footings, and weathered timber.
  provinceFx.brick.diffuseTexture=paintTexture("mon brick",256,(c,s)=>{
    c.fillStyle="#4a2a1e";c.fillRect(0,0,s,s);
    const rows=16,cols=5,rh=s/rows;
    for(let r=0;r<rows;r++)for(let k=-1;k<=cols;k++){
      const bx=(k+(r%2)*.5)*s/cols,v=noise(r*17+k,561),w=noise(r*5+k,562);
      c.fillStyle=`rgb(${150+v*55|0},${70+v*30+w*10|0},${44+v*18|0})`;c.fillRect(bx+1.5,r*rh+1.5,s/cols-3,rh-3);
      if(w>.8){c.fillStyle="rgba(30,18,12,.45)";c.fillRect(bx+4,r*rh+3,s/cols*.4,rh-6);} // burnt or chipped brick
    }
    for(let i=0;i<10;i++){const g=c.createRadialGradient(noise(i,563)*s,s,0,noise(i,563)*s,s,40+noise(i,564)*80);g.addColorStop(0,"rgba(30,40,24,.6)");g.addColorStop(1,"rgba(30,40,24,0)");c.fillStyle=g;c.fillRect(0,0,s,s);} // moss and damp from the ground up
  });
  provinceFx.brick.diffuseColor=B.Color3.FromHexString("#e8d8cc");provinceFx.brick.emissiveColor=B.Color3.FromHexString("#1a0c08");
  provinceFx.laterite=mat("laterite","#ffffff","#140a06");
  const paintLaterite=(c,s)=>{
    c.fillStyle="#3a2418";c.fillRect(0,0,s,s);
    const rows=4,cols=3,rh=s/rows;
    for(let r=0;r<rows;r++)for(let k=-1;k<=cols;k++){
      const bx=(k+(r%2)*.5)*s/cols,v=noise(r*11+k,571);
      c.fillStyle=`rgb(${120+v*40|0},${62+v*22|0},${38+v*14|0})`;c.fillRect(bx+3,r*rh+3,s/cols-6,rh-6);
    }
    for(let i=0;i<520;i++){c.fillStyle=i%3?"rgba(40,20,12,.55)":"rgba(190,120,70,.35)";c.beginPath();c.arc(noise(i,572)*s,noise(i,573)*s,1+noise(i,574)*3.2,0,6.28);c.fill();} // pitted laterite
  };
  provinceFx.laterite.diffuseTexture=paintTexture("laterite",256,paintLaterite);
  // Wall-walk paving tiled to the deck's length (one texture per direction).
  const deckMats={};
  provinceFx.deck=(timber,along,len)=>{
    const key=(timber?"plank":"laterite")+(along?"x":"z")+Math.round(len);
    if(!deckMats[key]){
      const m=mat("wall walk "+key,"#ffffff",timber?"#0c0806":"#140a06"),reps=Math.max(1,Math.round(len/(timber?2:3)));
      m.diffuseTexture=timber?paintTexture("wall walk "+key,128,paintPlank):paintTexture("wall walk "+key,256,paintLaterite);
      m.diffuseTexture.uScale=along?1:reps;m.diffuseTexture.vScale=along?reps:1;deckMats[key]=m; // box top faces map u along z
    }
    return deckMats[key];
  };
  provinceFx.timber=mat("stockade timber","#ffffff","#0e0906");
  provinceFx.timber.diffuseTexture=paintTexture("stockade timber",128,(c,s)=>{
    c.fillStyle="#5a3e2a";c.fillRect(0,0,s,s);
    for(let i=0;i<40;i++){c.fillStyle=i%2?"rgba(30,18,10,.45)":"rgba(140,104,70,.25)";c.fillRect(noise(i,581)*s,0,1+noise(i,582)*2.5,s);}
    for(let i=0;i<6;i++){c.fillStyle="rgba(25,14,8,.6)";c.beginPath();c.ellipse(noise(i,583)*s,noise(i,584)*s,2,5,0,0,6.28);c.fill();} // knots
  });
  provinceFx.plank=mat("plank deck","#ffffff","#0c0806");
  const paintPlank=(c,s)=>{
    c.fillStyle="#4a3424";c.fillRect(0,0,s,s);
    for(let y=0;y<s;y+=16){c.fillStyle=`rgb(${80+noise(y,585)*30|0},${56+noise(y,586)*20|0},${38+noise(y,587)*12|0})`;c.fillRect(0,y+1,s,14);}
  };
  provinceFx.plank.diffuseTexture=paintTexture("plank deck",128,paintPlank);
  provinceFx.plank.diffuseTexture.uScale=4;provinceFx.plank.diffuseTexture.vScale=4;
  const lavaMat=additiveMat("lava cracks",crackTexture("lava cracks","255,120,40","255,70,20"));
  const voidMat=additiveMat("void cracks",crackTexture("void cracks","190,140,255","140,80,255"));
  const greenPool=additiveMat("marsh light",radialTexture("marsh light",128,[[0,"rgba(150,255,120,.5)"],[.35,"rgba(110,230,120,.2)"],[1,"rgba(80,200,100,0)"]]));
  const violetPool=additiveMat("rift light",radialTexture("rift light",128,[[0,"rgba(190,150,255,.55)"],[.35,"rgba(150,110,255,.22)"],[1,"rgba(120,80,255,0)"]]));
  const bloodSeal=additiveMat("blood seal",squareYantraTexture("blood seal","rgba(255,80,60,.9)","#ff3020"));
  const riftSeal=additiveMat("rift seal",squareYantraTexture("rift seal","rgba(200,160,255,.85)","#9a60ff"));
  function nearMapPath(map,x,z,d){
    return (map.paths||[]).some(path=>path.some((p,i)=>{if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<d;}));
  }
  function sceneryClear(x,z,courts,map){
    return !nearMapPath(map,x,z,3)&&
      !(map.camps||[]).some(c=>Math.hypot(x-c.x,z-c.z)<courts)&&!(map.portals||[]).some(p=>Math.hypot(x-p.x,z-p.z)<6)&&
      !(map.restAreas||[]).some(r=>Math.hypot(x-r.x,z-r.z)<r.radius+1)&&!(map.obstacles||[]).some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+1.4)&&
      !(map.walls||[]).some(w=>x>w.x-1&&x<w.x+w.width+1&&z>w.z-1&&z<w.z+w.length+1)&&
      !(map.water||[]).some(w=>x>w.x-.8&&x<w.x+w.width+.8&&z>w.z-.8&&z<w.z+w.length+.8);
  }
  // Scenery for the strategic provinces (capital, forts, frontier hunts). It
  // keeps clear of roads, sites, gates, stairs and the wall walk, so it never
  // hides a route the server lets players use.
  function dressProvince(map,paint,{box,cone,put,roof,lamp,city,bamboo,lotus}){
    const b=map.bounds,{sites,rampart}=map.strategic,id=map.id,{stone}=paint;
    const ball=(x,y,z,d,m,seg=5)=>put(B.MeshBuilder.CreateSphere("province dressing",{diameter:d,segments:seg},scene),x,y,z,m);
    const inBox=(x,z,w,pad)=>x>w.x-pad&&x<w.x+w.width+pad&&z>w.z-pad&&z<w.z+w.length+pad;
    const clear=(x,z,pad=2.5)=>sceneryClear(x,z,12,map)&&!sites.some(s=>Math.hypot(x-s.x,z-s.z)<(s.kind==="palace"?13:7))&&
      !(rampart&&(rampart.deck.some(w=>inBox(x,z,w,pad))||rampart.stairs.some(st=>Math.hypot(x-(st.foot.x+st.top.x)/2,z-(st.foot.z+st.top.z)/2)<5)));
    const scatter=(count,seed,fn,pad)=>{for(let i=0,n=0;i<count*10&&n<count;i++){
      const x=b.minX+3+noise(i,seed)*(b.maxX-b.minX-6),z=b.minZ+3+noise(i,seed+1)*(b.maxZ-b.minZ-6);
      if(clear(x,z,pad)){fn(x,z,n);n++;}}};
    const elev=(x,z)=>map.reliefLabels?terrainHeight(map.terrain,x,z):0;
    const tree=(species,x,z,scale=1)=>placeThaiTree(species,x,elev(x,z),z,{parent:expansionRoot,scale});
    const rock=(kind,x,z,scale=1)=>placeRock(kind,x,elev(x,z),z,{parent:expansionRoot,scale});
    // Avenue trees: sacred pho (with cloth), yang-na and tamarind from the Thai tree kit.
    const rainTree=(x,z,k)=>{sceneryPoint("wood",x,z,1.1);tree(["pho","yangna","makham"][k%3],x,z,.72+noise(k,601)*.18);};
    // Decorative trees and stones (no gather point, kept off roads and sites).
    const grove=(count,seed,kinds,scale=.75)=>scatter(count,seed,(x,z,k)=>tree(kinds[k%kinds.length],x,z,scale+noise(k,seed+2)*.2),3);
    const stones=(count,seed,kinds,scale=.6)=>scatter(count,seed,(x,z,k)=>rock(kinds[k%kinds.length],x,z,scale+noise(k,seed+2)*.35),2);
    const brazier=(x,z)=>{addLightSpot(x,1.6,z,"#ff8a3d",1.1);cone(x,.45,z,.9,.18,.3,decor.iron,6);cone(x,.98,z,.24,.42,.7,decor.iron,8);cone(x,1.25,z,.5,.42,0,decor.ember,5);
      const g=put(B.MeshBuilder.CreateGround("province glow",{width:4.2,height:4.2},scene),x,.05,z,lightPoolMat);};
    const spiritHouse=(x,z,k)=>{cone(x,.8,z,1.6,.14,.12,darkWood,5);box(x,1.75,z,.9,.6,.7,templeLacquer);roof(x,2.25,z,1.1,.9);box(x,1.5,z+.42,.6,.06,.2,provinceFx.floatLamp);};
    const flagPole=(x,z,k)=>{cone(x,3,z,6,.14,.1,gold,5);for(let j=0;j<5;j++){const f=box(x+.35,5.6-j*.55,z,.6,.42,.04,j%2?provinceFx.ribbon:provinceFx.banner);f.rotation.z=Math.sin(j+k)*.12;}};
    if(city){
      // Avenue trees and dragon jars inside the walls; chedi skyline beyond them.
      scatter(26,611,rainTree,3);stones(8,612,["plain"],.45);
      scatter(18,613,(x,z,k)=>{ball(x,.55,z,1.1,provinceFx.jar,6);cone(x,1.08,z,.12,.5,.6,provinceFx.jar,8);if(k%3===0)ball(x+.9,.4,z+.3,.8,provinceFx.jar,6);},2);
      for(const path of map.paths)for(let i=1;i<path.length;i++){const a=path[i-1],c=path[i],len=Math.hypot(c.x-a.x,c.z-a.z);
        for(let t=9;t<len-4;t+=18){const nx=-(c.z-a.z)/len,nz=(c.x-a.x)/len,x=a.x+(c.x-a.x)*t/len+nx*3.6,z=a.z+(c.z-a.z)*t/len+nz*3.6;if(clear(x,z,1.5))flagPole(x,z,i+t);}}
      for(let i=0;i<14;i++){const side=i%2?1:-1,x=side*(48+noise(i,615)*8),z=-60+i*6.5,h=7+noise(i,616)*5;
        // Ruined Ayutthaya chedi: laterite base, brick bell and a broken spire.
        box(x,.7,z,5,1.4,5,provinceFx.laterite);cone(x,1.9,z,1,4.2,4.4,provinceFx.brick,8);ball(x,3.6,z,3.6,provinceFx.brick,8);
        const spire=cone(x,3.6+h/2,z,h*(i%3?1:.6),1.2,i%3?.05:.5,provinceFx.brick,8);spire.rotation.z=(noise(i,619)-.5)*.12;}
      for(let i=0;i<8;i++){const x=-36+i*10,z=-74-noise(i,617)*5,h=6+noise(i,618)*4;box(x,.6,z,4.6,1.2,4.6,provinceFx.laterite);
        for(let k=0;k<3;k++)box(x,1.4+k*.7,z,3.8-k*.7,.7,3.8-k*.7,provinceFx.brick);cone(x,3.4+h/2,z,h,1.8,.3,provinceFx.brick,4).rotation.y=Math.PI/4;}
    }else if(map.strategic.kind==="territory"){
      // War camp: tents, cannons on carriages, stacked supplies, braziers and a palisade rim.
      scatter(9,621,(x,z,k)=>{cone(x,1.1,z,2.2,3.2,0,provinceFx.tent,4).rotation.y=Math.PI/4;cone(x,2.4,z,.5,.1,.06,darkWood,4);box(x,.6,z+1.3,.8,1.2,.04,provinceFx.banner);},4);
      scatter(7,623,(x,z,k)=>{box(x,.35,z,1.1,.3,1.8,wooden);for(const d of [-1,1])cone(x+d*.6,.4,z,.12,.8,.8,darkWood,10).rotation.z=Math.PI/2;
        const barrel=cone(x,.75,z+.3,2.2,.32,.42,decor.iron,8);barrel.rotation.x=Math.PI/2-.18;},3);
      scatter(14,625,(x,z,k)=>{for(let j=0;j<3;j++)box(x+(j%2)*.9,.45+(j>1?.9:0),z,.85,.85,.85,crateWood);if(k%2)ball(x-.9,.45,z,.9,provinceFx.jar,6);},2);
      scatter(10,627,brazier,3);
      scatter(6,629,flagPole,2.5);
      grove(14,651,["yangna","takhian","pradu","makham"]);stones(12,653,["plain","plain","moss"]);
      for(let i=0;i<46;i++){const t=i/46,w=b.maxX-b.minX,x=t<.5?b.minX+1+(t*2)*w*.98:(i%2?b.minX+1:b.maxX-1),z=t<.5?b.minZ+1:b.minZ+((t-.5)*2)*(b.maxZ-b.minZ);
        const st=cone(x,1.2,z,2.4+noise(i,631)*.8,.32,.08,darkWood,5);st.rotation.z=(noise(i,632)-.5)*.3;}
      if(id==="moon_pass"){const mine=sites.find(s=>s.kind==="mine");
        if(mine)for(let k=0;k<10;k++){const a=k*.63,r=4+noise(k,633)*3,x=mine.x+Math.cos(a)*r,z=mine.z+Math.sin(a)*r;sceneryPoint("stone",x,z,.55);placeRock(k%3?"iron2":"iron3",x,map.reliefLabels?terrainHeight(map.terrain,x,z):0,z,{parent:expansionRoot,scale:.55+noise(k,634)*.25});}}
      if(id==="river_watch")for(const w of map.water||[]){const horizontal=w.width>w.length;
        for(let k=0;k<3;k++){const t=(k+.5)/3,x=w.x+(horizontal?w.width*t:w.width/2),z=w.z+(horizontal?w.length/2:w.length*t);
          if(sites.some(s=>Math.hypot(x-s.x,z-s.z)<6))continue;
          const hull=box(x,.2,z,horizontal?3.6:1.1,.35,horizontal?1.1:3.6,wooden);cone(x,.65,z,.8,.9,.7,provinceFx.tent,6);}}
    }else{
      // Frontier hunts: roadside spirit houses, braziers at the camps, prayer flags.
      scatter(10,641,spiritHouse,2);
      for(const c of map.camps||[])for(let k=0;k<3;k++){const a=k*2.1+.4;brazier(c.x+Math.cos(a)*8.5,c.z+Math.sin(a)*8.5);}
      scatter(8,643,flagPole,2);
      if(bamboo){grove(14,655,["phai","phai","takhian"],.8);stones(10,657,["moss","plain"]);}
      else if(lotus){grove(14,659,["maprao","tan","makham","sai"],.75);stones(8,661,["moss","plain"],.5);}
      else{grove(12,663,["makham","tan","yangna"]);stones(10,665,["plain","moss"]);}
      if(bamboo)scatter(4,645,(x,z,k)=>{for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*1.1,1.8,z+dz*1.1,3.6,.2,.16,decor.bamboo,5);
        box(x,3.6,z,2.8,.16,2.8,wooden);roof(x,4.6,z,3.2,3.2);},4);
      if(lotus){for(const w of map.water||[])for(let k=0;k<Math.floor(w.width*w.length/30);k++){
          const x=w.x+.8+noise(k+w.x,647)*(w.width-1.6),z=w.z+.4+noise(k+w.z,648)*(w.length-.8);
          cone(x,.13,z,.08,.7,.8,forestLeaf,8);cone(x,.3,z,.3,.45,.1,provinceFx.floatLamp,6);}
        const pond=sites.find(s=>s.kind==="shrine");
        if(pond)for(const side of [-1,1]){const x=pond.x+side*3.2,z=pond.z+3.5;
          cone(x,.5,z,1,1.2,1.2,stone,8);for(let j=0;j<5;j++)ball(x+side*j*.05,1.1+j*.42,z-j*.12,.62-j*.06,provinceFx.naga,6);
          const hood=cone(x,3.3,z-.7,1.1,1.5,.2,provinceFx.naga,7);hood.rotation.x=-.5;ball(x,3.05,z-.25,.2,decor.crystal,4);}}
    }
  }
  function dressRegion(map,paint){
    let parts=[];
    const put=(mesh,x,y,z,m)=>{mesh.position.set(x,y+(map.reliefLabels?terrainHeight(map.terrain,x,z):0),z);mesh.material=m;mesh.isPickable=false;parts.push(mesh);return mesh;};
    const box=(x,y,z,w,h,d,m)=>put(B.MeshBuilder.CreateBox("region dressing",{width:w,height:h,depth:d},scene),x,y,z,m);
    const cone=(x,y,z,h,b,t,m,n=6)=>put(B.MeshBuilder.CreateCylinder("region dressing",{height:h,diameterBottom:b,diameterTop:t,tessellation:n},scene),x,y,z,m);
    const ball=(x,y,z,d,m,seg=4)=>put(B.MeshBuilder.CreateSphere("region dressing",{diameter:d,segments:seg},scene),x,y,z,m);
    const decal=(x,z,size,m,rot=0,y=.05)=>{
      if(size>=2.5&&(m===lightPoolMat||m===greenPool||m===violetPool))addLightSpot(x,1.8,z,m===greenPool?"#9dff7a":m===violetPool?"#b48aff":"#ffa65a",Math.min(1.2,size/3.6));
      const g=put(B.MeshBuilder.CreateGround("region decal",{width:size,height:size},scene),x,y,z,m);g.rotation.y=rot;return g;};
    const b=map.bounds,id=map.id,{stone,deep,light,court,road}=paint;
    // Themed rock models (rock kit in the materials file): instances seated on the terrain, size from the old sphere diameter.
    const rock=(kind,x,z,d)=>placeRock(kind,x,map.reliefLabels?terrainHeight(map.terrain,x,z):0,z,{parent:expansionRoot,scale:d*.55});
    const tree=(species,x,z,scale=1)=>placeThaiTree(species,x,map.reliefLabels?terrainHeight(map.terrain,x,z):0,z,{parent:expansionRoot,scale});
    const clear=(x,z,courts=12.5)=>sceneryClear(x,z,courts,map);
    const scatter=(count,seed,fn,courts)=>{for(let i=0,n=0;i<count*8&&n<count;i++){
      const x=b.minX+2.5+noise(i,seed)*(b.maxX-b.minX-5),z=b.minZ+2.5+noise(i,seed+1)*(b.maxZ-b.minZ-5);
      if(clear(x,z,courts)){fn(x,z,n);n++;}}};
    // Points just beyond the playfield rim, for skyline silhouettes.
    const rim=(count,seed,fn)=>{for(let i=0;i<count;i++){
      const t=i/count,d=4+noise(i,seed)*12,w=b.maxX-b.minX,h=b.maxZ-b.minZ;
      const [x,z]=t<.3?[b.minX-d,b.minZ+h*t/.3]:t<.6?[b.maxX+d,b.minZ+h*(t-.3)/.3]:[b.minX+w*(t-.6)/.4,b.minZ-d];
      fn(x,z,i);
    }};
    // Lamps every ~10 units along each trail, offset to alternating verges.
    const alongTrails=(step,offset,fn)=>(map.paths||[]).forEach((path,pi)=>{for(let i=1;i<path.length;i++){
      const a=path[i-1],c=path[i],len=Math.hypot(c.x-a.x,c.z-a.z),nx=-(c.z-a.z)/len,nz=(c.x-a.x)/len;
      for(let t=step/2;t<len;t+=step){const side=((Math.round(t)+i+pi)%2)?1:-1,x=a.x+(c.x-a.x)*t/len+nx*offset*side,z=a.z+(c.z-a.z)*t/len+nz*offset*side;
        if(!(map.portals||[]).some(p=>Math.hypot(x-p.x,z-p.z)<6)&&!(map.walls||[]).some(w=>x>w.x-.6&&x<w.x+w.width+.6&&z>w.z-.6&&z<w.z+w.length+.6))fn(x,z);}
    }});
    const deadTree=(x,z,k,m=decor.deadWood)=>{
      sceneryPoint("wood",x,z,.9);
      const h=4+noise(k,301)*3;cone(x,h/2,z,h,.8,.14,m,5).rotation.z=(noise(k,302)-.5)*.3;
      for(let j=0;j<4;j++){const br=cone(x+(j-1.5)*.35,h*(.5+j*.12),z,2.2-j*.35,.2,.02,m,4);br.rotation.z=(j-1)*.9+(noise(k+j,303)-.5)*.4;br.rotation.y=j*2.1;}
    };
    const brazier=(x,z,flame=decor.ember,pool=lightPoolMat)=>{
      cone(x,.45,z,.9,.18,.3,decor.iron,6);cone(x,.98,z,.24,.42,.7,decor.iron,8);cone(x,1.25,z,.5,.42,0,flame,5);decal(x,z,4.2,pool,0,.05);
    };
    const reliquary=(x,z,k,m=decor.bone)=>{
      const sz=1.1+noise(k,311)*.8,lean=(noise(k,312)-.5)*.2;
      box(x,sz*.2,z,sz,sz*.4,sz,deep);
      const bell=cone(x,sz*.62,z,sz*.5,sz*.75,sz*.4,m,8);bell.rotation.z=lean;
      const spire=cone(x+lean*sz*.6,sz*1.1,z,sz*.6,sz*.28,0,m,8);spire.rotation.z=lean;
    };
    if(id==="drowned_marsh"){
      scatter(34,321,(x,z,k)=>{deadTree(x,z,k);for(let j=0;j<2;j++)box(x+(j?.4:-.3),2.2,z,.05,1.2+noise(k+j,322)*.8,.05,mossMat);});
      // Banyans with hanging roots and mossy stones along the marsh.
      scatter(9,320,(x,z,k)=>tree("sai",x,z,.7+noise(k,319)*.2),12.5);
      scatter(12,318,(x,z,k)=>rock("moss",x,z,.9+noise(k,317)*.6),12.5);
      scatter(70,323,(x,z,k)=>{for(let j=0;j<4;j++){const h=.7+noise(k*4+j,324)*.9;cone(x+(noise(k*4+j,325)-.5)*1.2,h/2,z+(noise(k*4+j,326)-.5)*1.2,h,.1,0,reedMat,3);}},12.5);
      for(const w of map.water||[])for(let t=1.5;t<w.width;t+=2.6)if(noise(t+w.x,327)>.45)cone(w.x+t,.08,w.z+.6+noise(t,328)*(w.length-1.2),.02,.8,.8,lotusPad,10);
      alongTrails(10,2.8,(x,z)=>{cone(x,1.1,z,2.2,.1,.08,decor.deadWood,5);box(x,2.2,z,.6,.06,.06,decor.deadWood);cone(x+.25,1.95,z,.34,.26,.2,decor.willo,6);decal(x+.25,z,3.6,greenPool);});
      rim(16,331,(x,z,k)=>{const sz=4+noise(k,332)*2;for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*sz*.4,.8,z+dz*sz*.4,2,.25,.2,decor.deadWood,5);
        box(x,2.6,z,sz,1.8,sz*.8,deep);box(x-sz*.5-.02,2.6,z,.05,.5,.6,decor.willo);
        for(const side of [-1,1])box(x+side*sz*.28,3.95,z,sz*.66,.14,sz*.95,roofMat).rotation.z=-side*.75;});
      const lm=map.obstacles.find(o=>o.id==="landmark");
      if(lm){for(let k=0;k<9;k++){const a=k/9*Math.PI*2;cone(lm.x+Math.cos(a)*3.6,.2,lm.z+Math.sin(a)*3.6,.4,.12,.12,waxMat,6);cone(lm.x+Math.cos(a)*3.6,.48,lm.z+Math.sin(a)*3.6,.16,.1,0,decor.willo,4);}
        decal(lm.x,lm.z,9,greenPool);}
    }else if(id==="moon_cemetery"){
      scatter(85,341,(x,z,k)=>{if(k%3)reliquary(x,z,k,k%2?decor.bone:stone);else{const slab=box(x,.5,z,.7,1,.18,stone);slab.rotation.z=(noise(k,342)-.5)*.3;slab.rotation.y=noise(k,343)*.6;}});
      scatter(12,345,(x,z,k)=>{const h=6+noise(k,346)*2;cone(x,h/2,z,h,.12,.08,decor.bamboo,5);
        for(let j=0;j<7;j++)box(x+.2,h-.4-j*.42,z,.34,.36,.02,decor.flagWhite).rotation.z=Math.sin(j*.9+k)*.12;});
      scatter(20,347,(x,z,k)=>deadTree(x,z,k,decor.ash));
      // Ngiu (silk-cotton) trees, the cemetery's spirit trees, and weathered stones.
      scatter(7,350,(x,z,k)=>tree(k%2?"ngiu":"sai",x,z,.7+noise(k,351)*.2),12.5);
      scatter(10,352,(x,z,k)=>rock("plain",x,z,.8+noise(k,353)*.6),12.5);
      const pyre=map.camps.find(c=>c.id==="court2");
      if(pyre){for(let j=0;j<4;j++)for(let l=0;l<3;l++)box(pyre.x,.2+j*.32,pyre.z-.9+l*.9,2.6,.26,.26,decor.deadWood).rotation.y=j%2?Math.PI/2:0;
        cone(pyre.x,1.7,pyre.z,1.2,1.4,0,decor.ember,6);decal(pyre.x,pyre.z,8,lightPoolMat);}
      alongTrails(11,2.6,(x,z)=>{for(let j=0;j<3;j++){cone(x+j*.22-.22,.15,z,.3,.09,.09,waxMat,6);cone(x+j*.22-.22,.36,z,.12,.07,0,candleMat,4);}decal(x,z,2.6,lightPoolMat);});
      rim(24,349,(x,z,k)=>reliquary(x,z,k+50,stone));
    }else if(id==="hex_ridge"){
      // Ridge forest: tall takhian and yang-na from the tree kit.
      scatter(30,361,(x,z,k)=>{sceneryPoint("wood",x,z,.9);tree(k%3?"takhian":"yangna",x,z,.62+noise(k,362)*.2);});
      scatter(40,365,(x,z,k)=>{const d=.8+noise(k,366)*1.4;sceneryPoint("stone",x,z,d/2);rock(k%3===0?"iron1":"plain",x,z,d);},12.5);
      for(const w of map.walls||[])for(let t=1;t<w.width;t+=2.2)for(const side of [-1,1]){const k=t*7+side;if(noise(k,367)<.4)continue;
        const d=.8+noise(k,368)*1.2,z=w.z+w.length/2+side*(w.length/2+.5);sceneryPoint("stone",w.x+t,z,d/2);rock(k%4===0?"iron2":"plain",w.x+t,z,d);}
      scatter(10,369,(x,z,k)=>{const tab=box(x,1.1,z,1.2,2.2,.4,stone);tab.rotation.y=noise(k,370)*3;for(let j=0;j<4;j++)box(x,.5+j*.42,z,.9,.06,.44,light).rotation.y=tab.rotation.y;});
      for(const camp of map.camps)for(let side=0;side<2;side++){
        const a=side*Math.PI+.8,x1=camp.x+Math.cos(a)*13,z1=camp.z+Math.sin(a)*13,x2=camp.x+Math.cos(a+.9)*13,z2=camp.z+Math.sin(a+.9)*13;
        for(const [x,z] of [[x1,z1],[x2,z2]])cone(x,1.6,z,3.2,.1,.08,decor.deadWood,5);
        for(let j=1;j<9;j++){const t=j/9;box(x1+(x2-x1)*t,3-Math.sin(t*Math.PI)*.5,z1+(z2-z1)*t,.26,.34,.02,[clothRed,talismanPaper,lotusPad,decor.flagWhite][j%4]).rotation.y=-Math.atan2(z2-z1,x2-x1);}
      }
      rim(30,371,(x,z,k)=>{const h=8+noise(k,372)*8;cone(x,h/2,z,h,8+noise(k,373)*5,1,decor.rock,5);});
    }else if(id==="naga_cavern"){
      // Stalagmites, with every third one an iron-ore vein from the rock kit.
      scatter(80,381,(x,z,k)=>{sceneryPoint("stone",x,z,.5);if(k%3===0){rock(k%2?"iron2":"iron1",x,z,1.3);return;}const h=1+noise(k,382)*2.6;cone(x,h/2,z,h,.5+noise(k,383)*.5,0,decor.rock,5);},12.5);
      scatter(26,385,(x,z,k)=>{const m=k%3?decor.crystal:decor.crystalV;for(let j=0;j<4;j++){const h=.8+noise(k*4+j,386)*1.4,px=x+(j-1.5)*.3,pz=z+(noise(j+k,387)-.5)*.5;
        sceneryPoint("stone",px,pz,.35);const c=cone(px,h/2,pz,h,.36,0,m,5);c.rotation.z=(j-1.5)*.28;}decal(x,z,4,k%3?ghostPoolMat:violetPool);});
      const lm=map.obstacles.find(o=>o.id==="landmark");
      if(lm){for(let k=0;k<22;k++){const a=k/22*Math.PI*1.7+.4,r=3.4+Math.sin(k*.7)*.3;ball(lm.x+Math.cos(a)*r,.45+Math.sin(k*.9)*.2,lm.z+Math.sin(a)*r,.9-k*.02,k%2?templeBronze:gold,5);}
        const head=cone(lm.x+Math.cos(.4)*3.4,1.3,lm.z+Math.sin(.4)*3.4,1.6,.8,.2,templeBronze,6);head.rotation.x=-.4;
        for(const fan of [-1,0,1])cone(lm.x+Math.cos(.4)*3.4+fan*.3,2.2,lm.z+Math.sin(.4)*3.4,.8,.2,0,gold,4).rotation.z=-fan*.5;}
      rim(44,389,(x,z,k)=>{const h=7+noise(k,390)*9;cone(x,h/2,z,h,5+noise(k,391)*5,.6,decor.rock,5);});
    }else if(id==="fallen_city"){
      scatter(45,401,(x,z,k)=>rock("laterite",x,z,1.3+noise(k,402)*.9),12.5); // laterite rubble from the fallen walls
      scatter(8,408,(x,z,k)=>tree(k%2?"pho":"sai",x,z,.72+noise(k,409)*.2),12.5); // bodhi and banyan roots splitting the ruins
      for(const w of map.walls||[]){
        for(const side of [-1,1])box(w.x+w.width/2+side*w.width*.24,4.9,w.z+w.length/2,w.width*.56,.18,w.length+.6,roofMat).rotation.z=-side*.55;
        box(w.x-.05,2.2,w.z+w.length*.3,.06,.7,.6,glowMat);
      }
      const market=map.camps.find(c=>c.id==="court1");
      if(market)for(let k=0;k<6;k++){const a=k/6*Math.PI*2+.3,x=market.x+Math.cos(a)*14,z=market.z+Math.sin(a)*14;if(!clear(x,z,13))continue;
        for(const dx of [-.8,.8])cone(x+dx,1,z,2,.1,.1,decor.deadWood,5);
        box(x,2.05,z,2,.06,1.4,k%2?decor.awning:clothRed).rotation.z=.25;box(x,.6,z,1.6,.5,.9,crateWood);}
      alongTrails(10,2.7,(x,z)=>{cone(x,1.6,z,3.2,.12,.1,decor.iron,6);box(x,3.2,z,.5,.06,.06,decor.iron);cone(x+.22,2.9,z,.38,.3,.24,lanternPaper,6);decal(x+.22,z,3.6,lightPoolMat);});
      rim(30,405,(x,z,k)=>{const w=4+noise(k,406)*4,h=4+noise(k,407)*7;box(x,h/2,z,w,h,w*.8,deep);
        if(k%2)for(const side of [-1,1])box(x+side*w*.25,h+.6,z,w*.6,.2,w*.9,roofMat).rotation.z=-side*.6;else cone(x,h+1.6,z,3.2,w*.5,0,stone,6);});
    }else if(id==="asura_peak"){
      scatter(30,421,(x,z,k)=>decal(x,z,5+noise(k,422)*4,lavaMat,noise(k,423)*3,.05),11);
      scatter(34,425,(x,z,k)=>{const d=.9+noise(k,426)*1.6;sceneryPoint("stone",x,z,d/2);rock(k%3===0?"iron3":"plain",x,z,d);if(k%3===0)cone(x,d*.55,z,.3,.3,0,decor.ember,4);},12.5);
      alongTrails(12,2.8,(x,z)=>brazier(x,z));
      const spears=map.camps.find(c=>c.id==="court2");
      if(spears)for(let k=0;k<10;k++){const a=k/10*Math.PI*2,x=spears.x+Math.cos(a)*12.8,z=spears.z+Math.sin(a)*12.8;if(nearMapPath(map,x,z,2.6))continue;
        const sp=cone(x,1.5,z,3,.08,.08,decor.iron,5);sp.rotation.z=Math.cos(a)*.25;sp.rotation.x=-Math.sin(a)*.25;cone(x,3.1,z,.5,.16,0,decor.ember,4);}
      scatter(8,429,(x,z,k)=>{const h=6;cone(x,h/2,z,h,.14,.1,decor.iron,5);box(x+.4,h-1.2,z,.8,2,.03,clothRed);});
      rim(28,431,(x,z,k)=>{const h=9+noise(k,432)*10;cone(x,h/2,z,h,7+noise(k,433)*6,.4,decor.rock,5);if(k%4===0)cone(x,h*.85,z,h*.3,2,0,decor.ember,5);});
      // Ruined asura head on the northern skyline.
      box(0,4,b.minZ-12,7,8,6,deep);box(0,5.6,b.minZ-8.9,5.4,.6,.2,decor.ember);
      for(const side of [-1,0,1])cone(side*2,9.5,b.minZ-12,3+(side?0:1.5),1.6,0,gold,5).rotation.z=-side*.25;
      for(const side of [-1,1])cone(side*2.6,2,b.minZ-8.6,1.6,.6,0,decor.bone,4).rotation.x=Math.PI;
    }else if(id==="spirit_rift"){
      scatter(22,441,(x,z,k)=>decal(x,z,5+noise(k,442)*4,voidMat,noise(k,443)*3,.05),11);
      scatter(22,445,(x,z,k)=>{for(let j=0;j<3;j++){const h=1.2+noise(k*3+j,446)*2.4,px=x+(j-1)*.4;sceneryPoint("stone",px,z,.4);const c=cone(px,h/2,z,h,.45,0,decor.crystalV,5);c.rotation.z=(j-1)*.3;}decal(x,z,4,violetPool);});
      rim(26,447,(x,z,k)=>{const d=3+noise(k,448)*5,y=4+noise(k,449)*7;cone(x,y,z,d*1.2,.4,d,decor.rock,6);ball(x,y+d*.6,z,d*.9,deep,5).scaling.y=.4;});
      for(let k=0;k<12;k++){const x=b.minX+8+noise(k,451)*(b.maxX-b.minX-16),z=b.minZ+8+noise(k,452)*(b.maxZ-b.minZ-16),y=7+noise(k,453)*6,d=1.2+noise(k,454)*2;
        sceneryPoint("stone",x,z,d/2);
        cone(x,y,z,d*1.3,.2,d,decor.rock,5);ball(x,y+d*.65,z,d,deep,4).scaling.y=.35;}
      for(const o of map.obstacles)if(o.id.startsWith("relic-"))decal(o.x,o.z,5,riftSeal,0,.06);
      const last=map.camps.find(c=>c.id==="court3");if(last)decal(last.x,last.z,16,riftSeal,Math.PI/4,.055);
      if(map.boss){const {x,z}=map.boss;decal(x,z,16,bloodSeal,0,.06);
        for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,ox=x+Math.cos(a)*8.6,oz=z+Math.sin(a)*8.6;
          box(ox,1.6,oz,.7,3.2,.7,deep);cone(ox,3.6,oz,.9,.9,0,decor.crystalV,4);
          const nx=x+Math.cos(a+Math.PI/4)*8.6,nz=z+Math.sin(a+Math.PI/4)*8.6;
          box((ox+nx)/2,2.4,(oz+nz)/2,Math.hypot(nx-ox,nz-oz),.06,.06,clothRed).rotation.y=-Math.atan2(nz-oz,nx-ox);}}
    }
    for(const {mesh} of mergeByCell(parts)){mesh.name=id+" dressing";mesh.parent=expansionRoot;}
  }
  function fadeTempleWalls(hero) {
    const eye=camera.position,ray=templeSight;
    ray.origin.set(hero.x,hero.y+1.1,hero.z);
    eye.subtractToRef(ray.origin,ray.direction);
    ray.length=ray.direction.length();if(!ray.length)return;ray.direction.scaleInPlace(1/ray.length);
    for(const cover of templeCover){
      const box=cover.getBoundingInfo().boundingBox;
      cover.visibility=ray.intersectsBoxMinMax(box.minimumWorld,box.maximumWorld) ? .26 : 1;
    }
  }
