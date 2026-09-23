/*
  ui/menu-entrance.js
  --------------------------------------------------------------------
  Animation d'entrée individuelle pour chaque élément visible de l'écran
  d'accueil (logo, bouton pub, cartes Classic/Adventure, bannière basse,
  réglages, thèmes), rejouée à chaque arrivée sur le menu — démarrage de
  l'app ET retour depuis une partie (App.showMenu(), appelé aussi bien
  par bootLoad() que par goToMenu()). Miroir exact de ui/game-entrance.js :
  chaque élément a sa propre classe/timing CSS (css/menu.css), ce module
  se contente de les (re)déclencher via le classique remove/reflow/add
  déjà utilisé partout ailleurs dans le projet.
  --------------------------------------------------------------------
*/
export const MenuEntranceFX = {
  TARGETS: [
    { selector: ".menu-hero", cls: "enter-menu-logo" },
    { selector: ".top-stats-row", cls: "enter-menu-ads" },
    { selector: "#classicModeBtn", cls: "enter-menu-classic" },
    { selector: "#adventureModeBtn", cls: "enter-menu-adventure" },
    { selector: ".menu-bottom-bar", cls: "enter-menu-bar" },
    { selector: "#homeSettingsBtn", cls: "enter-menu-settings" },
    { selector: "#trophyBtn", cls: "enter-menu-trophy" },
    { selector: "#marketplaceBtn", cls: "enter-menu-marketplace" },
    { selector: "#themeBtn", cls: "enter-menu-theme" }
  ],

  play() {
    this.TARGETS.forEach(({ selector, cls }) => {
      const el = document.querySelector(selector);
      if (!el) return;

      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    });
  }
};
