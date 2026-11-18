import type { MpPlayer, MpVehicle } from '@cybermp/server-types';
import { debug, errorText, info, isDebug } from '../../shared/log';
import type { MiraModule } from '../../shared/module';
import { VehicleEvents } from '../../shared/vehicle-events';
import { notify, printLines } from '../lib/notify';
import { canUse } from '../lib/permissions';
import { hasKnownPosition } from '../lib/position';
import { readToml, table } from '../lib/toml';
import { getServerConfig } from './config';
import { isInNoclip } from './noclip';

/** Une entrée de vehicles.toml. */
interface CatalogEntry {
  name: string;
  label: string;
  category: string;
  model: string;
  appearance: string;
  /** false = pas encore essayé en jeu (affiché « non testé » par carlist). */
  tested: boolean;
}

/** Rayon de `dv` quand on n'est pas dans un véhicule (mètres). */
const DV_RADIUS = 6;
/** Délai entre « descends » et la suppression, pour que le joueur sorte proprement (ms). */
const DESTROY_DELAY_MS = 500;
/** Nombre maximal de propositions affichées quand un nom est ambigu. */
const MAX_SUGGESTIONS = 8;

let catalog: CatalogEntry[] = [];
/** Véhicule créé par chaque joueur (un seul à la fois) : joueur → ID du véhicule. */
const owned = new Map<number, number>();
/** Suppressions en attente (après la sortie des occupants). */
const pendingDestroy = new Map<number, ReturnType<typeof setTimeout>>();

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function loadCatalog(): void {
  const raw = readToml('vehicles.toml');
  const entries = Array.isArray(raw?.vehicle) ? raw.vehicle : [];
  const seen = new Set<string>();
  catalog = [];

  entries.forEach((value, index) => {
    const entry = table(value);
    const name = text(entry.name)?.toLowerCase();
    const model = text(entry.model);
    const appearance = text(entry.appearance);
    if (!name || !model || !appearance) {
      info('vehicles', `vehicles.toml, véhicule n°${index + 1} ignoré : name, model et appearance sont obligatoires`);
      return;
    }
    if (seen.has(name)) {
      info('vehicles', `vehicles.toml : nom « ${name} » en double, seul le premier est gardé`);
      return;
    }
    seen.add(name);
    catalog.push({
      name,
      label: text(entry.label) ?? name,
      category: text(entry.category)?.toLowerCase() ?? 'autre',
      model,
      appearance,
      tested: entry.tested !== false,
    });
  });

  debug('vehicles', `catalogue : ${catalog.length} véhicule(s)`);
}

type Resolved = { entry: CatalogEntry } | { error: string };

/**
 * `car caliburn` → nom exact ; `car calib` → recherche dans les noms et libellés ;
 * `car Vehicle.v_… apparence` → record TweakDB direct (véhicule hors catalogue).
 */
function resolveVehicle(args: string[]): Resolved {
  const query = args[0]?.trim();
  if (!query) return { error: 'usage : car <nom>   (liste : carlist [recherche])' };

  if (query.startsWith('Vehicle.')) {
    const appearance = args[1]?.trim();
    if (!appearance) return { error: 'usage : car Vehicle.<record> <apparence>' };
    return { entry: { name: query, label: query, category: 'direct', model: query, appearance, tested: false } };
  }

  const q = query.toLowerCase();
  const exact = catalog.find((e) => e.name === q);
  if (exact) return { entry: exact };

  const matches = catalog.filter((e) => e.name.includes(q) || e.label.toLowerCase().includes(q));
  if (matches.length === 1) return { entry: matches[0] };
  if (matches.length === 0) return { error: `car : aucun véhicule « ${query} » (carlist pour voir la liste)` };
  const names = matches.slice(0, MAX_SUGGESTIONS).map((e) => e.name);
  return { error: `car : « ${query} » est ambigu : ${names.join(', ')}${matches.length > MAX_SUGGESTIONS ? '…' : ''}` };
}

function getVehicle(id: number | undefined): MpVehicle | null {
  return id !== undefined && mp.vehicles.exists(id) ? mp.vehicles.at(id) : null;
}

