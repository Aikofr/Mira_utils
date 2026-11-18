// Compile les scripts client et serveur en un fichier chacun (le client n'a pas de node_modules).
import { build } from 'esbuild';

const common = { bundle: true, format: 'iife', target: 'es2022', logLevel: 'info' };

await Promise.all([
  build({ ...common, entryPoints: ['src/client/index.ts'], outfile: 'dist/client.js' }),
  build({ ...common, entryPoints: ['src/server/index.ts'], outfile: 'dist/server.js', platform: 'node' }),
]);
