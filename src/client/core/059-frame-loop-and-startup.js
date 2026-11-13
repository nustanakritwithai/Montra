  // Live boats keep the authoritative deck and load their visual model independently.
  const sailingMeshes = new Map();
  const dugoutContainers = new Map();
  const dugoutLodDistances = LITE ? [0, 26] : [24, 53];
  const boatPanel = $("boatPanel");
  let nextHelmInput = 0, requestedBoatAnchor = null, currentHelmBoat = "";
  let sailingDestination = null, sailingMarker = null;

  function dugoutContainer(lod, now) {
    let entry = dugoutContainers.get(lod);
    if (!entry || (entry.retryAt && now >= entry.retryAt)) {
      const file = `MONTRA-ayutthaya-dugout-LOD${lod}.glb`;
      entry = {retryAt: 0};
      dugoutContainers.set(lod, entry);
      entry.load = B.SceneLoader.LoadAssetContainerAsync("./assets/boats/", file, scene, undefined, ".glb").catch(error => {
        entry.retryAt = performance.now() + 30000;
        console.warn("MONTRA dugout could not load", error);
        return null;
      });
    }
    return entry;
  }

  function updateDugoutModel(node, deck, distance, now) {
    if (!B.SceneLoader?.LoadAssetContainerAsync || !node.metadata.sailingBoat) return;
    const current = node.metadata.dugout;
    const [near, far] = dugoutLodDistances;
    const lod = near && distance < near + (current?.lod === 0 ? 5 : 0) ? 0 :
      distance < far + (current?.lod === 1 ? 5 : 0) ? 1 : 2;
    node.metadata.dugoutWanted = lod;
    if (current?.lod === lod || node.metadata.dugoutFailed === lod) return;
    const entry = dugoutContainer(lod, now);
    if (entry.retryAt || node.metadata.dugoutPending === entry) return;
    node.metadata.dugoutPending = entry;
    entry.load.then(container => {
      if (node.isDisposed() || node.metadata.dugoutWanted !== lod || node.metadata.dugoutPending !== entry || !container) return;
      const model = container.instantiateModelsToScene(name => name, false, {doNotInstantiate: true});
      let root;
      try {
        const nodes = model.rootNodes.flatMap(root => [root, ...root.getDescendants()]);
        const seat = nodes.find(part => part.name === "Seat");
        const paddle = nodes.find(part => part.name === "Paddle");
        if (!seat || !paddle || !nodes.some(part => part.name === "Dugout_Hull")) throw new Error("Incomplete dugout model");
        root = new B.TransformNode("dugout visual", scene);
        root.parent = node;
        // Convert the authored 4 m hull to the existing deck envelope and keep its keel in the water.
        const heightScale = deck.y / (.16 + seat.position.y);
        root.scaling.set(.95 / .85, heightScale / node.scaling.y, 5.1 / 4);
        root.position.y = .16 - seat.position.y * root.scaling.y;
        for (const part of model.rootNodes) part.parent = root;
        for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
        paddle.rotationQuaternion = null;
        const stowed = paddle.position.clone();
        const previous = node.metadata.dugout;
        previous?.root.dispose();
        node.metadata.dugout = {lod, root, seat, paddle, stowed, row: previous?.row ?? 0, side: previous?.side};
        node.metadata.fallback?.dispose();
        node.metadata.fallback = node.metadata.sternPaddle = null;
      } catch (error) {
        model.dispose();
        root?.dispose();
        throw error;
      }
    }).catch(error => {
      if (!node.isDisposed()) node.metadata.dugoutFailed = lod;
      console.warn("MONTRA dugout could not attach", error);
    }).finally(() => {
      if (!node.isDisposed() && node.metadata.dugoutPending === entry) node.metadata.dugoutPending = null;
    });
  }

  function animateDugout(model, boat, turn, now, dt) {
    const power = boat.helmId && !boat.anchored ? Math.min(1, Math.abs(boat.speed) / 3 + Math.abs(turn) * 5) : 0;
    model.row += (power - model.row) * (1 - Math.exp(-dt * 9));
    const phase = now * .005;
    const targetSide = Math.abs(turn) > .07 ? Math.sign(turn) : Math.tanh(Math.sin(phase * .5) * 5);
    model.side ??= targetSide;
    model.side += (targetSide - model.side) * (1 - Math.exp(-dt * 8));
    const stroke = Math.sin(phase), side = model.side;
    model.stroke = stroke * model.row;
    const {paddle, stowed, seat, row} = model;
    paddle.position.set(stowed.x + (side * .17 - stowed.x) * row,
      stowed.y + (seat.position.y + .12 - stowed.y) * row, stowed.z + (seat.position.z + .17 - stowed.z) * row);
    paddle.rotation.set((.29 + .13 * Math.cos(phase)) * row, side * (1.10 + .29 * stroke) * row, 0);
  }

  function sendBoatIntent(action, fields = {}) {
    if (mode !== "live" || !room?.state?.boatsAvailable) return;
    try { room.send("boat_intent", {action,...fields}); }
    catch { if (action !== "input") toast("ส่งคำสั่งเรือไม่สำเร็จ"); }
  }
  function resetHelmControls() {
    clearSailingDestination();
    requestedBoatAnchor = null;
  }
  function ownBoatState() {
    const player = ownServerCharacter();
    return player?.boatId ? room.state.boats?.get(player.boatId) : null;
  }
  function boatAtHelm() {
    const boat = ownBoatState();
    return Boolean(boat && !boat.sunk && boat.mapId===activeMapId && boat.helmId===localId);
  }

  function clearSailingDestination() {
    sailingDestination = null;
    sailingMarker?.setEnabled(false);
  }
  function sailingWaterDestination(x, z, map) {
    if (!map?.boatDock || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const bounds = map.bounds;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return null;
    const waters = map.water?.length ? map.water : map.id === "ritual_village" ? [villageRiver] : [];
    const margin = map.boatDock.deck.length/2 + .1;
    let destination = null, adjustment = Infinity;
    for (const w of waters) {
      if (x < w.x || x > w.x+w.width || z < w.z || z > w.z+w.length) continue;
      const minX = Math.max(w.x,bounds.minX)+margin, maxX = Math.min(w.x+w.width,bounds.maxX)-margin;
      const minZ = Math.max(w.z,bounds.minZ)+margin, maxZ = Math.min(w.z+w.length,bounds.maxZ)-margin;
      if (minX > maxX || minZ > maxZ) continue;
      const goal = {x:Math.max(minX,Math.min(maxX,x)),z:Math.max(minZ,Math.min(maxZ,z))};
      if (map.waterLevel!==undefined && worldWaterDepth(map,goal.x,goal.z)<.45) continue;
      const change = Math.hypot(goal.x-x,goal.z-z);
      if (change < adjustment) {destination=goal;adjustment=change;}
    }
    return destination;
  }
  function steerSailingAt(px, py) {
    if (!boatAtHelm()) return;
    const ray = scene.createPickingRay(px,py,B.Matrix.Identity(),camera);
    if (Math.abs(ray.direction.y) < .00001) return;
    const map = worldDefinitions?.[activeMapId];
    const waterY = map?.waterLevel ?? (map?.id === "ritual_village" ? villageWaterLevel : 0);
    const t = (waterY-ray.origin.y)/ray.direction.y;
    if (t < 0) return;
    const point = sailingWaterDestination(ray.origin.x+t*ray.direction.x,ray.origin.z+t*ray.direction.z,map);
    if (!point) return;
    setSailingDestination(point,waterY);
  }
  function sailThroughGate(id) {
    if(!boatAtHelm()){toast("จับหางเสือก่อนผ่านประตูน้ำ");return;}
    const map=worldDefinitions?.[activeMapId],gate=map?.waterGates?.find(entry=>entry.id===id);
    if(gate)return setSailingDestination(gate,map.waterLevel,gate);
  }
  function sailToPort(id) {
    if(!boatAtHelm())return false;
    const map=worldDefinitions[activeMapId],port=map?.boatPorts?.find(entry=>entry.id===id);
    return Boolean(port && setSailingDestination(port.berth,map.waterLevel,undefined,port));
  }
  function* sailingCourse(map,start,end,traffic=[],retry=0) {
    if(![start.x,start.z,end.x,end.z].every(Number.isFinite))return [];
    // Older world definitions did not ship water depth or a river network.
    const hasDepth=map.waterLevel!==undefined && map.terrain;
    if(!hasDepth)return sailingTrafficBlocks(start,end,traffic,map.boatDock.deck.length) ? [] : [end];
    const radius=map.boatDock.deck.length/2, bounds=map.bounds;
    const rim=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
    const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    const free=(x,z,clearance)=>{
      if(x-clearance<bounds.minX || x+clearance>bounds.maxX || z-clearance<bounds.minZ || z+clearance>bounds.maxZ ||
          worldWaterDepth(map,x,z)<.45 || map.obstacles?.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+clearance))return false;
      if(map.walls?.some(w=>{
        const dx=Math.max(w.x-x,0,x-w.x-w.width),dz=Math.max(w.z-z,0,z-w.z-w.length);
        return dx*dx+dz*dz<=clearance*clearance;
      }))return false;
      return rim.every(([dx,dz])=>worldWaterDepth(map,x+dx*clearance,z+dz*clearance)>0);
    };
    let checks=0;
    function* clear(a,b){
      if(sailingTrafficBlocks(a,b,traffic,radius*2+.25))return false;
      const length=gap(a,b),steps=Math.max(1,Math.ceil(length/.45));
      for(let i=0;i<=steps;i++){
        const x=a.x+(b.x-a.x)*i/steps,z=a.z+(b.z-a.z)*i/steps;
        const clearance=radius+Math.min(.22,Math.min(i,steps-i)*length/steps*.12);
        if(++checks>=24){checks=0;yield;}
        if(!free(x,z,clearance))return false;
      }
      return true;
    }
    if(!free(start.x,start.z,radius) || !free(end.x,end.z,radius))return [];
    if(yield* clear(start,end))return [end];

    // RRT-Connect grows from both ends. Like MonsterRRT, use a seeded xorshift
    // and smooth only across traversable edges. River lanes bias the samples.
    const lanes=map.boatLanes??[], waters=map.water??[];
    let seed=(Math.round(start.x*16)^Math.imul(Math.round(start.z*16),71)^
      Math.imul(Math.round(end.x*16),16777619)^Math.round(end.z*16)^Math.imul(retry,2654435761))||71;
    const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    const sample=(target)=>{
      const bias=rand();
      if(bias<.15)return target;
      if(bias<.65 && lanes.length){
        const [a,b]=lanes[Math.floor(rand()*lanes.length)], t=rand();
        return {x:a.x+(b.x-a.x)*t+(rand()-.5)*3,z:a.z+(b.z-a.z)*t+(rand()-.5)*3};
      }
      const area=waters[Math.floor(rand()*waters.length)];
      return area && {x:area.x+rand()*area.width,z:area.z+rand()*area.length};
    };
    const step=Math.min(7,Math.max(2.5,radius*1.6));
    function* extend(tree,target){
      let nearest=tree[0], best=Infinity;
      for(const node of tree){
        const distance=(node.point.x-target.x)**2+(node.point.z-target.z)**2;
        if(distance<best){nearest=node;best=distance;}
      }
      if(best<1e-8)return nearest;
      const t=Math.min(1,step/Math.sqrt(best));
      const point=t===1?target:{x:nearest.point.x+(target.x-nearest.point.x)*t,z:nearest.point.z+(target.z-nearest.point.z)*t};
      if(!(yield* clear(nearest.point,point)))return null;
      const node={point,parent:nearest};
      tree.push(node);
      return node;
    }
    function trace(node){
      const path=[];
      for(;node;node=node.parent)path.push(node.point);
      return path;
    }
    const fromStart=[{point:start,parent:null}], fromEnd=[{point:end,parent:null}];
    for(let i=0;i<220 && fromStart.length+fromEnd.length<360;i++){
      if(i>0 && i%16===0)yield;
      const forward=i%2===0, a=forward?fromStart:fromEnd, b=forward?fromEnd:fromStart;
      const target=sample(b[0].point), grown=target&&(yield* extend(a,target));
      if(!grown)continue;
      for(let j=0;j<8 && fromStart.length+fromEnd.length<360;j++){
        const joined=yield* extend(b,grown.point);
        if(!joined)break;
        if(gap(joined.point,grown.point)>1e-4)continue;
        const path=trace(forward?grown:joined).reverse().concat(trace(forward?joined:grown).slice(1));
        const course=[];
        for(let at=0;at<path.length-1;){
          // Limit long shortcut probes in winding canals; existing tree edges remain valid.
          let next=Math.min(at+24,path.length-1);
          while(next>at+1 && !(yield* clear(path[at],path[next])))next--;
          course.push(path[next]);
          at=next;
        }
        return course;
      }
    }

    // Long authored waterways also have a deterministic route if the tree runs out of samples.
    const points=[start,end];
    function add(p){if(!points.some(q=>gap(p,q)<.01))points.push(p);}
    for(const [a,b] of lanes){
      add(a);add(b);
      const dx=b.x-a.x,dz=b.z-a.z;
      if(!dx && !dz)continue;
      for(const p of [start,end]){
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
        add({x:a.x+t*dx,z:a.z+t*dz});
      }
    }
    const remaining=new Set(points.keys()),distance=points.map(()=>Infinity),from=[];
    distance[0]=0;
    while(remaining.size){
      let i=-1;
      for(const index of remaining)if(i<0 || distance[index]<distance[i])i=index;
      if(!Number.isFinite(distance[i]))return [];
      if(i===1){
        const course=[];
        for(let step=i;step!==0;step=from[step])course.push(points[step]);
        return course.reverse();
      }
      remaining.delete(i);
      for(const j of remaining){
        const length=distance[i]+gap(points[i],points[j]);
        if(length<distance[j] && (yield* clear(points[i],points[j]))){distance[j]=length;from[j]=i;}
      }
    }
    return [];
  }
  function sailingTrafficBlocks(from,to,traffic,clearance){
    const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
    return traffic.some(other=>{
      const x=other.x-from.x,z=other.z-from.z;
      const t=length ? Math.max(0,Math.min(1,(x*dx+z*dz)/length)) : 0;
      return (x-t*dx)**2+(z-t*dz)**2<clearance**2;
    });
  }
  function sailingTraffic(boat){
    const traffic=[], ownId=ownServerCharacter()?.boatId;
    room?.state?.boats?.forEach((other,id)=>{
      if(id!==ownId && other!==boat && other.mapId===boat.mapId && !other.sunk &&
          Number.isFinite(other.x) && Number.isFinite(other.z))traffic.push(other);
    });
    return traffic;
  }
  function sailingTrafficClosing(boat,traffic,clearance){
    const vx=Math.sin(boat.heading)*boat.speed,vz=Math.cos(boat.heading)*boat.speed;
    const horizon=.35+Math.abs(boat.speed)/4;
    return traffic.some(other=>{
      const x=other.x-boat.x,z=other.z-boat.z;
      const dx=Math.sin(other.heading)*other.speed-vx,dz=Math.cos(other.heading)*other.speed-vz;
      const closing=-(x*dx+z*dz);
      if(!(closing>0))return false;
      const t=Math.min(horizon,closing/(dx*dx+dz*dz));
      return (x+t*dx)**2+(z+t*dz)**2<clearance**2;
    });
  }
  function setSailingDestination(point,waterY,gate,port) {
    const boat = ownBoatState(),map=worldDefinitions[activeMapId];
    if(!boat || boat.sunk || !map?.boatDock)return false;
    if(sailingDestination?.gateRequest?.sent)return false;
    if(sailingDestination?.gateRequest && sailingDestination.gate===gate)return true;
    cancelQuestNavigation("",false);
    const now=performance.now();
    sailingDestination = {x:point.x,z:point.z,gate,port,map,
      progress:{x:boat.x,z:boat.z,heading:boat.heading,at:now},lastAdvance:now};
    planSailingCourse(sailingDestination,boat);
    if (!sailingMarker) {
      sailingMarker = marker.clone("sailing destination");
      sailingMarker.isPickable = false;
    }
    sailingMarker.position.set(point.x,waterY+.15,point.z);
    sailingMarker.setEnabled(true);
    requestedBoatAnchor = false;
    return true;
  }
  function planSailingCourse(goal,boat,traffic=sailingTraffic(boat)){
    goal.planStart={x:boat.x,z:boat.z};
    goal.planHadTraffic=traffic.length>0;
    goal.course=null;
    const obstacles=traffic.map(({x,z})=>({x,z}));
    goal.planner=sailingCourse(goal.map,goal.planStart,{x:goal.x,z:goal.z},obstacles,goal.retries??0);
  }
  function advanceSailingCourse(boat,now){
    const goal=sailingDestination;
    if(!goal?.planner)return;
    const result=goal.planner.next();
    if(!result.done)return;
    goal.planner=null;
    if(Math.hypot(boat.x-goal.planStart.x,boat.z-goal.planStart.z)>.2){
      planSailingCourse(goal,boat);
      return;
    }
    if(!result.value.length){
      if(goal.planHadTraffic)goal.trafficWait??={since:now,retryAt:now+1200};
      if(goal.trafficWait)return;
      clearSailingDestination();
      requestedBoatAnchor=true;
      toast("ไม่พบร่องน้ำไปยังจุดนี้");
      return;
    }
    goal.course=result.value;
    requestedBoatAnchor=false;
    goal.aligning=Boolean(goal.retries || goal.trafficWait || goal.map.boatLanes?.length || goal.course.length>1);
    goal.trafficWait=null;
    goal.reverse=undefined;
    goal.progress={x:boat.x,z:boat.z,heading:boat.heading,at:now};
    goal.lastAdvance=now;
    goal.bestDistance=Infinity;
  }
  function wrapSailingAngle(angle) {
    return Math.atan2(Math.sin(angle),Math.cos(angle));
  }
  function rejectSailingGate(reason){
    const goal=sailingDestination;
    if(!goal?.gateRequest?.sent)return false;
    if((reason==="boat_gate_busy" || reason==="boat_gate_cooldown") && goal.gateRequest.attempts<3){
      goal.gateRequest.sent=false;
      goal.gateRequest.at=performance.now()+1500;
      return true;
    }
    clearSailingDestination();
    requestedBoatAnchor=true;
    return false;
  }
  function sailingInputForDestination(boat, now) {
    const goal = sailingDestination;
    if (!goal) return {throttle:0,steer:0};
    if(goal.trafficWait && now-goal.trafficWait.since>=8000){
      clearSailingDestination();
      requestedBoatAnchor=true;
      toast("มีเรือขวางทาง · เลือกจุดหมายใหม่เมื่อทางว่าง");
      return {throttle:0,steer:0};
    }
    if(goal.planner){requestedBoatAnchor=true;return {throttle:0,steer:0};}
    const course=goal.course;
    while(course?.length>1 && Math.hypot(course[0].x-boat.x,course[0].z-boat.z)<=.2){
      course.shift();
      goal.aligning=true;
      goal.reverse=undefined;
      goal.progress={x:boat.x,z:boat.z,heading:boat.heading,at:now};
      goal.lastAdvance=now;
      goal.bestDistance=Infinity;
    }
    const next=course?.[0]??goal;
    const dx = next.x-boat.x, dz = next.z-boat.z;
    const distance = Math.hypot(dx,dz);
    if(goal.gate && (!course || course.length===1) && distance<=goal.gate.range-.35){
      requestedBoatAnchor=true;
      const request=goal.gateRequest??={attempts:0,at:now,sent:false};
      if(request.sent && now>=request.at){
        clearSailingDestination();
        toast("ยังไม่ได้รับผลจากประตูน้ำ · แตะประตูอีกครั้ง");
        return {throttle:0,steer:0};
      }
      if(request.sent)return null;
      if(now<request.at || !boat.anchored || Math.abs(boat.speed)>1)return {throttle:0,steer:0};
      request.sent=true;
      request.at=now+3500;
      request.attempts++;
      // Keep the route until the server changes map/passage or rejects the request.
      sendBoatIntent("warp",{gateId:goal.gate.id});
      return null;
    }
    if(goal.gateRequest){
      goal.gateRequest=null;
      requestedBoatAnchor=false;
    }
    const arrived=Boolean(course?.length===1 && distance<=1.35 && !goal.gate);
    if(goal.map && !arrived){
      const traffic=sailingTraffic(boat), clearance=goal.map.boatDock.deck.length;
      const speed=Math.abs(boat.speed), ahead=Math.min(1,(1.1+speed*.35+speed*speed/8)/Math.max(.01,distance));
      const lookahead={x:boat.x+dx*ahead,z:boat.z+dz*ahead};
      if(!course || sailingTrafficBlocks(boat,lookahead,traffic,clearance) || sailingTrafficClosing(boat,traffic,clearance)){
        const wait=goal.trafficWait??={since:now,retryAt:now};
        if(now>=wait.retryAt){
          wait.retryAt=now+1200;
          planSailingCourse(goal,boat,traffic);
        }
        requestedBoatAnchor=true;
        return {throttle:0,steer:0};
      }
      if(goal.trafficWait){
        goal.trafficWait=null;
        goal.progress={x:boat.x,z:boat.z,heading:boat.heading,at:now};
        goal.lastAdvance=now;
        goal.bestDistance=Infinity;
        goal.aligning=true;
        goal.reverse=undefined;
        requestedBoatAnchor=false;
      }
    }
    const progress = goal.progress;
    const advanced=Math.hypot(boat.x-progress.x,boat.z-progress.z) >= .25;
    if(distance<=(goal.bestDistance??Infinity)-.15){
      goal.bestDistance=distance;
      goal.lastAdvance=now;
    }
    if (advanced ||
        Math.abs(wrapSailingAngle(boat.heading-progress.heading)) >= .16) {
      goal.progress = {x:advanced?boat.x:progress.x,z:advanced?boat.z:progress.z,heading:boat.heading,at:now};
    }
    const stuck=now-goal.progress.at>=2800 || now-goal.lastAdvance>=6500;
    if(!arrived && stuck && goal.map && !goal.retries){
      goal.retries=1;
      planSailingCourse(goal,boat);
      requestedBoatAnchor=true;
      return {throttle:0,steer:0};
    }
    if (arrived || stuck) {
      clearSailingDestination();
      requestedBoatAnchor=true;
      if(goal.port && distance<=1.35 && course?.length===1){
        toast("ถึง"+goal.port.name+" · กดลงจากเรือเมื่อเรือหยุด");
      }else if(goal.port)toast("ทางเข้าท่าติดขัด · ลองเข้าจากอีกมุม");
      else if(goal.gate)toast("ทางเข้าประตูน้ำติดขัด · ลองเข้าจากอีกมุม");
      else if(stuck)toast("เส้นทางเรือติดขัด · เลือกจุดหมายใหม่");
      return {throttle:0,steer:0};
    }
    const bearing = Math.atan2(dx,dz);
    const facingAway = Math.abs(wrapSailingAngle(bearing-boat.heading)) > Math.PI/2;
    if(goal.aligning && goal.reverse===undefined)goal.reverse=distance<12 && facingAway;
    const reverse = goal.reverse??facingAway;
    const headingError = wrapSailingAngle(bearing-boat.heading-(reverse ? Math.PI : 0));
    // Align before leaving a berth or turning into a narrower reach. At idle the
    // rudder can still rotate, without thrust pushing the hull into the bank.
    if(Math.abs(headingError)>.55 && goal.map?.boatLanes?.length)goal.aligning=true;
    if(goal.aligning && (Math.abs(headingError)>.035 || Math.abs(boat.speed)>.25)){
      const movingBackward=boat.speed<0?-1:1;
      return {throttle:0,steer:-movingBackward*Math.max(-1,Math.min(1,headingError*5))};
    }
    goal.aligning=false;
    const direction = reverse ? -1 : 1;
    const momentum = Math.abs(boat.speed) > .15 ? Math.sign(boat.speed) : direction;
    const maxThrottle = reverse ? .8 : .72;
    const brakingDistance = reverse ? 4.5 : 10;
    return {
      throttle:direction*Math.min(maxThrottle,distance/brakingDistance)*Math.max(.18,Math.cos(headingError)),
      steer:-momentum*Math.max(-1,Math.min(1,headingError*2)),
    };
  }

  $("boatLaunch").onclick = () => { cancelQuestNavigation();sendBoatIntent("launch"); };
  $("boatBoard").onclick = () => {
    const id = $("boatBoard").dataset.boatId;
    if (id) {cancelQuestNavigation();sendBoatIntent("board",{boatId:id});}
  };
  $("boatHelm").onclick = () => sendBoatIntent(boatAtHelm() ? "release" : "helm");
  $("boatExit").onclick = () => {
    const boat=ownBoatState();
    if(!boat)return;
    if(Math.abs(boat.speed)>1){toast("หยุดเรือก่อนลง");return;}
    sendBoatIntent("exit");
  };
  addEventListener("blur",resetHelmControls);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)resetHelmControls();});

  function clickSailingDeck(id, point) {
    const player = ownServerCharacter();
    if (!player?.boatId) {sendBoatIntent("board",{boatId:id});return;}
    if (player.boatId !== id || !point) return;
    if (boatAtHelm()) {
      clearSailingDestination();
      requestedBoatAnchor = true;
      return;
    }
    const node = sailingMeshes.get(id);
    if (!node) return;
    const dx = point.x-node.position.x, dz = point.z-node.position.z;
    const c = Math.cos(node.rotation.y), s = Math.sin(node.rotation.y);
    sendBoatIntent("walk",{x:dx*c-dz*s,z:dx*s+dz*c});
  }

  function sailingHelmPose(id) {
    const state=mode==="live"?room?.state:null;
    const player=state?.players?.get(id);
    const boat=player?.boatId && state.boats?.get(player.boatId);
    if(!boat || player.alive===false || boat.helmId!==id || boat.mapId!==activeMapId)return null;
    const node=sailingMeshes.get(player.boatId),deck=worldDefinitions?.[activeMapId]?.boatDock?.deck;
    if(!node || !deck)return null;
    const stern=deck.helmZ??-deck.length*.22,heading=node.rotation.y;
    const dugout=node.metadata.dugout;
    if(dugout && player.combatState==="idle"){
      const seat=dugout.seat.computeWorldMatrix(true).getTranslation();
      return {x:seat.x,y:seat.y,z:seat.z,facing:heading+Math.PI,dugout};
    }
    return {x:node.position.x+stern*Math.sin(heading),y:node.position.y+deck.y,
      z:node.position.z+stern*Math.cos(heading),facing:player.combatState==="idle"?heading+Math.PI:null};
  }

  let capitalWakeMaterial;
  function updateCapitalBoatWater(node,boat,map,now) {
    const level=map.waterLevel;
    const phase=now*.0018+node.position.x*.21+node.position.z*.16;
    const bob=.055*Math.sin(phase)+.024*Math.sin(phase*1.7);
    node.metadata.waterBob=bob;
    node.position.y=level+bob;
    const speed=Math.min(1,Math.abs(boat.speed)/5);
    const moving=speed>.1;
    let wake=node.metadata.waterWake;
    if(!wake && moving){
      if(!capitalWakeMaterial){
        const texture=paintTexture("sailing wake foam",128,(c,s)=>{
          c.clearRect(0,0,s,s);
          const fade=c.createLinearGradient(0,s,0,0);
          fade.addColorStop(0,"rgba(255,255,255,.9)");
          fade.addColorStop(.58,"rgba(255,255,255,.55)");
          fade.addColorStop(1,"rgba(255,255,255,0)");
          c.strokeStyle=fade;c.lineCap="round";
          for(const side of [-1,1])for(let i=0;i<3;i++){
            c.lineWidth=2.6-i*.55;
            c.beginPath();c.moveTo(s*(.5+side*(.05+i*.055)),s*(.98-i*.13));
            c.quadraticCurveTo(s*(.5+side*.2),s*.5,s*(.5+side*(.48-i*.045)),s*.06);c.stroke();
          }
        });
        texture.hasAlpha=true;
        capitalWakeMaterial=mat("sailing wake","#b6e3e9","#a2dbe4");
        capitalWakeMaterial.opacityTexture=texture;capitalWakeMaterial.disableLighting=true;
        capitalWakeMaterial.disableDepthWrite=true;
      }
      wake=B.MeshBuilder.CreateGround("sailing wake",{width:3.2,height:4},scene);
      wake.material=capitalWakeMaterial;wake.isPickable=false;wake.metadata={noShadow:true};
      node.metadata.waterWake=wake;
      node.onDisposeObservable.addOnce(()=>wake.dispose());
    }
    if(!wake)return;
    const heading=node.rotation.y+(boat.speed<0?Math.PI:0);
    const trail=map.boatDock.deck.length*.38+1.4;
    const x=node.position.x-Math.sin(heading)*trail,z=node.position.z-Math.cos(heading)*trail;
    wake.setEnabled(moving && worldWaterDepth(map,x,z)>.2);
    wake.position.set(x,level+.035,z);
    wake.rotation.y=heading;
    wake.scaling.set(.72+.28*speed,1,.68+.55*speed);
    wake.visibility=.22+.58*speed;
  }

  function updateSailing(now, dt) {
    const state = mode === "live" ? room?.state : null;
    const map = state?.boatsAvailable ? worldDefinitions?.[activeMapId] : null;
    const dock=map?.boatDock;
    const player = dock ? ownServerCharacter() : null;
    const seen = new Set();
    let nearestId = "", nearestDistance = Infinity;
    if (dock) state.boats?.forEach((boat,id)=>{
      if (boat.mapId !== activeMapId || boat.sunk) return;
      seen.add(id);
      const distance = player ? Math.hypot(player.x-boat.x,player.z-boat.z) : Infinity;
      const atLanding=player && map.boatPorts?.some(port=>
        Math.hypot(player.x-port.shore.x,player.z-port.shore.z)<=1.6 &&
        Math.hypot(boat.x-port.berth.x,boat.z-port.berth.z)<=2.4);
      if (distance <= (atLanding?10:6.5) && distance <= nearestDistance && Math.abs(boat.speed) <= 1) {
        nearestDistance=distance;nearestId=id;
      }
      let node = sailingMeshes.get(id);
      if(node && node.metadata.mapId!==boat.mapId){node.dispose();node=null;}
      if (!node) {
        node = longTailBoat(boat.x,boat.z,boat.heading,true);
        node.metadata={...node.metadata,mapId:boat.mapId};
        node.position.y = worldDefinitions[activeMapId]?.waterLevel ?? 0;
        node.scaling.set(dock.deck.width/.95,dock.deck.y/.16,dock.deck.length/5.1);
        const pick = B.MeshBuilder.CreateBox("sailing deck pick",{
          width:.95*.82*1.08,height:.016,depth:5.1*.62*1.08,
        },scene);
        pick.parent = node;pick.position.y = .16;
        pick.visibility = .004;pick.isPickable = true;pick.metadata = {sailingBoatId:id};
        sailingMeshes.set(id,node);
      }
      const blend = 1-Math.exp(-16*dt);
      node.position.x += (boat.x-node.position.x)*blend;
      node.position.z += (boat.z-node.position.z)*blend;
      const yaw = boat.heading-node.rotation.y;
      const turn = Math.atan2(Math.sin(yaw),Math.cos(yaw));
      node.rotation.y += turn*blend;
      if(map.id==="mantra_capital")updateCapitalBoatWater(node,boat,map,now);
      updateDugoutModel(node,dock.deck,Math.hypot(node.position.x-(camera.target?.x??node.position.x),node.position.z-(camera.target?.z??node.position.z)),now);
      if(node.metadata.dugout){animateDugout(node.metadata.dugout,boat,turn,now,dt);return;}
      const paddle=node.metadata.sternPaddle;
      if(paddle){
        const stroke=boat.helmId?Math.min(1,Math.abs(boat.speed)/3+Math.abs(turn)*5):0;
        paddle.rotation.x=-.22+Math.cos(now*.006)*.035*stroke;
        paddle.rotation.y=Math.sin(now*.006)*.23*stroke;
      }
    });
    for (const [id,node] of sailingMeshes) if (!seen.has(id)) {node.dispose();sailingMeshes.delete(id);}

    const boat = player?.alive ? ownBoatState() : null;
    const helm = Boolean(boat && !boat.sunk && boat.mapId===activeMapId && boat.helmId===localId);
    const helmKey=helm?player.boatId+":"+boat.mapId+":"+(boat.passage??0):"";
    if (currentHelmBoat !== helmKey) {
      resetHelmControls();
      currentHelmBoat = helmKey;
      nextHelmInput = 0;
      if (helm) {
        if (fishingSelect) clearFishing(false);
        toast("แตะน้ำเพื่อขับ · แตะดาดฟ้าเพื่อหยุด");
      }
    }
    const onFoot = player?.alive && !player.boatId && !player.flying && !player.mounted;
    const launchPoints=map?.boatPorts?.map(port=>port.shore)??[dock];
    $("boatLaunch").hidden = !(onFoot && launchPoints.some(shore=>Math.hypot(player.x-shore.x,player.z-shore.z)<=dock.range));
    const boardButton = $("boatBoard"), exitButton = $("boatExit");
    boardButton.hidden = !(onFoot && nearestId);
    boardButton.dataset.boatId = nearestId;
    const helmButton = $("boatHelm");
    helmButton.hidden = !(boat && (!boat.helmId || helm));
    if (helmButton.dataset.helmActive !== String(helm)) {
      helmButton.dataset.helmActive = String(helm);
      helmButton.title = helm ? "ปล่อยหางเสือ" : "จับหางเสือ";
      helmButton.setAttribute("aria-label", helmButton.title);
    }
    exitButton.hidden = !boat;
    $("boatAccess").hidden = boardButton.hidden && exitButton.hidden;
    boatPanel.hidden = !Array.from(boatPanel.children).some(control=>!control.hidden);
    if (!helm) return;
    advanceSailingCourse(boat,now);
    if (now < nextHelmInput) return;
    nextHelmInput = now + 100;
    const input=sailingInputForDestination(boat,now);
    if(!input)return;
    if (requestedBoatAnchor === boat.anchored) requestedBoatAnchor = null;
    sendBoatIntent("input",{...input,...(boat.passage===undefined?{}:{passage:boat.passage}),
      ...(requestedBoatAnchor===null ? {} : {anchor:requestedBoatAnchor})});
  }

  // Cooldown labels must advance even in a quiet room with no schema patches.
  setInterval(()=>{
    if(mode==="live"){syncOccultUI(ownServerCharacter());syncBladeUI(ownServerCharacter());syncSentinelUI(ownServerCharacter());}
    if(drawerActive==="war")updateWarTerritoryStatus();
    if(drawerActive==="strategy")updateAtlasWarTimes();
    if(drawerActive==="cityMarket")updateCityMarketWarTimes();
    if(drawerActive==="cityMission")updateCityContractDeadline();
    if(drawerActive==="quest")updateDirectorTimer();
  },1000);
  $("helpButton").onclick=openHelp;
  $("bag").onclick=openBag;
  // Pose rate by distance from the camera's focus: full rate near the hero, 15/s in the middle
  // distance, 8/s further out. The local hero always poses every frame.
  function poseInterval(local, d) {
    if (local || d < (LITE ? 16 : 26)) return 0;
    return d < (LITE ? 32 : 48) ? 1 / 15 : 1 / 8;
  }
  function syncPossessionButton() {
    const active=mode==="live" ? ownServerCharacter()?.possessionActive===true : possessed;
    heroMat.emissiveColor=B.Color3.FromHexString(active ? "#7c459b" : "#3b2916");
  }
  $("climb").onclick = requestClimb;
  $("harvestButton").onclick=()=>{
    const n=nearbyResource(ownServerCharacter());
    if(!n || !n.stock || !economyReady() || economyPending)return;
    resourceReadyAt=performance.now()+1500;playHarvestMotion(getLocalAvatar(),n);
    economySend("harvest_resource",{node:n.id,requestId:economyRequestId()},true);
  };
  $("fishButton").onclick=()=>{
    if(!economyReady() || fishingPending)return;
    if(fishSavedItem){fishingPending=true;fishingPendingUntil=performance.now()+8000;room.send("fish_claim",{});return;}
    fishingSelect=!fishingSelect;if(fishingSelect)createFishingPickers();else clearFishingPickers();
    toast(fishingSelect?"แตะตำแหน่งในน้ำเพื่อเหวี่ยงเบ็ด":"ยกเลิกเลือกจุดตกปลา");
  };
  $("fishCancel").onclick=()=>clearFishing(true);
  $("fishReel").onclick=()=>{
    if(!fishingState || fishingPending || !room)return;
    fishingPending=true;fishingPendingUntil=performance.now()+8000;room.send("fish_reel",{id:fishingState.id});
  };
  $("fly").onclick = toggleFlightCommand;

  let elapsed=0, lastMapDraw=0;
  engine.runRenderLoop(() => {
    const dt=Math.min(engine.getDeltaTime()/1000,.06);
    elapsed+=dt;
    const now = performance.now();
    updateFishing(now);
    updateSailing(now,dt);
    checkClimbApproach();
    updateQuestNavigation(now);
    for(const [id,fx] of seerBindingEffects){
      const target=monsterForSpell(id) || room?.state?.players?.get?.(id);
      if(mode!=="live" || now>=fx.until || !target?.alive || (target.mapId || "ritual_village")!==activeMapId){fx.mesh.dispose();seerBindingEffects.delete(id);continue;}
      fx.mesh.position.set(Number(target.x),Number(target.y)+.1,Number(target.z));
      fx.mesh.rotation.z+=dt;
    }
    for(const [id,fx] of priestAreaEffects){
      if(mode!=="live" || now>=fx.until || fx.mapId!==activeMapId){fx.mesh.dispose();priestAreaEffects.delete(id);}
    }
    for(let i=skillEffects.length-1;i>=0;i--){
      const fx=skillEffects[i];
      if(now>=fx.until || fx.mapId!==activeMapId || mode!=="live"){
        fx.mesh.dispose();
        skillEffects.splice(i,1);
      } else if (fx.start) {
        B.Vector3.LerpToRef(fx.start, fx.end, 1 - (fx.until - now) / 300, fx.mesh.position);
      }
    }
    if (mode === "demo") {
      if (demoRespawnAt > 0 && now >= demoRespawnAt) {
        resetDemoMonster();
      }
      if (demoAutoAttack && demoMonsterHp > 0) {
        const me = getLocalAvatar();
        if (me) {
          const dx = enemy.position.x - me.targetX;
          const dz = enemy.position.z - me.targetZ;
          const distance = Math.hypot(dx, dz);
          if (distance > 2.6) {
            const ratio = (distance - 2.4) / distance;
            demoDest = {
              x: me.targetX + dx * ratio,
              z: me.targetZ + dz * ratio
            };
          } else {
            demoDest = null;
            if (now - demoLastHitAt >= 1000) {
              demoLastHitAt = now;
              playAttack(localId, false, enemy.position.x, enemy.position.z);
              villageGhost.metadata.ghost.hurtAt = now;
              impactAt(localId, enemy.position.x, enemy.position.z, "", undefined, enemy.position.y);
              demoMonsterHp = Math.max(0, demoMonsterHp - 20);
              registerComboHit();
              floatAtMonster(MONSTER_ID, "20", "dealt");
              hitFlashRemaining = .22;
              const vgGhost = villageGhost?.metadata?.ghost;
              if (vgGhost && vgGhost.shieldActive && vgGhost.shieldHp > 0) {
                processBossShieldDamage(villageGhost, vgGhost, 20, MONSTER_ID);
              }
              if (demoMonsterHp <= 0) {
                hudKills.ritual_village = (hudKills.ritual_village || 0) + 1;
                eventFx("ghost_die", enemy, { y: 0 });
                releaseSoul(enemy.position.x, enemy.position.y + .4, enemy.position.z);
                enemy.setEnabled(false);
                demoAutoAttack = false;
                demoRespawnAt = now + 6000;
                toast("ปราบผีสำเร็จ · DEMO · เกิดใหม่ใน 6 วินาที");
              }
            }
          }
        }
      }
    }
    if (mode === "demo" && demoFlightTarget) {
      const me = getLocalAvatar();
      if (me) {
        const dy = demoFlightTarget.targetY - me.targetY;
        const step = DEMO_FLIGHT_SPEED * dt;
        if (Math.abs(dy) <= step + .00001) {
          me.targetY = demoFlightTarget.targetY;
          demoFlying = !demoFlightTarget.landing;
          demoFlightTarget = null;
          updateFlightButton();
          updateStatus();
          toast(demoFlying
            ? "บินระดับ 6 เมตรแล้ว · แตะพื้นเพื่อเคลื่อนที่"
            : me.targetY > 1
              ? "ลงบนกำแพงแล้ว · DEMO"
              : "ลงถึงพื้นแล้ว · DEMO");
        } else {
          me.targetY += Math.sign(dy) * step;
        }
      } else {
        demoFlightTarget = null;
      }
    }
    if (mode === "demo" && demoDash) {
      const me = getLocalAvatar();
      if (!me) demoDash = null;
      else {
        const distance = Math.min(demoDash.remaining, DASH_DEMO_SPEED * dt);
        let moved = 0, blocked = false;
        while (moved + 1e-8 < distance) {
          const micro = Math.min(0.1, distance - moved);
          const x = me.targetX + demoDash.dx * micro;
          const z = me.targetZ + demoDash.dz * micro;
          const wall = activeFort;
          if (Math.abs(x) > 20 || Math.abs(z) > 20 ||
              (Math.abs(x-wall.x) < wall.width/2 + .32 &&
               Math.abs(z-wall.z) < wall.length/2 + .32)) {
            blocked = true;
            break;
          }
          me.targetX = x;
          me.targetZ = z;
          moved += micro;
        }
        demoDash.remaining = Math.max(0, demoDash.remaining - moved);
        if (blocked || demoDash.remaining < 0.0001) demoDash = null;
      }
    }
    if(mode==="demo" && demoDest) {
      const me=getLocalAvatar();
      if(me) {
        const dx=demoDest.x-me.targetX, dz=demoDest.z-me.targetZ, d=Math.hypot(dx,dz);
        const baseStep=(demoFlying?4:(possessed?4.6:3));
        const mountMult=me.mounted?1.6:1;
        const step=baseStep*mountMult*dt;
        if(d<=step) { me.targetX=demoDest.x;me.targetZ=demoDest.z;demoDest=null; }
        else if(d>0){ me.targetX+=dx/d*step;me.targetZ+=dz/d*step; }
      }
    }
    for(const a of avatars.values()) {
      const beforeX = a.x, beforeZ = a.z;
      const dashing = a.dashUntil > now;
      const blend = 1 - Math.exp(-dt * (dashing ? 25 : 14));
      const helmPose=sailingHelmPose(a.id);
      a.dugoutSeat=helmPose?.dugout ?? null;
      if(helmPose){
        // Attach the pilot to the rendered seat as the hull turns and moves.
        a.x=helmPose.x;a.y=helmPose.y;a.z=helmPose.z;
      }else{
        a.x += (a.targetX - a.x) * blend;
        a.y += (a.targetY - a.y) * blend;
        a.z += (a.targetZ - a.z) * blend;
      }

      // Infer every character's facing from the SERVER-SYNCED position
      // change (or local demo movement). Preserve the last facing at rest.
      // This works with the existing Colyseus x/z schema, so no VPS update.
      const travelX = a.x - beforeX, travelZ = a.z - beforeZ;
      if (mode === "live" && Number.isFinite(a.serverFacing)) {
        a.desiredHeading = a.serverFacing;
      } else if (Math.hypot(travelX, travelZ) > .002 &&
                 performance.now() >= a.facingLockUntil) {
        a.desiredHeading = facingFromTravel(travelX, travelZ);
      }
      // Interpolate using the shortest circular angle: handles ±PI without
      // spinning the long way around when changing movement direction.
      const angleDelta = Math.atan2(
        Math.sin(a.desiredHeading - a.heading),
        Math.cos(a.desiredHeading - a.heading)
      );
      a.heading += angleDelta * (1 - Math.exp(-dt * 11));
      if(helmPose?.facing!=null)a.heading=a.desiredHeading=helmPose.facing;
      a.node.rotation.y = a.heading;
      a.node.scaling.set(dashing ? 1.07 : 1, dashing ? 0.94 : 1, dashing ? 1.07 : 1);
      const flash = (a.hitFlashUntil || 0) > now;
      a.node.scaling.set(flash ? 1.07 : 1, flash ? 1.04 : 1, flash ? 1.07 : 1);
      const passengerBoat=!helmPose && mode==="live" && activeMapId==="mantra_capital"
        ? sailingMeshes.get(room?.state?.players?.get(a.id)?.boatId) : null;
      a.node.position.set(a.x, a.y+(passengerBoat?.metadata.waterBob??0), a.z);
      // Far characters pose (skeleton, hands, cloth) at a lower rate; their position above still moves
      // every frame, so walking stays smooth and only the limbs step at 15 or 8 poses a second.
      a.poseAcc = (a.poseAcc || 0) + dt;
      if (a.poseAcc >= poseInterval(a.local, Math.hypot(a.x - camera.target.x, a.z - camera.target.z))) {
        animateRig(a, helmPose?0:Math.hypot(travelX, travelZ) / Math.max(dt, 1e-3), a.poseAcc, now); a.poseAcc = 0;
      }
      updateAvatarAuras(a, now, dt);
      a.flightHalo?.setEnabled(a.serverFlying || (a.y > 4.4 && !worldDefinitions?.[activeMapId]?.terrain));
    }
    // Idle breathing pose for nearby service NPCs (standing still, so speed 0).
    for (const npc of npcActors) {
      const w = npc.node.getAbsolutePosition();
      const d = Math.hypot(w.x - camera.target.x, w.z - camera.target.z);
      npc.poseAcc = (npc.poseAcc || 0) + dt;
      if (npc.node.isEnabled(true) && d < (LITE ? 35 : 70) && npc.poseAcc >= poseInterval(false, d)) { npc.x = w.x; npc.y = w.y; npc.z = w.z; animateRig(npc, 0, npc.poseAcc, now); npc.poseAcc = 0; }
    }
    for (const npc of summonAvatars.values()) {
      if (npc.demo) {
        // DEMO: hover at the hero's right shoulder and face where the hero faces.
        const hero = getLocalAvatar();
        if (hero) { const h = hero.heading || 0; npc.targetX = hero.x - Math.cos(h) * 1.6 + Math.sin(h) * .6; npc.targetZ = hero.z + Math.sin(h) * 1.6 + Math.cos(h) * .6; npc.targetY = hero.y; npc.desiredFacing = h; }
        npc.action = (hero?.action && ACTIONS[hero.action.type]?.swing && now < hero.action.end) ? "attack" : "follow";
      }
      const blend = 1 - Math.exp(-dt * 12);
      const stepX = (npc.targetX - npc.x) * blend, stepZ = (npc.targetZ - npc.z) * blend;
      npc.x += stepX;
      npc.y += (npc.targetY - npc.y) * blend;
      npc.z += stepZ;
      const rotationDelta = Math.atan2(
        Math.sin(npc.desiredFacing - npc.facing),
        Math.cos(npc.desiredFacing - npc.facing)
      );
      npc.facing += rotationDelta * (1 - Math.exp(-dt * 10));
      npc.node.rotation.y = npc.facing;
      if (npc.capturedVisual) {
        npc.node.position.set(npc.x, npc.y, npc.z);
        const model = npc.capturedVisual.metadata.ghost;
        if (model) {
          model.speed = Math.hypot(stepX, stepZ) / Math.max(dt, 1e-3);
          model.ai = npc.action;
          poseGhostModel(npc.capturedVisual, model, dt, now, npc.x, npc.z);
        }
        continue;
      }
      const bob = Math.sin(elapsed * 2.4 + npc.ownerId.length) * .09;
      npc.node.position.set(npc.x, npc.y+bob, npc.z);
      const striking = npc.action === "attack" || npc.hitUntil > now;
      const emergence = Math.min(1, 1 - (npc.emergingUntil - now) / 500);
      const scale = (striking && !npc.spirit ? 1.13 : 1) * Math.max(.12, emergence);
      npc.node.scaling.set(scale, scale, scale);
      animateSpirit(npc, now, dt);
    }
    const me=getLocalAvatar();
    const portal=activePortal(), authoritative=ownServerCharacter();
    const siege=$("siegeGateButton"),localWar=territoryState?.local,castle=activeMapId==="tri_wiang_castle";
    const riverWar=localWar?.river;
    const canUse=localWar?.site===activeMapId && localWar.inField && localWar.phase==="battle" && authoritative?.alive && Math.abs(playerLayer(authoritative))<.1;
    const gate=canUse && worldDefinitions[activeMapId].strategic?.rampart?.gates.reduce((nearest,g,i)=>{
      if(!castle && !riverWar && !localWar.gates && i!==0)return nearest;
      const distance=gate=>Math.hypot(authoritative.x-gate.box.x-gate.box.width/2,authoritative.z-gate.box.z-gate.box.length/2);
      return !nearest || distance(g)<distance(nearest)?g:nearest;
    },null);
    const nearGate=gate && authoritative.x>=gate.box.x-2.5 && authoritative.x<=gate.box.x+gate.box.width+2.5 && authoritative.z>=gate.box.z-2.5 && authoritative.z<=gate.box.z+gate.box.length+2.5;
    const status=nearGate && (riverWar?riverWar.gates[gate.id]:castle?localWar.pilot?.gates?.[gate.id]:localWar.gates?.[gate.id] ?? {closed:localWar.gateClosed,hp:localWar.gateHp});
    const inside=gate && (gate.side==="west"?authoritative.x>gate.box.x+gate.box.width/2:gate.side==="east"?authoritative.x<gate.box.x+gate.box.width/2:
      gate.side==="north"?authoritative.z>gate.box.z+gate.box.length/2:authoritative.z<gate.box.z+gate.box.length/2);
    siege.hidden=!(status?.hp && (!castle || localWar.pilot?.throne?.defended) && (!riverWar || riverWar.defended) && (localWar.side==="attack"?status.closed:inside));
    siege.dataset.gate=(castle || riverWar) && gate?gate.id:"";
    if(!siege.hidden)siege.textContent=(localWar.side==="attack"?"พังประตู":status.closed?"เปิดประตู":"ปิดประตู")+" · "+status.hp+"/120";
    const repair=$("castleRepair");
    if(repair)repair.hidden=!(castle && !siege.hidden && localWar.side==="defend" && status.hp<120 && localWar.pilot.points.find(p=>p.id===6)?.owner==="defend");
    const warpButton=$("warpButton");
    warpButton.hidden=!(mode==="live" && !localWar?.inField && room?.state?.worldMapsAvailable===true &&
      isNearPortal(authoritative,portal) && !warpPending);
    warpButton.textContent=portal?.label || ("เดินทางไป"+(worldDefinitions?.[portal?.targetMapId]?.name || "ประตูวาร์ป"));
    if(me) {
      // Follow the moving player without calling camera.setTarget(): that
      // method recomputes alpha/beta/radius and cancels manual camera rotation.
      const follow = 1 - Math.exp(-dt * 3.8);
      const target = camera.target;
      target.x += (me.x - target.x) * follow;
      target.y += (me.y + .65 - target.y) * follow;
      target.z += (me.z + 1.5 - target.z) * follow;
    }
    enemy.position.y=.9+(Number(villageMonsterState()?.y)||0)+Math.sin(elapsed*1.8)*.07;
    // Monster orientation also comes from the server's AI decision.
    if (mode === "live" && Number.isFinite(serverMonsterFacing)) {
      const turn = Math.atan2(Math.sin(serverMonsterFacing - enemy.rotation.y),
                              Math.cos(serverMonsterFacing - enemy.rotation.y));
      enemy.rotation.y += turn * (1 - Math.exp(-dt * 9));
    }
    hitFlashRemaining = Math.max(0, hitFlashRemaining - dt);
    enemy.scaling.y = hitFlashRemaining > 0 ? 1.3 : 1.1;
    if(spirit && me) { spirit.position.set(me.x-1.2,1.5+Math.sin(elapsed*3)*.2,me.z+.8); }
    marker.rotation.z+=dt*.2;
    updateFieldFog();

    // Maps are 2D canvases with soft shadows: ~10 redraws per second is plenty.
    if(now-lastMapDraw>(LITE?250:100)){
      lastMapDraw=now;
      drawMap(ui.minimap.getContext("2d"),ui.minimap.width,ui.minimap.height);
      if(drawerActive==="map") {
        const large=$("bigMap");if(large)drawMap(large.getContext("2d"),large.width,large.height,true);
        refreshMapNpcActions?.();
      }
    }
    // Keep the same clear area around the hero at every pinch/wheel zoom.
    if(me && activeMapId==="forbidden_forest")fadeForestCrowns(me);
    if(me && templeCover.length)fadeTempleWalls(me);
    animateGhosts(dt, now);
    scene.fogStart = camera.radius + atmosphere.fogNear + lightLevel().fog;
    scene.fogEnd = camera.radius + atmosphere.fogFar + lightLevel().fog * 1.5;
    updateViewDistance(); updateBackdrop();
    applyCameraShake(dt);
    driftMist(elapsed, camera.target);
    followShadow(camera.target); updateLanternLights(camera.target, dt, elapsed); watchFrameRate(dt);
    if ((hudIn -= dt) <= 0) { hudIn = .25; updateHud(); }
    updateFloatText();
    updateWorldFx(now); updateTargetRing(now); updateMonsterLabels(); updateTargetOverheadHud(now); updateComboHud(now); updatePartyTethers(now); updateWeaponAuras(now);
    { const hero = getLocalAvatar(); if (hero) window.MontraAudio?.listen(hero.x, hero.z);
      // Music state: combat for 6 s after any fight action, war in a live battle, elite when one is near.
      if ((musicSyncIn -= dt) <= 0 && hero) {
        musicSyncIn = .5;
        let elite = false;
        for (const mesh of forestMonsters.values()) { const g = mesh.metadata?.ghost; if (g?.design?.elite && mesh.isEnabled() && !g.deathAt && Math.hypot(mesh.position.x - hero.x, mesh.position.z - hero.z) < 30) { elite = true; break; } }
        const war = Boolean(territoryState?.local?.inField && territoryState.local.phase === "battle");
        window.MontraAudio?.music({ map: activeMapId, combat: performance.now() - lastCombatAt < 6000, war, elite });
      } }
    driftClouds(camera.target, elapsed); updateStrikeLight(performance.now());
    keyLight.intensity = atmosphere.keyI * 1.65 * (1 - .22 * cloudCover);
    stormFlash(dt);
    if ((shadowSyncIn -= dt) <= 0) { shadowSyncIn = .5; syncShadowLists(); }
    rippleTexture.vOffset = (rippleTexture.vOffset + dt * .025) % 1;
    riverRipple.uOffset = (riverRipple.uOffset + dt * .012) % 1;
    if(capitalWaterRipples && activeMapId==="mantra_capital"){
      capitalWaterRipples.uOffset=(capitalWaterRipples.uOffset+dt*.031)%1;
      capitalWaterRipples.vOffset=(capitalWaterRipples.vOffset+dt*.017)%1;
    }
    motes.emitter.copyFrom(camera.target);
    if (typeof updateWeather === "function") updateWeather(dt);
    if (typeof updateBanners === "function") updateBanners(dt, elapsed);
    if (typeof updatePet === "function") updatePet(dt, elapsed);
    if (typeof updateFlight === "function") updateFlight(dt, elapsed);
    if (typeof updateThaoWessuwanBoss === "function") updateThaoWessuwanBoss(dt, elapsed);
    animatePortals(elapsed, dt);
    if (me) warm.position.set(me.x, me.y + 3.4, me.z + .6);
    scene.render();
  });
  window.addEventListener("resize",()=>{ resizeGameRenderer(); updateStatus(); });
  window.addEventListener("pagehide",event => {
    if (event.persisted) return;
    cancelOnlineRecovery();
    cancelRoomEntry?.(roomEntryError(window.Colyseus.CloseCode.CONSENTED, "Page closed"));
    const old = room;
    room = null;
    clearSyncPoll();
    if (old) void leaveRoomBounded(old);
  });
  $("cancelConnectionRecovery").addEventListener("click", () => {
    cancelOnlineRecovery();
    stopOnline("หยุดเชื่อมต่ออัตโนมัติแล้ว");
  });
  // Reuse the player's human model for existing NPC roles and keep their hitboxes.
  attachNpcAvatar(questRangerRoot,"quest-ranger",rangerRobes[0],[rangerBody,rangerHead,rangerHat]);
  attachNpcAvatar(defenseKeeperRoot,"defense-keeper",rangerRobes[3],[defenseBody,defenseHead]);
  attachNpcAvatar(escortRoot,"quest-escort",rangerRobes[2],[escortBody,escortHead]);
  attachNpcAvatar(quartermasterRoot,"quartermaster",rangerRobes[0],[quartermasterBody,quartermasterHead]);
  const trainerNpcRoot=new B.TransformNode("sword mentor human",scene);
  trainerNpcRoot.position.set(trainerPosition.x,0,trainerPosition.z);
  for(const old of [trainerBody,trainerHead]){const index=villageMeshes.indexOf(old);if(index>=0)villageMeshes.splice(index,1);}
  villageMeshes.push(trainerNpcRoot);
  attachNpcAvatar(trainerNpcRoot,"sword-mentor",rangerRobes[0],[trainerBody,trainerHead]);
  resetDemoMonster();
  updateStatus();
  updateFlightButton();
  ui.loading.hidden=true;
  setTimeout(()=>{warmCombatFx();warmMaterials();},1500);
  window.MontraEntry?.start((endpoint,slot,setup) => connectOnline(endpoint,slot,null,setup), async () => {
    cancelOnlineRecovery();
    const old = room; room = null; clearSyncPoll();
    await leaveRoomBounded(old);
    showDemo();
  });
