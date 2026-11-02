import type { CenterId } from '@/lib/hd/types';

// Spec §10.1–10.3 — all BodyGraph geometry lives here. The drawing is our own simple geometry
// (triangles / squares / a diamond); nothing is traced from an existing chart image (§10, §13.2).
//
// Coordinates start from the §10.2 suggested centres and were tuned so every channel runs between
// gate points that face each other (see the comments on heart / spleen / solar plexus below).

export type CenterShape = 'triangleUp' | 'triangleDown' | 'triangleLeft' | 'triangleRight' | 'square' | 'diamond';

export interface CenterLayout {
  id: CenterId;
  shape: CenterShape;
  cx: number;
  cy: number;
  size: number;
}

export interface Point {
  x: number;
  y: number;
}

export const VIEWBOX = { width: 400, height: 640 } as const;

export const CENTERS: CenterLayout[] = [
  { id: 'head', shape: 'triangleUp', cx: 200, cy: 50, size: 40 },
  { id: 'ajna', shape: 'triangleDown', cx: 200, cy: 130, size: 40 },
  { id: 'throat', shape: 'square', cx: 200, cy: 220, size: 40 },
  { id: 'g', shape: 'diamond', cx: 200, cy: 325, size: 44 },
  // Moved right/down from the suggested (265, 365) so it does not touch the G centre's right tip and
  // so 25-51 / 21-45 / 26-44 / 37-40 stay short and the 12-22 / 35-36 channels pass to its right.
  { id: 'heart', shape: 'triangleUp', cx: 278, cy: 364, size: 36 },
  // Spleen / solar plexus moved slightly outwards (62 / 338) to leave room for the heart.
  { id: 'spleen', shape: 'triangleRight', cx: 62, cy: 440, size: 44 },
  { id: 'solarPlexus', shape: 'triangleLeft', cx: 338, cy: 440, size: 44 },
  { id: 'sacral', shape: 'square', cx: 200, cy: 470, size: 38 },
  { id: 'root', shape: 'square', cx: 200, cy: 585, size: 38 },
];

export const CENTER_BY_ID: Record<CenterId, CenterLayout> = Object.fromEntries(
  CENTERS.map((c) => [c.id, c]),
) as Record<CenterId, CenterLayout>;

/**
 * Polygon vertices of a centre, clockwise from the top-most / left-most vertex.
 * Triangles: apex at 0.8·size from the centre, base at 0.6·size on the other side, half-base = size.
 */
export function centerVertices(c: CenterLayout): Point[] {
  const { cx, cy, size: s } = c;
  switch (c.shape) {
    case 'triangleUp':
      return [
        { x: cx, y: cy - 0.8 * s },
        { x: cx + s, y: cy + 0.6 * s },
        { x: cx - s, y: cy + 0.6 * s },
      ];
    case 'triangleDown':
      return [
        { x: cx - s, y: cy - 0.6 * s },
        { x: cx + s, y: cy - 0.6 * s },
        { x: cx, y: cy + 0.8 * s },
      ];
    case 'triangleRight':
      return [
        { x: cx - 0.6 * s, y: cy - s },
        { x: cx + 0.8 * s, y: cy },
        { x: cx - 0.6 * s, y: cy + s },
      ];
    case 'triangleLeft':
      return [
        { x: cx + 0.6 * s, y: cy - s },
        { x: cx + 0.6 * s, y: cy + s },
        { x: cx - 0.8 * s, y: cy },
      ];
    case 'square':
      return [
        { x: cx - s, y: cy - s },
        { x: cx + s, y: cy - s },
        { x: cx + s, y: cy + s },
        { x: cx - s, y: cy + s },
      ];
    case 'diamond':
      return [
        { x: cx, y: cy - s },
        { x: cx + s, y: cy },
        { x: cx, y: cy + s },
        { x: cx - s, y: cy },
      ];
  }
}

