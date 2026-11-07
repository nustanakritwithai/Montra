import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { assembleClient, checkClient, clientModules, clientRoot, prepareClient, writeClient } from './build-client.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Explicit reversible substitutions for this extraction only. This is not a new
// baseline: reconstructing the original bytes still uses the historical SHA below.
function restoreJoinBootstrap(text) {
  const reference = readFileSync(join(clientRoot, 'deploy/combat/fixtures/join-message-bootstrap-reference.js'), 'utf8');
  assert.equal(hash(reference), 'e5e76844a759b52aa1b0190d1d4c68171e851e74e84adaea2aac8cb13e2ff576');
  assert.equal(hash(readFileSync(join(clientRoot, 'src/client-modules/join-message-bootstrap.js'))), 'b4b9c3cc53545715e02aa9e9c7d551c47f0d5be98986fb639f66883becc060a3');
  return text.replace('      const joinMessageBootstrap = globalThis.MontraJoinMessageBootstrap.create(joined);\n', reference.slice(0, reference.indexOf('      function markHandler')))
    .replaceAll('joinMessageBootstrap.markHandler(', 'earlyHandlers.set(')
    .replace('      joinMessageBootstrap.replay();\n', '      for(const [type,message] of earlyMessages)earlyHandlers.get(type)?.(message);\n      earlyMessages.clear();\n');
}

function drawerControllerRestoration(current) {
  const reference = readFileSync(join(clientRoot, 'deploy/combat/fixtures/drawer-controller-reference.js'), 'utf8');
  assert.equal(hash(reference), '6a02aacaad97c499e3ebca7bdf147796703857840c93ce18fea43f662bd4c9e3');
  assert.equal(hash(readFileSync(join(clientRoot, 'src/client-modules/drawer-controller.js'))), '80be2186f8fdc95af82b28d1f62f2c4d068b494312e0b174257ce731e7c51bfa', 'Reviewed drawer lifecycle module');
  const start = current.indexOf('  const drawerController =');
  const end = current.indexOf('  const journalOrigins=', start);
  const binding = current.slice(start, end);
  assert(start > 0 && end > start);
  assert.equal(hash(binding), '6af8526ab28ab3852a8490b51f59c12562980a645d3713981aafcfe013040a4c', 'Reviewed synchronous shell hooks');
  const originalBinding = reference.slice(0, reference.indexOf('  const journalOrigins='));
  const originalKey = reference.slice(reference.indexOf('  document.addEventListener("keydown",event=>{\n    if (ui.drawer.hidden'), reference.indexOf('  function updateChatBadge()'));
  const originalBackdrop = reference.slice(reference.indexOf('  $("drawerClose").addEventListener'));
  return text => text.replace(binding, originalBinding)
    .replace('  document.addEventListener("keydown",drawerController.handleKey);\n', originalKey)
    .replace('  drawerController.installBackdrop();\n', originalBackdrop)
    .replace('  let drawerActive = null;\n', '  let drawerActive = null;\n  let drawerOpener = null;\n');
}

function skillMotionRestoration(current) {
  const module = readFileSync(join(clientRoot, 'src/client-modules/skill-motion.js'), 'utf8');
  const header = "// Visual skill selection and parse caches; authoritative combat remains in the shell.\n\"use strict\";\nglobalThis.MontraSkillMotion = Object.freeze({\n  create({ getRoom, ownServerCharacter }) {\n";
  const footer = "    return Object.freeze({ swordSkillAction, muayMotion, muaySchoolOf });\n  },\n});\n";
  assert(module.startsWith(header) && module.endsWith(footer), 'Reviewed skill-motion factory envelope');
  const original = module.slice(header.length, -footer.length).replaceAll('getRoom()?.', 'room?.');
  assert.equal(original, readFileSync(join(clientRoot, 'deploy/combat/fixtures/skill-motion-reference.js'), 'utf8'));
  const binding = "  const skillMotion = globalThis.MontraSkillMotion.create({ getRoom: () => room, ownServerCharacter: () => ownServerCharacter() });\n  function swordSkillAction(skillId){return skillMotion.swordSkillAction(skillId);}\n  function muayMotion(skillId){return skillMotion.muayMotion(skillId);}\n  function muaySchoolOf(a){return skillMotion.muaySchoolOf(a);}\n";
  assert.equal(current.split(binding).length, 2, 'Exactly one skill-motion shell binding');
  return text => text.replace(binding, original);
}

