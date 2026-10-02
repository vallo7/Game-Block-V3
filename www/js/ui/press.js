/*
  ui/press.js
  --------------------------------------------------------------------
  Retour d'appui UNIFIÉ de tous les éléments cliquables du jeu (demande
  explicite : "tous les boutons cliquables ont un micro-délai +
  animation + son") ET protection contre les clics accidentels sur les
  boutons de récompense (récupération de Coins, SPIN...).

  1) UN SEUL ENDROIT pour le retour d'appui. Avant, chaque écran jouait
     son propre son, son propre rebond et sa propre temporisation
     (setTimeout 140-220 ms avant d'ouvrir un écran...) — avec des
     oublis et des écarts d'un bouton à l'autre. Désormais, au `click`
     d'un bouton (capture, avant tous les autres écouteurs) :
       - le son de clic est joué tout de suite ;
       - le rebond (.btn-pop) démarre tout de suite ;
       - l'ACTION réelle (le vrai `click`) est rejouée CLICK_DELAY_MS plus
         tard, ce qui laisse l'animation s'imprimer avant que l'écran
         change. Les écouteurs `click` existants n'ont rien à savoir : ils
         reçoivent leur événement, simplement un peu plus tard.

  2) ANTI-CLIC ACCIDENTEL. Cause du problème signalé : les boutons de
     récompense écoutaient `pointerdown` (déclenché dès que le doigt
     TOUCHE l'écran, y compris au début d'un défilement ou quand un
     pop-up apparaît pile sous le doigt) au lieu de `click` (déclenché
     seulement à un vrai appui-relâché sans défilement). Tous sont passés
     sur `click`, et ce module ajoute deux gardes :
       - un bouton de récompense (GUARDED) ne répond qu'après avoir été
         affiché depuis GUARD_MIN_AGE_MS : un bouton qui apparaît ou qui
         est recréé sous le doigt (rendu d'une liste, ouverture d'un
         pop-up) ignore l'appui qui l'a "surpris" ;
       - un pop-up modal (roue, annonce de gain, carte de trophée,
         confirmation d'achat) est "armé" MODAL_ARM_MS après son
         ouverture : tout ce qu'il contient ignore les appuis pendant ce
         laps (Press.arm() pour armer un autre élément à la main, ex. le
         panneau de fin de partie, les tiroirs).
     Un appui ignoré par une garde est avalé en silence (ni son ni
     action).

  Opt-out : data-press="off" (aucun traitement) ou data-press="silent"
  (pas de son, le reste s'applique).
  --------------------------------------------------------------------
*/
import { GameAudio } from "../services/audio.js";

// Éléments cliquables traités (en plus de tout <button>) : les deux
// "boutons" de l'écran de jeu qui sont des <div> (meilleur score,
// compteur de blocs) et tout élément role="button".
const PRESSABLE = "button, .best-score, .available-pill, [role='button']";

// Boutons de récompense/dépense : protégés par l'âge minimum.
const GUARDED = [
  ".quest-claim-btn", ".quest-skip-btn", ".quest-join-btn",
  ".market-offer-btn", ".market-refresh-btn", ".market-theme-action",
  ".market-confirm-buy", ".market-confirm-cancel",
  ".trophy-reveal-claim-btn",
  ".wheel-spin-btn", ".wheel-skip", ".wheel-result-btn", ".wheel-result-decline"
].join(", ");

// Pop-up modaux armés automatiquement à leur création.
const MODALS = ".wheel-overlay, .wheel-result-overlay, .trophy-reveal-overlay, .market-confirm-overlay";

// Délai entre l'appui (son + rebond) et l'action réelle : assez long pour
// que l'animation soit lue, assez court pour rester instantané au ressenti.
const CLICK_DELAY_MS = 80;

// Âge minimum d'un bouton de récompense avant qu'il ne réponde.
const GUARD_MIN_AGE_MS = 450;

// Durée d'armement d'un pop-up modal.
const MODAL_ARM_MS = 650;

