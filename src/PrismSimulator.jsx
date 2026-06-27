/**
 * Interactive Geometric Optics Prism Simulator
 *
 * Physics engine:
 *  - Snell's Law ray tracing through a triangular prism
 *  - Total internal reflection with multi-bounce support
 *  - Angle of deviation calculation
 *
 * UI:
 *  - Draggable prism (move + rotate via apex handle)
 *  - Draggable light source with independent beam-direction handle
 *  - Live measurements panel + math explanation panel
 *  - Toggle switches for all visual layers
 */

import React, {
  useRef, useEffect, useState, useCallback, useMemo,
} from 'react';

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MAX_REFLECTIONS = 12;

const MATERIAL_PRESETS = {
  Air:           { n: 1.000 },
  Water:         { n: 1.333 },
  Acrylic:       { n: 1.491 },
  'Crown Glass': { n: 1.523 },
  'Flint Glass': { n: 1.650 },
  Diamond:       { n: 2.417 },
};

// ─────────────────────────────────────────────────────────────
//  MATH HELPERS
// ─────────────────────────────────────────────────────────────

/** Normalise a 2-D vector */
function normalise({ x, y }) {
  const len = Math.hypot(x, y);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/** Dot product of two 2-D vectors */
const dot = (a, b) => a.x * b.x + a.y * b.y;

/** Rotate a vector by `angle` radians (CCW) */
function rotate(v, angle) {
  return {
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
  };
}

/**
 * Ray-segment intersection.
 *   Ray: P + t·D  (t > ε)
 *   Segment: A + s·(B-A)  (0 ≤ s ≤ 1)
 * Returns { t, point } or null.
 */
function raySegmentIntersect(P, D, A, B) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const denom = D.x * dy - D.y * dx;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((A.x - P.x) * dy - (A.y - P.y) * dx) / denom;
  const s = ((A.x - P.x) * D.y - (A.y - P.y) * D.x) / denom;

  if (t < 1e-6 || s < -1e-6 || s > 1 + 1e-6) return null;
  return { t, point: { x: P.x + t * D.x, y: P.y + t * D.y } };
}

/**
 * Outward surface normal for edge A→B.
 * We ensure it points away from the centroid.
 */
function outwardNormal(A, B, cx, cy) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  let N = { x: -dy / len, y: dx / len };
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  // If this normal points toward centroid, flip it
  if ((mid.x + N.x - cx) ** 2 + (mid.y + N.y - cy) ** 2 <
      (mid.x - cx) ** 2 + (mid.y - cy) ** 2) {
    N = { x: -N.x, y: -N.y };
  }
  return N;
}

// ─────────────────────────────────────────────────────────────
//  PHYSICS HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Snell's Law refraction.
 * incidentDir – unit vector of incoming ray
 * normal      – outward normal (points away from the medium being entered)
 * n1, n2      – refractive indices (n1=source medium, n2=dest medium)
 *
 * Returns { refractedDir, tir, thetaI, thetaT }
 */
function refract(incidentDir, normal, n1, n2) {
  // Make sure normal opposes the incoming ray direction
  let N = { ...normal };
  if (dot(incidentDir, N) > 0) { N = { x: -N.x, y: -N.y }; }

  const cosI = Math.min(1, -dot(incidentDir, N));
  const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));
  const thetaI = Math.acos(cosI);   // angle of incidence (radians)

  const sinT = (n1 / n2) * sinI;
  if (sinT > 1 + 1e-9) {
    return { refractedDir: null, tir: true, thetaI, thetaT: null };
  }

  const cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
  const thetaT = Math.asin(Math.min(1, sinT));
  const r = n1 / n2;

  const refractedDir = normalise({
    x: r * incidentDir.x + (r * cosI - cosT) * N.x,
    y: r * incidentDir.y + (r * cosI - cosT) * N.y,
  });

  return { refractedDir, tir: false, thetaI, thetaT };
}

/**
 * Specular reflection of incidentDir across normal.
 */
function reflect(incidentDir, normal) {
  let N = { ...normal };
  if (dot(incidentDir, N) > 0) { N = { x: -N.x, y: -N.y }; }
  const c = -dot(incidentDir, N);
  return normalise({
    x: incidentDir.x + 2 * c * N.x,
    y: incidentDir.y + 2 * c * N.y,
  });
}

/** Critical angle in degrees (arcsin(n2/n1)), or null when n2 >= n1 */
function criticalAngleDeg(n1, n2) {
  if (n2 >= n1) return null;
  return Math.asin(n2 / n1) * DEG;
}

// ─────────────────────────────────────────────────────────────
//  PRISM GEOMETRY
// ─────────────────────────────────────────────────────────────

/**
 * Build the 3 vertices of an isoceles triangular prism.
 *   apexAngle – top vertex angle (degrees)
 *   cx, cy    – centre of the prism
 *   rotation  – rotation angle (radians)
 *   size      – rough height half-extent (pixels)
 */
function buildPrism(cx, cy, apexAngle, rotation, size) {
  const halfApex = (apexAngle / 2) * RAD;
  const h = size;
  const halfBase = h * Math.tan(halfApex);

  // Apex up, base down (unrotated)
  const raw = [
    { x: 0,          y: -h * 0.67 },   // A – apex
    { x: -halfBase,  y:  h * 0.33 },   // B – bottom-left
    { x:  halfBase,  y:  h * 0.33 },   // C – bottom-right
  ];

  return raw.map(v => {
    const r = rotate(v, rotation);
    return { x: cx + r.x, y: cy + r.y };
  });
}