function itemPresentationRestoration(current) {
  const dependencies = [
    ['statNames', 'getStatNames'], ['bodyLabels', 'getBodyLabels'], ['preferredGearSlot', 'getPreferredGearSlot'],
    ['WEAPON_META', 'getWeaponMeta'], ['personalItems', 'getPersonalItems'], ['gearSymbols', 'getGearSymbols'],
    ['POTION_ITEM_ID', 'getPotionItemId'], ['SHRINE_SHARD', 'getShrineShard'], ['document', 'getDocument'],
    ['inventoryState', 'getInventoryState'], ['gearGuides', 'getGearGuides'], ['forgeNames', 'getForgeNames'],
    ['$', 'getElementLookup'], ['currentEquippedWeaponSlot', 'getCurrentEquippedWeaponSlot'], ['ownServerCharacter', 'getOwnServerCharacter'],
  ];
  const names = ['statLine', 'wearPositions', 'gearDestination', 'bagMeta', 'itemSymbol', 'getItemArtKey', 'createItemTile', 'renderItemTile', 'renderItemPreview', 'wornGearAt', 'pieceStat', 'gearComparison', 'pieceForgeRatings', 'forgeComparison'];
  const module = readFileSync(join(clientRoot, 'src/client-modules/item-presentation.js'), 'utf8');
  const start = module.indexOf('  function statLine('), end = module.indexOf('    return Object.freeze', start);
  assert(start > 0 && end > start);
  const body = module.slice(start, end);
  const header = '// Read-only item display and comparison. Authoritative state stays in the shell.\n' +
    '// Getter dependencies preserve live lexical reads, evaluation order and bare calls.\n' +
    '"use strict";\nglobalThis.MontraItemPresentation = Object.freeze({\n' +
    '  create({ ' + dependencies.map(([, getter]) => getter).join(', ') + ' }) {\n';
  const footer = '    return Object.freeze({ ' + names.join(', ') + ' });\n  },\n});\n';
  assert.equal(module, header + body + footer, 'Only the reviewed factory/API may surround the extracted functions');
  const declarations = [...body.matchAll(/^  function (\w+)\(([^\n]*?)\)/gm)];
  assert.deepEqual(declarations.map(match => match[1]), names);
  const replacements = declarations.map((match, index) => {
    let original = body.slice(match.index, declarations[index + 1]?.index ?? body.length);
    for (const [name, getter] of dependencies) original = original.replaceAll(getter + '()', name);
    const args = match[2].split(',').map(param => param.split('=')[0].trim()).join(',');
    const wrapper = `  function ${match[1]}(${match[2]}){return itemPresentation.${match[1]}(${args});}\n`;
    assert.equal(current.split(wrapper).length, 2, `Exactly one reviewed forwarding declaration: ${match[1]}`);
    return [wrapper, original];
  });
  const wiring = '  const itemPresentation = globalThis.MontraItemPresentation.create({\n' +
    dependencies.map(([name, getter]) => `    ${getter}: () => ${name},\n`).join('') + '  });\n';
  assert.equal(current.split(wiring).length, 2, 'Exactly one lazy shell dependency binding');
  return text => {
    text = text.replace(wiring, '');
    for (const [wrapper, original] of replacements) text = text.replace(wrapper, original);
    return text;
  };
}

