/*
  ui/wheel.js
  --------------------------------------------------------------------
  Roue de la chance (V2) — mise en scène. La logique (cases, tirage,
  anti-frustration, file de récompenses, rythme de la boutique) vit dans
  services/wheel.js ; ce module ne fait que dessiner et animer.

  Deux usages, une seule roue :
  - present()/presentQueued() : pop-up plein écran, très mis en avant
    (rayons qui tournent, ampoules qui clignotent, étincelles, halo qui
    pulse, bouton qui rebondit), affiché quand le joueur gagne des Coins
    (trophées/quêtes réclamés, Perfect Clear avant le panneau de défaite).
    Un seul tour par pop-up ; "Non merci" est toujours possible.
  - mountShopCard() : la même roue, en version carte, sous les offres de
    la section Recharge Coins de la boutique (1 tour gratuit toutes les
    4 h, les suivants coûtent 1 pub).

  Le tour est piloté image par image en JS (et non par une transition
  CSS) pour connaître l'angle à chaque frame : on peut ainsi déclencher
  un "tic" sonore et le sursaut de l'aiguille à chaque case franchie,
  comme une vraie roue à ergots. La case gagnante est décidée AVANT le
  tour (WheelService.roll) puis l'animation est calculée pour s'y
  arrêter (aucune triche possible, aucune dépendance à la physique).

  Chaque case est gagnante : les cases pub proposent un gain plus gros
  contre 1 ou 2 pubs, refusable via "Non merci" sans aucune pénalité.
  Les Coins de base étant déjà crédités, tout gain de la roue est un
  BONUS crédité via WheelService.credit() (Economy.earn).
  --------------------------------------------------------------------
*/
import { WHEEL } from "../config/gameConfig.js";
import { WheelService } from "../services/wheel.js";
import { Ads } from "../services/ads.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { I18n } from "../services/i18n.js";
import { spawnCoinBurst, spawnConfetti, countUp, bumpCoinCounters } from "./fx.js";

const NS = "http://www.w3.org/2000/svg";
const VIEW = 240;
const C = VIEW / 2;
const R_SEGMENT = 100;
const R_RIM = 110;
const BULB_COUNT = 16;

// Palette reprise sur COLOR_BANK (config/gameConfig.js) : la roue parle
// la même langue visuelle que les blocs du jeu.
const KIND_STYLE = {
  x2: { light: "#8bee0a", dark: "#2fc203", text: "#052e0b", stroke: "rgba(255,255,255,0.55)" },
  x3: { light: "#c26bff", dark: "#6505cb", text: "#ffffff", stroke: "rgba(40,0,80,0.6)" },
  coinsSmall: { light: "#fff05a", dark: "#fdb701", text: "#4a3b00", stroke: "rgba(255,255,255,0.55)" },
  coinsBig: { light: "#ffc94d", dark: "#ff8a00", text: "#4a2300", stroke: "rgba(255,255,255,0.5)" },
  ad1: { light: "#ff5fb0", dark: "#d00245", text: "#ffffff", stroke: "rgba(90,0,40,0.6)" },
  ad2: { light: "#4fb0ff", dark: "#0045f1", text: "#ffffff", stroke: "rgba(0,20,90,0.6)" }
};

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" class="svg-icon"><path d="M8 5v14l11-7Z"></path></svg>';

const VIDEO_BADGE_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="3" y="5" width="18" height="14" rx="4"></rect><path d="M10 9.5v5l4.5-2.5Z" fill="currentColor"></path></svg>';

let instanceCounter = 0;

// Annonce de résultat actuellement ouverte (pop-up OU carte de la
// boutique) : sert au bouton retour Android, qui doit la refermer
// plutôt que de laisser l'écran du dessous réagir.
let activeResult = null;

function polar(angleDeg, radius) {
  const a = (angleDeg * Math.PI) / 180;
  return [C + radius * Math.sin(a), C - radius * Math.cos(a)];
}

function fmt(n) {
  return Number(n).toLocaleString();
}

