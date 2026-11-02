import type { Side } from '@/lib/hd/types';
import type { Point } from './layout';

// Spec §10.4 — every channel is drawn as two half-segments, gate point → channel midpoint, each
// coloured by the activation state of its own gate. A hanging gate (activated, channel incomplete)
// therefore shows only its own half coloured.

export const BOTH_PATTERN_ID = 'hd-both-sides';

export type GateState = 'none' | 'personality' | 'design' | 'both';

export function gateState(sides: readonly Side[] | undefined): GateState {
  if (!sides || sides.length === 0) return 'none';
  const p = sides.includes('personality');
  const d = sides.includes('design');
  if (p && d) return 'both';
  return p ? 'personality' : 'design';
}

const STROKE: Record<Exclude<GateState, 'none'>, string> = {
  personality: 'var(--hd-personality)',
  design: 'var(--hd-design)',
  both: `url(#${BOTH_PATTERN_ID})`,
};

export const CHANNEL_WIDTH = 6;

/** The inactive "tube" of a channel: a full-length outline drawn under the coloured halves. */
export function ChannelTrack({ from, to }: { from: Point; to: Point }) {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      style={{ stroke: 'var(--hd-inactive)', strokeWidth: CHANNEL_WIDTH, strokeLinecap: 'butt' }}
    />
  );
}

/** One coloured half of a channel, from the gate point to the midpoint. Renders nothing if inactive. */
export function ChannelHalf({ from, to, state }: { from: Point; to: Point; state: GateState }) {
  if (state === 'none') return null;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={mid.x}
      y2={mid.y}
      data-state={state}
      style={{ stroke: STROKE[state], strokeWidth: CHANNEL_WIDTH - 1, strokeLinecap: 'butt' }}
    />
  );
}

/**
 * Diagonal red/black stripes for gates activated by both sides (§10.4). The stripes give
 * colour-blind users a texture cue, not just a hue (§10.5).
 */
export function BothSidesPattern() {
  return (
    <pattern id={BOTH_PATTERN_ID} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect x="0" y="0" width="3" height="6" style={{ fill: 'var(--hd-personality)' }} />
      <rect x="3" y="0" width="3" height="6" style={{ fill: 'var(--hd-design)' }} />
    </pattern>
  );
}