function voiceGuidanceRestoration(current) {
  const dependencies = [
    ['document', 'getDocument'], ['window', 'getWindow'], ['localStorage', 'getStorage'],
    ['performance', 'getPerformance'], ['setTimeout', 'getSetTimeout'], ['clearTimeout', 'getClearTimeout'],
  ];
  const declarations = [
    ['triggerCombatCallout', 'key'], ['isVoiceGuidanceEnabled', ''], ['setVoiceGuidanceEnabled', 'enabled'],
    ['ensureVoiceGuidanceHud', ''], ['hideVoiceGuidanceHud', ''], ['triggerVoiceGuidance', 'stepKey'],
  ];
  const module = readFileSync(join(clientRoot, 'src/client-modules/voice-guidance.js'), 'utf8');
  const header = '// Voice guidance and tactical callouts. The shell retains gameplay and audio ownership.\n' +
    '// Lazy browser dependencies preserve live reads, method receivers and timer bare calls.\n' +
    '"use strict";\nglobalThis.MontraVoiceGuidance = Object.freeze({\n' +
    '  create({ ' + dependencies.map(([, getter]) => getter).join(', ') + ' }) {\n';
  const footer = '    return Object.freeze({ ' + declarations.map(([name]) => name).join(', ') + ' });\n  },\n});\n';
  assert(module.startsWith(header) && module.endsWith(footer), 'Only the reviewed voice controller factory/API may surround the original body');
  let original = module.slice(header.length, -footer.length);
  assert.deepEqual([...original.matchAll(/^  function (\w+)\(([^\n]*?)\)/gm)].map(match => [match[1], match[2]]), declarations);
  for (const [name, getter] of dependencies) original = original.replaceAll(getter + '()', name);
  const wiring = '  const voiceGuidance = globalThis.MontraVoiceGuidance.create({\n' +
    dependencies.map(([name, getter]) => `    ${getter}: () => ${name},\n`).join('') + '  });\n';
  const wrappers = declarations.map(([name, args]) => `  function ${name}(${args}){return voiceGuidance.${name}(${args});}\n`).join('');
  const binding = wiring + wrappers + '\n';
  assert.equal(current.split(binding).length, 2, 'Exactly one controller binding with the reviewed forwarding declarations');
  return text => text.replace(binding, original);
}

function pointerGesturesRestoration(current) {
  const module = readFileSync(join(clientRoot, 'src/client-modules/pointer-gestures.js'), 'utf8');
  const header = '// Pointer gestures own page-lifetime input state; gameplay stays in synchronous shell callbacks.\n' +
    '// Installation preserves lazy DOM reads, listener order and partial registration failures.\n' +
    '"use strict";\nglobalThis.MontraPointerGestures = Object.freeze({\n' +
    '  create({ camera, getWorld, getDocument, getWindow, getPerformance, setCameraZoom, onWorldTap, onSwipeDash }) {\n' +
    '    function install() {\n';
  const footer = '    }\n    return Object.freeze({ install });\n  },\n});\n';
  assert(module.startsWith(header) && module.endsWith(footer), 'Only the reviewed gesture factory/install envelope is allowed');
  let gestures = module.slice(header.length, -footer.length);
  const initializer = '  let pointer = null;\n';
  assert(gestures.startsWith(initializer));
  gestures = gestures.slice(initializer.length);
  for (const [from, to] of [['getWorld()', 'ui.world'], ['getDocument()', 'document'], ['getWindow()', 'window'], ['getPerformance()', 'performance']]) gestures = gestures.replaceAll(from, to);
  assert.equal(gestures.split('    onWorldTap(event);\n').length, 2);
  assert.equal(gestures.split('      onSwipeDash(dx, dy);').length, 2);
  gestures = gestures.replace('      onSwipeDash(dx, dy);', '      requestSwipeDash(dx, dy);');
  const wiring = '  const pointerGestures = globalThis.MontraPointerGestures.create({\n' +
    '    camera,\n    getWorld: () => ui.world,\n    getDocument: () => document,\n' +
    '    getWindow: () => window,\n    getPerformance: () => performance,\n' +
    '    setCameraZoom,\n    onWorldTap: handleWorldTap,\n    onSwipeDash: requestSwipeDash,\n' +
    '  });\n  pointerGestures.install();\n\n';
  const worldStart = '  function handleWorldTap(event) {\n';
  const worldEnd = '  }\n\n  // Direction is relative to the CURRENT camera';
  const start = current.indexOf(worldStart), end = current.indexOf(worldEnd, start);
  assert(start > 0 && end > start);
  const worldBody = current.slice(start + worldStart.length, end);
  const dashStart = end + '  }\n\n'.length;
  const dashEnd = current.indexOf('  let drawerActive = null;', dashStart);
  assert(dashEnd > dashStart);
  const dashFunctions = current.slice(dashStart, dashEnd);
  const shell = wiring + worldStart + worldBody + '  }\n\n' + dashFunctions;
  assert.equal(current.split(shell).length, 2, 'Exactly one reviewed shell binding and verbatim world/dash declarations');
  const dashAnchor = '  // The invisible gesture area extends ABOVE';
  assert.equal(gestures.split(dashAnchor).length, 2);
  const original = gestures.replace('    onWorldTap(event);\n', worldBody).replace(dashAnchor, dashFunctions + dashAnchor);
  const networkEnd = '      connectionPending = false;\n    }\n  }\n\n';
  assert.equal(current.split(networkEnd).length, 2, 'Exactly one original pointer initialization site');
  return text => text.replace(shell, original).replace(networkEnd, networkEnd + initializer);
}

