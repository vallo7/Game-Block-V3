/*
  services/quests.js
  --------------------------------------------------------------------
  Quêtes quotidiennes (roadmap Phase 9, demande explicite). 5 quêtes
  tirées au sort depuis QUESTS.TEMPLATES (config/gameConfig.js) à
  chaque cycle de QUESTS.RESET_INTERVAL_MS (12h) ; 3 d'entre elles sont
  marquées "adSkippable" (complétables instantanément via une pub
  récompensée EN PLUS de la voie normale — jouer).

  Le joueur doit avoir ouvert le menu Quêtes au moins une fois dans le
  cycle en cours pour que sa progression commence à compter (`activated`,
  demande explicite "le joueur doit venir participer à une quête pour
  pouvoir la compléter") — trackEvent() est un no-op tant que ce n'est
  pas le cas, réglé par activate() (ui/quests.js#openPage).

  Chaque quête complétée doit être RÉCLAMÉE par le joueur (même principe
  que services/achievements.js, 5e passe) plutôt que créditée
  automatiquement — claim() est le seul point qui verse les Coins.

  Alimentée par de petits appels ponctuels depuis core/game-rules.js
  (score/lignes/perfect clear/combo), core/game-flow.js (parties
  jouées) et les deux points d'entrée de pub récompensée
  (core/game-state.js#Second Wind, ui/marketplace.js#Watch Ads).
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { Economy } from "./economy.js";
import { QUESTS } from "../config/gameConfig.js";

const byId = Object.fromEntries(QUESTS.TEMPLATES.map(t => [t.id, t]));

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

export const Quests = {
  state: null,
  listeners: [],

  init() {
    this.state = Storage.getQuests();
    this.ensureFreshSet();
  },

  // callback() — pas d'argument, l'UI relit l'état via all()/etc.
  onChange(callback) {
    this.listeners.push(callback);
  },

  notify() {
    this.listeners.forEach(cb => cb());
  },

  save() {
    Storage.saveQuests(this.state);
  },

  getTemplate(id) {
    return byId[id] || null;
  },

  // Régénère un nouveau jeu de 5 quêtes si le cycle en cours est expiré
  // (ou s'il n'y a encore aucun état persisté) — appelé en tête de
  // chaque méthode publique, donc jamais besoin de s'en soucier côté
  // appelant.
  ensureFreshSet() {
    const now = Date.now();

    if (this.state && this.state.resetAt && now < this.state.resetAt) return;

    const chosen = shuffle(QUESTS.TEMPLATES).slice(0, QUESTS.SLOT_COUNT);
    const skippablePool = chosen.filter(t => t.id !== "watchAds");
    const skippableIds = new Set(
      shuffle(skippablePool)
        .slice(0, Math.min(QUESTS.AD_SKIPPABLE_COUNT, skippablePool.length))
        .map(t => t.id)
    );

    this.state = {
      resetAt: now + QUESTS.RESET_INTERVAL_MS,
      activated: false,
      lastReminderAt: this.state ? (this.state.lastReminderAt || 0) : 0,
      quests: chosen.map(template => {
        const variant = Math.floor(Math.random() * template.targets.length);

        return {
          id: template.id,
          target: template.targets[variant],
          reward: template.reward[variant],
          progress: 0,
          completed: false,
          claimed: false,
          adSkippable: skippableIds.has(template.id)
        };
      })
    };

    this.save();
  },

  all() {
    this.ensureFreshSet();
    return this.state.quests;
  },

  timeUntilReset() {
    this.ensureFreshSet();
    return Math.max(0, this.state.resetAt - Date.now());
  },

  // Ouverture du menu Quêtes : "active" le cycle en cours — condition
  // nécessaire pour que trackEvent() fasse progresser quoi que ce soit
  // (demande explicite, voir en-tête de fichier).
  activate() {
    this.ensureFreshSet();
    if (this.state.activated) return;

    this.state.activated = true;
    this.save();
  },

  hasClaimable() {
    this.ensureFreshSet();
    return this.state.quests.some(q => q.completed && !q.claimed);
  },

  hasPending() {
    this.ensureFreshSet();
    return this.state.quests.some(q => !q.claimed);
  },

  // Appelé depuis les modules core/ et services/ à chaque événement
  // pertinent. `value` est soit la valeur COURANTE de la statistique
  // (score/combo — on garde le meilleur essai du cycle via Math.max),
  // soit un delta à additionner pour les quêtes cumulatives (lignes,
  // perfect clears, parties jouées, pubs regardées — { cumulative: true }).
  trackEvent(track, value, { cumulative = false } = {}) {
    this.ensureFreshSet();
    if (!this.state.activated) return;

    let changed = false;

    this.state.quests.forEach(quest => {
      if (quest.completed) return;

      const template = byId[quest.id];
      if (!template || template.track !== track) return;

      quest.progress = cumulative ? quest.progress + value : Math.max(quest.progress, value);

      if (quest.progress >= quest.target) {
        quest.progress = quest.target;
        quest.completed = true;
      }

      changed = true;
    });

    if (changed) {
      this.save();
      this.notify();
    }
  },

  // Complète instantanément une quête "adSkippable" (bouton pub du menu
  // Quêtes, après une pub récompensée) — sans effet si la quête n'est
  // pas skippable ou déjà complétée.
  completeBySkip(id) {
    this.ensureFreshSet();

    const quest = this.state.quests.find(q => q.id === id);
    if (!quest || quest.completed || !quest.adSkippable) return false;

    quest.progress = quest.target;
    quest.completed = true;
    this.save();
    this.notify();

    return true;
  },

  // Réclame la récompense d'une quête complétée — retourne le montant
  // versé (0 si rien à réclamer). Seul point qui touche à Economy.
  claim(id) {
    this.ensureFreshSet();

    const quest = this.state.quests.find(q => q.id === id);
    if (!quest || !quest.completed || quest.claimed) return 0;

    quest.claimed = true;
    this.save();
    this.notify();

    Economy.earn(quest.reward, `quest:${id}`);
    return quest.reward;
  },

  // Pop-up de rappel sur l'accueil (demande explicite "sans être
  // envahissant") : au plus une fois toutes les QUESTS.REMINDER_COOLDOWN_MS,
  // et seulement s'il reste des quêtes non réclamées.
  shouldShowReminder() {
    this.ensureFreshSet();
    if (!this.hasPending()) return false;

    return Date.now() - (this.state.lastReminderAt || 0) >= QUESTS.REMINDER_COOLDOWN_MS;
  },

  markReminderShown() {
    this.ensureFreshSet();
    this.state.lastReminderAt = Date.now();
    this.save();
  }
};