/** Return the 3 edges with their outward normals */
function getPrismEdges(verts) {
  const cx = (verts[0].x + verts[1].x + verts[2].x) / 3;
  const cy = (verts[0].y + verts[1].y + verts[2].y) / 3;
  const pairs = [
    [0, 1, 'AB'], [1, 2, 'BC'], [2, 0, 'CA'],
  ];
  return pairs.map(([i, j, label]) => ({
    A: verts[i],
    B: verts[j],
    label,
    normal: outwardNormal(verts[i], verts[j], cx, cy),
  }));
}

// ─────────────────────────────────────────────────────────────
//  RAY TRACING ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Trace a monochromatic ray through a triangular prism.
 *
 * Returns:
 *   segments – array of { from, to, type }
 *   physics  – measured optical data
 */
function traceRay(sourcePos, rayDir, prismVerts, n1, n2) {
  const edges = getPrismEdges(prismVerts);

  const segments = [];
  const physics = {
    entry: null,
    internals: [],
    exit: null,
    tirOccurred: false,
    numReflections: 0,
    deviationAngle: null,
  };

  // ── Find first intersection with prism ──
  let bestT = Infinity, entryEdgeIdx = -1, entryPoint = null;
  for (let i = 0; i < edges.length; i++) {
    const hit = raySegmentIntersect(sourcePos, rayDir, edges[i].A, edges[i].B);
    if (hit && hit.t < bestT) {
      bestT = hit.t; entryEdgeIdx = i; entryPoint = hit.point;
    }
  }

  if (entryEdgeIdx === -1) {
    // Ray misses the prism – draw a long ray
    segments.push({
      from: sourcePos,
      to: { x: sourcePos.x + rayDir.x * 2000, y: sourcePos.y + rayDir.y * 2000 },
      type: 'incident',
    });
    return { segments, physics };
  }

  // ── Entry refraction ──
  segments.push({ from: sourcePos, to: entryPoint, type: 'incident' });

  const entryN = edges[entryEdgeIdx].normal;
  const entryR = refract(rayDir, entryN, n1, n2);
  physics.entry = {
    point: entryPoint,
    edgeIdx: entryEdgeIdx,
    thetaI: entryR.thetaI,
    thetaT: entryR.thetaT,
    normal: entryN,
  };

  // Partial reflection at entry (short dashed orange ray)
  const entryReflDir = reflect(rayDir, entryN);
  segments.push({
    from: entryPoint,
    to: { x: entryPoint.x + entryReflDir.x * 120, y: entryPoint.y + entryReflDir.y * 120 },
    type: 'reflected',
  });

  if (entryR.tir) {
    // Should not happen from outside→inside, but handle gracefully
    return { segments, physics };
  }

  // ── Trace inside the prism ──
  let curPos = entryPoint;
  let curDir = entryR.refractedDir;
  let lastEdgeIdx = entryEdgeIdx;

  for (let bounce = 0; bounce <= MAX_REFLECTIONS; bounce++) {
    // Find the next edge (not the one we just came from)
    let nextT = Infinity, nextEdgeIdx = -1, nextPoint = null;
    for (let i = 0; i < edges.length; i++) {
      if (i === lastEdgeIdx) continue;
      const hit = raySegmentIntersect(curPos, curDir, edges[i].A, edges[i].B);
      if (hit && hit.t < nextT) {
        nextT = hit.t; nextEdgeIdx = i; nextPoint = hit.point;
      }
    }
    if (nextEdgeIdx === -1) break;

    // Draw the internal segment
    segments.push({ from: curPos, to: nextPoint, type: 'internal' });

    // Attempt exit refraction (n2 → n1)
    const exitN = edges[nextEdgeIdx].normal;
    // The ray is going outward → normal for Snell should oppose outward direction
    const exitR = refract(curDir, { x: -exitN.x, y: -exitN.y }, n2, n1);

    if (!exitR.tir) {
      // Ray exits
      physics.exit = {
        point: nextPoint,
        edgeIdx: nextEdgeIdx,
        thetaI: exitR.thetaI,
        thetaT: exitR.thetaT,
        normal: exitN,
      };
      // Partial reflection at exit
      const exitReflDir = reflect(curDir, { x: -exitN.x, y: -exitN.y });
      segments.push({
        from: nextPoint,
        to: { x: nextPoint.x + exitReflDir.x * 80, y: nextPoint.y + exitReflDir.y * 80 },
        type: 'reflected',
      });
      // Emergent ray
      segments.push({
        from: nextPoint,
        to: { x: nextPoint.x + exitR.refractedDir.x * 900, y: nextPoint.y + exitR.refractedDir.y * 900 },
        type: 'emergent',
        emergentDir: exitR.refractedDir,
      });
      break;
    }

    // TIR – internal reflection
    physics.tirOccurred = true;
    physics.numReflections++;
    physics.internals.push({
      point: nextPoint,
      edgeIdx: nextEdgeIdx,
      thetaI: exitR.thetaI,
      normal: exitN,
    });

    const tirDir = reflect(curDir, { x: -exitN.x, y: -exitN.y });
    curPos = nextPoint;
    curDir = tirDir;
    lastEdgeIdx = nextEdgeIdx;
  }

  // ── Compute deviation angle ──
  const emSeg = segments.find(s => s.type === 'emergent');
  if (emSeg) {
    const cosD = Math.max(-1, Math.min(1, dot(rayDir, emSeg.emergentDir)));
    physics.deviationAngle = Math.acos(cosD) * DEG;
    
    // Calculate intersection of incident ray and emergent ray
    const D1 = rayDir;
    const D2 = emSeg.emergentDir;
    const cross = D1.x * D2.y - D1.y * D2.x;
    if (Math.abs(cross) > 1e-10) {
      const P1 = physics.entry.point;
      const P2 = physics.exit.point;
      const dx = P2.x - P1.x, dy = P2.y - P1.y;
      const t = (dx * D2.y - dy * D2.x) / cross;
      physics.deviationPoint = { x: P1.x + t * D1.x, y: P1.y + t * D1.y };
    }
  }

  return { segments, physics };
}

