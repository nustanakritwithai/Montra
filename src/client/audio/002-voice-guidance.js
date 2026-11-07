  const voiceGuidance = globalThis.MontraVoiceGuidance.create({
    getDocument: () => document,
    getWindow: () => window,
    getStorage: () => localStorage,
    getPerformance: () => performance,
    getSetTimeout: () => setTimeout,
    getClearTimeout: () => clearTimeout,
  });
  function triggerCombatCallout(key){return voiceGuidance.triggerCombatCallout(key);}
  function isVoiceGuidanceEnabled(){return voiceGuidance.isVoiceGuidanceEnabled();}
  function setVoiceGuidanceEnabled(enabled){return voiceGuidance.setVoiceGuidanceEnabled(enabled);}
  function ensureVoiceGuidanceHud(){return voiceGuidance.ensureVoiceGuidanceHud();}
  function hideVoiceGuidanceHud(){return voiceGuidance.hideVoiceGuidanceHud();}
  function triggerVoiceGuidance(stepKey){return voiceGuidance.triggerVoiceGuidance(stepKey);}

  // Sound effects (audio.js). Safe no-op until audio is unlocked by the first tap.
  const SFX = (name, opts) => window.MontraAudio?.play(name, opts);
