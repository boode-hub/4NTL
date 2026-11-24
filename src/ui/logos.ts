/**
 * Small inline vendor marks shown before each provider's name. Inline SVG, so
 * nothing is fetched and no page CSP (img-src) can block them. Colors come
 * from the card's CSS, so they follow the theme.
 */
import type { ProviderId } from '../core/provider-ids';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Logo {
  readonly viewBox: string;
  readonly parts: readonly (readonly [
    tag: string,
    className: string,
    attrs: Record<string, string>,
  ])[];
}

const LOGOS: Readonly<Record<ProviderId, Logo>> = {
  // A right-pointing chevron cut into a box.
  virustotal: {
    viewBox: '0 0 100 89',
    parts: [
      [
        'path',
        'logo-fill',
        {
          'fill-rule': 'evenodd',
          d: 'M45.292 44.5 0 89h100V0H0l45.292 44.5zM90 80H22l35.987-35.2L22 9h68v71z',
        },
      ],
    ],
  },
  // EchoTrail: an "e" inside echoing arcs.
  echotrail: {
    viewBox: '0 0 16 16',
    parts: [
      ['path', 'logo-stroke', { d: 'M10.7 8.72A2.8 2.8 0 1 1 10.7 7.28M8 8h2.9' }],
      ['path', 'logo-stroke', { d: 'M3.08 8.87A5 5 0 0 1 10.5 3.67' }],
      ['path', 'logo-stroke', { d: 'M12.92 8.87A5 5 0 0 1 5.5 12.33' }],
      ['path', 'logo-stroke', { d: 'M1.42 5.61A7 7 0 0 1 6.78 1.11' }],
      ['path', 'logo-stroke', { d: 'M14.58 10.39A7 7 0 0 1 9.22 14.89' }],
    ],
  },
  // The local library: a stack of books.
  library: {
    viewBox: '0 0 16 16',
    parts: [['path', 'logo-stroke', { d: 'M2.5 3v10.5M5 3v10.5M8 4.2l3.2 9.3M13.5 13.5h-11' }]],
  },
  // A hat inside a "no" sign.
  abuseipdb: {
    viewBox: '0 0 16 16',
    parts: [
      [
        'path',
        'logo-ink',
        {
          d: 'M4.7 9.3 5.4 5.6c.1-.6.6-.9 1.1-.7L8 5.3l1.5-.4c.5-.2 1 .1 1.1.7l.7 3.7c1.5.3 2.4.8 2.4 1.3 0 .9-2.5 1.6-5.7 1.6s-5.7-.7-5.7-1.6c0-.5.9-1 2.4-1.3z',
        },
      ],
      ['circle', 'logo-ring', { cx: '8', cy: '8', r: '6.8', fill: 'none', 'stroke-width': '1.8' }],
      ['path', 'logo-ring', { d: 'M3.2 3.2l9.6 9.6', 'stroke-width': '1.8' }],
    ],
  },
};

export function providerLogo(id: ProviderId): SVGSVGElement {
  const { viewBox, parts } = LOGOS[id];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `logo logo-${id}`);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, className, attrs] of parts) {
    const part = document.createElementNS(SVG_NS, tag);
    part.setAttribute('class', className);
    for (const [name, value] of Object.entries(attrs)) part.setAttribute(name, value);
    svg.append(part);
  }
  return svg;
}
