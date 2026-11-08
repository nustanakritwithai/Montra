  function buildForestDetails(map) {
    const groups=new Map();
    function place(mesh,x,y,z,material,batch=true) {
      mesh.position.set(x,y+(map.terrain?terrainHeight(map.terrain,x,z):0),z);mesh.material=material;mesh.isPickable=false;mesh.parent=expansionRoot;
      if(batch){if(!groups.has(material))groups.set(material,[]);groups.get(material).push(mesh);}
      return mesh;
    }
    function column(x,y,z,height,base,top,material,sides=7,batch=true) {
      return place(B.MeshBuilder.CreateCylinder("forest detail",{height,diameterBottom:base,diameterTop:top,tessellation:sides},scene),x,y,z,material,batch);
    }
    function slab(x,y,z,w,h,d,material) {
      return place(B.MeshBuilder.CreateBox("forest detail",{width:w,height:h,depth:d},scene),x,y,z,material);
    }
    for(const obstacle of map.obstacles) {
      const {x,z,id}=obstacle;
      if(id.startsWith("grove-")) {
        sceneryPoint("wood",x,z,obstacle.radius);
        // Old-forest groves: a big tree per footprint (sai with hanging roots, takhian, yang-na), fading over the hero.
        const kinds=map.id==="moon_cemetery"?["ngiu","sai","ngiu"]:map.id==="bound_temple"?["pho","sai","pho"]:["sai","takhian","yangna","takhian"];
        const kind=kinds[Math.abs(Math.round(x*7+z*3))%kinds.length];
        const tree=placeThaiTree(kind,x,map.terrain?terrainHeight(map.terrain,x,z):0,z,{clone:true,parent:expansionRoot,scale:Math.max(.85,Math.min(1.3,(obstacle.radius||2)/2))});
        forestCrowns.push(tree);
        for(let i=0;i<3;i++)column(x+Math.cos(i*2)*1.4,.42,z+Math.sin(i*2)*1.4,.85,.7,0,forestLeaf,4);
        continue;
      }
      if(id.startsWith("temple-post-")){
        column(x,1.8,z,3.6,1.45,1.05,templeBrick);
        column(x,3.72,z,.35,1.65,1.65,templeGold);
        column(x,4.35,z,1.05,1.15,.1,templeStone,4);
        slab(x,2.25,z,.85,.98,1.12,templeLacquer);
        continue;
      }
      if(!id.startsWith("camp-"))continue;
      const camp=id.slice(5),accent=campLooks[camp]?.material;if(!accent)continue;
      column(x,.18,z,.36,obstacle.radius*2,obstacle.radius*1.6,forestStone);
      if(camp==="west"){
        column(x,2.5,z,5,.36,.23,darkWood);slab(x,4.4,z,2.8,.18,.2,gold);
        slab(x+.55,3.35,z,1.3,2.0,.12,accent);
      }else if(camp==="east"){
        for(const sign of [-1,1]){const root=column(x+sign*.75,1.9,z,4.4,1.0,.23,darkWood);root.rotation.z=sign*.33;}
        column(x,3.8,z,1.0,.75,.15,accent,5);
      }else if(camp==="deep_west"){
        for(let i=0;i<4;i++)column(x+i*.09,.6+i*.82,z,.86,3-i*.5,2.6-i*.49,forestStone,5);
        column(x,3.5,z,1.0,.85,0,accent,5);
      }else{
        for(const sign of [-1,1]){column(x+sign,1.5,z,3,.3,.24,darkWood);column(x+sign,3.2,z,1.1,1.1,.65,accent,4);slab(x+sign,3.85,z,1.45,.16,1.45,darkWood);}
      }
    }
    // A distant tree line continues the scenery past the walkable boundary.
    // Keep it below the sight line at the shallowest supported camera angle.
    const bounds=map.bounds;
    slab((bounds.minX+bounds.maxX)/2,map.terrain?-8:-.65,(bounds.minZ+bounds.maxZ)/2,
      bounds.maxX-bounds.minX+94,.3,bounds.maxZ-bounds.minZ+94,forestFloor);
    for(let side=0;side<4;side++)for(let i=0;i<20;i++){
      const horizontal=side<2, sign=side%2===0?-1:1;
      const low=horizontal?bounds.minX:bounds.minZ,high=horizontal?bounds.maxX:bounds.maxZ;
      const along=low-13+(high-low+26)*i/19;
      const edge=horizontal?(sign<0?bounds.minZ:bounds.maxZ):(sign<0?bounds.minX:bounds.maxX);
      const offset=10+(i*7+side*3)%13, x=horizontal?along:edge+sign*offset, z=horizontal?edge+sign*offset:along;
      // Distant tree line: instanced yang-na, takhian, sai and bamboo, sized up with distance.
      const far=["yangna","takhian","sai","phai","yangna","pradu"][(i+side*2)%6];
      placeThaiTree(far,x,map.terrain?-1.2:-.4,z,{parent:expansionRoot,scale:.72+offset*.03});
    }
    if(map.guardian){
      const {x,z}=map.guardian;
      for(const sign of [-1,1]){
        column(x+sign*3,1.5,z-3,3,1.25,.65,forestStone);
        column(x+sign*3,3.5,z-3,1.15,.8,0,gold,4);
      }
      expansionLabel("ผู้พิทักษ์ศาลร้าง · Elite 12",x,z-3,17);
    }
    // Understory: grass tufts, glowing spirit mushrooms and camp spirit lanterns.
    const paths=map.paths||[];
    const nearPath=(x,z)=>paths.some(path=>path.some((p,i)=>{
      if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));
      return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<3;
    }));
    const clearOfProps=(x,z)=>!(map.camps||[]).some(c=>Math.hypot(x-c.x,z-c.z)<12.5)&&
      !map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.6)&&!nearPath(x,z);
    const spanX=bounds.maxX-bounds.minX,spanZ=bounds.maxZ-bounds.minZ;
    for(let i=0;i<420;i++){
      const x=bounds.minX+noise(i,71)*spanX,z=bounds.minZ+noise(i,72)*spanZ;
      if(!clearOfProps(x,z))continue;
      const h=.35+noise(i,73)*.45;
      column(x,h/2,z,h,.3+noise(i,74)*.35,0,i%3?forestGrass:forestFern,3);
      if(i%19===0){column(x+.5,.12,z+.3,.24,.12,.12,mushStem,5);column(x+.5,.28,z+.3,.12,.42,.1,mushCap,6);}
    }
    for(const camp of map.camps||[])for(let k=0;k<4;k++){
      const a=k*Math.PI/2+Math.PI/4,x=camp.x+Math.cos(a)*10.8,z=camp.z+Math.sin(a)*10.8;
      column(x,1,z,2,.16,.12,darkWood,5);column(x,2.1,z,.4,.34,.28,glowMat,6);
      place(lightPool(x,z,2.8,.05),x,.05,z,lightPoolMat);
    }
    // Bushes hug every tree, so trunks read as rooted clumps rather than pins.
    for(const o of map.obstacles){
      if(!/^(grove-|tree-|north-grove)/.test(o.id))continue;
      for(let k=0;k<5;k++){
        const a=k*1.26+o.x,r=o.radius+.6+noise(k,o.z)*1.2,size=.8+noise(k,o.x)*.9;
        const bx=o.x+Math.cos(a)*r,bz=o.z+Math.sin(a)*r;
        placeLeafBush(bx,map.terrain?terrainHeight(map.terrain,bx,bz):0,bz,size*1.25,{parent:expansionRoot,variant:k%3,flat:.8});
      }
    }
    // Stones line the trail verges.
    for(const path of paths)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
      for(let t=1.2;t<len;t+=2.2)for(const side of [-1,1]){
        const k=Math.round(t*10)+i*97+side;if(noise(k,115)<.35)continue;
        const off=2.35+noise(k,116)*.5,d=.32+noise(k,117)*.34;
        const stone=place(B.MeshBuilder.CreateSphere("verge stone",{diameter:d,segments:3},scene),a.x+(b.x-a.x)*t/len+nx*off*side,d*.18,a.z+(b.z-a.z)*t/len+nz*off*side,forestStone);
        stone.scaling.y=.5;
        sceneryPoint("stone",stone.position.x,stone.position.z,d/2);
      }
    }
    // Fallen logs and moss-capped boulders in open ground.
    for(let i=0,logs=0,rocks=0;i<160&&(logs<12||rocks<18);i++){
      const x=bounds.minX+4+noise(i,121)*(spanX-8),z=bounds.minZ+4+noise(i,122)*(spanZ-8);
      if(!clearOfProps(x,z))continue;
      if(logs<12&&i%2){
        sceneryPoint("wood",x,z,1.2);
        const log=column(x,.3,z,2.4+noise(i,123)*1.4,.55,.48,logMat,8);log.rotation.z=Math.PI/2;log.rotation.y=noise(i,124)*Math.PI;logs++;
      }else if(rocks<18){
        const d=1+noise(i,125)*.9;
        sceneryPoint("stone",x,z,d/2);
        // Moss-covered boulder from the rock kit (forest stones are mossy; the bound temple's are plain).
        placeRock(activeMapId==="forbidden_forest"?"moss":"plain",x,map.terrain?terrainHeight(map.terrain,x,z):0,z,{parent:expansionRoot,scale:d*.55});
        rocks++;
      }
    }
    // Low shrubs and pale wildflowers break up open ground (never taller than knee height).
    for(let i=0;i<260;i++){
      const x=bounds.minX+2+noise(i,181)*(spanX-4),z=bounds.minZ+2+noise(i,182)*(spanZ-4);
      if(!clearOfProps(x,z))continue;
      if(i%3===0){const size=.7+noise(i,183)*.7;placeLeafBush(x,map.terrain?terrainHeight(map.terrain,x,z):0,z,size*1.1,{parent:expansionRoot,variant:i%3,flat:.65});}
      else for(let k=0;k<4;k++)column(x+(noise(i*4+k,184)-.5)*1.4,.06,z+(noise(i*4+k,185)-.5)*1.4,.05,.24,.18,i%2?wildflower:wildflowerGold,6);
    }
    // Roadside spirit houses (san ta yai) with candles at trail junctions.
    function spiritHouse(x,z){
      column(x,.55,z,1.1,.22,.18,darkWood,6);
      slab(x,1.15,z,.95,.08,.8,gold);
      slab(x,1.45,z,.66,.52,.56,woodenAlt);
      slab(x,1.47,z+.29,.22,.3,.02,glowMat);
      for(const side of [-1,1])slab(x+side*.24,1.86,z,.58,.07,.78,roofMat).rotation.z=-side*.75;
      column(x,2.15,z,.42,.1,0,gold,5);
      for(let k=0;k<3;k++)column(x-.3+k*.3,.12,z+.75,.24,.07,.07,candleMat,5);
      place(lightPool(x,z+.6,1.9,.05),x,.05,z+.6,lightPoolMat);
    }
    for(const [jx,jz] of [[0,12],[0,-30],[0,-46],[13,-9],[-12,-1],[-4,-73]]){
      seek: for(const r of [jz===12?7.6:4.5,6.5])for(let k=0;k<8;k++){
        const x=jx+Math.cos(k*Math.PI/4+.4)*r,z=jz+Math.sin(k*Math.PI/4+.4)*r;
        if(clearOfProps(x,z)&&!(map.restAreas||[]).some(ar=>Math.hypot(x-ar.x,z-ar.z)<ar.radius+1)){spiritHouse(x,z);break seek;}
      }
    }
    // Batch static decorations by material; crowns remain individually fadeable.
    for(const parts of groups.values()){
      const merged=B.Mesh.MergeMeshes(parts,true,true);
      if(merged){merged.parent=expansionRoot;merged.isPickable=false;}
    }
  }
  function fadeForestCrowns(hero) {
    const eye=camera.position,dx=eye.x-hero.x,dy=eye.y-hero.y-1,dz=eye.z-hero.z;
    const length=dx*dx+dy*dy+dz*dz;
    if(!length)return;
    for(const crowns of [fixedCrowns,forestCrowns])for(const crown of crowns){
      const sphere=crown.getBoundingInfo().boundingSphere, p=sphere.centerWorld;
      const x=p.x-hero.x,y=p.y-hero.y-1,z=p.z-hero.z,t=(x*dx+y*dy+z*dz)/length;
      const blocks=t>0&&t<1&&Math.hypot(x-t*dx,y-t*dy,z-t*dz)<sphere.radiusWorld;
      crown.visibility=blocks ? .18 : 1;
      for(const leaves of crown.getChildMeshes(true))leaves.visibility=crown.visibility;
    }
  }
  function buildTemple(map) {
    // Merge each ruin by material. Its visible outline and collision both use the manifest footprint.
    let parts=[];
    function place(mesh,x,y,z,material){
      mesh.position.set(x,y+(map.terrain?terrainHeight(map.terrain,x,z):0),z);mesh.material=material;mesh.isPickable=false;
      mesh.parent=expansionRoot;parts.push(mesh);return mesh;
    }
    function block(x,y,z,width,height,depth,material){
      return place(B.MeshBuilder.CreateBox("temple masonry",{width,height,depth},scene),x,y,z,material);
    }
    function column(x,y,z,height,base,top,material,sides=8){
      return place(B.MeshBuilder.CreateCylinder("temple carving",{height,diameterBottom:base,diameterTop:top,tessellation:sides},scene),x,y,z,material);
    }
    function finish(name,cover=false){
      const materials=new Set(parts.map(m=>m.material));
      for(const material of materials){
        const group=parts.filter(p=>p.material===material);
        const mesh=group.length===1?group[0]:B.Mesh.MergeMeshes(group,true,true);
        if(mesh){mesh.name=name;mesh.parent=expansionRoot;mesh.isPickable=false;if(cover)templeCover.push(mesh);}
      }
      parts=[];
    }
    function spire(x,y,z,size){
      for(let i=0;i<4;i++)column(x,y+size*(.12+i*.19),z,size*.24,size*(1-i*.17),size*(.92-i*.17),i===2?templeGold:templeStone,8);
      column(x,y+size*1.04,z,size*.7,size*.34,.03,templeGold,8);
    }
    function gable(x,y,z,width,depth){
      for(const side of [-1,1]){
        const panel=block(x+side*width*.24,y,z,width*.56,.33,depth,templeLacquer);
        panel.rotation.z=-side*.42;
        block(x+side*width*.48,y-width*.101,z,.21,.28,depth+.24,templeGold);
      }
      block(x,y+width*.092,z,.3,.4,depth+.4,templeGold);
    }
    block(0,map.terrain?-8:-.82,-20,174,.6,179,forestFloor);
    for(let i=0;i<21;i++)for(const sign of [-1,1]){
      const x=-61+i*6.2,z=sign===1?45+(i*5)%8:-84-(i*5)%8;
      column(x,1.25,z,3.4,5+i%3,.3,forestLeaf,6);
      column(sign*(60+(i*3)%8),1.2,-80+6*i,3.4,5.5,0,forestLeaf,6);
    }
    finish("temple distant grove");
    for(const wall of map.walls||[]){
      const x=wall.x+wall.width/2,z=wall.z+wall.length/2;
      block(x,3.95,z,wall.width,7.9,wall.length,templeBrick);
      block(x,.48,z,wall.width+.16,.96,wall.length+.16,templeStone);
      block(x,7.98,z,wall.width+.25,.23,wall.length+.25,templeStone);
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length);
      for(let i=1;i<span;i+=3.5){
        const dx=alongX?i-span/2:0,dz=alongX?0:i-span/2;
        block(x+dx,4.3,z+dz,alongX?.65:wall.width+.14,.15,alongX?wall.length+.14:.65,templeGold);
      }
      finish("temple cover wall",true);
    }
    for(const o of map.obstacles){
      const {x,z,radius:r,id}=o;
      column(x,.27,z,.54,r*2,r*1.9,templeStone,8);
      if(id.startsWith("gate-")){
        column(x,3.45,z,6.4,2.1,1.55,templeBrick,8);
        for(const y of [1.0,4.8,6.55])column(x,y,z,.35,2.2,2.2,templeGold);
      }else if(id==="bound-prang"){
        spire(x,.4,z,7.5);
        for(const side of [-1,1]){
          block(x+side*1.7,2.6,z,.4,4.3,4.5,templeLacquer).rotation.z=side*.28;
          column(x+side*2.8,1.1,z+1.8,1.9,.63,.22,templeGold);
        }
      }else if(id==="cracked-bell"){
        for(const side of [-1,1])block(x+side*1.7,2.5,z,.48,5,.58,darkWood);
        gable(x,5.2,z,5.3,3.9);
        column(x,2.9,z,2.4,2.55,1.25,templeBronze,12);
        column(x,1.75,z,.21,2.75,2.6,templeGold,12);
        column(x,4.35,z,.7,.23,.23,templeGold);
      }else if(id==="cloister-stele"){
        block(x,2.6,z,2.5,4.8,1.0,templeStone);
        for(const side of [-1,1]){block(x+side*.83,2.5,z,.32,3.8,1.1,templeLacquer);}
        for(let i=0;i<5;i++)block(x,1.4+i*.56,z,1.1-(i%3)*.18,.12,1.13,templeGold);
        gable(x,5,z,3.6,2.1);
      }else if(id.includes("lamp")||id.startsWith("votive-")){
        column(x,1.25,z,2,.68,.51,templeStone);column(x,2.7,z,1.2,1.05,.18,glowMat,6);
      }else{
        const height=2.8+(Math.abs(x+z)%4)*.65;
        column(x,height/2+.45,z,height,1.75,1.3,templeStone);
        column(x,height*.57,z,.23,1.72,1.72,templeGold);
      }
      finish("temple "+id,true);
    }
    // Sunken seams and flush stair markings keep movement level along the traversable floor.
    for(const [cx,cz] of [[0,14],[0,-61]]){
      for(let step=0;step<4;step++)block(cx,.034,cz+step*.55,5.1-step*.15,.025,.16,templeStone);
    }
    // The inscribed west cloister and bell court have their own floor patterns.
    for(const camp of map.camps){
      for(const sign of [-1,1]){
        block(camp.x+sign*9.4,-.039,camp.z,.16,.02,17.6,templeStone);
        block(camp.x,-.039,camp.z+sign*8.8,19,.02,.16,templeStone);
      }
      const seal=B.MeshBuilder.CreateTorus("court seal",{diameter:5,thickness:.11,tessellation:8},scene);
      place(seal,camp.x,.047,camp.z,templeGold);
    }
    finish("courtyard inscriptions");
    gable(0,7.4,18,14.0,4.6);
    for(const side of [-1,1]){
      block(side*4.8,5.25,18,1.0,3.4,.15,templeLacquer);
      block(side*4.8,3.7,18,1.1,.18,.18,templeGold);
    }
    finish("temple gate roof",true);
    // Votive candles pool warm light; talisman banners hang on both wall faces.
    for(const o of map.obstacles){
      if(!(o.id.includes("lamp")||o.id.startsWith("votive-")))continue;
      place(lightPool(o.x,o.z,3.6,.05),o.x,.05,o.z,lightPoolMat);
      for(let i=0;i<5;i++){
        const a=i*1.26,cx=o.x+Math.cos(a)*(o.radius+.5),cz=o.z+Math.sin(a)*(o.radius+.5),h=.2+noise(i,o.x)*.25;
        column(cx,h/2,cz,h,.1,.1,waxMat,6);column(cx,h+.06,cz,.13,.08,0,candleMat,4);
      }
    }
    for(const side of [-1,1]){
      place(lightPool(side*4.8,19.6,3,.05),side*4.8,.05,19.6,lightPoolMat);
      for(let i=0;i<6;i++)column(side*4.8+(noise(i,side)-.5)*1.2,.15,19.4+(noise(i,7)-.5)*.8,.3,.1,.1,candleMat,5);
    }
    finish("temple candles");
    for(const wall of map.walls||[]){
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length),thick=Math.min(wall.width,wall.length);
      const cx=wall.x+wall.width/2,cz=wall.z+wall.length/2;
      for(let i=2.5;i<span-1.5;i+=7)for(const side of [-1,1]){
        const off=thick/2+.07,dx=alongX?i-span/2:side*off,dz=alongX?side*off:i-span/2;
        block(cx+dx,5.6,cz+dz,alongX?1.2:.06,2.6,alongX?.06:1.2,templeBanner);
      }
    }
    finish("temple banners");
    // Rubble and toppled columns around the ruins.
    for(const o of map.obstacles.filter(o=>o.id.startsWith("ruin-")||o.id==="cloister-stele"||o.id==="cracked-bell")){
      for(let k=0;k<7;k++){
        const a=k*1.05+o.z,r=o.radius+.5+noise(k,o.x)*2,size=.25+noise(k,o.z)*.45;
        block(o.x+Math.cos(a)*r,size/2,o.z+Math.sin(a)*r,size*1.3,size,size,k%2?templeBrick:templeStone).rotation.y=a;
      }
    }
    for(const [x,z,a] of [[-33,-4,.4],[36,-47,-.7],[-18,-63,1.2]]){
      const fallen=column(x,.45,z,3.2,.9,.9,templeStone,8);fallen.rotation.z=Math.PI/2;fallen.rotation.y=a;
      column(x+Math.cos(a)*2.2,.25,z-Math.sin(a)*2.2,.5,1,1,templeGold,8).rotation.z=.2;
    }
    // Moss and weeds at every wall foot.
    for(const wall of map.walls||[]){
      const alongX=wall.width>wall.length,span=Math.max(wall.width,wall.length),thick=Math.min(wall.width,wall.length);
      for(let i=.5;i<span;i+=1.1)for(const side of [-1,1]){
        const k=Math.round(i*10)+side*7+wall.x;if(noise(k,151)<.3)continue;
        const off=thick/2+.25+noise(k,152)*.3,h=.25+noise(k,153)*.35;
        column(wall.x+(alongX?i:wall.width/2+side*off),h/2,wall.z+(alongX?wall.length/2+side*off:i),h,.35,0,mossMat,3);
      }
    }
    // Weeds and lifted, cracked slabs across the open courts.
    const templeClear=(x,z)=>!(map.walls||[]).some(w=>x>w.x-.6&&x<w.x+w.width+.6&&z>w.z-.6&&z<w.z+w.length+.6)&&
      !map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+.9)&&
      !(map.paths||[]).some(path=>path.some((p,i)=>{if(!i)return false;const a=path[i-1],dx=p.x-a.x,dz=p.z-a.z,l=dx*dx+dz*dz||1;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<2.6;}));
    const tb=map.bounds;
    for(let i=0;i<340;i++){
      const x=tb.minX+2+noise(i,191)*(tb.maxX-tb.minX-4),z=tb.minZ+2+noise(i,192)*(tb.maxZ-tb.minZ-4);
      if(!templeClear(x,z))continue;
      if(i%4===0){const slabPiece=block(x,.06,z,1.6+noise(i,193),.12,.8+noise(i,194)*.5,templeStone);slabPiece.rotation.y=noise(i,195)*3;slabPiece.rotation.z=(noise(i,196)-.5)*.16;}
      else for(let k=0;k<3;k++){const h=.22+noise(i*3+k,197)*.3;column(x+(noise(i*3+k,198)-.5),h/2,z+(noise(i*3+k,199)-.5),h,.3,0,mossMat,3);}
    }
    // Naga balustrades flank both stairways.
    for(const cz of [14,-61])for(const side of [-1,1]){
      block(side*2.85,.38,cz+.9,.42,.76,4.4,templeBronze);
      block(side*2.85,.8,cz+.9,.5,.1,4.5,templeGold);
      const head=column(side*2.85,1.3,cz-1.55,1.4,.6,.16,templeBronze,6);head.rotation.x=-.45;
      for(const fan of [-1,0,1])column(side*2.85+fan*.28,2.05,cz-1.75,.6,.18,0,templeGold,4).rotation.z=-fan*.5;
    }
    // Ruined chedi on the skyline beyond the courts.
    function chedi(x,z,size,lean){
      const parts=[
        block(x,size*.12,z,size,size*.24,size,templeBrick),
        block(x,size*.3,z,size*.78,size*.14,size*.78,templeStone),
        column(x,size*.62,z,size*.5,size*.7,size*.42,templeBrick,10),
        column(x,size*.9,z,size*.1,size*.46,size*.46,templeStone,10),
        column(x,size*1.25,z,size*.62,size*.3,.04,templeBrick,10)];
      for(const part of parts.slice(2))part.rotation.z=lean;
    }
    for(const [x,z,size,lean] of [[-60,-12,6,.03],[60,-30,7,-.05],[-58,-52,5,.08],[57,8,5.5,0],[-30,-88,6.5,.04],[30,-90,5,-.09],[0,-95,8,0]])chedi(x,z,size,lean);
    finish("temple ruins detail");
    expansionLabel("วัดร้างพันธนาการ · Lv 8–20",0,18,18,10.5);
  }
