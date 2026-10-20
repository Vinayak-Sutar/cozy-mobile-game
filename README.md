# Drift

A calm, touch-reactive fluid toy box for all ages. Move your fingers and the screen answers with swirling light, paint and water. There are no levels, no score, and no way to fail.

The app opens on a **Home** screen whose background is live fluid, so you can swirl it. **Play** opens the **Toy box**, and every idea gets its own section card there:

| Section | What it does |
|---|---|
| **Glow** | Neon ink swirls in a dark room. Each finger gets its own colour. A tap opens a little flower of light; hold your finger still and light gathers into a glowing whirl under it, then blooms out when you let go. |
| **Paint** | Pastel watercolour on cream paper. Colours really mix: blue + yellow makes green. |
| **Paint with Brush** | The same paper, but you pick from six brushes (Soft round, Ink pen, Big wash, Splatter, Water, Lift), three sizes, 14 paints, and how wet the paper is (Dry / Damp / Wet). It also has undo (5 steps) and Clean paper. Paint stays put so you can make a picture. |
| **Water the Garden** | An open garden under a big sky. Open the seed bag (bottom-left) and drag seeds and pots onto the six spots in the bed, or tap one and then tap a spot. Hold the little cloud and move it to rain on your plants; swirl elsewhere to make wind that blows the rain. Plants grow seed → sprout → bud → bloom, the garden is saved as you leave it, and long-pressing a plant picks it. Every bloom goes into the **Flower album** (top-right). |
| **Little Painter** | Pip asks for a colour. Mix red, yellow and blue in Pip's dish until the ring around it fills. Pip drinks it and turns that colour, and it goes in your **Colour book**. Stuck? A hint shows which paints make it. Teaches colour mixing. |
| **Hidden Picture** | The screen is a fogged-up window. Wipe it with your fingers to find the picture outside (a cat, a whale, a rocket, a rainbow, a snowman, an owl, a balloon, a duck). Drops trickle down the glass. Wipe most of it and the picture is revealed and added to your **Picture book**, then the fog rolls back with a new one. |
| **Paper Boats** | An animal sits in a paper boat, and a bubble shows a picture of where it wants to go; that pier glows. Swipe the water to make a current and the boat floats along with it (tap for a ripple; tap the boat and the passenger waves). Each map is a few screens big and the camera follows the boat; an arrow at the edge points to a pier that's off-screen. At the right pier the passenger hops off happy and joins your **Boat log**. The 8 passengers have names and personalities: Hoppy the punny frog, Puddle the over-excited duckling, shy Clover, Miso the kitten who hates getting wet, polite Crumb, sleepy Bramble, Sir Waddles and show-off Rusty. They chat in speech bubbles with a little babble voice: where they want to go, a hello when you tap them, "wrong pier!", bumps, going fast, each map's twist, and a thank-you (or a word about the place) when they arrive. **Five places**, each with its own twist; carry 3 passengers on one to open the next (map button, bottom-left): **Sunny Pond** (calm, with an island), **Winding River** (the current keeps flowing, so don't drift past the pier), **Windy Bay** (gusts push the sail; watch the streaks), **Frozen Lake** (ice floes drift and bump; push them aside) and **Moonlit Lagoon** (glowing whirlpools spin you round). |
| **Penguin Island** | A snowy island to explore with Pebble the penguin. **Drag** to waddle (like a joystick that starts where your finger lands); **flick** to belly-glide: fast and slippery on ice, slow in deep powder, quicker down the slope. Find the 6 lost chicks (one is on an islet in the middle of the big ice field); they follow you in a line, and when you bring them home to the igloo they go in your **Chick book**. Fish hop out of fishing holes; three islanders have favours to ask (Grandpa Waddle wants fish, Skipper has a letter for Auntie Flo, who lost her mitten on the frozen pond) and give hats as thanks; fish buy more hats and scarves in the **Wardrobe** (bottom-left). Shiny pebbles hide in nooks. Once everyone's home, a few chicks sneak out to play again. |

The last card, **Studio**, opens **Drift Studio**, a separate painting app (below).

**Parked for a rethink:** Pond, Lantern Lights and Feed the Koi. Their cards are hidden, but they still open if you add `?lab=1` to the address (which also opens every Paper Boats map, for testing).

- **In a toy:** hold the pause button (top-left) to open the pause menu: Keep playing, Clean paper, Settings, Toy box, Home. Holding instead of tapping keeps little hands from leaving by accident.
- **Settings:**
  - Separate Music and Sounds volumes, and Vibration.
  - **Four themes**: Moonlit lullaby, Cotton candy clay, Storybook meadow, Dusk origami.
  - Graphics: Battery saver, Auto or Best. Battery saver swaps the live menu background for a still illustration.

## Drift Studio

A painting app for artists at its own address, `…/studio/` ([live](https://vinayak-sutar.github.io/cozy-mobile-game/studio/)). It installs to the home screen on its own as **Drift Studio**. Version 1 is complete, in four milestones: foundation, make it yours, alive, and share.

- **Gallery:** your paintings, saved automatically in the browser (IndexedDB) after every pause and whenever the app is hidden. Reopening after a reload or crash goes straight back to the painting. **Earlier versions** keeps the last 5 snapshots (one each time you come back and paint, and every 10 minutes). Rename, duplicate and delete from a card's ⋯ menu.
- **New painting:** Screen, Square 2048, Portrait 2:3, Landscape 3:2, Phone wallpaper, A4 print (300 dpi) or a custom size, up to 4096 px a side. Paper colour, texture (smooth, watercolour, canvas) or transparent.
- **Canvas:** pinch to zoom and rotate (snaps to straight), drag with two fingers to move; the % button fits it back.
- **Brushes:** 30 brushes in 7 sets: Sketch (pencils, charcoal, soft pastel), Ink (fineliner, technical pen, brush pen, calligraphy, dry ink), Paint (round, flat, gouache, **oil paint** and **palette knife** that blend the colours already there, dry brush), Airbrush, Marker, Light & magic (neon glow, stars, rainbow, flowers, hearts) and Nature (leaves, grass, clouds). Each is a tip shape plus a grain texture, with pressure and tilt from a stylus, speed and taper for fingers, and StreamLine smoothing. Each brush remembers its own size. **Smudge** and **Eraser** can use any brush's shape.
- **Live watercolour** (its own brush set): Wet round, Wet wash, Spatter, Clean water and Lift paint into real flowing water (Drift's fluid solver, the shape of your canvas). Pigment spreads a little, darkens at wet edges and mixes where colours meet (blue and yellow make green). A wet bar shows while paint is wet: **Freeze** stops it moving, **Drips** lets it run down the page, **Re-wet layer** makes a layer's dry paint flow again, and **Dry now**. It also dries by itself after 7 quiet seconds, or when you use another tool. Undo steps back through wet strokes, and each dried wash is one undo step.
- **Brush editor and My brushes:** *Edit* any brush or tap *+ New brush*: 13 tip shapes, and about 30 settings in six groups (shape, stroke, grain, pressure and speed, colour jitter and rainbow, wet mix, glow and blend), with a live sample stroke. Built-in brushes stay as they are; saving makes your own copy in **My brushes**.
- **Tools** (the wand button):
  - **Symmetry:** Mirror, Mirror across, Four ways, Radial and Kaleidoscope (2–16 copies), with a centre you can drag. Paint, smudge, the eraser and QuickShape all follow it.
  - **Fill bucket:** tap an area to fill it, with a tolerance, looking at all layers (to colour line art from another layer) or just this one. The fill tucks under soft line edges, so there's no halo.
  - **Drawing help:** **QuickShape**: draw a line, arc, circle, ellipse, rectangle or triangle and hold still at the end, and it snaps clean. **Predictive stroke** tidies wobbly lines when you lift.
  - **Reference:** a floating window with a picture from your device or the whole painting. Drag it, resize it, and tap it to pick colours.
- **Colour:** a disc, HSV/RGB sliders with hex, harmony suggestions, 8 built-in palettes plus your own, and the last 10 colours. Touch and hold the canvas to pick a colour.
- **Layers:** up to 16 (fewer on huge canvases or low-memory phones), with opacity, 16 blend modes, alpha lock, reorder, duplicate, merge down, clear and hide.
- **Undo and redo:** buttons, or tap with two fingers (undo) or three (redo). Four fingers hides the interface.
- **On a laptop or desktop** (mouse, trackpad and keyboard), nothing is touch-only:
  - **Moving and turning the painting:** scroll or two-finger trackpad scroll moves it. Ctrl/⌘ + scroll, or a trackpad pinch, zooms around the pointer, and Alt + scroll turns it. Space + drag, or a middle or right drag, also moves it.
  - **Painting:** a brush outline follows the mouse so you see its size, and Alt+click picks a colour.
  - **Shortcuts:**
    - Ctrl+Z / Ctrl+Shift+Z undo and redo. B, E, S and G are paint, eraser, smudge and fill.
    - [ and ] change the brush size, and 1…0 the opacity.
    - +, − and Ctrl+0 / Ctrl+1 zoom in, zoom out, fit and go to 100%.
    - , and . turn the painting 15° (R straightens it).
    - L opens layers, Ctrl+E shares, Tab hides the interface, Ctrl+S saves, and ? lists them all.
  - **A stylus on a computer** works too: its eraser end erases and its side button picks a colour.
  - **Glow:** F freezes, [ ] change the size, and Ctrl+Z undoes.
- **Pen-only mode** turns on by itself when a stylus touches the screen: fingers then only move the canvas, and touch-and-hold still picks colours.
- **Share → Picture:** PNG (full quality, keeps transparency; best for art) or JPEG (smaller, with a quality slider), at full or half size, through the phone's share sheet or as a download.
- **Share → Time-lapse:** the studio quietly records a small frame after each change. Turn this off in ⋯ if you like. **Make video** plays them back as an MP4 (or WebM where MP4 isn't available): a **30-second** short made for sharing, or the **full** replay. The video records in real time, so a 30-second video takes about 30 seconds to make.
- **Learn as you go:** a short guide the first time you paint (⋯ → Show the guide again), and a tip the first time you use live watercolour, smudge, symmetry, the fill bucket or layers. There's also a nudge towards QuickShape if you haven't found it yet.

**Glow** (the second mode in the gallery) is painting with light, made from Drift's Glow:
- The light stays (or fades, if you like), and **Freeze** holds it still.
- Rainbow or one colour, size and brightness sliders, **Swirl** and **Flow**.
- Symmetry and kaleidoscope around the middle of the screen, for neon mandalas.
- Six night skies.
- A tap opens a flower of light; hold still and light gathers into a glowing whirl.
- Undo and clear.
- Save as PNG/JPEG at screen size with the bloom, or **Keep in gallery** to carry on painting over it with brushes and layers.

After version 1: clipping masks, adjustments (HSB, gradient map, blur), liquify, perspective guides, text, and selection and transform.

Research, design rules, task ideas and the roadmap are in [docs/research-and-strategy.md](docs/research-and-strategy.md).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. A mouse works as a finger.

### Try it on your phone (same Wi-Fi)

```bash
npm run dev:phone
```

Vite prints a `Network:` address, such as `http://192.168.0.212:5173`. Open it in Chrome on your phone. The first tap goes full screen and starts the sound.

**Phone can't connect?** Windows blocks incoming connections on networks marked *Public*.
- When Windows asks, allow Node.js (tick the network type you're on).
- Or set your Wi-Fi to *Private* in Settings → Network & internet → Wi-Fi → your network.

The keep-screen-awake lock needs HTTPS, so over plain Wi-Fi the screen may dim if you only watch. The Android app wrapper will fix this.

### Live on GitHub Pages

Every push to `main` builds the app and publishes it with [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

- **One-time setup:** on GitHub, go to the repo's **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
- **Live URL:** https://vinayak-sutar.github.io/cozy-mobile-game/
- **Get latest version:** the Home screen has a button that shows the running build (commit and time).
  - It checks `version.json` on the server, bypassing caches, and reloads from a fresh URL when a newer build is out, so you never need to clear the browser cache.
  - It also checks quietly when the app opens or returns to the foreground, and lights up when an update is ready.

### Useful URL flags

- `?debug=1` shows FPS, quality tier and buffer sizes, and exposes `window.drift` in the console.
- `?quality=low|medium|high` pins a quality tier for testing, overriding the Graphics setting.

## How it's built

Vite + TypeScript + WebGL. There's no UI framework. Fonts are bundled through `@fontsource`, so it works offline.

```
src/
  main.ts               start-up and wiring
  app/                  router (home → toy box → toy), stage (runs the active toy), prefs, storage, idle "ghost finger"
  engine/               WebGL helpers, fluid solver, glow/light-ray effects, quality governor, frame loop
  input/pointers.ts     multi-touch tracking
  feel/                 generated audio (music + effects buses, no sound files) and haptics
  toys/                 Glow, Paint, Paint with Brush, Pond, the shared paper renderer, brush definitions
  ui/                   screens, settings and pause sheets, brush toolbar, themes, icons
  styles/themes.css     the four themes as design tokens
  studio/               Drift Studio (studio/index.html): gallery, editor, brush engine, layers, colour, export
```

To add a new section:
1. Extend `Toy` in `src/toys/Toy.ts`, giving it fluid settings, a sound theme, a `render()` and any extras. `mountUi()` lets it add its own controls, and `pauseActions()` adds buttons to the pause menu.
2. Add a card to `SECTIONS` in `src/ui/screens/toybox.ts`.
3. Register the toy in `src/main.ts`.

The fluid solver is adapted from Pavel Dobryakov's MIT-licensed WebGL Fluid Simulation. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
