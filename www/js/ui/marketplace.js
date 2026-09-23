/*
  ui/marketplace.js
  --------------------------------------------------------------------
  Écran "Marketplace" (roadmap Phase 5, 2e passe — redesign) — même
  tiroir que Trophies/Themes. Quatre sections, dans cet ordre (demande
  explicite "mets en avant la section achat") :

  1. Recharge Coins — section HERO, en premier et en plus grand. Aucun
     plugin d'achat in-app installé dans le projet pour l'instant (voir
     config/gameConfig.js) — ces packs créditent directement le solde au
     tap, comme les IDs AdMob de test créditent une pub "gratuite"
     pendant le développement.
  2. Cosmétiques — thèmes achetables en Coins (Inferno) + emplacements
     "Coming soon" pour rester visuellement riche.
  3. Watch Ads for Coins (nouveau, 2e passe) — pub récompensée
     (Ads.showRewarded, même circuit que Second Wind) plafonnée par jour
     (Economy.adRewardsRemaining/claimAdReward) : sans ce plafond, une
     source illimitée et gratuite annulerait la rareté voulue de
     l'économie (config/gameConfig.js#COINS).
  4. Retirer les publicités — déplacé depuis l'accueil, volontairement
     le plus discret des quatre.
  --------------------------------------------------------------------
*/
import { Economy } from "../services/economy.js";
import { VisualTheme } from "../services/visualtheme.js";
import { Settings } from "../services/settings.js";
import { Ads } from "../services/ads.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Achievements } from "../services/achievements.js";
import { Game } from "../core/game-state.js";
import { MARKETPLACE, COINS } from "../config/gameConfig.js";

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

const PACK_TIER_CLASS = {
  "pack-handful": "",
  "pack-pouch": "tier-pouch",
  "pack-chest": "tier-chest",
  "pack-vault": "tier-vault"
};

function bump(el) {
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

// Éclat de pièces (round "juicy") : quelques points dorés qui jaillissent
// du bouton cliqué et retombent en s'effaçant — purement décoratif, pur
// CSS/DOM (pas de canvas), auto-nettoyé après l'animation.
function spawnCoinBurst(anchorEl) {
  if (!anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 9;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement("div");
    spark.className = "coin-spark";

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 46 + Math.random() * 34;

    spark.style.left = `${cx - 5}px`;
    spark.style.top = `${cy - 5}px`;
    spark.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--sy", `${Math.sin(angle) * dist - 20}px`);

    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 700);
  }
}

function playEntrance(host) {
  host.querySelectorAll(".market-pop").forEach((el, index) => {
    el.classList.remove("enter");
    void el.offsetWidth;
    el.style.animationDelay = `${Math.min(index * 45, 360)}ms`;
    el.classList.add("enter");
  });
}

