/*
  services/loader.js
  --------------------------------------------------------------------
  Chargeur d'assets générique : précharge une liste d'images (URLs ou
  objets Image déjà créés ailleurs, ex. Game.blockImages) et rapporte
  une progression réelle (0 → 1). Chaque image résout sa promesse aussi
  bien sur succès que sur échec (image manquante/404) : un asset cassé
  ne bloque jamais indéfiniment un écran de chargement — cf.
  ui/loading.js pour le filet de sécurité supplémentaire (timeout
  global).
  --------------------------------------------------------------------
*/
export const Loader = {
  waitForImage(img) {
    return new Promise((resolve) => {
      if (img.complete) {
        resolve(img);
        return;
      }

      img.addEventListener("load", () => resolve(img), { once: true });
      img.addEventListener("error", () => resolve(img), { once: true });
    });
  },

  async preload(items, onProgress) {
    const total = items.length;

    if (total === 0) {
      if (onProgress) onProgress(1);
      return;
    }

    let loaded = 0;

    await Promise.all(items.map(async (item) => {
      const img = typeof item === "string" ? new Image() : item;
      if (typeof item === "string") img.src = item;

      await this.waitForImage(img);

      loaded++;
      if (onProgress) onProgress(loaded / total);
    }));
  }
};
