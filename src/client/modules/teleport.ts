import type { MiraModule } from '../../shared/module';
import { TeleportEvents } from '../../shared/teleport-events';
import { closeAllMenus, trackMenus } from '../lib/menus';
import {
  type Vec3,
  findGroundZ,
  getMapMarkerPosition,
  getPlayer,
  getRaycastError,
  getYaw,
  isInVehicle,
  setInvulnerable,
  teleportTo,
} from '../lib/natives';
import { isNoclipActive, relocateNoclip } from './noclip';
import { showMessage } from './notify';

/** Source d'invulnérabilité propre à la téléportation (n'interfère pas avec le noclip). */
const GOD_SOURCE = 'mira_utils:teleport';
/** Hauteur posée au-dessus du sol trouvé. */
const GROUND_OFFSET = 0.1;
/** Fréquence des tentatives de raycast pendant le chargement de la zone (ms). */
const GROUND_RETRY_MS = 100;
/** Abandon de la recherche du sol (ms) : le joueur reste alors à la hauteur d'attente. */
const GROUND_TIMEOUT_MS = 6000;
/** Délai d'invulnérabilité après la pose, le temps que la physique se stabilise (ms). */
const GOD_LINGER_MS = 1500;

/** Recherche du sol : on cherche d'abord près de la hauteur indiquée, puis de très haut. */
interface GroundSearch {
  x: number;
  y: number;
  /** Hauteur où le joueur est maintenu pendant le chargement de la zone. */
  holdZ: number;
  yaw: number;
  /** Fenêtres de recherche [départ, arrivée] testées dans l'ordre. */
  windows: readonly (readonly [number, number])[];
  startedAt: number;
  lastTry: number;
  tickId: number;
  label: string;
}

let search: GroundSearch | null = null;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;

function fmt(p: Vec3): string {
  return `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`;
}

function clearLinger(): void {
  if (lingerTimer !== null) {
    clearTimeout(lingerTimer);
    lingerTimer = null;
  }
}

/** Arrête la recherche en cours ; l'invulnérabilité est retirée tout de suite ou après un délai. */
function endSearch(lingerGod: boolean): void {
  if (!search) return;
  mp.clearTick(search.tickId);
  search = null;

  clearLinger();
  const release = () => {
    lingerTimer = null;
    const player = getPlayer();
    if (player) setInvulnerable(player, false, GOD_SOURCE);
  };
  if (lingerGod) lingerTimer = setTimeout(release, GOD_LINGER_MS);
  else release();
}

function searchTick(): void {
  const s = search;
  const player = getPlayer();
  if (!s || !player) return;

  // Noclip activé pendant la recherche : il prend la main (sinon les deux déplaceraient le joueur).
  if (isNoclipActive()) {
    endSearch(false);
    return;
  }

  // Maintien en l'air pendant que la zone se charge (sinon chute dans le vide).
  teleportTo(player, { x: s.x, y: s.y, z: s.holdZ }, s.yaw);

  const now = mp.getTimer();
  if (now - s.lastTry < GROUND_RETRY_MS) return;
  s.lastTry = now;

  for (const [fromZ, toZ] of s.windows) {
    const ground = findGroundZ(s.x, s.y, fromZ, toZ);
    if (ground === null) continue;
    const target = { x: s.x, y: s.y, z: ground + GROUND_OFFSET };
    teleportTo(player, target, s.yaw);
    showMessage(`${s.label} : ${fmt(target)} (au sol)`);
    endSearch(true);
    return;
  }

  if (now - s.startedAt >= GROUND_TIMEOUT_MS) {
    const error = getRaycastError();
    showMessage(
      `${s.label} : sol introuvable, tu restes à ${fmt({ x: s.x, y: s.y, z: s.holdZ })}` +
        (error ? ` (raycast : ${error})` : ''),
    );
    endSearch(false);
  }
}