// ─────────────────────────────────────────────────────────────
//  CANVAS DRAWING
// ─────────────────────────────────────────────────────────────

const COLORS = {
  incident:     '#3b82f6',
  internal:     '#10b981',
  reflected:    '#f97316',
  emergent:     '#8b5cf6',
  normal:       '#94a3b8',
  grid:         '#e2e8f0',
  source:       '#f59e0b',
  prismFill:    'rgba(186,230,253,0.35)',
  prismStroke:  '#0ea5e9',
};

function drawArrow(ctx, from, to, color, width = 2) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len, uy = dy / len;
  const arrowSz = Math.min(12, len * 0.35);

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * arrowSz - uy * arrowSz * 0.4, to.y - uy * arrowSz + ux * arrowSz * 0.4);
  ctx.lineTo(to.x - ux * arrowSz + uy * arrowSz * 0.4, to.y - uy * arrowSz - ux * arrowSz * 0.4);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawDashedLine(ctx, from, to, color, dash = [6, 4]) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawAngleArc(ctx, centre, fromAngle, toAngle, radius, color, labelText) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  // Always draw the shorter arc
  let a1 = fromAngle, a2 = toAngle;
  let diff = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
  if (diff > Math.PI) { [a1, a2] = [a2, a1]; diff = 2 * Math.PI - diff; }
  ctx.arc(centre.x, centre.y, radius, a1, a2, false);
  ctx.stroke();
  ctx.restore();

  // Label at arc midpoint
  const midA = a1 + diff / 2;
  ctx.fillStyle = color;
  ctx.font = 'bold 10.5px Inter, sans-serif';
  ctx.fillText(labelText, centre.x + (radius + 13) * Math.cos(midA), centre.y + (radius + 13) * Math.sin(midA));
}

