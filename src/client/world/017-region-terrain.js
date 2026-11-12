  // Palette and silhouettes are local art. Traversable geometry always comes from the room.
  const regionStyles = {
    twin_neck_pass:["#869e72","#d2b17a","#88927c","#787168","#e1b766","#354c50"],
    sam_lan_estuary:["#76927b","#cfab78","#9aa98b","#827968","#f4c567","#354c51"],
    tri_wiang_castle:["#6a7858","#c2aa83","#99a283","#857368","#f3d183","#334f54"],
    mantra_capital:["#8a9276","#d7b582","#adb79a","#8b7d68","#ffdc93","#425955"],
    moon_pass:["#758358","#c4ab7c","#9caa74","#77756d","#f5cf81","#405a63"],
    river_watch:["#758b82","#c4aa78","#8caaa0","#706a60","#97e5dc","#354f63"],
    bamboo_frontier:["#62884c","#b89a68","#89ad69","#645b45","#b9e991","#344b3d"],
    lotus_basin:["#61887b","#bda885","#91ac8a","#616e74","#eca4b4","#344b65"],
    drowned_marsh: ["#537861","#aa936d","#819769","#5b5643","#99e9bb","#376f79"],
    moon_cemetery: ["#696e78","#b3a58e","#858799","#767885","#e7cda0","#4b445d"],
    hex_ridge: ["#718153","#bca27b","#94a46a","#746d61","#f0cb65","#405747"],
    naga_cavern: ["#506a73","#9caaa1","#708d89","#495c70","#70e1c4","#433f65"],
    fallen_city: ["#82796f","#bda783","#9c8a75","#8c5c4c","#e1bd65","#515c66"],
    asura_peak: ["#775a55","#be9273","#9c7160","#54484a","#ffa164","#632f3d"],
    spirit_rift: ["#686190","#b0a1cc","#857daf","#64567f","#c4abff","#373458"],
  };
  const REGION_GROUNDS = {
    twin_neck_pass:["grass","path","temple"], sam_lan_estuary:["sand","path","temple"], tri_wiang_castle:["grass","laterite","laterite"],
    mantra_capital:["grass","temple","temple"], moon_pass:["grass","path","rock"], river_watch:["grass","gravel","temple"],
    bamboo_frontier:["bamboo","path","temple"], lotus_basin:["mud","sand","temple"], drowned_marsh:["marsh","mud","gravel"],
    moon_cemetery:["cemetery","temple","temple"], hex_ridge:["rock","path","rock"], naga_cavern:["rock","gravel","temple"],
    fallen_city:["dirt","laterite","laterite"], asura_peak:["ash","rock","rock"], spirit_rift:["rift","cemetery","rift"] };
  const regionPaints=new Map();
  const forestReliefRoad=mat("forest ridge trail","#968763","#322f1b");
  const templeReliefRoad=mat("temple terrace paving","#ae9874","#3a3126");
  const civicRoad=mat('protected jade paving','#8eb6a0','#243e38');
  applyGroundSurface(civicRoad,"temple",{uScale:1,vScale:1,tint:.55,bump:false,bright:.78}); // safe roads keep their jade hue on laid stone
  function regionPaint(id) {
    if(!regionStyles[id])return null;
    if(!regionPaints.has(id)){
      const [floor,road,court,stone,light,deep]=regionStyles[id].map((color,i)=>mat(id+"-"+i,color,i===4?color:undefined));
      const terrain=new B.DynamicTexture(id+" terrain grain",256,scene,true);
      const ink=terrain.getContext();
      ink.fillStyle="#f0eee5";ink.fillRect(0,0,256,256);
      for(let i=0;i<210;i++){
        const x=(i*71+(i*i)%79)%256,y=(i*43+(i*i)%67)%256;
        ink.fillStyle=i%4===0?"#c4c9c0":"#dadbd0";
        ink.fillRect(x,y,2+i%7,1+i%3);
      }
      const province=worldDefinitions?.[id]?.strategic;
      if(id==="fallen_city" || province?.kind==="capital"){
        ink.strokeStyle="#bcc1b8";ink.lineWidth=2;
        for(let row=0;row<8;row++)for(let col=-1;col<5;col++)ink.strokeRect(col*64+row%2*32,row*32,64,32);
      }
      const castleBounds=id==="tri_wiang_castle" && worldDefinitions?.[id]?.bounds;
      terrain.update();terrain.uScale=castleBounds?(castleBounds.maxX-castleBounds.minX)*.095:9;
      terrain.vScale=castleBounds?(castleBounds.maxZ-castleBounds.minZ)*.095:12;floor.diffuseTexture=terrain;
      // Ground surfaces per region (floor, road, court) from the G01–G16 library; the palette still tints them.
      const kinds=REGION_GROUNDS[id] || ["grass","path","temple"];
      applyGroundSurface(floor,kinds[0],{tint:.35,tile:6});applyGroundSurface(road,kinds[1],{uScale:1,vScale:1,tint:.3,bump:false,bright:.72});applyGroundSurface(court,kinds[2],{uScale:terrain.uScale,vScale:terrain.vScale,tint:.35});
      // Night grade: the atlas palette is kept but pulled down toward moonlight.
      const outerHunt=worldDefinitions?.[id]?.huntTrail;
      const clearTerrain=province || outerHunt;
      floor.diffuseColor.scaleInPlace(clearTerrain ? .88:.58);court.diffuseColor.scaleInPlace(clearTerrain ? .83:.5);road.diffuseColor.scaleInPlace(clearTerrain ? .94:.66);
      if(clearTerrain){floor.emissiveColor=floor.diffuseColor.scale(.22);road.emissiveColor=road.diffuseColor.scale(outerHunt ? .28:.17);}
      if(outerHunt){court.emissiveColor=court.diffuseColor.scale(.17);stone.emissiveColor=stone.diffuseColor.scale(.12);}
      stone.diffuseColor.scaleInPlace(.8);deep.diffuseColor.scaleInPlace(.7);
      glowMats.add(light);
      regionPaints.set(id,{floor,road,court,stone,light,deep});
    }
    return regionPaints.get(id);
  }
  const castleRings=new Map(),riverPostRings=new Map();
  function syncCastleRings(){
    for(const [id,ring] of castleRings){
      const local=territoryState?.local,v=local?.pilot;
      const owner=id===7?v?.throne?.victor:v?.points.find(p=>p.id===id)?.owner;
      ring.material=owner==="attack"?warEnemyMat:owner==="defend"?warAllyMat:id===7 && local?.phase==="battle" && local.seconds>900?forestStone:gold;
    }
  }
  const castleDoors=new Map();
  function syncGateVisual(){
    const local=territoryState?.local;
    for(const [id,ring] of riverPostRings){
      const post=local?.inField && local.phase==="battle" && local.river?.posts.find(p=>p.id===id);
      ring.material=post?.contested?gold:post?.owner==="attack"?warEnemyMat:post?.owner==="defend"?warAllyMat:templeBronze;
    }
    // Updated servers report every gate. Older ordinary fields only own the
    // first gate, so retain their single-door rendering until the VPS upgrades.
    const gates=local?.river?.gates ?? local?.pilot?.gates ?? local?.gates;
    const legacyGate=!gates && !local?.river && !local?.pilot && worldDefinitions?.[activeMapId]?.strategic?.rampart?.gates?.[0]?.id;
    for(const [id,door] of castleDoors)door.setEnabled(Boolean(local?.inField && local.site===activeMapId && local.phase==="battle" &&
      (gates?.[id]?.closed ?? (id===legacyGate && local.gateClosed))));
  }
  let appliedVillageTerrain;
  function alignVillage(terrain){
    if(terrain===appliedVillageTerrain)return;
    appliedVillageTerrain=terrain;
    for(const tree of villageTreeNodes)tree.position.y=terrain?terrainHeight(terrain,tree.position.x,tree.position.z):0;
    for(const item of villageBatches){
      const {mesh,anchors}=item,kind=B.VertexBuffer.PositionKind;
      if(mesh.isDisposed()||!mesh.getVerticesData(kind))continue; // never let one lost batch stop the world loading
      if(!item.base)item.base=mesh.getVerticesData(kind).slice();
      const points=item.base.slice(),inv=mesh.computeWorldMatrix(true).clone().invert();
      const up=B.Vector3.TransformNormal(B.Axis.Y,inv);
      let v=0;
      for(const a of anchors){
        const dy=terrain && !a.fixedHeight?terrainHeight(terrain,a.x,a.z):0;
        for(let k=0;k<a.count;k++,v+=3){points[v]+=up.x*dy;points[v+1]+=up.y*dy;points[v+2]+=up.z*dy;}
      }
      mesh.setVerticesData(kind,points);mesh.refreshBoundingInfo();
    }
  }
  function playerLayer(p){
    if(!p)return NaN;
    const t=worldDefinitions?.[activeMapId]?.terrain;
    return Number(p.y)-(t?terrainHeight(t,p.x,p.z):0);
  }
  function terrainCell(cuts,v){
    const i=cuts.findIndex(n=>n>v);
    return i<0?cuts.length-2:Math.max(0,i-1);
  }
  // ---- Ground patches: soft-edged pools of a second surface (grass, moss, leaves, gravel …) so no floor
  // reads as one flat colour. Visual only, laid a few millimetres over the floor and under roads and courts.
  const PATCH_KINDS={grass:["dirt","moss","leaves"],dirt:["grass","gravel","moss"],sand:["grass","mud"],mud:["grass","marsh","moss"],
    marsh:["mud","moss"],cemetery:["moss","dirt","gravel"],rock:["gravel","moss","dirt"],ash:["rock","gravel"],rift:["ash","rock"],
    bamboo:["leaves","moss","mud"],leaves:["moss","mud","grass"],temple:["moss","leaves"]};
  const MAP_FLOORS={ritual_village:"dirt",forbidden_forest:"leaves",bound_temple:"temple"};
  let patchMask=null;const patchMats=new Map();
  function groundPatchMask(){
    if(patchMask)return patchMask;
    // A soft blob with a ragged edge, used as the opacity of every patch (second UV set).
    patchMask=paintTexture("ground patch mask",128,(c,s)=>{
      c.clearRect(0,0,s,s);const h=s/2;
      for(let i=0;i<9;i++){const a=i/9*Math.PI*2,r=s*(.14+noise(i,71)*.12),x=h+Math.cos(a)*s*.16,y=h+Math.sin(a)*s*.16;
        const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,"rgba(255,255,255,.95)");g.addColorStop(.55,"rgba(255,255,255,.6)");g.addColorStop(1,"rgba(255,255,255,0)");
        c.fillStyle=g;c.fillRect(0,0,s,s);}
      const g=c.createRadialGradient(h,h,0,h,h,h*.62);g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(1,"rgba(255,255,255,0)");c.fillStyle=g;c.fillRect(0,0,s,s);
    });
    patchMask.hasAlpha=true;patchMask.coordinatesIndex=1;patchMask.wrapU=patchMask.wrapV=B.Texture.CLAMP_ADDRESSMODE;
    return patchMask;
  }
  function groundPatchMaterial(kind,base){
    const key=kind+":"+base.toHexString();if(patchMats.has(key))return patchMats.get(key);
    const m=new B.StandardMaterial("ground patch "+kind,scene);m.diffuseColor=base.clone();
    applyGroundSurface(m,kind,{uScale:1,vScale:1,tint:.35,bump:false,bright:1});
    m.diffuseColor=new B.Color3(base.r*.5+m.diffuseColor.r*.5,base.g*.5+m.diffuseColor.g*.5,base.b*.5+m.diffuseColor.b*.5);
    m.opacityTexture=groundPatchMask();m.useAlphaFromDiffuseTexture=false;m.backFaceCulling=true;m.zOffset=-1;
    m.specularColor=new B.Color3(.03,.03,.03);m.metadata={noShadow:true};
    patchMats.set(key,m);return m;
  }
  function scatterGroundPatches(map,floorMat,floorKind,roadsClear){
    const kinds=PATCH_KINDS[floorKind];if(!kinds || !floorMat)return;
    const b=map.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,count=Math.min(LITE?30:90,Math.round(w*d/(LITE?380:130))),t=map.terrain,byKind=new Map();
    const base=floorMat.diffuseColor||new B.Color3(.6,.6,.6);
    for(let i=0,n=0;i<count*3&&n<count;i++){
      const x=b.minX+noise(i,701)*w,z=b.minZ+noise(i,702)*d,size=4+noise(i,703)*9;
      if(roadsClear && !roadsClear(x,z,size*.3))continue;
      const g=B.MeshBuilder.CreateGround("ground patch",{width:size,height:size*(.7+noise(i,704)*.6),subdivisions:t?4:1,updatable:true},scene);
      const rot=noise(i,705)*Math.PI,c=Math.cos(rot),s=Math.sin(rot),pos=g.getVerticesData(B.VertexBuffer.PositionKind),uv=g.getVerticesData(B.VertexBuffer.UVKind),uv2=[];
      for(let k=0;k<pos.length;k+=3){
        const px=x+pos[k]*c+pos[k+2]*s,pz=z-pos[k]*s+pos[k+2]*c;
        pos[k]=px;pos[k+2]=pz;pos[k+1]=t?terrainHeight(t,px,pz)+.006:-.1;
        uv2.push(uv[k/3*2],uv[k/3*2+1]);uv[k/3*2]=px/4;uv[k/3*2+1]=pz/4;
      }
      g.setVerticesData(B.VertexBuffer.PositionKind,pos);g.setVerticesData(B.VertexBuffer.UVKind,uv);g.setVerticesData(B.VertexBuffer.UV2Kind,uv2);
      const kind=kinds[n%kinds.length];if(!byKind.has(kind))byKind.set(kind,[]);byKind.get(kind).push(g);n++;
    }
    for(const [kind,parts] of byKind)for(const {mesh} of mergeByCell(parts,{key:()=>kind,cell:48})){
      mesh.name=map.id+" ground patches "+kind;mesh.parent=expansionRoot;mesh.isPickable=false;mesh.material=groundPatchMaterial(kind,base);mesh.metadata={noShadow:true};
    }
  }
  function terrainHeight(t,x,z){
    x=Math.max(t.xs[0],Math.min(t.xs.at(-1),x));z=Math.max(t.zs[0],Math.min(t.zs.at(-1),z));
    const i=terrainCell(t.xs,x),j=terrainCell(t.zs,z);
    const u=(x-t.xs[i])/(t.xs[i+1]-t.xs[i]),v=(z-t.zs[j])/(t.zs[j+1]-t.zs[j]);
    const a=t.heights[j][i],b=t.heights[j][i+1],c=t.heights[j+1][i],d=t.heights[j+1][i+1];
    return a+(u>=v?(b-a)*u+(d-b)*v:(d-c)*u+(c-a)*v);
  }
  // Clip each footprint against the actual terrain faces. A road crossing a ridge
  // must bend exactly at its edges or the rock can poke through the ribbon.
  function reliefPatches(name,t,patches,lift,material){
    const positions=[],normals=[],indices=[],uvs=[];
    for(const polygon of patches){
      const px=polygon.map(p=>p[0]),pz=polygon.map(p=>p[1]);
      const minI=terrainCell(t.xs,Math.min(...px)),maxI=terrainCell(t.xs,Math.max(...px));
      const minJ=terrainCell(t.zs,Math.min(...pz)),maxJ=terrainCell(t.zs,Math.max(...pz));
      for(let j=minJ;j<=maxJ;j++)for(let i=minI;i<=maxI;i++){
        const a=[t.xs[i],t.zs[j]],b=[t.xs[i+1],t.zs[j]],c=[t.xs[i],t.zs[j+1]],d=[t.xs[i+1],t.zs[j+1]];
        for(const face of [[a,b,d],[a,d,c]]){
          let pts=polygon;
          for(let edge=0;edge<3 && pts.length;edge++){
            const [x,z]=face[edge],[ex,ez]=face[(edge+1)%3],out=[];
            const distance=p=>(ex-x)*(p[1]-z)-(ez-z)*(p[0]-x);
            let prev=pts[pts.length-1],pd=distance(prev);
            for(const p of pts){
              const cd=distance(p);
              if((pd<0)!==(cd<0)){const u=pd/(pd-cd);out.push([prev[0]+u*(p[0]-prev[0]),prev[1]+u*(p[1]-prev[1])]);}
              if(cd>=0)out.push(p);
              prev=p;pd=cd;
            }
            pts=out;
          }
          if(pts.length<3)continue;
          const start=positions.length/3;
          for(const [x,z] of pts){positions.push(x,terrainHeight(t,x,z)+lift,z);uvs.push(x/12,z/12);}
          for(let k=2;k<pts.length;k++)indices.push(start,start+k-1,start+k);
        }
      }
    }
    if(!indices.length)return;
    B.VertexData.ComputeNormals(positions,indices,normals);
    const mesh=new B.Mesh(name,scene),data=new B.VertexData();
    Object.assign(data,{positions,indices,uvs,normals});data.applyToMesh(mesh);mesh.material=material;mesh.parent=expansionRoot;mesh.isPickable=false;
  }
  const reliefDisk=(x,z,r,n)=>Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*Math.PI/n),z+r*Math.sin(i*2*Math.PI/n)]);
  function buildReliefRoads(map,paint){
    const roads=[],safe=[],r=2;
    for(const [index,path] of (map.paths||[]).entries()){
      const patches=map.strategic?.safeRoads?.includes(index)?safe:roads;
      for(let i=0;i<path.length;i++){
        const a=path[i];patches.push(reliefDisk(a.x,a.z,r,12));
        if(!i)continue;
        const b=path[i-1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        if(!len)continue;
        const nx=-dz*r/len,nz=dx*r/len;
        patches.push([[a.x+nx,a.z+nz],[a.x-nx,a.z-nz],[b.x-nx,b.z-nz],[b.x+nx,b.z+nz]]);
      }
    }
    reliefPatches("graded hunt roads",map.terrain,roads,.045,paint.road);
    reliefPatches("protected roads",map.terrain,safe,.055,civicRoad);
  }
  function buildReliefContours(map,paint){
    const t=map.terrain,lines=[];
    for(let j=0;j<t.zs.length-1;j++)for(let i=0;i<t.xs.length-1;i++){
      const point=(a,b)=>new B.Vector3(t.xs[i+a],t.heights[j+b][i+a],t.zs[j+b]);
      const a=point(0,0),b=point(1,0),c=point(0,1),d=point(1,1);
      for(const face of [[a,b,d],[a,d,c]]){
        const ys=face.map(p=>p.y);
        for(let level=Math.ceil(Math.min(...ys)-.5)+.5;level<Math.max(...ys);level++){
          const ends=[];
          for(let side=0;side<3;side++){
            const p=face[side],q=face[(side+1)%3];
            if((p.y<level)===(q.y<level))continue;
            const v=B.Vector3.Lerp(p,q,(level-p.y)/(q.y-p.y));v.y+=.018;ends.push(v);
          }
          if(ends.length===2)lines.push(ends);
        }
      }
    }
    if(lines.length){const contours=B.MeshBuilder.CreateLineSystem("natural terrace edges",{lines},scene);
      contours.color=paint.stone.diffuseColor;contours.alpha=.42;contours.isPickable=false;contours.parent=expansionRoot;}
  }
  function buildTerrainGround(map,paint){
    const t=map.terrain,positions=[],normals=[],colors=[],uvs=[],indices=[];
    for(let j=0;j<t.zs.length-1;j++)for(let i=0;i<t.xs.length-1;i++){
      const point=(a,b)=>new B.Vector3(t.xs[i+a],t.heights[j+b][i+a],t.zs[j+b]);
      const a=point(0,0),b=point(1,0),c=point(0,1),d=point(1,1);
      for(const tri of [[a,b,d],[a,d,c]]){
        const n=B.Vector3.Cross(tri[2].subtract(tri[0]),tri[1].subtract(tri[0])).normalize();
        for(const p of tri){
          indices.push(positions.length/3);positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(p.x/45,p.z/45);
          const h=p.y/6;
          if(n.y<.89)colors.push(.58,.47,.34,1);
          else colors.push(.67+.24*h,.84+.12*h,.70-.10*h,1);
        }
      }
    }
    const mesh=new B.Mesh(map.reliefLabels?map.id+" walkable terrain":"B02 walkable terrain",scene),data=new B.VertexData();
    Object.assign(data,{positions,normals,colors,uvs,indices});data.applyToMesh(mesh);
    mesh.parent=expansionRoot;mesh.material=paint.floor;mesh.metadata={walkable:true};
    if(map.reliefLabels){buildReliefRoads(map,paint);buildReliefContours(map,paint);return;}
    const paths=map.paths||[];
    for(const [i,path] of paths.entries())for(let k=1;k<path.length;k++){
      const a=path[k-1],b=path[k],len=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(len/1.5);
      const pts=Array.from({length:steps+1},(_,j)=>({x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps}));
      const road=ribbonMesh("ridge road",pts,i?3.3:4.6,paint.road,0,0,0);
      const points=road.getVerticesData(B.VertexBuffer.PositionKind);
      for(let v=0;v<points.length;v+=3)points[v+1]=terrainHeight(t,points[v],points[v+2])+.045+i*.008;
      road.setVerticesData(B.VertexBuffer.PositionKind,points);road.refreshBoundingInfo();
      road.parent=expansionRoot;
    }
    const ornaments=[];
    const post=(x,z,h,m)=>{
      const p=B.MeshBuilder.CreateCylinder("trail post",{height:h,diameterTop:.28,diameterBottom:.54,tessellation:6},scene);
      p.position.set(x,terrainHeight(t,x,z)+h/2,z);p.material=m;ornaments.push(p);
    };
    // Paired curb stones and uphill chevrons follow the actual feet surface.
    const beam=(name,ax,az,bx,bz,lift,width,depth,m)=>{
      const a=new B.Vector3(ax,terrainHeight(t,ax,az)+lift,az),b=new B.Vector3(bx,terrainHeight(t,bx,bz)+lift,bz);
      const delta=b.subtract(a),mesh=B.MeshBuilder.CreateBox(name,{width,height:delta.length(),depth},scene);
      mesh.position.copyFrom(a.add(b).scale(.5));mesh.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,delta.normalize(),new B.Quaternion());
      mesh.material=m;ornaments.push(mesh);
    };
    for(const [x,foot,top] of [[0,66,42],[-95,66,42],[0,-12,-36],[95,-12,-36]]){
      for(const side of [-1,1]){
        const edge=x+side*3.05;
        for(let z=foot;z>=top;z-=6){
          post(edge,z,1.15,paint.stone);
          if(z>top)beam("timber slope rail",edge,z,edge,z-6,.92,.18,.21,wooden);
        }
        beam("slope curb",edge,foot,edge,top,.10,.56,.25,paint.stone);
      }
      for(let z=foot-3;z>top;z-=5){
        beam("uphill road mark",x-1.0,z,x,z-1.0,.105,.22,.09,paint.court);
        beam("uphill road mark",x+1.0,z,x,z-1.0,.105,.22,.09,paint.court);
      }
    }
    // Sparse grass tufts and shale strata show the toe and crest from the overhead camera.
    for(const z of [46,-32])for(let x=-165;x<=165;x+=5.3){
      const offset=noise(x,z)*2,px=x+offset,pz=z+1+offset;
      if(Math.abs(px)<8 || Math.abs(px-(z===46?-95:95))<12)continue;
      const reeds=B.MeshBuilder.CreateCylinder("ridge tussock",{height:.9,diameterBottom:.85,diameterTop:.12,tessellation:4},scene);
      reeds.position.set(px,terrainHeight(t,px,pz)+.4,pz);reeds.rotation.z=(offset-1)*.32;reeds.material=forestLeaf;ornaments.push(reeds);
    }
    for(const [x,z,label] of [[0,66,"เชิงเขา · 0 ม."],[0,40,"ลานกลาง · 3 ม."],[0,-36,"สันสูง · 6 ม."],[-95,65,"ทางลาดตะวันตก"],[95,-12,"ทางลาดตะวันออก"]]){
      for(const dx of [-4,4]){post(x+dx,z,2.6,darkWood);const banner=B.MeshBuilder.CreateBox("ridge banner",{width:1.25,height:.75,depth:.12},scene);
        banner.position.set(x+dx+.56,terrainHeight(t,x+dx,z)+2.1,z);banner.material=clothRed;ornaments.push(banner);}
      expansionLabel(label,x,z,11,terrainHeight(t,x,z)+4.4);
    }
    for(const z of [42,-36])for(let x=-235;x<250;x+=9){
      if(Math.abs(x)<18 || Math.abs(x-(z===42?-95:95))<21)continue;
      sceneryPoint("stone",x,z-1.5,1.05);
      placeRock("plain",x,terrainHeight(t,x,z-1.5),z-1.5,{parent:expansionRoot,scale:1.05}); // shale outcrop from the rock kit
    }
    for(const {mesh} of mergeByCell(ornaments))mesh.parent=expansionRoot;
  }
  function buildRegion(map,paint) {
    let parts=[];
    const elevation=(x,z)=>map.reliefLabels?terrainHeight(map.terrain,x,z):0;
    // Thai tree / rock kit instances seated on the relief (they are not merged with the carved parts).
    const tree=(species,x,z,scale=1)=>placeThaiTree(species,x,elevation(x,z),z,{parent:expansionRoot,scale});
    const rock=(kind,x,z,scale=1)=>placeRock(kind,x,elevation(x,z),z,{parent:expansionRoot,scale});
    function put(mesh,x,y,z,material){
      mesh.position.set(x,y+elevation(x,z),z);mesh.material=material;mesh.isPickable=false;parts.push(mesh);return mesh;
    }
    function box(x,y,z,w,h,d,m){
      return put(B.MeshBuilder.CreateBox("region block",{width:w,height:h,depth:d},scene),x,y,z,m);
    }
    function cone(x,y,z,h,b,t,m,n=6){
      return put(B.MeshBuilder.CreateCylinder("region carving",{height:h,diameterBottom:b,diameterTop:t,tessellation:n},scene),x,y,z,m);
    }
    function ring(x,y,z,d,m){
      return put(B.MeshBuilder.CreateTorus("region seal",{diameter:d,thickness:.17,tessellation:32},scene),x,y,z,m);
    }
    function ball(x,y,z,d,m){
      return put(B.MeshBuilder.CreateSphere("region knob",{diameter:d,segments:5},scene),x,y,z,m);
    }
    function finish(name,cover=false){
      for(const {mesh} of mergeByCell(parts)){
        mesh.name=map.id+" "+name;mesh.parent=expansionRoot;
        if(cover)templeCover.push(mesh);
      }
      parts=[];
    }
    const {floor,road,stone,light,deep}=paint;
    if(map.strategic){
      const {kind,sites,objectives}=map.strategic;
      const castle=Boolean(objectives);
      const city=kind==="capital",bamboo=map.id==="bamboo_frontier",lotus=map.id==="lotus_basin";
      // Thai roof: steep upper slopes over a flared lower eave, gilt ridge,
      // and chofa finials curling up from both gable ends.
      const roof=(x,y,z,width,depth)=>{
        for(const side of [-1,1]){
          const tile=box(x+side*width*.23,y,z,width*.58,.28,depth,roofMat);
          tile.rotation.z=-side*.40;
          box(x+side*width*.49,y-width*.10,z,.16,.20,depth+.25,gold);
          const eave=box(x+side*width*.6,y-width*.17,z,width*.26,.2,depth*.94,roofMat);eave.rotation.z=-side*.22;
          box(x+side*width*.73,y-width*.2,z,.1,.14,depth*.94,gold);
          const chofa=cone(x,y+width*.1+.32,z+side*(depth/2+.18),.8,.16,.03,gold,4);chofa.rotation.x=side*.55;
        }
        box(x,y+width*.10,z,.27,.3,depth+.5,gold);
      };
      const pavilion=(x,z,width,height)=>{
        for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*width*.4,height/2,z+dz*width*.3,height,.34,.30,templeLacquer,6);
        roof(x,height,z,width,width*.85);
      };
      const lamp=(x,z)=>{
        box(x,1,z,.17,2,.17,darkWood);box(x,2.16,z,.55,.58,.55,lanternPaper);addLightSpot(x,2.3,z,"#ffa060",.9);
        cone(x,2.58,z,.37,1,.1,deep,4);box(x,.04,z,1.3,.05,1.3,paint.court);
      };
      const relay=map.strategic.relay,bounds=map.bounds,river=map.strategic.riverCity;
      const huntTrail=map.strategic.huntTrail;
      if(relay || huntTrail || river)box((bounds.minX+bounds.maxX)/2,map.reliefLabels?-12:-1.05,(bounds.minZ+bounds.maxZ)/2,bounds.maxX-bounds.minX+56,.6,bounds.maxZ-bounds.minZ+56,deep);
      else if(!castle)box(0,map.reliefLabels?-12:-1.05,-16,220,.6,228,deep);
      if(relay || huntTrail || river){
        for(let i=0;i<22;i++)for(const side of [-1,1]){
          const t=(i+.5)/22,h=3+5*noise(i,51);
          cone(side<0?bounds.minX-4:bounds.maxX+4,h*.34,bounds.minZ+t*(bounds.maxZ-bounds.minZ),h,7,.3,stone,6);
          cone(bounds.minX+t*(bounds.maxX-bounds.minX),h*.34,side<0?bounds.minZ-4:bounds.maxZ+4,h,7,.4,floor,6);
        }
      }
      for(let i=0;!castle && !relay && !huntTrail && !river && i<18;i++)for(const side of [-1,1]){
        const h=4+(i*7)%6;
        // Bamboo and lotus provinces frame the edge with kit trees; elsewhere the backdrop is rock.
        if(bamboo||lotus){const x=side*(46+i%4),z=-65+i*5.6;tree(bamboo?"phai":["sai","maprao","tan"][i%3],x,z,.8+(i%3)*.12);tree(bamboo?"phai":"makham",x+side*2.5,z+2,.7);}
        else cone(side*(46+i%4),h*.33,-65+i*5.6,h,6+i%4,.25,stone,6);
        cone(-48+i*5.6,h*.32,side>0?36+i%3:-72-i%4,h,6+i%5,.2,floor,6);
      }
      for(const w of map.water||[]){
        box(w.x+w.width/2,.05,w.z+w.length/2,w.width,.10,w.length,regionWater(map.id));
        const horizontal=w.width>w.length,span=Math.max(w.width,w.length);
        for(const side of [-1,1]){
          const edgeX=w.x+w.width/2+(horizontal?0:side*(w.width/2-.12));
          const edgeZ=w.z+w.length/2+(horizontal?side*(w.length/2-.12):0);
          box(edgeX,.12,edgeZ,horizontal?w.width:.24,.13,horizontal?.24:w.length,civicRoad);
        }
        for(let k=2;k<span-1;k+=castle?28:4){
          const offset=.8+1.9*noise(k,29),x=w.x+(horizontal?k:offset),z=w.z+(horizontal?offset:k);
          box(x,.14,z,horizontal?1.55:.23,.035,horizontal?.14:1.55,paint.court);
          if(lotus && k%8===2){cone(x,.19,z,.1,1.15,1.25,civicRoad,7);cone(x,.49,z,.6,.85,.14,light,6);}
        }
      }
      if(relay){
        const mine=relay.effect==="gate";
        const rails=map.paths[map.strategic.railPath];
        for(let i=1;rails && i<rails.length;i++){
          const a=rails[i-1],b=rails[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
          const angle=Math.atan2(dx,dz);
          for(const k of [-.63,.63]){
            const steps=map.terrain?Math.ceil(len/3):1;
            for(let j=0;j<steps;j++){
              const u=j/steps,v=(j+1)/steps,rx=a.x+dx*u+k*dz/len,rz=a.z+dz*u-k*dx/len;
              const ex=a.x+dx*v+k*dz/len,ez=a.z+dz*v-k*dx/len,dy=elevation(ex,ez)-elevation(rx,rz);
              const rail=box((rx+ex)/2,.27,(rz+ez)/2,.13,.1,Math.hypot(len/steps,dy)+.08,stone);
              rail.rotation.y=angle;rail.rotation.x=-Math.atan2(dy,len/steps);
            }
          }
          for(let d=1;d<len;d+=2.6)box(a.x+dx*d/len,.21,a.z+dz*d/len,1.86,.12,.29,darkWood).rotation.y=angle;
        }
        ring(relay.x,.14,relay.z,relay.radius*2,gold);
        for(const side of [-1,1]){
          box(relay.x+side*3.8,1.8,relay.z,.22,3.6,.22,darkWood);
          box(relay.x+side*3.8+.56,3,relay.z,1.12,.68,.1,mine?gold:paint.light);
        }
        expansionLabel(relay.name,relay.x,relay.z,13,5);
        for(const p of map.portals.filter(p=>p.targetMapId===map.id)){
          const {x,z}=p;
          if(mine){
            for(const dx of [-.75,.75])box(x+3+dx,.23,z,.14,.22,8,stone);
            for(let k=-3;k<=3;k++)box(x+3,.12,z+k,2.3,.16,.25,darkWood);
            box(x+3,.8,z,2,.9,2.8,crateWood);box(x+3,1.12,z,1.66,.5,2.4,stone);
            for(const dx of [-1,1])for(const dz of [-.92,.92]){const wheel=cone(x+3+dx,.45,z+dz,.25,.82,.82,darkWood,10);wheel.rotation.z=Math.PI/2;}
            for(const dx of [-2.1,2.1])box(x+dx,1.8,z-1,.26,3.6,.26,wooden);
            roof(x,3.9,z-1,5,2.5);
          }else{
            box(x-1,.15,z,3,.24,5,wooden);
            for(const dx of [-1,1])for(const dz of [-2.25,2.25])cone(x-1+dx,.38,z+dz,.75,.25,.25,darkWood);
            const hull=cone(x-4.7,.38,z,.62,1.15,2.2,darkWood,8);hull.scaling.z=3.1;
            box(x-4.7,.72,z,1.65,.14,4.4,wooden);
            pavilion(x-4.7,z,2.2,2.1);
          }
          expansionLabel(p.label,x,z,13,5);
          const hit=B.MeshBuilder.CreateBox("local transport",{width:4.5,height:2.5,depth:4},scene);
          hit.parent=expansionRoot;hit.position.set(x,1.25,z);hit.visibility=.004;hit.metadata={portalId:p.id};
        }
        // Leave the old fort streets clear and distribute low scenery across the two new wings.
        for(let i=0;i<110;i++){
          const x=bounds.minX+5+noise(i,119)*(bounds.maxX-bounds.minX-10);
          const z=bounds.minZ+5+noise(i,203)*(bounds.maxZ-bounds.minZ-10);
          if((Math.abs(x)<42 && z>-65 && z<32) || !sceneryClear(x,z,5,map) || Math.hypot(x-relay.x,z-relay.z)<8)continue;
          if(mine){
            sceneryPoint("stone",x,z,1.4);
            cone(x,.5,z,1.3,2.8,.9,stone,5);cone(x+.9,.65,z+.4,1.5,.7,.06,paint.light,5);
          }else{
            for(let j=0;j<3;j++){const reed=cone(x+.32*j,1,z,2+.3*j,.18,.09,forestLeaf,5);reed.rotation.z=(j-1)*.16;}
          }
        }
        finish("outer district");
      }
      const crossings=sites.filter(s=>s.kind==="bridge");
      if(lotus && !crossings.length)for(const z of [-4,-27])for(const x of [-22,22])crossings.push({x,z});
      for(const s of crossings){
        const cross=s.direction==="east";
        if(river){
          for(let i=-10;i<=10;i++)box(s.x,.14,s.z+i*.8,15.8,.24,.77,wooden);
          for(const side of [-1,1]){
            box(s.x+side*7.9,.92,s.z,.18,.20,17,gold);
            for(const dz of [-8,0,8])box(s.x+side*7.9,.63,s.z+dz,.38,1.22,.4,darkWood);
          }
          continue;
        }
        for(let i=-4;i<=4;i++)box(s.x+(cross?i*.72:0),.13,s.z+(cross?0:i*.72),cross?.64:5.7,.18,cross?5.7:.64,wooden);
        for(const side of [-1,1]){
          box(s.x+(cross?0:side*2.9),.83,s.z+(cross?side*2.9:0),cross?6.6:.14,.17,cross?.14:6.6,gold);
          for(const end of [-1,1])box(s.x+(cross?end*3.1:side*2.9),.55,s.z+(cross?side*2.9:end*3.1),.32,1.1,.32,stone);
        }
      }
      if(river){
        for(const bridge of crossings){
          const x=bridge.x+(bridge.x<0?-15:15),z=bridge.z;
          for(let i=-4;i<=4;i++)box(x+i*.94,.24,z-6,.9,.3,5.5,wooden);
          for(const dx of [-4,4])box(x+dx,1.25,z-4,.38,2.5,.38,darkWood);
          const hull=cone(x,.35,z+1,.65,1.7,2.65,wooden,8);hull.scaling.x=3.4;
          box(x,1.9,z+1,.19,3.4,.19,darkWood);box(x+1.1,2.55,z+1,2,1.45,.1,bridge.x<0?clothRed:talismanPaper);
        }
        for(let i=0;i<45;i++){
          const x=bounds.minX+6+i*10.6,z=crossings[0].z+(i%2?11:-11);
          if(nearMapPath(map,x,z,7))continue;
          for(let j=0;j<3;j++)cone(x+j*.42,.73,z,1.45,.22,0,reedMat,4);
        }
        for(const key of ["T","S","M"]){
          const p=river.nodes[key];box(p.x,-.035,p.z,17,.06,15,paint.court);
        }
      }
      finish("landscape");
      const rampart=map.strategic.rampart;
      if(rampart){
        for(const deck of rampart.deck){
          const top=B.MeshBuilder.CreateBox("walkable city wall",{width:deck.width,height:.5,depth:deck.length},scene);
          top.parent=expansionRoot;top.position.set(deck.x+deck.width/2,rampart.height-.25,deck.z+deck.length/2);
          top.material=provinceFx.deck(kind==="territory",deck.width>deck.length,Math.max(deck.width,deck.length));top.metadata={walkable:true,elevatedTop:true};
        }
        for(const [i,g] of rampart.gates.entries()){
          const b=g.box,x=b.x+b.width/2,z=b.z+b.length/2,horizontal=b.width>b.length;
          const span=Math.max(b.width,b.length);
          for(const side of [-1,1]){
            box(x+(horizontal?side*(span/2+.2):0),1.75,z+(horizontal?0:side*(span/2+.2)),horizontal?.55:3.1,3.5,horizontal?3.1:.55,kind==="territory"?provinceFx.timber:provinceFx.laterite);
          }
          if(kind==="territory"){
            const door=B.MeshBuilder.CreateBox("reinforced city gate",{width:b.width,height:3.45,depth:b.length},scene);
            door.parent=expansionRoot;door.position.set(x,1.725,z);door.material=wooden;door.isPickable=false;
            castleDoors.set(g.id,door);
            syncGateVisual();
          }
          if(!city)expansionLabel(g.name,x,z,10,5.2);
        }
        for(const [idx,stair] of rampart.stairs.entries()){
          const dx=stair.top.x-stair.foot.x,dz=stair.top.z-stair.foot.z;
          const steps=river?20:10;
          for(let j=0;j<steps;j++){
            const t=(j+.5)/steps,h=(j+1)*rampart.height/steps;
            const step=B.MeshBuilder.CreateBox("city stair",{width:dx?Math.abs(dx)/steps+.07:river?3:2.2,depth:dz?Math.abs(dz)/steps+.07:river?3:2.2,height:h},scene);
            step.parent=expansionRoot;step.position.set(stair.foot.x+t*dx,h/2,stair.foot.z+t*dz);
            step.material=kind==="territory"?(j%2?provinceFx.plank:provinceFx.timber):(j%2?provinceFx.laterite:provinceFx.brick);step.metadata={walkable:true,stairId:stair.id};
          }
          expansionLabel("บันได "+(idx+1)+" · ขึ้น / ลง",stair.foot.x,stair.foot.z,9,3);
        }
        // Gatehouse pavilions stand over every opening and roofed bastions on
        // every corner; posts sit at the deck edges so the walkway stays open.
        const H=rampart.height;
        finish("gate frames");
        // Each gatehouse and bastion is its own cover so it fades when it sits between camera and hero.
        // The Tri Wiang castle is far larger; it keeps its plain gates and corners.
        for(const g of castle?[]:rampart.gates){
          const b=g.box,gx=b.x+b.width/2,gz=b.z+b.length/2,horizontal=b.width>b.length,span=Math.max(b.width,b.length)+1.6,th=Math.min(b.width,b.length);
          const post=kind==="territory"?provinceFx.timber:templeLacquer;
          box(gx,H-.62,gz,horizontal?span-1.6:th+.2,.24,horizontal?th+.2:span-1.6,kind==="territory"?darkWood:gold);
          for(const a of [-1,1])for(const c of [-1,1])cone(gx+(horizontal?a*span/2:c*(th/2-.15)),H+1.0,gz+(horizontal?c*(th/2-.15):a*span/2),2.0,.28,.24,post,6);
          roof(gx,H+2.3,gz,horizontal?span*.8:th+.8,horizontal?th+.8:span*.8);
          finish("gatehouse",true);
        }
        for(const c of castle?[]:rampart.corners||[]){
          if(kind==="territory"){
            // Ho rop: a timber lookout tower with a plank floor, railing and roof.
            for(const a of [-1,1])for(const d of [-1,1])cone(c.x+a*1.3,H+1.9,c.z+d*1.3,3.8,.3,.26,provinceFx.timber,6);
            box(c.x,H+2.4,c.z,3.2,.2,3.2,provinceFx.plank);
            for(const a of [-1,1]){box(c.x+a*1.5,H+2.95,c.z,.12,.9,3.1,provinceFx.timber);box(c.x,H+2.95,c.z+a*1.5,3.1,.9,.12,provinceFx.timber);}
            roof(c.x,H+4.3,c.z,3.6,3.6);
          }else{
            for(const a of [-1,1])for(const d of [-1,1])cone(c.x+a*1.25,H+1.2,c.z+d*1.25,2.4,.26,.22,templeLacquer,6);
            box(c.x,H+2.45,c.z,3.1,.18,3.1,gold);roof(c.x,H+3.1,c.z,3.4,3.4);cone(c.x,H+4.6,c.z,1.4,.5,0,gold,6);
          }
          finish("bastion",true);
        }
      }
      for(const w of map.walls||[]){
        const x=w.x+w.width/2,z=w.z+w.length/2;
        if(w.rampart){
          if(castle || river){
            box(x,1.77,z,w.width,3.54,w.length,stone);
            const along=w.width>w.length,n=Math.ceil(Math.max(w.width,w.length)/(castle?18:6));
            for(let i=0;i<n;i++){const t=(i+.5)/n;box(along?w.x+w.width*t:w.x+.26,4.13,along?w.z+.26:w.z+w.length*t,along?.8:.42,.26,along?.42:.8,deep);}
          }else{
            const along=w.width>w.length,len=Math.max(w.width,w.length),thick=Math.min(w.width,w.length);
            // Outer face points away from the enclosure's centre.
            const cs=rampart.corners,ox=(cs[0].x+cs[2].x)/2,oz=(cs[0].z+cs[2].z)/2,out=along?Math.sign(z-oz)||1:Math.sign(x-ox)||1;
            const courses=Math.max(1,Math.round(len/4)),seg=len/courses+.02,at=t=>[along?w.x+w.width*t:x,along?z:w.z+w.length*t];
            if(kind==="territory"){
              // Khai mai: a timber stockade on a laterite footing. Sharpened logs
              // stand on the outer face above the walk; planks line the inside.
              for(let i=0;i<courses;i++){const [cx,cz]=at((i+.5)/courses);box(cx,.5,cz,along?seg:thick+.3,1,along?thick+.3:seg,provinceFx.laterite);}
              box(x,2.5,z,along?w.width:thick-.5,3,along?thick-.5:w.length,provinceFx.timber);
              const n=Math.floor(len/.46),ex=along?0:out*(thick/2),ez=along?out*(thick/2):0;
              for(let i=0;i<n;i++){const [cx,cz]=at((i+.5)/n),h=4.2+noise(i+w.x,591)*.5;
                cone(cx+ex,h/2+.6,cz+ez,h,.44,.4,provinceFx.timber,6);cone(cx+ex,h+.6+.3,cz+ez,.6,.4,0,provinceFx.timber,6);}
              for(const y of [1.6,3.4])box(x+(along?0:ex*1.08),y,z+(along?ez*1.08:0),along?w.width:.14,.18,along?.14:w.length,darkWood);
            }else{
              // Krung kamphaeng: laterite footing courses under exposed Mon brick,
              // a moulded brick cornice and bai sema merlons on the outer edge.
              for(let i=0;i<courses;i++){const [cx,cz]=at((i+.5)/courses);
                box(cx,.6,cz,along?seg:thick+.4,1.2,along?thick+.4:seg,provinceFx.laterite);
                box(cx,2.35,cz,along?seg:thick,2.3,along?thick:seg,provinceFx.brick);}
              box(x,3.6,z,w.width+(along?0:.3),.22,w.length+(along?.3:0),provinceFx.laterite);
              const n=Math.floor(len/2.2),edge=thick/2-.3;
              for(let i=0;i<n;i++){const [cx,cz]=at((i+.5)/n),mx=cx+(along?0:out*edge),mz=cz+(along?out*edge:0);
                box(mx,4.22,mz,along?.85:.36,.45,along?.36:.85,provinceFx.brick);cone(mx,4.6,mz,.34,.62,0,provinceFx.brick,4).rotation.y=Math.PI/4;}
            }
          }
        }else if(river){
          const f=river.facilities.find(p=>p.x===x && p.z===z),h=f?.key==="T"?6:3.4;
          box(x,1.68,z,w.width,3.36,w.length,stone);
          for(const dx of [-5.8,0,5.8])box(x+dx,2,z+w.length/2+.03,.6,2.9,.12,darkWood);
          roof(x,h,z,w.width+1,w.length+1);
          if(f?.key==="T"){
            box(x,4.5,z,12,2.4,12,templeLacquer);
            roof(x,h+2.3,z,12,13);cone(x,h+5,z,3.4,1.5,.1,gold);
            for(const dx of [-5,5])cone(x+dx,5.2,z+6,3.6,.48,.44,gold,6);
          }else if(f?.key==="S"){
            for(const dx of [-4,0,4])cone(x+dx,4.2,z+4,2.3,2.7,1.8,crateWood,8);
          }else if(f?.key==="M"){
            for(const [i,dx] of [-5,0,5].entries()){
              const mz=z+w.length/2+1.1;
              for(const end of [-1.95,1.95])box(x+dx+end,1.6,mz+1.4,.16,3.2,.16,darkWood);
              box(x+dx,3,mz,4.5,.22,3.8,i===1?gold:clothRed).rotation.x=.13;
              box(x+dx,.73,mz,3.4,1.25,.9,wooden);
              for(const offset of [-.9,.25,.95])cone(x+dx+offset,1.56,mz,.5,.6,.42,i===1?lotusPad:gold,6);
            }
          }else if(f?.key==="F"){
            cone(x-4,4.6,z-2,4.8,2,1.4,stone,6);cone(x-4,7.3,z-2,1.2,.75,.1,decor.ember,5);
          }
        }else if(bamboo){
          const along=w.width>w.length,n=Math.ceil(Math.max(w.width,w.length)/1.1);
          box(x,1.05,z,w.width,2.1,w.length,deep);
          for(let j=0;j<n;j++){
            const t=(j+.5)/n,bx=along?w.x+t*w.width:x,bz=along?z:w.z+t*w.length;
            sceneryPoint("wood",bx,bz,w.width>w.length?w.length/2:w.width/2);
            if(j%2===0)tree("phai",bx,bz,.55+noise(j+bx,571)*.15); // bamboo hedge from the tree kit
          }
        }else if(city){
          box(x,.5,z,w.width+.3,1,w.length+.3,provinceFx.laterite);box(x,2.2,z,w.width,2.4,w.length,provinceFx.brick);
          box(x,3.45,z,w.width+.2,.18,w.length+.2,provinceFx.timber);roof(x,3.7,z,w.width+.75,w.length+.7);
          box(x,1.7,w.z-.04,w.width*.25,2,.12,darkWood);
          for(const side of [-1,1])box(x+side*w.width*.32,2.1,w.z-.12,.62,.9,.10,lanternPaper);
        }else{
          box(x,.5,z,w.width+.2,1,w.length+.2,provinceFx.laterite);box(x,1.95,z,w.width,1.9,w.length,provinceFx.timber);
          const count=Math.max(1,Math.floor(Math.max(w.width,w.length)/2));
          for(let i=0;i<count;i++){
            const t=(i+.5)/count;
            box(w.width>w.length?w.x+t*w.width:x,3.1,w.width>w.length?z:w.z+t*w.length,1,.7,1,deep);
          }
        }
        finish("buildings",true);
      }
      if(castle){
        for(const camp of map.strategic.forwardCamps || []){
          box(camp.x-3.5,2,camp.z-5.2,.22,4,.22,wooden);
          box(camp.x-2.4,3.4,camp.z-5.2,2.2,.9,.12,clothRed);
          ring(camp.x,.11,camp.z,5,paint.road);
          expansionLabel(camp.name,camp.x,camp.z,12,5);
        }
        for(const obj of objectives){
          const active=map.strategic.activeObjectives.includes(obj.id);
          const marker=ring(obj.x,.16,obj.z,14,active?gold:stone);
          // Capture rings change material independently when an objective changes hands.
          if(active){parts.pop();marker.parent=expansionRoot;castleRings.set(obj.id,marker);}
          box(obj.x-7,2.5,obj.z,.22,5,.22,gold);
          box(obj.x-5.8,4.3,obj.z,2.4,1.1,.10,active?clothRed:deep);
          expansionLabel(obj.id+" "+obj.name+(obj.id===7?" · บัลลังก์":active?" · จุดยึด":" · สำรวจ"),obj.x,obj.z,15,6);
        }
        for(const side of [-1,1])for(let i=0;i<3;i++){
          pavilion(side*(18+i*10),-197,8,5);
          roof(side*(18+i*10),6.3,-197,6,6);
        }
        for(const [x,z,width] of [[0,-221.5,23],[-23.5,-207.5,14],[23.5,-207.5,14]]){
          const h=width*.35;pavilion(x,z,width,h);
          roof(x,h+2,z,width*.82,width*.62);roof(x,h+3.7,z,width*.54,width*.44);
          cone(x,h+6.7,z,5,1.6,0,gold);
        }
        box(0,.22,-190,11,.44,8,stone);pavilion(0,-190,9,5);
        box(0,1,-191,2.3,1.3,1.4,gold);box(0,2,-191.6,2.6,2,.32,templeLacquer);
        for(const x of [-6,6]){cone(x,2.5,-188,5,.65,.5,gold);cone(x,5.4,-188,.9,1.4,.15,light,6);}
        finish("royal precinct",true);syncCastleRings();
      }
      for(const s of sites){
        const {x,z}=s;
        if(river && ["market","port","mine"].includes(s.kind)){
          const marker=ring(x,.12,z,8,templeBronze);parts.pop();marker.parent=expansionRoot;
          const post=river.posts.find(p=>p.x===x && p.z===z);riverPostRings.set(post.id,marker);
          box(x+4.4,1.7,z,.2,3.4,.2,wooden);box(x+5.1,2.8,z,1.4,1.1,.1,s.kind==="market"?clothRed:s.kind==="mine"?stone:gold);
        }else if(river && s.kind==="shrine"){
          cone(x,.43,z,.86,3.2,3.1,stone,10);cone(x,.88,z,.1,2.5,2.5,regionWater(map.id),10);
        }else if(river && s.kind==="grove"){
          for(const dx of [-4,4]){box(x+dx,2.6,z,.2,5.2,.2,darkWood);box(x+dx+.7,4.6,z,1.45,.9,.1,gold);}
        }else if(s.kind==="palace"){
          for(const side of [-1,1]){
            pavilion(x+side*7,z,5,4);cone(x+side*7,6.2,z,3,1.5,.03,gold);
          }
          roof(x,6.3,z,13,4.8);roof(x,7.4,z,8,3.8);cone(x,9.2,z,3,1.3,0,gold);
        }else if(s.kind==="fort"){
          ring(x,.12,z,10.5,gold);ring(x,.13,z,9.8,stone);
          // The flag is in an open court. The entire curtain wall is the firing platform.
          // A tall thong takhap (centipede banner) marks it from every corner of the map.
          cone(x,.25,z,.5,1.6,1.9,stone,8);cone(x,4.6,z,9,.2,.12,gold,6);cone(x,9.3,z,.6,.32,0,gold,6);
          for(let k=0;k<9;k++){const y=8.4-k*.62;box(x+.5,y,z,.7,.5,.05,k%2?gold:provinceFx.banner);
            for(const side of [-1,1]){const leg=box(x+.5+side*.5,y-.1,z,.32,.07,.04,provinceFx.banner);leg.rotation.z=side*.5;}}
          box(x+.5,2.6,z,.4,.6,.05,provinceFx.banner);
        }else if(s.kind==="market"){
          for(let i=0;i<3;i++){
            const mx=x+(i-1)*2.8;pavilion(mx,z,2.6,2.35);box(mx,.65,z,1.8,1.3,.9,crateWood);
            box(mx,1.42,z,.8,.24,.5,i%2?gold:paint.light);
          }
        }else if(s.kind==="tower"){
          for(let i=0;i<3;i++){box(x,1+i*1.8,z,3.6-i*.6,1.8,3.6-i*.6,stone);roof(x,2+i*1.8,z,4.3-i*.7,4.1-i*.65);}
          cone(x,7,z,2,.85,0,gold);
        }else if(s.kind==="mine"){
          for(const side of [-1,1]){box(x+side*1.3,1.45,z,.55,2.9,.6,darkWood);cone(x+side*2,.8,z+1,1.8,1.5,.2,paint.light,5);}
          box(x,3,z,3.5,.65,1,wooden);box(x,.9,z+.6,2.1,1.8,.4,deep);
        }else if(s.kind==="port"){
          box(x,.22,z,5,.45,3.7,wooden);pavilion(x,z,4.6,3.4);
          for(let i=0;i<3;i++)box(x+3,.5,z+i-1,.9,1,.9,crateWood);
        }else if(s.kind==="shrine"){
          // San lak mueang: a stepped plinth, red columns and a gilt prang over the city pillar.
          box(x,.2,z,5.6,.4,5.6,provinceFx.laterite);box(x,.55,z,4.6,.3,4.6,provinceFx.brick);
          for(const dx of [-1,1])for(const dz of [-1,1])cone(x+dx*1.8,2.05,z+dz*1.8,2.7,.3,.26,templeLacquer,6);
          box(x,3.5,z,4.3,.25,4.3,gold);roof(x,4.05,z,4.6,4.6);
          for(let k=0;k<4;k++)cone(x,5.0+k*.55,z,.6,1.5-k*.3,1.3-k*.3,k%2?templeGold:gold,8);
          cone(x,7.6,z,1.4,.35,0,gold,8);
          cone(x,1.6,z,2.1,.42,.38,templeGold,10);ball(x,2.85,z,.6,gold,6);
        }else if(s.kind==="grove"){
          for(let i=0;i<8;i++){const a=i*2.4,bx=x+Math.cos(a)*1.2,bz=z+Math.sin(a)*1.2;sceneryPoint("wood",bx,bz,.4);
            if(i<3)tree(["yangna","takhian","pradu"][i],x+Math.cos(a)*1.6,z+Math.sin(a)*1.6,.7+i*.08);}
        }
        if(s.kind!=="bridge")lamp(x+2.2,z+1.5);
        finish(s.kind,true);
        expansionLabel(s.name,x,z,10,s.kind==="palace"?11:s.kind==="fort"?7:4.5);
      }
      for(const [i,route] of map.paths.entries())for(let j=1;j<route.length;j++){
        const a=route[j-1],b=route[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        for(let d=6;d<len-2;d+=castle?140:river?42:huntTrail && i>=huntTrail.path?28:11)lamp(a.x+dx*d/len+dz*3/len,a.z+dz*d/len-dx*3/len);
      }
      // Low field dressing stays out of roads and clearings. The blocked groves use the server footprints.
      for(const o of map.obstacles)if(!sites.some(s=>s.x===o.x&&s.z===o.z)){
        sceneryPoint("stone",o.x,o.z,o.radius);
        cone(o.x,.65,o.z,1.35,o.radius*2,.7,stone);
      }
      if(bamboo || lotus){
        if(huntTrail){
          const rest=map.restAreas.find(a=>map.portals.every(p=>Math.hypot(p.x-a.x,p.z-a.z)>5));
          if(rest){
            const {x,z}=rest;pavilion(x,z-2.3,5.6,3.4);box(x,1,z-3.7,2.9,.24,.7,wooden);
            if(lotus)box(x,.07,z-1,6.4,.2,5,crateWood);
            for(const side of [-1,1])lamp(x+side*3.1,z+1);
          }
          for(const camp of map.camps.slice(3)){
            const {x,z}=camp;
            if(bamboo){
              for(const side of [-1,1]){
                cone(x+side*5.2,2.25,z-5,4.5,.46,.30,decor.bamboo);
                box(x+side*5.2+.7,3.55,z-5,1.4,.9,.1,camp.tier?gold:clothRed);
              }
              if(camp.tier)box(x,4.2,z-5,11.2,.35,.42,wooden);
            }else{
              for(let i=0;i<8;i++){
                const a=i*Math.PI/4,bx=x+Math.cos(a)*7,bz=z+Math.sin(a)*7;
                cone(bx,.16,bz,.18,1.6,1.85,forestLeaf,8);cone(bx,.51,bz,.68,.7,.21,camp.tier?gold:light,6);
              }
              if(camp.tier){ring(x,.17,z,8,gold);cone(x+6,1.3,z-5,2.6,1.9,.7,stone,8);cone(x+6,3,z-5,1.2,.3,1.25,light,8);}
            }
          }
        }
        for(let i=0;i<(huntTrail?135:54);i++){
          const x=i<54?-35+70*noise(i,83):bounds.minX+5+(bounds.maxX-bounds.minX-10)*noise(i,83);
          const z=i<54?-57+81*noise(i,26):bounds.minZ+5+(bounds.maxZ-bounds.minZ-10)*noise(i,26);
          if(!sceneryClear(x,z,huntTrail?8:2.8,map))continue;
          if(bamboo){
            // Bamboo clump from the tree kit (real leaves) over the same four gatherable canes.
            for(let j=0;j<4;j++)sceneryPoint("wood",x+(j-1.5)*.57,z+Math.sin(j)*.7,.35);
            tree("phai",x,z+.3,.55+noise(i,16)*.15);
          }else{
            for(let j=0;j<3;j++){const reed=cone(x+j*.46,.86,z,.98+j*.29,.19,.1,decor.bamboo,5);reed.rotation.z=(j-1)*.22;}
            cone(x,.14,z,.12,1.1,1.28,civicRoad,8);cone(x,.44,z,.53,.8,.15,light,6);
          }
        }
      }
      dressProvince(map,paint,{box,cone,put,roof,lamp,city,bamboo,lotus});
      if(bamboo || lotus)for(let i=0;i<36;i++){
        const x=huntTrail?(i%2?bounds.maxX-4:bounds.minX+4):(i%2?1:-1)*(35+i%4);
        const z=huntTrail?bounds.minZ+6+(bounds.maxZ-bounds.minZ-12)*noise(i,197):-58+(i*29)%83;
        if(huntTrail && !sceneryClear(x,z,8,map))continue;
        if(bamboo){for(let j=0;j<4;j++)sceneryPoint("wood",x+j*.3,z+j*.2,.3);tree("phai",x+.45,z+.3,.75+noise(i,198)*.2);}
        else {cone(x,.12,z,.16,1.7,1.8,forestLeaf,8);cone(x,.4,z,.4,.8,.3,paint.light,6);}
      }
      finish("lanterns and fields");
      return;
    }
    const marsh=map.id==="drowned_marsh",rift=map.id==="spirit_rift";
    // Distant slopes frame the playfield even when the camera follows an outer gate.
    const outerHunt=map.huntTrail;
    if(outerHunt){
      const b=map.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
      box((b.maxX+b.minX)/2,map.reliefLabels?-12:-1.2,(b.maxZ+b.minZ)/2,w+50,.65,d+50,deep);
      for(let i=0;i<20;i++)for(const side of [-1,1]){
        const t=(i+.5)/20,h=4+noise(i,113)*6;
        cone(side<0?b.minX-5:b.maxX+5,h*.35,b.minZ+t*d,h,7,marsh?1:0,stone,5);
        cone(b.minX+t*w,h*.32,side<0?b.minZ-5:b.maxZ+5,h,6,.2,floor,6);
      }
    }else box(0,-1.2,-16,226,.65,239,deep);
    for(let i=0;!outerHunt && i<18;i++)for(const side of [-1,1]){
      const tall=3+(i*11)%7;
      cone(side*(48+i%3),tall*.35,-68+i*6,tall,6+i%5,marsh?1.2:0,stone,5);
      cone(-52+i*6,tall*.32,side===1?39+i%4:-74-i%4,tall,6+i%4,0,floor,6);
    }
    for(const w of map.water||[]){
      box(w.x+w.width/2,.035,w.z+w.length/2,w.width,.07,w.length,regionWater(map.id));
      for(let i=1;i<=Math.floor(w.width/6);i++)box(w.x+i*5.5,.079,w.z+.8+(i%2),marsh?1.7:1.1,.025,.10,light);
    }
    const crossings=map.bridges ?? [...new Set((map.water||[]).map(w=>w.z+2))].flatMap(z=>[-22,22].map(x=>({x,z})));
    for(const {x,z} of crossings){
      for(let i=-3;i<=3;i++)box(x,.11,z+i*.75,6,.16,.63,marsh?road:stone);
      for(const side of [-1,1]){
        box(x+side*3,.8,z,.14,.15,5.4,marsh?stone:light);
        for(const end of [-1,1])cone(x+side*3,.52,z+end*2.7,1.2,.28,.20,stone,5);
      }
    }
    if(outerHunt){
      const trail=map.paths[outerHunt.path];
      const stop=map.restAreas.find(a=>trail.some(p=>p.x===a.x && p.z===a.z) && map.portals.every(p=>Math.hypot(p.x-a.x,p.z-a.z)>5));
      if(stop){
        const {x,z}=stop;
        if(marsh){
          for(let i=-3;i<=3;i++)box(x+i*.79,.1,z,.75,.15,5.5,wooden);
          for(const dx of [-2.9,2.9])for(const dz of [-2.7,2.7])cone(x+dx,1,z+dz,2.2,.3,.26,darkWood);
          for(const dx of [-2.8,2.8])cone(x+dx,2.3,z-2.7,.65,.58,.38,decor.willo,8);
        }else if(rift){
          for(const side of [-1,1]){
            cone(x+side*2.8,1.2,z-1.8,2.4,1.1,.45,stone,6);
            cone(x+side*2.8,2.8,z-1.8,.8,.5,0,decor.crystalV,5);
          }
          ring(x,.17,z,4.6,light);
        }else if(map.id==="naga_cavern"){
          for(const side of [-1,1]){
            cone(x+side*2.7,1.1,z-2,2.3,1.2,.68,stone,5);
            cone(x+side*2.7,2.75,z-2,1.15,.9,.03,light,5);
          }
          box(x,.38,z-2,3.6,.68,1,paint.court);
        }else{
          for(const dx of [-2.6,2.6])for(const dz of [-2.3,2.3])box(x+dx,1.65,z+dz,.3,3.3,.3,stone);
          for(const side of [-1,1])box(x+side*1.53,4,z,3.6,.28,5.8,darkWood).rotation.z=-side*.45;
          box(x,.7,z-1.7,3.6,.22,.85,wooden);
          if(map.id==="hex_ridge")for(const side of [-1,1]){
            box(x+side*3.5,2,z+2,.16,4,.16,wooden);
            box(x+side*4.15,3.4,z+2,1.35,.9,.12,gold);
          }
        }
      }
      const outerCamp=map.camps.find(c=>c.id==="court4");
      if(outerCamp){
        const {x,z}=outerCamp;
        if(map.id==="fallen_city"){
          for(const dx of [-2.5,2.5])box(x+dx,1.45,z-5,.2,2.9,.2,darkWood);
          box(x,2.7,z-5,5.3,.14,.18,wooden);
          for(const dx of [-1.6,0,1.6]){
            box(x+dx,1.95,z-5,1.1,1.35,.12,talismanPaper);
            box(x+dx,1.95,z-4.91,.46,.46,.06,clothRed).rotation.z=Math.PI/4;
          }
        }else if(map.id==="asura_peak"){
          box(x,.6,z-5,2.8,1.2,1.6,stone);box(x-.25,1.49,z-5,3.9,.58,1.15,decor.iron);
          for(const dx of [3,3.8,4.6]){
            cone(x+dx,1.5,z-5,3,.15,.15,wooden,5);
            cone(x+dx,3.3,z-5,.8,.48,.02,gold,5);
          }
        }else if(rift){
          for(const side of [-1,1]){
            const shard=cone(x+side*3,2.1,z-4.5,4.3,.95,.1,decor.crystalV,5);
            shard.rotation.z=side*.3;
          }
        }
      }
      const arena=map.camps.find(c=>c.tier==="strong" && trail.some(p=>p.x===c.x && p.z===c.z));
      if(arena){
        const {x,z}=arena;
        if(marsh){
          for(const side of [-1,1]){
            const hull=box(x+side*7,.85,z-5,.57,1.6,6.7,wooden);hull.rotation.y=side*.22;
            for(let i=0;i<4;i++)box(x+side*(6.15+i*.2),1.1,z-7.5+i*1.65,1.6,.22,.27,wooden);
          }
          box(x,2.6,z-6,.29,5.2,.28,darkWood).rotation.z=.15;
          box(x-.8,4,z-6,1.5,1.8,.09,clothRed);
        }else if(map.id==="hex_ridge"){
          for(const [dx,dz,h] of [[-6,-3,4.2],[0,-7,6.2],[6,-3,4.2]]){
            cone(x+dx,h/2,z+dz,h,2,1.45,stone,5);
            cone(x+dx,h+.37,z+dz,.78,1.65,.2,gold,4);
            box(x+dx,h*.68,z+dz+.74,.7,.7,.16,light).rotation.z=Math.PI/4;
          }
        }else if(map.id==="naga_cavern"){
          for(const side of [-1,1]){
            cone(x+side*5.4,1.8,z-5,3.8,2.35,1.36,stone,6).rotation.z=-side*.17;
            cone(x+side*5.1,4.45,z-5,2.45,1.45,.08,light,6).rotation.z=side*.46;
          }
          cone(x,1.1,z-7,2.2,3.8,2.8,stone,8);
          cone(x,2.7,z-7,1.1,.6,1.8,light,6);cone(x,3.8,z-7,1.1,1.8,.2,light,6);
        }else if(map.id==="fallen_city"){
          // The bronze drum hangs across the plaza; the hunt approaches between the standards.
          for(const side of [-1,1]){
            box(x+side*2.4,2.4,z-6,.44,4.8,.55,darkWood);
            box(x+side*6,2.1,z-3,.16,4.2,.16,gold);
            box(x+side*5.35,3.2,z-3,1.35,1.8,.12,clothRed);
          }
          box(x,4.7,z-6,5.8,.45,.6,wooden);
          cone(x,2.5,z-6,3.6,3.3,3.3,templeBronze,16).rotation.z=Math.PI/2;
          for(const side of [-1,1])cone(x+side*1.84,2.5,z-6,.16,3.35,3.35,gold,16).rotation.z=Math.PI/2;
        }else if(map.id==="asura_peak"){
          for(const side of [-1,1]){
            cone(x+side*3.4,2.3,z-6,4.6,2.8,2,stone,6);
            cone(x+side*3.4,5.35,z-6,1.6,1.2,.1,decor.ember,5);
          }
          box(x,4.4,z-6,6.8,1.4,2.6,deep);
          box(x,.35,z-6,5.2,.65,2.2,stone);
          for(const dx of [-1.45,0,1.45])cone(x+dx,1.25,z-6,1.8,1.25,0,decor.ember,5);
        }else if(rift){
          for(const side of [-1,1])cone(x+side*3.1,1.15,z-6,2.3,1.6,.85,stone,6);
          const halo=ring(x,4,z-6,6.2,decor.crystalV);halo.rotation.x=Math.PI/2;
          cone(x,3.4,z-6,1.4,.05,1.5,light,5);cone(x,4.8,z-6,1.4,1.5,.05,light,5);
        }else if(map.id==="moon_cemetery"){
          for(const side of [-1,1])box(x+side*2.5,2.2,z-6,.5,4.4,.55,stone);
          box(x,4.5,z-6,6.2,.45,.7,darkWood);
          cone(x,2.95,z-6,2.15,2.2,1.05,gold,12);cone(x,1.88,z-6,.25,2.5,2.25,stone,12);
          ring(x,.14,z,9,paint.light);
        }
      }
    }
    // Low ground dressing leaves the playable lanes, sightlines and server collision intact.
    const flatMarks=(x,z,n,m)=>{
      for(let j=0;j<n;j++)box(x+j*.62,.055,z+(j%2)*.34,.62,.08,.36,m).rotation.y=j*.82;
    };
    for(let row=0;row<10;row++)for(let col=0;col<6;col++){
      const x=-38+col*14+((row*13+col*3)%7),z=-59+row*9+((row*3+col*11)%5);
      if(map.portals.some(p=>Math.hypot(x-p.x,z-p.z)<5)||map.camps.some(c=>Math.hypot(x-c.x,z-c.z)<8))continue;
      let nearTrail=false;
      for(const route of map.paths)for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
        if(Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<3)nearTrail=true;
      }
      if(nearTrail)continue;
      if(marsh){
        sceneryPoint("stone",x,z,.7);
        for(let j=0;j<5;j++)cone(x+j*.26,.48,z+(j%2)*.37,.9+j%3*.3,.28,.025,j%2?stone:paint.court,4).rotation.z=(j-2)*.19;
        cone(x-.5,.10,z-.4,.12,1.2,1.2,paint.court,8);
      }else if(map.id==="moon_cemetery"){
        box(x,.36,z,.82,.72,.25,stone).rotation.z=.1;box(x,.06,z-.6,.9,.08,1.4,deep);
      }else if(map.id==="naga_cavern" || rift){
        sceneryPoint("stone",x,z,.7);
        for(let j=0;j<3;j++)cone(x+j*.32,.32,z+j%2*.35,.65+j*.12,.47,0,j===0?paint.court:stone,5).rotation.z=(j-1)*.36;
      }else if(map.id==="asura_peak"){
        flatMarks(x,z,3,deep);box(x,.08,z,.78,.09,.15,paint.road).rotation.y=-.5;
      }else if(map.id==="hex_ridge"){
        sceneryPoint("stone",x,z,.85);
        cone(x,.22,z,.42,1.65,.9,stone,5);cone(x+.55,.26,z+.15,.57,.9,.1,paint.court,5);
      }else flatMarks(x,z,4,deep);
    }
    // Embossed marks follow the same waypoints the player sees on the minimap.
    for(const route of map.paths||[])for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],len=Math.hypot(b.x-a.x,b.z-a.z);
      for(let step=4;step<len-2;step+=6){
        const t=step/len;
        const mark=box(a.x+(b.x-a.x)*t,.037,a.z+(b.z-a.z)*t,.55,.025,.23,road);
        mark.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+.35;
        mark.material=stone;
      }
    }
    finish("landscape");
    for(const w of map.walls||[]){
      const x=w.x+w.width/2,z=w.z+w.length/2;
      if(map.id==="fallen_city"){
        box(x,2,z,w.width,4,w.length,stone);box(x,4.2,z,w.width+.3,.4,w.length+.3,deep);
        for(let i=1;i<w.width-1;i+=2)box(w.x+i,2.5,w.z-.06,.9,1,.13,paint.court);
      }else if(map.id==="moon_cemetery"){
        box(x,1.5,z,w.width,3,w.length,stone);
        box(x,3.1,z,w.width+.2,.25,w.length+.2,deep);
        const along=w.width>=w.length,n=Math.ceil(Math.max(w.width,w.length)/4);
        for(let i=0;i<n;i++){const t=(i+.5)/n;cone(along?w.x+t*w.width:x,3.45,along?z:w.z+t*w.length,.55,.72,.25,stone,6);}
      }else if(map.id==="hex_ridge" || map.id==="naga_cavern"){
        const cave=map.id==="naga_cavern",along=w.width>=w.length;
        const count=Math.ceil(Math.max(w.width,w.length)/3.8);
        box(x,.38,z,w.width,.76,w.length,deep);
        for(let i=0;i<count;i++){
          const t=(i+.5)/count,px=along?w.x+t*w.width:x,pz=along?z:w.z+t*w.length;
          const h=1.8+noise(i+w.x,w.z)*1.3,dx=along?w.width/count:w.width,dz=along?w.length:w.length/count;
          sceneryPoint("stone",px,pz,Math.max(dx,dz)*.6);
          const block=cone(px,h/2,pz,h,1.22,.84,stone,6);
          block.scaling.set(dx,1,dz);
          const cap=cone(px,h+.18,pz,.36,.85,.7,cave?paint.court:floor,6);
          cap.scaling.set(dx,1,dz);
          if(cave && i%3===1)cone(px,h+.86,pz,1.1,.56,0,decor.crystal,5).rotation.z=.28;
        }
      }else{
        box(x,1.25,z,w.width,2.5,w.length,stone);
        for(let i=1;i<w.width;i+=2.8)cone(w.x+i,3,z,2+i%2,2.1,.15,deep,5);
      }
      finish("barrier",true);
    }
    for(const o of map.obstacles){
      const {x,z}=o,s=o.id==="landmark"?1.55:.76;
      if(["hex_ridge","naga_cavern","asura_peak","spirit_rift"].includes(map.id))sceneryPoint("stone",x,z,o.radius);
      const pillar=(dx,y,dz,h,b,t,m,n)=>cone(x+dx*s,y*s,z+dz*s,h*s,b*s,t*s,m,n);
      const block=(dx,y,dz,w,h,d,m)=>box(x+dx*s,y*s,z+dz*s,w*s,h*s,d*s,m);
      if(marsh){
        for(const side of [-1,1]){
          pillar(side*.86,1.2,0,2.4,.25,.22,stone,5);
          for(let j=0;j<4;j++)pillar(side*(1.2+j*.18),.95,j*.24-.4,2+j*.18,.26,0,floor,4).rotation.z=side*.15;
        }
        block(0,2.43,0,2.8,.25,1.7,stone);pillar(0,3.15,0,1.2,3.1,.24,deep,4);block(0,1.62,0,.65,.75,.65,light);
      }else if(map.id==="moon_cemetery"){
        block(0,.22,0,2.6,.44,1.6,deep);block(0,1.32,0,1.72,2,1,stone);
        pillar(0,2.55,0,.7,1.8,.83,stone,4);block(0,1.48,-.51,.23,.85,.06,light);
        if(o.id==="landmark"){const moon=ring(x,5*s,z,2.4*s,light);moon.rotation.x=Math.PI/2;}
      }else if(map.id==="hex_ridge"){
        pillar(0,.65,0,1.5,3.6,2.65,stone);pillar(0,1.75,0,1.05,2.65,1.7,deep);
        block(0,3.25,0,1.25,2.4,1,stone).rotation.z=.13;
        block(0,3.25,-.52,.6,.6,.08,light).rotation.z=.78;
      }else if(map.id==="naga_cavern"){
        for(const side of [-1,1]){
          pillar(side*.83,1.75,0,3.6,1.3,.32,stone,5).rotation.z=-side*.27;
          pillar(side*.53,3.6,0,1.4,.9,0,light,5).rotation.z=side*.6;
        }
        pillar(0,.66,-.5,1.3,1,.1,paint.court,5);
      }else if(map.id==="fallen_city"){
        block(0,.24,0,2.65,.5,2.65,deep);block(0,2,0,1.95,3.5,1.8,stone);
        block(0,3.84,0,2.25,.28,2.24,road);pillar(0,4.66,0,1.5,2.5,.1,deep,4);
        const dial=pillar(0,2.8,-.94,.17,1,1,light,12);dial.rotation.x=Math.PI/2;
        block(.1,2.88,-1.06,.13,.46,.1,stone).rotation.z=.4;
      }else if(map.id==="asura_peak"){
        pillar(0,.56,0,1.12,2.8,2,stone);pillar(0,1.36,0,.72,1.4,2.6,deep);
        for(const side of [-1,0,1])pillar(side*.67,2.3,0,2.3-Math.abs(side)*.5,.85,0,light,5).rotation.z=-side*.32;
      }else if(rift){
        for(const side of [-1,0,1]){
          const h=side===0?4.7:2.7;pillar(side,h/2,0,h,1.35,.25,side===0?light:paint.court,5).rotation.z=-side*.3;
        }
      }
      finish("relic",true);
    }
  }
  // ---- Far backdrop: the map edge dissolves into distant mist ----
  // Past the walkable bounds the camera used to see the bare clear colour, a hard black band. Now the
  // ground runs on into the fog, and layered curtains of drifting mist stand outside the edge: thin and
  // see-through close in, thicker further out, the last one solid at its foot, so what lies beyond reads
  // as a far landscape lost in haze rather than the end of the world. Everything is tinted with the live
  // fog colour each frame, so it follows the hour, the weather and the blood moon.
  const backdropMats = [];
  function backdropMaterial(name, fogShare) {
    // Unlit: the colour is the emissive term (times any vertex colour), so night light cannot blacken it.
    const m = new B.StandardMaterial(name, scene);
    m.disableLighting = true; m.specularColor = new B.Color3(0, 0, 0); m.diffuseColor = new B.Color3(0, 0, 0); m.emissiveColor = new B.Color3(0, 0, 0);
    m.metadata = { fogShare, base: new B.Color3(.2, .25, .2) }; backdropMats.push(m);
    return m;
  }
  let backdropGroundMat = null, backdropMistTex = null;
  const backdropCurtains = [];
  // Called every frame: tint follows the fog; the mist drifts sideways, each layer at its own pace.
  function updateBackdrop() {
    const f = scene.fogColor;
    for (const m of backdropMats) { const k = m.metadata.fogShare, b = m.metadata.base, l = 1 + (m.metadata.lift || 0);
      m.emissiveColor.set((b.r + (f.r - b.r) * k) * l, (b.g + (f.g - b.g) * k) * l, (b.b + (f.b - b.b) * k) * l); }
    const t = performance.now() / 1000;
    for (const m of backdropCurtains) if (m.opacityTexture) m.opacityTexture.uOffset = (t * m.metadata.drift) % 1;
  }
  // Soft cloud banks, painted wrapped across the left/right edges so the strip tiles round the map.
  function backdropMistTexture() {
    if (backdropMistTex) return backdropMistTex;
    backdropMistTex = paintTexture("far mist", 256, (c, S) => {
      c.clearRect(0, 0, S, S); c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        const x = noise(i, 801) * S, y = S * (.2 + noise(i, 802) * .75), r = S * (.07 + noise(i, 803) * .22), a = .25 + noise(i, 804) * .45;
        for (const dx of [-S, 0, S]) {
          const g = c.createRadialGradient(x + dx, y, 0, x + dx, y, r);
          g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, "rgba(255,255,255,0)");
          c.fillStyle = g; c.fillRect(0, 0, S, S);
        }
      }
    });
    backdropMistTex.hasAlpha = true; backdropMistTex.getAlphaFromRGB = true;
    backdropMistTex.wrapU = B.Texture.WRAP_ADDRESSMODE; backdropMistTex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    return backdropMistTex;
  }
  // A closed strip round the map's rectangle, `off` metres outside it (corners rounded), `h` tall, with
  // its opacity falling from `foot` at the ground to nothing at the top.
  function mistCurtain(cx, cz, hw, hd, off, h, foot, name) {
    const pts = [], N = 64, r = off;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // superellipse-ish: the rectangle's half sizes plus a round offset
      pts.push([cx + Math.sign(ca) * Math.min(1, Math.abs(ca) * 1.6) * hw + ca * r, cz + Math.sign(sa) * Math.min(1, Math.abs(sa) * 1.6) * hd + sa * r]);
    }
    const ROWS = 6, pos = [], uv = [], col = [], idx = [];
    let perim = 0; const along = [0];
    for (let i = 1; i <= N; i++) { perim += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); along.push(perim); }
    const reps = Math.max(1, Math.round(perim / (h * 2.6)));
    for (let i = 0; i <= N; i++) for (let j = 0; j <= ROWS; j++) {
      const v = j / ROWS;
      pos.push(pts[i][0], -1 + v * h, pts[i][1]); uv.push(along[i] / perim * reps, v);
      col.push(1, 1, 1, foot * Math.pow(1 - v, 1.4));
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < ROWS; j++) { const a = i * (ROWS + 1) + j, b = a + ROWS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const m = new B.Mesh(name, scene), vd = new B.VertexData();
    Object.assign(vd, { positions: pos, indices: idx, uvs: uv, colors: col }); vd.applyToMesh(m);
    m.hasVertexAlpha = true; m.isPickable = false; m.applyFog = false; m.parent = expansionRoot; m.metadata = { noShadow: true };
    return m;
  }
  function buildBackdrop(map, bounds) {
    const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
    if (w > 600 || d > 600) return; // the open-world castle map has no edge in sight
    if (!backdropGroundMat) backdropGroundMat = backdropMaterial("backdrop ground", .15);
    backdropGroundMat.metadata.base = B.Color3.FromHexString(atmosphere.ground || "#2a2a22");
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    // Ground on to the horizon, a little under the map so the map's own floor and relief always win;
    // it keeps the scene fog on top, so it runs from the map's tone at the edge into the haze.
    const skirt = B.MeshBuilder.CreateGround("backdrop ground", { width: w + 640, height: d + 640 }, scene);
    skirt.position.set(cx, -.3, cz); skirt.material = backdropGroundMat; skirt.isPickable = false; skirt.parent = expansionRoot; skirt.metadata = { noShadow: true };
    // Mist curtains: [metres outside the edge, height, opacity at the foot, drift speed]. Phones get three.
    // They start well past the edge and stay light, so the map itself reads clearly and only the far
    // distance goes to haze; the last ring closes the horizon.
    const layers = LITE ? [[30, 14, .2, .006], [70, 26, .42, -.004], [130, 55, .9, .002]]
      : [[20, 10, .14, .007], [45, 18, .28, -.005], [80, 30, .5, .004], [130, 55, .9, -.002]];
    layers.forEach(([off, h, foot, drift], k) => {
      if (!backdropCurtains[k]) {
        const m = backdropMaterial("far mist " + k, 1); m.opacityTexture = backdropMistTexture().clone();
        // One-sided: drawn only from inside the ring looking out. A camera that has swung past the map edge
        // behind the hero would otherwise look through the near curtains and see the hero in thick fog.
        m.backFaceCulling = true; m.disableDepthWrite = true; m.useVertexAlpha = true; m.alpha = .999; m.metadata.drift = drift;
        m.metadata.lift = .22 - k * .06; // near banks catch a little more light than the haze behind them
        backdropCurtains[k] = m;
      }
      const c = mistCurtain(cx, cz, w / 2, d / 2, off, h, foot, "far mist " + k);
      c.material = backdropCurtains[k]; c.alphaIndex = 1000 - k; // far layers first, near ones over them
    });
    updateBackdrop();
  }