function formatCountdown(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

// ---------------------------------------------------------------------
// Roue (stage) : disque SVG qui tourne + jante/ampoules/moyeu fixes +
// aiguille. Renvoie un contrôleur { el, spinTo, highlight, destroy }.
// ---------------------------------------------------------------------
function segmentContent(segment, style) {
  const amount = fmt(segment.bonus);
  const textAttrs =
    `fill="${style.text}" stroke="${style.stroke}" stroke-width="3" paint-order="stroke" ` +
    'stroke-linejoin="round" text-anchor="middle" font-family="Baloo 2, Arial, sans-serif" font-weight="900"';

  if (segment.kind === "x2" || segment.kind === "x3") {
    const label = segment.kind === "x2" ? "×2" : "×3";

    return (
      `<text x="${C}" y="${C - 60}" font-size="31" ${textAttrs}>${label}</text>` +
      `<text x="${C}" y="${C - 41}" font-size="13" ${textAttrs}>+${amount}</text>`
    );
  }

  if (segment.ads) {
    const badges = segment.ads === 1 ? [C - 10] : [C - 21, C + 1];
    const icons = badges.map(x =>
      `<rect x="${x}" y="${C - 88}" width="20" height="15" rx="5" fill="#ffffff" stroke="#0a0c4d" stroke-width="1.6"></rect>` +
      `<path d="M${x + 7.6} ${C - 84.6}v8.2l6.4-4.1Z" fill="${style.dark}"></path>`
    ).join("");

    return (
      icons +
      `<text x="${C}" y="${C - 50}" font-size="21" ${textAttrs}>+${amount}</text>`
    );
  }

  // Cases pièces : petite pièce dorée + montant.
  return (
    `<circle cx="${C}" cy="${C - 79}" r="9.5" fill="#ffe27a" stroke="#7a4d00" stroke-width="1.6"></circle>` +
    `<path d="M${C} ${C - 84.5}l1.9 3.9 4.2.5-3.1 2.8.9 4.2-3.9-2.2-3.9 2.2.9-4.2-3.1-2.8 4.2-.5Z" fill="#ffb100"></path>` +
    `<text x="${C}" y="${C - 50}" font-size="21" ${textAttrs}>+${amount}</text>`
  );
}

function buildStage(segments) {
  const id = ++instanceCounter;
  const count = segments.length;
  const segAngle = 360 / count;

  const stage = document.createElement("div");
  stage.className = "wheel-stage";

  const glow = document.createElement("div");
  glow.className = "wheel-glow";
  stage.appendChild(glow);

  // ----- Disque (tourne) -----
  const defs = Object.keys(KIND_STYLE).map(kind => {
    const s = KIND_STYLE[kind];

    return (
      `<radialGradient id="wg${id}-${kind}" cx="${C}" cy="${C}" r="${R_SEGMENT}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="18%" stop-color="${s.light}"></stop><stop offset="100%" stop-color="${s.dark}"></stop>` +
      "</radialGradient>"
    );
  }).join("");

  let discInner = `<defs>${defs}</defs>`;

  segments.forEach((segment, i) => {
    const style = KIND_STYLE[segment.kind];
    const a0 = i * segAngle;
    const a1 = (i + 1) * segAngle;
    const [x0, y0] = polar(a0, R_SEGMENT);
    const [x1, y1] = polar(a1, R_SEGMENT);
    const mid = a0 + segAngle / 2;

    discInner +=
      `<g class="wheel-seg" data-index="${i}">` +
      `<path d="M${C} ${C}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R_SEGMENT} ${R_SEGMENT} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" ` +
      `fill="url(#wg${id}-${segment.kind})" stroke="#0a0c4d" stroke-width="2.6" stroke-linejoin="round"></path>` +
      `<g transform="rotate(${mid.toFixed(2)} ${C} ${C})">${segmentContent(segment, style)}</g>` +
      "</g>";
  });

  const disc = document.createElementNS(NS, "svg");
  disc.setAttribute("viewBox", `0 0 ${VIEW} ${VIEW}`);
  disc.setAttribute("class", "wheel-disc");
  disc.innerHTML = discInner;
  stage.appendChild(disc);

  // ----- Jante fixe : anneau or, ampoules, moyeu -----
  let bulbs = "";
  for (let i = 0; i < BULB_COUNT; i++) {
    const [bx, by] = polar((360 / BULB_COUNT) * i, R_RIM);
    bulbs += `<circle class="wheel-bulb" cx="${bx.toFixed(2)}" cy="${by.toFixed(2)}" r="3.6"></circle>`;
  }

  const rim = document.createElementNS(NS, "svg");
  rim.setAttribute("viewBox", `0 0 ${VIEW} ${VIEW}`);
  rim.setAttribute("class", "wheel-rim");
  rim.innerHTML =
    `<defs><linearGradient id="wr${id}" x1="0" y1="0" x2="0" y2="1">` +
    '<stop offset="0%" stop-color="#fff2a8"></stop><stop offset="50%" stop-color="#ffc21a"></stop><stop offset="100%" stop-color="#c47a00"></stop>' +
    `</linearGradient><radialGradient id="wh${id}" cx="50%" cy="38%" r="65%">` +
    '<stop offset="0%" stop-color="#fff7c2"></stop><stop offset="100%" stop-color="#e79a00"></stop></radialGradient></defs>' +
    `<circle cx="${C}" cy="${C}" r="${R_RIM}" fill="none" stroke="#0a0c4d" stroke-width="17"></circle>` +
    `<circle cx="${C}" cy="${C}" r="${R_RIM}" fill="none" stroke="url(#wr${id})" stroke-width="11"></circle>` +
    `<circle cx="${C}" cy="${C}" r="${R_SEGMENT + 1}" fill="none" stroke="#0a0c4d" stroke-width="3.4"></circle>` +
    bulbs +
    `<circle cx="${C}" cy="${C}" r="23" fill="#0a0c4d"></circle>` +
    `<circle cx="${C}" cy="${C}" r="19" fill="url(#wh${id})"></circle>` +
    `<path d="M${C} ${C - 10}l3.2 6.6 7.2.9-5.3 4.9 1.4 7.1-6.5-3.7-6.5 3.7 1.4-7.1-5.3-4.9 7.2-.9Z" fill="#0a0c4d" opacity="0.85"></path>`;
  stage.appendChild(rim);

  // ----- Aiguille -----
  const pointer = document.createElement("div");
  pointer.className = "wheel-pointer";
  pointer.innerHTML =
    '<svg viewBox="0 0 40 56"><defs><linearGradient id="wp' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#ff5f7d"></stop><stop offset="100%" stop-color="#e0103a"></stop></linearGradient></defs>' +
    '<path d="M20 54 5 24A16 16 0 1 1 35 24Z" fill="#0a0c4d"></path>' +
    `<path d="M20 49 9.5 25A12.5 12.5 0 1 1 30.5 25Z" fill="url(#wp${id})"></path>` +
    '<circle cx="20" cy="16" r="5" fill="#fff2a8"></circle></svg>';
  stage.appendChild(pointer);

  // ----- État de rotation -----
  let rotation = 0;
  let frame = null;
  let destroyed = false;

  const setRotation = (deg) => {
    rotation = deg;
    disc.style.transform = `rotate(${deg}deg)`;
  };

  const flick = () => {
    pointer.classList.remove("flick");
    void pointer.offsetWidth;
    pointer.classList.add("flick");
  };

  // Lance le tour vers la case `index` ; résout quand la roue est
  // arrêtée. Aiguille en haut (angle 0), roue tournant dans le sens
  // horaire : l'aiguille lit l'angle local (-rotation mod 360).
  const spinTo = (index) => new Promise((resolve) => {
    const jitter = (Math.random() * 2 - 1) * 0.34;
    const localTarget = (index + 0.5 + jitter) * segAngle;
    const extraSpins = 5 + Math.floor(Math.random() * 2);

    const from = rotation;
    const windupTo = from - 14;
    const base = windupTo + extraSpins * 360;
    const delta = ((((360 - localTarget) - base) % 360) + 360) % 360;
    const to = base + delta;

    const windup = WHEEL.WINDUP_MS;
    const duration = WHEEL.SPIN_DURATION_MS;
    const start = performance.now();

    let lastIndex = -1;
    let lastTickAt = 0;

    stage.classList.add("is-spinning");
    GameAudio.playWheelSpinStart();
    Haptics.vibrate(25);

    const step = (now) => {
      if (destroyed) return resolve();

      const elapsed = now - start;

      if (elapsed < windup) {
        const t = elapsed / windup;
        setRotation(from + (windupTo - from) * (1 - Math.pow(1 - t, 2)));
        frame = requestAnimationFrame(step);
        return;
      }

      const t = Math.min(1, (elapsed - windup) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setRotation(windupTo + (to - windupTo) * eased);

      const pointerAngle = (((-rotation) % 360) + 360) % 360;
      const current = Math.floor(pointerAngle / segAngle);

      if (current !== lastIndex) {
        if (lastIndex !== -1 && now - lastTickAt > 42) {
          lastTickAt = now;
          GameAudio.playWheelTick(1 - t);
          flick();
          if (t < 0.8) Haptics.vibrate(6);
        }
        lastIndex = current;
      }

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setRotation(to);
        stage.classList.remove("is-spinning");
        stage.classList.add("is-landed");
        resolve();
      }
    };

    frame = requestAnimationFrame(step);
  });

  const highlight = (index) => {
    disc.classList.add("has-win");

    const target = disc.querySelector(`.wheel-seg[data-index="${index}"]`);
    if (target) target.classList.add("is-win");

    flick();
  };

  return {
    el: stage,
    spinTo,
    highlight,
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
    }
  };
}

