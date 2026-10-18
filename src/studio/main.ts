import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';
import { newId, PaintingDoc } from './doc/document';
import { getPainting } from './doc/library';
import { Editor } from './editor';
import { Gallery } from './gallery';
import { GlowStudio } from './glow/glowStudio';
import { loadCustomBrushes, loadPrefs } from './tools';
import type { NewPaintingSpec } from './ui/newPainting';

/**
 * Drift Studio: a painting app at its own address. Home is the gallery; a
 * painting opens in the editor. The back button returns to the gallery.
 */
const root = document.getElementById('studio') as HTMLElement;
const prefs = loadPrefs();
loadCustomBrushes();
let gallery: Gallery | null = null;
let editor: Editor | null = null;
let glow: GlowStudio | null = null;

type Route = { painting?: string; glow?: boolean } | null;
const route = (): Route => history.state as Route;

function showGallery(): void {
  if (gallery) return void gallery.refresh();
  gallery = new Gallery(root, { open: (id) => void openPainting(id), create, glow: () => openGlow() });
}

/** The Glow studio: painting with light. */
function openGlow(push = true): void {
  hideGallery();
  if (push) history.pushState({ glow: true }, '', '#glow');
  glow = GlowStudio.create(root, prefs, {
    onExit: () => {
      glow = null;
      if (route()?.glow) history.back();
      else showGallery();
    },
  });
  if (!glow) {
    if (push) history.back();
    else showGallery();
    gallery?.toast('Glow needs WebGL, which this browser has turned off', 3000);
  }
}

function hideGallery(): void {
  gallery?.destroy();
  gallery = null;
}

function startEditor(doc: PaintingDoc, created: number, loaded: Map<string, Blob> | undefined, push: boolean): void {
  hideGallery();
  if (push) history.pushState({ painting: doc.id }, '', `#${doc.id}`);
  editor = new Editor(root, doc, prefs, {
    created,
    loaded,
    onExit: () => {
      editor = null;
      // Leaving with the on-screen button: step back so the phone's back button stays in step.
      if (route()?.painting) history.back();
      else showGallery();
    },
  });
}

function create(spec: NewPaintingSpec, name: string): void {
  const doc = new PaintingDoc(newId(), name, spec.width, spec.height, spec.paper);
  doc.addLayer();
  startEditor(doc, Date.now(), undefined, true);
}

async function openPainting(id: string, push = true): Promise<void> {
  try {
    const data = await getPainting(id);
    if (!data) throw new Error('missing');
    const { meta } = data;
    const doc = new PaintingDoc(meta.id, meta.name, meta.width, meta.height, meta.paper);
    for (const layerMeta of meta.layers) {
      const layer = doc.createLayer(layerMeta);
      const blob = data.layers.get(layerMeta.id);
      if (blob) {
        const bitmap = await createImageBitmap(blob);
        layer.ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      }
      doc.layers.push(layer);
    }
    if (!doc.layers.length) doc.addLayer();
    doc.active = Math.max(0, Math.min(doc.layers.length - 1, meta.active));
    startEditor(doc, meta.created, data.layers, push);
  } catch {
    if (!push) history.replaceState(null, '', location.pathname);
    showGallery();
    gallery?.toast('That painting could not be opened');
  }
}

window.addEventListener('popstate', () => {
  const state = route();
  if (state?.glow) {
    if (!glow) openGlow(false);
    return;
  }
  if (glow) {
    void glow.exit();
    return;
  }
  const id = state?.painting;
  if (!id) {
    if (editor) void editor.exit();
    else showGallery();
  } else if (!editor) {
    void openPainting(id, false);
  }
});

// Reopen the painting you were on (after a reload or a crash), with the gallery one step back.
const resume = location.hash.slice(1);
if (resume === 'glow') {
  history.replaceState(null, '', location.pathname);
  history.pushState({ glow: true }, '', '#glow');
  openGlow(false);
} else if (resume) {
  history.replaceState(null, '', location.pathname);
  history.pushState({ painting: resume }, '', `#${resume}`);
  void openPainting(resume, false);
} else {
  showGallery();
}
