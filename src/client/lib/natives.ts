/**
 * Adaptateurs vers les natives REDengine.
 * Les types générés ne décrivent pas les constructeurs à arguments (Vector4(x,y,z,w)…)
 * ni les enums à l'exécution : les conversions sont isolées ici.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Valeurs de l'enum moteur EInputAction utilisées ici. */
const InputAction = { IACT_Press: 1, IACT_Release: 2 } as const;

/** Valeurs de l'enum moteur EInputKey utilisées ici. */
export const Key = {
  W: 87,
  Z: 90,
  A: 65,
  Q: 81,
  S: 83,
  D: 68,
  Space: 32,
  Ctrl: 17,
  LCtrl: 162,
  RCtrl: 163,
  Shift: 16,
  LShift: 160,
  RShift: 161,
  F2: 113,
} as const;

/** Le moteur peut envoyer la variante gauche/droite d'une touche de modification. */
export const SHIFT_KEYS: readonly number[] = [Key.Shift, Key.LShift, Key.RShift];
export const CTRL_KEYS: readonly number[] = [Key.Ctrl, Key.LCtrl, Key.RCtrl];

/** Erreur rencontrée par le hook (null tant que tout va bien), pour le diagnostic. */
let actionError: string | null = null;

type ListenerActionStatic = typeof mp.game.gameinputScriptListenerAction;
/** Classe résolue au premier usage réel, pas dans onInit (elle peut ne pas exister encore). */
let listenerAction: ListenerActionStatic | null = null;

/** État de la lecture des actions, affiché par le diagnostic depuis le thread de script. */
export function getActionReaderStatus(): string {
  return actionError ? `désactivée (${actionError})` : 'ok';
}

/** À appeler à chaque activation : une erreur passée (ex. pendant le chargement) ne bloque pas pour toujours. */
export function resetActionReader(): void {
  actionError = null;
  listenerAction = null;
}

/**
 * Écoute les actions d'entrée du joueur (guides/client/observes : PlayerPuppet.OnAction).
 *
 * Lecture : `mp.game.gameinputScriptListenerAction.GetName(action)` (vérifié en jeu).
 * Ni la forme typée `mp.game.ListenerAction.GetName`, ni `action.GetName()` n'existent à l'exécution.
 *
 * Le hook est appelé pour CHAQUE action du joueur : `isActive` est testé en premier pour
 * ne rien lire hors du noclip. Callback brut, exécuté sur un thread du jeu : lecture
 * des arguments uniquement. En cas d'erreur, le hook se coupe au lieu de la répéter
 * à chaque action (une erreur non rattrapée ici inonde la console).
 */
export function onPlayerAction(isActive: () => boolean, callback: (name: string, value: number) => void): void {
  mp.game.observeBeforeRaw('PlayerPuppet', 'OnAction', (_self, action) => {
    if (actionError || !isActive()) return;
    try {
      const reader = (listenerAction ??= mp.game.gameinputScriptListenerAction);
      callback(reader.GetName(action), reader.GetValue(action));
    } catch (err) {
      actionError = err instanceof Error ? err.message : String(err);
    }
  });
}

/** Nom → valeur, pour le cas où le moteur transmet l'enum sous forme de texte. */
const KEY_BY_NAME: Record<string, number> = Object.fromEntries(
  Object.entries(Key).map(([name, value]) => [`IK_${name}`, value]),
);

function toNumber(value: unknown, byName: Record<string, number>): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return byName[value] ?? Number(value);
  return Number(value);
}

/** Normalise un événement clavier brut en { pressed | released, code de touche }. */
export function readKeyEvent(action: unknown, key: unknown): { down: boolean | null; code: number } {
  const a = toNumber(action, InputAction);
  const down = a === InputAction.IACT_Press ? true : a === InputAction.IACT_Release ? false : null;
  return { down, code: toNumber(key, KEY_BY_NAME) };
}

type Player = NonNullable<ReturnType<typeof mp.game.GetPlayer>>;

export function getPlayer(): Player | null {
  return mp.game.GetPlayer() ?? null;
}

export function getPosition(player: Player): Vec3 {
  const p = player.GetWorldPosition();
  return { x: p.x, y: p.y, z: p.z };
}

export function getYaw(player: Player): number {
  return player.GetWorldYaw();
}

type CameraSystem = ReturnType<typeof mp.game.ScriptGameInstance.GetCameraSystem>;
type TeleportFacility = ReturnType<typeof mp.game.ScriptGameInstance.GetTeleportationFacility>;
type NativeVector4 = InstanceType<typeof mp.game.Vector4>;
type NativeEulerAngles = InstanceType<typeof mp.game.EulerAngles>;