export const Marketplace = {
  init() {
    const backBtn = document.getElementById("marketplaceBackBtn");

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => this.closePage(), 140);
      });
    }

    Economy.onChange(() => this.updateCoinHeader());
    this.updateCoinHeader();
  },

  openPage() {
    this.render();
    this.updateCoinHeader();

    // Le compteur de Coins ouvre la Marketplace depuis 3 endroits
    // (accueil, écran de jeu, panneau de défaite — roadmap Phase 5 2e
    // passe) : on retient quel écran était actif pour y revenir
    // exactement au bon endroit à la fermeture, au lieu de renvoyer
    // systématiquement au menu.
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
    document.getElementById("marketplaceScreen").classList.remove("active");

    const returnScreen = document.getElementById(this._returnScreenId || "menuScreen");
    if (returnScreen) {
      returnScreen.classList.add("active");
      returnScreen.classList.remove("behind-sheet");
    }

    Game.resume();
  },

  updateCoinHeader() {
    const el = document.getElementById("marketplaceCoinValue");
    if (el) el.textContent = Economy.balance;
  },

  // ---------- Section HERO : Recharger la monnaie ----------
  buildCoinPackCard(pack) {
    const btn = document.createElement("button");
    btn.className = `market-coin-card market-pop ${PACK_TIER_CLASS[pack.id] || ""}`.trim();

    if (pack.badge) {
      const shine = document.createElement("span");
      shine.className = "market-coin-card-shine";
      shine.setAttribute("aria-hidden", "true");
      btn.appendChild(shine);
    }

    if (pack.badge) {
      const ribbon = document.createElement("span");
      ribbon.className = "market-coin-ribbon";
      ribbon.textContent = pack.badge;
      btn.appendChild(ribbon);
    }

    const iconWrap = document.createElement("div");
    iconWrap.className = "market-coin-icon-wrap";
    iconWrap.innerHTML = COIN_ICON_SVG;
    btn.appendChild(iconWrap);

    const amount = document.createElement("p");
    amount.className = "market-coin-amount";
    amount.textContent = `${pack.coins.toLocaleString()} Coins`;
    btn.appendChild(amount);

    if (pack.bonus) {
      const bonus = document.createElement("span");
      bonus.className = "market-coin-bonus";
      bonus.textContent = `+${pack.bonus}% bonus`;
      btn.appendChild(bonus);
    }

    const price = document.createElement("span");
    price.className = "market-coin-price";
    price.textContent = pack.priceLabel;
    btn.appendChild(price);

    btn.addEventListener("click", () => {
      GameAudio.playClick();
      Haptics.vibrate([15, 30, 20]);

      const total = Math.round(pack.coins * (1 + pack.bonus / 100));
      Economy.earn(total, `pack:${pack.id}`);

      spawnCoinBurst(btn);
      bump(document.getElementById("marketplaceCoinValue"));
      bump(document.getElementById("coinCounterValue"));
      bump(document.getElementById("gameCoinCounterValue"));
    });

    return btn;
  },

  buildCoinsSection() {
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
    title.textContent = "Recharge Coins";
    header.appendChild(title);

    section.appendChild(header);

    const sub = document.createElement("p");
    sub.className = "market-hero-sub";
    sub.textContent = "Payments aren't connected yet during testing — packs credit your balance directly for now.";
    section.appendChild(sub);

    const list = document.createElement("div");
    list.className = "market-coin-list";

    MARKETPLACE.COIN_PACKS.forEach(pack => {
      list.appendChild(this.buildCoinPackCard(pack));
    });

    section.appendChild(list);

    return section;
  },

  // ---------- Section Cosmétiques ----------
  buildThemeCard(themeId) {
    const theme = VisualTheme.getById(themeId);
    const info = VisualTheme.UNLOCKS[themeId];
    if (!theme || !info || info.type !== "coins") return null;

    const owned = VisualTheme.isThemeAvailable(theme);

    const card = document.createElement("div");
    card.className = "market-item-card market-pop";

    const preview = document.createElement("div");
    preview.className = "market-item-preview";
    preview.style.backgroundImage = `url("${theme.thumb}")`;
    card.appendChild(preview);

    if (owned) {
      const badge = document.createElement("span");
      badge.className = "market-item-owned-badge";
      badge.textContent = "Owned";
      preview.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "market-item-body";

    const name = document.createElement("p");
    name.className = "market-item-name";
    name.textContent = theme.name;

    const desc = document.createElement("p");
    desc.className = "market-item-desc";
    desc.textContent = `Unlock the ${theme.name} background, decor and grid color for your games.`;

    body.appendChild(name);
    body.appendChild(desc);
    card.appendChild(body);

    const btn = document.createElement("button");
    btn.className = "market-item-action" + (owned ? " is-owned" : "");

    if (owned) {
      btn.textContent = "Equipped in Themes";
    } else {
      btn.innerHTML = COIN_ICON_SVG + `<span>${info.price}</span>`;
      btn.addEventListener("click", () => {
        GameAudio.playClick();

        if (!Economy.canAfford(info.price)) {
          Economy.showInsufficientToast();
          Haptics.vibrate(30);
          return;
        }

        if (VisualTheme.purchaseTheme(themeId)) {
          Haptics.vibrate([20, 40, 20, 40, 60]);
          VisualTheme.playChangeFlash();
          spawnCoinBurst(btn);
          Achievements.checkThemeCollection();
          this.render();
        }
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
    soon.textContent = "Coming soon";
    preview.appendChild(soon);
    card.appendChild(preview);

    const body = document.createElement("div");
    body.className = "market-item-body";

    const name = document.createElement("p");
    name.className = "market-item-name";
    name.textContent = label;

    const desc = document.createElement("p");
    desc.className = "market-item-desc";
    desc.textContent = "More cosmetics are on the way.";

    body.appendChild(name);
    body.appendChild(desc);
    card.appendChild(body);

    const btn = document.createElement("button");
    btn.className = "market-item-action is-disabled";
    btn.textContent = "Coming soon";
    card.appendChild(btn);

    return card;
  },

  buildCosmeticsSection() {
    const section = document.createElement("div");
    section.className = "market-section";

    const title = document.createElement("p");
    title.className = "market-section-title";
    title.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 3 2 9l10 6 10-6-10-6Z"></path><path d="M2 15l10 6 10-6"></path></svg> Cosmetics';
    section.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "market-section-sub";
    sub.textContent = "Backgrounds, decor and grid styles for your games.";
    section.appendChild(sub);

    const grid = document.createElement("div");
    grid.className = "market-grid";

    Object.keys(VisualTheme.UNLOCKS)
      .filter(id => VisualTheme.UNLOCKS[id].type === "coins")
      .forEach(id => {
        const card = this.buildThemeCard(id);
        if (card) grid.appendChild(card);
      });

    grid.appendChild(this.buildComingSoonCard("Block Skins"));
    grid.appendChild(this.buildComingSoonCard("New Environments"));

    section.appendChild(grid);

    return section;
  },

  // ---------- Section Watch Ads for Coins (nouveau, 2e passe) ----------
  buildWatchAdsSection() {
    const section = document.createElement("div");
    section.className = "market-section";

    const title = document.createElement("p");
    title.className = "market-section-title";
    title.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7Z"></path></svg> Watch Ads for Coins';
    section.appendChild(title);

    const remaining = Economy.adRewardsRemaining();

    const card = document.createElement("div");
    card.className = "market-watch-card market-pop";

    const icon = document.createElement("div");
    icon.className = "market-watch-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7Z"></path></svg>';
    card.appendChild(icon);

    const copy = document.createElement("div");
    copy.className = "market-watch-copy";

    const name = document.createElement("p");
    name.className = "market-watch-name";
    name.textContent = `Watch an Ad — +${COINS.AD_REWARD} Coins`;

    const desc = document.createElement("p");
    desc.className = "market-watch-desc";
    desc.textContent = "A short video, a small reward. Resets every day.";

    const progress = document.createElement("p");
    progress.className = "market-watch-progress";
    progress.textContent = `${remaining} / ${COINS.AD_DAILY_LIMIT} left today`;

    copy.appendChild(name);
    copy.appendChild(desc);
    copy.appendChild(progress);
    card.appendChild(copy);

    const btn = document.createElement("button");
    btn.className = "market-watch-btn" + (remaining <= 0 ? " is-disabled" : "");
    btn.textContent = remaining <= 0 ? "Come back tomorrow" : "Watch";

    if (remaining > 0) {
      btn.addEventListener("click", () => {
        GameAudio.playClick();

        if (!Ads.isOnline()) {
          Ads.showOfflineMessage();
          return;
        }

        Ads.showRewarded(() => {
          if (Economy.claimAdReward()) {
            Haptics.vibrate([20, 40, 20]);
            spawnCoinBurst(btn);
            bump(document.getElementById("marketplaceCoinValue"));
            bump(document.getElementById("coinCounterValue"));
            bump(document.getElementById("gameCoinCounterValue"));
          }
          this.render();
        });
      });
    }

    card.appendChild(btn);
    section.appendChild(card);

    return section;
  },

  // ---------- Section Retirer les publicités (dernier, discret) ----------
  buildAdsSection() {
    const section = document.createElement("div");
    section.className = "market-section";

    const title = document.createElement("p");
    title.className = "market-section-title";
    title.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m9 9 6 6"></path><path d="m15 9-6 6"></path></svg> Remove Ads';
    section.appendChild(title);

    const card = document.createElement("div");
    card.className = "market-ads-card market-pop";

    const icon = document.createElement("div");
    icon.className = "market-ads-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m9 9 6 6"></path><path d="m15 9-6 6"></path></svg>';
    card.appendChild(icon);

    const copy = document.createElement("div");
    copy.className = "market-ads-copy";

    const name = document.createElement("p");
    name.className = "market-ads-name";
    name.textContent = "Remove Ads";

    const desc = document.createElement("p");
    desc.className = "market-ads-desc";
    desc.textContent = "No more banner or interstitial ads. Second Wind and Watch Ads stay available if you want them.";

    copy.appendChild(name);
    copy.appendChild(desc);
    card.appendChild(copy);

    const on = Boolean(Settings.data.adsBlocked);

    const btn = document.createElement("button");
    btn.className = "market-ads-btn" + (on ? " is-active" : "");
    btn.textContent = on ? "Ads Removed" : "Remove Ads";
    btn.addEventListener("click", () => {
      GameAudio.playClick();
      Haptics.vibrate(20);

      Settings.data.adsBlocked = !Settings.data.adsBlocked;
      Settings.save();

      if (Settings.data.adsBlocked) {
        Ads.hideBanner();
      } else {
        Ads.preloadInterstitial();
        Ads.preloadRewarded();
      }

      this.render();
    });

    card.appendChild(btn);
    section.appendChild(card);

    return section;
  },

  render() {
    const host = document.getElementById("marketplaceContent");
    if (!host) return;

    const scrollTop = host.scrollTop;

    host.innerHTML = "";
    host.appendChild(this.buildCoinsSection());
    host.appendChild(this.buildCosmeticsSection());
    host.appendChild(this.buildWatchAdsSection());
    host.appendChild(this.buildAdsSection());

    host.scrollTop = scrollTop;
    playEntrance(host);
  }
};
