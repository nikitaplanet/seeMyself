import type { CenterId } from '@/lib/hd/types';
import { centerVertices, type CenterLayout } from './layout';

// Spec §10.4 — defined centres are filled with their colour variable; undefined centres use the
// surface colour with an outline only.

const CENTER_FILL: Record<CenterId, string> = {
  head: 'var(--hd-yellow)',
  g: 'var(--hd-yellow)',
  ajna: 'var(--hd-green)',
  heart: 'var(--hd-red)',
  sacral: 'var(--hd-red)',
  throat: 'var(--hd-brown)',
  spleen: 'var(--hd-brown)',
  solarPlexus: 'var(--hd-brown)',
  root: 'var(--hd-brown)',
};

export function Center({ layout, defined }: { layout: CenterLayout; defined: boolean }) {
  const points = centerVertices(layout)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
  return (
    <polygon
      points={points}
      data-center={layout.id}
      data-defined={defined ? 'true' : 'false'}
      style={{
        fill: defined ? CENTER_FILL[layout.id] : 'var(--hd-surface)',
        stroke: defined ? 'var(--hd-center-stroke-defined)' : 'var(--hd-center-stroke)',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
      }}
    />
  );
}