function lightingControllerRestoration(current) {
  const dependencies = [
    ['activeMapId', 'getActiveMapId'], ['sky', 'getSky'], ['mistLayers', 'getMistLayers'],
    ['matchMedia', 'getMatchMedia'], ['location', 'getLocation'], ['URLSearchParams', 'getURLSearchParams'],
  ];
  const declarations = [
    ['followShadow', 'target'], ['syncShadowLists', ''], ['watchFrameRate', 'dt'],
    ['addLightSpot', 'x, y, z, hex = "#ffae5a", strength = 1'],
    ['addMovingLight', 'node, hex, strength = 1, lift = 1.2'], ['updateLanternLights', 'target, dt, t'],
  ];
  const module = readFileSync(join(clientRoot, 'src/client-modules/lighting-controller.js'), 'utf8');
  const header = '// Page-lifetime light objects, shadow adaptation and the nearest-lantern pool.\n' +
    '// The shell owns atmosphere writes; lazy getters preserve live reads and TDZ boundaries.\n' +
    '"use strict";\nglobalThis.MontraLightingController = Object.freeze({\n' +
    '  create({ B, engine, scene, camera, ' + dependencies.map(([, getter]) => getter).join(', ') + ' }) {\n';
  const footer = '    return Object.freeze({ moon, keyLight, warm, MAX_LIGHTS, ' +
    declarations.map(([name]) => name).join(', ') + ', clearTransientLightSpots, tickShadows });\n  },\n});\n';
  assert(module.startsWith(header) && module.endsWith(footer), 'Only the reviewed lighting factory/API may surround the original block');
  let original = module.slice(header.length, -footer.length);
  const clear = '    for(let i=lightSpots.length-1;i>=0;i--)if(lightSpots[i].map!=="ritual_village")lightSpots.splice(i,1);\n';
  const tick = '    if ((shadowSyncIn -= dt) <= 0) { shadowSyncIn = .5; syncShadowLists(); }\n';
  const movedStatements = '  function clearTransientLightSpots() {\n' + clear + '  }\n' +
    '  function tickShadows(dt) {\n' + tick + '  }\n';
  assert(original.endsWith(movedStatements), 'Only the exact backward-removal and frame-timer statements may move');
  original = original.slice(0, -movedStatements.length);
  assert.deepEqual([...original.matchAll(/^  function (\w+)\(([^\n]*?)\)/gm)].map(match => [match[1], match[2]]), declarations);
  original = original.replaceAll('new (getURLSearchParams())(', 'new URLSearchParams(');
  for (const [name, getter] of dependencies) original = original.replaceAll(getter + '()', name);
  const wiring = '  const lightingController = globalThis.MontraLightingController.create({\n    B, engine, scene, camera,\n' +
    dependencies.map(([name, getter]) => `    ${getter}: () => ${name},\n`).join('') +
    '  });\n  const { moon, keyLight, warm, MAX_LIGHTS } = lightingController;\n';
  const wrappers = declarations.map(([name, params]) => {
    const args = params.split(',').map(param => param.split('=')[0].trim()).join(',');
    return `  function ${name}(${params}){return lightingController.${name}(${args});}\n`;
  }).join('') + '  function clearTransientLightSpots(){return lightingController.clearTransientLightSpots();}\n' +
    '  function tickShadows(dt){return lightingController.tickShadows(dt);}\n';
  const binding = wiring + wrappers;
  for (const site of [binding, '    clearTransientLightSpots();\n', '    tickShadows(dt);\n']) {
    assert.equal(current.split(site).length, 2, 'Exactly one reviewed lighting replacement site');
  }
  return text => text.replace(binding, original).replace('    clearTransientLightSpots();\n', clear).replace('    tickShadows(dt);\n', tick);
}

