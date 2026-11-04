import type {Application} from 'express';
import {huntEventDirector} from './HuntEvents.js';
import {HUNT_EVENT_PAGE} from './HuntEventPage.js';

/** Read-only world event status; no account data or credentials are exposed. */
export function installHuntEventRoutes(app:Application):void{
  app.get('/api/hunt-event',(_req,res)=>{
    res.set('Cache-Control','no-store');
    if(process.env.MONTRA_WORLD_EXPANSION!=='1' || process.env.MONTRA_HUNT_EVENTS==='0')return res.json({state:'disabled',event:null,nextAt:0,planning:false,serverNow:Date.now()});
    return res.json(huntEventDirector.status());
  });
  app.get('/hunt-events',(_req,res)=>{res.set('Cache-Control','no-store');res.type('html').send(HUNT_EVENT_PAGE);});
}
