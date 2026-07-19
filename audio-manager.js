(() => {
  "use strict";

  const presets = {
    warm: { tempo: 2.5, wave: "sine", chords: [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]] },
    romantic: { tempo: 2.8, wave: "triangle", chords: [[261.63, 329.63, 392], [246.94, 311.13, 392], [220, 277.18, 329.63], [174.61, 261.63, 349.23]] },
    bright: { tempo: 1.9, wave: "sine", chords: [[261.63, 329.63, 392], [293.66, 369.99, 440], [329.63, 392, 493.88], [293.66, 369.99, 440]] },
    melancholy: { tempo: 3.2, wave: "sine", chords: [[220, 261.63, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [164.81, 207.65, 246.94]] },
    mystery: { tempo: 3, wave: "triangle", chords: [[220, 261.63, 311.13], [207.65, 246.94, 293.66], [196, 233.08, 277.18], [207.65, 246.94, 311.13]] }
    ,daylight: { tempo: 2.4, wave: "sine", arpeggio: true, chords: [[261.63, 329.63, 392, 523.25], [293.66, 369.99, 440, 587.33], [220, 329.63, 392, 493.88], [246.94, 329.63, 392, 523.25]] },
    editingRoom: { tempo: 6.4, wave: "sine", pad: true, chords: [[196,246.94,293.66],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,311.13]] },
    lightRomance: { tempo: 4.8, wave: "sine", pad: true, chords: [[261.63,329.63,392],[349.23,440,523.25],[220,261.63,329.63],[293.66,392,493.88]] }
  };

  let context;
  let master;
  let filter;
  let timer;
  let trackPlayer;
  let currentTrack;
  let currentScene;
  let unlocked = false;
  let chordIndex = 0;
  let config = {};
  let settings = { music: false, sound: false };

  function ensureContext() {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2100;
      filter.Q.value = 0.35;
      master.gain.value = 0.9;
      master.connect(filter);
      filter.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
    return context;
  }

  function playTone(frequency, start, duration, volume, wave = "sine") {
    const ctx = ensureContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(1.2,duration*.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  function scheduleChord() {
    if (!settings.music || !config.music?.enabled) return;
    const preset = presets[config.music.preset] || presets.warm;
    const now = ensureContext().currentTime;
    const chord = preset.chords[chordIndex % preset.chords.length];
    const volume = Number(config.music.volume ?? 0.075);
    chord.forEach((frequency, index) => {
      const start = now + (preset.arpeggio ? index * 0.28 : 0);
      const duration = preset.arpeggio ? 1.15 : preset.pad ? preset.tempo * 1.35 : preset.tempo * 0.92;
      const noteVolume = preset.arpeggio ? volume / (1 + index * 0.35) : preset.pad ? volume / 2.25 : volume / (index + 1);
      playTone(frequency, start, duration, noteVolume, preset.wave);
    });
    chordIndex += 1;
  }

  function startMusic() {
    if (config.music?.tracks) {
      if (!unlocked || !settings.music || !config.music?.enabled) return;
      if (!trackPlayer) {
        trackPlayer = new Audio();
        trackPlayer.loop = true;
        trackPlayer.preload = "auto";
      }
      const track = config.music.sceneTracks?.[currentScene] || config.music.defaultTrack;
      const source = config.music.tracks[track];
      if (!source) return;
      if (currentTrack !== track) {
        trackPlayer.pause();
        trackPlayer.src = source;
        trackPlayer.currentTime = 0;
        currentTrack = track;
      }
      trackPlayer.volume = Number(config.music.volume ?? 0.22);
      trackPlayer.play().catch(() => {});
      return;
    }
    if (timer || !settings.music || !config.music?.enabled) return;
    scheduleChord();
    const preset = presets[config.music.preset] || presets.warm;
    timer = window.setInterval(scheduleChord, preset.tempo * 1000);
  }

  function stopMusic() {
    trackPlayer?.pause();
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function click() {
    if (!settings.sound || !config.sfx?.enabled) return;
    const now = ensureContext().currentTime;
    playTone(300, now, 0.035, Number(config.sfx.volume ?? 0.03), "triangle");
    playTone(420, now + 0.018, 0.03, Number(config.sfx.volume ?? 0.02), "sine");
  }

  function init(audioConfig = {}, initialSettings = {}) {
    config = audioConfig;
    settings = { ...settings, ...initialSettings };
  }

  function unlock() {
    unlocked = true;
    if (!config.music?.tracks) ensureContext();
    startMusic();
  }

  function setScene(sceneId) {
    currentScene = sceneId;
    startMusic();
  }

  function setMusic(enabled) {
    settings.music = Boolean(enabled);
    settings.music ? startMusic() : stopMusic();
  }

  function setSound(enabled) {
    settings.sound = Boolean(enabled);
  }

  function status() {
    return { supported:true, contextState:context?.state || "not-created", musicEnabled:settings.music, playing:Boolean(trackPlayer && !trackPlayer.paused) || Boolean(timer), track:currentTrack, volume:config.music?.volume };
  }

  window.GameAudio = { init, unlock, click, setMusic, setSound, setScene, status, presets: Object.keys(presets) };
})();
