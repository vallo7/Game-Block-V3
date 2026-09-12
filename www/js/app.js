/*
  app.js
  --------------------------------------------------------------------
  Point d'entrée de l'application (chargé par index.html en tant que
  <script type="module">). Orchestration au démarrage + navigation
  entre écrans + réglages. Portage à l'identique de l'ancien js/app.js,
  avec les imports ES modules et la seule chance publicitaire (3/4)
  remplacée par la constante centralisée ADS.RESTART_CHANCE.
  --------------------------------------------------------------------
*/
import { Theme } from "./services/theme.js";
import { Settings } from "./services/settings.js";
import { Game } from "./core/game.js";
import { Menu } from "./ui/menu.js";
import { Tutorial } from "./ui/tutorial.js";
import { Ads } from "./services/ads.js";
import { RateUs } from "./services/rateus.js";
import { VisualTheme } from "./services/visualtheme.js";
import { GameAudio } from "./services/audio.js";
import { Haptics } from "./services/haptics.js";
import { ADS } from "./config/gameConfig.js";

export const App = {
  splashHidden: false,
  lastBackPress: 0,
  init() {
    Theme.init();
    Settings.load();
    Game.init();
    Menu.init();
    Tutorial.init();
    Ads.init();
    RateUs.init();
    VisualTheme.init();
    this.bindUI();
    this.bindBackButton();
    this.bindButtonPop();
    this.bindVisibility();
    this.updateAdsUI();
    this.showMenu();
    this.hideSplashLater();
    document.addEventListener("pointerdown", () => {
      GameAudio.unlock();
    }, { once: true });
  },
  bindVisibility() {
    document.addEventListener("visibilitychange", () => {
      GameAudio.handleVisibility();
    });
    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
      Capacitor.Plugins.App.addListener("appStateChange", (state) => {
        if (state && typeof state.isActive === "boolean") {
          if (!state.isActive) {
            GameAudio.stopMusic();
            if (GameAudio.ctx && GameAudio.ctx.state === "running") {
              GameAudio.ctx.suspend();
            }
          } else {
            if (GameAudio.ctx && GameAudio.ctx.state === "suspended") {
              GameAudio.ctx.resume();
            }
            if (GameAudio.musicEnabled) {
              GameAudio.startMusic();
            }
          }
        }
      });
    }
  },
  bindBackButton() {
    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
      Capacitor.Plugins.App.addListener("backButton", () => {
        this.handleBack();
      });
    }
  },
  handleBack() {
    if (Tutorial.isGameLocked()) {
      Haptics.vibrate(10);
      return;
    }
    const settingsOverlay = document.getElementById("settingsOverlay");
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const gameScreen = document.getElementById("gameScreen");
    if (!settingsOverlay.classList.contains("hidden")) {
      GameAudio.playClick();
      this.closeSettings();
      return;
    }
    if (!gameOverOverlay.classList.contains("hidden")) {
      GameAudio.playClick();
      Game.stopCountdown();
      this.showMenu();
      return;
    }
    if (gameScreen.classList.contains("active")) {
      GameAudio.playClick();
      this.showMenu();
      return;
    }
    const themeScreen = document.getElementById("themeScreen");
    if (themeScreen && themeScreen.classList.contains("active")) {
      GameAudio.playClick();
      VisualTheme.closePage();
      return;
    }
    const now = Date.now();
    if (this.lastBackPress && now - this.lastBackPress < 2000) {
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
        Capacitor.Plugins.App.exitApp();
      } else {
        window.history.back();
      }
      return;
    }
    this.lastBackPress = now;
    Haptics.vibrate(10);
  },
  bindButtonPop() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest ? event.target.closest("button") : null;
      if (!button) return;
      button.classList.remove("btn-pop");
      void button.offsetWidth;
      button.classList.add("btn-pop");
      setTimeout(() => {
        button.classList.remove("btn-pop");
      }, 320);
    }, true);
  },
  hideSplashLater() {
    setTimeout(() => {
      const splash = document.getElementById("splash");
      if (splash && !this.splashHidden) {
        splash.classList.add("hidden");
        this.splashHidden = true;
      }
    }, 1600);
  },
  updateAdsUI() {
    const btn = document.getElementById("adsBlockBtn");
    const label = document.getElementById("adsBlockLabel");
    if (!btn) return;
    const on = Boolean(Settings.data.adsBlocked);
    btn.classList.toggle("on", on);
    if (label) {
      label.textContent = on ? "ADS REMOVED" : "REMOVE ADS";
    }
  },
  celebrateEl(el) {
    el.classList.remove("celebrate");
    void el.offsetWidth;
    el.classList.add("celebrate");
    setTimeout(() => {
      el.classList.remove("celebrate");
    }, 600);
  },
  confetti(originEl) {
    const rect = originEl.getBoundingClientRect();
    const ox = rect.left + rect.width / 2;
    const oy = rect.top + rect.height / 2;
    const colors = Theme.bank.map(c => c.bg);
    for (let i = 0; i < 26; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 140;
      piece.style.left = ox + "px";
      piece.style.top = oy + "px";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty("--tx", Math.cos(angle) * dist + "px");
      piece.style.setProperty("--ty", Math.sin(angle) * dist * 0.6 + 160 + Math.random() * 120 + "px");
      piece.style.setProperty("--rot", Math.floor(Math.random() * 720) + "deg");
      piece.style.animationDuration = 800 + Math.random() * 500 + "ms";
      document.body.appendChild(piece);
      setTimeout(() => {
        piece.remove();
      }, 1600);
    }
  },
  bindUI() {
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsOverlay = document.getElementById("settingsOverlay");
    const settingsCloseBtn = document.getElementById("settingsCloseBtn");
    const settingsHomeBtn = document.getElementById("settingsHomeBtn");
    const settingsRestartBtn = document.getElementById("settingsRestartBtn");
    const homeSettingsBtn = document.getElementById("homeSettingsBtn");
    const homeSettingsOverlay = document.getElementById("homeSettingsOverlay");
    const homeSettingsCloseBtn = document.getElementById("homeSettingsCloseBtn");
    const homeSettingsBackBtn = document.getElementById("homeSettingsBackBtn");
    const aboutUsBtn = document.getElementById("aboutUsBtn");
    const aboutUsOverlay = document.getElementById("aboutUsOverlay");
    const aboutUsBackBtn = document.getElementById("aboutUsBackBtn");
    const bestScore = document.querySelector(".best-score");
    const availablePill = document.getElementById("availablePill");
    const adsBlockBtn = document.getElementById("adsBlockBtn");
    bestScore.addEventListener("click", () => {
      GameAudio.unlock();
      GameAudio.playClick();
      this.celebrateEl(bestScore);
      this.confetti(bestScore);
    });
    availablePill.addEventListener("click", () => {
      GameAudio.unlock();
      GameAudio.playClick();
      this.celebrateEl(availablePill);
    });
    if (adsBlockBtn) {
      adsBlockBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(20);
        Settings.data.adsBlocked = !Settings.data.adsBlocked;
        Settings.save();
        this.updateAdsUI();
        if (Settings.data.adsBlocked) {
          Ads.hideBanner();
        } else {
          Ads.preloadInterstitial();
          Ads.preloadRewarded();
        }
      });
    }
    settingsBtn.addEventListener("click", () => {
      GameAudio.unlock();
      GameAudio.playClick();
      setTimeout(() => {
        this.openSettings();
      }, 160);
    });
    settingsCloseBtn.addEventListener("click", () => {
      GameAudio.playClick();
      this.closeSettings();
    });
    settingsHomeBtn.addEventListener("click", () => {
      GameAudio.playClick();
      setTimeout(() => {
        this.closeSettings();
        this.showMenu();
      }, 200);
    });
    settingsRestartBtn.addEventListener("click", async () => {
      GameAudio.playClick();
      await Ads.maybeShowInterstitial(ADS.RESTART_CHANCE);
      setTimeout(() => {
        this.closeSettings();
        Game.startNewGameSequence();
      }, 200);
    });
    settingsOverlay.addEventListener("click", (event) => {
      if (event.target === settingsOverlay) {
        this.closeSettings();
      }
    });
    if (homeSettingsBtn && homeSettingsOverlay && homeSettingsCloseBtn) {
      homeSettingsBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        homeSettingsOverlay.classList.remove("hidden");
      });
      homeSettingsCloseBtn.addEventListener("click", () => {
        GameAudio.playClick();
        homeSettingsOverlay.classList.add("hidden");
      });
      if (homeSettingsBackBtn) {
        homeSettingsBackBtn.addEventListener("click", () => {
          GameAudio.playClick();
          homeSettingsOverlay.classList.add("hidden");
        });
      }
      homeSettingsOverlay.addEventListener("click", (event) => {
        if (event.target === homeSettingsOverlay) {
          GameAudio.playClick();
          homeSettingsOverlay.classList.add("hidden");
        }
      });
    }
    if (aboutUsBtn && aboutUsOverlay && homeSettingsOverlay) {
      aboutUsBtn.addEventListener("click", () => {
        GameAudio.playClick();
        homeSettingsOverlay.classList.add("hidden");
        aboutUsOverlay.classList.remove("hidden");
      });
      if (aboutUsBackBtn) {
        aboutUsBackBtn.addEventListener("click", () => {
          GameAudio.playClick();
          aboutUsOverlay.classList.add("hidden");
          homeSettingsOverlay.classList.remove("hidden");
        });
      }
      aboutUsOverlay.addEventListener("click", (event) => {
        if (event.target === aboutUsOverlay) {
          GameAudio.playClick();
          aboutUsOverlay.classList.add("hidden");
          homeSettingsOverlay.classList.remove("hidden");
        }
      });
    }
    document.querySelectorAll("input[data-setting]").forEach(input => {
      input.addEventListener("change", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(12);
        Settings.toggle(input.dataset.setting);
      });
    });
    document.querySelectorAll(".music-volume-slider").forEach(slider => {
      slider.addEventListener("input", () => {
        GameAudio.unlock();
        Settings.setMusicVolume(slider.value);
      });
      slider.addEventListener("change", () => {
        GameAudio.playClick();
      });
    });
  },
  showMenu() {
    document.getElementById("menuScreen").classList.add("active");
    document.getElementById("gameScreen").classList.remove("active");
    Game.stop();
    Ads.hideBanner();
    RateUs.maybeShowOnMenu();
    VisualTheme.setDepthActive(false);
  },
  showGame() {
    if (!Game.runActive) {
      Theme.useMenuColor();
    }
    document.getElementById("menuScreen").classList.remove("active");
    document.getElementById("gameScreen").classList.add("active");
    Game.start();
    Ads.showBanner();
    VisualTheme.setDepthActive(true);
  },
  openSettings() {
    Game.pause();
    document.getElementById("settingsOverlay").classList.remove("hidden");
  },
  closeSettings() {
    document.getElementById("settingsOverlay").classList.add("hidden");
    Game.resume();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
