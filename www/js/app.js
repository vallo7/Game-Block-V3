/*
  app.js
  --------------------------------------------------------------------
  Point d'entrée de l'application. Orchestration au démarrage +
  navigation entre écrans + réglages.

  Le démarrage passe maintenant par un véritable écran de chargement
  (ui/loading.js) qui attend le chargement réel des assets du jeu
  (blocs, grilles, fonds de thème, cadre du bouton meilleur score)
  avant de révéler le menu — le jeu est donc déjà chargé quand le
  joueur arrive dessus, et le tutoriel (première ouverture) est prêt à
  démarrer immédiatement. L'entrée en partie (goToGame) et le retour au
  menu (goToMenu) réutilisent le même écran de chargement pour masquer
  la bascule de fond d'écran (menu ↔ jeu) et donner une transition
  délibérée plutôt qu'un cut brutal.

  Round de design (transitions) : la bascule d'écran (showMenu/
  showGame) est maintenant passée à LoadingScreen.run() via
  onBeforeReveal plutôt qu'appelée après coup — elle s'exécute donc
  pendant que le rideau de chargement est encore 100% opaque, jamais
  pendant que celui-ci se retire (voir ui/loading.js). Les transitions
  en jeu (goToGame/goToMenu) durent au moins 2 secondes (minDuration) ;
  le tout premier chargement au démarrage (bootLoad) est plus court
  (900ms) car il n'a pas le même enjeu de "reveal" qu'une transition en
  jeu — juste éviter un flash si tout est déjà en cache.
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
import { ADS, COINS } from "./config/gameConfig.js";
import { LoadingScreen } from "./ui/loading.js";
import { GameEntranceFX } from "./ui/game-entrance.js";
import { MenuEntranceFX } from "./ui/menu-entrance.js";
import { Environments } from "./services/environment.js";
import { Economy } from "./services/economy.js";
import { Achievements } from "./services/achievements.js";
import { Trophies } from "./ui/trophies.js";
import { Marketplace } from "./ui/marketplace.js";

export const App = {
  lastBackPress: 0,
  _transitioning: false,

  async init() {
    LoadingScreen.init();

    Theme.init();
    Settings.load();
    Economy.init();
    Achievements.init();
    Game.init();
    Menu.init();
    Tutorial.init();
    Ads.init();
    RateUs.init();
    VisualTheme.init();
    Trophies.init();
    Marketplace.init();
    this.bindUI();
    this.bindBackButton();
    this.bindButtonPop();
    this.bindVisibility();
    this.bindEconomyUI();
    this.updateFreshBoardPrice();

    await this.bootLoad();

    // Petit délai pour laisser le menu se stabiliser visuellement avant
    // d'enclencher le tutoriel — remplace l'ancien minuteur fixe de
    // Tutorial (SPLASH_DELAY), qui devinait quand l'ex-splash aurait
    // fini de disparaître au lieu de le savoir réellement.
    setTimeout(() => Tutorial.beginIfNeeded(), 250);

    document.addEventListener("pointerdown", () => {
      GameAudio.unlock();
    }, { once: true });
  },

  // Liste de tout ce qu'il faut avoir en cache pour que le jeu soit
  // "déjà chargé" dès l'arrivée sur le menu : blocs, grilles de tous
  // les environnements, fonds (menu + jeu) et miniatures de tous les
  // thèmes, cadres du bouton meilleur score. Les objets Image déjà
  // créés par Game.init() sont réutilisés tels quels (pas de double
  // requête réseau).
  bootAssetList() {
    const items = [];

    items.push("img/logo-gameblock.png");
    items.push("img/tutorial-hand.png");

    Object.values(Game.blockImages || {}).forEach(img => items.push(img));
    Object.values(Game.gridImages || {}).forEach(img => items.push(img));

    VisualTheme.LIST.forEach(theme => {
      items.push(theme.bg);
      items.push(theme.thumb);
      if (theme.gameBg) items.push(theme.gameBg);
    });

    Object.values(Environments).forEach(env => {
      items.push(env.assets.bestScoreFrame);
    });

    return items;
  },

  // Durée plancher réduite pour CE chargement précis (démarrage de
  // l'app) : contrairement aux transitions en jeu (menu ↔ partie, où
  // les 2s pleines évitent tout flash de l'ancien écran), un premier
  // lancement n'a aucun "reveal" à mettre en scène — le joueur attend
  // juste d'arriver dans l'app. 900ms garde un minimum de tenue
  // visuelle (pas de flash si tout est déjà en cache) sans ajouter
  // d'attente inutile au démarrage.
  async bootLoad() {
    await LoadingScreen.run(this.bootAssetList(), {
      minDuration: 900,
      timeout: 8000,
      onBeforeReveal: () => this.showMenu()
    });
    MenuEntranceFX.play();
  },

  async goToGame() {
    if (this._transitioning) return;
    this._transitioning = true;

    try {
      const theme = VisualTheme.current;
      const assets = theme ? [theme.gameBg || theme.bg] : [];
      await LoadingScreen.run(assets, {
        minDuration: 2000,
        timeout: 5000,
        onBeforeReveal: () => this.showGame()
      });
      GameEntranceFX.play();
    } finally {
      this._transitioning = false;
    }
  },

  async goToMenu() {
    if (this._transitioning) return;
    this._transitioning = true;

    try {
      const theme = VisualTheme.current;
      const assets = theme ? [theme.bg] : [];
      await LoadingScreen.run(assets, {
        minDuration: 2000,
        timeout: 5000,
        onBeforeReveal: () => this.showMenu()
      });
      MenuEntranceFX.play();
    } finally {
      this._transitioning = false;
    }
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
    if (LoadingScreen.isVisible()) {
      Haptics.vibrate(10);
      return;
    }
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
      this.goToMenu();
      return;
    }
    if (gameScreen.classList.contains("active")) {
      GameAudio.playClick();
      this.goToMenu();
      return;
    }
    const themeScreen = document.getElementById("themeScreen");
    if (themeScreen && themeScreen.classList.contains("active")) {
      GameAudio.playClick();
      VisualTheme.closePage();
      return;
    }
    const trophyScreen = document.getElementById("trophyScreen");
    if (trophyScreen && trophyScreen.classList.contains("active")) {
      GameAudio.playClick();
      Trophies.closePage();
      return;
    }
    const marketplaceScreen = document.getElementById("marketplaceScreen");
    if (marketplaceScreen && marketplaceScreen.classList.contains("active")) {
      GameAudio.playClick();
      Marketplace.closePage();
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
  // ---------- Phase 5 (Coins, Trophées, Marketplace) ----------
  bindEconomyUI() {
    const coinBtn = document.getElementById("coinCounterBtn");
    const trophyBtn = document.getElementById("trophyBtn");
    const marketplaceBtn = document.getElementById("marketplaceBtn");

    if (coinBtn) {
      coinBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => Marketplace.openPage(), 160);
      });
    }

    if (trophyBtn) {
      trophyBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => Trophies.openPage(), 160);
      });
    }

    if (marketplaceBtn) {
      marketplaceBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => Marketplace.openPage(), 160);
      });
    }

    this.updateCoinCounter(Economy.balance);

    Economy.onChange((balance) => {
      this.updateCoinCounter(balance);
      this.updateFreshBoardPrice();
    });
  },

  updateCoinCounter(balance) {
    const el = document.getElementById("coinCounterValue");
    if (!el) return;

    el.textContent = balance;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  },

  // Prix de FRESH START (roadmap Phase 5) : affiché une seule fois à
  // l'init depuis la config (source de vérité unique), puis l'état
  // "insuffisant" de la carte est rafraîchi à chaque variation du
  // solde — sans effet visible tant que le panneau Game Over n'est pas
  // ouvert, mais toujours à jour au moment où il s'ouvre.
  updateFreshBoardPrice() {
    const valueEl = document.getElementById("freshBoardPriceValue");
    if (valueEl) valueEl.textContent = COINS.FRESH_START_COST;

    const card = document.getElementById("freshBoardBtn");
    if (card) {
      card.classList.toggle("is-unaffordable", !Economy.canAfford(COINS.FRESH_START_COST));
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
  // Confettis retirés de l'écran de jeu (demande explicite, même
  // logique que Game.spawnParticles côté canvas — voir
  // core/game-render.js) : no-op plutôt que de toucher à l'appel dans
  // bindUI() (tap sur le meilleur score), qui continue d'appeler
  // this.confetti(bestScore) sans effet.
  confetti() {},
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
        this.goToMenu();
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
    VisualTheme.applyBackground("menu");
    VisualTheme.setDepthActive(false);
  },
  showGame() {
    if (!Game.runActive) {
      Theme.useMenuColor();
    }
    document.getElementById("menuScreen").classList.remove("active");
    document.getElementById("gameScreen").classList.add("active");
    VisualTheme.applyBackground("game");
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
