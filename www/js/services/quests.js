/*
  services/quests.js
  --------------------------------------------------------------------
  Quêtes quotidiennes (roadmap Phase 9, demande explicite). 5 quêtes
  tirées au sort depuis QUESTS.TEMPLATES (config/gameConfig.js) ; 3
  d'entre elles sont marquées "adSkippable" (complétables instantanément
  via une pub récompensée EN PLUS de la voie normale — jouer).

  Cycle de vie :

  1) PARTICIPATION PAR QUÊTE (8e passe). Le joueur doit REJOINDRE une
     quête (joinQuest, bouton "Join" de ui/quests.js) pour pouvoir la
     compléter : trackEvent() ne fait progresser que les quêtes déjà
     rejointes, et la progression démarre à zéro au moment de la
     participation.

  2) COMPTE À REBOURS DÉCLENCHÉ PAR LA COMPLÉTION (V2 : 3 quêtes sur 5).
     Le décompte de 12h (QUESTS.RESET_INTERVAL_MS) ne tourne pas en
     permanence : il DÉMARRE dès que QUESTS.RESET_TRIGGER_COUNT quêtes
     (3 sur 5) du cycle sont complétées (maybeStartResetCountdown,
     `resetAt`). À l'échéance, la liste entière est réinitialisée
     (nouveau tirage, les quêtes peuvent donc changer). Tant que le
     seuil n'est pas atteint, `resetAt` vaut null : aucun décompte,
     aucune réinitialisation, quel que soit le temps écoulé.

  Chaque quête complétée doit être RÉCLAMÉE par le joueur (même principe
  que services/achievements.js) plutôt que créditée automatiquement —
  claim() est le seul point qui verse les Coins. Le décompte démarre à la
  COMPLÉTION de la quête qui atteint le seuil, pas à sa réclamation : le
  joueur ne peut pas retarder la réinitialisation en laissant des
  récompenses non réclamées (elles restent réclamables jusqu'à
  l'échéance).

  Robustesse : l'état persisté porte un numéro de version
  (STATE_VERSION). Un état d'une ancienne version (ou corrompu/tronqué)
  est régénéré proprement au lieu de faire planter les méthodes qui en
  supposent la forme actuelle. Un état valide dont le seuil de 3 quêtes
  complétées est déjà atteint sans décompte (sauvegarde de l'ancienne
  règle "les 5 quêtes") voit son décompte démarrer au chargement.

  Alimentée par de petits appels ponctuels depuis core/game-rules.js
  (score/lignes/perfect clear/combo), core/game-flow.js (parties
  jouées) et services/ads.js (pubs regardées — suivi centralisé, chaque
  pub récompensée vue compte, d'où qu'elle vienne).
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { Economy } from "./economy.js";
import { QUESTS } from "../config/gameConfig.js";

// Version du format persisté. 1 = ancien format (activation globale
// `activated`, décompte permanent) ; 2 = participation par quête +
// décompte déclenché par la complétion.
const STATE_VERSION = 2;

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

  // Horodatage du début de la partie en cours (posé par
  // Game.reset() via markRunStart(), jamais persisté : une partie ne
  // survit pas à un redémarrage de l'app). Sert à n'accepter, pour les
  // quêtes "meilleure valeur d'une partie" (score, combo), que des
  // parties DÉMARRÉES après la participation du joueur — sinon une
  // partie laissée en cours puis reprise après avoir rejoint la quête
  // pourrait la valider avec des points acquis avant.
  runStartedAt: 0,

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

  // Un état n'est réutilisable que s'il a la version courante ET la forme
  // attendue (bon nombre de quêtes, chacune rattachée à un modèle connu).
  isStateValid(state) {
    return Boolean(
      state &&
      state.version === STATE_VERSION &&
      Array.isArray(state.quests) &&
      state.quests.length === QUESTS.SLOT_COUNT &&
      state.quests.every(q => q && byId[q.id])
    );
  },

  // Tire un nouveau jeu de QUESTS.SLOT_COUNT quêtes. `resetAt` est null :
  // le décompte de réinitialisation ne démarrera qu'une fois
  // QUESTS.RESET_TRIGGER_COUNT quêtes complétées (voir en-tête).
  // lastReminderAt est conservé d'un cycle à l'autre pour que le pop-up
  // de rappel de l'accueil ne se redéclenche pas immédiatement après une
  // réinitialisation.
  generateSet(lastReminderAt) {
    const chosen = shuffle(QUESTS.TEMPLATES).slice(0, QUESTS.SLOT_COUNT);
    const skippablePool = chosen.filter(t => t.id !== "watchAds");
    const skippableIds = new Set(
      shuffle(skippablePool)
        .slice(0, Math.min(QUESTS.AD_SKIPPABLE_COUNT, skippablePool.length))
        .map(t => t.id)
    );

    return {
      version: STATE_VERSION,
      resetAt: null,
      lastReminderAt: lastReminderAt || 0,
      quests: chosen.map(template => {
        const variant = Math.floor(Math.random() * template.targets.length);

        return {
          id: template.id,
          target: template.targets[variant],
          reward: template.reward[variant],
          progress: 0,
          joined: false,
          joinedAt: 0,
          completed: false,
          claimed: false,
          adSkippable: skippableIds.has(template.id)
        };
      })
    };
  },

  // Régénère un nouveau jeu de quêtes si l'état est absent/invalide, ou
  // si le décompte de réinitialisation a démarré ET est arrivé à
  // échéance — appelé en tête de chaque méthode publique, donc jamais
  // besoin de s'en soucier côté appelant. Tant que `resetAt` est null
  // (seuil de quêtes complétées non atteint), aucune réinitialisation
  // n'a lieu, même après des jours.
  ensureFreshSet() {
    if (this.isStateValid(this.state)) {
      if (this.state.resetAt && Date.now() >= this.state.resetAt) {
        this.state = this.generateSet(this.state.lastReminderAt);
        this.save();
        return;
      }

      // Sauvegarde issue de l'ancienne règle (les 5 quêtes) : si le seuil
      // est déjà atteint sans décompte, on le démarre maintenant.
      if (!this.state.resetAt && this.completedCount() >= QUESTS.RESET_TRIGGER_COUNT) {
        this.maybeStartResetCountdown();
        this.save();
      }

      return;
    }

    this.state = this.generateSet(this.state && this.state.lastReminderAt);
    this.save();
  },

  all() {
    this.ensureFreshSet();
    return this.state.quests;
  },

  completedCount() {
    return this.state.quests.filter(q => q.completed).length;
  },

  // true dès que le seuil de quêtes complétées est atteint (le décompte
  // de réinitialisation tourne alors).
  isCountdownActive() {
    this.ensureFreshSet();
    return Boolean(this.state.resetAt);
  },

  // Millisecondes restantes avant la réinitialisation, ou null si le
  // décompte n'a pas encore démarré.
  timeUntilReset() {
    this.ensureFreshSet();
    if (!this.state.resetAt) return null;

    return Math.max(0, this.state.resetAt - Date.now());
  },

  // Le joueur choisit de PARTICIPER à une quête : à partir de là (et
  // seulement à partir de là) les événements de jeu la font progresser.
  // Retourne true si la quête vient effectivement d'être rejointe.
  joinQuest(id) {
    this.ensureFreshSet();

    const quest = this.state.quests.find(q => q.id === id);
    if (!quest || quest.joined || quest.completed) return false;

    quest.joined = true;
    quest.joinedAt = Date.now();
    this.save();
    this.notify();

    return true;
  },

  // Appelé par Game.reset() à chaque nouvelle partie (voir runStartedAt).
  markRunStart() {
    this.runStartedAt = Date.now();
  },

  hasClaimable() {
    this.ensureFreshSet();
    return this.state.quests.some(q => q.completed && !q.claimed);
  },

  hasPending() {
    this.ensureFreshSet();
    return this.state.quests.some(q => !q.claimed);
  },

  // Démarre le décompte de 12h dès que QUESTS.RESET_TRIGGER_COUNT quêtes
  // du cycle sont complétées (3 sur 5). Idempotent : ne redémarre jamais
  // un décompte déjà en cours. Ne sauvegarde pas lui-même — l'appelant
  // le fait juste après.
  maybeStartResetCountdown() {
    if (this.state.resetAt) return;
    if (this.completedCount() < QUESTS.RESET_TRIGGER_COUNT) return;

    this.state.resetAt = Date.now() + QUESTS.RESET_INTERVAL_MS;
  },

  // Appelé depuis les modules core/ et services/ à chaque événement
  // pertinent. `value` est soit la valeur COURANTE de la statistique
  // (score/combo — on garde le meilleur essai depuis la participation via
  // Math.max), soit un delta à additionner pour les quêtes cumulatives
  // (lignes, perfect clears, parties jouées, pubs regardées —
  // { cumulative: true }). Seules les quêtes REJOINTES et non complétées
  // sont concernées.
  trackEvent(track, value, { cumulative = false } = {}) {
    this.ensureFreshSet();

    let changed = false;

    this.state.quests.forEach(quest => {
      if (!quest.joined || quest.completed) return;

      const template = byId[quest.id];
      if (!template || template.track !== track) return;

      // Quêtes "meilleure valeur d'une partie" : la partie doit avoir
      // démarré après la participation (voir runStartedAt).
      if (!cumulative && this.runStartedAt < quest.joinedAt) return;

      quest.progress = cumulative ? quest.progress + value : Math.max(quest.progress, value);

      if (quest.progress >= quest.target) {
        quest.progress = quest.target;
        quest.completed = true;
      }

      changed = true;
    });

    if (changed) {
      this.maybeStartResetCountdown();
      this.save();
      this.notify();
    }
  },

  // Complète instantanément une quête "adSkippable" REJOINTE (bouton pub
  // du menu Quêtes, après une pub récompensée) — sans effet si la quête
  // n'est pas skippable, pas rejointe ou déjà complétée.
  completeBySkip(id) {
    this.ensureFreshSet();

    const quest = this.state.quests.find(q => q.id === id);
    if (!quest || !quest.joined || quest.completed || !quest.adSkippable) return false;

    quest.progress = quest.target;
    quest.completed = true;

    this.maybeStartResetCountdown();
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
  // et seulement s'il reste des quêtes non réclamées (rejointes ou non :
  // le rappel invite aussi à en rejoindre).
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