function roomStateSyncRestoration(current) {
  const dependencies = [['room', 'getRoom'], ['activeMapId', 'getActiveMapId'], ['window', 'getWindow'], ['console', 'getConsole'], ['setInterval', 'getSetInterval'], ['clearInterval', 'getClearInterval']];
  const module = readFileSync(join(clientRoot, 'src/client-modules/room-state-sync.js'), 'utf8');
  const header = "// Nested player subscriptions and fallback polling, with a privately owned timer.\n// Shell callbacks retain world/render ownership; live getters preserve callback-time reads.\n\"use strict\";\nglobalThis.MontraRoomStateSync = Object.freeze({\n  create({ getRoom, getActiveMapId, getWindow, getConsole, getSetInterval, getClearInterval, syncState, setOnlinePlayer, removeOnlinePlayer }) {\n";
  const footer = "    return Object.freeze({ clearSyncPoll, observePlayers });\n  },\n});\n";
  assert(module.startsWith(header) && module.endsWith(footer), 'Only the reviewed subscription factory/API may surround the original blocks');
  let original = module.slice(header.length, -footer.length);
  for (const [name, getter] of dependencies) original = original.replaceAll(getter + '()', name);
  const split = original.indexOf('  function observePlayers(joined) {\n');
  assert(split > 0 && original.endsWith('  }\n'));
  const initializer = original.slice(0, split);
  const subscriptions = original.slice(split + '  function observePlayers(joined) {\n'.length, -'  }\n'.length);
  const wiring = "  const roomStateSync = globalThis.MontraRoomStateSync.create({\n    getRoom: () => room,\n    getActiveMapId: () => activeMapId,\n    getWindow: () => window,\n    getConsole: () => console,\n    getSetInterval: () => setInterval,\n    getClearInterval: () => clearInterval,\n    syncState, setOnlinePlayer, removeOnlinePlayer,\n  });\n  function clearSyncPoll(){return roomStateSync.clearSyncPoll();}\n";
  const call = '      roomStateSync.observePlayers(joined);\n';
  for (const site of [wiring, call]) assert.equal(current.split(site).length, 2, 'Exactly one reviewed room synchronization replacement');
  return text => text.replace(wiring, initializer).replace(call, subscriptions);
}

test('module extraction preserves the historical byte freeze outside the exact helper replacement', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const current = assembleClient();
  const moduleText = readFileSync(join(clientRoot, 'src/client-modules/character-slot-storage.js'), 'utf8');
  const start = moduleText.indexOf('  function preferredSlotKey');
  const end = moduleText.indexOf('    return Object.freeze', start);
  assert(start > 0 && end > start);
  const originalHelpers = moduleText.slice(start, end)
    .replaceAll('new URLConstructor(', 'new URL(').replaceAll('getStorage().', 'localStorage.');
  const wiring = '  const { preferredSlotKey, slotPreviewKey, getPreferredSlot, readSlotPreviews, rememberSlotPreviews } =\n    globalThis.MontraSlotStorage.create({ getStorage: () => localStorage, URL });\n';
  assert.equal(current.toString().split(wiring).length, 2, 'Exactly one explicit shell binding');
  const worldModule = readFileSync(join(clientRoot, 'src/client-modules/world-math.js'), 'utf8');
  const terrainStart = worldModule.indexOf('  function terrainCell(');
  const smoothStart = worldModule.indexOf('  function smoothPath(');
  const worldEnd = worldModule.indexOf('  return Object.freeze', smoothStart);
  assert(terrainStart > 0 && smoothStart > terrainStart && worldEnd > smoothStart);
  const terrainHelpers = worldModule.slice(terrainStart, smoothStart);
  const smoothHelper = worldModule.slice(smoothStart, worldEnd);
  const worldBinding = '  const { terrainCell, terrainHeight, smoothPath } = globalThis.MontraWorldMath;\n';
  const terrainAnchor = '  // Clip each footprint against the actual terrain faces.';
  const smoothAnchor = '  // Roads: Chaikin-smoothed ribbons with a soft dark verge and rounded ends.\n';
  for (const anchor of [worldBinding, terrainAnchor, smoothAnchor]) {
    assert.equal(current.toString().split(anchor).length, 2, 'Exactly one world-math binding/replacement site');
  }
  const restoreDrawer = drawerControllerRestoration(current.toString());
  const restoreRoom = roomStateSyncRestoration(current.toString());
  const restoreItems = itemPresentationRestoration(current.toString());
  const restoreVoice = voiceGuidanceRestoration(current.toString());
  const restoreGestures = pointerGesturesRestoration(current.toString());
  const restoreLighting = lightingControllerRestoration(current.toString());
  const restoreSkillMotion = skillMotionRestoration(current.toString());
  const restore = text => restoreSkillMotion(restoreItems(restoreVoice(restoreGestures(restoreLighting(restoreRoom(restoreDrawer(restoreJoinBootstrap(text)))))))).replace(wiring, originalHelpers)
    .replace(worldBinding, '').replace(terrainAnchor, terrainHelpers + terrainAnchor)
    .replace(smoothAnchor, smoothAnchor + smoothHelper);
  const bytes = Buffer.from(restore(current.toString()));
  assert.equal(bytes.length, 1372310);
  assert.equal(hash(bytes), 'a6ef7e6c12120dd8d2f0fd641765d152871c6dbcb6df7a110801f1ef9cb5ebbf');
  assert.equal(bytes.length, baseline.bytes);
  assert.equal(hash(bytes), baseline.sha256);
  const manifest = JSON.parse(readFileSync(join(clientRoot, 'src/client/manifest.json')));
  assert.deepEqual(manifest.fragments, baseline.fragments.map(entry => entry.path));
  for (const entry of baseline.fragments) {
    const fragment = Buffer.from(restore(readFileSync(join(clientRoot, 'src/client', entry.path), 'utf8')));
    assert.equal(fragment.length, entry.bytes, entry.path);
    assert.equal(hash(fragment), entry.sha256, entry.path);
  }
  assert.deepEqual(assembleClient(), assembleClient());
});

