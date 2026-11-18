import type { MiraModule } from '../../shared/module';
import { NoclipEvents } from '../../shared/noclip-events';
import {
  Key,
  type Vec3,
  getCameraForward,
  getCameraRight,
  getCameraYaw,
  getPlayer,
  getPosition,
  getYaw,
  moveTo,
  readKeyEvent,
  setInvulnerable,
  setMovementLocked,
  CTRL_KEYS,
  SHIFT_KEYS,
  onPlayerAction,
  getActionReaderStatus,
  resetActionReader,
  getGameMouseSensitivityX,
  acquireNoclipCache,
  releaseNoclipCache,
} from '../lib/natives';
import { debug } from '../../shared/log';
import { getConfig } from './config';

/** Touche qui bascule le noclip. */
const TOGGLE_KEY = Key.F2;
/** Plafond du delta de temps, pour éviter un saut énorme après une frame bloquée. */
const MAX_DT = 0.1;
/** Intervalle des logs de diagnostic (ms). */
const DEBUG_INTERVAL = 500;

/**
 * Réglages locaux modifiables en jeu via la console F8 (voir les commandes en bas du fichier).
 * Vitesses et coefficient souris par défaut : config.toml, section [noclip].
 */
const settings = {
  /** Coefficient souris forcé par `noclip_sens` (null = valeur de config.toml). */
  sensitivityOverride: null as number | null,
  debug: false,
};

/** Degrés par unité de souris = coefficient × sensibilité souris du jeu (options > contrôles). */
function mouseCoefficient(): number {
  return settings.sensitivityOverride ?? getConfig().noclip.mouseCoefficient;
}

/** Actions du jeu qui portent le mouvement horizontal de la caméra (souris, manette). */
const YAW_ACTIONS = new Set(['CameraMouseX', 'CameraX']);

const held = new Set<number>();
let enabled = false;
let gameLoaded = false;
let tickId: number | null = null;
let position: Vec3 | null = null;
let yaw = 0;
/** Mouvement horizontal de souris accumulé depuis la dernière frame. */
let mouseX = 0;
/** Sensibilité horizontale lue dans les options du jeu (1 si introuvable). */
let gameSensitivity = 1;
let lastTime = 0;
let lastDebug = 0;

function isHeld(keys: readonly number[]): boolean {
  return keys.some((k) => held.has(k));
}