function drawGrid(ctx, w, h) {
  const step = 40;
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────
//  TOOLTIP DEFINITIONS
// ─────────────────────────────────────────────────────────────
const TOOLTIPS = {
  'Incident Angle':
    'The angle between the incoming ray and the surface normal at the point of entry. Measured from the normal, not the surface itself.',
  'Refracted Angle':
    "The angle of the transmitted ray inside the prism, measured from the normal. Follows Snell's Law: n₁ sinθ₁ = n₂ sinθ₂.",
  'Emergent Angle':
    'The angle at which the ray exits the prism at the second surface, measured from the outward normal.',
  'Angle of Deviation':
    'The total angle between the original incident ray direction and the final emergent ray direction.',
  'Critical Angle':
    'The minimum angle of incidence (measured inside the denser medium) beyond which total internal reflection occurs. θ_c = arcsin(n₁/n₂).',
  'Total Internal Reflection':
    'When light inside a dense medium hits the interface at an angle exceeding the critical angle, all light is reflected — none escapes. Underpins optical fibres and prism binoculars.',
  'Refractive Index':
    'Ratio of the speed of light in vacuum to the speed in the medium (n = c/v). A higher index means light slows down more and bends more sharply.',
};

// ─────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function PrismSimulator() {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const dragState    = useRef({ type: null });
  // Store the device pixel ratio so pointer handlers can convert CSS→canvas coords
  const dprRef       = useRef(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);

  // ── Prism state ──
  const [prismCx, setPrismCx]       = useState(null);
  const [prismCy, setPrismCy]       = useState(null);
  const [prismRotation, setPrismRotation] = useState(0);
  const [apexAngle, setApexAngle]   = useState(60);
  const [prismSize, setPrismSize]   = useState(130);

  // ── Light source state ──
  const [sourceX, setSourceX] = useState(null);
  const [sourceY, setSourceY] = useState(null);
  const [beamAngle, setBeamAngle]   = useState(0); // radians

  // ── Optical properties ──
  const [n2, setN2]                         = useState(1.523);
  const [n1, setN1]                         = useState(1.000);
  const [selectedMaterial, setSelectedMaterial] = useState('Crown Glass');
  const [customN2, setCustomN2]             = useState('');

  // ── Visual toggles ──
  const [showGrid,     setShowGrid]     = useState(true);
  const [showNormals,  setShowNormals]  = useState(true);
  const [showArcs,     setShowArcs]     = useState(true);
  const [showIncident, setShowIncident] = useState(true);
  const [showReflected,setShowReflected]= useState(true);
  const [showEmergent, setShowEmergent] = useState(true);
  const [showInternal, setShowInternal] = useState(true);
  const [showLabels,   setShowLabels]   = useState(true);
  const [showDeviation,setShowDeviation]= useState(false);
  const [showOverlay,  setShowOverlay]  = useState(false);

  // ── Performance & View ──
  const [isLightweight, setIsLightweight] = useState(true);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [isDesktopView, setIsDesktopView] = useState(false);

  // ── Measurements ──
  const [measurements, setMeasurements] = useState({});
  const [mathLines,    setMathLines]    = useState([]);

  // ── Tooltip ──
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  // ── Canvas size ──
  const [canvasSize, setCanvasSize] = useState({ w: 700, h: 560 });

  // ─── Initialise positions once container is measured ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = rect.width  || 700;
    const h = rect.height || 560;
    setCanvasSize({ w, h });
    setPrismCx(w / 2);
    setPrismCy(h / 2);
    const sx = w * 0.14;
    const sy = h / 2;
    setSourceX(sx);
    setSourceY(sy);
    setBeamAngle(Math.atan2(h / 2 - sy, w / 2 - sx));
  }, []);

  // ─── Responsive canvas ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Derived prism vertices ───
  const prismVerts = useMemo(() => {
    if (prismCx === null) return [];
    return buildPrism(prismCx, prismCy, apexAngle, prismRotation, prismSize);
  }, [prismCx, prismCy, apexAngle, prismRotation, prismSize]);

  // ─── Ray trace result ───
  const traceResult = useMemo(() => {
    if (!prismVerts.length || sourceX === null) return null;
    const dir = normalise({ x: Math.cos(beamAngle), y: Math.sin(beamAngle) });
    return traceRay({ x: sourceX, y: sourceY }, dir, prismVerts, n1, n2);
  }, [prismVerts, sourceX, sourceY, beamAngle, n1, n2]);

  // ─── Update measurements and math explanation ───
  useEffect(() => {
    if (!traceResult) return;
    const { physics } = traceResult;
    const ca = criticalAngleDeg(n2, n1);

    setMeasurements({
      incidentAngle:    physics.entry?.thetaI != null ? (physics.entry.thetaI * DEG).toFixed(2) : '—',
      refractedAngle:   physics.entry?.thetaT != null ? (physics.entry.thetaT * DEG).toFixed(2) : '—',
      exitAngle:        physics.exit?.thetaI  != null ? (physics.exit.thetaI  * DEG).toFixed(2) : (physics.tirOccurred ? 'TIR' : '—'),
      emergentAngle:    physics.exit?.thetaT  != null ? (physics.exit.thetaT  * DEG).toFixed(2) : (physics.tirOccurred ? 'TIR' : '—'),
      deviationAngle:   physics.deviationAngle != null ? physics.deviationAngle.toFixed(2) : '—',
      criticalAngle:    ca != null ? ca.toFixed(2) : 'N/A',
      n1:               n1.toFixed(4),
      n2:               n2.toFixed(4),
      numReflections:   physics.numReflections,
      tir:              physics.tirOccurred ? 'Yes ⚠' : 'No',
      tirOccurred:      physics.tirOccurred,
    });

    // Build math explanation lines
    const lines = [];
    if (physics.entry) {
      const { thetaI: eI, thetaT: eT } = physics.entry;
      const sinI = Math.sin(eI).toFixed(4);
      const sinT = eT != null ? Math.sin(eT).toFixed(4) : '—';
      lines.push(
        '── Entry Surface ─────────────',
        `n₁ (medium) = ${n1.toFixed(4)}`,
        `n₂ (prism)  = ${n2.toFixed(4)}`,
        '',
        "Snell's Law:",
        '  n₁ · sin(θ₁) = n₂ · sin(θ₂)',
        '',
        `  θ₁ = ${(eI * DEG).toFixed(2)}°   sin(θ₁) = ${sinI}`,
        `  ${n1.toFixed(4)} × ${sinI} = ${n2.toFixed(4)} × sin(θ₂)`,
        `  sin(θ₂) = ${(n1 * Math.sin(eI) / n2).toFixed(4)}`,
        `  θ₂ = ${eT != null ? (eT * DEG).toFixed(2) + '°' : '(TIR at entry — unlikely)'}`,
        '',
        `Critical angle θ_c = arcsin(${n1.toFixed(3)}/${n2.toFixed(3)})`,
        `  = ${ca != null ? ca.toFixed(2) + '°' : 'N/A (n₁ ≥ n₂)'}`,
      );
    }
    if (physics.exit) {
      const { thetaI: xI, thetaT: xT } = physics.exit;
      lines.push(
        '',
        '── Exit Surface ──────────────',
        `  θ_internal = ${(xI * DEG).toFixed(2)}°   sin = ${Math.sin(xI).toFixed(4)}`,
        `  n₂ · sin(θ_i) = n₁ · sin(θ_out)`,
        `  ${n2.toFixed(4)} × ${Math.sin(xI).toFixed(4)} = ${n1.toFixed(4)} × sin(θ_out)`,
        `  sin(θ_out) = ${(n2 * Math.sin(xI) / n1).toFixed(4)}`,
        `  θ_out = ${(xT * DEG).toFixed(2)}°`,
      );
    }
    if (physics.tirOccurred) {
      lines.push('', '── TIR occurred ─────────────', '  Ray is totally internally reflected.');
    }
    if (physics.deviationAngle != null) {
      lines.push('', `Angle of deviation D = ${physics.deviationAngle.toFixed(2)}°`);
    }

    setMathLines(lines);
  }, [traceResult, n1, n2]);

  // ─── Viewport & Fullscreen Effects ───
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute('content', isDesktopView ? 'width=1024' : 'width=device-width, initial-scale=1.0');
    }
  }, [isDesktopView]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // ─────────────────────────────────────────────────────────────
  //  CANVAS RENDERING
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !prismVerts.length || sourceX === null) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = canvasSize;

    // ── High-DPI / Retina support ──
    // Set the actual pixel buffer to dpr × CSS size so the canvas is crisp
    // on high-density screens (Android, Retina, OLED, etc.).
    const dpr = isLightweight ? 1 : (window.devicePixelRatio || 1);
    dprRef.current = dpr;
    if (canvas.width  !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)) {
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    // Reset transform and scale so all drawing uses CSS-pixel coordinates
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (showGrid) drawGrid(ctx, w, h);

    // ── Draw prism ──
    ctx.beginPath();
    ctx.moveTo(prismVerts[0].x, prismVerts[0].y);
    ctx.lineTo(prismVerts[1].x, prismVerts[1].y);
    ctx.lineTo(prismVerts[2].x, prismVerts[2].y);
    ctx.closePath();
    ctx.fillStyle = COLORS.prismFill;
    ctx.fill();
    ctx.strokeStyle = COLORS.prismStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vertex labels
    if (showLabels) {
      const lbls = ['A', 'B', 'C'];
      const off  = [{ x: 0, y: -18 }, { x: -16, y: 14 }, { x: 16, y: 14 }];
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillStyle = '#0369a1';
      prismVerts.forEach((v, i) => ctx.fillText(lbls[i], v.x + off[i].x, v.y + off[i].y));
    }

    // ── Draw rays ──
    if (traceResult) {
      const { segments, physics } = traceResult;

      for (const seg of segments) {
        if (seg.type === 'incident'  && !showIncident)  continue;
        if (seg.type === 'reflected' && !showReflected) continue;
        if (seg.type === 'internal'  && !showInternal)  continue;
        if (seg.type === 'emergent'  && !showEmergent)  continue;

        const colorMap = {
          incident:  COLORS.incident,
          internal:  COLORS.internal,
          reflected: COLORS.reflected,
          emergent:  COLORS.emergent,
        };
        const col = colorMap[seg.type] || '#888';

        if (seg.type === 'reflected') {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(seg.from.x, seg.from.y);
          ctx.lineTo(seg.to.x, seg.to.y);
          ctx.stroke();
          ctx.restore();
        } else {
          drawArrow(ctx, seg.from, seg.to, col, 2);
        }
      }

      // ── Normals ──
      if (showNormals) {
        const normalLen = 52;

        const drawNormal = (point, normal, col = COLORS.normal) => {
          drawDashedLine(ctx,
            { x: point.x - normal.x * normalLen, y: point.y - normal.y * normalLen },
            { x: point.x + normal.x * normalLen, y: point.y + normal.y * normalLen },
            col,
          );
        };

        if (physics.entry) drawNormal(physics.entry.point, physics.entry.normal);
        if (physics.exit)  drawNormal(physics.exit.point,  physics.exit.normal);
        physics.internals.forEach(ir => drawNormal(ir.point, ir.normal, '#ef4444'));
      }

      // ── Angle arcs ──
      if (showArcs && physics.entry) {
        const { point: ep, normal: en, thetaI: eI, thetaT: eT } = physics.entry;
        const inDir = normalise({ x: Math.cos(beamAngle), y: Math.sin(beamAngle) });
        const normalAngle = Math.atan2(-en.y, -en.x); // incoming normal direction

        if (eI != null) {
          const inAngle = Math.atan2(inDir.y, inDir.x);
          drawAngleArc(ctx, ep, normalAngle, inAngle, 30, COLORS.incident, `${(eI * DEG).toFixed(1)}°`);
        }
        if (eT != null) {
          const internalSeg = segments.find(s => s.type === 'internal');
          if (internalSeg) {
            const idir = normalise({ x: internalSeg.to.x - internalSeg.from.x, y: internalSeg.to.y - internalSeg.from.y });
            drawAngleArc(ctx, ep, Math.atan2(en.y, en.x), Math.atan2(idir.y, idir.x), 22, COLORS.internal, `${(eT * DEG).toFixed(1)}°`);
          }
        }
      }

      // ── Deviation Angle ──
      if (showDeviation && physics.deviationPoint && physics.exit) {
        const I = physics.deviationPoint;
        const P1 = physics.entry.point;
        const P2 = physics.exit.point;
        const inDir = normalise({ x: Math.cos(beamAngle), y: Math.sin(beamAngle) });
        const outDir = segments.find(s => s.type === 'emergent').emergentDir;
        
        // Draw extensions from surfaces to intersection
        drawDashedLine(ctx, P1, I, '#94a3b8', [4, 4]);
        drawDashedLine(ctx, P2, I, '#94a3b8', [4, 4]);

        // Draw incident ray continuing past intersection
        const extLength = 100;
        drawDashedLine(ctx, I, { x: I.x + inDir.x * extLength, y: I.y + inDir.y * extLength }, '#64748b', [4, 4]);

        const a1 = Math.atan2(inDir.y, inDir.x);
        const a2 = Math.atan2(outDir.y, outDir.x);
        drawAngleArc(ctx, I, a1, a2, 35, '#f43f5e', `D = ${physics.deviationAngle.toFixed(1)}°`);
      }

      // ── Canvas overlay ──
      if (showOverlay && Object.keys(measurements).length) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(12, 12, 198, 126, 8);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1e293b';
        ctx.font = '11px JetBrains Mono, monospace';
        [
          `θ₁ = ${measurements.incidentAngle}°`,
          `θ₂ = ${measurements.refractedAngle}°`,
          `θ_exit = ${measurements.exitAngle}°`,
          `θ_em  = ${measurements.emergentAngle}°`,
          `D = ${measurements.deviationAngle}°`,
          `TIR: ${measurements.tir}`,
        ].forEach((l, i) => ctx.fillText(l, 22, 34 + i * 17));
        ctx.restore();
      }
    }

    // ── Light source ──
    {
      // Glow
      const grd = ctx.createRadialGradient(sourceX, sourceY, 0, sourceX, sourceY, 18);
      grd.addColorStop(0, 'rgba(251,191,36,0.85)');
      grd.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(sourceX, sourceY, 18, 0, Math.PI * 2); ctx.fill();

      // Core dot
      ctx.beginPath(); ctx.arc(sourceX, sourceY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b'; ctx.fill();
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.5; ctx.stroke();

      // Beam direction indicator
      const tipX = sourceX + Math.cos(beamAngle) * 24;
      const tipY = sourceY + Math.sin(beamAngle) * 24;
      ctx.beginPath(); ctx.moveTo(sourceX, sourceY); ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke();

      // Beam rotation handle (small orange dot 90° off beam direction)
      const hx = sourceX + Math.cos(beamAngle + Math.PI / 2) * 22;
      const hy = sourceY + Math.sin(beamAngle + Math.PI / 2) * 22;
      ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fb923c'; ctx.fill();
      ctx.strokeStyle = '#c2410c'; ctx.lineWidth = 1; ctx.stroke();
    }

    // Prism apex rotation handle
    if (prismVerts.length) {
      const apex = prismVerts[0];
      ctx.beginPath(); ctx.arc(apex.x, apex.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0ea5e9'; ctx.fill();
      ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 1; ctx.stroke();
    }

  }, [
    traceResult, prismVerts, sourceX, sourceY, beamAngle,
    showGrid, showNormals, showArcs, showIncident, showReflected,
    showEmergent, showInternal, showLabels, showOverlay, showDeviation,
    canvasSize, measurements, isLightweight
  ]);

  // ─────────────────────────────────────────────────────────────
  //  POINTER INTERACTION
  // ─────────────────────────────────────────────────────────────

  // Touch-friendly hit radii — large enough for a fingertip (~30–44 CSS px)
  const HIT_SOURCE = 30;   // light source body
  const HIT_HANDLE = 28;   // beam-rotation handle
  const HIT_APEX   = 26;   // prism apex rotation handle

  const isNearSource = useCallback((x, y) =>
    sourceX !== null && Math.hypot(x - sourceX, y - sourceY) < HIT_SOURCE,
  [sourceX, sourceY]);

  const isNearBeamHandle = useCallback((x, y) => {
    if (sourceX === null) return false;
    const hx = sourceX + Math.cos(beamAngle + Math.PI / 2) * 22;
    const hy = sourceY + Math.sin(beamAngle + Math.PI / 2) * 22;
    return Math.hypot(x - hx, y - hy) < HIT_HANDLE;
  }, [sourceX, sourceY, beamAngle]);

  const isNearApex = useCallback((x, y) =>
    prismVerts.length > 0 && Math.hypot(x - prismVerts[0].x, y - prismVerts[0].y) < HIT_APEX,
  [prismVerts]);

  const isInsidePrism = useCallback((x, y) => {
    if (!prismVerts.length) return false;
    const [A, B, C] = prismVerts;
    const sign = (p, a, b) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
    const d1 = sign({ x, y }, A, B), d2 = sign({ x, y }, B, C), d3 = sign({ x, y }, C, A);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }, [prismVerts]);

  const handlePointerDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    if (isNearBeamHandle(x, y)) {
      dragState.current = { type: 'rotate-beam' };
    } else if (isNearApex(x, y)) {
      dragState.current = { type: 'rotate-prism',
        startAngle: Math.atan2(y - prismCy, x - prismCx) - prismRotation };
    } else if (isNearSource(x, y)) {
      dragState.current = { type: 'source', offX: x - sourceX, offY: y - sourceY };
    } else if (isInsidePrism(x, y)) {
      dragState.current = { type: 'prism', offX: x - prismCx, offY: y - prismCy };
    } else {
      return;
    }
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
  }, [isNearBeamHandle, isNearApex, isNearSource, isInsidePrism, prismCx, prismCy, prismRotation, sourceX, sourceY]);

  const handlePointerMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const ds = dragState.current;

    switch (ds.type) {
      case 'source':
        setSourceX(x - ds.offX);
        setSourceY(y - ds.offY);
        setBeamAngle(Math.atan2(prismCy - (y - ds.offY), prismCx - (x - ds.offX)));
        break;
      case 'prism':
        setPrismCx(x - ds.offX);
        setPrismCy(y - ds.offY);
        break;
      case 'rotate-prism':
        setPrismRotation(Math.atan2(y - prismCy, x - prismCx) - ds.startAngle);
        break;
      case 'rotate-beam':
        setBeamAngle(Math.atan2(y - sourceY, x - sourceX));
        break;
    }

    // Update cursor
    if (!ds.type) {
      if (isNearBeamHandle(x, y) || isNearApex(x, y)) canvas.style.cursor = 'grab';
      else if (isNearSource(x, y) || isInsidePrism(x, y)) canvas.style.cursor = 'move';
      else canvas.style.cursor = 'default';
    } else {
      canvas.style.cursor = ds.type === 'rotate-prism' || ds.type === 'rotate-beam' ? 'grabbing' : 'move';
    }
  }, [prismCx, prismCy, sourceX, sourceY, isNearBeamHandle, isNearApex, isNearSource, isInsidePrism]);

  const handlePointerUp = useCallback(() => {
    dragState.current = { type: null };
  }, []);

  // ─────────────────────────────────────────────────────────────
  //  SUB-COMPONENTS
  // ─────────────────────────────────────────────────────────────

  const TooltipLabel = ({ label, tipKey, children }) => (
    <span
      className="tip-label"
      onMouseEnter={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setTooltip({ visible: true, text: TOOLTIPS[tipKey] || tipKey, x: r.left, y: r.bottom + 6 });
      }}
      onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
    >
      {label ?? children} <span className="tip-icon">?</span>
    </span>
  );

  const Toggle = ({ label, value, onChange }) => (
    <label className="toggle-row">
      <span>{label}</span>
      <div
        id={`toggle-${label.toLowerCase().replace(/\s+/g, '-')}`}
        className={`toggle-switch ${value ? 'on' : ''}`}
        role="switch"
        aria-checked={value}
        tabIndex={0}
        onClick={() => onChange(!value)}
        onKeyDown={e => e.key === 'Enter' && onChange(!value)}
      >
        <div className="toggle-thumb" />
      </div>
    </label>
  );

  const MeasRow = ({ label, value, highlight, accent }) => (
    <tr className={`meas-row ${highlight ? 'meas-highlight' : ''} ${accent ? 'meas-accent' : ''}`}>
      <td className="meas-label">{label}</td>
      <td className="meas-value">{value ?? '—'}</td>
    </tr>
  );

  // ─────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="sim-root">

      {/* Global Tooltip */}
      {tooltip.visible && (
        <div className="global-tooltip" style={{ top: tooltip.y, left: tooltip.x }}>
          {tooltip.text}
        </div>
      )}

      {/* Header */}
      <header className="sim-header">
        <div className="sim-header-inner">
          <div className="sim-logo">◈</div>
          <div style={{ flex: 1 }}>
            <h1 className="sim-title">Prism Optics Simulator</h1>
            <p className="sim-subtitle">
              Interactive geometric optics — drag the prism &amp; light source
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => setIsLightweight(!isLightweight)} style={{ padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #e2e8f0', background: isLightweight ? '#0ea5e9' : '#ffffff', color: isLightweight ? '#ffffff' : '#1e293b' }}>
              Lightweight Mode: {isLightweight ? 'ON' : 'OFF'}
            </button>
            <button onClick={() => setIsDesktopView(!isDesktopView)} style={{ padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #e2e8f0', background: isDesktopView ? '#0ea5e9' : '#ffffff', color: isDesktopView ? '#ffffff' : '#1e293b' }}>
              Desktop View: {isDesktopView ? 'ON' : 'OFF'}
            </button>
            <button onClick={toggleFullscreen} style={{ padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#ffffff', color: '#1e293b' }}>
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="sim-layout">

        {/* ── Canvas ── */}
        <section className="sim-canvas-section">
          <div className="canvas-wrapper" ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <canvas
              ref={canvasRef}
              id="optics-canvas"
              className="sim-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
          </div>
          <div className="canvas-legend">
            <span style={{ color: COLORS.incident }}>● Incident</span>
            <span style={{ color: COLORS.internal }}>● Refracted (inside)</span>
            <span style={{ color: COLORS.reflected }}>● Reflected</span>
            <span style={{ color: COLORS.emergent }}>● Emergent</span>
          </div>
        </section>

        {/* ── Right panel ── */}
        <aside className="sim-panel">

          {/* Optical Properties */}
          <section className="panel-section">
            <h2 className="panel-title">⚗️ Optical Properties</h2>

            <label className="field-label">Prism Material</label>
            <select
              id="material-select"
              className="field-select"
              value={selectedMaterial}
              onChange={e => {
                const mat = e.target.value;
                setSelectedMaterial(mat);
                if (MATERIAL_PRESETS[mat]) { setN2(MATERIAL_PRESETS[mat].n); setCustomN2(''); }
              }}
            >
              {Object.keys(MATERIAL_PRESETS).map(m => (
                <option key={m} value={m}>{m} (n = {MATERIAL_PRESETS[m].n})</option>
              ))}
            </select>

            <label className="field-label">
              <TooltipLabel label="Prism Refractive Index (n₂)" tipKey="Refractive Index" />
            </label>
            <div className="index-row">
              <input id="n2-range" className="field-range" type="range"
                min="1.0" max="3.0" step="0.001" value={n2}
                onChange={e => { setN2(parseFloat(e.target.value)); setSelectedMaterial(''); setCustomN2(e.target.value); }}
              />
              <input id="n2-number" className="field-number" type="number"
                min="1.0" max="5.0" step="0.001"
                value={customN2 !== '' ? customN2 : n2}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  setCustomN2(e.target.value);
                  if (!isNaN(v) && v >= 1) { setN2(v); setSelectedMaterial(''); }
                }}
              />
            </div>

            <label className="field-label">Air Refractive Index (n₁)</label>
            <div className="index-row">
              <input id="n1-range" className="field-range" type="range"
                min="1.0" max="2.0" step="0.001" value={n1}
                onChange={e => setN1(parseFloat(e.target.value))}
              />
              <span className="index-val">{n1.toFixed(3)}</span>
            </div>
          </section>

          {/* Prism Controls */}
          <section className="panel-section">
            <h2 className="panel-title">△ Prism Controls</h2>

            <label className="field-label">
              Apex Angle: <strong>{apexAngle}°</strong>
            </label>
            <input id="apex-range" className="field-range full-range" type="range"
              min="20" max="120" step="1" value={apexAngle}
              onChange={e => setApexAngle(parseInt(e.target.value))}
            />

            <label className="field-label">
              Prism Size: <strong>{prismSize}px</strong>
            </label>
            <input id="size-range" className="field-range full-range" type="range"
              min="60" max="220" step="5" value={prismSize}
              onChange={e => setPrismSize(parseInt(e.target.value))}
            />

            <p className="hint">
              🔵 Drag apex vertex to rotate prism &nbsp;|&nbsp; 🔶 Drag orange dot to rotate beam
            </p>
          </section>

          {/* Visual Toggles */}
          <section className="panel-section">
            <h2 className="panel-title">👁 Visual Toggles</h2>
            <div className="toggle-grid">
              <Toggle label="Grid"          value={showGrid}      onChange={setShowGrid}      />
              <Toggle label="Normals"       value={showNormals}   onChange={setShowNormals}   />
              <Toggle label="Angle Arcs"   value={showArcs}      onChange={setShowArcs}      />
              <Toggle label="Incident"      value={showIncident}  onChange={setShowIncident}  />
              <Toggle label="Reflected"     value={showReflected} onChange={setShowReflected} />
              <Toggle label="Emergent"      value={showEmergent}  onChange={setShowEmergent}  />
              <Toggle label="Internal"      value={showInternal}  onChange={setShowInternal}  />
              <Toggle label="Labels"        value={showLabels}    onChange={setShowLabels}    />
              <Toggle label="Deviation"     value={showDeviation} onChange={setShowDeviation} />
              <Toggle label="Overlay"       value={showOverlay}   onChange={setShowOverlay}   />
            </div>
          </section>

          {/* Measurements */}
          <section className="panel-section">
            <h2 className="panel-title">📐 Measurements</h2>
            <table className="meas-table">
              <tbody>
                <MeasRow
                  label={<TooltipLabel label="Incident Angle" tipKey="Incident Angle" />}
                  value={measurements.incidentAngle != null ? `${measurements.incidentAngle}°` : '—'}
                />
                <MeasRow
                  label={<TooltipLabel label="Refracted Angle" tipKey="Refracted Angle" />}
                  value={measurements.refractedAngle != null ? `${measurements.refractedAngle}°` : '—'}
                />
                <MeasRow
                  label="Exit Incidence Angle"
                  value={measurements.exitAngle != null ? `${measurements.exitAngle}°` : '—'}
                />
                <MeasRow
                  label={<TooltipLabel label="Emergent Angle" tipKey="Emergent Angle" />}
                  value={measurements.emergentAngle != null ? `${measurements.emergentAngle}°` : '—'}
                />
                <MeasRow
                  label={<TooltipLabel label="Angle of Deviation" tipKey="Angle of Deviation" />}
                  value={measurements.deviationAngle != null ? `${measurements.deviationAngle}°` : '—'}
                  highlight
                />
                <MeasRow
                  label={<TooltipLabel label="Critical Angle" tipKey="Critical Angle" />}
                  value={measurements.criticalAngle != null ? (measurements.criticalAngle === 'N/A' ? 'N/A' : `${measurements.criticalAngle}°`) : '—'}
                />
                <MeasRow label="n₁ (air/medium)" value={measurements.n1} />
                <MeasRow label="n₂ (prism)"      value={measurements.n2} />
                <MeasRow label="Internal Reflections" value={measurements.numReflections ?? '—'} />
                <MeasRow
                  label={<TooltipLabel label="Total Internal Reflection" tipKey="Total Internal Reflection" />}
                  value={measurements.tir}
                  accent={measurements.tirOccurred}
                />
              </tbody>
            </table>
          </section>

          {/* Math Explanation */}
          <section className="panel-section">
            <h2 className="panel-title">🧮 Math Explanation</h2>
            <div className="math-block">
              {mathLines.length > 0
                ? mathLines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith('──') ? 'math-section-header' :
                        line === ''           ? 'math-spacer' : 'math-line'
                      }
                    >
                      {line}
                    </div>
                  ))
                : <span className="math-placeholder">Aim the beam at the prism to see live calculations.</span>
              }
            </div>
          </section>

        </aside>
      </main>
    </div>
  );
}
