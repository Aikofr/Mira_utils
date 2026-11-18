import type { MpPlayer } from '@cybermp/server-types';
import type { MiraModule } from '../../shared/module';
import { TeleportEvents } from '../../shared/teleport-events';
import { debug, info } from '../../shared/log';
import { notify } from '../lib/notify';
import { canUse } from '../lib/permissions';
import { getServerConfig } from './config';

/** Bornes de sécurité : la carte de Night City tient largement dans ±20 km. */
const MAX_XY = 20000;
const MIN_Z = -1000;
const MAX_Z = 5000;

/** Nombre décimal ; accepte la virgule (« 12,5 ») et ignore une virgule finale (« 12.5, »). */
function parseCoord(raw: string | undefined): number {
  if (raw === undefined) return Number.NaN;
  const cleaned = raw.trim().replace(/,$/, '').replace(',', '.');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}

function format(value: number): string {
  return value.toFixed(2);
}

/** Commandes réservées aux joueurs en jeu ; renvoie le joueur s'il a le droit, sinon null. */
function allowedPlayer(player: MpPlayer | null, command: string): MpPlayer | null {
  if (!player) {
    info('teleport', `${command} : commande à taper en jeu (F8), pas dans le terminal du serveur`);
    return null;
  }
  if (!canUse(player, getServerConfig().teleport.allowAll)) {
    notify(player, `${command} : réservé aux admins`);
    return null;
  }
  return player;
}

/**
 * `tp x y [z] [yaw]` : téléportation aux coordonnées. `tpm` : au marqueur de la carte.
 * (`pos` / `posh` sont des commandes client : module coords.)
 */
export const teleport: MiraModule = {
  name: 'teleport',

  init() {
    mp.commands.add('tp', (caller, args) => {
      const player = allowedPlayer(caller, 'tp');
      if (!player) return;

      // `tp x y` (z absent) : le client pose le joueur au sol.
      const [x, y] = [parseCoord(args[0]), parseCoord(args[1])];
      const z = args[2] === undefined ? null : parseCoord(args[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (z !== null && !Number.isFinite(z))) {
        notify(
          player,
          'usage : tp <x> <y> [z] [orientation]   (sans z : posé au sol ; exemple : tp -1456.9 1038.3 16.8)',
        );
        return;
      }
      if (Math.abs(x) > MAX_XY || Math.abs(y) > MAX_XY || (z !== null && (z < MIN_Z || z > MAX_Z))) {
        notify(player, `tp : coordonnées hors carte (x et y entre ±${MAX_XY}, z entre ${MIN_Z} et ${MAX_Z})`);
        return;
      }

      const yawArg = parseCoord(args[3]);
      const yaw = Number.isFinite(yawArg) ? yawArg : null;

      debug(
        'teleport',
        `${player.nickname} (${player.id}) → ${format(x)} ${format(y)} ${z === null ? '(sol)' : format(z)}`,
      );
      player.emit(TeleportEvents.To, x, y, z, yaw);
    });

    // Le marqueur de la carte n'existe que dans le jeu du joueur : le serveur vérifie le droit,
    // puis c'est le client qui lit la position du marqueur et se téléporte.
    mp.commands.add('tpm', (caller) => {
      const player = allowedPlayer(caller, 'tpm');
      if (!player) return;
      debug('teleport', `${player.nickname} (${player.id}) → marqueur`);
      player.emit(TeleportEvents.ToMarker);
    });
  },

  dispose() {
    mp.commands.remove('tp');
    mp.commands.remove('tpm');
  },
};
