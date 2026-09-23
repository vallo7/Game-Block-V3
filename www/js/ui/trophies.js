/*
  ui/trophies.js
  --------------------------------------------------------------------
  Écran "Trophies" (roadmap Phase 5, 2e passe) — même mécanique
  d'ouverture/fermeture en tiroir que la page Themes, fond uni qui suit
  la couleur de session (css/trophy-page.css#.drawer-screen-bg). Le
  contenu (28 trophées, services/achievements.js) est entièrement
  généré ici, regroupé par catégorie — les trophées secrets restent
  masqués (nom "???", description générique) tant qu'ils ne sont pas
  débloqués.

  Révélation (2e passe, demande explicite) : à l'ouverture du menu,
  chaque trophée débloqué mais pas encore "vu" déclenche une popup de
  révélation, une carte à la fois (showRevealQueue) — Achievements.
  markSeen() n'est appelé qu'au moment où SA carte est effectivement
  affichée, donc chaque trophée n'est révélé qu'une seule fois, même si
  le menu est fermé puis rouvert au milieu de la file.

  refreshButtonState() pilote le glow doré du bouton Trophées de
  l'accueil (classe .has-unseen, css/menu.css) : posé à l'init (pour
  refléter un trophée débloqué lors d'une session précédente) et à
  chaque déblocage en direct (Achievements.onUnlock), en plus d'être
  actualisé une fois la file de révélation entièrement écoulée.
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

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

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

    const pending = Object.keys(Achievements.unlocked)
      .filter(id => !Achievements.unlocked[id].seen)
      .sort((a, b) => Achievements.unlocked[a].at - Achievements.unlocked[b].at)
      .map(id => Achievements.get(id))
      .filter(Boolean);

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

  // ---------- File de révélation (une popup à la fois, une seule fois
  // par trophée) ----------
  showRevealQueue(list) {
    if (list.length === 0) {
      this.render();
      this.refreshButtonState();
      return;
    }

    const [trophy, ...rest] = list;
    Achievements.markSeen(trophy.id);

    const overlay = document.createElement("div");
    overlay.className = "trophy-reveal-overlay";
    overlay.innerHTML = `
      <div class="trophy-reveal-card tier-${trophy.tier}">
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <span class="trophy-reveal-spark" aria-hidden="true"></span>
        <div class="trophy-reveal-icon">
          <svg viewBox="0 0 24 24" class="svg-icon">${CATEGORY_ICONS[trophy.category] || ""}</svg>
        </div>
        <p class="trophy-reveal-label">Trophy Unlocked</p>
        <p class="trophy-reveal-name">${trophy.name}</p>
        <p class="trophy-reveal-desc">${trophy.desc}</p>
        <div class="trophy-reveal-reward">${COIN_ICON_SVG}<span>+${trophy.reward}</span></div>
        <p class="trophy-reveal-hint">${rest.length > 0 ? "Tap to continue" : "Tap to close"}</p>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    GameAudio.playTutorialDone();
    Haptics.vibrate([20, 40, 20, 40, 80]);

    const advance = () => {
      overlay.removeEventListener("pointerdown", advance);
      if (this._revealTimer) clearTimeout(this._revealTimer);

      overlay.classList.remove("show");
      overlay.classList.add("out");

      setTimeout(() => {
        overlay.remove();
        this.showRevealQueue(rest);
      }, 240);
    };

    overlay.addEventListener("pointerdown", advance);
    this._revealTimer = setTimeout(advance, 2600);
  },

  buildCard(trophy, index) {
    const unlocked = Achievements.isUnlocked(trophy.id);
    const hideContent = !unlocked && trophy.secret;

    const card = document.createElement("div");
    card.className = "trophy-card" + (unlocked ? ` unlocked tier-${trophy.tier}` : "");
    card.style.animationDelay = `${Math.min(index * 35, 400)}ms`;

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
