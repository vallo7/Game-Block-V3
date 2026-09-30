/*
  ui/marketplace.js
  --------------------------------------------------------------------
  Écran "Marketplace" — même tiroir que Trophies/Themes. Monétisation V2 :
  plus aucun achat intégré ni bouton "Remove Ads", la publicité de plein
  gré est le moteur. Deux sections, dans cet ordre :

  1. Recharge Coins — section HERO, en premier et en plus grand :
     - 3 offres "regarde N pubs, gagne X Coins" tirées parmi 10
       (services/adoffers.js), du moins au plus exigeant en pubs ;
     - un bouton d'actualisation (le 1er est gratuit, les suivants
       coûtent 1 pub ; le compteur repart à zéro à chaque démarrage de
       l'app) ; quand les 3 offres sont récupérées, la liste se
       renouvelle toute seule ;
     - la roue de la chance juste en dessous (ui/wheel.js) : 1 tour
       gratuit toutes les 4 h, les suivants coûtent 1 pub.
  2. Cosmétiques — vitrine en grandes cartes pour les thèmes achetables
     en Coins (Halloween, Inferno) + emplacements "Coming soon".
     Les Coins se dépensent toujours ici, via une pop-up de confirmation
     (showPurchaseConfirm) avant de débiter quoi que ce soit.

  Les offres et la roue ne déclenchent PAS la roue de la chance en
  pop-up (elle est déjà sous les yeux du joueur dans cette page) : seuls
  les gains de trophées/quêtes/parties le font (cf. ui/trophies.js,
  ui/quests.js, core/game-flow.js).

  Le tiroir fige le jeu pendant la visite ; il refuse de se fermer
  pendant qu'un tour de roue ou une pub est en cours (évite une annonce
  de gain qui apparaîtrait par-dessus l'écran suivant).
  --------------------------------------------------------------------
*/
import { Economy } from "../services/economy.js";
import { VisualTheme } from "../services/visualtheme.js";
import { I18n } from "../services/i18n.js";
import { Ads } from "../services/ads.js";
import { AdOffers } from "../services/adoffers.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Achievements } from "../services/achievements.js";
import { Game } from "../core/game-state.js";
import { LuckyWheel } from "./wheel.js";
import { spawnCoinBurst, bumpCoinCounters } from "./fx.js";

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7Z"></path></svg>';

const REFRESH_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M20 12a8 8 0 1 1-2.34-5.66"></path><path d="M20 4v5h-5"></path></svg>';

const CHECK_ICON_SVG = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="m5 13 4 4L19 7"></path></svg>';

function playEntrance(host) {
  host.querySelectorAll(".market-pop").forEach((el, index) => {
    el.classList.remove("enter");
    void el.offsetWidth;
    el.style.animationDelay = `${Math.min(index * 45, 360)}ms`;
    el.classList.add("enter");
  });
}

