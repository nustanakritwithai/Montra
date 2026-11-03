/* MONTRA account entry: the server owns accounts, slots, classes, and all character data. */
(() => {
  "use strict";
  const server = "https://montra.157-85-96-139.sslip.io";
  const sessionKey = "montra_account_session_v1";
  const guestStorageKey = "montra_guest_access_v1";
  const legacyKey = "montra_s2_guest_token:" + new URL(server).host;
  const paths = [
    ["muay_boran", "นักมวยไทยโบราณ", "โจมตีต่อเนื่องด้วยหมัด ศอก เข่า และการจับ"],
    ["phutthaisawan", "นักดาบไทย", "ดาบคู่และวิชาหลายสำนัก"],
    ["blade", "คมดาบ", "อำพรางตัวและโจมตีรุนแรง"],
    ["sentinel", "ผู้พิทักษ์", "รับความเสียหาย สตัน และคุ้มกันปาร์ตี้"],
    ["seer", "จอมอาคม · ผู้ร่ายเวท", "ยันต์ ข้าวสารเสก เรียกผี และโจมตีด้วยอาคม"],
    ["mender", "จอมอาคม · ผู้เยียวยา", "ฟื้นฟู คุ้มกัน และใช้อาคมสนับสนุน"],
  ];
  let startGame = null, leaveGame = null, selectedSlot = 1, summaries = [], isGuest = false;
  const root = document.getElementById("accountEntry");
  const card = document.getElementById("accountCard");
  const key = () => sessionStorage.getItem(sessionKey) || "";
  function el(tag, text, cls) { const node=document.createElement(tag); if(text)node.textContent=text; if(cls)node.className=cls; return node; }
  function button(label, action, cls="secondary") { const b=el("button",label,cls); b.type="button"; b.addEventListener("click",action); return b; }
  function input(form, label, type, autocomplete) {
    const wrap=el("label",label,"account-field"), field=el("input");
    field.type=type; field.autocomplete=autocomplete; field.required=true; wrap.append(field); form.append(wrap); return field;
  }
  function view(title, note) {
    root.hidden=false; card.replaceChildren();
    card.append(el("div","๛  MONTRA","account-brand"),el("h1",title));
    if(note)card.append(el("p",note,"account-note"));
    const error=el("p","","account-error"); error.setAttribute("role","alert"); card.append(error);
    return error;
  }
  const errors = {invalid_account_details:"ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–24 ตัว และรหัสผ่านยาว 15–128 ตัว",invalid_credentials:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",account_unavailable:"ชื่อผู้ใช้ไม่ว่าง หรือระบบยังไม่พร้อม",legacy_already_linked:"รหัสตัวละครเดิมนี้ผูกกับบัญชีแล้ว",invalid_legacy_key:"รหัสกู้คืนตัวละครเดิมไม่ถูกต้อง",invalid_recovery:"รหัสกู้บัญชีไม่ถูกต้อง",invalid_guest_key:"รหัสแขกไม่ถูกต้องหรือผูกบัญชีแล้ว",guest_required:"กรุณาเข้าสู่ระบบแขกอีกครั้ง",character_online:"ตัวละครในบัญชียังออนไลน์อยู่ กรุณาออกจากเกมแล้วลองใหม่",character_in_guild:"กรุณาออกจากกิลด์หรือโอนตำแหน่งหัวหน้าก่อนลบตัวละคร",character_has_listings:"กรุณายกเลิกรายการฝากขายทั้งหมดก่อนลบตัวละคร",confirm_name_mismatch:"ชื่อตัวละครไม่ตรง กรุณาลองใหม่",slot_changed:"ช่องตัวละครเปลี่ยนไปแล้ว กรุณาโหลดใหม่",delete_failed:"ลบยังไม่เสร็จ กรุณาลองโหลดรายการอีกครั้ง",try_later:"ลองหลายครั้งเกินไป กรุณารอสักครู่",login_required:"กรุณาเข้าสู่ระบบอีกครั้ง"};
  async function api(route, body, session="") {
    const response=await fetch(server+"/montra/account/"+route,{method:body ? "POST":"GET",cache:"no-store",headers:{...(body?{"Content-Type":"application/json"}:{}),...(session?{Authorization:"Bearer "+session}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(errors[data.error] || "เชื่อมต่อระบบบัญชีไม่สำเร็จ กรุณาลองใหม่");
    return data;
  }
  function recoveryNotice(code, next, guest=false) {
    const error=view(guest?"เก็บรหัสกู้บัญชีแขก":"เก็บรหัสกู้บัญชี", guest?"จดรหัสนี้ไว้ในที่ปลอดภัย ใช้เข้าเล่นบัญชีแขกจากเครื่องอื่นหรือเมื่อข้อมูลเบราว์เซอร์หาย":"จดรหัสนี้ไว้ในที่ปลอดภัย หากลืมรหัสผ่านต้องใช้รหัสนี้ และรหัสจะแสดงเพียงครั้งเดียว");
    const box=el("textarea"); box.value=code; box.readOnly=true; box.rows=3; box.setAttribute("aria-label","รหัสกู้บัญชี"); card.append(box);
    card.append(button("คัดลอกรหัส",async()=>{try{await navigator.clipboard.writeText(code);error.textContent="คัดลอกแล้ว";}catch{box.select();error.textContent="เลือกรหัสแล้ว กรุณาคัดลอกด้วยตนเอง";}}),button("เก็บรหัสแล้ว · ดำเนินการต่อ",next,"primary"));
  }
  function login() {
    const error=view("เข้าสู่ระบบ", "เข้าสู่โลก MONTRA ด้วยบัญชีของคุณ");
    const form=el("form"), username=input(form,"ชื่อผู้ใช้","text","username"), password=input(form,"รหัสผ่าน","password","current-password");
    const submit=el("button","เข้าสู่ระบบ","primary"); submit.type="submit"; form.append(submit); card.append(form);
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;error.textContent="กำลังเข้าสู่ระบบ…";try{const result=await api("login",{username:username.value,password:password.value});sessionStorage.setItem(sessionKey,result.session);password.value="";await slots();}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};
    card.append(button("เล่นแบบแขก",guestEntry),button("ใช้รหัสกู้บัญชีแขก",guestRecover),button("สร้างบัญชี",register),button("ลืมรหัสผ่าน",reset));
  }
  async function guestEntry() {
    const old=localStorage.getItem(guestStorageKey);
    if(old){await loginGuest(old);return;}
    const error=view("กำลังสร้างบัญชีแขก","บัญชีแขกมีเซฟถาวร และสามารถผูกบัญชีภายหลังได้");
    try {const result=await api("guest",{});localStorage.setItem(guestStorageKey,result.guestKey);sessionStorage.setItem(sessionKey,result.session);recoveryNotice(result.guestKey,slots,true);}
    catch(err){error.textContent=err.message;card.append(button("กลับ",login));}
  }
  async function loginGuest(code) {
    const error=view("เข้าสู่ระบบแขก","กำลังตรวจรหัสบัญชีแขก…");
    try{const result=await api("guest-login",{guestKey:code});localStorage.setItem(guestStorageKey,code);sessionStorage.setItem(sessionKey,result.session);await slots();}
    catch(err){error.textContent=err.message;card.append(button("ใช้รหัสอื่น",guestRecover),button("กลับ",login));}
  }
  function guestRecover() {
    const error=view("กู้บัญชีแขก","วางรหัสกู้บัญชีแขกที่เคยบันทึกไว้");
    const form=el("form"),code=input(form,"รหัสบัญชีแขก","password","off"),submit=el("button","เข้าเล่น","primary");submit.type="submit";form.append(submit);card.append(form,button("กลับ",login));
    form.onsubmit=async e=>{e.preventDefault();const value=code.value.trim();code.value="";await loginGuest(value);};
  }
  function upgradeGuest() {
    const error=view("ผูกบัญชีแขก", "สร้างชื่อผู้ใช้ใหม่เพื่อเปลี่ยนบัญชีแขกเป็นบัญชีปกติ ตัวละครทั้ง 3 ช่องจะอยู่ครบ");
    const form=el("form"),username=input(form,"ชื่อผู้ใช้","text","username"),password=input(form,"รหัสผ่าน","password","new-password"),confirm=input(form,"ยืนยันรหัสผ่าน","password","new-password"),submit=el("button","ผูกบัญชี","primary");submit.type="submit";form.append(submit);card.append(form,button("กลับ",slots));
    form.onsubmit=async e=>{e.preventDefault();if(password.value!==confirm.value){error.textContent="รหัสผ่านทั้งสองช่องไม่ตรงกัน";return;}submit.disabled=true;try{const result=await api("guest-upgrade",{username:username.value,password:password.value},key());localStorage.removeItem(guestStorageKey);password.value="";confirm.value="";recoveryNotice(result.recoveryCode,slots);}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};
  }
  function register() {
    const error=view("สร้างบัญชี", "ชื่อผู้ใช้ใช้ a-z, 0-9 หรือ _ ได้ 3–24 ตัว รหัสผ่านอย่างน้อย 15 ตัว");
    const form=el("form"), username=input(form,"ชื่อผู้ใช้","text","username"), password=input(form,"รหัสผ่าน","password","new-password"), confirm=input(form,"ยืนยันรหัสผ่าน","password","new-password");
    const legacy=el("input"); legacy.type="password"; legacy.autocomplete="off"; legacy.spellcheck=false; legacy.placeholder="วางรหัสกู้คืนตัวละครเดิม (ถ้ามี)";
    const old=localStorage.getItem(legacyKey); if(old && /^mt1_[0-9a-f]{64}$/.test(old))legacy.value=old;
    const label=el("label","ผูกตัวละครเดิม","account-field");label.append(legacy);form.append(label);
    const submit=el("button","สร้างบัญชี","primary");submit.type="submit";form.append(submit);card.append(form,button("กลับไปเข้าสู่ระบบ",login));
    form.onsubmit=async e=>{e.preventDefault(); if(password.value!==confirm.value){error.textContent="รหัสผ่านทั้งสองช่องไม่ตรงกัน";return;}submit.disabled=true;error.textContent="กำลังสร้างบัญชี…";try{const body={username:username.value,password:password.value};if(legacy.value.trim())body.legacyKey=legacy.value.trim();const result=await api("register",body);password.value="";confirm.value="";legacy.value="";recoveryNotice(result.recoveryCode,login);}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};
  }
  function reset() {
    const error=view("ตั้งรหัสผ่านใหม่", "ใช้ชื่อผู้ใช้และรหัสกู้บัญชีที่ได้รับตอนสมัคร");
    const form=el("form"), username=input(form,"ชื่อผู้ใช้","text","username"), recovery=input(form,"รหัสกู้บัญชี","text","off"), password=input(form,"รหัสผ่านใหม่","password","new-password");
    const submit=el("button","ตั้งรหัสผ่านใหม่","primary");submit.type="submit";form.append(submit);card.append(form,button("กลับไปเข้าสู่ระบบ",login));
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const result=await api("reset",{username:username.value,recoveryCode:recovery.value.trim(),password:password.value});recovery.value="";password.value="";recoveryNotice(result.recoveryCode,login);}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};
  }
  async function slots() {
    const error=view("เลือกตัวละคร", "เลือกตัวละครเดิมหรือสร้างตัวละครใหม่ได้ 3 ช่อง");
    if(!key()){login();return;}
    try {
      const result=await api("slots",null,key()); summaries=result.slots;isGuest=result.guest===true;
      for(const s of summaries){
        const path=paths.find(p=>p[0]===s.path), label=s.unavailable?"ข้อมูลอ่านไม่ได้":s.occupied?(s.name+" · Lv. "+s.level+" · "+(path?.[1] || "ยังไม่เลือกอาชีพ")):"สร้างตัวละครใหม่";
        const b=button("ช่อง "+s.slot+" · "+label,()=>{selectedSlot=s.slot;if(s.occupied && s.path)play();else setup(s);},"account-slot");b.disabled=!!s.unavailable;card.append(b);
        if(s.occupied && !s.unavailable)card.append(button("ลบตัวละครช่อง "+s.slot,()=>confirmDelete(s)));
      }
      if(isGuest){card.append(button("สร้างบัญชีใหม่จากบัญชีแขก",upgradeGuest),button("ดูรหัสกู้บัญชีแขก",()=>{const code=localStorage.getItem(guestStorageKey);if(code)recoveryNotice(code,slots,true);else guestRecover();}));}
      card.append(button("ออกจากระบบ",async()=>{const session=key();sessionStorage.removeItem(sessionKey);if(leaveGame)await leaveGame();try{await api("logout",{},session);}catch{}login();}));
    } catch(err) {error.textContent=err.message;card.append(button("ลองใหม่",slots),button("เข้าสู่ระบบอีกครั้ง",()=>{sessionStorage.removeItem(sessionKey);login();}));}
  }
  function confirmDelete(slot) {
    const error=view("ยืนยันลบตัวละคร", "ลบ "+slot.name+" ถาวร รวมเลเวล สกิล เงิน และไอเท็มของตัวละครนี้ พิมพ์ชื่อตัวละครเพื่อยืนยัน");
    const form=el("form"),name=input(form,"ชื่อตัวละคร","text","off"),submit=el("button","ลบตัวละครถาวร","primary");submit.type="submit";form.append(submit);card.append(form,button("ยกเลิก",slots));
    form.onsubmit=async e=>{e.preventDefault();if(name.value!==slot.name){error.textContent="ชื่อตัวละครไม่ตรง";return;}submit.disabled=true;error.textContent="กำลังลบตัวละคร…";try{if(leaveGame)await leaveGame();await api("delete-character",{slot:slot.slot,revision:slot.revision,name:name.value},key());await slots();}catch(err){error.textContent=err.message;submit.disabled=false;}};
  }
  function setup(slot) {
    const error=view("เลือกอาชีพ", "อาชีพจะผูกกับตัวละครนี้ถาวร กรุณาเลือกก่อนเข้าเล่น");
    const form=el("form"); let name;
    if(!slot.occupied)name=input(form,"ชื่อตัวละคร","text","off");
    const select=el("select"), label=el("label","อาชีพ","account-field");
    for(const [id,title] of paths){const option=el("option",title);option.value=id;select.append(option);}label.append(select);form.append(label);
    const desc=el("p","","account-note");const update=()=>{desc.textContent=paths.find(p=>p[0]===select.value)?.[2] || "";};select.onchange=update;update();form.append(desc);
    const ancestry=el("select"), ancestryLabel=el("label","พื้นเพ","account-field");
    for(const [id,title] of [["woodland","ชาวป่า"],["shrine","ชาวศาล"]]){const option=el("option",title);option.value=id;ancestry.append(option);}ancestryLabel.append(ancestry);form.append(ancestryLabel);
    const submit=el("button","ยืนยันอาชีพและเข้าเล่น","primary");submit.type="submit";form.append(submit);card.append(form,button("กลับไปเลือกตัวละคร",slots));
    form.onsubmit=async e=>{e.preventDefault();const characterName=name?.value.normalize("NFC").trim();if(name && (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(characterName) || Array.from(characterName).length<2 || Array.from(characterName).length>20)){error.textContent="ชื่อตัวละครต้องมี 2–20 ตัวอักษร";return;}submit.disabled=true;error.textContent="กำลังเข้าโลก…";await play({name:characterName,build:{path:select.value,ancestry:ancestry.value}});submit.disabled=false;};
  }
  async function play(setup) { if(startGame)await startGame(server,selectedSlot,setup); }
  window.MontraEntry={
    start(callback, leave){startGame=callback;leaveGame=leave; if(key())void slots();else login();},
    open(){if(key())void slots();else login();},
    success(){root.hidden=true;},
    failure(message){root.hidden=false;const error=card.querySelector(".account-error");if(error)error.textContent=message || "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่";},
    session:key,
  };
})();
