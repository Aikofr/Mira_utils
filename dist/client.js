(() => {
  // src/shared/log.ts
  var debugEnabled = false;
  function setDebug(enabled2) {
    debugEnabled = enabled2;
  }
  function info(tag, message) {
    console.log(`[${tag}] ${message}`);
  }
  function plain(message) {
    console.log(message);
  }
  function debug(tag, message) {
    if (debugEnabled) console.log(`[${tag}] ${message}`);
  }
  function errorText(err) {
    return err instanceof Error ? err.message : String(err);
  }

  // src/shared/module.ts
  function startModules(modules, onStop, signature) {
    const started = [];
    for (const module of modules) {
      try {
        module.init();
        started.push(module);
      } catch (err) {
        info(module.name, `\xE9chec du module : ${errorText(err)}`);
      }
    }
    onStop(() => {
      for (const module of [...started].reverse()) {
        try {
          module.dispose?.();
        } catch (err) {
          info(module.name, `\xE9chec de l'arr\xEAt du module : ${errorText(err)}`);
        }
      }
    });
    const list = started.map((m) => m.name).join(", ") || "aucun";
    if (signature) info(signature, `modules charg\xE9s : ${list}`);
    else plain(`modules charg\xE9s : ${list}`);
  }

  // src/shared/config.ts
  var DEFAULT_CLIENT_CONFIG = {
    debug: false,
    noclip: { speed: 40, fastMultiplier: 2.5, mouseCoefficient: 0.01 }
  };
  var ConfigEvents = {
    /** client → serveur : « envoie-moi la config » (au chargement du script client). */
    Request: "mira:config:request",
    /** serveur → client : la ClientConfig. */
    Sync: "mira:config:sync"
  };

  // src/client/modules/config.ts
  var current = DEFAULT_CLIENT_CONFIG;
  function getConfig() {
    return current;
  }
  function positive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  }
  function sanitize(data) {
    const noclip2 = data?.noclip ?? {};
    const d = DEFAULT_CLIENT_CONFIG.noclip;
    return {
      debug: data?.debug === true,
      noclip: {
        speed: positive(noclip2.speed, d.speed),
        fastMultiplier: positive(noclip2.fastMultiplier, d.fastMultiplier),
        mouseCoefficient: positive(noclip2.mouseCoefficient, d.mouseCoefficient)
      }
    };
  }
  var config = {
    name: "config",
    init() {
      mp.events.onServer(ConfigEvents.Sync, (data) => {
        current = sanitize(data);
        setDebug(current.debug);
        debug("config", `re\xE7ue : noclip ${current.noclip.speed} m/s (\xD7${current.noclip.fastMultiplier} avec Shift)`);
      });
      mp.events.emitServer(ConfigEvents.Request);
    }
  };

  // src/client/lib/natives.ts
  var InputAction = { IACT_Press: 1, IACT_Release: 2 };
  var Key = {
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
    F2: 113
  };
  var SHIFT_KEYS = [Key.Shift, Key.LShift, Key.RShift];
  var CTRL_KEYS = [Key.Ctrl, Key.LCtrl, Key.RCtrl];
  var actionError = null;
  var listenerAction = null;
  function getActionReaderStatus() {
    return actionError ? `d\xE9sactiv\xE9e (${actionError})` : "ok";
  }
  function resetActionReader() {
    actionError = null;
    listenerAction = null;
  }
  function onPlayerAction(isActive, callback) {
    mp.game.observeBeforeRaw("PlayerPuppet", "OnAction", (_self, action) => {
      if (actionError || !isActive()) return;
      try {
        const reader = listenerAction ??= mp.game.gameinputScriptListenerAction;
        callback(reader.GetName(action), reader.GetValue(action));
      } catch (err) {
        actionError = err instanceof Error ? err.message : String(err);
      }
    });
  }
  var KEY_BY_NAME = Object.fromEntries(
    Object.entries(Key).map(([name, value]) => [`IK_${name}`, value])
  );
  function toNumber(value, byName) {
    if (typeof value === "number") return value;
    if (typeof value === "string") return byName[value] ?? Number(value);
    return Number(value);
  }
  function readKeyEvent(action, key) {
    const a = toNumber(action, InputAction);
    const down = a === InputAction.IACT_Press ? true : a === InputAction.IACT_Release ? false : null;
    return { down, code: toNumber(key, KEY_BY_NAME) };
  }
  function getPlayer() {
    return mp.game.GetPlayer() ?? null;
  }
  function getPosition(player) {
    const p = player.GetWorldPosition();
    return { x: p.x, y: p.y, z: p.z };
  }
  function getYaw(player) {
    return player.GetWorldYaw();
  }
  var cache = null;
  function acquireNoclipCache() {
    cache = {
      camera: mp.game.ScriptGameInstance.GetCameraSystem(),
      facility: mp.game.ScriptGameInstance.GetTeleportationFacility(),
      vec4: Object.assign(new mp.game.Vector4(), { w: 1 }),
      rotation: new mp.game.EulerAngles()
    };
  }
  function releaseNoclipCache() {
    cache = null;
  }
  function cameraSystem() {
    return cache?.camera ?? mp.game.ScriptGameInstance.GetCameraSystem();
  }
  function getCameraForward() {
    const f = cameraSystem().GetActiveCameraForward();
    return { x: f.x, y: f.y, z: f.z };
  }
  function getCameraRight() {
    const r = cameraSystem().GetActiveCameraRight();
    const len = Math.hypot(r.x, r.y);
    return len > 1e-6 ? { x: r.x / len, y: r.y / len } : { x: 0, y: 0 };
  }
  function getCameraYaw() {
    return mp.game.Vector4.ToRotation(cameraSystem().GetActiveCameraForward()).yaw;
  }
  function moveTo(player, pos, yaw2) {
    if (!cache) acquireNoclipCache();
    const c = cache;
    Object.assign(c.rotation, { pitch: 0, roll: 0, yaw: yaw2 });
    c.facility.Teleport(
      player,
      Object.assign(c.vec4, pos),
      c.rotation
    );
  }
  function teleportTo(player, pos, yaw2) {
    const facility = mp.game.ScriptGameInstance.GetTeleportationFacility();
    const target = Object.assign(new mp.game.Vector4(), { x: pos.x, y: pos.y, z: pos.z, w: 1 });
    const rotation = Object.assign(new mp.game.EulerAngles(), { pitch: 0, roll: 0, yaw: yaw2 });
    facility.Teleport(player, target, rotation);
  }
  function getMapMarkerPosition() {
    const system = mp.game.ScriptGameInstance.GetMappinSystem();
    const id = system.GetManuallyTrackedMappinID();
    if (!id || !id.value) return null;
    const mappin = system.GetMappin(id);
    if (!mappin) return null;
    const p = mappin.GetWorldPosition();
    return { x: p.x, y: p.y, z: p.z };
  }
  var GROUND_COLLISION_GROUPS = ["Static", "Terrain"];
  var raycastError = null;
  function getRaycastError() {
    return raycastError;
  }
  function findGroundZ(x, y, fromZ, toZ) {
    const system = mp.game.ScriptGameInstance.GetSpatialQueriesSystem();
    const start2 = Object.assign(new mp.game.Vector4(), { x, y, z: fromZ, w: 1 });
    const end = Object.assign(new mp.game.Vector4(), { x, y, z: toZ, w: 1 });
    let best = null;
    for (const group of GROUND_COLLISION_GROUPS) {
      try {
        const [hit, result] = system.SyncRaycastByCollisionGroup(start2, end, group, false, false);
        const z = result?.position?.z;
        if (hit && typeof z === "number" && Number.isFinite(z) && (best === null || z > best)) best = z;
        raycastError = null;
      } catch (err) {
        raycastError = err instanceof Error ? err.message : String(err);
      }
    }
    return best;
  }
  function copyToClipboard(text) {
    try {
      mp.game.ScriptGameInstance.GetInkSystem().SetClipboardText(text);
      return true;
    } catch {
      return false;
    }
  }
  function findEntity(gameId) {
    if (!gameId) return null;
    const id = Object.assign(new mp.game.entEntityID(), { hash: gameId });
    return mp.game.ScriptGameInstance.FindEntityByID(id) ?? null;
  }
  function mountingRequest(request, vehicleId, slot) {
    const data = Object.assign(new mp.game.gameMountEventData(), {
      isInstant: true,
      slotName: slot,
      mountParentEntityId: vehicleId,
      entryAnimName: "forcedTransition"
    });
    const slotId = Object.assign(new mp.game.gamemountingMountingSlotId(), { id: slot });
    const info2 = Object.assign(new mp.game.gamemountingMountingInfo(), {
      childId: mp.game.GetPlayer().GetEntityID(),
      parentId: vehicleId,
      slotId
    });
    return Object.assign(request, { lowLevelMountingInfo: info2, mountData: data });
  }
  function mountPlayerInto(gameId, slot = "seat_front_left") {
    const vehicle = findEntity(gameId);
    if (!vehicle) return false;
    const request = mountingRequest(new mp.game.gamemountingMountingRequest(), vehicle.GetEntityID(), slot);
    mp.game.ScriptGameInstance.GetMountingFacility().Mount(request);
    return true;
  }
  function unmountPlayer() {
    const playerObject = mp.game.GetPlayerObject();
    const vehicle = playerObject ? mp.game.GetMountedVehicle(playerObject) : null;
    if (!vehicle) return;
    const slot = vehicle.GetSlotIdForMountedObject(playerObject);
    const request = mountingRequest(new mp.game.gamemountingUnmountingRequest(), vehicle.GetEntityID(), slot);
    mp.game.ScriptGameInstance.GetMountingFacility().Unmount(request);
  }
  function isInVehicle() {
    return Boolean(mp.game.GetMountedVehicle(mp.game.GetPlayerObject()));
  }
  function showWarning(text) {
    try {
      mp.game.GetPlayer()?.SetWarningMessage(text);
    } catch {
    }
  }
  function getGameMouseSensitivityX() {
    try {
      const setting = mp.game.ScriptGameInstance.GetSettingsSystem().GetVar("/controls/fppcameramouse", "FPP_MouseX");
      const value = setting?.GetValue();
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }
  var HEALTH_STAT_POOL = 17;
  var HEALTH_STAT = 787;
  var ADDITIVE_MODIFIER = 0;
  function setPlayerHealth(player, value) {
    const stats = mp.game.ScriptGameInstance.GetStatsSystem();
    const pools = mp.game.ScriptGameInstance.GetStatPoolsSystem();
    const id = player.GetEntityID();
    stats.RemoveAllModifiers(id, HEALTH_STAT, true);
    const modifier = Object.assign(new mp.game.gameConstantStatModifierData_Deprecated(), {
      statType: HEALTH_STAT,
      modifierType: ADDITIVE_MODIFIER,
      value
    });
    stats.AddModifier(id, modifier);
    pools.RequestSettingStatPoolValueIgnoreChangeMode(id, HEALTH_STAT_POOL, value, new mp.game.gameObject(), true);
  }
  var NO_MOVEMENT = "GameplayRestriction.NoMovement";
  function setMovementLocked(player, locked) {
    const system = mp.game.ScriptGameInstance.GetStatusEffectSystem();
    const id = player.GetEntityID();
    if (locked) {
      system.ApplyStatusEffect(id, NO_MOVEMENT, player.GetRecordID(), id);
    } else if (system.HasStatusEffect(id, NO_MOVEMENT)) {
      system.RemoveStatusEffect(id, NO_MOVEMENT);
    }
  }
  var GOD_MODE_INVULNERABLE = 0;
  var GOD_MODE_SOURCE = "mira_utils:noclip";
  function setInvulnerable(player, enabled2, source = GOD_MODE_SOURCE) {
    const godMode = mp.game.ScriptGameInstance.GetGodModeSystem();
    const id = player.GetEntityID();
    if (enabled2) {
      godMode.AddGodMode(id, GOD_MODE_INVULNERABLE, source);
    } else {
      godMode.ClearGodMode(id, source);
    }
  }

  // src/shared/notify-events.ts
  var NotifyEvents = {
    /** serveur → client : message à afficher au joueur (texte) : console F8 + bandeau à l'écran. */
    Show: "mira:notify",
    /** serveur → client : lignes à écrire dans la console F8 seulement (listes longues). */
    Print: "mira:notify:print"
  };

  // src/client/modules/notify.ts
  function showMessage(text) {
    console.log(text);
    showWarning(text);
  }
  var MAX_PRINT_LINES = 400;
  var notify = {
    name: "notify",
    init() {
      mp.events.onServer(NotifyEvents.Show, (text) => {
        if (typeof text === "string") showMessage(text);
      });
      mp.events.onServer(NotifyEvents.Print, (lines) => {
        if (!Array.isArray(lines)) return;
        for (const line of lines.slice(0, MAX_PRINT_LINES)) {
          if (typeof line === "string") console.log(line);
        }
      });
    }
  };

  // src/client/modules/coords.ts
  function copyPosition(command, withHeading) {
    const player = getPlayer();
    if (!player) {
      showMessage(`${command} : joueur introuvable`);
      return;
    }
    const { x, y, z } = getPosition(player);
    const values = withHeading ? [x, y, z, getYaw(player)] : [x, y, z];
    const text = values.map((v) => v.toFixed(2)).join(", ");
    showMessage(copyToClipboard(text) ? `${command} copi\xE9e : ${text}` : `${command} (copie impossible) : ${text}`);
  }
  var coords = {
    name: "coords",
    init() {
      mp.commands.add("pos", () => copyPosition("pos", false));
      mp.commands.add("posh", () => copyPosition("posh", true));
    },
    dispose() {
      mp.commands.remove("pos");
      mp.commands.remove("posh");
    }
  };

  // src/shared/noclip-events.ts
  var NoclipEvents = {
    /** Client → serveur : le joueur demande à basculer le noclip. */
    Request: "noclip:request",
    /** Serveur → client : état accordé (`true` = actif). */
    Set: "noclip:set"
  };

  // src/client/modules/noclip.ts
  var TOGGLE_KEY = Key.F2;
  var MAX_DT = 0.1;
  var DEBUG_INTERVAL = 500;
  var settings = {
    /** Coefficient souris forcé par `noclip_sens` (null = valeur de config.toml). */
    sensitivityOverride: null,
    debug: false
  };
  function mouseCoefficient() {
    return settings.sensitivityOverride ?? getConfig().noclip.mouseCoefficient;
  }
  var YAW_ACTIONS = /* @__PURE__ */ new Set(["CameraMouseX", "CameraX"]);
  var held = /* @__PURE__ */ new Set();
  var enabled = false;
  var gameLoaded = false;
  var tickId = null;
  var position = null;
  var yaw = 0;
  var mouseX = 0;
  var gameSensitivity = 1;
  var lastTime = 0;
  var lastDebug = 0;
  function isHeld(keys) {
    return keys.some((k) => held.has(k));
  }
  function normalizeAngle(deg) {
    return ((deg + 180) % 360 + 360) % 360 - 180;
  }
  function isNoclipActive() {
    return enabled && position !== null;
  }
  function relocateNoclip(pos, newYaw) {
    if (!enabled || !position) return false;
    position = { ...pos };
    yaw = normalizeAngle(newYaw);
    mouseX = 0;
    return true;
  }
  function tick() {
    const player = getPlayer();
    if (!player || !position) return;
    const now = mp.getTimer();
    const dt = Math.min((now - lastTime) / 1e3, MAX_DT);
    lastTime = now;
    const forward = getCameraForward();
    const right = getCameraRight();
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (held.has(Key.Z) || held.has(Key.W)) {
      dx += forward.x;
      dy += forward.y;
      dz += forward.z;
    }
    if (held.has(Key.S)) {
      dx -= forward.x;
      dy -= forward.y;
      dz -= forward.z;
    }
    if (held.has(Key.D)) {
      dx += right.x;
      dy += right.y;
    }
    if (held.has(Key.Q) || held.has(Key.A)) {
      dx -= right.x;
      dy -= right.y;
    }
    if (held.has(Key.Space)) dz += 1;
    if (isHeld(CTRL_KEYS)) dz -= 1;
    const len = Math.hypot(dx, dy, dz);
    if (len > 0) {
      const { speed, fastMultiplier } = getConfig().noclip;
      const step = speed * (isHeld(SHIFT_KEYS) ? fastMultiplier : 1) * dt / len;
      position = { x: position.x + dx * step, y: position.y + dy * step, z: position.z + dz * step };
    }
    yaw = normalizeAngle(yaw - mouseX * mouseCoefficient() * gameSensitivity);
    mouseX = 0;
    moveTo(player, position, yaw);
    if (settings.debug && now - lastDebug >= DEBUG_INTERVAL) {
      lastDebug = now;
      const real = getPosition(player);
      console.log(
        `[noclip] lecture=${getActionReaderStatus()} yawVoulu=${yaw.toFixed(1)} yawCam=${getCameraYaw().toFixed(1)} yawPerso=${getYaw(player).toFixed(1)} cible=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}) r\xE9el=(${real.x.toFixed(1)}, ${real.y.toFixed(1)}, ${real.z.toFixed(1)})`
      );
    }
  }
  function start() {
    const player = getPlayer();
    if (!player || tickId !== null) return;
    acquireNoclipCache();
    resetActionReader();
    position = getPosition(player);
    yaw = getCameraYaw();
    mouseX = 0;
    const read = getGameMouseSensitivityX();
    gameSensitivity = read ?? 1;
    debug("noclip", `sensibilit\xE9 souris du jeu = ${read ?? "introuvable (1 utilis\xE9)"}`);
    lastTime = mp.getTimer();
    setInvulnerable(player, true);
    setMovementLocked(player, true);
    tickId = mp.setTick(tick);
    debug("noclip", `activ\xE9 (lecture souris : ${getActionReaderStatus()})`);
  }
  function stop() {
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
    debug("noclip", "d\xE9sactiv\xE9");
  }
  var noclip = {
    name: "noclip",
    init() {
      mp.events.onServer(NoclipEvents.Set, (state) => {
        enabled = state === true;
        if (enabled) start();
        else stop();
      });
      mp.game.onGameLoaded(() => {
        gameLoaded = true;
      });
      mp.game.onInit(() => {
        onPlayerAction(
          () => enabled,
          (name, value) => {
            if (YAW_ACTIONS.has(name)) mouseX += value;
          }
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
      mp.commands.add("noclip_sens", (_id, args) => {
        const value = Number(args[0]);
        if (args[0] === "reset") settings.sensitivityOverride = null;
        else if (Number.isFinite(value) && value > 0 && value <= 10) settings.sensitivityOverride = value;
        const coefficient = mouseCoefficient();
        console.log(
          `[noclip] coefficient = ${coefficient}${settings.sensitivityOverride === null ? " (config.toml)" : " (forc\xE9)"} \xD7 sensibilit\xE9 du jeu ${gameSensitivity} = ${(coefficient * gameSensitivity).toFixed(4)} \xB0/unit\xE9`
        );
      });
      mp.commands.add("noclip_debug", () => {
        settings.debug = !settings.debug;
        console.log(`[noclip] diagnostic = ${settings.debug}`);
      });
    },
    dispose() {
      if (enabled) stop();
      enabled = false;
      mp.commands.remove("noclip_sens");
      mp.commands.remove("noclip_debug");
    }
  };

  // src/shared/spawn-events.ts
  var SpawnEvents = {
    /** client → serveur : « mon jeu est chargé, connais-tu ma position ? ». */
    Check: "mira:spawn:check",
    /** serveur → client : « je ne te connais pas : spawne-toi » (position serveur encore à 0 0 0). */
    Needed: "mira:spawn:needed"
  };

  // src/client/modules/spawn.ts
  var SPAWN_HEALTH = 300;
  var FALLBACK_SPAWN = { x: -1392.637, y: 1271.536, z: 123.082, yaw: 1 };
  function spawnHere(reason) {
    const player = getPlayer();
    if (!player) {
      showMessage("respawn : joueur introuvable");
      return;
    }
    try {
      const pos = getPosition(player);
      const unusable = Math.abs(pos.x) < 1 && Math.abs(pos.y) < 1 && Math.abs(pos.z) < 1;
      const target = unusable ? FALLBACK_SPAWN : { ...pos, yaw: getYaw(player) };
      setPlayerHealth(player, SPAWN_HEALTH);
      mp.local.spawnPlayer(target.x, target.y, target.z, target.yaw);
      debug("spawn", `${reason} : spawn \xE0 ${target.x.toFixed(1)} ${target.y.toFixed(1)} ${target.z.toFixed(1)}`);
    } catch (err) {
      showMessage(`respawn : \xE9chec (${errorText(err)})`);
    }
  }
  var spawn = {
    name: "spawn",
    init() {
      mp.events.onServer(SpawnEvents.Needed, () => spawnHere("position inconnue du serveur"));
      mp.game.onGameLoaded(() => mp.events.emitServer(SpawnEvents.Check));
      mp.commands.add("respawn", () => {
        spawnHere("commande respawn");
        showMessage("respawn : fait");
      });
    },
    dispose() {
      mp.commands.remove("respawn");
    }
  };

  // src/shared/teleport-events.ts
  var TeleportEvents = {
    /** serveur → client : se téléporter à (x, y, z | null = poser au sol, yaw | null = garder l'orientation). */
    To: "mira:teleport:to",
    /** serveur → client : se téléporter au marqueur posé sur la carte (commande tpm). */
    ToMarker: "mira:teleport:marker"
  };

  // src/client/lib/menus.ts
  var pauseMenu = null;
  var settingsMenu = null;
  var tracking = false;
  function trackMenus() {
    if (tracking) return;
    tracking = true;
    mp.game.onInit(() => {
      mp.game.observe("SettingsMainGameController", "OnMenuChanged", (self) => {
        settingsMenu = self;
      });
      mp.game.observe("SettingsMainGameController", "RequestClose", () => {
        settingsMenu = null;
      });
      mp.game.observe("MenuScenario_PauseMenu", "OnSwitchToSettings", (self) => {
        pauseMenu = self;
      });
      mp.game.observe("MenuScenario_PauseMenu", "OnEnterScenario", (self) => {
        pauseMenu = self;
      });
      mp.game.observe("MenuScenario_PauseMenu", "OnLeaveScenario", () => {
        pauseMenu = null;
      });
    });
  }
  function closeAllMenus() {
    try {
      mp.game.GetPlayer()?.QueueEvent(new mp.game.ForceCloseHubMenuEvent());
      pauseMenu?.OnClosePauseMenu();
      settingsMenu?.RequestClose();
    } catch (err) {
      info("menus", `fermeture impossible : ${errorText(err)}`);
    }
  }

  // src/client/modules/teleport.ts
  var GOD_SOURCE = "mira_utils:teleport";
  var GROUND_OFFSET = 0.1;
  var GROUND_RETRY_MS = 100;
  var GROUND_TIMEOUT_MS = 6e3;
  var GOD_LINGER_MS = 1500;
  var search = null;
  var lingerTimer = null;
  function fmt(p) {
    return `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`;
  }
  function clearLinger() {
    if (lingerTimer !== null) {
      clearTimeout(lingerTimer);
      lingerTimer = null;
    }
  }
  function endSearch(lingerGod) {
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
  function searchTick() {
    const s = search;
    const player = getPlayer();
    if (!s || !player) return;
    if (isNoclipActive()) {
      endSearch(false);
      return;
    }
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
        `${s.label} : sol introuvable, tu restes \xE0 ${fmt({ x: s.x, y: s.y, z: s.holdZ })}` + (error ? ` (raycast : ${error})` : "")
      );
      endSearch(false);
    }
  }
  function teleportToGround(x, y, zHint, yaw2, label) {
    const player = getPlayer();
    if (!player) return;
    endSearch(false);
    clearLinger();
    const holdZ = zHint ?? 300;
    const windows = zHint === null ? [[1e3, -200]] : [
      [zHint + 3, zHint - 150],
      [zHint + 500, -200]
    ];
    closeAllMenus();
    setInvulnerable(player, true, GOD_SOURCE);
    teleportTo(player, { x, y, z: holdZ }, yaw2);
    const now = mp.getTimer();
    search = { x, y, holdZ, yaw: yaw2, windows, startedAt: now, lastTry: 0, tickId: mp.setTick(searchTick), label };
  }
  function runTeleport(x, y, z, yaw2, label = "tp") {
    const player = getPlayer();
    if (!player) return;
    if (isInVehicle()) {
      showMessage(`${label} : descends du v\xE9hicule avant de te t\xE9l\xE9porter`);
      return;
    }
    const finalYaw = yaw2 ?? getYaw(player);
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
  function teleportToMarker() {
    const marker = getMapMarkerPosition();
    if (!marker) {
      showMessage("tpm : aucun marqueur sur la carte (pose-en un avec la carte ouverte)");
      return;
    }
    const player = getPlayer();
    if (!player) return;
    if (isInVehicle()) {
      showMessage("tpm : descends du v\xE9hicule avant de te t\xE9l\xE9porter");
      return;
    }
    const yaw2 = getYaw(player);
    const flyTarget = { x: marker.x, y: marker.y, z: marker.z + 1 };
    if (relocateNoclip(flyTarget, yaw2)) {
      showMessage(`tpm (noclip) : ${fmt(flyTarget)}`);
      return;
    }
    teleportToGround(marker.x, marker.y, marker.z, yaw2, "tpm");
  }
  function guarded(label, action) {
    try {
      action();
    } catch (err) {
      endSearch(false);
      showMessage(`${label} : \xE9chec (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  var teleport = {
    name: "teleport",
    init() {
      trackMenus();
      mp.events.onServer(TeleportEvents.To, (x, y, z, yaw2) => {
        if (typeof x !== "number" || typeof y !== "number") return;
        guarded(
          "tp",
          () => runTeleport(x, y, typeof z === "number" ? z : null, typeof yaw2 === "number" ? yaw2 : null)
        );
      });
      mp.events.onServer(TeleportEvents.ToMarker, () => guarded("tpm", teleportToMarker));
    },
    dispose() {
      endSearch(false);
      clearLinger();
      const player = getPlayer();
      if (player) setInvulnerable(player, false, GOD_SOURCE);
    }
  };

  // src/shared/vehicle-events.ts
  var VehicleEvents = {
    /** serveur → client : s'asseoir au volant du véhicule (ID réseau) dès qu'il est chargé. */
    SeatIn: "mira:vehicle:seat",
    /** serveur → client : descendre du véhicule actuel (avant sa suppression). */
    Leave: "mira:vehicle:leave"
  };

  // src/client/modules/vehicles.ts
  var SEAT_TIMEOUT_MS = 5e3;
  var SEAT_POLL_MS = 100;
  var pending = null;
  function toId(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  function findStreamedVehicle(netId) {
    const direct = toId(mp.network.getVehicleGameId(netId));
    if (direct) return direct;
    for (const gameId of mp.network.getStreamedPool("CVehicle")) {
      if (toId(mp.network.getVehicleId(gameId)) === netId) return toId(gameId);
    }
    return 0;
  }
  function cancelPending() {
    if (!pending) return;
    mp.events.off("vehicleStreamIn", pending.listener);
    clearInterval(pending.timer);
    pending = null;
  }
  function trySeat(netId, startedAt) {
    const gameId = findStreamedVehicle(netId);
    if (!gameId || !findEntity(gameId)) return false;
    cancelPending();
    debug("vehicles", `v\xE9hicule pr\xEAt (gameId ${gameId}) apr\xE8s ${mp.getTimer() - startedAt} ms`);
    try {
      if (!mountPlayerInto(gameId)) showMessage("car : v\xE9hicule introuvable dans le jeu");
    } catch (err) {
      showMessage(`car : impossible de s'asseoir (${errorText(err)})`);
    }
    return true;
  }
  function describeStreamed(netId) {
    try {
      const gameId = findStreamedVehicle(netId);
      if (gameId) return `#${netId} annonc\xE9 (gameId ${gameId}) mais objet absent du moteur`;
      const pool = mp.network.getStreamedPool("CVehicle");
      const netIds = pool.map((g) => toId(mp.network.getVehicleId(g)));
      return `attendu #${netId} ; ${pool.length} v\xE9hicule(s) charg\xE9(s), ID r\xE9seau : ${netIds.join(", ") || "aucun"}`;
    } catch (err) {
      return `lecture des v\xE9hicules charg\xE9s impossible (${errorText(err)})`;
    }
  }
  function seatWhenStreamed(netId) {
    cancelPending();
    const startedAt = mp.getTimer();
    if (trySeat(netId, startedAt)) return;
    const listener = (streamedNetId) => {
      if (toId(streamedNetId) === netId) trySeat(netId, startedAt);
    };
    const timer = setInterval(() => {
      if (trySeat(netId, startedAt)) return;
      if (mp.getTimer() - startedAt >= SEAT_TIMEOUT_MS) {
        debug("vehicles", describeStreamed(netId));
        cancelPending();
        showMessage("car : impossible de t'asseoir automatiquement, monte dedans \xE0 la main");
      }
    }, SEAT_POLL_MS);
    pending = { netId, startedAt, listener, timer };
    mp.events.on("vehicleStreamIn", listener);
    debug("vehicles", `attente du v\xE9hicule #${netId}`);
  }
  var vehicles = {
    name: "vehicles",
    init() {
      mp.events.onServer(VehicleEvents.SeatIn, (netId) => {
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
    }
  };

  // src/client/index.ts
  startModules([config, notify, spawn, noclip, teleport, coords, vehicles], (handler) => mp.events.on("resourceStop", handler));
})();