// Déplacement maximal du doigt entre l'appui et le relâché pour que ce
// soit un tap et non un glissement.
const MAX_TAP_MOVE_PX = 16;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export const Press = {
  CLICK_DELAY_MS,

  _ready: false,
  _born: new WeakMap(),     // bouton gardé -> instant d'apparition
  _armed: new WeakMap(),    // élément -> instant jusqu'auquel il est armé
  _pending: new WeakSet(),  // boutons dont l'action est en attente
  _down: null,              // dernier appui (élément + position)

  init() {
    if (this._ready) return;
    this._ready = true;

    document.addEventListener("pointerdown", (event) => this.onDown(event), true);
    document.addEventListener("click", (event) => this.onClick(event), true);

    // Âge des boutons gardés + armement automatique des pop-up : un seul
    // observateur de DOM, sans coût tant que rien n'est ajouté.
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver((records) => this.onMutations(records));
      observer.observe(document.body, { childList: true, subtree: true });
    }
  },

  // Arme `el` pour `ms` millisecondes : tout élément pressable qu'il
  // contient ignore les appuis pendant ce laps.
  arm(el, ms = MODAL_ARM_MS) {
    if (el) this._armed.set(el, now() + ms);
  },

  onMutations(records) {
    const t = now();

    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;

        if (node.matches(MODALS)) this.arm(node, MODAL_ARM_MS);
        if (node.matches(GUARDED)) this._born.set(node, t);

        node.querySelectorAll(GUARDED).forEach((el) => this._born.set(el, t));
      }
    }
  },

  onDown(event) {
    const target = event.target;
    const el = target && target.closest ? target.closest(PRESSABLE) : null;

    this._down = el ? { el, x: event.clientX, y: event.clientY } : null;
  },

  // Vrai si l'appui doit être ignoré (garde d'âge ou élément armé).
  isBlocked(btn) {
    const t = now();

    for (let node = btn; node; node = node.parentElement) {
      const until = this._armed.get(node);
      if (until && t < until) return true;
    }

    const born = this._born.get(btn);
    return Boolean(born && t - born < GUARD_MIN_AGE_MS);
  },

  onClick(event) {
    if (event.__pressPassed) return;

    const target = event.target;
    const btn = target && target.closest ? target.closest(PRESSABLE) : null;

    if (!btn || btn.disabled || btn.dataset.press === "off") return;

    // Un vrai tap n'a pas bougé : un glissement qui finit sur un bouton
    // n'est pas un appui. (detail === 0 : clic clavier/programmatique.)
    const down = this._down;
    if (event.detail > 0 && down && down.el === btn) {
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > MAX_TAP_MOVE_PX) {
        this.swallow(event);
        return;
      }
    }

    if (this.isBlocked(btn) || this._pending.has(btn)) {
      this.swallow(event);
      return;
    }

    // Appui valide : on retient le vrai clic, on joue le retour tout de
    // suite, et on rejoue le clic après le micro-délai.
    this.swallow(event);
    this._pending.add(btn);

    this.feedback(btn);

    const init = { clientX: event.clientX, clientY: event.clientY, detail: event.detail };
    setTimeout(() => this.fire(btn, init), CLICK_DELAY_MS);
  },

  swallow(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  },

  feedback(btn) {
    if (btn.dataset.press !== "silent") {
      GameAudio.unlock();
      GameAudio.playClick();
    }

    btn.classList.remove("btn-pop");
    void btn.offsetWidth;
    btn.classList.add("btn-pop");

    setTimeout(() => btn.classList.remove("btn-pop"), 320);
  },

  fire(btn, init) {
    this._pending.delete(btn);

    // L'écran a pu changer pendant le micro-délai (re-rendu de la liste,
    // bouton désactivé) : on n'exécute plus une action devenue sans objet.
    if (!btn.isConnected || btn.disabled) return;

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: init.clientX,
      clientY: init.clientY,
      detail: init.detail
    });

    click.__pressPassed = true;
    btn.dispatchEvent(click);
  }
};
