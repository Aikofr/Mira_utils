import {
  type ClientConfig,
  ConfigEvents,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_SERVER_CONFIG,
  type ServerConfig,
} from '../../shared/config';
import { debug, info, setDebug } from '../../shared/log';
import type { MiraModule } from '../../shared/module';
import { readToml, type Table, table } from '../lib/toml';

/** Délai minimal entre deux envois de config à un même joueur (anti-spam). */
const REQUEST_COOLDOWN_MS = 2000;
const lastRequest = new Map<number, number>();

let clientConfig: ClientConfig = DEFAULT_CLIENT_CONFIG;
let serverConfig: ServerConfig = DEFAULT_SERVER_CONFIG;

/** Config complète côté serveur (lue au démarrage de la ressource). */
export function getServerConfig(): ServerConfig {
  return serverConfig;
}

/** Nombre borné ; sinon valeur par défaut avec un avertissement. */
function num(section: Table, key: string, fallback: number, min: number, max: number): number {
  const value = section[key];
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) return value;
  info('config', `${key} = ${String(value)} invalide (attendu ${min} à ${max}), ${fallback} utilisé`);
  return fallback;
}

function bool(section: Table, key: string, fallback: boolean): boolean {
  const value = section[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  info('config', `${key} = ${String(value)} invalide (attendu true ou false), ${fallback} utilisé`);
  return fallback;
}

function strings(section: Table, key: string, fallback: readonly string[]): readonly string[] {
  const value = section[key];
  if (value === undefined) return fallback;
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
  info('config', `${key} invalide (attendu une liste de textes), liste vide utilisée`);
  return fallback;
}

function load(): void {
  const raw = readToml('config.toml');
  if (!raw) {
    info('config', 'config.toml illisible : valeurs par défaut utilisées');
    clientConfig = DEFAULT_CLIENT_CONFIG;
    serverConfig = DEFAULT_SERVER_CONFIG;
    setDebug(DEFAULT_CLIENT_CONFIG.debug);
    return;
  }

  const general = table(raw.general);
  const admin = table(raw.admin);
  const spawn = table(raw.spawn);
  const noclip = table(raw.noclip);
  const teleport = table(raw.teleport);
  const vehicles = table(raw.vehicles);
  const dc = DEFAULT_CLIENT_CONFIG.noclip;
  const ds = DEFAULT_SERVER_CONFIG;

  // En premier : les messages de debug qui suivent en dépendent.
  const debugMode = bool(general, 'debug', DEFAULT_CLIENT_CONFIG.debug);
  setDebug(debugMode);

  clientConfig = {
    debug: debugMode,
    noclip: {
      speed: num(noclip, 'speed', dc.speed, 1, 500),
      fastMultiplier: num(noclip, 'fast_multiplier', dc.fastMultiplier, 1, 20),
      mouseCoefficient: num(noclip, 'mouse_coefficient', dc.mouseCoefficient, 0.001, 1),
    },
  };
  serverConfig = {
    admins: strings(admin, 'players', ds.admins),
    spawn: { enabled: bool(spawn, 'enabled', ds.spawn.enabled) },
    noclip: { allowAll: bool(noclip, 'allow_all', ds.noclip.allowAll) },
    teleport: { allowAll: bool(teleport, 'allow_all', ds.teleport.allowAll) },
    vehicles: {
      allowAll: bool(vehicles, 'allow_all', ds.vehicles.allowAll),
      health: num(vehicles, 'health', ds.vehicles.health, 1, 100000),
    },
  };

  const access = (allowAll: boolean) => (allowAll ? 'tout le monde' : 'admins');
  debug(
    'config',
    `chargée : ${serverConfig.admins.length} admin(s) ; ` +
      `noclip ${clientConfig.noclip.speed} m/s (×${clientConfig.noclip.fastMultiplier} avec Shift), ${access(serverConfig.noclip.allowAll)} ; ` +
      `teleport ${access(serverConfig.teleport.allowAll)} ; vehicles ${access(serverConfig.vehicles.allowAll)}`,
  );
}

/** Lit config.toml et répond aux clients qui demandent leur partie. Doit être le premier module. */
export const config: MiraModule = {
  name: 'config',

  init() {
    load();
    mp.events.onClient(ConfigEvents.Request, (player) => {
      // Un client n'a besoin de sa config qu'au chargement : on ignore les demandes en rafale.
      const now = Date.now();
      if (now - (lastRequest.get(player.id) ?? 0) < REQUEST_COOLDOWN_MS) return;
      lastRequest.set(player.id, now);
      player.emit(ConfigEvents.Sync, clientConfig);
    });
    mp.events.on('playerDisconnected', (playerId) => {
      lastRequest.delete(playerId);
    });
  },

  dispose() {
    lastRequest.clear();
  },
};