function normalizeAngle(deg: number): number {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/** Vrai pendant que le noclip déplace le joueur (utilisé par la téléportation). */
export function isNoclipActive(): boolean {
  return enabled && position !== null;
}

/**
 * Déplace le noclip en cours vers `pos` (utilisé par la commande tp).
 * Renvoie false si le noclip n'est pas actif : l'appelant téléporte alors lui-même.
 */
export function relocateNoclip(pos: Vec3, newYaw: number): boolean {
  if (!enabled || !position) return false;
  position = { ...pos };
  yaw = normalizeAngle(newYaw);
  mouseX = 0;
  return true;
}

function tick(): void {
  const player = getPlayer();
  if (!player || !position) return;

  const now = mp.getTimer();
  const dt = Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;

  const forward = getCameraForward();
  // Droite fournie par le moteur (stable même en regardant à la verticale).
  const right = getCameraRight();

  let dx = 0;
  let dy = 0;
  let dz = 0;
  // ZQSD (AZERTY) et WASD (QWERTY) sont acceptés tous les deux.
  if (held.has(Key.Z) || held.has(Key.W)) { dx += forward.x; dy += forward.y; dz += forward.z; }
  if (held.has(Key.S)) { dx -= forward.x; dy -= forward.y; dz -= forward.z; }
  if (held.has(Key.D)) { dx += right.x; dy += right.y; }
  if (held.has(Key.Q) || held.has(Key.A)) { dx -= right.x; dy -= right.y; }
  if (held.has(Key.Space)) dz += 1;
  if (isHeld(CTRL_KEYS)) dz -= 1;

  const len = Math.hypot(dx, dy, dz);
  if (len > 0) {
    const { speed, fastMultiplier } = getConfig().noclip;
    const step = (speed * (isHeld(SHIFT_KEYS) ? fastMultiplier : 1) * dt) / len;
    position = { x: position.x + dx * step, y: position.y + dy * step, z: position.z + dz * step };
  }

  // La téléportation écrase la rotation appliquée par le jeu : on tourne nous-mêmes
  // le personnage avec le mouvement horizontal de la souris (souris à droite = yaw qui diminue).
  yaw = normalizeAngle(yaw - mouseX * mouseCoefficient() * gameSensitivity);
  mouseX = 0;
  moveTo(player, position, yaw);

  if (settings.debug && now - lastDebug >= DEBUG_INTERVAL) {
    lastDebug = now;
    const real = getPosition(player);
    console.log(
      `[noclip] lecture=${getActionReaderStatus()} yawVoulu=${yaw.toFixed(1)} yawCam=${getCameraYaw().toFixed(1)} yawPerso=${getYaw(player).toFixed(1)} ` +
        `cible=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}) ` +
        `réel=(${real.x.toFixed(1)}, ${real.y.toFixed(1)}, ${real.z.toFixed(1)})`,
    );
  }
}

function start(): void {
  const player = getPlayer();
  if (!player || tickId !== null) return;
  acquireNoclipCache();
  resetActionReader();
  position = getPosition(player);
  yaw = getCameraYaw();
  mouseX = 0;
  // Relu à chaque activation : suit les changements faits dans les options.
  const read = getGameMouseSensitivityX();
  gameSensitivity = read ?? 1;
  debug('noclip', `sensibilité souris du jeu = ${read ?? 'introuvable (1 utilisé)'}`);
  lastTime = mp.getTimer();
  setInvulnerable(player, true);
  setMovementLocked(player, true);
  tickId = mp.setTick(tick);
  debug('noclip', `activé (lecture souris : ${getActionReaderStatus()})`);
}

function stop(): void {
  if (tickId !== null) {
    mp.clearTick(tickId);
    tickId = null;
  }
  position = null;
  held.clear();
  releaseNoclipCache();
  const player = getPlayer();
  if (player) {
    setMovementLocked(player, false);
    setInvulnerable(player, false);
  }
  debug('noclip', 'désactivé');
}

/** Noclip (F2) : vol libre, traverse les murs, autorisé et suivi par le serveur. */
export const noclip: MiraModule = {
  name: 'noclip',

  init() {
    mp.events.onServer(NoclipEvents.Set, (state: unknown) => {
      enabled = state === true;
      if (enabled) start();
      else stop();
    });

    mp.game.onGameLoaded(() => {
      gameLoaded = true;
    });

    // Les observers s'enregistrent dans onInit (guides/client/lifecycle).
    // Callback brut : uniquement accumuler le mouvement de souris, le tick s'occupe du reste.
    mp.game.onInit(() => {
      onPlayerAction(
        () => enabled,
        (name, value) => {
          if (YAW_ACTIONS.has(name)) mouseX += value;
        },
      );
    });

    mp.game.onInputKeyEvent((action, key) => {
      const { down, code } = readKeyEvent(action, key);
      if (down === null) return;

      if (code === TOGGLE_KEY) {
        if (down && gameLoaded) mp.events.emitServer(NoclipEvents.Request);
        return;
      }

      if (!enabled) return;
      if (down) held.add(code);
      else held.delete(code);
    });

    // Commandes de réglage (console F8), purement locales : elles n'affectent que ce joueur.
    mp.commands.add('noclip_sens', (_id, args) => {
      const value = Number(args[0]);
      // `noclip_sens <valeur>` force un coefficient pour tester ; `noclip_sens reset` revient à config.toml.
      if (args[0] === 'reset') settings.sensitivityOverride = null;
      else if (Number.isFinite(value) && value > 0 && value <= 10) settings.sensitivityOverride = value;
      const coefficient = mouseCoefficient();
      console.log(
        `[noclip] coefficient = ${coefficient}${settings.sensitivityOverride === null ? ' (config.toml)' : ' (forcé)'} ` +
          `× sensibilité du jeu ${gameSensitivity} = ${(coefficient * gameSensitivity).toFixed(4)} °/unité`,
      );
    });

    mp.commands.add('noclip_debug', () => {
      settings.debug = !settings.debug;
      console.log(`[noclip] diagnostic = ${settings.debug}`);
    });
  },

  dispose() {
    if (enabled) stop();
    enabled = false;
    mp.commands.remove('noclip_sens');
    mp.commands.remove('noclip_debug');
  },
};
