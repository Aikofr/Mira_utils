# Mira_utils

A small developer toolbox for [CyberMP](https://docs.cyber.mp/) servers (Cyberpunk 2077 multiplayer): noclip, teleports, map-marker teleport, position copy, vehicle spawner.
Written in TypeScript, organised as one module per tool, configured with a TOML file (no rebuild needed).

*Version française plus bas.*

> Built and tested on the CyberMP beta (November 2026). The beta moves fast: if something breaks after an update, please open an issue.

## Installation

1. Copy this folder into your server's `resources/` folder, e.g. `resources/mira_utils/`.
2. Add it to `server.toml`:
   ```toml
   resources = [
     "mira_utils",
   ]
   ```
3. Open `config.toml` and **add your CyberMP nickname** to `[admin] players`. By default every tool is admin-only (`allow_all = false`).
4. Start the server. The console shows `[mira_utils] modules chargés : config, spawn, noclip, teleport, vehicles`.

The compiled scripts (`dist/`) are included: no Node.js needed to run it.

## Commands

All commands are typed in the **F8 console**, without a slash.

| Command | What it does |
| :--- | :--- |
| **F2** (key) | Toggle noclip: fly through walls, ZQSD/WASD, Space up, Ctrl down, Shift faster. Invulnerable and unable to attack while active. |
| `tp x y z [heading]` | Teleport to exact coordinates. |
| `tp x y` | Teleport and land on the ground at that spot. |
| `tpm` | Teleport to the marker placed on the map, on the ground. |
| `pos` | Show and copy your position (`x, y, z`) to the clipboard. |
| `posh` | Same, with your heading (`x, y, z, heading`): paste it after `tp` to come back facing the same way. |
| `car <name>` | Spawn a vehicle from `vehicles.toml` and sit in the driver seat. Part of a name works (`car calib`). |
| `car Vehicle.<record> <appearance>` | Spawn any vehicle by its TweakDB record and appearance. |
| `dv` | Delete the vehicle you are in, or the nearest one (6 m). |
| `carlist [search]` | List the catalogue in F8 (`carlist bike`, `carlist untested`…). |
| `respawn` | Re-register your character with the server (see "Known issues"). |
| `noclip_sens <value>` / `noclip_sens reset` | Tune the noclip mouse rotation for testing. |
| `noclip_debug` | Per-frame noclip diagnostics. |

One vehicle per player: spawning a new one removes the previous one. Vehicles are removed when their owner disconnects and when the resource restarts.

## Configuration

- **`config.toml`**: permissions (`allow_all`, `[admin] players`), noclip speeds, vehicle health, debug messages (`[general] debug`).
- **`vehicles.toml`**: the vehicle catalogue (39 player vehicles to start with). Copy a `[[vehicle]]` block to add one.

After editing either file, type `restart mira_utils` in the server console.

## Known issues / good to know

- **The server sees players at `0 0 0` until a script calls `mp.local.spawnPlayer`.** Vehicles spawned "next to" such a player are created at the map origin and never show up. The `spawn` module fixes this by spawning the player in place on connect. If your server already has its own spawn script, set `[spawn] enabled = false`.
- Vehicle spawning passes a `health` value: without it the vehicle may be created already destroyed.
- The noclip moves the player by teleporting every frame (`TeleportationFacility`), which is what CyberMP supports today.
- Position is client-authoritative in CyberMP: these tools are meant for admins and development, not as an anti-cheat.

## Development

```bash
npm install
npm run typecheck
npm run build
```

Sources are in `src/` (`client/`, `server/`, `shared/`), one file per tool in `modules/`. Engine calls are isolated in `src/client/lib/natives.ts`.

## License

MIT, see [LICENSE](LICENSE). The initial vehicle list comes from [CyberMP-Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam) (MIT), see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

# Version française

Petite boîte à outils de développement pour les serveurs [CyberMP](https://docs.cyber.mp/) : noclip, téléportation, téléportation au marqueur de la carte, copie de la position, apparition de véhicules.
En TypeScript, un module par outil, réglages dans un fichier TOML (sans recompiler).

> Développé et testé sur la beta de CyberMP (novembre 2026). La beta évolue vite : si quelque chose casse après une mise à jour, ouvre une issue.

## Installation

1. Copie ce dossier dans le dossier `resources/` de ton serveur, par exemple `resources/mira_utils/`.
2. Ajoute-le dans `server.toml` : `resources = ["mira_utils"]`.
3. Ouvre `config.toml` et **ajoute ton pseudo CyberMP** dans `[admin] players`. Par défaut, tous les outils sont réservés aux admins (`allow_all = false`).
4. Démarre le serveur : la console affiche `[mira_utils] modules chargés : …`.

Les scripts compilés (`dist/`) sont fournis : pas besoin de Node.js pour l'utiliser.

## Commandes (console F8, sans slash)

| Commande | Effet |
| :--- | :--- |
| **F2** (touche) | Noclip : vol libre à travers les murs, ZQSD/WASD, Espace monte, Ctrl descend, Shift accélère. Invulnérable et sans attaque pendant le noclip. |
| `tp x y z [orientation]` | Téléportation aux coordonnées exactes. |
| `tp x y` | Téléportation posée au sol à cet endroit. |
| `tpm` | Téléportation au marqueur posé sur la carte, au sol. |
| `pos` / `posh` | Affiche et copie ta position (`posh` : avec l'orientation, à coller après `tp`). |
| `car <nom>` | Fait apparaître un véhicule de `vehicles.toml` et t'assoit au volant (`car calib` marche aussi). |
| `car Vehicle.<record> <apparence>` | N'importe quel véhicule, par son record TweakDB et son apparence. |
| `dv` | Supprime le véhicule où tu es, ou le plus proche (6 m). |
| `carlist [recherche]` | Liste le catalogue dans F8 (`carlist bike`, `carlist untested`…). |
| `respawn` | Réinscrit ton personnage auprès du serveur (voir ci-dessous). |
| `noclip_sens` / `noclip_debug` | Réglage et diagnostic du noclip. |

## À savoir

- **Le serveur voit les joueurs en `0 0 0` tant qu'aucun script n'appelle `mp.local.spawnPlayer`** : les véhicules créés « à côté » apparaissent alors au centre de la carte. Le module `spawn` règle ça en spawnant le joueur sur place à la connexion. Si ton serveur a déjà son propre script de spawn, mets `[spawn] enabled = false`.
- Après une modification de `config.toml` ou `vehicles.toml` : `restart mira_utils` dans la console du serveur.

## Licence

MIT (voir [LICENSE](LICENSE)). Liste de véhicules de départ issue de [CyberMP-Freeroam](https://github.com/Cyber-MP/CyberMP-Freeroam) (MIT), voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
