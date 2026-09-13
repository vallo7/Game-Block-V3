/*
  ui/menu.js
  --------------------------------------------------------------------
  Menu principal : sélection du mode Classic (seul actif aujourd'hui),
  feedback sur les modes verrouillés. Portage à l'identique de l'ancien
  js/menu.js.
  --------------------------------------------------------------------
*/
import { Tutorial } from "./tutorial.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Ads } from "../services/ads.js";
import { ADS } from "../config/gameConfig.js";
import { App } from "../app.js";

export const Menu = {
  init() {
    const classicModeBtn = document.getElementById("classicModeBtn");

    classicModeBtn.addEventListener("click", () => {
      Tutorial.handleClassicTap();
      GameAudio.unlock();
      GameAudio.playModeSelect();
      Haptics.vibrate(15);

      if (!Tutorial.active) {
        Ads.maybeShowInterstitial(ADS.CLASSIC_ENTRY_CHANCE);
      }

      setTimeout(() => {
        App.showGame();
      }, 220);
    });

    document.querySelectorAll(".mode-card.locked").forEach(button => {
      button.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
      });
    });
  }
};
