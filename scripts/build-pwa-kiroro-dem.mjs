// Build the isolated Kiroro PWA PoC DEM from AWS Open Data Terrain Tiles.
// Source: https://registry.opendata.aws/terrain-tiles/
// Source attribution/licences: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
// Only the Kiroro catalog bounds plus one tile of terrain overscan are fetched.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const bbox = [140.966636, 43.048858, 141.042287, 43.079879];
const zooms = [8, 9, 10, 11, 12, 13, 14, 15];
const output = join(import.meta.dirname, '..', 'dist', 'data', 'offline', 'kiroro-dem');
const baseUrl = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

function tileX(lon, z) { return Math.floor((lon + 180) / 360 * 2 ** z); }
function tileY(lat, z) {
  return Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
}

const tiles = [];
for (const z of zooms) {
  const max = 2 ** z - 1;
  for (let x = Math.max(0, tileX(bbox[0], z) - 1); x <= Math.min(max, tileX(bbox[2], z) + 1); x++) {
    for (let y = Math.max(0, tileY(bbox[3], z) - 1); y <= Math.min(max, tileY(bbox[1], z) + 1); y++) {
      tiles.push({ z, x, y, path: `${z}/${x}/${y}.png` });
    }
  }
}

async function download(tile) {
  const file = join(output, tile.path);
  let bytes;
  try {
    bytes = await readFile(file);
    if (bytes.length < 100 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') bytes = null;
  } catch { /* This tile has not been downloaded yet. */ }
  if (!bytes) {
    const url = `${baseUrl}/${tile.path}`;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) {
          throw new Error(`${response.status} ${response.headers.get('content-type')}`);
        }
        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Not a PNG');
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.part`, bytes);
        await rename(`${file}.part`, file);
        break;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (!bytes) throw new Error(`${tile.path}: ${lastError?.message}`);
  }
  return { ...tile, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const results = new Array(tiles.length);
let cursor = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < tiles.length) {
    const index = cursor++;
    results[index] = await download(tiles[index]);
  }
}));
const manifest = {
  version: 1,
  source: 'AWS Open Data Terrain Tiles / Mapzen Joerd (USGS SRTM and GMTED; NOAA ETOPO1)',
  encoding: 'terrarium',
  tileSize: 256,
  bbox,
  minzoom: 8,
  maxzoom: 15,
  paddingTiles: 1,
  tiles: results,
};
await mkdir(output, { recursive: true });
await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
console.log(`DEM: ${results.length} tiles, ${results.reduce((sum, tile) => sum + tile.bytes, 0)} bytes`);
