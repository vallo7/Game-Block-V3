/*
  services/audio.js
  --------------------------------------------------------------------
  Moteur audio (synthèse Web Audio + échantillons réels en surcouche).
  Portage à l'identique de l'ancien js/audio.js, sans changement de
  logique : seul l'export a été ajouté.
  --------------------------------------------------------------------
*/
export const GameAudio = {
  ctx: null,
  master: null,
  musicGain: null,

  musicBuffer: null,
  musicSource: null,
  musicLoading: false,
  musicNodes: [],

  soundEnabled: true,
  musicEnabled: false,
  musicVolume: 1,
  paused: false,

  pause() {
    this.paused = true;
    if (this.ctx && this.ctx.state === "running") {
      this.ctx.suspend();
    }
  },

  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state === "suspended" && !document.hidden) {
      this.ctx.resume();
    }
  },

  getMusicPeak(base) {
    return Math.max(0.0001, base * this.musicVolume);
  },

  setMusicVolume(value) {
    this.musicVolume = Math.max(0, Math.min(1, value));

    if (!this.ctx || !this.musicGain) return;
    if (!this.musicEnabled) return;

    const now = this.ctx.currentTime;
    const peak = this.musicSource ? 0.75 : 0.6;

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.exponentialRampToValueAtTime(this.getMusicPeak(peak), now + 0.25);
  },

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !document.hidden && !this.paused) {
        this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    this.master = this.ctx.createGain();
    this.master.gain.value = 2.1;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0001;
    this.musicGain.connect(this.master);

    this.loadSamples();
  },

  sampleBuffers: {},
  samplesLoaded: false,
  sampleUrls: {
    drop: "audio/drop.mp3",
    defeat: "audio/defaite.mp3",
    nice: "audio/nice.mp3",
    great: "audio/great.mp3",
    awesome: "audio/awesome.mp3",
    amazing: "audio/amazing.mp3",
    unreal: "audio/unreal.mp3"
  },

  async loadSamples() {
    if (this.samplesLoaded || !this.ctx) return;
    this.samplesLoaded = true;

    await Promise.all(Object.entries(this.sampleUrls).map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        this.sampleBuffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
      } catch (error) {
        // Fichier manquant ou non décodable : le son synthétisé prendra le relais.
      }
    }));
  },

  playSample(name, gain = 1) {
    if (!this.soundEnabled) return true;
    if (document.hidden) return true;

    const buffer = this.sampleBuffers[name];
    if (!buffer || !this.ctx || !this.master) return false;

    this.ensure();

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = gain;

    source.connect(gainNode);
    gainNode.connect(this.master);
    source.start(0);

    return true;
  },

  unlock() {
    this.ensure();

    if (this.musicEnabled && !document.hidden) {
      this.startMusic();
    }
  },

  handleVisibility() {
    if (!this.ctx) return;

    if (document.hidden) {
      this.stopMusic();

      if (this.ctx.state === "running") {
        this.ctx.suspend();
      }
    } else {
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }

      if (this.musicEnabled) {
        this.startMusic();
      }
    }
  },

  setSoundEnabled(value) {
    this.soundEnabled = value;
  },

  setMusicEnabled(value) {
    this.musicEnabled = value;

    if (value) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  },

  loadMusic(callback) {
    if (this.musicBuffer) {
      if (callback) callback(true);
      return;
    }

    if (this.musicLoading) return;
    this.musicLoading = true;

    fetch("music.mp3")
      .then(response => {
        if (!response.ok) throw new Error("http");
        return response.arrayBuffer();
      })
      .then(data => this.ctx.decodeAudioData(data))
      .then(buffer => {
        this.musicBuffer = buffer;
        this.musicLoading = false;
        if (callback) callback(true);
      })
      .catch(() => {
        this.musicLoading = false;
        if (callback) callback(false);
      });
  },

  startMusic() {
    this.ensure();
    if (!this.ctx || !this.musicGain || !this.musicEnabled) return;
    if (document.hidden) return;
    if (this.musicSource || this.musicNodes.length > 0) return;

    if (!this.musicBuffer) {
      this.loadMusic((ok) => {
        if (!this.musicEnabled) return;
        if (ok && this.musicBuffer) {
          this.startMusic();
        } else {
          this.startSynthMusic();
        }
      });
      return;
    }

    const now = this.ctx.currentTime;

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.exponentialRampToValueAtTime(this.getMusicPeak(0.75), now + 1.2);

    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();

    this.musicSource = src;
  },

  startSynthMusic() {
    this.ensure();
    if (!this.ctx || !this.musicGain || !this.musicEnabled) return;
    if (document.hidden) return;
    if (this.musicNodes.length > 0) return;

    const now = this.ctx.currentTime;

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.exponentialRampToValueAtTime(this.getMusicPeak(0.6), now + 1.6);

    const freqs = [110, 164.81, 220];

    freqs.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      gain.gain.value = index === 0 ? 0.2 : 0.1;

      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = (index - 1) * 4;

      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = (index - 1) * 0.25;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.musicGain);
      } else {
        osc.connect(gain);
        gain.connect(this.musicGain);
      }

      osc.start();
      this.musicNodes.push(osc, gain);
    });

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 0.011;

    lfo.connect(lfoGain);
    lfoGain.connect(this.musicGain.gain);

    lfo.start();

    this.musicNodes.push(lfo, lfoGain);
  },

  stopMusic() {
    if (!this.ctx || !this.musicGain) return;

    const now = this.ctx.currentTime;
    const current = Math.max(this.musicGain.gain.value, 0.0001);

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(current, now);
    this.musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    if (this.musicSource) {
      try {
        this.musicSource.stop(now + 0.3);
      } catch (error) {}
      this.musicSource = null;
    }

    this.stopSynthMusic();
  },

  stopSynthMusic() {
    if (!this.ctx || this.musicNodes.length === 0) return;

    const now = this.ctx.currentTime;

    this.musicNodes.forEach(node => {
      try {
        if (node.stop) {
          node.stop(now + 0.3);
        }
      } catch (error) {}

      try {
        node.disconnect();
      } catch (error) {}
    });

    this.musicNodes = [];
  },

  PENTATONIC: [1, 1.125, 1.25, 1.5, 1.6667],

  noteFreq(root, step) {
    const scale = this.PENTATONIC;
    const octave = Math.floor(step / scale.length);
    const degree = ((step % scale.length) + scale.length) % scale.length;

    return root * scale[degree] * Math.pow(2, octave);
  },

  playTone(freq, options = {}) {
    if (!this.soundEnabled) return;
    if (document.hidden) return;

    this.ensure();
    if (!this.ctx || !this.master) return;

    const {
      duration = 0.08,
      type = "sine",
      gain = 0.3,
      slideTo = null,
      delay = 0
    } = options;

    const now = this.ctx.currentTime + delay;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(freq * 4.5, 850), now);
    filter.Q.value = 0.5;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(gain, now + 0.011);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    filter.connect(gainNode);
    gainNode.connect(this.master);

    [-6, 6].forEach((cents) => {
      const oscillator = this.ctx.createOscillator();
      const voiceGain = this.ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, now);
      oscillator.detune.value = cents;

      if (slideTo) {
        oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      }

      voiceGain.gain.value = 0.55;

      oscillator.connect(voiceGain);
      voiceGain.connect(filter);

      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    });
  },

  playClick() {
    this.playTone(540, { duration: 0.05, type: "triangle", gain: 0.36 });
    this.playTone(760, { duration: 0.04, type: "sine", gain: 0.22, delay: 0.02 });
  },

  playModeSelect() {
    if (this.playSample("menu", 0.9)) return;
    this.playClick();
  },

  playAdd(index) {
    const freq = 300 * Math.pow(1.05946, index);
    this.playTone(freq, { duration: 0.05, type: "triangle", gain: 0.3 });
  },

  playBack() {
    this.playTone(220, { duration: 0.04, type: "triangle", gain: 0.18, slideTo: 180 });
  },

  playPlace() {
    if (this.playSample("drop", 0.85)) return;

    this.playTone(330, { duration: 0.08, type: "sine", gain: 0.34, slideTo: 430 });
    this.playTone(520, { duration: 0.05, type: "triangle", gain: 0.18, delay: 0.03 });
  },

  playCancel() {
    this.playTone(190, { duration: 0.1, type: "triangle", gain: 0.22, slideTo: 110 });
  },

  playClear(count) {
    const base = 392;
    const notes = Math.min(count + 2, 5);

    for (let i = 0; i < notes; i++) {
      this.playTone(this.noteFreq(base, i), {
        duration: 0.1,
        type: "triangle",
        gain: 0.34,
        delay: i * 0.034
      });
    }

    if (count > 1) {
      this.playTone(base * 2, { duration: 0.2, type: "sine", gain: 0.36, delay: 0.13 });
    }
  },

  playFreezeTick(index) {
    this.playTone(700 + index * 90, { duration: 0.05, type: "sine", gain: 0.14 });
  },

  playBlockDisappear(index) {
    this.playTone(620 - (index % 14) * 28, {
      duration: 0.05,
      type: "sine",
      gain: 0.1,
      slideTo: 300
    });
  },

  playBlockSpawn(index) {
    this.playTone(280 + (index % 8) * 34, {
      duration: 0.07,
      type: "triangle",
      gain: 0.22,
      slideTo: 520
    });
  },

  playRiser(level) {
    const startFreq = 240;
    const endFreq = 240 + level * 260;
    const duration = 0.16 + level * 0.02;

    this.playTone(startFreq, {
      duration,
      type: "sawtooth",
      gain: 0.07 + level * 0.035,
      slideTo: endFreq
    });
  },

  playPraise(level) {
    const names = ["nice", "great", "awesome", "amazing", "unreal"];
    const name = names[Math.min(Math.max(level, 1), 5) - 1];

    this.playRiser(level);

    const riserDuration = (0.16 + level * 0.02) * 1000;

    setTimeout(() => {
      if (this.playSample(name, 1)) return;

      const base = 523;
      const notes = 3 + level;

      for (let i = 0; i < notes; i++) {
        this.playTone(this.noteFreq(base, i), {
          duration: 0.11,
          type: "triangle",
          gain: 0.32,
          delay: i * 0.052
        });
      }

      if (level >= 3) {
        this.playTone(base / 2, { duration: 0.3, type: "sine", gain: 0.28, delay: 0.1 });
      }

      if (level >= 5) {
        this.playTone(base * 2, { duration: 0.22, type: "sine", gain: 0.28, delay: 0.3 });
        this.playTone(base * 2.5, { duration: 0.22, type: "sine", gain: 0.22, delay: 0.38 });
      }
    }, riserDuration);
  },

  playColorShift() {
    const base = 523;

    for (let i = 0; i < 4; i++) {
      this.playTone(this.noteFreq(base, i), {
        duration: 0.11,
        type: "triangle",
        gain: 0.34,
        delay: i * 0.055
      });
    }
  },

  playError() {
    if (this.playSample("error", 0.8)) return;
    this.playTone(110, { duration: 0.1, type: "square", gain: 0.16, slideTo: 70 });
  },

  playCountdown() {
    this.playTone(660, { duration: 0.06, type: "triangle", gain: 0.3 });
  },

  playGameOver() {
    if (this.playSample("defeat", 0.9)) return;
    this.playTone(220, { duration: 0.22, type: "sawtooth", gain: 0.17, slideTo: 70 });
  },

  playVoice(level) {
    if (!this.soundEnabled) return;
    if (document.hidden) return;
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance !== "function") return;

    const words = ["Nice!", "Great!", "Awesome!", "Amazing!", "Unreal!"];
    const text = words[Math.min(Math.max(level, 1), words.length) - 1];

    try {
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05 + level * 0.05;
      utter.pitch = 1.15 + level * 0.13;
      utter.volume = 1;

      const voices = window.speechSynthesis.getVoices();

      if (voices && voices.length) {
        const preferred = voices.find(v => /female|samantha|zira|victoria|karen|jenny/i.test(v.name))
          || voices.find(v => v.lang && v.lang.toLowerCase().startsWith("en"))
          || voices[0];

        if (preferred) utter.voice = preferred;
      }

      window.speechSynthesis.speak(utter);
    } catch (error) {
      // Synthèse vocale indisponible sur cet appareil : on ignore simplement.
    }
  },

  playTutorialDone() {
    const base = 523;

    for (let i = 0; i < 4; i++) {
      this.playTone(this.noteFreq(base, i), {
        duration: 0.13,
        type: "triangle",
        gain: 0.34,
        delay: i * 0.075
      });
    }

    this.playTone(base * 2, { duration: 0.3, type: "sine", gain: 0.32, delay: 0.34 });
  }
};
