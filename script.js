/*
  Bahtinov Mask STL Generator
  Pure browser JavaScript. No build step. Safe for GitHub Pages.

  Auto-scale mode:
  - User enters the aperture / clear-opening diameter.
  - All printable dimensions are calculated as percentages of that diameter.
  - The STL outside diameter is aperture diameter + 2 * rim width.

  Geometry model:
  - Outer annular rim.
  - Classic 3-zone Bahtinov layout:
      * left zone = straight slats
      * upper-right zone = diagonal slats
      * lower-right zone = opposite diagonal slats
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

const autoScale = $('autoScale');
const calculated = $('calculated');
const preview = $('preview');
const partCount = $('partCount');
const statusEl = $('status');
const scalableFieldKeys = ['thickness', 'rimWidth', 'pitch', 'barWidth', 'angle', 'centerFraction', 'hubDiameter', 'segments'];

function num(field) {
  return Number(field.value);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function roundTo(value, decimals = 1) {
  return Number(value).toFixed(decimals);
}

function autoDimensions(apertureDiameter) {
  const d = clamp(Number(apertureDiameter) || 100, 20, 2000);
  const pitch = clamp(d * 0.055, 3.0, 14.0);
  const barWidth = clamp(pitch * 0.42, 1.2, 5.8);

  return {
    thickness: clamp(d * 0.018, 1.6, 3.6),
    rimWidth: clamp(d * 0.060, 4.0, 20.0),
    pitch,
    barWidth,
    angle: 20,
    centerFraction: 0.00,
    hubDiameter: 0,
    segments: d > 400 ? 384 : d > 225 ? 320 : d > 125 ? 256 : 192,
  };
}

function writeAutoDimensions() {
  const auto = autoDimensions(num(fields.diameter));
  fields.thickness.value = roundTo(auto.thickness, 1);
  fields.rimWidth.value = roundTo(auto.rimWidth, 1);
  fields.pitch.value = roundTo(auto.pitch, 1);
  fields.barWidth.value = roundTo(auto.barWidth, 1);
  fields.angle.value = auto.angle;
  fields.centerFraction.value = auto.centerFraction.toFixed(2);
  fields.hubDiameter.value = roundTo(auto.hubDiameter, 1);
  fields.segments.value = auto.segments;
}

function setAutoScaleUi() {
  const locked = autoScale.checked;
  for (const key of scalableFieldKeys) fields[key].disabled = locked;
}

function resetAutoScale() {
  autoScale.checked = true;
  writeAutoDimensions();
  setAutoScaleUi();
  update();
}

function settings() {
  if (autoScale.checked) writeAutoDimensions();

  const apertureDiameter = num(fields.diameter);
  const rimWidth = num(fields.rimWidth);
  const apertureRadius = apertureDiameter / 2;
  const outerRadius = apertureRadius + rimWidth;
  const splitPointFraction = num(fields.centerFraction);

  return {
    apertureDiameter,
    apertureRadius,
    outerRadius,
    outerDiameter: outerRadius * 2,
    thickness: num(fields.thickness),
    rimWidth,
    pitch: num(fields.pitch),
    barWidth: num(fields.barWidth),
    angleDeg: num(fields.angle),
    splitPointFraction,
    splitPointX: apertureRadius * splitPointFraction,
    hubDiameter: num(fields.hubDiameter),
    segments: Math.round(num(fields.segments) / 2) * 2,
    overlap: clamp(apertureDiameter * 0.003, 0.25, 1.0),
  };
}

function validate(s) {
  if (!Number.isFinite(s.apertureDiameter) || s.apertureDiameter <= 0) return 'Aperture diameter must be greater than 0.';
  if (s.rimWidth <= 0 || s.rimWidth >= s.apertureDiameter * 0.35) return 'Rim width should be positive and less than about 35% of the aperture diameter.';
  if (s.thickness <= 0) return 'Thickness must be greater than 0.';
  if (s.pitch <= 0) return 'Pitch must be greater than 0.';
  if (s.barWidth <= 0 || s.barWidth >= s.pitch) return 'Slat width must be greater than 0 and smaller than pitch.';
  if (s.splitPointFraction < 0 || s.splitPointFraction > 0.45) return 'Split point position should be between 0.00 and 0.45 aperture radii.';
  if (s.hubDiameter < 0 || s.hubDiameter >= s.apertureDiameter) return 'Central solid disk must be smaller than the clear aperture.';
  if (s.segments < 32) return 'Circle smoothness is too low.';
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

function clipToBox(poly, minX, maxX, minY, maxY) {
  let out = poly.slice();
  out = clipHalfPlane(out, 1, 0, maxX, true);   // x <= maxX
  out = clipHalfPlane(out, 1, 0, minX, false);  // x >= minX
  out = clipHalfPlane(out, 0, 1, maxY, true);   // y <= maxY
  out = clipHalfPlane(out, 0, 1, minY, false);  // y >= minY
  return out;
}

function maybeAddPolygon(list, poly, name) {
  if (poly.length >= 3 && Math.abs(polygonArea(poly)) > 0.5) {
    if (polygonArea(poly) < 0) poly.reverse();
    list.push({ kind: 'polygon', points: poly, name });
  }
}

function makeSlatsForZone(zonePoly, zoneName, angleDeg, s, list) {
  const theta = angleDeg * Math.PI / 180;
  // u is the long direction of the slat. n is perpendicular and sets pitch spacing.
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  const maxOffset = s.apertureRadius * 1.75;
  const start = Math.floor(-maxOffset / s.pitch) - 1;
  const end = Math.ceil(maxOffset / s.pitch) + 1;

  for (let k = start; k <= end; k++) {
    const c = k * s.pitch;
    let poly = zonePoly.slice();
    poly = clipHalfPlane(poly, nx, ny, c + s.barWidth / 2, true);
    poly = clipHalfPlane(poly, nx, ny, c - s.barWidth / 2, false);
    maybeAddPolygon(list, poly, `${zoneName}-slat-${k}`);
  }
}

function makeSlats(s) {
  const clearRWithOverlap = s.apertureRadius + s.overlap;
  const base = circlePolygon(clearRWithOverlap, s.segments);
  const hubR = Math.max(0, s.hubDiameter / 2 - s.overlap);
  const splitX = s.splitPointX;
  const spineWidth = Math.max(s.barWidth * 1.15, 1.0);
  const spineHalf = spineWidth / 2;
  const r = clearRWithOverlap;
  const shapes = [];

  // Center divider. This is the vertical solid rib visible in the reference design.
  maybeAddPolygon(
    shapes,
    clipToBox(base, splitX - spineHalf, splitX + spineHalf, -r, r),
    'vertical-divider'
  );

  // Classic Bahtinov zones:
  // left half = straight horizontal bars
  // upper-right = diagonal bars one way
  // lower-right = diagonal bars the opposite way
  const leftZone = clipToBox(base, -r, splitX + spineHalf + s.overlap, -r, r);
  const upperRightZone = clipToBox(base, splitX - spineHalf - s.overlap, r, 0, r);
  const lowerRightZone = clipToBox(base, splitX - spineHalf - s.overlap, r, -r, 0);

  makeSlatsForZone(leftZone, 'left-horizontal', 0, s, shapes);
  makeSlatsForZone(upperRightZone, 'upper-right-diagonal', s.angleDeg, s, shapes);
  makeSlatsForZone(lowerRightZone, 'lower-right-diagonal', -s.angleDeg, s, shapes);

  if (hubR > 0) {
    // Remove slats whose centroid falls mostly inside the optional hub area.
    return shapes.filter((shape) => {
      if (shape.kind !== 'polygon' || !shape.points.length) return true;
      const centroid = shape.points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      centroid.x /= shape.points.length;
      centroid.y /= shape.points.length;
      return Math.hypot(centroid.x, centroid.y) >= hubR * 0.8;
    });
  }

  return shapes;
}

function makeGeometry(s) {
  const err = validate(s);
  if (err) throw new Error(err);

  const shapes = [];
  shapes.push({ kind: 'annulus', outerR: s.outerRadius, innerR: s.apertureRadius, segments: s.segments, name: 'outer-rim' });
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
  const pad = s.outerRadius * 0.08;
  preview.setAttribute('viewBox', `${-s.outerRadius - pad} ${-s.outerRadius - pad} ${(s.outerRadius + pad) * 2} ${(s.outerRadius + pad) * 2}`);
  preview.innerHTML = '';

  const aperture = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  aperture.setAttribute('cx', '0'); aperture.setAttribute('cy', '0'); aperture.setAttribute('r', s.apertureRadius.toString());
  aperture.setAttribute('fill', 'rgba(255,255,255,0.035)');
  preview.appendChild(aperture);

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

function renderCalculatedSummary(s) {
  calculated.innerHTML = `
    <div><strong>Printed outside diameter</strong><span>${s.outerDiameter.toFixed(1)} mm</span></div>
    <div><strong>Thickness</strong><span>${s.thickness.toFixed(1)} mm</span></div>
    <div><strong>Rim</strong><span>${s.rimWidth.toFixed(1)} mm</span></div>
    <div><strong>Slats</strong><span>${s.barWidth.toFixed(1)} mm wide / ${s.pitch.toFixed(1)} mm pitch</span></div>
  `;
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
    setAutoScaleUi();
    const s = settings();
    renderCalculatedSummary(s);
    renderPreview(s);
    statusEl.className = 'ok';
    statusEl.textContent = `Ready: ${s.apertureDiameter.toFixed(1)} mm aperture, ${s.outerDiameter.toFixed(1)} mm printed outside diameter, ${s.thickness.toFixed(1)} mm thick.`;
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
}

for (const input of Object.values(fields)) input.addEventListener('input', update);
autoScale.addEventListener('change', update);
$('recommended').addEventListener('click', resetAutoScale);
$('downloadStl').addEventListener('click', () => {
  try {
    const s = settings();
    const { stl, shapes } = generateSTL(s);
    const safeD = String(s.apertureDiameter).replace(/[^0-9.]/g, '_');
    blobDownload(stl, `bahtinov-mask-${safeD}mm-aperture.stl`);
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
    const safeD = String(s.apertureDiameter).replace(/[^0-9.]/g, '_');
    blobDownload(makeSvgText(), `bahtinov-mask-${safeD}mm-aperture.svg`, 'image/svg+xml');
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
});

resetAutoScale();
