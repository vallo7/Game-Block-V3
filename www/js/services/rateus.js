/*
  services/rateus.js
  --------------------------------------------------------------------
  Panneau "Rate us" : affichage garanti au premier retour au menu après
  le tutoriel, puis occasionnel (menu / restart). Seuils venus de
  config/gameConfig.js.
  --------------------------------------------------------------------
*/
import { RATE_US } from "../config/gameConfig.js";
import { Storage } from "./storage.js";
import { Tutorial } from "../ui/tutorial.js";
import { GameAudio } from "./audio.js";
import { Haptics } from "./haptics.js";

export const RateUs = {
  STORE_URL: RATE_US.STORE_URL,

  MIN_PROMPTS_BETWEEN: RATE_US.MIN_PROMPTS_BETWEEN,
  MENU_CHANCE: RATE_US.MENU_CHANCE,
  RESTART_CHANCE: RATE_US.RESTART_CHANCE,

  shownOnce: false,
  promptsSinceShown: 0,

  init() {
    this.shownOnce = Storage.getRateUsShown();

    const overlay = document.getElementById("rateUsOverlay");
    const rateBtn = document.getElementById("rateUsBtn");
    const dismissBtn = document.getElementById("rateUsDismissBtn");

    if (rateBtn) {
      rateBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
        this.openStore();
        this.hide();
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
        this.hide();
      });
    }

    if (overlay) {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) this.hide();
      });
    }
  },

  isAnyOverlayOpen() {
    return [
      "settingsOverlay",
      "homeSettingsOverlay",
      "aboutUsOverlay",
      "gameOverOverlay",
      "rateUsOverlay"
    ].some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains("hidden");
    });
  },

  canPrompt() {
    if (Tutorial.active || !Storage.getTutorialDone()) return false;
    if (document.body.classList.contains("locked")) return false;
    if (this.isAnyOverlayOpen()) return false;

    return true;
  },

  maybeShowOnMenu() {
    if (!this.canPrompt()) return;

    if (!this.shownOnce) {
      this.show();
      return;
    }

    this.promptsSinceShown += 1;
    if (this.promptsSinceShown < this.MIN_PROMPTS_BETWEEN) return;
    if (Math.random() > this.MENU_CHANCE) return;

    this.show();
  },

  maybeShowOnRestart() {
    if (!this.canPrompt()) return;
    if (!this.shownOnce) return;

    this.promptsSinceShown += 1;
    if (this.promptsSinceShown < this.MIN_PROMPTS_BETWEEN) return;
    if (Math.random() > this.RESTART_CHANCE) return;

    this.show();
  },

  show() {
    const overlay = document.getElementById("rateUsOverlay");
    if (!overlay) return;

    this.promptsSinceShown = 0;

    if (!this.shownOnce) {
      this.shownOnce = true;
      Storage.setRateUsShown();
    }

    setTimeout(() => {
      const panel = overlay.querySelector(".rate-us-panel");

      overlay.classList.remove("hidden");

      if (panel) {
        panel.classList.remove("rate-us-animate-in");
        void panel.offsetWidth;
        panel.classList.add("rate-us-animate-in");
      }
    }, 220);
  },

  hide() {
    const overlay = document.getElementById("rateUsOverlay");
    if (!overlay) return;

    overlay.classList.add("hidden");

    const panel = overlay.querySelector(".rate-us-panel");
    if (panel) panel.classList.remove("rate-us-animate-in");
  },

  openStore() {
    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser) {
      Capacitor.Plugins.Browser.open({ url: this.STORE_URL });
      return;
    }

    window.open(this.STORE_URL, "_system");
  }
};