/**
 * Systèmes et structures réutilisés pendant le noclip, pour ne pas les redemander
 * ni les recréer à chaque frame. Remplis par `acquireNoclipCache`, vidés par `releaseNoclipCache`.
 */
let cache: {
  camera: CameraSystem;
  facility: TeleportFacility;
  vec4: NativeVector4;
  rotation: NativeEulerAngles;
} | null = null;

/** À appeler à l'activation du noclip (le jeu doit être chargé). */
export function acquireNoclipCache(): void {
  cache = {
    camera: mp.game.ScriptGameInstance.GetCameraSystem(),
    facility: mp.game.ScriptGameInstance.GetTeleportationFacility(),
    vec4: Object.assign(new mp.game.Vector4(), { w: 1.0 }),
    rotation: new mp.game.EulerAngles(),
  };
}

/** À appeler à la désactivation : les références moteur ne doivent pas survivre à un rechargement. */
export function releaseNoclipCache(): void {
  cache = null;
}

function cameraSystem(): CameraSystem {
  return cache?.camera ?? mp.game.ScriptGameInstance.GetCameraSystem();
}

/** Direction de la caméra active (normalisée par le moteur). */
export function getCameraForward(): Vec3 {
  const f = cameraSystem().GetActiveCameraForward();
  return { x: f.x, y: f.y, z: f.z };
}

/**
 * Direction « droite » de la caméra active, ramenée à l'horizontale et normalisée.
 * Donnée par le moteur : reste valable même en regardant à la verticale,
 * là où la calculer depuis la direction avant devient instable.
 */
export function getCameraRight(): { x: number; y: number } {
  const r = cameraSystem().GetActiveCameraRight();
  const len = Math.hypot(r.x, r.y);
  return len > 1e-6 ? { x: r.x / len, y: r.y / len } : { x: 0, y: 0 };
}

/** Yaw (degrés) correspondant à la direction de la caméra, dans la convention du moteur. */
export function getCameraYaw(): number {
  return mp.game.Vector4.ToRotation(cameraSystem().GetActiveCameraForward()).yaw;
}

/**
 * Replace le personnage à `pos`, tourné vers `yaw`, via TeleportationFacility.Teleport
 * (méthode documentée, guides/client/teleporting-player). `entEntity.TeleportPed` a été
 * écarté : il ignore la rotation passée.
 * Les constructeurs natifs ignorent leurs arguments : on remplit les champs après coup,
 * comme le client officiel cybermp_core (Object.assign(new mp.game.Vector4(), {...})).
 */
export function moveTo(player: Player, pos: Vec3, yaw: number): void {
  if (!cache) acquireNoclipCache();
  const c = cache!;
  // Structures réutilisées : on ne fait que mettre à jour leurs champs (le moteur copie les valeurs).
  Object.assign(c.rotation, { pitch: 0, roll: 0, yaw });

  // PlayerPuppet hérite de gameObject dans le moteur ; les types générés divergent sur une signature.
  c.facility.Teleport(
    player as unknown as Parameters<TeleportFacility['Teleport']>[0],
    Object.assign(c.vec4, pos),
    c.rotation,
  );
}

/**
 * Téléportation ponctuelle (commande tp…) : structures neuves, sans le cache du noclip.
 * Même appel que `moveTo`, documenté dans guides/client/teleporting-player.
 */
export function teleportTo(player: Player, pos: Vec3, yaw: number): void {
  const facility = mp.game.ScriptGameInstance.GetTeleportationFacility();
  const target = Object.assign(new mp.game.Vector4(), { x: pos.x, y: pos.y, z: pos.z, w: 1.0 });
  const rotation = Object.assign(new mp.game.EulerAngles(), { pitch: 0, roll: 0, yaw });
  facility.Teleport(player as unknown as Parameters<TeleportFacility['Teleport']>[0], target, rotation);
}

/**
 * Position du marqueur posé par le joueur sur la carte (le « mappin suivi manuellement »),
 * ou null s'il n'y en a pas. Même lecture que la commande tp-marker de freeroam.
 */
export function getMapMarkerPosition(): Vec3 | null {
  const system = mp.game.ScriptGameInstance.GetMappinSystem();
  const id = system.GetManuallyTrackedMappinID();
  // Identifiant 0 (ou absent) = aucun marqueur ; la valeur peut arriver en BigInt (uint64 du moteur).
  if (!id || !id.value) return null;
  const mappin = system.GetMappin(id);
  if (!mappin) return null;
  const p = mappin.GetWorldPosition();
  return { x: p.x, y: p.y, z: p.z };
}

