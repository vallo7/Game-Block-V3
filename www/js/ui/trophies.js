/*
  ui/trophies.js
  --------------------------------------------------------------------
  Écran "Trophies" (roadmap Phase 5) — même mécanique d'ouverture/
  fermeture en tiroir que la page Themes, fond uni qui suit la couleur
  de session (css/trophy-page.css#.drawer-screen-bg). Le contenu
  (services/achievements.js) est entièrement généré ici, regroupé par
  catégorie — les trophées secrets restent masqués (nom "???",
  description générique) tant qu'ils ne sont pas débloqués.

  5e passe (demande explicite) : un trophée débloqué ne crédite plus ses
  Coins automatiquement — le joueur doit les RÉCLAMER lui-même via le
  bouton de la carte de révélation (showRevealQueue). Tant qu'il ne l'a
  pas fait, le trophée (ou l'étoile) réapparaît dans la file à chaque
  ouverture du menu — "seen" (services/achievements.js) sert donc
  désormais aussi de marqueur de réclamation. Un filet de sécurité fait
  quand même réclamer automatiquement après quelques secondes
  d'inactivité, pour ne jamais laisser des Coins définitivement hors
  d'atteinte si le joueur ferme l'app au milieu de l'animation.

  Système d'étoiles (5e passe) : certains trophées (Dedicated, Personal
  Best, Divine Streak — cf. achievements.js) se débloquent en 3 paliers
  sur le MÊME trophée plutôt qu'en un coup. La file de révélation traite
  donc des entrées `{ trophy, star }` (star = null pour un trophée
  classique, 1-3 pour une étoile précise) au lieu de trophées bruts.

  refreshButtonState() pilote le glow doré du bouton Trophées de
  l'accueil (classe .has-unseen, css/menu.css) : posé à l'init (pour
  refléter un trophée débloqué lors d'une session précédente) et à
  chaque déblocage/étoile en direct (Achievements.onUnlock), en plus
  d'être actualisé une fois la file de révélation entièrement écoulée.
  --------------------------------------------------------------------
*/
import { Achievements } from "../services/achievements.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";

const CATEGORY_LABELS = {
  score: "Score",
  clear: "Perfect Clear",
  combo: "Combo",
  praise: "Praise",
  endurance: "Endurance",
  volume: "Dedication",
  misc: "Miscellaneous"
};

const CATEGORY_ORDER = ["score", "clear", "combo", "praise", "endurance", "volume", "misc"];

const CATEGORY_ICONS = {
  score: '<path d="M12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9Z"></path>',
  clear: '<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="m8 12 3 3 6-6"></path>',
  combo: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"></path>',
  praise: '<path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path><circle cx="12" cy="12" r="4"></circle>',
  endurance: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path><circle cx="12" cy="12" r="6"></circle>',
  volume: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path>',
  misc: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>'
};

const LOCK_ICON = '<circle cx="12" cy="12" r="9"></circle><rect x="9" y="11" width="6" height="5" rx="1.4"></rect><path d="M10 11V9a2 2 0 0 1 4 0v2"></path>';

const CHECK_ICON = '<path d="m5 13 4 4L19 7"></path>';

const STAR_PATH = 'M12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9Z';

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

// Éclat de pièces au moment de la réclamation (round "juicy") — même
// principe que ui/marketplace.js#spawnCoinBurst (fonction locale
// dupliquée volontairement, cf. convention du projet : chaque module UI
// garde ses propres petits utilitaires plutôt qu'une abstraction
// partagée pour un si petit bout de code).
function spawnCoinBurst(anchorEl) {
  if (!anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 12;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement("div");
    spark.className = "coin-spark";

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 50 + Math.random() * 40;

    spark.style.left = `${cx - 5}px`;
    spark.style.top = `${cy - 5}px`;
    spark.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--sy", `${Math.sin(angle) * dist - 24}px`);

    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 700);
  }
}

function buildStarPips(star) {
  let html = '<span class="trophy-star-pips">';
  for (let i = 1; i <= 3; i++) {
    html += `<svg viewBox="0 0 24 24" class="svg-icon trophy-star-pip${i <= star ? " filled" : ""}" fill="currentColor" stroke="none"><path d="${STAR_PATH}"></path></svg>`;
  }
  return html + "</span>";
}

