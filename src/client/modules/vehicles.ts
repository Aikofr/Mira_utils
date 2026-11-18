import { debug, errorText } from '../../shared/log';
import type { MiraModule } from '../../shared/module';
import { VehicleEvents } from '../../shared/vehicle-events';
import { findEntity, mountPlayerInto, unmountPlayer } from '../lib/natives';
import { showMessage } from './notify';

/** Abandon si le véhicule n'arrive pas dans le jeu du joueur (ms). */
const SEAT_TIMEOUT_MS = 5000;
/** Fréquence des tentatives de mise au volant (ms). */
const SEAT_POLL_MS = 100;

/** Mise au volant en attente. */
let pending: {
  netId: number;
  startedAt: number;
  listener: (netId: unknown) => void;
  timer: ReturnType<typeof setInterval>;
} | null = null;

/**
 * Les ID peuvent arriver sous un autre type que number (BigInt, texte) selon le moteur :
 * on compare toujours leurs valeurs numériques.
 */
function toId(value: unknown): number {
  const n = Number(value); // Number(10n) === 10, Number('10') === 10
  return Number.isFinite(n) ? n : 0;
}

/** ID moteur du véhicule `netId` s'il est chargé dans ce jeu, sinon 0. */
function findStreamedVehicle(netId: number): number {
  const direct = toId(mp.network.getVehicleGameId(netId));
  if (direct) return direct;
  // Même recherche que freeroam : parcourir les véhicules chargés et comparer leur ID réseau.
  for (const gameId of mp.network.getStreamedPool('CVehicle')) {
    if (toId(mp.network.getVehicleId(gameId)) === netId) return toId(gameId);
  }
  return 0;
}

function cancelPending(): void {
  if (!pending) return;
  mp.events.off('vehicleStreamIn', pending.listener);
  clearInterval(pending.timer);
  pending = null;
}

/**
 * Une tentative de mise au volant. Le réseau annonce le véhicule un peu AVANT que l'objet existe
 * dans le moteur (constaté en jeu : annoncé à 93 ms, FindEntityByID encore vide) : tant que l'objet
 * n'est pas là, on renvoie false et on réessaie au passage suivant.
 */
function trySeat(netId: number, startedAt: number): boolean {
  const gameId = findStreamedVehicle(netId);
  if (!gameId || !findEntity(gameId)) return false;

  cancelPending();
  debug('vehicles', `véhicule prêt (gameId ${gameId}) après ${mp.getTimer() - startedAt} ms`);
  try {
    if (!mountPlayerInto(gameId)) showMessage('car : véhicule introuvable dans le jeu');
  } catch (err) {
    showMessage(`car : impossible de s'asseoir (${errorText(err)})`);
  }
  return true;
}

/** Diagnostic (mode debug) : ce que le client voit au moment de l'abandon. */
function describeStreamed(netId: number): string {
  try {
    const gameId = findStreamedVehicle(netId);
    if (gameId) return `#${netId} annoncé (gameId ${gameId}) mais objet absent du moteur`;
    const pool = mp.network.getStreamedPool('CVehicle');
    const netIds = pool.map((g) => toId(mp.network.getVehicleId(g)));
    return `attendu #${netId} ; ${pool.length} véhicule(s) chargé(s), ID réseau : ${netIds.join(', ') || 'aucun'}`;
  } catch (err) {
    return `lecture des véhicules chargés impossible (${errorText(err)})`;
  }
}

/**
 * Assoit le joueur au volant du véhicule `netId` créé par le serveur : tentative immédiate,
 * puis toutes les 100 ms (et à l'événement vehicleStreamIn) jusqu'à 5 s.
 */
function seatWhenStreamed(netId: number): void {
  cancelPending();
  const startedAt = mp.getTimer();
  if (trySeat(netId, startedAt)) return;

  const listener = (streamedNetId: unknown) => {
    if (toId(streamedNetId) === netId) trySeat(netId, startedAt);
  };

  const timer = setInterval(() => {
    if (trySeat(netId, startedAt)) return;
    if (mp.getTimer() - startedAt >= SEAT_TIMEOUT_MS) {
      debug('vehicles', describeStreamed(netId));
      cancelPending();
      showMessage("car : impossible de t'asseoir automatiquement, monte dedans à la main");
    }
  }, SEAT_POLL_MS);

  pending = { netId, startedAt, listener, timer };
  mp.events.on('vehicleStreamIn', listener);
  debug('vehicles', `attente du véhicule #${netId}`);
}

/** Côté client de `car` / `dv` : mise au volant, sortie du véhicule avant sa suppression. */
export const vehicles: MiraModule = {
  name: 'vehicles',

  init() {
    mp.events.onServer(VehicleEvents.SeatIn, (netId: unknown) => {
      const id = toId(netId);
      if (id) seatWhenStreamed(id);
    });
    mp.events.onServer(VehicleEvents.Leave, () => {
      cancelPending();
      try {
        unmountPlayer();
      } catch (err) {
        showMessage(`dv : impossible de descendre (${errorText(err)})`);
      }
    });
  },

  dispose() {
    cancelPending();
  },
};