/** Groupes de collision testés pour trouver le sol (bâtiments/routes, puis terrain naturel). */
const GROUND_COLLISION_GROUPS = ['Static', 'Terrain'] as const;

/** Dernière erreur du raycast, pour le diagnostic (null tant que tout va bien). */
let raycastError: string | null = null;

export function getRaycastError(): string | null {
  return raycastError;
}

/**
 * Hauteur du premier sol rencontré en descendant de `fromZ` à `toZ` à la verticale de (x, y),
 * ou null si rien n'est touché (zone pas encore chargée, ou vide).
 * Rayon du moteur : SpatialQueriesSystem.SyncRaycastByCollisionGroup.
 */
export function findGroundZ(x: number, y: number, fromZ: number, toZ: number): number | null {
  const system = mp.game.ScriptGameInstance.GetSpatialQueriesSystem();
  const start = Object.assign(new mp.game.Vector4(), { x, y, z: fromZ, w: 1.0 });
  const end = Object.assign(new mp.game.Vector4(), { x, y, z: toZ, w: 1.0 });

  let best: number | null = null;
  for (const group of GROUND_COLLISION_GROUPS) {
    try {
      // Paramètre de sortie du moteur : renvoyé sous la forme [touché, résultat].
      const [hit, result] = system.SyncRaycastByCollisionGroup(start, end, group, false, false);
      const z = result?.position?.z;
      if (hit && typeof z === 'number' && Number.isFinite(z) && (best === null || z > best)) best = z;
      raycastError = null;
    } catch (err) {
      raycastError = err instanceof Error ? err.message : String(err);
    }
  }
  return best;
}

/**
 * Copie un texte dans le presse-papiers Windows via `inkSystem.SetClipboardText`
 * (fonction de Codeware, installé par le core CyberMP). Renvoie false si l'appel échoue.
 */
export function copyToClipboard(text: string): boolean {
  try {
    mp.game.ScriptGameInstance.GetInkSystem().SetClipboardText(text);
    return true;
  } catch {
    return false;
  }
}

type Entity = NonNullable<ReturnType<typeof mp.game.ScriptGameInstance.FindEntityByID>>;

/** Entité du jeu à partir de son ID moteur (gameId de mp.network), ou null. */
export function findEntity(gameId: number): Entity | null {
  if (!gameId) return null;
  const id = Object.assign(new mp.game.entEntityID(), { hash: gameId });
  return mp.game.ScriptGameInstance.FindEntityByID(id) ?? null;
}

/** Demande de (dé)montage du joueur sur un siège de véhicule (même appel que freeroam). */
function mountingRequest<R extends { lowLevelMountingInfo: unknown; mountData: unknown }>(
  request: R,
  vehicleId: ReturnType<Entity['GetEntityID']>,
  slot: string,
): R {
  const data = Object.assign(new mp.game.gameMountEventData(), {
    isInstant: true,
    slotName: slot,
    mountParentEntityId: vehicleId,
    entryAnimName: 'forcedTransition',
  });
  const slotId = Object.assign(new mp.game.gamemountingMountingSlotId(), { id: slot });
  const info = Object.assign(new mp.game.gamemountingMountingInfo(), {
    childId: mp.game.GetPlayer().GetEntityID(),
    parentId: vehicleId,
    slotId,
  });
  return Object.assign(request, { lowLevelMountingInfo: info, mountData: data });
}

/** Assoit instantanément le joueur sur un siège (par défaut conducteur) du véhicule `gameId`. */
export function mountPlayerInto(gameId: number, slot = 'seat_front_left'): boolean {
  const vehicle = findEntity(gameId);
  if (!vehicle) return false;
  const request = mountingRequest(new mp.game.gamemountingMountingRequest(), vehicle.GetEntityID(), slot);
  mp.game.ScriptGameInstance.GetMountingFacility().Mount(request);
  return true;
}

/** Fait descendre instantanément le joueur de son véhicule (sans effet s'il est à pied). */
export function unmountPlayer(): void {
  const playerObject = mp.game.GetPlayerObject();
  const vehicle = playerObject ? mp.game.GetMountedVehicle(playerObject) : null;
  if (!vehicle) return;
  const slot = vehicle.GetSlotIdForMountedObject(playerObject);
  const request = mountingRequest(new mp.game.gamemountingUnmountingRequest(), vehicle.GetEntityID(), slot);
  mp.game.ScriptGameInstance.GetMountingFacility().Unmount(request);
}

/** Vrai si le joueur est dans un véhicule (conducteur ou passager). */
export function isInVehicle(): boolean {
  return Boolean(mp.game.GetMountedVehicle(mp.game.GetPlayerObject()));
}

