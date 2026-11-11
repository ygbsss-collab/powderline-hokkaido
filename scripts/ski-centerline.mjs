// Converts ski-run outlines (Polygon / MultiPolygon / closed LineString) into centerlines.
//
// Method (no dependencies): project the polygon to local metres, rasterise it on a grid, thin the mask to a
// one-pixel skeleton (Zhang-Suen), take the longest path through the skeleton, extend both ends to the outline,
// then simplify and smooth. The result follows curved runs instead of a straight axis.
//
// Rules:
//  - Lift features and existing LineString/MultiLineString runs are kept unchanged.
//  - An outline that already has a centerline run (a run line lying mostly inside it) is dropped as a duplicate.
//  - An outline whose centerline cannot be built is dropped (never kept as an outline) and counted as failed.

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LNG = 111320;

function isClosedLine(coords) {
  if (!Array.isArray(coords) || coords.length < 4) return false;
  const a = coords[0];
  const b = coords[coords.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

function makeProjection(rings) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const ring of rings) for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const lat0 = (minLat + maxLat) / 2;
  const kx = METERS_PER_DEG_LNG * Math.cos((lat0 * Math.PI) / 180);
  return {
    toXY: ([lng, lat]) => [(lng - minLng) * kx, (lat - minLat) * METERS_PER_DEG_LAT],
    toLngLat: ([x, y]) => [minLng + x / kx, minLat + y / METERS_PER_DEG_LAT],
    width: (maxLng - minLng) * kx,
    height: (maxLat - minLat) * METERS_PER_DEG_LAT
  };
}

// Even-odd scanline fill, so holes (inner rings) are respected.
function rasterise(ringsXY, cell, pad, cols, rows) {
  const mask = new Uint8Array(cols * rows);
  let filled = 0;
  for (let r = 0; r < rows; r += 1) {
    const y = (r - pad + 0.5) * cell;
    const xs = [];
    for (const ring of ringsXY) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / cell - 0.5) + pad);
      const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] / cell - 0.5) + pad);
      for (let c = c0; c <= c1; c += 1) { mask[r * cols + c] = 1; filled += 1; }
    }
  }
  return {mask, filled};
}

// Zhang-Suen thinning (8-connected skeleton).
function thin(mask, cols, rows) {
  const img = mask.slice();
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols ? 0 : img[r * cols + c]);
  let changed = true;
  const remove = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      remove.length = 0;
      for (let r = 1; r < rows - 1; r += 1) {
        for (let c = 1; c < cols - 1; c += 1) {
          if (!img[r * cols + c]) continue;
          const p = [at(r - 1, c), at(r - 1, c + 1), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c), at(r + 1, c - 1), at(r, c - 1), at(r - 1, c - 1)];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let i = 0; i < 8; i += 1) if (!p[i] && p[(i + 1) % 8]) a += 1;
          if (a !== 1) continue;
          if (step === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
          remove.push(r * cols + c);
        }
      }
      for (const index of remove) img[index] = 0;
      if (remove.length) changed = true;
    }
  }
  return img;
}

const NEIGHBOURS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// Dijkstra-like BFS on skeleton pixels (weights 1 / sqrt2); returns farthest node and predecessor map.
function farthest(skeleton, cols, rows, start) {
  const dist = new Float64Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  dist[start] = 0;
  const queue = [start];
  let best = start;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    const r = Math.floor(node / cols), c = node % cols;
    for (const [dr, dc] of NEIGHBOURS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const next = nr * cols + nc;
      if (!skeleton[next]) continue;
      const d = dist[node] + (dr && dc ? Math.SQRT2 : 1);
      if (d < dist[next]) { dist[next] = d; prev[next] = node; queue.push(next); }
    }
    if (dist[node] > dist[best]) best = node;
  }
  return {best, dist, prev};
}

function longestSkeletonPath(skeleton, cols, rows) {
  // Use the largest connected component.
  const seen = new Uint8Array(cols * rows);
  let bestComponent = null;
  for (let i = 0; i < skeleton.length; i += 1) {
    if (!skeleton[i] || seen[i]) continue;
    const component = [i];
    seen[i] = 1;
    for (let h = 0; h < component.length; h += 1) {
      const r = Math.floor(component[h] / cols), c = component[h] % cols;
      for (const [dr, dc] of NEIGHBOURS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const n = nr * cols + nc;
        if (skeleton[n] && !seen[n]) { seen[n] = 1; component.push(n); }
      }
    }
    if (!bestComponent || component.length > bestComponent.length) bestComponent = component;
  }
  if (!bestComponent) return [];
  const a = farthest(skeleton, cols, rows, bestComponent[0]).best;
  const {best: b, prev} = farthest(skeleton, cols, rows, a);
  const path = [];
  for (let node = b; node !== -1; node = prev[node]) path.push(node);
  return path.reverse();
}

