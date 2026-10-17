# Drift

A calm, touch-reactive fluid toy box for all ages. Move your fingers and the screen answers with swirling light, paint and water. There are no levels, no score, and no way to fail.

The app opens on a **Home** screen whose background is live fluid, so you can swirl it. **Play** opens the **Toy box**, and every idea gets its own section card there:

| Section | What it does |
|---|---|
| **Glow** | Neon ink swirls in a dark room. Each finger gets its own colour. |
| **Paint** | Pastel watercolour on cream paper. Colours really mix: blue + yellow makes green. |
| **Paint with Brush** | The same paper, but you pick from six brushes (Soft round, Ink pen, Big wash, Splatter, Water, Lift), three sizes, 14 paints, and how wet the paper is (Dry / Damp / Wet). It also has undo (5 steps) and Clean paper. Paint stays put so you can make a picture. |
| **Pond** | A night pond. Lift your finger to bloom a lily, and fireflies follow your touch. |

- **In a toy:** hold the pause button (top-left) to open the pause menu: Keep playing, Clean paper, Settings, Toy box, Home. Holding instead of tapping keeps little hands from leaving by accident.
- **Settings:**
  - Separate Music and Sounds volumes, and Vibration.
  - **Four themes**: Moonlit lullaby, Cotton candy clay, Storybook meadow, Dusk origami.
  - Graphics: Battery saver, Auto or Best. Battery saver swaps the live menu background for a still illustration.

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
```

To add a new section:
1. Extend `Toy` in `src/toys/Toy.ts`, giving it fluid settings, a sound theme, a `render()` and any extras. `mountUi()` lets it add its own controls, and `pauseActions()` adds buttons to the pause menu.
2. Add a card to `SECTIONS` in `src/ui/screens/toybox.ts`.
3. Register the toy in `src/main.ts`.

The fluid solver is adapted from Pavel Dobryakov's MIT-licensed WebGL Fluid Simulation. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
