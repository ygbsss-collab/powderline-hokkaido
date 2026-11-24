/* Contour lines from a stored Terrarium DEM mosaic (pwa-offline-store.js). Runs in a Web Worker so the map UI never
 * blocks. Input: { elev: Float32Array (W*H metres, NaN = no data), W, H, z, x0, y0, interval, index }. Output: GeoJSON
 * FeatureCollection of LineStrings with { ele, index } (index = 1 on every `index` metres, e.g. 100 m). */
'use strict';

function smooth(src, W, H) { // 3x3 box blur (NaN aware): Terrarium steps would otherwise give jagged lines
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const v = src[yy * W + xx]; if (v === v) { sum += v; n++; }
        }
      }
      out[y * W + x] = n ? sum / n : NaN;
    }
  }
  return out;
}

// Douglas–Peucker on pixel coordinates (flat [x0,y0,x1,y1,...]).
function simplify(pts, tol) {
  const n = pts.length / 2;
  if (n <= 2) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]], tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bestD = tol2;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] - ax, py = pts[i * 2 + 1] - ay;
      let d;
      if (len2 === 0) d = px * px + py * py;
      else { const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2)); const ex = px - t * dx, ey = py - t * dy; d = ex * ex + ey * ey; }
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

function contours({ elev, W, H, z, x0, y0, interval, index }) {
  const e = smooth(elev, W, H);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < e.length; i++) { const v = e[i]; if (v === v) { if (v < min) min = v; if (v > max) max = v; } }
  if (!(max > min)) return { type: 'FeatureCollection', features: [] };
  const first = Math.ceil(min / interval) * interval;
  const levels = new Map(); // ele -> { pts: Map(edgeId -> [x,y]), adj: Map(edgeId -> [edgeId...]) }
  const levelOf = ele => {
    let l = levels.get(ele);
    if (!l) { l = { pts: new Map(), adj: new Map() }; levels.set(ele, l); }
    return l;
  };
  // Edge ids: horizontal edge (i,j)-(i+1,j) = 2k, vertical edge (i,j)-(i,j+1) = 2k+1 with k = j*W+i.
  const hEdge = (i, j) => (j * W + i) * 2, vEdge = (i, j) => (j * W + i) * 2 + 1;
  function point(l, id, L, i0, j0, v0, i1, j1, v1) {
    if (!l.pts.has(id)) { const t = (L - v0) / (v1 - v0); l.pts.set(id, [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t]); }
  }
  function link(l, a, b) {
    let la = l.adj.get(a); if (!la) l.adj.set(a, la = []); la.push(b);
    let lb = l.adj.get(b); if (!lb) l.adj.set(b, lb = []); lb.push(a);
  }
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = e[j * W + i], b = e[j * W + i + 1], c = e[(j + 1) * W + i + 1], d = e[(j + 1) * W + i];
      if (a !== a || b !== b || c !== c || d !== d) continue;
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      for (let L = Math.max(first, Math.ceil(lo / interval) * interval); L <= hi; L += interval) {
        if (L === lo && L === hi) continue;
        const code = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const l = levelOf(L);
        const T = hEdge(i, j), R = vEdge(i + 1, j), B = hEdge(i, j + 1), Lf = vEdge(i, j);
        const pT = () => point(l, T, L, i, j, a, i + 1, j, b), pR = () => point(l, R, L, i + 1, j, b, i + 1, j + 1, c);
        const pB = () => point(l, B, L, i, j + 1, d, i + 1, j + 1, c), pL = () => point(l, Lf, L, i, j, a, i, j + 1, d);
        const seg = (p, q, ip, iq) => { p(); q(); link(l, ip, iq); };
        switch (code) {
          case 1: case 14: seg(pL, pB, Lf, B); break;
          case 2: case 13: seg(pB, pR, B, R); break;
          case 3: case 12: seg(pL, pR, Lf, R); break;
          case 4: case 11: seg(pT, pR, T, R); break;
          case 6: case 9: seg(pT, pB, T, B); break;
          case 7: case 8: seg(pL, pT, Lf, T); break;
          case 5: { const m = (a + b + c + d) / 4; // b, d high
            if (m >= L) { seg(pL, pT, Lf, T); seg(pB, pR, B, R); } else { seg(pT, pR, T, R); seg(pL, pB, Lf, B); } break; }
          case 10: { const m = (a + b + c + d) / 4; // a, c high
            if (m >= L) { seg(pT, pR, T, R); seg(pL, pB, Lf, B); } else { seg(pL, pT, Lf, T); seg(pB, pR, B, R); } break; }
        }
      }
    }
  }
  const world = 256 * 2 ** z;
  const toLngLat = (px, py) => {
    const gx = x0 * 256 + px + 0.5, gy = y0 * 256 + py + 0.5;
    const lng = gx / world * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / world))) * 180 / Math.PI;
    return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
  };
  const features = [];
  for (const [ele, l] of levels) {
    const seen = new Set();
    const walk = start => {
      const chain = [start]; seen.add(start);
      let prev = -1, cur = start;
      for (;;) {
        const next = (l.adj.get(cur) || []).find(n => n !== prev && !seen.has(n));
        if (next === undefined) break;
        chain.push(next); seen.add(next); prev = cur; cur = next;
      }
      return chain;
    };
    const emit = chain => {
      if (chain.length < 3) return; // drop specks
      const flat = [];
      for (const id of chain) { const p = l.pts.get(id); flat.push(p[0], p[1]); }
      const first = l.adj.get(chain[0]) || [];
      if (chain.length > 3 && first.includes(chain[chain.length - 1])) { const p = l.pts.get(chain[0]); flat.push(p[0], p[1]); } // ring
      const s = simplify(flat, 0.6);
      if (s.length < 4) return;
      const coords = [];
      for (let k = 0; k < s.length; k += 2) coords.push(toLngLat(s[k], s[k + 1]));
      features.push({ type: 'Feature', properties: { ele, index: ele % index === 0 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } });
    };
    for (const [id, nb] of l.adj) if (nb.length === 1 && !seen.has(id)) emit(walk(id)); // open lines first
    for (const id of l.adj.keys()) if (!seen.has(id)) emit(walk(id));                   // then closed rings
  }
  return { type: 'FeatureCollection', features };
}

self.onmessage = event => {
  try {
    const geojson = contours(event.data);
    self.postMessage({ ok: true, json: JSON.stringify(geojson), count: geojson.features.length });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message || error) });
  }
};