// Pop-up générique de confirmation d'achat (5e passe, demande explicite).
// `iconHtml` est déjà un <svg>/markup complet (icône de pièce ou icône de
// l'article). `onConfirm` n'est appelé QUE si le joueur tape "Buy".
function showPurchaseConfirm({ iconHtml, title, desc, priceLabel, confirmLabel, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "market-confirm-overlay";
  overlay.innerHTML = `
    <div class="market-confirm-card">
      <div class="market-confirm-icon">${iconHtml}</div>
      <p class="market-confirm-title">${title}</p>
      <p class="market-confirm-desc">${desc}</p>
      <div class="market-confirm-price">${priceLabel}</div>
      <div class="market-confirm-actions">
        <button type="button" class="market-confirm-cancel">${I18n.t("common.cancel")}</button>
        <button type="button" class="market-confirm-buy">${confirmLabel || I18n.t("common.buy")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const close = () => {
    overlay.classList.remove("show");
    overlay.classList.add("out");
    setTimeout(() => overlay.remove(), 220);
  };

  overlay.querySelector(".market-confirm-cancel").addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    GameAudio.playClick();
    close();
  });

  overlay.querySelector(".market-confirm-buy").addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    onConfirm();
    close();
  });

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) close();
  });
}

export const Marketplace = {
  _wheelCtl: null,
  _busy: false,
  _autoTimer: null,
  _justRefreshed: false,

  init() {
    const backBtn = document.getElementById("marketplaceBackBtn");

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => this.closePage(), 140);
      });
    }

    AdOffers.init();

    Economy.onChange(() => this.updateCoinHeader());
    I18n.onChange(() => this.render());
    this.updateCoinHeader();
  },

  openPage() {
    // Une liste entièrement récupérée pendant que la page était fermée
    // (renouvellement automatique différé) est renouvelée à l'ouverture.
    if (AdOffers.allClaimed()) AdOffers.refresh({ auto: true });

    this.render();
    this.updateCoinHeader();

    // Le compteur de Coins ouvre la Marketplace depuis 3 endroits
    // (accueil, écran de jeu, panneau de défaite — roadmap Phase 5) : on
    // retient quel écran était actif pour y revenir exactement au bon
    // endroit à la fermeture, au lieu de renvoyer systématiquement au
    // menu.
    const activeScreen = document.querySelector("#menuScreen.active") || document.querySelector("#gameScreen.active");
    this._returnScreenId = activeScreen ? activeScreen.id : "menuScreen";

    if (activeScreen) {
      activeScreen.classList.add("behind-sheet");
      activeScreen.classList.remove("active");
    }

    // Gèle le jeu pendant la visite (même geste que la pause du menu
    // réglages, App.openSettings) ; si le panneau de défaite est ouvert,
    // son décompte tourne sur son propre setInterval — indépendant du
    // rendu — donc il faut l'arrêter explicitement pour ne pas relancer
    // une partie tout seul pendant que le joueur fait ses achats.
    Game.pause();
    const gameOverOverlay = document.getElementById("gameOverOverlay");
    if (gameOverOverlay && !gameOverOverlay.classList.contains("hidden")) {
      Game.stopCountdown();
    }

    document.getElementById("marketplaceScreen").classList.add("active");
  },

  closePage() {
    // Pas de fermeture en plein tour de roue / pendant une pub : l'annonce
    // du gain apparaîtrait sinon par-dessus l'écran suivant.
    if (this._busy || (this._wheelCtl && this._wheelCtl.isBusy())) return;

    document.getElementById("marketplaceScreen").classList.remove("active");

    const returnScreen = document.getElementById(this._returnScreenId || "menuScreen");
    if (returnScreen) {
      returnScreen.classList.add("active");
      returnScreen.classList.remove("behind-sheet");
    }

    const stray = document.querySelector(".market-confirm-overlay");
    if (stray) stray.remove();

    if (this._wheelCtl) {
      this._wheelCtl.destroy();
      this._wheelCtl = null;
    }

    Game.resume();
  },

  updateCoinHeader() {
    const el = document.getElementById("marketplaceCoinValue");
    if (el) el.textContent = Economy.balance;
  },

  // ---------- Section HERO : Recharge Coins ----------
  buildOfferCard(offer) {
    const tier = AdOffers.getTier(offer);
    const claimed = AdOffers.isClaimed(offer.id);

    const card = document.createElement("div");
    card.className = `market-offer-card market-pop tier-${tier}${claimed ? " is-claimed" : ""}`;

    if (AdOffers.isBestDeal(offer) && !claimed) {
      const badge = document.createElement("span");
      badge.className = "market-offer-badge";
      badge.textContent = I18n.t("market.offers.bestDeal");
      card.appendChild(badge);
    }

    const coin = document.createElement("div");
    coin.className = "market-offer-coin";
    coin.innerHTML = COIN_ICON_SVG;
    card.appendChild(coin);

    const copy = document.createElement("div");
    copy.className = "market-offer-copy";

    const amount = document.createElement("p");
    amount.className = "market-offer-amount";
    amount.textContent = I18n.t("market.offers.amount", { coins: offer.coins.toLocaleString() });

    const need = document.createElement("p");
    need.className = "market-offer-need";

    let pips = '<span class="market-offer-pips">';
    for (let i = 0; i < offer.ads; i++) pips += `<span class="market-offer-pip">${PLAY_ICON_SVG}</span>`;
    pips += "</span>";

    need.innerHTML = pips + `<span>${I18n.t("market.offers.need", { n: offer.ads, s: offer.ads > 1 ? "s" : "" })}</span>`;

    copy.appendChild(amount);
    copy.appendChild(need);
    card.appendChild(copy);

    if (claimed) {
      const done = document.createElement("div");
      done.className = "market-offer-done";
      done.innerHTML = CHECK_ICON_SVG + `<span>${I18n.t("market.offers.claimed")}</span>`;
      card.appendChild(done);
      return card;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "market-offer-btn";
    btn.innerHTML = PLAY_ICON_SVG + `<span>${I18n.t("market.offers.button")}</span>` + (offer.ads > 1 ? `<em>×${offer.ads}</em>` : "");
    btn.addEventListener("click", () => this.claimOffer(offer, btn));
    card.appendChild(btn);

    return card;
  },

  claimOffer(offer, btn) {
    if (this._busy || AdOffers.isClaimed(offer.id)) return;

    GameAudio.playClick();

    if (!Ads.isOnline()) {
      Ads.showOfflineMessage();
      return;
    }

    this._busy = true;

    Ads.showRewarded(() => {
      this._busy = false;

      const coins = AdOffers.claim(offer.id);

      if (coins > 0) {
        GameAudio.playCoinClaim();
        Haptics.vibrate([20, 40, 20]);
        spawnCoinBurst(btn, 14);
        bumpCoinCounters();
      }

      this.render();

      if (AdOffers.allClaimed()) this.scheduleAutoRefresh();
    }, { count: offer.ads }).then((started) => {
      if (!started) this._busy = false;
    });
  },

  // Les 3 offres ont été récupérées : la liste se renouvelle d'elle-même
  // après un court instant (le temps de voir la dernière coche).
  scheduleAutoRefresh() {
    clearTimeout(this._autoTimer);

    this._autoTimer = setTimeout(() => {
      if (!AdOffers.allClaimed()) return;

      AdOffers.refresh({ auto: true });
      this._justRefreshed = true;
      this.render();

      GameAudio.playThemeChange();
      Haptics.vibrate([15, 30, 15]);
      Ads.showToast(I18n.t("market.offers.newOffers"), 2000);
    }, 1200);
  },

  refreshOffers() {
    if (this._busy) return;

    GameAudio.playClick();

    const done = (free) => {
      AdOffers.refresh({ free });
      this._justRefreshed = true;
      Haptics.vibrate([15, 30, 15]);
      this.render();
    };

    if (AdOffers.freeRefreshAvailable()) {
      done(true);
      return;
    }

    if (!Ads.isOnline()) {
      Ads.showOfflineMessage();
      return;
    }

    this._busy = true;

    Ads.showRewarded(() => {
      this._busy = false;
      done(false);
    }, { count: 1 }).then((started) => {
      if (!started) this._busy = false;
    });
  },

  buildRefreshButton() {
    const free = AdOffers.freeRefreshAvailable();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "market-refresh-btn" + (free ? " is-free" : " is-ad") + (this._justRefreshed ? " just-refreshed" : "");
    btn.innerHTML =
      `<span class="market-refresh-icon">${REFRESH_ICON_SVG}</span>` +
      `<span class="market-refresh-label">${I18n.t("market.offers.refresh")}</span>` +
      (free
        ? `<span class="market-refresh-tag">${I18n.t("market.offers.refreshFree")}</span>`
        : `<span class="market-refresh-tag">${PLAY_ICON_SVG}${I18n.t("boost.adTag")}</span>`);

    btn.addEventListener("click", () => this.refreshOffers());

    return btn;
  },

  buildCoinsSection(keepWheel) {
    const section = document.createElement("div");
    section.className = "market-section";

    const header = document.createElement("div");
    header.className = "market-hero-header";

    const icon = document.createElement("div");
    icon.className = "market-hero-icon";
    icon.innerHTML = COIN_ICON_SVG;
    header.appendChild(icon);

    const title = document.createElement("p");
    title.className = "market-hero-title";
    title.textContent = I18n.t("market.coins.title");
    header.appendChild(title);

    header.appendChild(this.buildRefreshButton());
    section.appendChild(header);

    const sub = document.createElement("p");
    sub.className = "market-hero-sub";
    sub.textContent = I18n.t("market.coins.sub");
    section.appendChild(sub);

    const list = document.createElement("div");
    list.className = "market-offer-list";
    AdOffers.current().forEach(offer => list.appendChild(this.buildOfferCard(offer)));
    section.appendChild(list);

    // Roue de la chance sous la liste des offres. Pendant un tour en
    // cours, on réutilise le même noeud (le re-rendu de la page ne doit
    // jamais interrompre l'animation).
    if (keepWheel && this._wheelCtl) {
      this._wheelCtl.el.classList.remove("market-pop");
    } else {
      if (this._wheelCtl) this._wheelCtl.destroy();
      this._wheelCtl = LuckyWheel.mountShopCard({ onChange: () => this.render() });
    }
    section.appendChild(this._wheelCtl.el);

    return section;
  },

  // ---------- Section Cosmétiques : vitrine des thèmes (5e passe,
  // redesign) ----------
  // Grande carte "affiche" par thème achetable en Coins — remplace
  // l'ancienne tuile 2 colonnes, bien plus discrète. Le fond réel du
  // thème sert d'image principale, avec son nom en surimpression.
  buildThemeShowcaseCard(themeId) {
    const theme = VisualTheme.getById(themeId);
    const info = VisualTheme.UNLOCKS[themeId];
    if (!theme || !info || info.type !== "coins") return null;

    const owned = VisualTheme.isThemeAvailable(theme);
    const themeName = I18n.t(`theme.${themeId}.name`);

    const card = document.createElement("div");
    card.className = "market-theme-card market-pop";

    const preview = document.createElement("div");
    preview.className = "market-theme-preview";
    preview.style.backgroundImage = `url("${theme.thumb}")`;

    const badge = document.createElement("span");
    badge.className = `market-theme-badge ${owned ? "is-owned" : "is-price"}`;
    badge.innerHTML = owned ? I18n.t("common.owned") : `${COIN_ICON_SVG}<span>${info.price}</span>`;
    preview.appendChild(badge);

    const scrim = document.createElement("div");
    scrim.className = "market-theme-scrim";
    scrim.innerHTML =
      `<p class="market-theme-name">${themeName}</p>` +
      `<p class="market-theme-tagline">${I18n.t(`theme.${themeId}.tagline`)}</p>`;
    preview.appendChild(scrim);

    card.appendChild(preview);

    const btn = document.createElement("button");
    btn.className = "market-theme-action" + (owned ? " is-owned" : "");

    if (owned) {
      btn.textContent = I18n.t("market.theme.equipped");
    } else {
      btn.innerHTML = COIN_ICON_SVG + `<span>${I18n.t("market.theme.unlock", { price: info.price })}</span>`;
      btn.addEventListener("click", () => {
        GameAudio.playClick();

        if (!Economy.canAfford(info.price)) {
          Economy.showInsufficientToast();
          Haptics.vibrate(30);
          return;
        }

        showPurchaseConfirm({
          iconHtml: COIN_ICON_SVG,
          title: I18n.t("market.theme.confirmTitle", { theme: themeName }),
          desc: I18n.t("market.theme.confirmDesc", { theme: themeName }),
          priceLabel: I18n.t("theme.unlockPrice", { price: info.price }),
          onConfirm: () => {
            if (VisualTheme.purchaseTheme(themeId)) {
              Haptics.vibrate([20, 40, 20, 40, 60]);
              VisualTheme.playChangeFlash(theme);
              GameAudio.playThemeChange();
              spawnCoinBurst(btn);
              Achievements.checkThemeCollection();
              this.render();
            }
          }
        });
      });
    }

    card.appendChild(btn);

    return card;
  },

  buildComingSoonCard(label) {
    const card = document.createElement("div");
    card.className = "market-item-card market-pop";

    const preview = document.createElement("div");
    preview.className = "market-item-preview is-placeholder";
    preview.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 3v18M3 12h18"></path></svg>';

    const soon = document.createElement("div");
    soon.className = "market-item-soon-badge";
    soon.textContent = I18n.t("common.comingSoon");
    preview.appendChild(soon);
    card.appendChild(preview);

    const body = document.createElement("div");
    body.className = "market-item-body";

    const name = document.createElement("p");
    name.className = "market-item-name";
    name.textContent = label;

    const desc = document.createElement("p");
    desc.className = "market-item-desc";
    desc.textContent = I18n.t("market.cosmetics.comingSoonDesc");

    body.appendChild(name);
    body.appendChild(desc);
    card.appendChild(body);

    const btn = document.createElement("button");
    btn.className = "market-item-action is-disabled";
    btn.textContent = I18n.t("common.comingSoon");
    card.appendChild(btn);

    return card;
  },

  buildCosmeticsSection() {
    const section = document.createElement("div");
    section.className = "market-section";

    const title = document.createElement("p");
    title.className = "market-section-title";
    title.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 3 2 9l10 6 10-6-10-6Z"></path><path d="M2 15l10 6 10-6"></path></svg> ' + I18n.t("market.cosmetics.title");
    section.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "market-section-sub";
    sub.textContent = I18n.t("market.cosmetics.sub");
    section.appendChild(sub);

    const showcase = document.createElement("div");
    showcase.className = "market-theme-showcase";

    Object.keys(VisualTheme.UNLOCKS)
      .filter(id => VisualTheme.UNLOCKS[id].type === "coins")
      .forEach(id => {
        const card = this.buildThemeShowcaseCard(id);
        if (card) showcase.appendChild(card);
      });

    section.appendChild(showcase);

    const grid = document.createElement("div");
    grid.className = "market-grid";
    grid.appendChild(this.buildComingSoonCard(I18n.t("market.cosmetics.blockSkins")));
    grid.appendChild(this.buildComingSoonCard(I18n.t("market.cosmetics.newEnvironments")));
    section.appendChild(grid);

    return section;
  },

  render() {
    const host = document.getElementById("marketplaceContent");
    if (!host) return;

    const scrollTop = host.scrollTop;
    const keepWheel = Boolean(this._wheelCtl && this._wheelCtl.isBusy());

    host.innerHTML = "";
    host.appendChild(this.buildCoinsSection(keepWheel));
    host.appendChild(this.buildCosmeticsSection());

    host.scrollTop = scrollTop;
    playEntrance(host);

    this._justRefreshed = false;
  }
};
