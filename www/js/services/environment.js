/*
  services/environment.js
  --------------------------------------------------------------------
  Modèle "Environnement" (roadmap §3.2, Phase 2 — Moteur
  d'environnements). Un environnement regroupe les assets pilotés
  ensemble pour un groupe de thèmes visuels de même nature :
  assets.blocks (style de bloc partagé par les obstacles et l'overlay
  de défaite), assets.grid (asset de grille), assets.bestScoreFrame
  (cadre du bouton "meilleur score"), assets.vfx (palette d'effets
  visuels) et assets.sfx (sons spécifiques aux blocs spéciaux).

  Chaque thème visuel (services/visualtheme.js) déclare l'id de son
  environnement via son champ "environment". Il n'y a pas d'écran de
  sélection d'environnement séparé : l'environnement actif découle
  uniquement du thème visuel actif (précision Phase 2).

  assets.vfx et assets.sfx sont des surcouches OPTIONNELLES (roadmap
  §3.2) : un environnement qui ne les définit pas (comme "meadow"
  aujourd'hui) laisse le moteur générique déjà existant fonctionner à
  l'identique — aucune régression sur l'environnement de base.

  Deux environnements existent pour l'instant : "meadow" (thème
  Meadow) et "ice" (thème Frozen). D'autres pourront être ajoutés ici
  au fil des prochaines phases (roadmap §3.4 / §17) sans toucher au
  reste du moteur.
  --------------------------------------------------------------------
*/

export const Environments = {
  meadow: {
    id: "meadow",
    assets: {
      // Les blocs de couleur classiques (COLOR_BANK) restent, eux,
      // identiques dans tous les environnements.
      blocks: "stone",
      grid: "img/grid/grid-meadow.png",
      bestScoreFrame: "img/ui/best-score-meadow.png",
      // Pas de surcouche : l'environnement de base garde le
      // comportement générique existant (couleur de session aléatoire
      // pour les effets visuels, sons de blocs spéciaux inchangés).
      vfx: null,
      sfx: null
    }
  },

  ice: {
    id: "ice",
    assets: {
      blocks: "ice",
      grid: "img/grid/grid-ice.png",
      bestScoreFrame: "img/ui/best-score-ice.png",
      vfx: {
        // Teinte d'accent utilisée pour l'ambiance canvas, le halo de
        // grille vidée et les particules/débris de célébration —
        // remplace la couleur de session aléatoire uniquement pour cet
        // environnement.
        accent: "#8fe6ff",
        // Dégradés du badge combo (normal / mega) + couleur du texte.
        comboGradient: ["#eafcff", "#4fd7ff"],
        comboGradientMega: ["#ffffff", "#7fe4ff"],
        comboText: "#04425c"
      },
      sfx: {
        // Seuls les sons d'apparition/disparition des blocs spéciaux
        // varient par environnement (tous les autres restent
        // partagés, cf. services/audio.js). Pas d'échantillon dédié
        // pour l'instant : le moteur audio synthétise un timbre
        // "cristal" pour ces deux événements précis.
        obstacleSpawn: "ice",
        obstacleDespawn: "ice"
      }
    }
  }
};

export function getEnvironment(id) {
  return Environments[id] || Environments.meadow;
}