function occupants(vehicle: MpVehicle): MpPlayer[] {
  const { driver, passenger, rearLeft, rearRight } = vehicle.seats;
  return [driver, passenger, rearLeft, rearRight].filter((p): p is MpPlayer => p !== null);
}

function forgetOwner(vehicleId: number): void {
  for (const [playerId, id] of owned) if (id === vehicleId) owned.delete(playerId);
}

/** Supprime un véhicule : fait d'abord descendre ses occupants, puis le détruit. */
function destroyVehicle(vehicle: MpVehicle, immediate = false): void {
  const id = vehicle.id;
  if (pendingDestroy.has(id)) return;
  forgetOwner(id);

  const people = immediate ? [] : occupants(vehicle);
  const destroy = () => {
    pendingDestroy.delete(id);
    if (mp.vehicles.exists(id)) mp.vehicles.destroy(id);
  };
  if (people.length === 0) {
    destroy();
    return;
  }
  for (const person of people) person.emit(VehicleEvents.Leave);
  pendingDestroy.set(id, setTimeout(destroy, DESTROY_DELAY_MS));
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Véhicule du serveur le plus proche dans la même dimension, à moins de `radius` mètres. */
function nearestVehicle(player: MpPlayer, radius: number): MpVehicle | null {
  let best: MpVehicle | null = null;
  let bestDistance = radius;
  for (const vehicle of mp.vehicles.toArray()) {
    if (vehicle.dimension !== player.dimension || pendingDestroy.has(vehicle.id)) continue;
    const d = distance(vehicle.position, player.position);
    if (d <= bestDistance) {
      best = vehicle;
      bestDistance = d;
    }
  }
  return best;
}

function allowedPlayer(player: MpPlayer | null, command: string): MpPlayer | null {
  if (!player) {
    info('vehicles', `${command} : commande à taper en jeu (F8), pas dans le terminal du serveur`);
    return null;
  }
  if (!canUse(player, getServerConfig().vehicles.allowAll)) {
    notify(player, `${command} : réservé aux admins`);
    return null;
  }
  return player;
}

const UNKNOWN_POSITION = 'le serveur ne connaît pas encore ta position : tape respawn puis réessaie';

function spawnCar(player: MpPlayer, args: string[]): void {
  if (!hasKnownPosition(player)) {
    notify(player, `car : ${UNKNOWN_POSITION}`);
    return;
  }

  const resolved = resolveVehicle(args);
  if ('error' in resolved) {
    notify(player, resolved.error);
    return;
  }
  const { entry } = resolved;

  // En noclip, le noclip replace le joueur à chaque frame : il serait éjecté du siège.
  if (isInNoclip(player.id)) {
    notify(player, 'car : quitte le noclip (F2) avant de faire apparaître un véhicule');
    return;
  }

  // Dans un véhicule qui n'est pas le sien : on ne le remplace pas.
  const current = player.vehicle;
  if (current && owned.get(player.id) !== current.id) {
    notify(player, 'car : descends du véhicule avant d\'en faire apparaître un');
    return;
  }

  // Un seul véhicule par joueur : l'ancien disparaît (y compris celui dans lequel il est assis).
  const previous = getVehicle(owned.get(player.id));
  if (previous) destroyVehicle(previous, true);

  let vehicle: MpVehicle;
  try {
    vehicle = mp.vehicles.create({
      model: mp.hashes.tweakdbid(entry.model),
      appearance: mp.hashes.cname(entry.appearance),
      position: player.position,
      yaw: player.yaw,
      dimension: player.dimension,
      // Toujours une vie, comme freeroam et l'exemple de la doc (guides/server/vehicles).
      health: getServerConfig().vehicles.health,
    });
  } catch (err) {
    notify(player, `car : création impossible (${errorText(err)})`);
    return;
  }

  owned.set(player.id, vehicle.id);
  player.emit(VehicleEvents.SeatIn, vehicle.id);
  notify(player, `car : ${entry.label}`);
  debug(
    'vehicles',
    `${player.nickname} (${player.id}) → ${entry.model} (#${vehicle.id}) à ${player.position.map((v) => v.toFixed(1)).join(' ')}, dimension ${player.dimension}`,
  );
  if (isDebug()) scheduleSpawnCheck(vehicle.id);
}

/** Diagnostic (mode debug) : état du véhicule côté serveur 2 s après sa création. */
function scheduleSpawnCheck(vehicleId: number): void {
  setTimeout(() => {
    if (!mp.vehicles.exists(vehicleId)) {
      debug('vehicles', `#${vehicleId} : n'existe plus côté serveur après 2 s (supprimé ?)`);
      return;
    }
    const v = mp.vehicles.at(vehicleId);
    debug(
      'vehicles',
      `#${vehicleId} après 2 s : vie ${v.health}, position ${v.position.map((n) => n.toFixed(1)).join(' ')}, ` +
        `dimension ${v.dimension}, rayon de streaming ${v.streamingRadius}`,
    );
  }, 2000);
}

function deleteVehicle(player: MpPlayer): void {
  if (!player.vehicle && !hasKnownPosition(player)) {
    notify(player, `dv : ${UNKNOWN_POSITION}`);
    return;
  }
  const vehicle = player.vehicle ?? nearestVehicle(player, DV_RADIUS);
  if (!vehicle || pendingDestroy.has(vehicle.id)) {
    notify(player, `dv : aucun véhicule (monte dedans ou approche-toi à moins de ${DV_RADIUS} m)`);
    return;
  }
  destroyVehicle(vehicle);
  notify(player, 'dv : véhicule supprimé');
  debug('vehicles', `${player.nickname} (${player.id}) a supprimé le véhicule #${vehicle.id}`);
}

function listCars(player: MpPlayer, args: string[]): void {
  // `carlist untested` / `carlist tested` : suivi des essais ; sinon recherche (nom, libellé, catégorie).
  const q = args[0]?.toLowerCase();
  const list =
    q === 'untested'
      ? catalog.filter((e) => !e.tested)
      : q === 'tested'
        ? catalog.filter((e) => e.tested)
        : q
          ? catalog.filter((e) => e.name.includes(q) || e.label.toLowerCase().includes(q) || e.category === q)
          : catalog;
  if (list.length === 0) {
    notify(player, `carlist : rien ne correspond à « ${args[0]} »`);
    return;
  }
  const lines = list.map(
    (e) => `${e.name.padEnd(28)} ${e.label}  [${e.category}]${e.tested ? '' : '  (non testé)'}`,
  );
  printLines(player, [`${list.length} véhicule(s) — car <nom> :`, ...lines]);
  notify(player, `carlist : ${list.length} véhicule(s), voir la console F8`);
}

/** `car <nom>` (fait apparaître et assoit au volant), `dv` (supprime), `carlist [recherche]`. */
export const vehicles: MiraModule = {
  name: 'vehicles',

  init() {
    loadCatalog();

    mp.commands.add('car', (caller, args) => {
      const player = allowedPlayer(caller, 'car');
      if (player) spawnCar(player, args);
    });
    mp.commands.add('dv', (caller) => {
      const player = allowedPlayer(caller, 'dv');
      if (player) deleteVehicle(player);
    });
    mp.commands.add('carlist', (caller, args) => {
      const player = allowedPlayer(caller, 'carlist');
      if (player) listCars(player, args);
    });

    // Le véhicule d'un joueur disparaît avec lui.
    mp.events.on('playerDisconnected', (playerId) => {
      const vehicle = getVehicle(owned.get(playerId));
      owned.delete(playerId);
      if (vehicle) destroyVehicle(vehicle);
    });
  },

  dispose() {
    // Règle de la doc : détruire les entités créées, sinon un restart crée des doublons.
    for (const [id, timer] of pendingDestroy) {
      clearTimeout(timer);
      if (mp.vehicles.exists(id)) mp.vehicles.destroy(id);
    }
    pendingDestroy.clear();
    for (const id of owned.values()) if (mp.vehicles.exists(id)) mp.vehicles.destroy(id);
    owned.clear();
    mp.commands.remove('car');
    mp.commands.remove('dv');
    mp.commands.remove('carlist');
  },
};
