/*
  ui/quests.js
  --------------------------------------------------------------------
  Écran "Quests" (roadmap Phase 9, demande explicite) — même tiroir que
  Trophies/Marketplace, même langage visuel "candy" pour rester
  cohérent (css/quest-page.css). 5 quêtes tirées au sort toutes les 12h
  (services/quests.js), 3 d'entre elles complétables instantanément via
  une pub récompensée en plus de la voie normale (jouer).

  8e passe (demande explicite) : ouvrir cet écran n'"active" plus rien
  à lui seul. Chaque quête porte son propre bouton "Join" : le joueur
  doit REJOINDRE une quête (Quests.joinQuest) pour qu'elle progresse et
  puisse être complétée. Le compte à rebours affiché dans l'en-tête ne
  démarre qu'une fois les 5 quêtes complétées (Quests.isCountdownActive) ;
  tant qu'il n'a pas démarré, l'en-tête invite à toutes les compléter.

  maybeShowReminder() est le pop-up de rappel sur l'accueil (demande
  explicite "sans être envahissant") — appelé depuis App.showMenu(),
  jamais plus d'une fois toutes les QUESTS.REMINDER_COOLDOWN_MS
  (config/gameConfig.js), et seulement s'il reste des quêtes non
  réclamées.
  --------------------------------------------------------------------
*/
import { Quests } from "../services/quests.js";
import { I18n } from "../services/i18n.js";
import { Ads } from "../services/ads.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { QUESTS } from "../config/gameConfig.js";

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
const PLAY_ICON = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7Z"></path></svg>';

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
  _countdownWasActive: false,

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
    I18n.onChange(() => this.render());
    this.refreshButtonState();
  },

  refreshButtonState() {
    const btn = document.getElementById("questBtn");
    if (!btn) return;
    btn.classList.toggle("has-unseen", Quests.hasClaimable());
  },

  openPage() {
    this.render();

    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("behind-sheet");
    menuScreen.classList.remove("active");
    document.getElementById("questScreen").classList.add("active");

    this._countdownTimer = setInterval(() => this.tickCountdown(), 30000);
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

  // Appelé toutes les 30s tant que la page est ouverte : si le compte à
  // rebours vient d'arriver à échéance pendant que le joueur regarde
  // l'écran, la liste a été réinitialisée (Quests.ensureFreshSet) et doit
  // être redessinée — sinon il verrait encore les anciennes quêtes.
  tickCountdown() {
    const active = Quests.isCountdownActive();

    if (this._countdownWasActive && !active) {
      this.render();
      return;
    }

    this.updateCountdown();
  },

  // Texte de l'en-tête : compte à rebours de réinitialisation s'il a
  // démarré (5 quêtes complétées), sinon invitation à les compléter.
  updateCountdown() {
    const el = document.getElementById("questCountdown");
    if (!el) return;

    const active = Quests.isCountdownActive();
    this._countdownWasActive = active;

    if (!active) {
      el.textContent = I18n.t("quests.countdownPending", { count: QUESTS.SLOT_COUNT });
      return;
    }

    el.textContent = I18n.t("quests.resetsIn", { time: formatCountdown(Quests.timeUntilReset()) });
  },

  // Pastille de récompense (toujours la même, factorisée ici plutôt que
  // recopiée dans chaque branche de buildCard).
  buildRewardChip(quest) {
    const chip = document.createElement("span");
    chip.className = "quest-reward-chip";
    chip.innerHTML = COIN_ICON_SVG + `<span>${quest.reward}</span>`;
    return chip;
  },

  buildCard(quest, index) {
    const template = Quests.getTemplate(quest.id);
    if (!template) return document.createElement("div");

    const stateClass = quest.claimed
      ? " claimed"
      : quest.completed
        ? " completed"
        : !quest.joined
          ? " pending-join"
          : "";

    const card = document.createElement("div");
    card.className = "quest-card" + stateClass;
    card.style.animationDelay = `${Math.min(index * 40, 320)}ms`;

    const icon = document.createElement("div");
    icon.className = "quest-icon";
    icon.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon">${QUEST_ICONS[quest.id] || ""}</svg>`;

    const copy = document.createElement("div");
    copy.className = "quest-copy";

    const name = document.createElement("p");
    name.className = "quest-name";
    name.textContent = I18n.t(`quest.${quest.id}`, { n: quest.target, s: quest.target > 1 ? "s" : "" });
    copy.appendChild(name);

    if (!quest.joined && !quest.completed) {
      // Pas encore rejointe : pas de barre de progression (elle n'aurait
      // aucun sens), mais une invitation claire à participer.
      const hint = document.createElement("p");
      hint.className = "quest-progress-label quest-join-hint";
      hint.textContent = I18n.t("quest.joinToStart");
      copy.appendChild(hint);
    } else {
      const track = document.createElement("div");
      track.className = "quest-progress-track";
      const fill = document.createElement("div");
      fill.className = "quest-progress-fill";
      fill.style.width = `${Math.min(100, (quest.progress / quest.target) * 100)}%`;
      track.appendChild(fill);

      const label = document.createElement("p");
      label.className = "quest-progress-label";
      label.textContent = quest.completed
        ? I18n.t("quests.complete")
        : I18n.t("quests.progress", {
            progress: Math.min(quest.progress, quest.target).toLocaleString(),
            target: quest.target.toLocaleString()
          });

      copy.appendChild(track);
      copy.appendChild(label);
    }

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
    } else if (!quest.joined) {
      // Participer : la quête ne progresse qu'à partir de ce tap
      // (services/quests.js#joinQuest).
      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "quest-join-btn";
      joinBtn.innerHTML = PLAY_ICON + `<span>${I18n.t("common.join")}</span>`;
      joinBtn.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        GameAudio.playClick();
        Haptics.vibrate(15);
        Quests.joinQuest(quest.id);
        this.render();
      });
      action.appendChild(joinBtn);
      action.appendChild(this.buildRewardChip(quest));
    } else if (quest.adSkippable) {
      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "quest-skip-btn";
      skipBtn.innerHTML = PLAY_ICON + `<span>${I18n.t("common.watchAd")}</span>`;
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
      action.appendChild(this.buildRewardChip(quest));
    } else {
      action.appendChild(this.buildRewardChip(quest));
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
      `<span>${I18n.t("quests.summary", { count: claimedCount, total: quests.length })}</span>` +
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
      `<span>${I18n.t("quests.reminder")}</span>`;

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
