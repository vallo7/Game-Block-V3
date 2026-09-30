/*
  core/game-difficulty.js
  --------------------------------------------------------------------
  Courbes de difficulté (tour / score / remplissage), tirage du nombre
  de cases requis pour le prochain tracé, et gestion de la file
  d'attente (queue) des 3 prochains blocs. Le "niveau du joueur" (futur
  Adventure, roadmap §2.4) n'a rien à voir avec ces courbes : elles ne
  concernent que le rythme de Classic/Adventure au sein d'une partie.
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { Tutorial } from "../ui/tutorial.js";

Object.assign(Game, {
  getDifficulty() {
    const turnCurve = 1 - Math.exp(-this.turn / 60);
    const scoreCurve = 1 - Math.exp(-this.score / 15000);
    const fill = this.getFillRatio();
    const fillCurve = Math.min(1, Math.max(0, (fill - 0.3) / 0.5));

    return Math.min(1, turnCurve * 0.6 + scoreCurve * 0.25 + fillCurve * 0.15);
  },

  // La courbe ci-dessus plafonne à 1 (autour du tour ~250-300). Au-delà de ce
  // plafond, cette seconde courbe très lente et sans limite continue de faire
  // évoluer la partie pour les joueurs qui durent très longtemps.
  getEndlessIntensity() {
    const longTurn = Math.max(0, this.turn - 150);
    const longScore = Math.max(0, this.score - 40000);

    return Math.log(1 + longTurn / 90 + longScore / 60000);
  },

  generateRequiredBlocks() {
    const diff = this.getDifficulty();
    const intensity = this.getEndlessIntensity();
    const fill = this.getFillRatio();

    const low = [6, 14, 22, 26, 20, 12];
    const high = [4, 8, 12, 20, 26, 30];

    const weights = low.map((value, index) => {
      return value + (high[index] - value) * diff;
    });

    if (intensity > 0) {
      const shift = Math.min(0.85, intensity * 0.18);
      weights[0] *= 1 - shift * 0.7;
      weights[1] *= 1 - shift * 0.5;
      weights[4] *= 1 + shift * 0.6;
      weights[5] *= 1 + shift * 0.9;
    }

    if (fill > 0.72) {
      weights[4] *= 0.64;
      weights[5] *= 0.42;
      weights[0] *= 1.08;
      weights[1] *= 1.14;
    }

    if (fill < 0.24) {
      weights[3] *= 1.08;
      weights[4] *= 1.12;
      weights[5] *= 1.08;
    }

    const total = weights.reduce((sum, value) => sum + value, 0);
    let random = Math.random() * total;

    for (let i = 0; i < weights.length; i++) {
      if (random < weights[i]) return i + 1;
      random -= weights[i];
    }

    return 3;
  },

  setupNextBlock() {
    if (Tutorial.active) {
      const forced = Tutorial.nextRequiredBlocks();
      if (forced !== null) {
        this.requiredBlocks = forced;
        this.turnColor = this.pickTurnColor();
        this.updateHUD();
        return;
      }
    }

    if (this.queue.length < 3) {
      this.queue.push(this.generateRequiredBlocks());
    }

    this.requiredBlocks = this.queue.shift();
    this.queue.push(this.generateRequiredBlocks());

    this.turnColor = this.pickTurnColor();
    this.updateHUD();
  }
});
