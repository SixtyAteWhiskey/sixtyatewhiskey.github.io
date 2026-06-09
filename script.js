/*
  Bahtinov Mask STL Generator · Classic Layout v5
  Pure browser JavaScript. No build step. Safe for GitHub Pages.

  v5 changes:
  - Generates the classic Bahtinov visual pattern:
      * left half = straight horizontal slats
      * upper-right = diagonal slats
      * lower-right = opposite diagonal slats
      * center = one straight divider rib
  - STL export uses a single heightfield mesh instead of overlapping solids.
    This avoids the ugly slicer clipping/z-fighting caused by stacked internal faces.
  - Optional mounting lip/skirt around the rim so the mask can sit over a lens/dew shield.
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
  lipHeight: $('lipHeight'),
  lipWallThickness: $('lipWallThickness'),
  lipClearance: $('lipClearance'),
};

const autoScale = $('autoScale');
const lipEnabled = $('lipEnabled');
const calculated = $('calculated');
const preview = $('preview');
const partCount = $('partCount');
const statusEl = $('status');
const scalableFieldKeys = ['thickness', 'rimWidth', 'pitch', 'barWidth', 'angle', 'centerFraction', 'hubDiameter', 'segments', 'lipHeight', 'lipWallThickness', 'lipClearance'];

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
    lipHeight: clamp(d * 0.080, 3.0, 14.0),
    lipWallThickness: clamp(d * 0.030, 1.2, 4.0),
    lipClearance: clamp(d * 0.006, 0.4, 1.2),
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
  fields.lipHeight.value = roundTo(auto.lipHeight, 1);
  fields.lipWallThickness.value = roundTo(auto.lipWallThickness, 1);
  fields.lipClearance.value = roundTo(auto.lipClearance, 1);
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

  const lipIsEnabled = lipEnabled.checked;
  const lipHeight = num(fields.lipHeight);
  const lipWallThickness = num(fields.lipWallThickness);
  const lipClearance = num(fields.lipClearance);
  const lipInnerRadius = apertureRadius + lipClearance / 2;
  const lipOuterRadius = lipInnerRadius + lipWallThickness;

  return {
    apertureDiameter,
    apertureRadius,
    outerRadius,
    outerDiameter: outerRadius * 2,
    thickness: num(fields.thickness),
    totalHeight: num(fields.thickness) + (lipIsEnabled ? lipHeight : 0),
    rimWidth,
    pitch: num(fields.pitch),
    barWidth: num(fields.barWidth),
    angleDeg: num(fields.angle),
    splitPointFraction,
    splitPointX: apertureRadius * splitPointFraction,
    hubDiameter: num(fields.hubDiameter),
    lipEnabled: lipIsEnabled,
    lipHeight,
    lipWallThickness,
    lipClearance,
    lipInnerRadius,
    lipOuterRadius,
    lipInnerDiameter: lipInnerRadius * 2,
    lipOuterDiameter: lipOuterRadius * 2,
    segments: Math.round(num(fields.segments) / 2) * 2,
    overlap: clamp(apertureDiameter * 0.002, 0.15, 0.75),
  };
}

function validate(s) {
  if (!Number.isFinite(s.apertureDiameter) || s.apertureDiameter <= 0) return 'Aperture diameter must be greater than 0.';
  if (s.rimWidth <= 0 || s.rimWidth >= s.apertureDiameter * 0.35) return 'Rim width should be positive and less than about 35% of the aperture diameter.';
  if (s.thickness <= 0) return 'Thickness must be greater than 0.';
  if (s.pitch <= 0) return 'Pitch must be greater than 0.';
  if (s.barWidth <= 0 || s.barWidth >= s.pitch) return 'Slat width must be greater than 0 and smaller than pitch.';
  if (s.splitPointFraction < -0.35 || s.splitPointFraction > 0.35) return 'Vertical split position should be between -0.35 and 0.35 aperture radii.';
  if (s.hubDiameter < 0 || s.hubDiameter >= s.apertureDiameter) return 'Central solid disk must be smaller than the clear aperture.';
  if (s.lipEnabled) {
    if (s.lipHeight <= 0) return 'Lip height must be greater than 0.';
    if (s.lipWallThickness <= 0) return 'Lip wall thickness must be greater than 0.';
    if (s.lipClearance < 0) return 'Lip clearance cannot be negative.';
    if (s.lipOuterRadius > s.outerRadius - 0.05) return 'Lip wall plus clearance is wider than the rim. Increase rim width or reduce lip wall thickness/clearance.';
  }
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

function maybeAddPolygon(list, poly, name) {
  if (poly.length >= 3 && Math.abs(polygonArea(poly)) > 0.5) {
    if (polygonArea(poly) < 0) poly.reverse();
    list.push({ kind: 'polygon', points: poly, name });
  }
}

function clipToRect(poly, minX, maxX, minY, maxY) {
  let out = poly.slice();
  out = clipHalfPlane(out, 1, 0, maxX, true);
  out = clipHalfPlane(out, 1, 0, minX, false);
  out = clipHalfPlane(out, 0, 1, maxY, true);
  out = clipHalfPlane(out, 0, 1, minY, false);
  return out;
}

function makeSlatsForZone(zonePoly, zoneName, angleDeg, s, list) {
  const theta = angleDeg * Math.PI / 180;
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  const maxOffset = s.apertureRadius * 1.8;
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

function makePreviewGeometry(s) {
  const err = validate(s);
  if (err) throw new Error(err);

  const shapes = [];
  const r = s.apertureRadius;
  const base = circlePolygon(r, s.segments);
  const splitX = s.splitPointX;
  const dividerWidth = Math.max(s.barWidth * 1.15, 1.0);
  const dividerHalf = dividerWidth / 2;

  shapes.push({ kind: 'annulus', outerR: s.outerRadius, innerR: s.apertureRadius, segments: s.segments, name: 'outer-rim' });
  if (s.lipEnabled) {
    shapes.push({ kind: 'lip-annulus', outerR: s.lipOuterRadius, innerR: s.lipInnerRadius, segments: s.segments, name: 'mounting-lip' });
  }

  maybeAddPolygon(
    shapes,
    clipToRect(base, splitX - dividerHalf, splitX + dividerHalf, -r, r),
    'center-divider'
  );

  const leftZone = clipToRect(base, -r, splitX - dividerHalf, -r, r);
  const upperRightZone = clipToRect(base, splitX + dividerHalf, r, 0, r);
  const lowerRightZone = clipToRect(base, splitX + dividerHalf, r, -r, 0);

  makeSlatsForZone(leftZone, 'left-horizontal', 0, s, shapes);
  makeSlatsForZone(upperRightZone, 'upper-right-diagonal', s.angleDeg, s, shapes);
  makeSlatsForZone(lowerRightZone, 'lower-right-diagonal', -s.angleDeg, s, shapes);

  if (s.hubDiameter > 0) shapes.push({ kind: 'disk', radius: s.hubDiameter / 2, segments: s.segments, name: 'central-hub' });
  return shapes;
}

function band(distance, pitch, width) {
  const wrapped = ((distance + pitch / 2) % pitch + pitch) % pitch - pitch / 2;
  return Math.abs(wrapped) <= width / 2;
}

function pointIsSolid(x, y, s) {
  const r = Math.hypot(x, y);
  if (r > s.outerRadius) return false;

  // Outer ring.
  if (r >= s.apertureRadius) return true;

  // Optional central obstruction/hub.
  if (s.hubDiameter > 0 && r <= s.hubDiameter / 2) return true;

  const splitX = s.splitPointX;
  const dividerWidth = Math.max(s.barWidth * 1.15, 1.0);
  const dividerHalf = dividerWidth / 2;

  // Center divider rib.
  if (Math.abs(x - splitX) <= dividerHalf) return true;

  // Classic mask zones.
  if (x < splitX - dividerHalf) {
    return band(y, s.pitch, s.barWidth); // left straight horizontal slats
  }

  if (x > splitX + dividerHalf) {
    const theta = (y >= 0 ? s.angleDeg : -s.angleDeg) * Math.PI / 180;
    const nx = -Math.sin(theta);
    const ny = Math.cos(theta);
    return band(nx * x + ny * y, s.pitch, s.barWidth);
  }

  return false;
}

function pointIsLipSolid(x, y, s) {
  if (!s.lipEnabled) return false;
  const r = Math.hypot(x, y);
  return r >= s.lipInnerRadius && r <= s.lipOuterRadius;
}

function pointTopHeight(x, y, s) {
  if (!pointIsSolid(x, y, s)) return 0;
  return s.thickness + (pointIsLipSolid(x, y, s) ? s.lipHeight : 0);
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

function addQuad(tris, a, b, c, d) {
  tris.push([a, b, c]);
  tris.push([a, c, d]);
}

function makeGrid(s) {
  const targetCell = clamp(s.apertureDiameter / 300, 0.18, 2.5);
  const cells = Math.max(48, Math.ceil(s.outerDiameter / targetCell));
  const cell = s.outerDiameter / cells;
  const min = -s.outerRadius;
  const grid = Array.from({ length: cells }, () => new Uint8Array(cells));
  const heights = Array.from({ length: cells }, () => new Float32Array(cells));
  let solidCount = 0;

  for (let j = 0; j < cells; j++) {
    const y = min + (j + 0.5) * cell;
    for (let i = 0; i < cells; i++) {
      const x = min + (i + 0.5) * cell;
      const h = pointTopHeight(x, y, s);
      if (h > 0) {
        grid[j][i] = 1;
        heights[j][i] = h;
        solidCount++;
      }
    }
  }

  return { grid, heights, cells, cell, min, solidCount };
}

function sameHeight(a, b) {
  return Math.abs(a - b) < 1e-6;
}

function greedyTopBottom(tris, gridInfo) {
  const { grid, heights, cells, cell, min } = gridInfo;

  // Top faces: merge only cells with the same top height so lip steps stay real geometry.
  const topVisited = Array.from({ length: cells }, () => new Uint8Array(cells));
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const h0 = heights[j][i];
      if (!grid[j][i] || topVisited[j][i] || h0 <= 0) continue;

      let w = 1;
      while (i + w < cells && grid[j][i + w] && !topVisited[j][i + w] && sameHeight(heights[j][i + w], h0)) w++;

      let hCells = 1;
      let canGrow = true;
      while (j + hCells < cells && canGrow) {
        for (let x = i; x < i + w; x++) {
          if (!grid[j + hCells][x] || topVisited[j + hCells][x] || !sameHeight(heights[j + hCells][x], h0)) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) hCells++;
      }

      for (let yy = j; yy < j + hCells; yy++) {
        for (let xx = i; xx < i + w; xx++) topVisited[yy][xx] = 1;
      }

      const x0 = min + i * cell;
      const x1 = min + (i + w) * cell;
      const y0 = min + j * cell;
      const y1 = min + (j + hCells) * cell;

      addQuad(
        tris,
        { x: x0, y: y0, z: h0 },
        { x: x1, y: y0, z: h0 },
        { x: x1, y: y1, z: h0 },
        { x: x0, y: y1, z: h0 }
      );
    }
  }

  // Bottom faces: merge the full solid footprint at z=0.
  const bottomVisited = Array.from({ length: cells }, () => new Uint8Array(cells));
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      if (!grid[j][i] || bottomVisited[j][i]) continue;

      let w = 1;
      while (i + w < cells && grid[j][i + w] && !bottomVisited[j][i + w]) w++;

      let hCells = 1;
      let canGrow = true;
      while (j + hCells < cells && canGrow) {
        for (let x = i; x < i + w; x++) {
          if (!grid[j + hCells][x] || bottomVisited[j + hCells][x]) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) hCells++;
      }

      for (let yy = j; yy < j + hCells; yy++) {
        for (let xx = i; xx < i + w; xx++) bottomVisited[yy][xx] = 1;
      }

      const x0 = min + i * cell;
      const x1 = min + (i + w) * cell;
      const y0 = min + j * cell;
      const y1 = min + (j + hCells) * cell;

      addQuad(
        tris,
        { x: x0, y: y0, z: 0 },
        { x: x0, y: y1, z: 0 },
        { x: x1, y: y1, z: 0 },
        { x: x1, y: y0, z: 0 }
      );
    }
  }
}

function addSideWalls(tris, gridInfo) {
  const { heights, cells, cell, min } = gridInfo;
  const heightAt = (i, j) => i >= 0 && i < cells && j >= 0 && j < cells ? heights[j][i] : 0;

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const h = heightAt(i, j);
      if (h <= 0) continue;

      const x0 = min + i * cell;
      const x1 = min + (i + 1) * cell;
      const y0 = min + j * cell;
      const y1 = min + (j + 1) * cell;

      // South edge.
      let nh = heightAt(i, j - 1);
      if (h > nh) {
        addQuad(tris, { x: x0, y: y0, z: nh }, { x: x1, y: y0, z: nh }, { x: x1, y: y0, z: h }, { x: x0, y: y0, z: h });
      }

      // North edge.
      nh = heightAt(i, j + 1);
      if (h > nh) {
        addQuad(tris, { x: x0, y: y1, z: nh }, { x: x0, y: y1, z: h }, { x: x1, y: y1, z: h }, { x: x1, y: y1, z: nh });
      }

      // West edge.
      nh = heightAt(i - 1, j);
      if (h > nh) {
        addQuad(tris, { x: x0, y: y0, z: nh }, { x: x0, y: y0, z: h }, { x: x0, y: y1, z: h }, { x: x0, y: y1, z: nh });
      }

      // East edge.
      nh = heightAt(i + 1, j);
      if (h > nh) {
        addQuad(tris, { x: x1, y: y0, z: nh }, { x: x1, y: y1, z: nh }, { x: x1, y: y1, z: h }, { x: x1, y: y0, z: h });
      }
    }
  }
}

function generateSTL(s) {
  const err = validate(s);
  if (err) throw new Error(err);

  const gridInfo = makeGrid(s);
  if (!gridInfo.solidCount) throw new Error('Generated mask is empty. Check the dimensions.');

  const tris = [];
  greedyTopBottom(tris, gridInfo);
  addSideWalls(tris, gridInfo);

  let stl = 'solid bahtinov_mask_classic_v5_lip_mesh\n';
  for (const tri of tris) stl += facet(tri[0], tri[1], tri[2]);
  stl += 'endsolid bahtinov_mask_classic_v5_lip_mesh\n';

  return { stl, shapes: makePreviewGeometry(s), gridInfo, triCount: tris.length };
}

function ringPath(outerR, innerR) {
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
  const shapes = makePreviewGeometry(s);
  const pad = s.outerRadius * 0.08;
  preview.setAttribute('viewBox', `${-s.outerRadius - pad} ${-s.outerRadius - pad} ${(s.outerRadius + pad) * 2} ${(s.outerRadius + pad) * 2}`);
  preview.innerHTML = '';

  const aperture = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  aperture.setAttribute('cx', '0'); aperture.setAttribute('cy', '0'); aperture.setAttribute('r', s.apertureRadius.toString());
  aperture.setAttribute('fill', 'rgba(255,255,255,0.035)');
  preview.appendChild(aperture);

  for (const shape of shapes) {
    if (shape.kind === 'annulus' || shape.kind === 'lip-annulus') {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', ringPath(shape.outerR, shape.innerR));
      path.setAttribute('class', shape.kind === 'lip-annulus' ? 'mask-lip' : 'mask-ring');
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

  partCount.textContent = s.lipEnabled ? `single mesh + lip` : `single mesh STL`;
}

function renderCalculatedSummary(s) {
  const targetCell = clamp(s.apertureDiameter / 300, 0.18, 2.5);
  calculated.innerHTML = `
    <div><strong>Printed outside diameter</strong><span>${s.outerDiameter.toFixed(1)} mm</span></div>
    <div><strong>Thickness</strong><span>${s.thickness.toFixed(1)} mm</span></div>
    <div><strong>Rim</strong><span>${s.rimWidth.toFixed(1)} mm</span></div>
    <div><strong>Slats</strong><span>${s.barWidth.toFixed(1)} mm wide / ${s.pitch.toFixed(1)} mm pitch</span></div>
    <div><strong>Mounting lip</strong><span>${s.lipEnabled ? `${s.lipInnerDiameter.toFixed(1)} mm ID / ${s.lipHeight.toFixed(1)} mm tall` : 'off'}</span></div>
    <div><strong>Total height</strong><span>${s.totalHeight.toFixed(1)} mm</span></div>
    <div><strong>STL cell size</strong><span>~${targetCell.toFixed(2)} mm</span></div>
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
    statusEl.textContent = `Ready: classic v5 lip-ready single-mesh STL. ${s.apertureDiameter.toFixed(1)} mm aperture, ${s.outerDiameter.toFixed(1)} mm printed outside diameter.`;
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
}

for (const input of Object.values(fields)) input.addEventListener('input', update);
autoScale.addEventListener('change', update);
lipEnabled.addEventListener('change', update);
$('recommended').addEventListener('click', resetAutoScale);
$('downloadStl').addEventListener('click', () => {
  try {
    const s = settings();
    const { stl, gridInfo, triCount } = generateSTL(s);
    const safeD = String(s.apertureDiameter).replace(/[^0-9.]/g, '_');
    blobDownload(stl, `bahtinov-mask-classic-v5-${safeD}mm-aperture.stl`);
    statusEl.className = 'ok';
    statusEl.textContent = `Downloaded single-mesh STL: ${gridInfo.cells} × ${gridInfo.cells} grid, ${triCount.toLocaleString()} triangles.`;
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
    blobDownload(makeSvgText(), `bahtinov-mask-classic-v5-${safeD}mm-aperture.svg`, 'image/svg+xml');
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
});

resetAutoScale();
