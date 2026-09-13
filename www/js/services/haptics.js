/*
  services/haptics.js
  --------------------------------------------------------------------
  Retour haptique (plugin Capacitor natif si présent, sinon
  navigator.vibrate). Portage à l'identique de l'ancien js/haptics.js.
  --------------------------------------------------------------------
*/
export const Haptics = {
  enabled: true,

  setEnabled(value) {
    this.enabled = value;
  },

  hasPlugin() {
    return Boolean(
      window.Capacitor &&
      Capacitor.Plugins &&
      Capacitor.Plugins.Haptics
    );
  },

  vibrate(pattern) {
    if (!this.enabled) return;

    if (this.hasPlugin()) {
      const P = Capacitor.Plugins.Haptics;

      if (Array.isArray(pattern)) {
        let t = 0;

        pattern.forEach((value, index) => {
          if (index % 2 === 0) {
            const style = value >= 40 ? "MEDIUM" : "LIGHT";

            setTimeout(() => {
              P.impact({ style });
            }, t);
          }

          t += value;
        });
      } else if (typeof pattern === "number" && pattern >= 300) {
        const steps = Math.max(3, Math.min(7, Math.round(pattern / 180)));

        for (let i = 0; i < steps; i++) {
          setTimeout(() => {
            P.impact({ style: i === steps - 1 ? "MEDIUM" : "LIGHT" });
          }, i * 160);
        }
      } else if (typeof pattern === "number" && pattern >= 40) {
        P.impact({ style: "MEDIUM" });
      } else {
        P.impact({ style: "LIGHT" });
      }

      return;
    }

    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }
};
