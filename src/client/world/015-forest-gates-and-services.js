  // Both maps share one scene and ground. Their static meshes are created once
  // and toggled; switching maps must not accumulate scenes or WebGL resources.
  const villageMeshes = scene.meshes.filter(mesh => mesh !== ground && mesh !== sky && !mistLayers.includes(mesh) && !mesh.metadata?.thaiTreeMaster);
  const villageLights = scene.lights.filter(light => light !== moon && light !== keyLight && light !== warm);
  const forestRoot = new B.TransformNode("forbidden-forest", scene);
  const forestLeaf = mat("forest leaves", "#203f2e");
  const forestStone = mat("forest stone", "#66706a");
  const forestPath = mat("forest path", "#75644b");
  const forestClearing = mat("forest clearing", "#4c573a");
  const portalMat = mat("portal glow", "#a0e1d2", "#2f9c8f");
  glowMats.add(portalMat);
  const portals = {
    ritual_village: { id:"village_to_forest", x:-4, z:-17, label:"เดินทางไปป่าต้องห้าม" },
    forbidden_forest: { id:"forest_to_village", x:0, z:14, label:"กลับหมู่บ้านอาคม" }
  };
  const fixedCrowns = [], forestCrowns = [];
  const campLooks = {
    west: {glyph:"เสาธง", color:"#dfb264", soil:"#7a8256"},
    east: {glyph:"รากคู่", color:"#76cc95", soil:"#607b57"},
    deep_west: {glyph:"กองหิน", color:"#a493cf", soil:"#686981"},
    deep_east: {glyph:"โคมวิญญาณ", color:"#79d9d6", soil:"#577976"},
  };
  for (const look of Object.values(campLooks)) look.material=mat(look.glyph,look.color);
  const forestFloor=mat("moss understory","#3d5340");
  // Macro moss patches plus leaf litter; a larger tile hides repetition.
  function wrappedBlob(c,s,x,y,r,rgb,alpha){
    for(const dx of [-s,0,s])for(const dy of [-s,0,s]){
      const g=c.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
      g.addColorStop(0,`rgba(${rgb},${alpha})`);g.addColorStop(1,`rgba(${rgb},0)`);
      c.fillStyle=g;c.fillRect(x+dx-r,y+dy-r,r*2,r*2);
    }
  }
  const litter=paintTexture("forest floor",512,(c,s)=>{
    c.fillStyle="#cfd6c0";c.fillRect(0,0,s,s);
    for(let i=0;i<46;i++)wrappedBlob(c,s,noise(i,101)*s,noise(i,102)*s,24+noise(i,103)*70,["150,168,120","214,222,190","118,138,102"][i%3],.55);
    for(let i=0;i<1500;i++){c.fillStyle=["#b0bda3","#c7d3b8","#a39a7c","#8f9f80"][i%4];c.fillRect(noise(i,104)*s,noise(i,105)*s,2+noise(i,106)*4,1+noise(i,107)*2);}
  },5);
  forestFloor.diffuseTexture=litter;
  forestPath.diffuseTexture=paintTexture("packed trail",128,(c,s)=>{
    c.fillStyle="#d8ccb4";c.fillRect(0,0,s,s);
    for(let i=0;i<220;i++){c.fillStyle=["#bfb196","#e6dcc6","#a89a80","#cbbfa6"][i%4];const r=1+noise(i,108)*2.5;c.beginPath();c.arc(noise(i,109)*s,noise(i,110)*s,r,0,Math.PI*2);c.fill();}
  });
  forestPath.backFaceCulling=false;
  // ป่าต้องห้าม: G04 leaf-litter floor, G02 packed trails, G03 grassy clearings.
  applyGroundSurface(forestFloor,"leaves",{tint:.25,tile:6});applyGroundSurface(forestPath,"path",{tint:.2,bump:false});applyGroundSurface(forestClearing,"grass",{uScale:3,vScale:3,tint:.2});
  const forestVerge=vergeMat("trail verge","#241f16");
  const forestGrass=mat("night grass","#2b4a30"), forestFern=mat("fern","#355a3a");
  const bushDark=mat("undergrowth","#1c3524"), bushMid=mat("moonlit shrub","#2a4a33"), mossMat=mat("moss","#3c5a36");
  const logMat=mat("fallen log","#3a2b21"), forestLeafLight=mat("upper canopy","#2a5039");
  const wildflower=mat("night jasmine","#e9e4cf","#4a4636"), wildflowerGold=mat("marigold","#e2a540","#4a2c08");
  const mushStem=mat("mushroom stem","#a9a48f"), mushCap=mat("spirit mushroom","#69d8c8","#2fb7a3");
  glowMats.add(mushCap);
  const rootSpiritMat=mat("root spirit","#84b894","#21452e");
  const elderSpiritMat=mat("night spirit","#baacd9","#3b2d54");
  const templeFloor=mat("temple sandstone","#6a655b");
  const templeCourt=mat("weathered courtyard","#7c7163");
  const templePaving=mat("limestone walk","#7a6a4f");
  templePaving.backFaceCulling=false;
  templePaving.diffuseTexture=paintTexture("processional slabs",128,(c,s)=>{
    c.fillStyle="#5c5446";c.fillRect(0,0,s,s);
    for(let row=0;row<4;row++)for(let col=0;col<2;col++){
      const x=col*64-(row%2?32:0),y=row*32;
      for(const dx of [0,128]){c.fillStyle=["#d7cdb5","#cbbfa5","#e0d6bf","#c4b79c"][(row+col)%4];c.fillRect(x+dx+3,y+3,58,26);}
    }
  });
  const templeVerge=vergeMat("walk verge","#1e1813");
  const templeBrick=mat("exposed laterite","#925d43");
  const templeStone=mat("carved lintel","#8c9281");
  const templeLacquer=mat("binding lacquer","#953f37");
  const templeBronze=mat("oxidised bronze","#578984");
  const templeGold=mat("aged gilding","#c39850","#221909");
  const templeBanner=mat("talisman banner","#ffffff","#2a0a06");
  templeBanner.diffuseTexture=paintTexture("talisman banner",128,(c,s)=>{
    c.fillStyle="#7a1a16";c.fillRect(0,0,s,s);
    c.strokeStyle="#d6a64e";c.lineWidth=4;c.strokeRect(8,6,s-16,s-12);
    c.lineWidth=3;c.beginPath();c.arc(s/2,s*.42,s*.24,0,Math.PI*2);c.stroke();
    c.beginPath();for(let i=0;i<=5;i++){const a=i*Math.PI*4/5-Math.PI/2;c.lineTo(s/2+Math.cos(a)*s*.2,s*.42+Math.sin(a)*s*.2);}c.stroke();
    c.fillStyle="#d6a64e";c.font="bold 18px sans-serif";c.textAlign="center";c.fillText("นะ มะ พะ ธะ",s/2,s*.86);
  });
  // Weathered pavers: stains, moss and hairline cracks over offset courses.
  const tile=paintTexture("worn temple pavers",512,(c,s)=>{
    c.fillStyle="#b7b29e";c.fillRect(0,0,s,s);
    for(let row=0;row<16;row++)for(let col=-1;col<9;col++){
      const x=col*64+(row%2)*32,y=row*32;
      c.fillStyle=["#d1d3bc","#dce0c8","#d6dbc2","#cdd1bc","#c3c5ad"][Math.abs(row*7+col*3)%5];c.fillRect(x+2,y+2,60,28);
    }
    for(let i=0;i<42;i++)wrappedBlob(c,s,noise(i,131)*s,noise(i,132)*s,18+noise(i,133)*60,i%3?"60,56,44":"78,112,62",.48);
    c.strokeStyle="rgba(48,42,34,.55)";c.lineWidth=1.3;
    for(let i=0;i<26;i++){let x=noise(i,134)*s,y=noise(i,135)*s;c.beginPath();c.moveTo(x,y);
      for(let k=0;k<5;k++){x+=(noise(i*5+k,136)-.5)*42;y+=(noise(i*5+k,137)-.5)*42;c.lineTo(x,y);}c.stroke();}
  });
  tile.uScale=6;tile.vScale=6.5;templeFloor.diffuseTexture=tile;
  // วัดร้าง: G12 temple stone with moss in the joints for the floor, court and processional walk.
  applyGroundSurface(templeFloor,"temple",{tint:.25,tile:5});applyGroundSurface(templeCourt,"temple",{uScale:2,vScale:2,tint:.3});applyGroundSurface(templePaving,"temple",{tint:.3,bump:false});
  templeBrick.diffuseTexture=paintTexture("laterite courses",256,(c,s)=>{
    c.fillStyle="#6b4a3a";c.fillRect(0,0,s,s);
    for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
      const x=col*64+(row%2)*32,y=row*32,k=row*40+col*6;
      c.fillStyle=["#e2b9a0","#d6a98e","#caa088","#e8c4aa","#c79a80"][Math.abs(row*5+col*7)%5];c.fillRect(x+2,y+2,60,28);
      for(let j=0;j<7;j++){c.fillStyle="rgba(90,50,30,.38)";c.fillRect(x+4+noise(k+j,141)*54,y+4+noise(k+j,142)*22,3,2);}
    }
    const moss=c.createLinearGradient(0,s,0,s*.55);moss.addColorStop(0,"rgba(70,100,60,.55)");moss.addColorStop(1,"rgba(70,100,60,0)");
    c.fillStyle=moss;c.fillRect(0,0,s,s);
  });
  templeBrick.diffuseTexture.uScale=3;templeBrick.diffuseTexture.vScale=2;
  const templeCover=[];
  const templeSight=new B.Ray(B.Vector3.Zero(),new B.Vector3(0,0,1));
  const keeperMat=mat("guardian indigo","#605079","#251a34");
  const strikeMat=mat("guardian strike","#ff9850","#de481f");
  glowMats.add(strikeMat);
  buildRoad([{x:0,z:19},{x:0,z:-19}],4.6,forestPath,forestVerge,forestRoot,7);
  const forestResourceShapes=new Map();
  // Forbidden-forest timber: takhian, sai and pradu. Each is its own clone (not an instance) so its canopy
  // can fade when it hides the hero, and so a felled tree can shrink on its own.
  const forestKinds=["takhian","pradu","sai","pradu","takhian","pradu","sai","takhian","pradu","pradu"];
  [[-6,6],[7,7],[-15,-15],[-16,-8],[-14,2],[-15,12],[15,-15],[15,-5],[15,3],[15,14]].forEach(([x,z],i)=>{
    const tree=placeThaiTree(forestKinds[i],x,0,z,{clone:true,parent:forestRoot,scale:.95+noise(i,57)*.2});
    fixedCrowns.push(tree);forestResourceShapes.set(x+","+z,[tree]);
  });
  for(const [x,z,r] of [[5,-9,1.8],[-9,-3,1.5]]) {
    const rock=B.MeshBuilder.CreateSphere("forest rock",{diameter:r*2,segments:5},scene);
    rock.position.set(x,r*.45,z);rock.scaling.y=.6;rock.material=forestStone;rock.isPickable=false;rock.parent=forestRoot;
    forestResourceShapes.set(x+","+z,[rock]);
  }
  // Ruined forest shrine: stone plinth, lacquered sanctum, gilded Thai roof,
  // candles and talisman flags. Decorative only; merged per material.
  function shrineRuin(x,z,parent,size=1,base=0){
    const parts=[];
    const add=(mesh,px,py,pz,material)=>{mesh.position.set(x+px*size,base+py*size,z+pz*size);mesh.scaling.setAll(size);mesh.material=material;mesh.isPickable=false;parts.push(mesh);return mesh;};
    const box=(px,py,pz,w,h,d,material)=>add(B.MeshBuilder.CreateBox("forest shrine",{width:w,height:h,depth:d},scene),px,py,pz,material);
    const cyl=(px,py,pz,h,b,t,material,sides=8)=>add(B.MeshBuilder.CreateCylinder("forest shrine",{height:h,diameterBottom:b,diameterTop:t,tessellation:sides},scene),px,py,pz,material);
    box(0,.3,0,4.6,.6,3.4,forestStone);box(0,.15,2.1,2.6,.3,.9,forestStone);box(0,.72,0,3.6,.24,2.6,templeStone);
    box(0,1.65,-.2,2.2,1.6,1.6,templeLacquer);box(0,1.6,.62,.7,1.1,.06,glowMat);
    for(const px of [-1.5,1.5])for(const pz of [-1.1,.9])cyl(px,1.8,pz,2.2,.24,.2,darkWood,6);
    const pitch=.85,half=1.85,rise=half*Math.tan(pitch);
    for(const side of [-1,1]){
      box(side*half/2,2.95+rise/2,-.1,half/Math.cos(pitch),.14,3.0,roofMat).rotation.z=-side*pitch;
      box(side*(half-.05),2.93,-.1,.12,.1,3.1,gold);
    }
    box(0,2.95+rise+.05,-.1,.16,.14,3.3,gold);
    for(const end of [-1,1])cyl(0,3.3+rise,-.1+end*1.65,.8,.12,0,gold,5).rotation.x=end*.55;
    cyl(0,3.4+rise,-.1,1.1,.24,0,gold,8);
    for(let i=0;i<7;i++){const h=.18+noise(i,x)*.22,cx=-1.1+i*.37;cyl(cx,.84+h/2,1.15,h,.09,.09,waxMat,6);cyl(cx,.9+h,1.15,.12,.07,0,candleMat,4);}
    for(const side of [-1,1]){cyl(side*2.6,1.5,1.6,3,.08,.08,darkWood,5);box(side*2.6+side*.22,2.4,1.6,.4,1.0,.03,clothRed);}
    const pool=lightPool(x,z+1.6*size,3.2*size,.05);pool.isPickable=false;parts.push(pool);
    const byMaterial=new Map();
    for(const part of parts){if(!byMaterial.has(part.material))byMaterial.set(part.material,[]);byMaterial.get(part.material).push(part);}
    for(const group of byMaterial.values()){const mesh=group.length>1?B.Mesh.MergeMeshes(group,true,true):group[0];if(mesh){mesh.isPickable=false;if(parent)mesh.parent=parent;}}
  }
  shrineRuin(0,-12,forestRoot,.8);
  // ---- Spirit gates: every warp point is an occult Thai gateway ----
  const gateLacquer=mat("gate black lacquer","#1d1517"), gateStone=mat("gate plinth","#3b3a3f");
  gateLacquer.specularColor=B.Color3.FromHexString("#4a3a2a");
  const ghostFlame=mat("ghost flame","#b6ffe6","#3fe6b6");glowMats.add(ghostFlame);
  const ghostPoolMat=additiveMat("ghost light",radialTexture("ghost light",128,[[0,"rgba(120,255,220,.5)"],[.35,"rgba(90,220,200,.2)"],[1,"rgba(60,180,170,0)"]]));
  const talismanPaper=mat("talisman paper","#e6c560","#3a2a06");
  talismanPaper.diffuseTexture=paintTexture("talisman script",64,(c,s)=>{
    c.fillStyle="#fff";c.fillRect(0,0,s,s);c.strokeStyle="#a8231c";c.lineWidth=3;c.strokeRect(5,4,s-10,s-8);
    c.lineWidth=2;c.beginPath();for(let i=0;i<7;i++){c.moveTo(16,12+i*6);c.quadraticCurveTo(32,6+i*6,48,12+i*6);}c.stroke();
  });
  const archMask=paintTexture("gate arch mask",128,(c,s)=>{
    c.clearRect(0,0,s,s);c.fillStyle="#fff";c.beginPath();
    c.moveTo(s*.05,s);c.lineTo(s*.05,s*.45);c.quadraticCurveTo(s*.05,s*.14,s*.5,0);c.quadraticCurveTo(s*.95,s*.14,s*.95,s*.45);c.lineTo(s*.95,s);c.closePath();
    c.shadowColor="#fff";c.shadowBlur=10;c.fill();
  });
  archMask.hasAlpha=true;
  // Soft spirit streams spiralling inward; the phantom layer carries faint
  // wailing faces that drift round with the swirl.
  function vortexTexture(name,rgb,core,faces){
    return paintTexture(name,256,(c,s)=>{
      c.fillStyle="#000";c.fillRect(0,0,s,s);
      const bg=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);bg.addColorStop(0,core);bg.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=bg;c.fillRect(0,0,s,s);
      c.lineCap="round";c.shadowColor=`rgb(${rgb})`;c.shadowBlur=12;
      for(let k=0;k<4;k++){
        let prev=null;
        for(let t=.04;t<1;t+=.02){
          const r=t*s*.5,a=k*Math.PI/2+t*5.2,pt=[s/2+Math.cos(a)*r,s/2+Math.sin(a)*r];
          if(prev){c.strokeStyle=`rgba(${rgb},${(.42*(1-t)+.06).toFixed(3)})`;c.lineWidth=3+t*16;
            c.beginPath();c.moveTo(...prev);c.lineTo(...pt);c.stroke();}
          prev=pt;
        }
      }
      c.shadowBlur=0;
      for(let i=0;i<faces;i++){
        const a=i*Math.PI*2/faces+.6,r=s*.27,x=s/2+Math.cos(a)*r,y=s/2+Math.sin(a)*r;
        c.save();c.translate(x,y);c.rotate(a+Math.PI/2);
        const g=c.createRadialGradient(0,0,0,0,0,26);g.addColorStop(0,"rgba(215,205,255,.55)");g.addColorStop(1,"rgba(215,205,255,0)");
        c.fillStyle=g;c.beginPath();c.ellipse(0,4,17,26,0,0,Math.PI*2);c.fill();
        c.fillStyle="#000";
        for(const ex of [-6,6]){c.beginPath();c.ellipse(ex,-2,3.6,5.5,0,0,Math.PI*2);c.fill();}
        c.beginPath();c.ellipse(0,13,4,7,0,0,Math.PI*2);c.fill();
        c.restore();
      }
    });
  }
  const spiralA=vortexTexture("spirit vortex","95,235,205","rgba(80,210,185,.4)",0);
  const spiralB=vortexTexture("phantom vortex","160,125,255","rgba(70,45,130,.35)",3);
  function vortexMat(name,texture){
    const m=new B.StandardMaterial(name,scene);
    m.diffuseColor=B.Color3.Black();m.specularColor=B.Color3.Black();m.emissiveTexture=texture;m.opacityTexture=archMask;
    m.disableLighting=true;m.backFaceCulling=false;m.alphaMode=B.Engine.ALPHA_ADD;return m;
  }
  const vortexA=vortexMat("spirit vortex",spiralA), vortexB=vortexMat("phantom vortex",spiralB);
  const glyphMats=["นะ","โม","พุท","ธา","ยะ","อุ","มะ"].map((g,i)=>additiveMat("orbit glyph "+i,paintTexture("orbit glyph "+i,64,(c,s)=>{
    c.clearRect(0,0,s,s);c.font="bold 34px sans-serif";c.textAlign="center";c.textBaseline="middle";
    c.shadowColor="#ffcf6a";c.shadowBlur=10;c.fillStyle="#ffe7a8";c.fillText(g,s/2,s/2+2);
  })));
  const portalFx=[];
  function makePortal(mapId, parent, override) {
    const info=override||portals[mapId];
    const root=new B.TransformNode("spirit gate "+info.id,scene);root.position.set(info.x,info.groundY||0,info.z);if(parent)root.parent=parent;
    if(mapId==="mantra_capital"){root.scaling.y=.48;if(Math.abs(info.x)>30)root.rotation.y=Math.PI/2;}
    const part=(mesh,x,y,z,material)=>{mesh.parent=root;mesh.position.set(x,y,z);mesh.material=material;mesh.isPickable=false;return mesh;};
    const box=(x,y,z,w,h,d,material)=>part(B.MeshBuilder.CreateBox("spirit gate",{width:w,height:h,depth:d},scene),x,y,z,material);
    const cone=(x,y,z,h,b,t,material,sides=6)=>part(B.MeshBuilder.CreateCylinder("spirit gate",{height:h,diameterBottom:b,diameterTop:t,tessellation:sides},scene),x,y,z,material);
    // Stepped plinth with gilded trim and the square seal.
    box(0,.15,0,5.2,.3,3.0,gateStone);box(0,.4,0,4.4,.2,2.3,gateStone);box(0,.51,1.16,4.4,.04,.04,gold);box(0,.51,-1.16,4.4,.04,.04,gold);
    const seal=B.MeshBuilder.CreateGround("gate seal",{width:5,height:5},scene);part(seal,0,.52,0,portalYantraMat);
    // Lacquered posts with gold bands and lotus bases.
    for(const side of [-1,1]){
      box(side*1.9,2.75,0,.42,4.5,.42,gateLacquer);
      for(const y of [1.0,2.6,4.2])box(side*1.9,y,0,.5,.12,.5,gold);
      cone(side*1.9,.7,0,.36,.75,.5,gold,8);
      // Ghost-fire candles at the plinth corners.
      for(const dz of [-.9,.9]){cone(side*2.3,.65,dz,.3,.12,.12,waxMat,6);cone(side*2.3,.9,dz,.24,.12,0,ghostFlame,4);}
      const pool=B.MeshBuilder.CreateGround("ghost light",{width:4.2,height:4.2},scene);part(pool,side*2.3,.53,0,ghostPoolMat);
    }
    // Lintel, pointed inner arch and a flame-crowned pediment.
    box(0,5.05,0,4.7,.34,.52,gateLacquer);box(0,4.85,0,4.5,.06,.56,gold);
    for(const side of [-1,1]){
      const rib=box(side*.85,4.15,0,1.95,.13,.2,gold);rib.rotation.z=-side*.62;
      const slope=box(side*1.3,5.95,0,3.0,.26,.7,roofMat);slope.rotation.z=-side*.62;
      const edge=box(side*1.3,6.08,0,3.1,.08,.76,gold);edge.rotation.z=-side*.62;
      const horn=cone(side*2.55,5.35,0,.9,.18,0,gold,5);horn.rotation.z=side*.85;
      // Swaying talismans and bronze bells under the lintel.
      const bell=cone(side*2.05,4.55,0,.36,.34,.14,bronzeMat,10);bell.isPickable=false;
    }
    for(let i=0;i<3;i++)cone(0,6.85+i*.32,0,.3,.42-i*.1,.32-i*.1,gold,8);
    cone(0,7.85,0,1.0,.2,0,gold,6);
    const strips=[];
    for(let i=0;i<5;i++){
      const strip=box(-1.2+i*.6,4.2,.12,.24,1.05,.02,i%2?clothRed:talismanPaper);
      strip.setPivotPoint(new B.Vector3(0,.5,0));strips.push(strip);
    }
    // Swirling spirit vortex filling the arch, two layers turning apart.
    const veilA=B.MeshBuilder.CreatePlane("spirit vortex",{width:3.36,height:4.0,sideOrientation:B.Mesh.DOUBLESIDE},scene);part(veilA,0,2.55,0,vortexA);
    const veilB=B.MeshBuilder.CreatePlane("phantom vortex",{width:3.36,height:4.0,sideOrientation:B.Mesh.DOUBLESIDE},scene);part(veilB,0,2.55,-.04,vortexB);
    // Tap target covering the whole gate.
    const hit=box(0,2.6,0,4.4,5.2,1.6,gateStone);hit.visibility=.004;hit.isPickable=true;hit.metadata={portalId:info.id};
    // Incantation syllables orbiting the gate.
    const glyphs=glyphMats.map(material=>{const g=B.MeshBuilder.CreatePlane("orbit glyph",{size:.62},scene);part(g,0,0,0,material);g.billboardMode=B.Mesh.BILLBOARDMODE_ALL;return g;});
    // Rising wisps.
    const wisps=new B.ParticleSystem("gate wisps",60,scene);
    wisps.particleTexture=motes.particleTexture;wisps.emitter=new B.Vector3(info.x,.6,info.z);
    wisps.minEmitBox=new B.Vector3(-1.5,0,-.4);wisps.maxEmitBox=new B.Vector3(1.5,.3,.4);
    wisps.color1=new B.Color4(.55,1,.88,.75);wisps.color2=new B.Color4(.7,.6,1,.6);wisps.colorDead=new B.Color4(.3,.5,.6,0);
    wisps.minSize=.25;wisps.maxSize=.7;wisps.minLifeTime=1.6;wisps.maxLifeTime=3.2;wisps.emitRate=12;
    wisps.direction1=new B.Vector3(-.15,1,-.1);wisps.direction2=new B.Vector3(.15,1,.1);wisps.minEmitPower=.5;wisps.maxEmitPower=1.1;
    wisps.blendMode=B.ParticleSystem.BLENDMODE_ADD;wisps.start();
    const labelTexture=new B.DynamicTexture("portal-label-"+mapId,{width:512,height:128},scene,false);
    labelTexture.hasAlpha=true;
    const ink=labelTexture.getContext();ink.font="bold 46px sans-serif";ink.textAlign="center";ink.lineJoin="round";
    const text=override ? (override.label || worldDefinitions?.[override.targetMapId]?.name || override.targetMapId) : (mapId==="ritual_village" ? "ป่าต้องห้าม" : "หมู่บ้านอาคม");
    ink.lineWidth=9;ink.strokeStyle="rgba(4,14,14,.92)";ink.strokeText(text,256,80,490);
    ink.shadowColor="#5fffe0";ink.shadowBlur=16;ink.fillStyle="#dcfff6";ink.fillText(text,256,80,490);labelTexture.update();
    const labelMat=new B.StandardMaterial("portal-label-mat-"+mapId,scene);
    labelMat.diffuseTexture=labelTexture;labelMat.opacityTexture=labelTexture;
    labelMat.emissiveColor=B.Color3.White();labelMat.disableLighting=true;labelMat.backFaceCulling=false;
    const label=B.MeshBuilder.CreatePlane("portal-label",{width:override?7.2:5.2,height:override?1.8:1.3},scene);
    part(label,0,9.1,0,labelMat);label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    if(override)expansionResources.push(labelTexture,labelMat,wisps);
    portalFx.push({root,strips,glyphs,wisps,seed:info.x*.37+info.z*.11});
    return root;
  }
  function animatePortals(elapsed,dt){
    spiralA.wAng-=dt*1.1;spiralB.wAng+=dt*.7;
    portalYantraMat.alpha=.75+Math.sin(elapsed*2.2)*.25;
    for(let i=portalFx.length-1;i>=0;i--){
      const fx=portalFx[i];
      if(fx.root.isDisposed()){portalFx.splice(i,1);continue;}
      const on=fx.root.isEnabled();fx.wisps.emitRate=on?12:0;if(!on)continue;
      const t=elapsed+fx.seed;
      fx.glyphs.forEach((g,k)=>{const a=t*.55+k*Math.PI*2/fx.glyphs.length;g.position.set(Math.cos(a)*2.7,2.7+Math.sin(t*1.3+k)*.45,Math.sin(a)*1.5);});
      fx.strips.forEach((strip,k)=>{strip.rotation.z=Math.sin(t*1.7+k*.9)*.14;strip.rotation.x=Math.sin(t*1.2+k)*.1;});
    }
  }
  // Rest wards: a white sacred cord (sai sin) strung on stakes, with talismans.
  const sacredCord=mat("sai sin cord","#efe9d6","#3a372c");
  function sacredCordWard(cx,cz,radius,parent){
    const parts=[],posts=Math.max(10,Math.round(radius*2.6));
    const point=k=>[cx+Math.cos(k/posts*Math.PI*2)*radius,cz+Math.sin(k/posts*Math.PI*2)*radius];
    for(let k=0;k<posts;k++){
      const [x,z]=point(k),[nx,nz]=point(k+1);
      const stake=B.MeshBuilder.CreateCylinder("ward stake",{height:.8,diameter:.1,tessellation:5},scene);
      stake.position.set(x,.4,z);stake.material=darkWood;parts.push(stake);
      const cord=B.MeshBuilder.CreateBox("sai sin",{width:Math.hypot(nx-x,nz-z),height:.035,depth:.035},scene);
      cord.position.set((x+nx)/2,.66,(z+nz)/2);cord.rotation.y=-Math.atan2(nz-z,nx-x);cord.material=sacredCord;parts.push(cord);
      if(k%3===0){const tag=B.MeshBuilder.CreateBox("ward talisman",{width:.18,height:.3,depth:.02},scene);
        tag.position.set(x,.48,z);tag.rotation.y=-Math.atan2(nz-z,nx-x);tag.material=talismanPaper;parts.push(tag);}
    }
    const byMaterial=new Map();
    for(const m of parts){m.isPickable=false;if(!byMaterial.has(m.material))byMaterial.set(m.material,[]);byMaterial.get(m.material).push(m);}
    for(const group of byMaterial.values()){const merged=B.Mesh.MergeMeshes(group,true,true);if(merged){merged.isPickable=false;merged.parent=parent;}}
  }
  const villagePortal=makePortal("ritual_village");
  const forestPortal=makePortal("forbidden_forest",forestRoot);forestRoot.setEnabled(false);
  // Map geometry is supplied by the authoritative server; legacy servers keep the old scene.
  let worldDefinitionKey = "", worldDefinitions = null, expandedMapKey = "";
  const expansionRoot = new B.TransformNode("world-expansion",scene);
  const serviceNpcUi={
    smith:{color:"#a87145",action:"เปิดโรงช่างอาคม",persona:"warrior",dialogue:"เลือกตีบวกอุปกรณ์หรือแปรรูปคุณภาพด้วยการสุ่มออปชัน ข้าดูแลงานคราฟต์และการ์ดให้ด้วย"},
    market:{color:"#806493",action:"เปิดตลาดและการค้า",persona:"merchant",dialogue:"มาดูของฝากขายหรือแลกเปลี่ยนกับผู้เล่นคนอื่นได้"},
    guild:{color:"#985b50",action:"จัดการกิลด์",persona:"elder",dialogue:"อยากตั้งกิลด์ ดูสมาชิก หรือประสานกำลังรบ คุยกับข้าได้"},
    party:{color:"#547d70",action:"เปิดปาร์ตี้",persona:"warrior",dialogue:"รวมเพื่อนออกสำรวจและแบ่งหน้าที่กันได้ที่นี่"},
    travel:{color:"#527b91",action:"ดูแผนที่",persona:"guide",dialogue:"ข้าช่วยดูเส้นทาง จุดพัก และทางออกของพื้นที่นี้ได้"},
    strategy:{color:"#a08145",action:"ดูแผนที่ยุทธศาสตร์",persona:"warrior",dialogue:"ตรวจด่าน เส้นทาง และเวลาของสงครามแต่ละพื้นที่ได้"},
    mentor:{color:"#785b53",action:"ดูวิชาอาชีพ",persona:"elder",dialogue:"มาตรวจวิชาของเจ้าได้ การเรียนบางวิชายังต้องทำที่ลานหมู่บ้าน"},
    guide:{color:"#74835b",action:"เปิดคู่มือ",persona:"guide",dialogue:"หากเพิ่งมาถึง ข้าช่วยอธิบายวิธีเล่นและการเดินทางได้"},
  };
  const serviceNpcLooks=new Map();
  function serviceNpcLook(role,name){
    if(serviceNpcLooks.has(role))return serviceNpcLooks.get(role);
    const spec=serviceNpcUi[role],robe=mat("service robe "+role,spec.color);
    const label=mat("service label "+role,"#ffffff","#4b3921");
    label.diffuseTexture=paintTexture("service name "+role,256,(ctx,size)=>{
      // Name plate: dark jade pill with a thin gold edge, matching the field HUD, readable from the far camera.
      ctx.clearRect(0,0,size,size);ctx.textAlign="center";ctx.textBaseline="middle";ctx.font='bold 34px "Noto Sans Thai", system-ui, sans-serif';
      const w=Math.min(244,ctx.measureText(name).width+40),h=52,x=(size-w)/2,y=size/2-h/2,r=h/2;
      ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
      ctx.fillStyle="rgba(10,18,15,.86)";ctx.fill();ctx.lineWidth=3;ctx.strokeStyle="rgba(232,190,100,.9)";ctx.stroke();
      ctx.fillStyle="#ffe6ae";ctx.fillText(name,size/2,size/2+2,w-24);
    });
    label.diffuseTexture.hasAlpha=true;label.useAlphaFromDiffuseTexture=true;
    const result={robe,label};serviceNpcLooks.set(role,result);return result;
  }
  function buildServiceNpcs(map){
    for(const npc of Array.isArray(map?.serviceNpcs)?map.serviceNpcs:[]){
      if(!Object.hasOwn(serviceNpcUi,npc.role) || typeof npc.name!=="string" || ![npc.x,npc.y,npc.z,npc.radius].every(Number.isFinite))continue;
      const root=new B.TransformNode("service npc "+npc.id,scene);root.parent=expansionRoot;root.position.set(npc.x,npc.y,npc.z);
      const look=serviceNpcLook(npc.role,npc.name);
      const body=B.MeshBuilder.CreateCylinder("service npc body",{height:1.3,diameterTop:.52,diameterBottom:.82,tessellation:8},scene);
      body.parent=root;body.position.y=.76;body.material=look.robe;body.isPickable=false;
      const head=B.MeshBuilder.CreateSphere("service npc head",{diameter:.44,segments:8},scene);
      head.parent=root;head.position.y=1.6;head.material=rangerHead.material;head.isPickable=false;
      const cap=B.MeshBuilder.CreateCylinder("service npc cap",{height:.22,diameterTop:.4,diameterBottom:.72,tessellation:8},scene);
      cap.parent=root;cap.position.y=1.92;cap.material=look.robe;cap.isPickable=false;
      attachNpcAvatar(root,npc.id,look.robe,[body,head,cap]);
      const label=B.MeshBuilder.CreatePlane("service npc label",{width:3.6,height:2.2},scene);
      label.parent=root;label.position.y=3;label.material=look.label;label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;label.isPickable=false;
      const hit=B.MeshBuilder.CreateBox("service npc interaction",{width:2.2,height:3,depth:2.2},scene);
      hit.parent=root;hit.position.y=1.4;hit.visibility=.001;hit.metadata={serviceNpc:npc};
    }
  }
  // One reusable quest-giver model follows the server's NPC placement per map.
  const questRangerRoot=new B.TransformNode("quest ranger",scene);questRangerRoot.setEnabled(false);
  const rangerBody=B.MeshBuilder.CreateCylinder("quest ranger body",{height:1.35,diameterTop:.55,diameterBottom:.85,tessellation:8},scene);
  const rangerRobes=[mat("quest ranger robe earth","#76543a"),mat("quest ranger robe moss","#4e6953"),mat("quest ranger robe indigo","#465a72"),mat("quest ranger robe rust","#784a43")];
  rangerBody.parent=questRangerRoot;rangerBody.position.y=.8;rangerBody.material=rangerRobes[0];rangerBody.isPickable=false;
  const rangerHead=B.MeshBuilder.CreateSphere("quest ranger head",{diameter:.46,segments:8},scene);
  rangerHead.parent=questRangerRoot;rangerHead.position.y=1.7;rangerHead.material=mat("quest ranger skin","#c89b70");rangerHead.isPickable=false;
  const rangerHat=B.MeshBuilder.CreateCylinder("quest ranger hat",{height:.25,diameterTop:.25,diameterBottom:.9,tessellation:8},scene);
  rangerHat.parent=questRangerRoot;rangerHat.position.y=2.02;rangerHat.material=mat("quest ranger hat material","#c5a46a");rangerHat.isPickable=false;
  const rangerLabelMat=mat("quest ranger label","#ffffff","#705427");
  rangerLabelMat.diffuseTexture=paintTexture("quest ranger name",256,(ctx,size)=>{ctx.clearRect(0,0,size,size);ctx.fillStyle="#ffdf85";ctx.textAlign="center";ctx.font="bold 39px sans-serif";ctx.fillText("! ผู้มอบงาน",size/2,size/2);});
  rangerLabelMat.diffuseTexture.hasAlpha=true;rangerLabelMat.useAlphaFromDiffuseTexture=true;
  const rangerLabel=B.MeshBuilder.CreatePlane("quest ranger label",{width:3.4,height:2.3},scene);
  rangerLabel.parent=questRangerRoot;rangerLabel.position.y=3.2;rangerLabel.material=rangerLabelMat;rangerLabel.billboardMode=B.Mesh.BILLBOARDMODE_ALL;rangerLabel.isPickable=false;
  const rangerHitbox=B.MeshBuilder.CreateBox("quest ranger interaction",{width:2.4,height:3.2,depth:2.4},scene);
  rangerHitbox.parent=questRangerRoot;rangerHitbox.position.y=1.4;rangerHitbox.visibility=.001;rangerHitbox.metadata={questRanger:true};
  const defenseKeeperRoot=new B.TransformNode("defense keeper",scene);defenseKeeperRoot.setEnabled(false);
  const defenseBody=B.MeshBuilder.CreateCylinder("defense keeper body",{height:1.3,diameterTop:.55,diameterBottom:.8,tessellation:8},scene);
  defenseBody.parent=defenseKeeperRoot;defenseBody.position.y=.75;defenseBody.material=rangerRobes[3];defenseBody.isPickable=false;
  const defenseHead=B.MeshBuilder.CreateSphere("defense keeper head",{diameter:.45,segments:8},scene);
  defenseHead.parent=defenseKeeperRoot;defenseHead.position.y=1.65;defenseHead.material=rangerHead.material;defenseHead.isPickable=false;
  const defenseLabelMat=mat("defense keeper label","#ffffff","#705427");
  defenseLabelMat.diffuseTexture=paintTexture("defense keeper name",256,(ctx,size)=>{ctx.clearRect(0,0,size,size);ctx.fillStyle="#ffe0ae";ctx.textAlign="center";ctx.font="bold 34px sans-serif";ctx.fillText("ผู้ดูแลเสบียง",size/2,size/2);});
  defenseLabelMat.diffuseTexture.hasAlpha=true;defenseLabelMat.useAlphaFromDiffuseTexture=true;
  const defenseLabel=B.MeshBuilder.CreatePlane("defense keeper label",{width:3.4,height:2.3},scene);
  defenseLabel.parent=defenseKeeperRoot;defenseLabel.position.y=3.1;defenseLabel.material=defenseLabelMat;defenseLabel.billboardMode=B.Mesh.BILLBOARDMODE_ALL;defenseLabel.isPickable=false;
  const defenseHitbox=B.MeshBuilder.CreateBox("defense keeper interaction",{width:2.4,height:3.2,depth:2.4},scene);
  defenseHitbox.parent=defenseKeeperRoot;defenseHitbox.position.y=1.4;defenseHitbox.visibility=.001;defenseHitbox.metadata={questDefense:true};
  const escortRoot=new B.TransformNode("quest escort",scene);escortRoot.setEnabled(false);
  const escortBody=B.MeshBuilder.CreateCylinder("escort body",{height:1.2,diameterTop:.5,diameterBottom:.72,tessellation:8},scene);
  escortBody.parent=escortRoot;escortBody.position.y=.7;escortBody.material=rangerRobes[2];escortBody.isPickable=false;
  const escortHead=B.MeshBuilder.CreateSphere("escort head",{diameter:.42,segments:8},scene);
  escortHead.parent=escortRoot;escortHead.position.y=1.52;escortHead.material=rangerHead.material;escortHead.isPickable=false;
  const escortLabelMat=mat("escort label","#ffffff","#354565");
  escortLabelMat.diffuseTexture=paintTexture("escort name",256,(ctx,size)=>{ctx.clearRect(0,0,size,size);ctx.fillStyle="#ddedff";ctx.textAlign="center";ctx.font="bold 36px sans-serif";ctx.fillText("ผู้เดินทาง",size/2,size/2);});
  escortLabelMat.diffuseTexture.hasAlpha=true;escortLabelMat.useAlphaFromDiffuseTexture=true;
  const escortLabel=B.MeshBuilder.CreatePlane("escort label",{width:3,height:2},scene);
  escortLabel.parent=escortRoot;escortLabel.position.y=2.8;escortLabel.material=escortLabelMat;escortLabel.billboardMode=B.Mesh.BILLBOARDMODE_ALL;escortLabel.isPickable=false;
  const quartermasterRoot=new B.TransformNode("war quartermaster",scene);quartermasterRoot.setEnabled(false);
  const quartermasterBody=B.MeshBuilder.CreateCylinder("quartermaster body",{height:1.25,diameterTop:.5,diameterBottom:.8,tessellation:8},scene);
  quartermasterBody.parent=quartermasterRoot;quartermasterBody.position.y=.75;quartermasterBody.material=rangerRobes[0];quartermasterBody.isPickable=false;
  const quartermasterHead=B.MeshBuilder.CreateSphere("quartermaster head",{diameter:.42,segments:8},scene);
  quartermasterHead.parent=quartermasterRoot;quartermasterHead.position.y=1.6;quartermasterHead.material=rangerHead.material;quartermasterHead.isPickable=false;
  const quartermasterLabelMat=mat("quartermaster label","#ffffff","#705427");
  quartermasterLabelMat.diffuseTexture=paintTexture("quartermaster name",256,(ctx,size)=>{ctx.clearRect(0,0,size,size);ctx.fillStyle="#ffe5a9";ctx.textAlign="center";ctx.font="bold 37px sans-serif";ctx.fillText("พลเสบียง",size/2,size/2);});
  quartermasterLabelMat.diffuseTexture.hasAlpha=true;quartermasterLabelMat.useAlphaFromDiffuseTexture=true;
  const quartermasterLabel=B.MeshBuilder.CreatePlane("quartermaster label",{width:3,height:2},scene);
  quartermasterLabel.parent=quartermasterRoot;quartermasterLabel.position.y=2.9;quartermasterLabel.material=quartermasterLabelMat;quartermasterLabel.billboardMode=B.Mesh.BILLBOARDMODE_ALL;quartermasterLabel.isPickable=false;
  const quartermasterHitbox=B.MeshBuilder.CreateBox("quartermaster interaction",{width:2,height:3,depth:2},scene);
  quartermasterHitbox.parent=quartermasterRoot;quartermasterHitbox.position.y=1.4;quartermasterHitbox.visibility=.001;quartermasterHitbox.metadata={warQuartermaster:true};
  const expansionResources = [], expansionLabels = [];
  const forestMonsters = new Map();
  let selectedForestTarget = null;
  function mapBounds() {
    return worldDefinitions?.[activeMapId]?.bounds || {minX:-20,maxX:20,minZ:-20,maxZ:20};
  }
  function activePortals() {
    return worldDefinitions?.[activeMapId]?.portals || [portals[activeMapId]];
  }
  function activePortal(id) {
    const choices=activePortals(),me=ownServerCharacter();
    if(id)return choices.find(p=>p.id===id);
    return choices.reduce((best,p)=>!best||(me&&Math.hypot(me.x-p.x,me.z-p.z)<Math.hypot(me.x-best.x,me.z-best.z))?p:best,null);
  }
  function expansionLabel(text,x,z,width=12,elevation=4) {
    const texture=new B.DynamicTexture("world-label",{width:768,height:128},scene,false);
    texture.hasAlpha=true;
    const ink=texture.getContext();ink.font="bold 44px sans-serif";ink.textAlign="center";
    ink.lineJoin="round";ink.lineWidth=9;ink.strokeStyle="rgba(14,9,6,.92)";ink.strokeText(text,384,83,742);
    ink.shadowColor="rgba(255,170,70,.75)";ink.shadowBlur=14;
    ink.fillStyle="#ffe4a8";ink.fillText(text,384,83,742);texture.update();
    const material=new B.StandardMaterial("world-label",scene);
    material.diffuseTexture=texture;material.opacityTexture=texture;material.emissiveColor=B.Color3.White();material.disableLighting=true;
    const mesh=B.MeshBuilder.CreatePlane("world-label",{width,height:2.2},scene);
    mesh.parent=expansionRoot;mesh.material=material;mesh.position.set(x,elevation+(worldDefinitions?.[activeMapId]?.reliefLabels?terrainHeight(worldDefinitions[activeMapId].terrain,x,z):0),z);mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;
    expansionResources.push(texture,material);expansionLabels.push(mesh);
  }
