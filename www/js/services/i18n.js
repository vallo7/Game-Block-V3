/*
  services/i18n.js
  --------------------------------------------------------------------
  Localisation (roadmap, demande explicite "langue de base anglais,
  bascule vers le français dans les réglages"). Dictionnaire EN/FR
  centralisé + t(key, vars) pour toutes les chaînes affichées au
  joueur : le HTML statique (index.html) porte des attributs
  data-i18n/data-i18n-attr appliqués par apply() ; les écrans générés
  dynamiquement (Trophées, Quêtes, Marketplace, Thèmes) appellent t()
  directement dans leur propre render(), et se ré-affichent tout seuls
  via I18n.onChange() (câblé une fois par écran dans app.js).

  Restent volontairement NON traduits, dans les deux langues : les mots
  de praise ("NICE!", "GREAT!"...) — ce sont des exclamations/éléments
  de marque du jeu, pas du texte descriptif, exactement comme "COMBO"
  reste universel — et les noms de marque ("Game Block"). Les
  attributs aria-label (accessibilité, invisibles à l'écran) restent
  également en anglais pour cette première passe.

  L'anglais est la langue par défaut et sert de repli si une clé
  manque en français (t() retombe sur STRINGS.en, puis sur la clé
  elle-même en tout dernier recours — jamais un texte manquant à
  l'écran).
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";

const STRINGS = {
  en: {
    "settings.title": "Settings",
    "settings.pauseTitle": "Pause",
    "settings.sound": "Sound",
    "settings.music": "Music",
    "settings.vibrations": "Vibrations",
    "settings.language": "Language",
    "settings.aboutUs": "About Us",

    "about.tagline": "Draw. Clear. Survive.",

    "rateUs.title": "Enjoying Game Block?",
    "rateUs.text": "A quick rating helps us a lot!",
    "rateUs.button": "Rate us",
    "rateUs.dismiss": "Maybe later",

    "menu.classic": "CLASSIC",
    "menu.adventure": "ADVENTURE",

    "boost.newGame.name": "NEW GAME",
    "boost.newGame.desc": "Start a brand new run",
    "boost.secondWind.name": "SECOND WIND",
    "boost.secondWind.desc": "Clear the trouble blocks, keep your score",
    "boost.freshStart.name": "FRESH START",
    "boost.freshStart.desc": "Wipe the board clean, keep your score",
    "boost.adTag": "AD",
    "boost.adTag2": "2 ADS",
    "gameOver.title": "NO MORE MOVES!",
    "gameOver.subtitle": "CHOOSE YOUR COMEBACK",

    "toast.offline": "No internet connection",
    "toast.adProgress": "Ad {done} of {total} done — keep going!",
    "toast.insufficientCoins": "Not enough Coins",

    "themes.title": "Themes",
    "trophies.title": "Trophies",
    "quests.title": "Quests",
    "marketplace.title": "Marketplace",

    "common.cancel": "Cancel",
    "common.buy": "Buy",
    "common.select": "Select",
    "common.active": "Active",
    "common.locked": "Locked",
    "common.owned": "Owned",
    "common.comingSoon": "Coming soon",
    "common.watchAd": "Watch Ad",
    "common.join": "Join",

    // ---------- Tutoriel ----------
    "tutorial.tapToStart": "TAP TO START",
    "tutorial.drawLine": "DRAW A LINE",
    "tutorial.finishLine": "FINISH THE LINE",
    "tutorial.clearColumn": "CLEAR THE COLUMN",
    "tutorial.gameOn": "GAME ON!",

    // ---------- Trophées ----------
    "trophies.category.score": "Score",
    "trophies.category.clear": "Perfect Clear",
    "trophies.category.combo": "Combo",
    "trophies.category.praise": "Praise",
    "trophies.category.endurance": "Endurance",
    "trophies.category.volume": "Dedication",
    "trophies.category.misc": "Miscellaneous",
    "trophies.secretName": "???",
    "trophies.secretDesc": "Secret trophy — keep playing to find out.",
    "trophies.reveal.trophyLabel": "Trophy Unlocked",
    "trophies.reveal.starLabel": "Star {star} Unlocked",
    "trophies.reveal.claim": "Claim +{amount}",
    "trophies.reveal.moreWaiting": "{count} more waiting",

    "trophy.warmup.name": "Warm-Up",
    "trophy.warmup.desc": "Score 30,000 points in a single run.",
    "trophy.rising-star.name": "Rising Star",
    "trophy.rising-star.desc": "Score 150,000 points in a single run.",
    "trophy.block-legend.name": "Block Legend",
    "trophy.block-legend.desc": "Score 600,000 points in a single run.",
    "trophy.grandmaster.name": "Grandmaster",
    "trophy.grandmaster.desc": "Score 1,500,000 points in a single run.",

    "trophy.spotless.name": "Spotless",
    "trophy.spotless.desc": "Achieve your first Perfect Clear.",
    "trophy.clean-sweep.name": "Clean Sweep",
    "trophy.clean-sweep.desc": "Achieve 75 Perfect Clears in total.",
    "trophy.immaculate.name": "Immaculate",
    "trophy.immaculate.desc": "Achieve 300 Perfect Clears in total.",
    "trophy.flawless-legend.name": "Flawless Legend",
    "trophy.flawless-legend.desc": "Achieve 750 Perfect Clears in total.",

    "trophy.chain-reaction.name": "Chain Reaction",
    "trophy.chain-reaction.desc": "Reach a x15 combo.",
    "trophy.unstoppable.name": "Unstoppable",
    "trophy.unstoppable.desc": "Reach a x36 combo.",
    "trophy.perfect-run.name": "Perfect Run",
    "trophy.perfect-run.desc": "Reach a x75 combo.",
    "trophy.combo-god.name": "Combo God",
    "trophy.combo-god.desc": "Reach a x120 combo.",

    "trophy.legendary.name": "Legendary!",
    "trophy.legendary.desc": "Trigger the LEGENDARY! praise.",
    "trophy.divine-streak.name": "Divine Streak",
    "trophy.divine-streak.desc": "Trigger DIVINE! or LEGENDARY! praise {n} times in total.",

    "trophy.marathoner.name": "Marathoner",
    "trophy.marathoner.desc": "Survive {n} turns in a single run.",

    "trophy.line-cutter.name": "Line Cutter",
    "trophy.line-cutter.desc": "Clear {n} lines in total.",
    "trophy.dedicated.name": "Dedicated",
    "trophy.dedicated.desc": "Play {n} games.",

    "trophy.personal-best.name": "Personal Best",
    "trophy.personal-best.desc": "Beat your best score in {n} different runs.",
    "trophy.frozen-over.name": "Frozen Over",
    "trophy.frozen-over.desc": "Play a run with the Frozen theme equipped.",
    "trophy.inferno-bound.name": "Inferno Bound",
    "trophy.inferno-bound.desc": "Play a run with the Inferno theme equipped.",
    "trophy.theme-collector.name": "Theme Collector",
    "trophy.theme-collector.desc": "Unlock every purchasable theme.",

    "trophy.steady-hand.name": "Steady Hand",
    "trophy.steady-hand.desc": "Complete a full 6-cell trace in a single move.",
    "trophy.quad-clear.name": "Quad Clear",
    "trophy.quad-clear.desc": "Clear 4 lines at once in a single move.",
    "trophy.double-perfect.name": "Double Perfect",
    "trophy.double-perfect.desc": "Achieve 2 Perfect Clears in the same run.",

    // ---------- Quêtes (Phase 9) ----------
    "quest.score": "Score {n} points in a single run",
    "quest.lines": "Clear {n} lines",
    "quest.perfectClear": "Achieve {n} Perfect Clear{s}",
    "quest.combo": "Reach a x{n} combo",
    "quest.games": "Play {n} games",
    "quest.watchAds": "Watch {n} ad{s}",
    "quests.complete": "Complete!",
    "quests.progress": "{progress} / {target}",
    "quests.summary": "{count} / {total} claimed",
    "quests.resetsIn": "Resets in {time}",
    "quests.reminder": "Quests are waiting for you!",
    "quest.joinToStart": "Join this quest to start making progress",
    "quests.countdownPending": "Complete {count} of {total} quests to start the reset timer",

    // ---------- Thèmes ----------
    "theme.default.name": "Meadow",
    "theme.ice.name": "Frozen",
    "theme.halloween.name": "Halloween",
    "theme.hell.name": "Inferno",
    "theme.halloween.tagline": "Ghosts, jack-o'-lanterns, a haunted grid",
    "theme.hell.tagline": "Molten grid, embers, infernal blocks",
    "theme.unlock.ice": "Reach a x8 combo in one Classic run",
    "theme.unlockPrice": "{price} Coins",

    // ---------- Marketplace ----------
    "market.coins.title": "Recharge Coins",
    "market.coins.sub": "Watch a few ads, get Coins — pick the offers you like.",
    "market.offers.amount": "+{coins} Coins",
    "market.offers.need": "Watch {n} ad{s}",
    "market.offers.button": "WATCH",
    "market.offers.claimed": "Claimed",
    "market.offers.bestDeal": "BEST DEAL",
    "market.offers.refresh": "Refresh",
    "market.offers.refreshFree": "FREE",
    "market.offers.newOffers": "New offers are here!",

    "wheel.title": "Lucky Wheel",
    "wheel.earned": "You earned {amount} Coins!",
    "wheel.subtitle": "Spin the wheel to boost your reward!",
    "wheel.subtitleShop": "Spin for a shot at big Coin prizes!",
    "wheel.spin": "SPIN!",
    "wheel.spinning": "GOOD LUCK…",
    "wheel.hint": "Every spin wins something!",
    "wheel.skip": "No thanks",
    "wheel.result.winTitle": "You won!",
    "wheel.result.x2": "Reward doubled!",
    "wheel.result.x3": "Reward tripled!",
    "wheel.result.coinsSmall": "Coin bonus!",
    "wheel.result.coinsBig": "Big coin bonus!",
    "wheel.result.adWin": "Ad bonus unlocked!",
    "wheel.result.adTitle": "Watch & win!",
    "wheel.result.adDesc1": "Watch 1 ad to win a bonus",
    "wheel.result.adDesc2": "Watch 2 ads to win a bigger bonus",
    "wheel.result.watch": "Watch",
    "wheel.result.coinsUnit": "Coins",
    "wheel.result.collect": "Awesome!",
    "wheel.shop.title": "Lucky Wheel",
    "wheel.shop.freeReady": "Free spin ready!",
    "wheel.shop.nextFree": "Free spin in {time}",
    "wheel.shop.spinFree": "SPIN — FREE",
    "wheel.shop.spinAd": "SPIN — WATCH AD",

    "market.cosmetics.title": "Cosmetics",
    "market.cosmetics.sub": "Backgrounds, decor and grid styles for your games.",
    "market.cosmetics.blockSkins": "Block Skins",
    "market.cosmetics.newEnvironments": "New Environments",
    "market.cosmetics.comingSoonDesc": "More cosmetics are on the way.",
    "market.theme.equipped": "Equipped in Themes",
    "market.theme.unlock": "Unlock — {price}",
    "market.theme.confirmTitle": "Unlock {theme}",
    "market.theme.confirmDesc": "Background, decor and grid color for the {theme} theme."
  },

  fr: {
    "settings.title": "Réglages",
    "settings.pauseTitle": "Pause",
    "settings.sound": "Son",
    "settings.music": "Musique",
    "settings.vibrations": "Vibrations",
    "settings.language": "Langue",
    "settings.aboutUs": "À propos",

    "about.tagline": "Trace. Efface. Survis.",

    "rateUs.title": "Tu aimes Game Block ?",
    "rateUs.text": "Une petite note nous aide énormément !",
    "rateUs.button": "Noter l'appli",
    "rateUs.dismiss": "Plus tard",

    "menu.classic": "CLASSIQUE",
    "menu.adventure": "AVENTURE",

    "boost.newGame.name": "NOUVELLE PARTIE",
    "boost.newGame.desc": "Recommence une toute nouvelle partie",
    "boost.secondWind.name": "SECOND SOUFFLE",
    "boost.secondWind.desc": "Efface les blocs à problème, garde ton score",
    "boost.freshStart.name": "NOUVEAU DÉPART",
    "boost.freshStart.desc": "Vide le plateau, garde ton score",
    "boost.adTag": "PUB",
    "boost.adTag2": "2 PUBS",
    "gameOver.title": "PLUS AUCUN COUP POSSIBLE !",
    "gameOver.subtitle": "CHOISIS TON RETOUR",

    "toast.offline": "Pas de connexion internet",
    "toast.adProgress": "Pub {done} sur {total} terminée — continue !",
    "toast.insufficientCoins": "Pas assez de Coins",

    "themes.title": "Thèmes",
    "trophies.title": "Trophées",
    "quests.title": "Quêtes",
    "marketplace.title": "Boutique",

    "common.cancel": "Annuler",
    "common.buy": "Acheter",
    "common.select": "Choisir",
    "common.active": "Actif",
    "common.locked": "Verrouillé",
    "common.owned": "Possédé",
    "common.comingSoon": "Bientôt",
    "common.watchAd": "Regarder une pub",
    "common.join": "Rejoindre",

    "tutorial.tapToStart": "TAPE POUR COMMENCER",
    "tutorial.drawLine": "TRACE UNE LIGNE",
    "tutorial.finishLine": "TERMINE LA LIGNE",
    "tutorial.clearColumn": "EFFACE LA COLONNE",
    "tutorial.gameOn": "C'EST PARTI !",

    "trophies.category.score": "Score",
    "trophies.category.clear": "Perfect Clear",
    "trophies.category.combo": "Combo",
    "trophies.category.praise": "Praise",
    "trophies.category.endurance": "Endurance",
    "trophies.category.volume": "Assiduité",
    "trophies.category.misc": "Divers",
    "trophies.secretName": "???",
    "trophies.secretDesc": "Trophée secret — continue à jouer pour le découvrir.",
    "trophies.reveal.trophyLabel": "Trophée débloqué",
    "trophies.reveal.starLabel": "Étoile {star} débloquée",
    "trophies.reveal.claim": "Réclamer +{amount}",
    "trophies.reveal.moreWaiting": "{count} de plus en attente",

    "trophy.warmup.name": "Échauffement",
    "trophy.warmup.desc": "Marque 30 000 points en une seule partie.",
    "trophy.rising-star.name": "Étoile montante",
    "trophy.rising-star.desc": "Marque 150 000 points en une seule partie.",
    "trophy.block-legend.name": "Légende des blocs",
    "trophy.block-legend.desc": "Marque 600 000 points en une seule partie.",
    "trophy.grandmaster.name": "Grand maître",
    "trophy.grandmaster.desc": "Marque 1 500 000 points en une seule partie.",

    "trophy.spotless.name": "Impeccable",
    "trophy.spotless.desc": "Réalise ton premier Perfect Clear.",
    "trophy.clean-sweep.name": "Nettoyage complet",
    "trophy.clean-sweep.desc": "Réalise 75 Perfect Clears au total.",
    "trophy.immaculate.name": "Immaculé",
    "trophy.immaculate.desc": "Réalise 300 Perfect Clears au total.",
    "trophy.flawless-legend.name": "Légende sans faille",
    "trophy.flawless-legend.desc": "Réalise 750 Perfect Clears au total.",

    "trophy.chain-reaction.name": "Réaction en chaîne",
    "trophy.chain-reaction.desc": "Atteins un combo x15.",
    "trophy.unstoppable.name": "Imparable",
    "trophy.unstoppable.desc": "Atteins un combo x36.",
    "trophy.perfect-run.name": "Parcours parfait",
    "trophy.perfect-run.desc": "Atteins un combo x75.",
    "trophy.combo-god.name": "Dieu du combo",
    "trophy.combo-god.desc": "Atteins un combo x120.",

    "trophy.legendary.name": "Légendaire !",
    "trophy.legendary.desc": "Déclenche le praise LEGENDARY!.",
    "trophy.divine-streak.name": "Séquence divine",
    "trophy.divine-streak.desc": "Déclenche le praise DIVINE! ou LEGENDARY! {n} fois au total.",

    "trophy.marathoner.name": "Marathonien",
    "trophy.marathoner.desc": "Survis {n} tours en une seule partie.",

    "trophy.line-cutter.name": "Découpeur de lignes",
    "trophy.line-cutter.desc": "Efface {n} lignes au total.",
    "trophy.dedicated.name": "Dévoué",
    "trophy.dedicated.desc": "Joue {n} parties.",

    "trophy.personal-best.name": "Record personnel",
    "trophy.personal-best.desc": "Bats ton record en {n} parties différentes.",
    "trophy.frozen-over.name": "Pris par le gel",
    "trophy.frozen-over.desc": "Joue une partie avec le thème Frozen équipé.",
    "trophy.inferno-bound.name": "Aux portes de l'enfer",
    "trophy.inferno-bound.desc": "Joue une partie avec le thème Inferno équipé.",
    "trophy.theme-collector.name": "Collectionneur de thèmes",
    "trophy.theme-collector.desc": "Débloque tous les thèmes.",

    "trophy.steady-hand.name": "Main sûre",
    "trophy.steady-hand.desc": "Complète un tracé de 6 cases en un seul geste.",
    "trophy.quad-clear.name": "Quadruple effacement",
    "trophy.quad-clear.desc": "Efface 4 lignes d'un coup en un seul geste.",
    "trophy.double-perfect.name": "Double parfait",
    "trophy.double-perfect.desc": "Réalise 2 Perfect Clears dans la même partie.",

    "quest.score": "Marque {n} points en une seule partie",
    "quest.lines": "Efface {n} lignes",
    "quest.perfectClear": "Réalise {n} Perfect Clear{s}",
    "quest.combo": "Atteins un combo x{n}",
    "quest.games": "Joue {n} parties",
    "quest.watchAds": "Regarde {n} pub{s}",
    "quests.complete": "Terminée !",
    "quests.progress": "{progress} / {target}",
    "quests.summary": "{count} / {total} réclamées",
    "quests.resetsIn": "Réinitialisation dans {time}",
    "quests.reminder": "Des quêtes t'attendent !",
    "quest.joinToStart": "Rejoins cette quête pour commencer à progresser",
    "quests.countdownPending": "Termine {count} quêtes sur {total} pour lancer le compte à rebours",

    "theme.default.name": "Prairie",
    "theme.ice.name": "Givré",
    "theme.halloween.name": "Halloween",
    "theme.hell.name": "Enfer",
    "theme.halloween.tagline": "Fantômes, citrouilles, une grille hantée",
    "theme.hell.tagline": "Grille en fusion, braises, blocs infernaux",
    "theme.unlock.ice": "Atteins un combo x8 en une partie Classique",
    "theme.unlockPrice": "{price} Coins",

    "market.coins.title": "Recharger des Coins",
    "market.coins.sub": "Regarde quelques pubs, gagne des Coins — choisis les offres qui te plaisent.",
    "market.offers.amount": "+{coins} Coins",
    "market.offers.need": "Regarde {n} pub{s}",
    "market.offers.button": "REGARDER",
    "market.offers.claimed": "Récupérée",
    "market.offers.bestDeal": "TOP OFFRE",
    "market.offers.refresh": "Actualiser",
    "market.offers.refreshFree": "GRATUIT",
    "market.offers.newOffers": "De nouvelles offres sont arrivées !",

    "wheel.title": "Roue de la chance",
    "wheel.earned": "Tu as gagné {amount} Coins !",
    "wheel.subtitle": "Tourne la roue pour booster ta récompense !",
    "wheel.subtitleShop": "Tourne pour tenter de gros gains de Coins !",
    "wheel.spin": "TOURNER !",
    "wheel.spinning": "BONNE CHANCE…",
    "wheel.hint": "Chaque tour est gagnant !",
    "wheel.skip": "Non merci",
    "wheel.result.winTitle": "Gagné !",
    "wheel.result.x2": "Récompense doublée !",
    "wheel.result.x3": "Récompense triplée !",
    "wheel.result.coinsSmall": "Bonus de Coins !",
    "wheel.result.coinsBig": "Gros bonus de Coins !",
    "wheel.result.adWin": "Bonus pub débloqué !",
    "wheel.result.adTitle": "Regarde et gagne !",
    "wheel.result.adDesc1": "Regarde 1 pub pour gagner un bonus",
    "wheel.result.adDesc2": "Regarde 2 pubs pour gagner un gros bonus",
    "wheel.result.watch": "Regarder",
    "wheel.result.coinsUnit": "Coins",
    "wheel.result.collect": "Génial !",
    "wheel.shop.title": "Roue de la chance",
    "wheel.shop.freeReady": "Tour gratuit prêt !",
    "wheel.shop.nextFree": "Tour gratuit dans {time}",
    "wheel.shop.spinFree": "TOURNER — GRATUIT",
    "wheel.shop.spinAd": "TOURNER — REGARDER UNE PUB",

    "market.cosmetics.title": "Cosmétiques",
    "market.cosmetics.sub": "Fonds, décors et styles de grille pour tes parties.",
    "market.cosmetics.blockSkins": "Styles de blocs",
    "market.cosmetics.newEnvironments": "Nouveaux environnements",
    "market.cosmetics.comingSoonDesc": "D'autres cosmétiques arrivent bientôt.",
    "market.theme.equipped": "Équipé dans Thèmes",
    "market.theme.unlock": "Débloquer — {price}",
    "market.theme.confirmTitle": "Débloquer {theme}",
    "market.theme.confirmDesc": "Fond, décor et couleur de grille pour le thème {theme}."
  }
};

export const I18n = {
  lang: "en",
  listeners: [],

  init() {
    this.lang = Storage.getLanguage();
    this.apply();
  },

  // callback(lang) — appelé après chaque changement de langue, une fois
  // le DOM statique déjà réappliqué. Chaque écran dynamique (Trophées,
  // Quêtes, Marketplace...) s'enregistre ici pour se ré-afficher.
  onChange(callback) {
    this.listeners.push(callback);
  },

  setLanguage(lang) {
    if (lang !== "en" && lang !== "fr") return;
    if (this.lang === lang) return;

    this.lang = lang;
    Storage.saveLanguage(lang);
    this.apply();

    this.listeners.forEach(cb => cb(lang));
  },

  // Remplace {token} par vars.token dans la chaîne résolue.
  t(key, vars) {
    const dict = STRINGS[this.lang] || STRINGS.en;
    let str = dict[key] !== undefined ? dict[key] : (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);

    if (vars) {
      Object.keys(vars).forEach(token => {
        str = str.split(`{${token}}`).join(String(vars[token]));
      });
    }

    return str;
  },

  // Applique les traductions au DOM statique (index.html) — texte via
  // data-i18n, attribut via data-i18n-attr="attribut:clé".
  apply() {
    document.documentElement.lang = this.lang;

    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      const [attr, key] = el.dataset.i18nAttr.split(":");
      if (attr && key) el.setAttribute(attr, this.t(key));
    });
  }
};