// Extends an end of the path along its direction until it leaves the polygon mask.
function extendToOutline(points, mask, cols, rows, atStart) {
  if (points.length < 3) return points;
  const look = Math.min(6, points.length - 1);
  const end = atStart ? points[0] : points[points.length - 1];
  const ref = atStart ? points[look] : points[points.length - 1 - look];
  let dx = end[0] - ref[0], dy = end[1] - ref[1];
  const len = Math.hypot(dx, dy);
  if (!len) return points;
  dx /= len; dy /= len;
  let x = end[0], y = end[1];
  let last = null;
  for (let step = 0; step < 400; step += 1) {
    x += dx * 0.5; y += dy * 0.5;
    const r = Math.round(y), c = Math.round(x);
    if (r < 0 || c < 0 || r >= rows || c >= cols || !mask[r * cols + c]) break;
    last = [x, y];
  }
  if (!last) return points;
  return atStart ? [last, ...points] : [...points, last];
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = points[s], [x2, y2] = points[e];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let maxD = 0, index = -1;
    for (let i = s + 1; i < e; i += 1) {
      const d = Math.abs((y2 - y1) * points[i][0] - (x2 - x1) * points[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > tolerance && index > 0) { keep[index] = 1; stack.push([s, index], [index, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

function chaikin(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i], [x2, y2] = points[i + 1];
    out.push([0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2], [0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** Centerline for one polygon given as rings [[lng,lat],...]. Returns [[lng,lat],...] or null. */
export function polygonCenterline(rings) {
  if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 4) return null;
  const projection = makeProjection(rings);
  const ringsXY = rings.map(ring => ring.map(projection.toXY));
  const maxDim = Math.max(projection.width, projection.height);
  if (!(maxDim > 0)) return null;
  // ~500 cells along the longest side, 0.5 m .. 5 m per cell; retry finer for narrow outlines.
  for (let cell = Math.min(5, Math.max(0.5, maxDim / 500)); cell >= 0.5; cell /= 2) {
    const pad = 2;
    const cols = Math.ceil(projection.width / cell) + pad * 2 + 1;
    const rows = Math.ceil(projection.height / cell) + pad * 2 + 1;
    if (cols * rows > 4_000_000) continue;
    const {mask, filled} = rasterise(ringsXY, cell, pad, cols, rows);
    if (filled < 12) { if (cell <= 0.5) return null; continue; }
    const skeleton = thin(mask, cols, rows);
    const path = longestSkeletonPath(skeleton, cols, rows);
    if (path.length < 2) { if (cell <= 0.5) return null; continue; }
    let grid = path.map(node => [node % cols, Math.floor(node / cols)]);
    grid = extendToOutline(extendToOutline(grid, mask, cols, rows, true), mask, cols, rows, false);
    let metres = grid.map(([c, r]) => [(c - pad + 0.5) * cell, (r - pad + 0.5) * cell]);
    metres = chaikin(simplify(metres, cell * 1.2));
    if (metres.length < 2 || pathLength(metres) < Math.max(15, cell * 4)) return null;
    return metres.map(point => projection.toLngLat(point).map(value => Math.round(value * 1e7) / 1e7));
  }
  return null;
}

function pointInRings([x, y], rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function outlinePolygons(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  if (geometry.type === 'LineString' && isClosedLine(geometry.coordinates)) return [[geometry.coordinates]];
  return null;
}

function lineParts(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

/**
 * Replaces run outlines by centerlines in a FeatureCollection (in place on a copy) and recomputes counts.
 * Returns {collection, stats}.
 */
export function normalizeRunGeometries(collection) {
  const stats = {outlineRuns: 0, generated: 0, failed: 0, duplicateSkipped: 0, closedLinesConverted: 0, existingCenterlines: 0, failedIds: []};
  const features = collection.features || [];
  const runLines = features.filter(f => f.properties?.powderlineType === 'run' && !outlinePolygons(f.geometry) && lineParts(f.geometry).length);
  stats.existingCenterlines = runLines.length;
  const output = [];
  for (const feature of features) {
    const polygons = feature.properties?.powderlineType === 'run' ? outlinePolygons(feature.geometry) : null;
    if (!polygons) { output.push(feature); continue; }
    stats.outlineRuns += 1;
    // Duplicate: an existing run line that is this run's centerline, i.e. >= 60% of its vertices lie inside the
    // outline, or it has the same name and ski area and touches the outline.
    const name = String(feature.properties?.name || '').trim();
    const areas = JSON.stringify((feature.properties?.skiAreas || []).map(area => area?.properties?.id).sort());
    const duplicate = runLines.some(line => {
      const vertices = lineParts(line.geometry).flat();
      if (vertices.length < 2) return false;
      const inside = vertices.filter(point => polygons.some(rings => pointInRings(point, rings))).length;
      if (inside / vertices.length >= 0.6) return true;
      const sameRun = name && String(line.properties?.name || '').trim() === name &&
        JSON.stringify((line.properties?.skiAreas || []).map(area => area?.properties?.id).sort()) === areas;
      return Boolean(sameRun && inside > 0);
    });
    if (duplicate) { stats.duplicateSkipped += 1; continue; }
    const centerlines = polygons.map(rings => polygonCenterline(rings)).filter(Boolean);
    if (!centerlines.length) {
      stats.failed += 1;
      stats.failedIds.push(feature.properties?.id || feature.properties?.name || '(unknown)');
      continue;
    }
    if (feature.geometry.type === 'LineString') stats.closedLinesConverted += 1;
    stats.generated += 1;
    output.push({
      ...feature,
      geometry: centerlines.length === 1
        ? {type: 'LineString', coordinates: centerlines[0]}
        : {type: 'MultiLineString', coordinates: centerlines},
      properties: {...feature.properties, powderlineGeometry: 'centerline', powderlineCenterlineFrom: feature.geometry.type}
    });
  }
  const counts = output.reduce((result, f) => {
    const key = `${f.properties?.powderlineType}s`;
    if (key in result) result[key] += 1;
    return result;
  }, {lifts: 0, runs: 0, stations: 0});
  const metadata = {...(collection.metadata || {}), counts, centerline: {...stats, failedIds: stats.failedIds.slice(0, 50)}};
  if (metadata.status) metadata.status = output.length ? 'available' : 'unavailable';
  return {collection: {...collection, metadata, features: output}, stats};
}
