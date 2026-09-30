/*
  ui/fx.js
  --------------------------------------------------------------------
  Petits effets DOM partagés par les écrans de récompense (roue de la
  chance, boutique, quêtes...) : rebond d'un compteur, gerbe de pièces,
  confettis. Tous s'auto-nettoient après leur animation (aucun état).
  Les styles vivent dans css/marketplace-page.css (.coin-spark) et
  css/wheel.css (.wheel-confetti).
  --------------------------------------------------------------------
*/

const CONFETTI_COLORS = ["#f91487", "#fde402", "#46f30d", "#23a8fd", "#9a0bf9", "#ffb100", "#ffffff"];

// Rejoue l'animation "bump" d'un élément (classe posée dans la CSS de
// l'élément, ex. #coinCounterValue.bump).
export function bump(el) {
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

// Fait rebondir les trois compteurs de Coins (accueil, jeu, boutique).
export function bumpCoinCounters() {
  ["marketplaceCoinValue", "coinCounterValue", "gameCoinCounterValue", "gameOverCoinCounterValue"].forEach(id => {
    bump(document.getElementById(id));
  });
}

// Gerbe de pièces dorées jaillissant du centre de `anchorEl`.
export function spawnCoinBurst(anchorEl, count = 10) {
  if (!anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement("div");
    spark.className = "coin-spark";

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 46 + Math.random() * 40;

    spark.style.left = `${cx - 5}px`;
    spark.style.top = `${cy - 5}px`;
    spark.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
    spark.style.setProperty("--sy", `${Math.sin(angle) * dist - 22}px`);

    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 700);
  }
}

// Confettis qui jaillissent d'un point de l'écran (x, y en pixels
// fenêtre) puis retombent en tournoyant.
export function spawnConfetti(x, y, count = 28) {
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "wheel-confetti";

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const power = 120 + Math.random() * 190;
    const tx = Math.cos(angle) * power;
    const ty = Math.sin(angle) * power + 160 + Math.random() * 140;

    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty("--tx", `${tx.toFixed(0)}px`);
    piece.style.setProperty("--ty", `${ty.toFixed(0)}px`);
    piece.style.setProperty("--rot", `${(Math.random() * 900 - 450).toFixed(0)}deg`);
    piece.style.animationDuration = `${1100 + Math.random() * 700}ms`;

    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1900);
  }
}

// Compte de 0 à `to` en `duration` ms dans `el` (annonce de gain).
export function countUp(el, to, duration = 750) {
  if (!el) return;

  const start = performance.now();
  const target = Math.max(0, Math.floor(to));

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);

    el.textContent = Math.round(target * eased).toLocaleString();

    if (t < 1 && el.isConnected) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}