export const Trophies = {
  _revealTimer: null,

  init() {
    const backBtn = document.getElementById("trophyBackBtn");

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => this.closePage(), 140);
      });
    }

    Achievements.onUnlock(() => this.refreshButtonState());
    this.refreshButtonState();
  },

  openPage() {
    this.render();

    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("behind-sheet");
    menuScreen.classList.remove("active");
    document.getElementById("trophyScreen").classList.add("active");

    // File de révélation : trophées classiques débloqués-non-réclamés
    // (star: null) + étoiles débloquées-non-réclamées des trophées à
    // étoiles (star: 1-3) — fusionnées et triées par date d'obtention.
    const pendingSimple = Object.keys(Achievements.unlocked)
      .filter(id => !Achievements.unlocked[id].seen)
      .map(id => ({ trophy: Achievements.get(id), star: null, at: Achievements.unlocked[id].at }));

    const pendingStars = [];
    Object.keys(Achievements.starProgress).forEach(id => {
      const progress = Achievements.starProgress[id];
      for (let s = 1; s <= progress.star; s++) {
        if (!progress.seen[s]) {
          pendingStars.push({ trophy: Achievements.get(id), star: s, at: progress.at[s] });
        }
      }
    });

    const pending = pendingSimple
      .concat(pendingStars)
      .filter(item => item.trophy)
      .sort((a, b) => a.at - b.at);

    if (pending.length > 0) {
      setTimeout(() => this.showRevealQueue(pending), 320);
    }
  },

  closePage() {
    document.getElementById("trophyScreen").classList.remove("active");
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("active");
    menuScreen.classList.remove("behind-sheet");

    if (this._revealTimer) {
      clearTimeout(this._revealTimer);
      this._revealTimer = null;
    }

    const stray = document.querySelector(".trophy-reveal-overlay");
    if (stray) stray.remove();
  },

  refreshButtonState() {
    const btn = document.getElementById("trophyBtn");
    if (!btn) return;
    btn.classList.toggle("has-unseen", Achievements.hasUnseen());
  },

  // ---------- File de révélation (une popup à la fois) ----------
  // Chaque carte affiche désormais un vrai bouton "Claim" : c'est cette
  // action (ou le filet de sécurité après quelques secondes) qui verse
  // réellement les Coins — plus de crédit silencieux à l'ouverture de la
  // carte (cf. en-tête de fichier).
  showRevealQueue(list) {
    if (list.length === 0) {
      this.render();
      this.refreshButtonState();
      return;
    }

    const [item, ...rest] = list;
    const { trophy, star } = item;

    const desc = star ? trophy.descFor(trophy.thresholds[star - 1]) : trophy.desc;
    const reward = star ? trophy.rewards[star - 1] : trophy.reward;
    const tierClass = trophy.starred ? "tier-star" : trophy.tier;
    const label = star ? `Star ${star} Unlocked` : "Trophy Unlocked";
    const nameHtml = star ? `${trophy.name}${buildStarPips(star)}` : trophy.name;

    const overlay = document.createElement("div");
    overlay.className = "trophy-reveal-overlay";
    overlay.innerHTML = `
      <div class="trophy-reveal-card tier-${tierClass}">
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <div class="trophy-reveal-icon">
          <svg viewBox="0 0 24 24" class="svg-icon">${CATEGORY_ICONS[trophy.category] || ""}</svg>
        </div>
        <p class="trophy-reveal-label">${label}</p>
        <p class="trophy-reveal-name">${nameHtml}</p>
        <p class="trophy-reveal-desc">${desc}</p>
        <button type="button" class="trophy-reveal-claim-btn">${COIN_ICON_SVG}<span>Claim +${reward}</span></button>
        <p class="trophy-reveal-hint">${rest.length > 0 ? `${rest.length} more waiting` : ""}</p>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    GameAudio.playTrophyUnlock();
    Haptics.vibrate([20, 40, 20, 40, 80]);

    const claimBtn = overlay.querySelector(".trophy-reveal-claim-btn");
    let settled = false;

    const advance = () => {
      if (settled) return;
      settled = true;

      if (this._revealTimer) clearTimeout(this._revealTimer);

      // Réclame réellement les Coins ici — que ce soit un tap sur le
      // bouton ou le filet de sécurité (star ? claimStar : claim), sont
      // tous les deux sans effet si déjà réclamé (idempotents).
      const claimed = star ? Achievements.claimStar(trophy.id, star) : Achievements.claim(trophy.id);

      if (claimed > 0) {
        GameAudio.playCoinClaim();
        Haptics.vibrate([15, 30, 20]);
        spawnCoinBurst(claimBtn);
      }

      overlay.classList.remove("show");
      overlay.classList.add("out");

      setTimeout(() => {
        overlay.remove();
        this.showRevealQueue(rest);
      }, 240);
    };

    if (claimBtn) {
      claimBtn.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        advance();
      });
    }

    // Filet de sécurité : réclame quand même après un délai généreux si
    // le joueur n'interagit pas (jamais de Coins définitivement bloqués).
    this._revealTimer = setTimeout(advance, 5000);
  },

  buildCard(trophy, index) {
    const card = document.createElement("div");
    card.style.animationDelay = `${Math.min(index * 35, 400)}ms`;

    if (trophy.starred) {
      const star = Achievements.getStar(trophy.id);
      const unlocked = star > 0;
      const maxed = star >= trophy.thresholds.length;

      card.className = "trophy-card" + (unlocked ? " unlocked tier-star" : "");

      const icon = document.createElement("div");
      icon.className = "trophy-icon";
      icon.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon">${CATEGORY_ICONS[trophy.category] || ""}</svg>`;

      const copy = document.createElement("div");
      copy.className = "trophy-copy";

      const name = document.createElement("div");
      name.className = "trophy-name";
      name.innerHTML = trophy.name + buildStarPips(star);

      const desc = document.createElement("div");
      desc.className = "trophy-desc";
      const nextIndex = maxed ? trophy.thresholds.length - 1 : star;
      desc.textContent = trophy.descFor(trophy.thresholds[nextIndex]);

      copy.appendChild(name);
      copy.appendChild(desc);

      const right = document.createElement("div");

      if (maxed) {
        right.className = "trophy-check";
        right.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon">${CHECK_ICON}</svg>`;
      } else {
        right.className = "trophy-reward";
        right.innerHTML = COIN_ICON_SVG + `<span>${trophy.rewards[star]}</span>`;
      }

      card.appendChild(icon);
      card.appendChild(copy);
      card.appendChild(right);

      return card;
    }

    const unlocked = Achievements.isUnlocked(trophy.id);
    const hideContent = !unlocked && trophy.secret;

    card.className = "trophy-card" + (unlocked ? ` unlocked tier-${trophy.tier}` : "");

    const icon = document.createElement("div");
    icon.className = "trophy-icon";
    icon.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon">${hideContent ? LOCK_ICON : (CATEGORY_ICONS[trophy.category] || "")}</svg>`;

    const copy = document.createElement("div");
    copy.className = "trophy-copy";

    const name = document.createElement("div");
    name.className = "trophy-name";
    name.textContent = hideContent ? "???" : trophy.name;

    const desc = document.createElement("div");
    desc.className = "trophy-desc";
    desc.textContent = hideContent ? "Secret trophy — keep playing to find out." : trophy.desc;

    copy.appendChild(name);
    copy.appendChild(desc);

    const right = document.createElement("div");

    if (unlocked) {
      right.className = "trophy-check";
      right.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon">${CHECK_ICON}</svg>`;
    } else {
      right.className = "trophy-reward";
      right.innerHTML = COIN_ICON_SVG + `<span>${trophy.reward}</span>`;
    }

    card.appendChild(icon);
    card.appendChild(copy);
    card.appendChild(right);

    return card;
  },

  render() {
    const host = document.getElementById("trophyContent");
    if (!host) return;

    const scrollTop = host.scrollTop;
    host.innerHTML = "";

    const all = Achievements.all();
    const unlockedCount = all.filter(t => Achievements.isUnlocked(t.id)).length;
    const ratio = Math.round((unlockedCount / all.length) * 100);

    const summary = document.createElement("div");
    summary.className = "trophy-summary";
    summary.innerHTML =
      `<span>${unlockedCount} / ${all.length}</span>` +
      `<span class="trophy-summary-track"><span class="trophy-summary-fill" style="width:${ratio}%"></span></span>`;
    host.appendChild(summary);

    let cardIndex = 0;

    CATEGORY_ORDER.forEach(cat => {
      const items = all.filter(t => t.category === cat);
      if (items.length === 0) return;

      const section = document.createElement("div");
      section.className = "trophy-category";

      const title = document.createElement("p");
      title.className = "trophy-category-title";
      title.textContent = CATEGORY_LABELS[cat] || cat;
      section.appendChild(title);

      const list = document.createElement("div");
      list.className = "trophy-list";
      items.forEach(t => {
        list.appendChild(this.buildCard(t, cardIndex));
        cardIndex++;
      });
      section.appendChild(list);

      host.appendChild(section);
    });

    host.scrollTop = scrollTop;

    host.querySelectorAll(".trophy-card").forEach(el => {
      el.classList.remove("enter");
      void el.offsetWidth;
      el.classList.add("enter");
    });
  }
};
