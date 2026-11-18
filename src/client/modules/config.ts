import { type ClientConfig, ConfigEvents, DEFAULT_CLIENT_CONFIG } from '../../shared/config';
import { debug, setDebug } from '../../shared/log';
import type { MiraModule } from '../../shared/module';

/** Valeurs par défaut jusqu'à la réponse du serveur (quelques millisecondes après le chargement). */
let current: ClientConfig = DEFAULT_CLIENT_CONFIG;

/** Config reçue du serveur (config.toml). À relire au moment de l'usage, pas à copier au démarrage. */
export function getConfig(): ClientConfig {
  return current;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Le serveur valide déjà les valeurs ; on revérifie quand même la forme reçue :
 * une valeur manquante ou non numérique donnerait NaN dans le tick du noclip
 * (et une téléportation vers des coordonnées invalides à chaque frame).
 */
function sanitize(data: unknown): ClientConfig {
  const noclip = (data as { noclip?: Record<string, unknown> } | null)?.noclip ?? {};
  const d = DEFAULT_CLIENT_CONFIG.noclip;
  return {
    debug: (data as { debug?: unknown } | null)?.debug === true,
    noclip: {
      speed: positive(noclip.speed, d.speed),
      fastMultiplier: positive(noclip.fastMultiplier, d.fastMultiplier),
      mouseCoefficient: positive(noclip.mouseCoefficient, d.mouseCoefficient),
    },
  };
}

/** Demande la config au serveur au chargement du script (aussi après un restart de la ressource). */
export const config: MiraModule = {
  name: 'config',

  init() {
    mp.events.onServer(ConfigEvents.Sync, (data: unknown) => {
      current = sanitize(data);
      setDebug(current.debug);
      debug('config', `reçue : noclip ${current.noclip.speed} m/s (×${current.noclip.fastMultiplier} avec Shift)`);
    });
    mp.events.emitServer(ConfigEvents.Request);
  },
};