/**
 * Téléporte puis pose au sol : maintient le joueur (invulnérable) à `holdZ` tant que la zone
 * n'est pas chargée, relance un rayon vers le bas, puis le pose sur le premier sol trouvé.
 */
function teleportToGround(x: number, y: number, zHint: number | null, yaw: number, label: string): void {
  const player = getPlayer();
  if (!player) return;
  endSearch(false);
  clearLinger();

  // Hauteur connue (marqueur) : on cherche juste au-dessus d'elle, ce qui évite les toits.
  // Hauteur inconnue (tp x y) : on part de très haut, donc on atterrit sur la surface la plus haute.
  const holdZ = zHint ?? 300;
  const windows: [number, number][] =
    zHint === null
      ? [[1000, -200]]
      : [
          [zHint + 3, zHint - 150],
          [zHint + 500, -200],
        ];

  closeAllMenus();
  setInvulnerable(player, true, GOD_SOURCE);
  teleportTo(player, { x, y, z: holdZ }, yaw);

  const now = mp.getTimer();
  search = { x, y, holdZ, yaw, windows, startedAt: now, lastTry: 0, tickId: mp.setTick(searchTick), label };
}

/** Commande tp : coordonnées exactes si z est donné, sinon pose au sol. */
function runTeleport(x: number, y: number, z: number | null, yaw: number | null, label = 'tp'): void {
  const player = getPlayer();
  if (!player) return;

  if (isInVehicle()) {
    showMessage(`${label} : descends du véhicule avant de te téléporter`);
    return;
  }

  const finalYaw = yaw ?? getYaw(player);

  // En noclip, c'est le noclip qui replace le joueur à chaque frame : on déplace sa position,
  // sans chercher le sol (on vole).
  const flyTarget = { x, y, z: z ?? 300 };
  if (relocateNoclip(flyTarget, finalYaw)) {
    showMessage(`${label} (noclip) : ${fmt(flyTarget)}`);
    return;
  }

  if (z === null) {
    teleportToGround(x, y, null, finalYaw, label);
    return;
  }

  endSearch(false);
  closeAllMenus();
  teleportTo(player, { x, y, z }, finalYaw);
  showMessage(`${label} : ${fmt({ x, y, z })}`);
}

/** Commande tpm : téléportation au marqueur de la carte, posé au sol. */
function teleportToMarker(): void {
  const marker = getMapMarkerPosition();
  if (!marker) {
    showMessage('tpm : aucun marqueur sur la carte (pose-en un avec la carte ouverte)');
    return;
  }

  const player = getPlayer();
  if (!player) return;
  if (isInVehicle()) {
    showMessage('tpm : descends du véhicule avant de te téléporter');
    return;
  }

  const yaw = getYaw(player);
  const flyTarget = { x: marker.x, y: marker.y, z: marker.z + 1 };
  if (relocateNoclip(flyTarget, yaw)) {
    showMessage(`tpm (noclip) : ${fmt(flyTarget)}`);
    return;
  }

  teleportToGround(marker.x, marker.y, marker.z, yaw, 'tpm');
}

function guarded(label: string, action: () => void): void {
  try {
    action();
  } catch (err) {
    endSearch(false);
    showMessage(`${label} : échec (${err instanceof Error ? err.message : String(err)})`);
  }
}

export const teleport: MiraModule = {
  name: 'teleport',

  init() {
    trackMenus();
    mp.events.onServer(TeleportEvents.To, (x: unknown, y: unknown, z: unknown, yaw: unknown) => {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      guarded('tp', () =>
        runTeleport(x, y, typeof z === 'number' ? z : null, typeof yaw === 'number' ? yaw : null),
      );
    });
    mp.events.onServer(TeleportEvents.ToMarker, () => guarded('tpm', teleportToMarker));
  },

  dispose() {
    endSearch(false);
    clearLinger();
    const player = getPlayer();
    if (player) setInvulnerable(player, false, GOD_SOURCE);
  },
};
