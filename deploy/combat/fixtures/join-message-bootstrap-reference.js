      const earlyMessages=new Map(), earlyHandlers=new Map();
      for(const type of ["guild_state","guild_recruitment","territory_state"])joined.onMessage(type,message=>{if(!earlyHandlers.has(type))earlyMessages.set(type,message);});
      function markHandler(type, handler) { earlyHandlers.set(type, handler); }
      function replay() {
        for(const [type,message] of earlyMessages)earlyHandlers.get(type)?.(message);
        earlyMessages.clear();
      }
