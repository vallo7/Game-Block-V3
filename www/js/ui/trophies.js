/*
  ui/trophies.js
  --------------------------------------------------------------------
  Écran "Trophies" (roadmap Phase 5) — même mécanique d'ouverture/
  fermeture en tiroir que la page Themes (services/visualtheme.js),
  mais fond uni qui suit la couleur de session au lieu d'un fond photo
  (css/trophy-page.css#.drawer-screen-bg, partagée avec la Marketplace
  sans toucher à #themeScreen). Le contenu (18 trophées,
  services/achievements.js) est entièrement généré ici, regroupé par
  catégorie — les trophées secrets (secret: true) restent masqués
  (nom "???", description générique) tant qu'ils ne sont pas débloqués.

  refreshButtonState() pilote le glow doré du bouton Trophées de
  l'accueil (classe .has-unseen, css/menu.css) : posé à l'init (pour
  refléter un trophée débloqué lors d'une session précédente) et à
  chaque déblocage en direct (Achievements.onUnlock), en plus d'être
  nettoyé à l'ouverture du menu (markAllSeen()).
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

export const Trophies = {
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
    Achievements.markAllSeen();
    this.refreshButtonState();

    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("behind-sheet");
    menuScreen.classList.remove("active");
    document.getElementById("trophyScreen").classList.add("active");
  },

  closePage() {
    document.getElementById("trophyScreen").classList.remove("active");
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("active");
    menuScreen.classList.remove("behind-sheet");
  },

  refreshButtonState() {
    const btn = document.getElementById("trophyBtn");
    if (!btn) return;
    btn.classList.toggle("has-unseen", Achievements.hasUnseen());
  },

  buildCard(trophy) {
    const unlocked = Achievements.isUnlocked(trophy.id);
    const entry = Achievements.unlocked[trophy.id];
    const isNew = Boolean(unlocked && entry && !entry.seen);
    const hideContent = !unlocked && trophy.secret;

    const card = document.createElement("div");
    card.className = "trophy-card" + (unlocked ? " unlocked" : "") + (isNew ? " is-new" : "");

    const icon = document.createElement("div");
    icon.className = `trophy-icon tier-${trophy.tier}`;
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
      right.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="m5 13 4 4L19 7"></path></svg>';
    } else {
      right.className = "trophy-reward";
      right.innerHTML =
        '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
        '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>' +
        `<span>${trophy.reward}</span>`;
    }

    card.appendChild(icon);
    card.appendChild(copy);
    card.appendChild(right);

    return card;
  },

  render() {
    const host = document.getElementById("trophyContent");
    if (!host) return;

    host.innerHTML = "";

    const all = Achievements.all();
    const unlockedCount = all.filter(t => Achievements.isUnlocked(t.id)).length;

    const summary = document.createElement("div");
    summary.className = "trophy-summary";
    summary.textContent = `${unlockedCount} / ${all.length} unlocked`;
    host.appendChild(summary);

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
      items.forEach(t => list.appendChild(this.buildCard(t)));
      section.appendChild(list);

      host.appendChild(section);
    });
  }
};