// ---------------------------------------------------------------------
// Pop-up de résultat (annonce du gain / invitation à regarder des pubs)
// ---------------------------------------------------------------------
function resultKindLabel(kind) {
  return I18n.t(`wheel.result.${kind}`);
}

// Ouvre l'annonce d'un tour. `onFinish({ accepted })` est appelé quand le
// joueur ferme l'annonce (gain encaissé => accepted true ; pub refusée
// => false). Retourne { close(), isAdStage(), decline() } pour la
// gestion du bouton retour.
function openResult(segment, onFinish) {
  const overlay = document.createElement("div");
  overlay.className = "wheel-result-overlay";

  const card = document.createElement("div");
  card.className = "wheel-result-card";
  overlay.appendChild(card);

  document.body.appendChild(overlay);

  // Reflow forcé avant d'ajouter .show : la glissade d'entrée est une
  // transition, qui exige que l'état de départ ait été calculé.
  requestAnimationFrame(() => {
    void overlay.offsetWidth;
    overlay.classList.add("show");
  });

  let stage = segment.ads ? "ad" : "win";
  let closing = false;
  let busy = false;
  let handle = null;

  const finish = (accepted) => {
    if (closing) return;
    closing = true;

    if (activeResult === handle) activeResult = null;

    overlay.classList.remove("show");
    overlay.classList.add("out");

    setTimeout(() => {
      overlay.remove();
      if (onFinish) onFinish({ accepted });
    }, 240);
  };

  const showWin = () => {
    stage = "win";

    const kindKey = segment.ads ? "ad" : segment.kind;
    card.className = "wheel-result-card is-win";
    card.innerHTML =
      '<div class="wheel-result-icon coin">' + COIN_ICON_SVG + "</div>" +
      `<p class="wheel-result-title">${I18n.t("wheel.result.winTitle")}</p>` +
      `<p class="wheel-result-kind">${segment.ads ? I18n.t("wheel.result.adWin") : resultKindLabel(kindKey)}</p>` +
      `<div class="wheel-result-amount">${COIN_ICON_SVG}<span class="wheel-result-number">0</span></div>` +
      `<p class="wheel-result-unit">${I18n.t("wheel.result.coinsUnit")}</p>` +
      `<button type="button" class="wheel-result-btn wheel-result-collect">${I18n.t("wheel.result.collect")}</button>`;

    // Le bonus est crédité à l'instant de l'annonce : fermer l'app ou
    // l'écran juste après ne fait jamais perdre un gain.
    WheelService.credit(segment);
    WheelService.noteOutcome(segment, true);

    const number = card.querySelector(".wheel-result-number");
    countUp(number, segment.bonus, 800);

    GameAudio.playWheelWin();
    Haptics.vibrate([30, 40, 30, 40, 90]);
    bumpCoinCounters();

    const rect = card.getBoundingClientRect();
    spawnConfetti(rect.left + rect.width / 2, rect.top + 60, 34);
    spawnCoinBurst(card.querySelector(".wheel-result-icon"), 14);

    // Tous les boutons de la roue écoutent `click` et non `pointerdown`
    // (anti-clic accidentel, ui/press.js) : le pop-up apparaît souvent pile
    // sous le doigt qui vient de réclamer une récompense, et ne doit pas
    // encaisser/lancer/refuser sur ce simple contact. L'annonce est en
    // plus armée à son ouverture.
    card.querySelector(".wheel-result-collect").addEventListener("click", (event) => {
      event.stopPropagation();
      finish(true);
    });
  };

  const showAd = () => {
    stage = "ad";

    card.className = "wheel-result-card is-ad";
    card.innerHTML =
      '<div class="wheel-result-icon ad">' + VIDEO_BADGE_SVG + "</div>" +
      `<p class="wheel-result-title">${I18n.t("wheel.result.adTitle")}</p>` +
      `<p class="wheel-result-kind">${I18n.t(segment.ads === 1 ? "wheel.result.adDesc1" : "wheel.result.adDesc2")}</p>` +
      `<div class="wheel-result-amount">${COIN_ICON_SVG}<span class="wheel-result-number">+${fmt(segment.bonus)}</span></div>` +
      `<p class="wheel-result-unit">${I18n.t("wheel.result.coinsUnit")}</p>` +
      `<button type="button" class="wheel-result-btn wheel-result-watch">${PLAY_ICON_SVG}<span>${I18n.t("wheel.result.watch")}</span></button>` +
      `<button type="button" class="wheel-result-decline">${I18n.t("wheel.skip")}</button>`;

    GameAudio.playWheelLand();
    Haptics.vibrate([20, 30, 40]);

    card.querySelector(".wheel-result-watch").addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy) return;

      if (!Ads.isOnline()) {
        Ads.showOfflineMessage();
        return;
      }

      busy = true;

      Ads.showRewarded(() => {
        busy = false;
        showWin();
      }, { count: segment.ads }).then((started) => {
        if (!started) busy = false;
      });
    });

    card.querySelector(".wheel-result-decline").addEventListener("click", (event) => {
      event.stopPropagation();
      if (busy) return;

      WheelService.noteOutcome(segment, false);
      finish(false);
    });
  };

  if (segment.ads) showAd();
  else showWin();

  handle = {
    // Bouton retour : sur l'annonce d'une pub = "Non merci", sur une
    // annonce de gain = encaisser/fermer ; ignoré pendant une pub.
    back() {
      if (busy || closing) return;

      if (stage === "ad") {
        WheelService.noteOutcome(segment, false);
        finish(false);
      } else {
        finish(true);
      }
    }
  };

  activeResult = handle;
  return handle;
}

