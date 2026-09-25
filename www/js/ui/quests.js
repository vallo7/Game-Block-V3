/*
  ui/quests.js
  --------------------------------------------------------------------
  Écran "Quests" (roadmap Phase 9, demande explicite) — même tiroir que
  Trophies/Marketplace, même langage visuel "candy" pour rester
  cohérent (css/quest-page.css). 5 quêtes tirées au sort toutes les 12h
  (services/quests.js), 3 d'entre elles complétables instantanément via
  une pub récompensée en plus de la voie normale (jouer).

  Ouvrir cet écran "active" le cycle en cours (Quests.activate()) —
  c'est la condition nécessaire pour que la progression en jeu commence
  à compter (demande explicite "le joueur doit venir participer à une
  quête pour pouvoir la compléter").

  maybeShowReminder() est le pop-up de rappel sur l'accueil (demande
  explicite "sans être envahissant") — appelé depuis App.showMenu(),
  jamais plus d'une fois toutes les QUESTS.REMINDER_COOLDOWN_MS
  (config/gameConfig.js), et seulement s'il reste des quêtes non
  réclamées.
  --------------------------------------------------------------------
*/
import { Quests } from "../services/quests.js";
import { Ads } from "../services/ads.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";

const QUEST_ICONS = {
  score: '<path d="M12 2 15 9 22 10 17 15 18 22 12 18.5 6 22 7 15 2 10 9 9Z"></path>',
  lines: '<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="m8 12 3 3 6-6"></path>',
  perfectClear: '<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="m8 12 3 3 6-6"></path>',
  combo: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"></path>',
  games: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path>',
  watchAds: '<path d="M8 5v14l11-7Z"></path>'
};

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

const CHECK_ICON = '<path d="m5 13 4 4L19 7"></path>';

// Éclat de pièces (même principe que ui/trophies.js / ui/marketplace.js
// — petite fonction locale dupliquée volontairement, cf. convention du
// projet).
function spawnCoinBurst(anchorEl) {
  if (!anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 10;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement("div");
    spark.className = "coin-spark";

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 48 + Math.random() * 36;

    spark.style.left = `${cx - 5}px`;
    spark.style.top = `${cy - 5}px`;
    spark.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--sy", `${Math.sin(angle) * dist - 22}px`);

    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 700);
  }
}