test('stale output, omitted/duplicate/reordered sources, unsafe paths and syntax errors fail closed', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-client-'));
  try {
    cpSync(join(clientRoot, 'src'), join(temp, 'src'), { recursive: true });
    writeFileSync(join(temp, 'main.js'), assembleClient());
    assert.deepEqual(checkClient(temp), assembleClient());
    writeFileSync(join(temp, 'main.js'), 'stale');
    assert.throws(() => checkClient(temp), /main.js is stale/);
    const manifestFile = join(temp, 'src/client/manifest.json');
    const original = JSON.parse(readFileSync(manifestFile));
    const change = mutate => {
      const manifest = structuredClone(original);
      mutate(manifest.fragments);
      writeFileSync(manifestFile, JSON.stringify(manifest));
    };
    change(files => files.push(files[1]));
    assert.throws(() => assembleClient(temp), /Duplicate/);
    change(files => files.reverse());
    assert.throws(() => assembleClient(temp), /manifest order/);
    change(files => files.pop());
    assert.throws(() => assembleClient(temp), /Unlisted or missing/);
    change(files => files[0] = '../main.js');
    assert.throws(() => assembleClient(temp), /Invalid client fragment path/);
    writeFileSync(manifestFile, JSON.stringify(original));
    writeFileSync(join(temp, 'src/client', original.fragments[1]), 'const = ;');
    assert.throws(() => assembleClient(temp), SyntaxError);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

function withClientFixture(run) {
  const temp = mkdtempSync(join(tmpdir(), 'montra-client-safety-'));
  try {
    cpSync(join(clientRoot, 'src'), join(temp, 'src'), { recursive: true });
    writeFileSync(join(temp, 'main.js'), assembleClient());
    run(temp);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

test('valid source-only changes require rebuilding; missing files and invalid manifests fail', () => {
  withClientFixture(temp => {
    const manifestFile = join(temp, 'src/client/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestFile));
    const fragment = join(temp, 'src/client', manifest.fragments[1]);
    const original = readFileSync(fragment);
    writeFileSync(fragment, Buffer.concat([original, Buffer.from('  // Valid source-only test edit.\n')]));
    assert.doesNotThrow(() => assembleClient(temp));
    assert.throws(() => checkClient(temp), /main.js is stale/);
    const stale = readFileSync(join(temp, 'main.js'));
    assert.throws(() => prepareClient(temp), /main.js is stale/);
    assert.deepEqual(readFileSync(join(temp, 'main.js')), stale);
    assert.deepEqual(writeClient(temp), checkClient(temp));
    rmSync(fragment);
    assert.throws(() => assembleClient(temp), /Unlisted or missing/);
    writeFileSync(fragment, original);
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, format: 2 }));
    assert.throws(() => assembleClient(temp), /Unsupported client manifest format/);
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, output: 'other.js' }));
    assert.throws(() => assembleClient(temp), /filename must stay main.js/);
  });
});

