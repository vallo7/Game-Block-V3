/*
  services/settings.js
  --------------------------------------------------------------------
  Réglages utilisateur (son, musique, vibrations, blocage pub) et leur
  application aux autres services. Le littéral `data` de départ est
  gardé tel quel (il est de toute façon immédiatement remplacé par
  Storage.getSettings() dans load()) pour ne rien changer au
  comportement existant.
  --------------------------------------------------------------------
*/
import { GameAudio } from "./audio.js";
import { Haptics } from "./haptics.js";
import { Storage } from "./storage.js";

export const Settings = {
  data: {
    sound: true,
    music: false,
    musicVolume: 100,
    vibration: true
  },

  load() {
    this.data = Storage.getSettings();

    if (typeof this.data.musicVolume !== "number") {
      this.data.musicVolume = this.data.music ? 100 : 0;
    }

    this.apply();
    this.updateUI();
  },

  save() {
    Storage.saveSettings(this.data);
  },

  apply() {
    GameAudio.setSoundEnabled(this.data.sound);
    GameAudio.setMusicEnabled(this.data.music);
    GameAudio.setMusicVolume(this.data.musicVolume / 100);
    Haptics.setEnabled(this.data.vibration);
  },

  toggle(key) {
    if (!(key in this.data)) return;

    this.data[key] = !this.data[key];

    this.save();
    this.apply();
    this.updateUI();

    if (key === "vibration" && this.data.vibration) {
      Haptics.vibrate(300);
    }
  },

  setMusicVolume(value) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));

    this.data.musicVolume = clamped;
    this.data.music = clamped > 0;

    this.save();
    this.apply();
    this.updateUI();

    if (this.data.music) {
      GameAudio.unlock();
    }
  },

  updateUI() {
    document.querySelectorAll("input[data-setting]").forEach(input => {
      const key = input.dataset.setting;
      input.checked = Boolean(this.data[key]);
    });

    document.querySelectorAll(".music-volume-slider").forEach(slider => {
      slider.value = this.data.musicVolume;
    });
  }
};
