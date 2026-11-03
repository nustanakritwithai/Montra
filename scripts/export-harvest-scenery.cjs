// Run with tsx registered, Playwright installed, and the optional world features enabled.
// MONTRA_BROWSER and MONTRA_BROWSER_LIBS can point at an offline browser and game libraries.
const fs=require("node:fs/promises"),path=require("node:path"),http=require("node:http");
const root=path.resolve(__dirname,"..");
const {chromium}=require(process.env.MONTRA_PLAYWRIGHT||"playwright");
for(const flag of ["MONTRA_WORLD_EXPANSION","MONTRA_RIDGE_TERRAIN","MONTRA_CASTLE_PILOT"])process.env[flag]="1";
const {WORLD_MAPS}=require("../deploy/combat/WorldMaps.ts");
async function main(){
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,"http://localhost"),name=url.pathname==="/"?"/index.html":url.pathname;
      const file=path.resolve(root,"."+name);
      if(!file.startsWith(root+path.sep))throw Error("outside project");
      let data=await fs.readFile(file);
      if(name==="/main.js"){
        data=data.toString().replace("const scene = new B.Scene(engine);",
          "const scene = new B.Scene(engine); scene.metadata={collectResource:(...row)=>window.captured.push(row)};")
          .replace(/\}\)\(\);\s*$/, "window.visitHarvestMap=(catalog,id)=>syncWorldDefinition({worldDefinition:catalog},id);})();");
      }
      res.setHeader("Content-Type",({".js":"text/javascript",".css":"text/css",".html":"text/html; charset=utf-8"})[path.extname(file)]||"application/octet-stream");res.end(data);
    }catch{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.MONTRA_BROWSER,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader"]});
    const page=await browser.newPage({viewport:{width:360,height:640}});
    await page.addInitScript(()=>{window.captured=[];});
    if(process.env.MONTRA_BROWSER_LIBS)await page.route("**/*",route=>{
      const url=new URL(route.request().url());
      if(url.hostname==="127.0.0.1")return route.continue();
      const files={"cdn.babylonjs.com/babylon.js":"babylon-build-ui.js","cdn.babylonjs.com/loaders/babylonjs.loaders.min.js":"babylon-loaders.js",
        "unpkg.com/@colyseus/sdk@0.18.1/dist/colyseus.js":"node_modules/@colyseus/sdk/dist/colyseus.js"};
      const file=files[url.hostname+url.pathname];return file?route.fulfill({path:path.join(process.env.MONTRA_BROWSER_LIBS,file)}):route.abort();
    });
    await page.goto("http://127.0.0.1:"+server.address().port,{waitUntil:"domcontentloaded",timeout:120000});
    await page.waitForFunction(()=>typeof window.visitHarvestMap==="function");
    await page.evaluate(()=>BABYLON.Engine.Instances[0].stopRenderLoop());
    const catalog=JSON.stringify({version:1,maps:WORLD_MAPS});
    for(const id of Object.keys(WORLD_MAPS))await page.evaluate(([maps,id])=>window.visitHarvestMap(maps,id),[catalog,id]);
    const rows=await page.evaluate(()=>window.captured);
    const table={};
    for(const [id,kind,x,z,r] of rows){
      if(!WORLD_MAPS[id])throw Error("unknown map "+id);
      const point=[kind==="wood"?0:1,Math.round(x*100),Math.round(z*100),Math.round(r*100)];
      (table[id]??=new Map()).set(point.slice(0,3).join("/"),point);
    }
    if(!table.hex_ridge?.size || !table.forbidden_forest?.size)throw Error("incomplete scenery capture");
    const lines=Object.keys(table).sort().map(id=>"  "+id+":["+[...table[id].values()].map(p=>"["+p.join(",")+"]").join(",")+"],");
    await fs.writeFile(path.join(root,"deploy/combat/SceneryNodes.ts"),"// Generated from main.js by scripts/export-harvest-scenery.cjs. Coordinates and radii are in centimetres.\nexport const SCENERY_NODES:Readonly<Record<string,readonly [number,number,number,number][]>>={\n"+lines.join("\n")+"\n};\n");
    console.log("Captured",rows.length,"placements in",Object.keys(table).length,"maps");
  }finally{try{await browser?.close();}finally{server.close();}}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