for (const relative of ['src', 'src/client', 'src/client/core', 'src/client/manifest.json', 'src/client/core/001-storage-and-dom.js', 'src/client-modules', ...clientModules]) {
  test(`reject source symlink: ${relative}`, () => {
    withClientFixture(temp => {
      const original = join(temp, relative);
      const target = join(temp, 'link-target');
      renameSync(original, target);
      symlinkSync(target, original, /\.(js|json)$/.test(relative) ? 'file' : 'junction');
      assert.throws(() => assembleClient(temp), /[Ss]ource.*symlinks are not supported/);
    });
  });
}

test('CLI build and check reject output symlinks without reading or overwriting their targets', () => {
  withClientFixture(temp => {
    const target = join(temp, 'untouched.js');
    const original = readFileSync(join(temp, 'main.js'));
    renameSync(join(temp, 'main.js'), target);
    symlinkSync(target, join(temp, 'main.js'), 'file');
    assert.throws(() => checkClient(temp), /Output symlinks/);
    assert.throws(() => writeClient(temp), /Output symlinks/);
    assert.throws(() => prepareClient(temp), /Output symlinks/);
    mkdirSync(join(temp, 'scripts'));
    cpSync(join(clientRoot, 'scripts/build-client.mjs'), join(temp, 'scripts/build-client.mjs'));
    for (const args of [[], ['--check'], ['--prepare']]) {
      const result = spawnSync(process.execPath, [join(temp, 'scripts/build-client.mjs'), ...args], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Output symlinks are not supported/);
      assert.deepEqual(readFileSync(target), original);
    }
    // Broken links must be rejected too, not treated as a missing output file.
    rmSync(target);
    assert.throws(() => writeClient(temp), /Output symlinks/);
    assert.throws(() => prepareClient(temp), /Output symlinks/);
  });
});


test('prepare creates missing output, verifies existing output and never repairs stale bytes', () => {
  withClientFixture(temp => {
    const output = join(temp, 'main.js');
    rmSync(output);
    assert.throws(() => checkClient(temp), /main.js is missing/);
    assert.deepEqual(prepareClient(temp), assembleClient(temp));
    assert.deepEqual(readFileSync(output), assembleClient(temp));
    assert.deepEqual(prepareClient(temp), checkClient(temp));
    writeFileSync(output, 'stale');
    assert.throws(() => prepareClient(temp), /main.js is stale/);
    assert.equal(readFileSync(output, 'utf8'), 'stale');
    rmSync(output);
    mkdirSync(output);
    assert.throws(() => prepareClient(temp), /Expected regular output file/);
  });
});

test('clean-checkout CLI preparation succeeds; strict check and stale preparation fail', () => {
  withClientFixture(temp => {
    mkdirSync(join(temp, 'scripts'));
    cpSync(join(clientRoot, 'scripts/build-client.mjs'), join(temp, 'scripts/build-client.mjs'));
    const output = join(temp, 'main.js');
    const run = mode => spawnSync(process.execPath, [join(temp, 'scripts/build-client.mjs'), mode], { encoding: 'utf8' });
    rmSync(output);
    assert.match(run('--check').stderr, /main.js is missing/);
    assert.equal(run('--prepare').status, 0);
    assert.deepEqual(readFileSync(output), assembleClient(temp));
    assert.equal(run('--check').status, 0);
    writeFileSync(output, 'stale');
    assert.equal(run('--prepare').status, 1);
    assert.equal(readFileSync(output, 'utf8'), 'stale');
  });
});

for (const relative of clientModules) {
  test(`module omissions and malformed module syntax fail before generated client checks: ${relative}`, () => {
    withClientFixture(temp => {
      const file = join(temp, relative);
      const original = readFileSync(file);
      rmSync(file);
      assert.throws(() => checkClient(temp), /Unlisted or missing client module/);
      writeFileSync(file, 'const = ;');
      assert.throws(() => checkClient(temp), SyntaxError);
      writeFileSync(file, original);
      writeFileSync(join(temp, 'src/client-modules/unlisted.js'), '');
      assert.throws(() => checkClient(temp), /Unlisted or missing client module/);
    });
  });
}
