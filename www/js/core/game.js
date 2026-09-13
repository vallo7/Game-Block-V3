/*
  core/game.js
  --------------------------------------------------------------------
  Barrel : assemble les 6 modules core/game-*.js (input, rules,
  obstacles, difficulty, flow, render) sur le socle game-state.js en un
  seul objet Game partagé (roadmap §5). Importer ce fichier suffit pour
  obtenir un Game entièrement fonctionnel.

  Les fichiers qui n'ont besoin que de l'état de base (Ads, Tutorial)
  importent directement core/game-state.js plutôt que ce barrel, pour
  éviter un cycle d'import inutile — cf. PHASE1-NOTES.md.
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import "./game-input.js";
import "./game-rules.js";
import "./game-obstacles.js";
import "./game-difficulty.js";
import "./game-flow.js";
import "./game-render.js";

export { Game };
export default Game;