/** Visual centroid used to push gate labels inwards. */
export function centerCentroid(c: CenterLayout): Point {
  const v = centerVertices(c);
  return { x: v.reduce((a, p) => a + p.x, 0) / v.length, y: v.reduce((a, p) => a + p.y, 0) / v.length };
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function buildGatePoints(): Record<number, Point> {
  const p: Record<number, Point> = {};
  const set = (gate: number, pt: Point) => {
    p[gate] = { x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 };
  };

  // head — bottom edge: 64, 61, 63
  {
    const [, br, bl] = centerVertices(CENTER_BY_ID.head);
    set(64, { x: 178, y: bl.y });
    set(61, { x: 200, y: bl.y });
    set(63, { x: 222, y: br.y });
  }
  // ajna — top edge: 47, 24, 4; below: 17 (left edge), 43 (apex), 11 (right edge)
  {
    const [tl, tr, apex] = centerVertices(CENTER_BY_ID.ajna);
    set(47, { x: 178, y: tl.y });
    set(24, { x: 200, y: tl.y });
    set(4, { x: 222, y: tr.y });
    set(17, lerp(tl, apex, 0.55));
    set(43, apex);
    set(11, lerp(tr, apex, 0.55));
  }
  // throat — top: 62, 23, 56; left: 16, 20; right: 35, 12, 45; bottom: 31, 8, 33
  {
    const c = CENTER_BY_ID.throat;
    const top = c.cy - c.size;
    const bottom = c.cy + c.size;
    const left = c.cx - c.size;
    const right = c.cx + c.size;
    set(62, { x: 178, y: top });
    set(23, { x: 200, y: top });
    set(56, { x: 222, y: top });
    set(16, { x: left, y: 202 });
    set(20, { x: left, y: 236 });
    set(35, { x: right, y: 202 });
    set(12, { x: right, y: 219 });
    set(45, { x: right, y: 236 });
    set(31, { x: 178, y: bottom });
    set(8, { x: 200, y: bottom });
    set(33, { x: 222, y: bottom });
  }
  // g — top: 7, 1, 13; left tip: 10; right tip: 25; bottom: 15, 2, 46
  {
    const [top, right, bottom, left] = centerVertices(CENTER_BY_ID.g);
    set(7, lerp(left, top, 0.5));
    set(1, top);
    set(13, lerp(right, top, 0.5));
    set(10, left);
    set(25, right);
    set(15, lerp(left, bottom, 0.5));
    set(2, bottom);
    set(46, lerp(right, bottom, 0.5));
  }
  // heart — 21 (top), 51 (left), 26 (lower left), 40 (lower right)
  {
    const [apex, br, bl] = centerVertices(CENTER_BY_ID.heart);
    set(21, apex);
    set(51, lerp(bl, apex, 0.57));
    set(26, lerp(bl, br, 0.28));
    set(40, lerp(bl, br, 0.75));
  }
  // spleen (apex points right, towards the sacral) — top edge from the outer corner towards the
  // apex: 48, 57, 44; apex: 50; bottom edge from the apex outwards: 32, 28, 18 (so 32-54, 28-38
  // and 18-58 run parallel to the root's left side 54/38/58 without crossing).
  {
    const [tb, apex, bb] = centerVertices(CENTER_BY_ID.spleen);
    set(48, lerp(tb, apex, 0.2));
    set(57, lerp(tb, apex, 0.42));
    set(44, lerp(tb, apex, 0.64));
    set(50, apex);
    set(32, lerp(apex, bb, 0.36));
    set(28, lerp(apex, bb, 0.58));
    set(18, lerp(apex, bb, 0.8));
  }
  // solar plexus — mirror image of the spleen. The spec lists the top edge as 36, 22, 37 and the
  // bottom as 49, 55, 30; we place 36 at the outer corner and 37 next to the apex (37-40 goes to
  // the heart just above), and 49 next to the apex / 30 outermost so 49-19, 55-39, 30-41 to the
  // root's right side (19/39/41 top to bottom) do not cross.
  {
    const [tb, bb, apex] = centerVertices(CENTER_BY_ID.solarPlexus);
    set(36, lerp(tb, apex, 0.2));
    set(22, lerp(tb, apex, 0.42));
    set(37, lerp(tb, apex, 0.64));
    set(6, apex);
    set(49, lerp(apex, bb, 0.36));
    set(55, lerp(apex, bb, 0.58));
    set(30, lerp(apex, bb, 0.8));
  }
  // sacral — top: 5, 14, 29; left: 34, 27; right: 59; bottom: 42, 3, 9
  {
    const c = CENTER_BY_ID.sacral;
    const top = c.cy - c.size;
    const bottom = c.cy + c.size;
    set(5, { x: 178, y: top });
    set(14, { x: 200, y: top });
    set(29, { x: 222, y: top });
    set(34, { x: c.cx - c.size, y: 456 });
    set(27, { x: c.cx - c.size, y: 484 });
    set(59, { x: c.cx + c.size, y: 470 });
    set(42, { x: 178, y: bottom });
    set(3, { x: 200, y: bottom });
    set(9, { x: 222, y: bottom });
  }
  // root — top: 53, 60, 52; left: 54, 38, 58; right: 19, 39, 41
  {
    const c = CENTER_BY_ID.root;
    const top = c.cy - c.size;
    set(53, { x: 178, y: top });
    set(60, { x: 200, y: top });
    set(52, { x: 222, y: top });
    set(54, { x: c.cx - c.size, y: 570 });
    set(38, { x: c.cx - c.size, y: 590 });
    set(58, { x: c.cx - c.size, y: 610 });
    set(19, { x: c.cx + c.size, y: 570 });
    set(39, { x: c.cx + c.size, y: 590 });
    set(41, { x: c.cx + c.size, y: 610 });
  }
  return p;
}

/** Spec §10.1 — the anchor point of each of the 64 gates, on its centre's outline. */
export const GATE_POINTS: Record<number, Point> = buildGatePoints();

/** Radius of the gate label circle. */
export const GATE_LABEL_RADIUS = 6.5;

const LABEL_INSET = 10;

/**
 * Where the gate number is drawn. A gate on a straight edge is pushed perpendicular to that edge,
 * into the centre (so neighbouring labels stay evenly spaced); a gate on a vertex is pushed
 * towards the centroid (a little further, since vertices are acute).
 */
export function gateLabelPoint(gate: number, centerId: CenterId): Point {
  const anchor = GATE_POINTS[gate];
  const layout = CENTER_BY_ID[centerId];
  const verts = centerVertices(layout);
  const c = centerCentroid(layout);

  const isVertex = verts.some((v) => Math.hypot(v.x - anchor.x, v.y - anchor.y) < 0.5);
  if (!isVertex) {
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      // distance of the anchor from the edge line, and whether it lies within the segment
      const cross = ((anchor.x - a.x) * ey - (anchor.y - a.y) * ex) / len;
      const t = ((anchor.x - a.x) * ex + (anchor.y - a.y) * ey) / (len * len);
      if (Math.abs(cross) < 0.5 && t > 0 && t < 1) {
        let nx = -ey / len;
        let ny = ex / len;
        if ((c.x - anchor.x) * nx + (c.y - anchor.y) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        return { x: anchor.x + nx * LABEL_INSET, y: anchor.y + ny * LABEL_INSET };
      }
    }
  }
  const dx = c.x - anchor.x;
  const dy = c.y - anchor.y;
  const len = Math.hypot(dx, dy) || 1;
  const inset = isVertex ? LABEL_INSET * 1.5 : LABEL_INSET;
  return { x: anchor.x + (dx / len) * inset, y: anchor.y + (dy / len) * inset };
}
