/**
 * Inline SVG icons, drawn in one rounded style so they sit happily in every
 * theme. They inherit `currentColor`.
 */
const svg = (body: string, viewBox = '0 0 24 24'): string =>
  `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ),
  music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  sound: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  slash: svg('<path d="M3 3l18 18"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  pause: svg('<path d="M9 6v12M15 6v12"/>'),
  home: svg('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v8.5h11V10"/>'),
  toybox: svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
  vibrate: svg('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.5 9v6M19.5 9v6"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  sparkle: svg(
    '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  ),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  drop: svg('<path d="M12 3.5c3.5 4.3 6 7.6 6 10.5a6 6 0 0 1-12 0c0-2.9 2.5-6.2 6-10.5z"/>'),
};

/** Brush pictures: big, friendly, recognisable without words. */
export const brushIcons: Record<string, string> = {
  soft: svg(
    '<path d="M19.5 4.5 11 13"/><path d="M11 13c-2.6-.6-5 1-5.4 3.6-.3 1.8-1 2.6-2.1 3 3 .9 7.3.2 8.5-2.4.6-1.3.3-2.9-1-4.2z" fill="currentColor" fill-opacity=".25"/>',
  ),
  ink: svg('<path d="M15 4l5 5-9.5 9.5-6 1.5 1.5-6z" fill="currentColor" fill-opacity=".15"/><path d="M13 6l5 5"/><circle cx="9.5" cy="14.5" r="1.2" fill="currentColor"/>'),
  wash: svg('<rect x="5" y="3.5" width="14" height="6" rx="1.5"/><path d="M7 9.5v4c0 1 1 2 2 2h6c1 0 2-1 2-2v-4" fill="currentColor" fill-opacity=".25"/><path d="M12 15.5v5"/>'),
  splatter: svg(
    '<circle cx="12" cy="12" r="3.2" fill="currentColor" fill-opacity=".35"/><circle cx="5.5" cy="7" r="1.4" fill="currentColor"/><circle cx="18.5" cy="6.5" r="1.1" fill="currentColor"/><circle cx="19" cy="16" r="1.6" fill="currentColor"/><circle cx="6.5" cy="17.5" r="1" fill="currentColor"/><circle cx="12" cy="4" r=".9" fill="currentColor"/><circle cx="13" cy="20" r="1" fill="currentColor"/>',
  ),
  water: svg('<path d="M12 3.5c3.5 4.3 6 7.6 6 10.5a6 6 0 0 1-12 0c0-2.9 2.5-6.2 6-10.5z" fill="currentColor" fill-opacity=".2"/><path d="M9 14.5a3 3 0 0 0 3 3"/>'),
  lift: svg('<path d="M4.5 15.5l8-8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-6 6H8.5z" fill="currentColor" fill-opacity=".2"/><path d="M9 11l6 6"/><path d="M12.5 19.5h7"/>'),
};
