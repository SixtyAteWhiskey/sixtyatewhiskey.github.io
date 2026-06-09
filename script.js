/*
  Bahtinov Mask STL Generator
  Pure browser JavaScript. No build step. Safe for GitHub Pages.

  Geometry model:
  - Outer annular rim.
  - Solid slats clipped into three Bahtinov zones.
  - Optional central solid hub.
  - Every shape is extruded into an ASCII STL.
*/

const $ = (id) => document.getElementById(id);

const fields = {
  diameter: $('diameter'),
  thickness: $('thickness'),
  rimWidth: $('rimWidth'),
  pitch: $('pitch'),
  barWidth: $('barWidth'),
  angle: $('angle'),
  centerFraction: $('centerFraction'),
  hubDiameter: $('hubDiameter'),
  segments: $('segments'),
};

const preview = $('preview');
const partCount = $('partCount');
const statusEl = $('status');

function num(field) {
  return Number(field.value);
}

function settings() {
  const d = num(fields.diameter);
  return {
    diameter: d,
    radius: d / 2,
    thickness: num(fields.thickness),
    rimWidth: num(fields.rimWidth),
    pitch: num(fields.pitch),
    barWidth: num(fields.barWidth),
    angleDeg: num(fields.angle),
    centerFraction: num(fields.centerFraction),
    hubDiameter: num(fields.hubDiameter),
    segments: Math.round(num(fields.segments) / 2) * 2,
    overlap: 0.25,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function applyRecommended() {
  const d = clamp(num(fields.diameter) || 100, 20, 2000);
  const pitch = clamp(d * 0.055, 3.0, 12.0);
  fields.thickness.value = d < 80 ? 1.6 : 2.0;
  fields.rimWidth.value = clamp(d * 0.055, 3.0, 14.0).toFixed(1);
  fields.pitch.value = pitch.toFixed(1);
  fields.barWidth.value = clamp(pitch * 0.42, 1.2, 5.0).toFixed(1);
  fields.angle.value = 20;
  fields.centerFraction.value = 0.34;
  fields.segments.value = d > 250 ? 256 : 192;
  update();
}

function validate(s) {
  if (!Number.isFinite(s.diameter) || s.diameter <= 0) return 'Diameter must be greater than 0.';
  if (s.rimWidth <= 0 || s.rimWidth >= s.radius * 0.45) return 'Rim width should be positive and less than about 45% of the radius.';
  if (s.thickness <= 0) return 'Thickness must be greater than 0.';
  if (s.pitch <= 0) return 'Pitch must be greater than 0.';
  if (s.barWidth <= 0 || s.barWidth >= s.pitch) return 'Slat width must be greater than 0 and smaller than pitch.';
  if (s.hubDiameter < 0 || s.hubDiameter >= s.diameter - 2 * s.rimWidth) return 'Central solid disk must be smaller than the clear inner opening.';
  return '';
}

function circlePolygon(radius, segments) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return pts;
}

function clipHalfPlane(poly, nx, ny, c, keepLessEqual = true) {
  if (poly.length === 0) return [];
  const out = [];
  const inside = (p) => keepLessEqual ? (p.x * nx + p.y * ny <= c + 1e-9) : (p.x * nx + p.y * ny >= c - 1e-9);
  const intersect = (a, b) => {
    const da = a.x * nx + a.y * ny - c;
    const db = b.x * nx + b.y * ny - c;
    const t = da / (da - db);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  for (let i = 0; i < poly.length; i++) {
    const current = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const currentInside = inside(current);
    const prevInside = inside(prev);

    if (currentInside) {
      if (!prevInside) out.push(intersect(prev, current));
      out.push(current);
    } else if (prevInside) {
      out.push(intersect(prev, current));
    }
  }
  return dedupePolygon(out);
}

function dedupePolygon(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) out.pop();
  }
  return out;
}

function polygonArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function makeSlats(s) {
  const innerR = s.radius - s.rimWidth + s.overlap;
  const base = circlePolygon(innerR, s.segments);
  const centerHalfWidth = s.radius * s.centerFraction / 2;
  const hubR = Math.max(0, s.hubDiameter / 2 - s.overlap);
  const zones = [
    { name: 'left', minX: -innerR, maxX: -centerHalfWidth, angle: s.angleDeg },
    { name: 'center', minX: -centerHalfWidth, maxX: centerHalfWidth, angle: 90 },
    { name: 'right', minX: centerHalfWidth, maxX: innerR, angle: -s.angleDeg },
  ];

  const slats = [];
  for (const zone of zones) {
    const theta = zone.angle * Math.PI / 180;
    // u is the long direction of the slat. n is perpendicular and sets pitch spacing.
    const nx = -Math.sin(theta);
    const ny = Math.cos(theta);
    const maxOffset = innerR * 1.5;
    const start = Math.floor(-maxOffset / s.pitch) - 1;
    const end = Math.ceil(maxOffset / s.pitch) + 1;

    for (let k = start; k <= end; k++) {
      const c = k * s.pitch;
      let poly = base.slice();
      poly = clipHalfPlane(poly, 1, 0, zone.maxX, true);
      poly = clipHalfPlane(poly, 1, 0, zone.minX, false);
      poly = clipHalfPlane(poly, nx, ny, c + s.barWidth / 2, true);
      poly = clipHalfPlane(poly, nx, ny, c - s.barWidth / 2, false);

      if (hubR > 0) {
        // Keep slats out of the optional hub area when possible to reduce duplicate geometry.
        // This is an approximation using four tangent-ish cuts, not a true circular boolean.
        // The hub itself is added as a solid disk.
        const centroid = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        if (poly.length) {
          centroid.x /= poly.length; centroid.y /= poly.length;
          if (Math.hypot(centroid.x, centroid.y) < hubR * 0.8) poly = [];
        }
      }

      if (poly.length >= 3 && Math.abs(polygonArea(poly)) > 0.5) {
        if (polygonArea(poly) < 0) poly.reverse();
        slats.push({ kind: 'polygon', points: poly, name: `${zone.name}-slat-${k}` });
      }
    }
  }
  return slats;
}

function makeGeometry(s) {
  const err = validate(s);
  if (err) throw new Error(err);

  const innerR = s.radius - s.rimWidth;
  const shapes = [];
  shapes.push({ kind: 'annulus', outerR: s.radius, innerR, segments: s.segments, name: 'outer-rim' });
  shapes.push(...makeSlats(s));
  if (s.hubDiameter > 0) shapes.push({ kind: 'disk', radius: s.hubDiameter / 2, segments: s.segments, name: 'central-hub' });
  return shapes;
}

function normal(a, b, c) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

function facet(a, b, c) {
  const n = normal(a, b, c);
  const f = (v) => Number.isFinite(v) ? v.toFixed(5) : '0.00000';
  return `  facet normal ${f(n.x)} ${f(n.y)} ${f(n.z)}\n    outer loop\n      vertex ${f(a.x)} ${f(a.y)} ${f(a.z)}\n      vertex ${f(b.x)} ${f(b.y)} ${f(b.z)}\n      vertex ${f(c.x)} ${f(c.y)} ${f(c.z)}\n    endloop\n  endfacet\n`;
}

function extrudePolygon(poly, thickness) {
  const tris = [];
  const z0 = 0, z1 = thickness;
  // bottom face
  for (let i = 1; i < poly.length - 1; i++) {
    tris.push([{ ...poly[0], z: z0 }, { ...poly[i + 1], z: z0 }, { ...poly[i], z: z0 }]);
  }
  // top face
  for (let i = 1; i < poly.length - 1; i++) {
    tris.push([{ ...poly[0], z: z1 }, { ...poly[i], z: z1 }, { ...poly[i + 1], z: z1 }]);
  }
  // side walls
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    tris.push([{ ...a, z: z0 }, { ...b, z: z0 }, { ...b, z: z1 }]);
    tris.push([{ ...a, z: z0 }, { ...b, z: z1 }, { ...a, z: z1 }]);
  }
  return tris;
}

function annulusTriangles(outerR, innerR, segments, thickness) {
  const tris = [];
  const z0 = 0, z1 = thickness;
  for (let i = 0; i < segments; i++) {
    const a0 = i / segments * Math.PI * 2;
    const a1 = (i + 1) / segments * Math.PI * 2;
    const po0 = { x: Math.cos(a0) * outerR, y: Math.sin(a0) * outerR };
    const po1 = { x: Math.cos(a1) * outerR, y: Math.sin(a1) * outerR };
    const pi0 = { x: Math.cos(a0) * innerR, y: Math.sin(a0) * innerR };
    const pi1 = { x: Math.cos(a1) * innerR, y: Math.sin(a1) * innerR };

    // top annular face
    tris.push([{ ...po0, z: z1 }, { ...po1, z: z1 }, { ...pi1, z: z1 }]);
    tris.push([{ ...po0, z: z1 }, { ...pi1, z: z1 }, { ...pi0, z: z1 }]);
    // bottom annular face
    tris.push([{ ...po0, z: z0 }, { ...pi1, z: z0 }, { ...po1, z: z0 }]);
    tris.push([{ ...po0, z: z0 }, { ...pi0, z: z0 }, { ...pi1, z: z0 }]);
    // outer wall
    tris.push([{ ...po0, z: z0 }, { ...po1, z: z0 }, { ...po1, z: z1 }]);
    tris.push([{ ...po0, z: z0 }, { ...po1, z: z1 }, { ...po0, z: z1 }]);
    // inner wall
    tris.push([{ ...pi0, z: z0 }, { ...pi1, z: z1 }, { ...pi1, z: z0 }]);
    tris.push([{ ...pi0, z: z0 }, { ...pi0, z: z1 }, { ...pi1, z: z1 }]);
  }
  return tris;
}

