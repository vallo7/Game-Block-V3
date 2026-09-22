/*
  ui/marketplace.js
  --------------------------------------------------------------------
  Écran "Marketplace" (roadmap Phase 5) — même tiroir que Trophies/
  Themes (css/trophy-page.css#.drawer-screen). Trois sections :

  - Cosmétiques : thèmes achetables en Coins (Inferno pour l'instant,
    filière 3 du §3.3 — Halloween se débloque par une mécanique en jeu,
    cf. services/visualtheme.js, et n'apparaît donc pas ici) + des
    emplacements "Coming soon" pour garder l'écran visuellement riche
    en attendant le reste du contenu cosmétique.
  - Retirer les publicités : déplacé ici depuis l'accueil (round de
    suivi), reprend exactement la logique de l'ancien adsBlockBtn
    d'app.js.
  - Recharger la monnaie : packs de Coins. Aucun plugin d'achat in-app
    n'est installé dans le projet pour l'instant (seulement
    @capacitor-community/admob) — ces packs créditent directement le
    solde au tap, comme les IDs AdMob de test créditent une pub
    "gratuite" pendant le développement (à brancher sur un vrai
    fournisseur de paiement avant publication, même bascule que les IDs
    AdMob réels, roadmap §6 Phase 6).
  --------------------------------------------------------------------
*/
import { Economy } from "../services/economy.js";
import { VisualTheme } from "../services/visualtheme.js";
import { Settings } from "../services/settings.js";
import { Ads } from "../services/ads.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { MARKETPLACE } from "../config/gameConfig.js";

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

function bump(el) {
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
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

    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("behind-sheet");
    menuScreen.classList.remove("active");
    document.getElementById("marketplaceScreen").classList.add("active");
  },

  closePage() {
    document.getElementById("marketplaceScreen").classList.remove("active");
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("active");
    menuScreen.classList.remove("behind-sheet");
  },

  updateCoinHeader() {
    const el = document.getElementById("marketplaceCoinValue");
    if (el) el.textContent = Economy.balance;
  },

  // ---------- Section Cosmétiques ----------
  buildThemeCard(themeId) {
    const theme = VisualTheme.getById(themeId);
    const info = VisualTheme.UNLOCKS[themeId];
    if (!theme || !info || info.type !== "coins") return null;

    const owned = VisualTheme.isThemeAvailable(theme);

    const card = document.createElement("div");
    card.className = "market-item-card";

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
          this.render();
        }
      });
    }

    card.appendChild(btn);

    return card;
  },

  buildComingSoonCard(label) {
    const card = document.createElement("div");
    card.className = "market-item-card";

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

  // ---------- Section Retirer les publicités ----------
  buildAdsSection() {
    const section = document.createElement("div");
    section.className = "market-section";

    const title = document.createElement("p");
    title.className = "market-section-title";
    title.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m9 9 6 6"></path><path d="m15 9-6 6"></path></svg> Remove Ads';
    section.appendChild(title);

    const card = document.createElement("div");
    card.className = "market-ads-card";

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
    desc.textContent = "No more banner or interstitial ads. Second Wind (rewarded, in the Game Over panel) stays available if you ever want to use it.";

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

  // ---------- Section Recharger la monnaie ----------
  buildCoinPackCard(pack) {
    const btn = document.createElement("button");
    btn.className = "market-coin-card";

    if (pack.badge) {
      const badge = document.createElement("span");
      badge.className = "market-coin-badge";
      badge.textContent = pack.badge;
      btn.appendChild(badge);
    }

    const icon = document.createElement("div");
    icon.className = "market-coin-icon";
    icon.innerHTML = COIN_ICON_SVG;
    btn.appendChild(icon);

    const copy = document.createElement("div");
    copy.className = "market-coin-copy";

    const amount = document.createElement("p");
    amount.className = "market-coin-amount";
    amount.textContent = `${pack.coins.toLocaleString()} Coins`;

    if (pack.bonus) {
      const bonus = document.createElement("span");
      bonus.className = "market-coin-bonus";
      bonus.textContent = `+${pack.bonus}%`;
      amount.appendChild(bonus);
    }

    copy.appendChild(amount);
    btn.appendChild(copy);

    const price = document.createElement("span");
    price.className = "market-coin-price";
    price.textContent = pack.priceLabel;
    btn.appendChild(price);

    btn.addEventListener("click", () => {
      GameAudio.playClick();
      Haptics.vibrate(20);

      const total = Math.round(pack.coins * (1 + pack.bonus / 100));
      Economy.earn(total, `pack:${pack.id}`);

      bump(document.getElementById("marketplaceCoinValue"));
      bump(document.getElementById("coinCounterValue"));
    });

    return btn;
  },

  buildCoinsSection() {
    const section = document.createElement("div");
    section.className = "market-section";

    const title = document.createElement("p");
    title.className = "market-section-title";
    title.innerHTML = COIN_ICON_SVG + " Recharge Coins";
    section.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "market-section-sub";
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

  render() {
    const host = document.getElementById("marketplaceContent");
    if (!host) return;

    host.innerHTML = "";
    host.appendChild(this.buildCosmeticsSection());
    host.appendChild(this.buildAdsSection());
    host.appendChild(this.buildCoinsSection());
  }
};
