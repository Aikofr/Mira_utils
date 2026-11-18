import { errorText, info, plain } from './log';

/**
 * Contrat d'un module de mira_utils (côté client comme côté serveur).
 *
 * - `init` : appelé une fois au chargement du script. Enregistrer ici événements,
 *   commandes et hooks (les natives restent dans les étapes du cycle de vie : onInit, onGameLoaded…).
 * - `dispose` : appelé au `resourceStop` (restart / stop) pour tout nettoyer :
 *   ticks, commandes, effets appliqués au joueur, entités créées.
 */
export interface MiraModule {
  readonly name: string;
  init(): void;
  dispose?(): void;
}

/** Démarre les modules dans l'ordre et les arrête dans l'ordre inverse au resourceStop. */
export function startModules(
  modules: readonly MiraModule[],
  onStop: (handler: () => void) => void,
  /** Étiquette du message « modules chargés » (serveur seulement : la signature de la ressource). */
  signature?: string,
): void {
  const started: MiraModule[] = [];

  for (const module of modules) {
    try {
      module.init();
      started.push(module);
    } catch (err) {
      info(module.name, `échec du module : ${errorText(err)}`);
    }
  }

  onStop(() => {
    for (const module of [...started].reverse()) {
      try {
        module.dispose?.();
      } catch (err) {
        info(module.name, `échec de l'arrêt du module : ${errorText(err)}`);
      }
    }
  });

  const list = started.map((m) => m.name).join(', ') || 'aucun';
  if (signature) info(signature, `modules chargés : ${list}`);
  else plain(`modules chargés : ${list}`);
}
