/** Synthetic loopback test entry only. No gameplay override exists in shipped room code. */
import path from 'node:path';
import {defineServer,defineRoom} from 'colyseus';
import {PrototypeGameplayTestRoom} from './PrototypeTestRoom.js';
if(process.env.NODE_ENV!=='test' || process.env.MONTRA_TEST_SANDBOX!==process.cwd() ||
   process.env.MONTRA_CHARACTER_DIR!==path.join(process.cwd(),'characters') ||
   process.env.MONTRA_ACCOUNTS_REQUIRED!=='0' || process.env.MONTRA_ISOLATED_STAGING!=='1' ||
   process.env.MONTRA_PROTOTYPE_GAMEPLAY!=='1')throw new Error('unsafe prototype test environment');
const server=defineServer({rooms:{my_room:defineRoom(PrototypeGameplayTestRoom)},gracefullyShutdown:false});
await server.listen(0,'127.0.0.1');
const address=server.transport.server?.address();
if(!address || typeof address==='string' || address.address!=='127.0.0.1')throw new Error('loopback binding required');
console.log('PROTOTYPE_TEST_PORT='+address.port);