function shapeTriangles(shape, thickness) {
  if (shape.kind === 'polygon') return extrudePolygon(shape.points, thickness);
  if (shape.kind === 'disk') return extrudePolygon(circlePolygon(shape.radius, shape.segments), thickness);
  if (shape.kind === 'annulus') return annulusTriangles(shape.outerR, shape.innerR, shape.segments, thickness);
  return [];
}

function generateSTL(s) {
  const shapes = makeGeometry(s);
  let stl = 'solid bahtinov_mask\n';
  for (const shape of shapes) {
    const tris = shapeTriangles(shape, s.thickness);
    for (const tri of tris) stl += facet(tri[0], tri[1], tri[2]);
  }
  stl += 'endsolid bahtinov_mask\n';
  return { stl, shapes };
}

function ringPath(outerR, innerR) {
  // SVG even-odd compound path. Approximate via arcs.
  return [
    `M ${outerR} 0`,
    `A ${outerR} ${outerR} 0 1 1 ${-outerR} 0`,
    `A ${outerR} ${outerR} 0 1 1 ${outerR} 0`,
    `M ${innerR} 0`,
    `A ${innerR} ${innerR} 0 1 0 ${-innerR} 0`,
    `A ${innerR} ${innerR} 0 1 0 ${innerR} 0`,
    'Z',
  ].join(' ');
}

function polygonPoints(poly) {
  return poly.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
}

function renderPreview(s) {
  const shapes = makeGeometry(s);
  const pad = s.radius * 0.08;
  preview.setAttribute('viewBox', `${-s.radius - pad} ${-s.radius - pad} ${(s.radius + pad) * 2} ${(s.radius + pad) * 2}`);
  preview.innerHTML = '';

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('cx', '0'); bg.setAttribute('cy', '0'); bg.setAttribute('r', s.radius.toString());
  bg.setAttribute('fill', 'rgba(255,255,255,0.035)');
  preview.appendChild(bg);

  for (const shape of shapes) {
    if (shape.kind === 'annulus') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', ringPath(shape.outerR, shape.innerR));
      path.setAttribute('class', 'mask-ring');
      preview.appendChild(path);
    } else if (shape.kind === 'disk') {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '0'); circle.setAttribute('cy', '0'); circle.setAttribute('r', shape.radius.toString());
      circle.setAttribute('class', 'mask-hub');
      preview.appendChild(circle);
    } else if (shape.kind === 'polygon') {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', polygonPoints(shape.points));
      poly.setAttribute('class', 'mask-shape');
      preview.appendChild(poly);
    }
  }

  partCount.textContent = `${shapes.length} parts`;
}

function blobDownload(text, filename, type = 'application/sla') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeSvgText() {
  const serializer = new XMLSerializer();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(preview)}`;
}

function update() {
  try {
    const s = settings();
    renderPreview(s);
    statusEl.className = 'ok';
    statusEl.textContent = `Ready: ${s.diameter.toFixed(1)} mm diameter, ${s.thickness.toFixed(1)} mm thick.`;
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
}

for (const input of Object.values(fields)) input.addEventListener('input', update);
$('recommended').addEventListener('click', applyRecommended);
$('downloadStl').addEventListener('click', () => {
  try {
    const s = settings();
    const { stl, shapes } = generateSTL(s);
    const safeD = String(s.diameter).replace(/[^0-9.]/g, '_');
    blobDownload(stl, `bahtinov-mask-${safeD}mm.stl`);
    statusEl.className = 'ok';
    statusEl.textContent = `Downloaded STL with ${shapes.length} solid parts.`;
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
});
$('downloadSvg').addEventListener('click', () => {
  try {
    update();
    const s = settings();
    const safeD = String(s.diameter).replace(/[^0-9.]/g, '_');
    blobDownload(makeSvgText(), `bahtinov-mask-${safeD}mm.svg`, 'image/svg+xml');
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
});

update();