// ---------------------------------------------------------------------
// Pop-up plein écran
// ---------------------------------------------------------------------
let popup = null;

function buildSparkles() {
  let html = "";

  for (let i = 0; i < 16; i++) {
    const x = 4 + Math.random() * 92;
    const size = 8 + Math.random() * 14;
    const duration = 5 + Math.random() * 5;
    const delay = -Math.random() * duration;

    html += `<span class="wheel-sparkle" style="--x:${x.toFixed(1)}%;--s:${size.toFixed(1)}px;--d:${duration.toFixed(1)}s;--delay:${delay.toFixed(1)}s"></span>`;
  }

  return html;
}

export const LuckyWheel = {
  isOpen() {
    return Boolean(popup);
  },

  // Regroupe toutes les récompenses en attente (WheelService.queueReward)
  // en une seule roue. `delay` laisse le temps à l'animation de
  // réclamation précédente (éclat de pièces) de se terminer.
  presentQueued({ delay = 0 } = {}) {
    if (!WheelService.hasPending()) return Promise.resolve();

    return new Promise((resolve) => {
      setTimeout(() => {
        const base = WheelService.takePending();
        if (base <= 0) return resolve();
        this.present({ base }).then(resolve);
      }, delay);
    });
  },

  // Affiche la roue pour une récompense de base `base` (déjà créditée).
  // Résout quand le pop-up est entièrement refermé.
  present({ base }) {
    if (popup) {
      // Une roue est déjà ouverte : la récompense rejoint la file et sera
      // proposée à la prochaine occasion.
      WheelService.queueReward(base);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const segments = WheelService.buildSegments(base);
      const stage = buildStage(segments);

      const overlay = document.createElement("div");
      overlay.className = "wheel-overlay";
      overlay.innerHTML =
        '<div class="wheel-rays"></div>' +
        '<div class="wheel-vignette"></div>' +
        `<div class="wheel-sparkles">${buildSparkles()}</div>` +
        '<div class="wheel-card">' +
        `<p class="wheel-title">${I18n.t("wheel.title")}</p>` +
        `<div class="wheel-earned">${COIN_ICON_SVG}<span>${I18n.t("wheel.earned", { amount: fmt(base) })}</span></div>` +
        `<p class="wheel-subtitle">${I18n.t("wheel.subtitle")}</p>` +
        '<div class="wheel-stage-slot"></div>' +
        `<button type="button" class="wheel-spin-btn"><span>${I18n.t("wheel.spin")}</span></button>` +
        `<p class="wheel-hint">${I18n.t("wheel.hint")}</p>` +
        `<button type="button" class="wheel-skip">${I18n.t("wheel.skip")}</button>` +
        "</div>";

      overlay.querySelector(".wheel-stage-slot").appendChild(stage.el);
      document.body.appendChild(overlay);

      const spinBtn = overlay.querySelector(".wheel-spin-btn");
      const skipBtn = overlay.querySelector(".wheel-skip");

      const state = { phase: "idle", result: null };

      const close = () => {
        if (state.phase === "closing") return;
        state.phase = "closing";

        overlay.classList.remove("show");
        overlay.classList.add("out");

        setTimeout(() => {
          stage.destroy();
          overlay.remove();
          popup = null;
          resolve();
        }, 260);
      };

      const spin = async () => {
        if (state.phase !== "idle") return;
        state.phase = "spinning";

        GameAudio.unlock();
        GameAudio.playClick();

        spinBtn.disabled = true;
        spinBtn.classList.add("is-spinning");
        spinBtn.firstElementChild.textContent = I18n.t("wheel.spinning");
        skipBtn.classList.add("is-hidden");
        overlay.classList.add("is-spinning");

        const index = WheelService.roll(segments);
        const segment = segments[index];

        await stage.spinTo(index);

        state.phase = "landed";
        stage.highlight(index);
        GameAudio.playWheelLand();
        Haptics.vibrate([30, 50, 60]);

        setTimeout(() => {
          state.phase = "result";
          state.result = openResult(segment, () => close());
        }, 950);
      };

      spinBtn.addEventListener("click", (event) => {
        event.preventDefault();
        spin();
      });

      skipBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.phase !== "idle") return;
        close();
      });

      popup = {
        back() {
          if (state.phase === "idle") {
            GameAudio.playClick();
            close();
          }
          // Pendant le tour : le retour est ignoré ; sur l'annonce du
          // résultat, c'est l'annonce elle-même qui le gère (activeResult).
        }
      };

      requestAnimationFrame(() => {
        void overlay.offsetWidth;
        overlay.classList.add("show");
      });
      GameAudio.playTrophyUnlock();
      Haptics.vibrate([20, 40, 20, 40, 70]);
    });
  },

  // Bouton retour Android (App.handleBack) : true si la roue l'a absorbé.
  handleBack() {
    if (activeResult) {
      activeResult.back();
      return true;
    }

    if (popup) {
      popup.back();
      return true;
    }

    return false;
  },

  // ---------------------------------------------------------------------
  // Carte de la boutique : même roue, 1 tour gratuit toutes les 4 h puis
  // 1 pub par tour. Renvoie un contrôleur { el, destroy, isBusy }.
  // ---------------------------------------------------------------------
  mountShopCard({ onChange } = {}) {
    const segments = WheelService.buildSegments(WHEEL.SHOP_BASE);
    const stage = buildStage(segments);

    const card = document.createElement("div");
    card.className = "market-wheel-card market-pop";
    card.innerHTML =
      '<div class="market-wheel-head">' +
      `<p class="market-wheel-title">${I18n.t("wheel.shop.title")}</p>` +
      '<span class="market-wheel-status"></span>' +
      "</div>" +
      `<p class="market-wheel-sub">${I18n.t("wheel.subtitleShop")}</p>` +
      '<div class="wheel-stage-slot"></div>' +
      '<button type="button" class="wheel-spin-btn"><span></span></button>';

    card.querySelector(".wheel-stage-slot").appendChild(stage.el);

    const statusEl = card.querySelector(".market-wheel-status");
    const spinBtn = card.querySelector(".wheel-spin-btn");
    const labelEl = spinBtn.firstElementChild;

    let busy = false;
    let timer = null;

    const refreshStatus = () => {
      const ready = WheelService.shopFreeSpinReady();

      card.classList.toggle("is-free-ready", ready);
      spinBtn.classList.toggle("is-ad", !ready);

      if (ready) {
        statusEl.textContent = I18n.t("wheel.shop.freeReady");
        labelEl.textContent = I18n.t("wheel.shop.spinFree");
      } else {
        statusEl.textContent = I18n.t("wheel.shop.nextFree", { time: formatCountdown(WheelService.shopTimeUntilFree()) });
        labelEl.textContent = I18n.t("wheel.shop.spinAd");
      }
    };

    const runSpin = async () => {
      spinBtn.disabled = true;
      spinBtn.classList.add("is-spinning");
      card.classList.add("is-spinning");

      const index = WheelService.roll(segments);
      const segment = segments[index];

      await stage.spinTo(index);

      stage.highlight(index);
      GameAudio.playWheelLand();
      Haptics.vibrate([30, 50, 60]);

      await new Promise(resolve => setTimeout(resolve, 900));

      await new Promise((resolve) => {
        openResult(segment, () => resolve());
      });

      busy = false;
      spinBtn.disabled = false;
      spinBtn.classList.remove("is-spinning");
      card.classList.remove("is-spinning");

      // Nouvelle roue propre pour le tour suivant (la case gagnante est
      // remise à plat) ; le contrôleur parent re-rend la carte.
      if (onChange) onChange();
    };

    spinBtn.addEventListener("click", (event) => {
      event.preventDefault();
      if (busy) return;

      GameAudio.unlock();

      if (WheelService.shopFreeSpinReady()) {
        busy = true;
        WheelService.markShopFreeSpin();
        runSpin();
        return;
      }

      if (!Ads.isOnline()) {
        Ads.showOfflineMessage();
        return;
      }

      busy = true;

      Ads.showRewarded(() => {
        runSpin();
      }, { count: 1 }).then((started) => {
        if (!started) busy = false;
      });
    });

    refreshStatus();
    timer = setInterval(() => {
      if (!busy) refreshStatus();
    }, 20000);

    return {
      el: card,
      isBusy: () => busy,
      destroy() {
        clearInterval(timer);
        stage.destroy();
      }
    };
  }
};
