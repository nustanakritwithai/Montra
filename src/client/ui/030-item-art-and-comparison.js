  function statLine(stats){return itemPresentation.statLine(stats);}
  const bodyLabels={head:"ศีรษะ",shoulders:"ไหล่",chest:"อก",arms:"แขน",leftHand:"มือซ้าย",rightHand:"มือขวา",legs:"กางเกง",feet:"รองเท้า",offHand:"อุปกรณ์มือรอง",neck:"สร้อย",leftEar:"ตุ้มหูซ้าย",rightEar:"ตุ้มหูขวา",leftRing:"แหวนซ้าย",rightRing:"แหวนขวา"};
  const gearSymbols={mainHand:"⚔",head:"♛",shoulders:"⛨",chest:"♜",arms:"⟐",leftHand:"☚",rightHand:"☛",legs:"Ⅱ",feet:"♞",offHand:"◈",neck:"♧",earring:"♢",leftEar:"♢",rightEar:"♢",ring:"◎",leftRing:"◎",rightRing:"◎"};
  let inspectingGear=null, preferredGearSlot=null;
  function wearPositions(kind){return itemPresentation.wearPositions(kind);}
  function gearDestination(positions,equipment){return itemPresentation.gearDestination(positions,equipment);}
  function bagMeta(id){return itemPresentation.bagMeta(id);}
  function itemSymbol(id){return itemPresentation.itemSymbol(id);}
  function getItemArtKey(id,meta){return itemPresentation.getItemArtKey(id,meta);}
  // One read-only item thumbnail, shared with inventory slots. Never binds an action.
  function createItemTile(item,options={}){return itemPresentation.createItemTile(item,options);}
  function renderItemTile(id,item,options={}){return itemPresentation.renderItemTile(id,item,options);}
  function renderItemPreview(id,item,caption=""){return itemPresentation.renderItemPreview(id,item,caption);}
  function wornGearAt(position,slots){return itemPresentation.wornGearAt(position,slots);}
  function pieceStat(piece,stat){return itemPresentation.pieceStat(piece,stat);}
  function gearComparison(next,previous,slots){return itemPresentation.gearComparison(next,previous,slots);}
  function pieceForgeRatings(stack){return itemPresentation.pieceForgeRatings(stack);}
  function forgeComparison(item,previous){return itemPresentation.forgeComparison(item,previous);}
