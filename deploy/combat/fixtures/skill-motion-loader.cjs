const fs=require('node:fs');
module.exports=()=>{
 const source=fs.readFileSync('src/client/combat/024-action-and-skill-motion.js','utf8');
 const start=source.indexOf('  const skillMotion ='), end=source.indexOf('  // Grapple:');
 if(start<0 || end<start)throw Error('Missing skill motion binding');
 return fs.readFileSync('src/client-modules/skill-motion.js','utf8')+'\n'+source.slice(start,end);
};