/**
 * Bandeau d'avertissement à l'écran (même appel que le client officiel cybermp_core).
 * Absent des types générés : appel protégé, sans effet s'il échoue.
 */
export function showWarning(text: string): void {
  try {
    (mp.game.GetPlayer() as unknown as { SetWarningMessage(message: string): void } | null)?.SetWarningMessage(text);
  } catch {
    /* le message reste visible dans la console F8 */
  }
}

/**
 * Sensibilité horizontale de la souris réglée par le joueur dans les options du jeu
 * (même API que le client officiel : GetSettingsSystem().GetVar(groupe, nom)).
 * Renvoie null si le réglage est introuvable.
 */
export function getGameMouseSensitivityX(): number | null {
  try {
    // GetVar renvoie la classe de base ; ce réglage est un userSettingsVarFloat (ou Int).
    const setting = mp.game.ScriptGameInstance.GetSettingsSystem().GetVar('/controls/fppcameramouse', 'FPP_MouseX') as
      | InstanceType<typeof mp.game.userSettingsVarFloat>
      | null;
    const value = setting?.GetValue();
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Valeurs moteur de la vie du joueur (guides/client/spawning-player). */
const HEALTH_STAT_POOL = 17; // gamedataStatPoolType.Health
const HEALTH_STAT = 787; // gamedataStatType.Health
const ADDITIVE_MODIFIER = 0; // gameStatModifierType.Additive

/**
 * Règle la vie maximale et actuelle du joueur. À faire AVANT `spawnPlayer`, sinon le personnage
 * peut apparaître directement « flatline » (guides/client/spawning-player).
 */
export function setPlayerHealth(player: Player, value: number): void {
  const stats = mp.game.ScriptGameInstance.GetStatsSystem();
  const pools = mp.game.ScriptGameInstance.GetStatPoolsSystem();
  // Le moteur convertit lui-même EntityID → StatsObjectID (usage de la doc et du core officiel) ;
  // les types générés ne décrivent pas cette conversion implicite.
  type StatsObjectId = Parameters<typeof stats.AddModifier>[0];
  const id = player.GetEntityID() as unknown as StatsObjectId;
  // Les ID de stats sont typés comme des enums précis ; les valeurs numériques sont celles de la doc.
  type StatType = Parameters<typeof stats.RemoveAllModifiers>[1];
  type PoolType = Parameters<typeof pools.RequestSettingStatPoolValueIgnoreChangeMode>[1];

  stats.RemoveAllModifiers(id, HEALTH_STAT as StatType, true);
  const modifier = Object.assign(new mp.game.gameConstantStatModifierData_Deprecated(), {
    statType: HEALTH_STAT,
    modifierType: ADDITIVE_MODIFIER,
    value,
  });
  stats.AddModifier(id, modifier);
  pools.RequestSettingStatPoolValueIgnoreChangeMode(id, HEALTH_STAT_POOL as PoolType, value, new mp.game.gameObject(), true);
}

/** Restriction TweakDB qui empêche la locomotion (sinon ZQSD fait marcher le personnage). */
const NO_MOVEMENT = 'GameplayRestriction.NoMovement';

/**
 * Bloque ou rend la locomotion du personnage, la caméra reste libre.
 * Même appel que le client officiel cybermp_core (StatusEffectsController).
 */
export function setMovementLocked(player: Player, locked: boolean): void {
  const system = mp.game.ScriptGameInstance.GetStatusEffectSystem();
  const id = player.GetEntityID();
  if (locked) {
    system.ApplyStatusEffect(id, NO_MOVEMENT, player.GetRecordID(), id);
  } else if (system.HasStatusEffect(id, NO_MOVEMENT)) {
    system.RemoveStatusEffect(id, NO_MOVEMENT);
  }
}

const GOD_MODE_INVULNERABLE = 0; // gameGodModeType.Invulnerable
const GOD_MODE_SOURCE = 'mira_utils:noclip';

/**
 * Rend le joueur invulnérable ou non. `source` identifie qui l'a demandé : chaque outil
 * utilise la sienne, pour qu'un outil n'annule pas l'invulnérabilité d'un autre.
 */
export function setInvulnerable(player: Player, enabled: boolean, source: string = GOD_MODE_SOURCE): void {
  const godMode = mp.game.ScriptGameInstance.GetGodModeSystem();
  const id = player.GetEntityID();
  if (enabled) {
    godMode.AddGodMode(id, GOD_MODE_INVULNERABLE as Parameters<typeof godMode.AddGodMode>[1], source);
  } else {
    godMode.ClearGodMode(id, source);
  }
}
