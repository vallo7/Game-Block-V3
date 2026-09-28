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

  Round performance : les URLs (items de type string) sont désormais
  dédupliquées via un cache de promesses (_imageCache). Avant, chaque
  appel à preload() recréait un nouvel objet Image pour CHAQUE URL,
  même déjà chargée — or l'écran de chargement est rejoué à chaque
  transition menu ↔ jeu (fonds de thème re-préchargés à chaque fois),
  et plusieurs environnements/thèmes partagent désormais les mêmes
  assets (grille et cadre de meilleur score identiques pour tous, cf.
  services/environment.js). Résultat : une même URL n'est instanciée
  qu'une seule fois pendant toute la session, les transitions suivantes
  se résolvent instantanément, et la progression affichée reste exacte
  (un item déjà en cache compte comme chargé dès l'appel). Les objets
  Image passés directement (Game.blockImages...) ne sont pas concernés :
  ils sont déjà uniques et suivis par leur propriétaire.
  --------------------------------------------------------------------
*/
export const Loader = {
  // src -> Promise<HTMLImageElement>. Une entrée réussie n'est jamais
  // retirée : l'ensemble des assets du jeu est petit et borné (fonds,
  // blocs, grilles), et les garder vivants évite au navigateur de les
  // re-décoder après une éviction de cache.
  _imageCache: new Map(),

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

  loadImageOnce(src) {
    const cached = this._imageCache.get(src);
    if (cached) return cached;

    const img = new Image();
    img.src = src;

    // Une image en échec (404, coupure réseau) n'est PAS gardée en cache :
    // un prochain preload() retentera sa requête au lieu de resservir
    // indéfiniment un échec mémorisé.
    const promise = this.waitForImage(img).then((loadedImg) => {
      if (!loadedImg.naturalWidth) this._imageCache.delete(src);
      return loadedImg;
    });
    this._imageCache.set(src, promise);

    return promise;
  },

  async preload(items, onProgress) {
    const total = items.length;

    if (total === 0) {
      if (onProgress) onProgress(1);
      return;
    }

    let loaded = 0;

    await Promise.all(items.map(async (item) => {
      if (typeof item === "string") {
        await this.loadImageOnce(item);
      } else {
        await this.waitForImage(item);
      }

      loaded++;
      if (onProgress) onProgress(loaded / total);
    }));
  }
};
