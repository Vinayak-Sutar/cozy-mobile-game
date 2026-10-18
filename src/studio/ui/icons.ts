const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Line icons for the studio, drawn to match each other. */
export const icons = {
  gallery: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  share: svg('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  brush: svg('<path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-3.5-3.5z"/><path d="M8.5 12.5c-2.5 0-4 1.6-4 4 0 1.5-.8 2.5-2 3 4 .8 8-.5 8.5-4.5z"/>'),
  eraser: svg('<path d="m7 21-4-4 11-11 7 7-8 8z"/><path d="M7 21h13"/><path d="m9 11 7 7"/>'),
  smudge: svg('<path d="M9 21v-7.5a1.5 1.5 0 0 1 3 0V12a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v3a5 5 0 0 1-5 5z"/><path d="M12 12V5.5a1.5 1.5 0 0 0-3 0v8"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  merge: svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
  up: svg('<path d="m6 14 6-6 6 6"/>'),
  down: svg('<path d="m6 10 6 6 6-6"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  hide: svg('<path d="M3 3l18 18"/><rect x="4" y="4" width="16" height="16" rx="3"/>'),
  pen: svg('<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><circle cx="11" cy="11" r="2"/>'),
  help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
  clear: svg('<path d="M5 5h14v14H5z"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  paper: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>'),
  versions: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  rename: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  tools: svg('<path d="m4 20 10-10"/><path d="m14 10 2 2"/><path d="M15 4v2M19 8h2M15 4l.5 2M18.5 4.5 17 6M20 11l-2-.5"/><path d="M17.5 3.5l3 3"/>'),
  fill: svg('<path d="m5 11 7-7 8 8-7 7a2.1 2.1 0 0 1-3 0l-5-5a2.1 2.1 0 0 1 0-3z"/><path d="M5 11h15"/><path d="M20 16s2 2.4 2 3.5a2 2 0 0 1-4 0c0-1.1 2-3.5 2-3.5z"/>'),
  palette: svg('<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.6-.9 1.2-1.9-.5-1.1.2-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>'),
};

/** Makes an element from an HTML string. */
export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as T;
}

export function button(icon: string, label: string, className = 'st-btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = icon;
  return b;
}