function formatCountdown(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export const QuestsUI = {
  _countdownTimer: null,

  init() {
    const backBtn = document.getElementById("questBackBtn");
    const questBtn = document.getElementById("questBtn");

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => this.closePage(), 140);
      });
    }

    if (questBtn) {
      questBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(15);
        setTimeout(() => this.openPage(), 160);
      });
    }

    Quests.onChange(() => this.refreshButtonState());
    this.refreshButtonState();
  },

  refreshButtonState() {
    const btn = document.getElementById("questBtn");
    if (!btn) return;
    btn.classList.toggle("has-unseen", Quests.hasClaimable());
  },

  openPage() {
    Quests.activate();
    this.render();

    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("behind-sheet");
    menuScreen.classList.remove("active");
    document.getElementById("questScreen").classList.add("active");

    this._countdownTimer = setInterval(() => this.updateCountdown(), 30000);
  },

  closePage() {
    document.getElementById("questScreen").classList.remove("active");
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("active");
    menuScreen.classList.remove("behind-sheet");

    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  updateCountdown() {
    const el = document.getElementById("questCountdown");
    if (el) el.textContent = `Resets in ${formatCountdown(Quests.timeUntilReset())}`;
  },

  buildCard(quest, index) {
    const template = Quests.getTemplate(quest.id);
    if (!template) return document.createElement("div");

    const card = document.createElement("div");
    card.className = "quest-card" + (quest.claimed ? " claimed" : quest.completed ? " completed" : "");
    card.style.animationDelay = `${Math.min(index * 40, 320)}ms`;

    const icon = document.createElement("div");
    icon.className = "quest-icon";
    icon.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon">${QUEST_ICONS[quest.id] || ""}</svg>`;

    const copy = document.createElement("div");
    copy.className = "quest-copy";

    const name = document.createElement("p");
    name.className = "quest-name";
    name.textContent = template.label(quest.target);

    const track = document.createElement("div");
    track.className = "quest-progress-track";
    const fill = document.createElement("div");
    fill.className = "quest-progress-fill";
    fill.style.width = `${Math.min(100, (quest.progress / quest.target) * 100)}%`;
    track.appendChild(fill);

    const label = document.createElement("p");
    label.className = "quest-progress-label";
    label.textContent = quest.completed
      ? "Complete!"
      : `${Math.min(quest.progress, quest.target).toLocaleString()} / ${quest.target.toLocaleString()}`;

    copy.appendChild(name);
    copy.appendChild(track);
    copy.appendChild(label);
    card.appendChild(icon);
    card.appendChild(copy);

    const action = document.createElement("div");
    action.className = "quest-action";

    if (quest.claimed) {
      action.innerHTML = `<span class="quest-check">${wrapIcon(CHECK_ICON)}</span>`;
    } else if (quest.completed) {
      const claimBtn = document.createElement("button");
      claimBtn.type = "button";
      claimBtn.className = "quest-claim-btn";
      claimBtn.innerHTML = COIN_ICON_SVG + `<span>+${quest.reward}</span>`;
      claimBtn.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        const amount = Quests.claim(quest.id);
        if (amount > 0) {
          GameAudio.playCoinClaim();
          Haptics.vibrate([15, 30, 20]);
          spawnCoinBurst(claimBtn);
        }
        this.render();
      });
      action.appendChild(claimBtn);
    } else if (quest.adSkippable) {
      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "quest-skip-btn";
      skipBtn.innerHTML = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7Z"></path></svg><span>Watch Ad</span>';
      skipBtn.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        GameAudio.playClick();

        if (!Ads.isOnline()) {
          Ads.showOfflineMessage();
          return;
        }

        Ads.showRewarded(() => {
          Quests.completeBySkip(quest.id);
          this.render();
        });
      });
      action.appendChild(skipBtn);

      const chip = document.createElement("span");
      chip.className = "quest-reward-chip";
      chip.innerHTML = COIN_ICON_SVG + `<span>${quest.reward}</span>`;
      action.appendChild(chip);
    } else {
      const chip = document.createElement("span");
      chip.className = "quest-reward-chip";
      chip.innerHTML = COIN_ICON_SVG + `<span>${quest.reward}</span>`;
      action.appendChild(chip);
    }

    card.appendChild(action);

    return card;
  },

  render() {
    const host = document.getElementById("questContent");
    if (!host) return;

    const scrollTop = host.scrollTop;
    host.innerHTML = "";

    const quests = Quests.all();
    const claimedCount = quests.filter(q => q.claimed).length;

    const summary = document.createElement("div");
    summary.className = "quest-summary";
    summary.innerHTML =
      `<span>${claimedCount} / ${quests.length} claimed</span>` +
      `<span class="quest-summary-track"><span class="quest-summary-fill" style="width:${Math.round((claimedCount / quests.length) * 100)}%"></span></span>`;
    host.appendChild(summary);

    const list = document.createElement("div");
    list.className = "quest-list";
    quests.forEach((quest, index) => list.appendChild(this.buildCard(quest, index)));
    host.appendChild(list);

    host.scrollTop = scrollTop;
    this.updateCountdown();

    host.querySelectorAll(".quest-card").forEach(el => {
      el.classList.remove("enter");
      void el.offsetWidth;
      el.classList.add("enter");
    });

    this.refreshButtonState();
  },

  // ---------- Pop-up de rappel sur l'accueil (demande explicite "sans
  // être envahissant") ----------
  maybeShowReminder() {
    if (!Quests.shouldShowReminder()) return;
    if (document.getElementById("questScreen").classList.contains("active")) return;

    Quests.markReminderShown();

    const el = document.createElement("div");
    el.className = "quest-reminder-toast";
    el.innerHTML =
      '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="m8 12 2.5 2.5L16 9"></path></svg>' +
      '<span>Quests are waiting for you!</span>';

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    el.addEventListener("pointerdown", () => {
      GameAudio.playClick();
      dismiss();
      this.openPage();
    });

    const dismiss = () => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    };

    setTimeout(dismiss, 4200);
  }
};

function wrapIcon(pathHtml) {
  return `<svg viewBox="0 0 24 24" class="svg-icon">${pathHtml}</svg>`;
}
