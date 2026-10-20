# Drift: research and strategy

Drift is a calm, touch-reactive fluid toy box for all ages. This note collects what the research says about this kind of app. It also records the decisions already made and the roadmap after the prototype.

## Decisions so far

| Question | Decision |
|---|---|
| Format | **Toy box**: several toys, no levels, no failing |
| Audience | **Everyone, all ages**. It's positioned as a sensory toy, not as a kids' app. |
| Visual mood | Three toys, one per mood: **Glow** (neon ink in the dark), **Paint** (pastel watercolor), **Pond** (magic night garden) |
| First build | A playable prototype that runs in the phone's browser |
| Tech | Vite + TypeScript + WebGL, with no React or Next.js. Wrapped later with Capacitor for the app stores. |
| New features | **Every new idea becomes its own section card** in the Toy box. Existing sections stay as they are (e.g. "Paint with Brush" sits beside "Paint"). |
| UI | A game-style shell: Home with Play, Toy box, Settings, and a hold-to-pause menu. Four themes, all choosable: Moonlit lullaby (default), Cotton candy clay, Storybook meadow, Dusk origami. |

## Task and purpose ideas (to choose from later)

Each would be its own section. All are cozy: no timers, no failing, and progress saves into a collection album.

| Idea | How it plays | Reward | Effort |
|---|---|---|---|
| **Water the Garden** (built: v2) | Choose seeds and pots from a tray and plant them in a 6-spot bed. Hold the cloud to rain on them; swirling makes wind that blows the rain. Plants grow seed → sprout → bud → bloom. | Flower album (8 species); a garden that stays | M |
| **Feed the Koi** (built: v1) | Tap to sprinkle food from a slowly refilling pouch; it drifts on the current. Raise one baby at a time (6 + 8 pellets), while the grown-ups you raised compete for the food until they're full. Tapping right on a koi startles it. | Koi book (8 varieties) | M–L |
| **Lantern Lights** (built: v1, parked) | Touch a lotus to scoop its light, then draw a ribbon of it into the lantern of the same colour; buoyancy carries the light up. A probe reads each lantern, and the light is un-mixed into pink/teal/gold amounts so only the matching colour fills it. Lit lanterns rise into a constellation. | Sky book (6 constellations) | M |
| **Little Painter** (built: v1) | Pip asks for a colour. Mix red, yellow and blue in Pip's dish. A GPU probe reads the dish, and the paint is un-mixed back into red/yellow/blue amounts to compare proportions with the wish. | Colour book (12 colours); teaches colour mixing | S–M |
| **Paper Boats** (built: v2, 5 maps) | One boat at a time: a passenger's bubble shows a picture of where they want to go (house, tree or tent), and that pier glows. Swipe to make currents; the boat follows the water through the CPU wind-field readback. Wrong pier: a head shake. | Boat log (8 passengers) | M |
| **Hidden Picture** (built: v1) | A fogged-up window: wipe the fog (fluid dye) to reveal one of 8 drawn pictures. A probe grid measures how much is clear; drops trickle and clear trails. | Picture book (8 pictures); great for toddlers | S |
| **Cloud Shepherd** | Push clouds over thirsty fields to make rain and rainbows. | Seasons and scenes | M |

Every one of these needs the same shared pieces:
- A small GPU "probe" that reads fluid density, colour or velocity at a few points via a tiny framebuffer and `readPixels`.
- Goal markers with soft progress rings.
- A completion celebration.
- A persistent collection album.

Built so far: **Water the Garden**.
- v1 poured one heavy stream. It felt like a watering can and filled the screen like a small container.
- v2 is a zoomed-out open scene with gentle rain. Raindrops are drawn particles, and the fluid is the air: a coarse wind map is read back from the GPU so swirling blows the rain.
- You plant what you like, and the garden persists.

Then **Little Painter**.
- Matching compares the paint *proportions* found by un-mixing, with a generous range for how much paint is used. Over-painting doesn't punish a child, but tints like pink still need "just a little".

Then **Hidden Picture**, as a foggy window that you wipe.

Then **Lantern Lights**.
- At first the flowers' steady light was meant to be wafted into the lanterns. It couldn't be balanced: the rising plumes curled over and filled nearby lanterns on their own, while far ones were very hard to reach.
- Now you scoop light from a flower with your finger and carry it. The steady glow is faint and stays below the fill threshold, so no lantern lights without you.
- Pink and gold point almost the same way in RGB, so matching un-mixes the light into the three lotus colours instead of comparing directions.
- The idle ghost finger is off here (it would light lanterns for you). A gentle mote of light shows the move instead.

Feedback: Lantern Lights felt confusing, so it's **parked**. The card is hidden and `?lab=1` shows it again. Little Painter is the favourite so far, and it's worth making richer later (more colours, harder wishes, more fun).

Then **Paper Boats**, designed to be obvious at a glance after that lesson:
- A character asks for one thing, as a picture (not a colour code), and the goal pier glows.
- The control is direct and physical: push the water and the boat goes with it. Floating leaves make the current visible.
- No ghost finger (it would steer for you). A drawn finger shows the swipe after a few idle seconds, or right away on the very first trip.
- A good swipe moves the boat about a third of the pond, so a trip takes a few swipes and a bit of steering.

The user loved Paper Boats and asked for bigger maps and more of them, each with its own feel and a twist. That became **Paper Boats v2**:
- **Scrolling world.** Each map is a few screens big, and the camera follows the boat (with a little look-ahead). The fluid still only covers the screen: as the camera moves, the velocity, dye and pressure fields shift by whole texels (`FluidSim.shift`), so the water stays put under the world without blurring. An arrow at the screen edge points to an off-screen pier.
- **Maps are data** (`src/toys/boats/maps.ts`): water shapes (rounded rects, circles, a river path), islands, piers, a water palette, ground style, sound and a twist. A signed distance to the shore handles collisions for boats, leaves and ice. The scenery (land, piers, trees, reeds) is painted once per map, and a small blurred water mask gives the shader its shallows.
- **Twists** (`src/toys/boats/twists.ts`), all added on the CPU on top of the stirred water:
  - **River:** a current along the path, fastest mid-stream.
  - **Wind:** gusts from a random direction, with streaks and a wind sound.
  - **Ice:** floes that follow the water and collide.
  - **Whirlpools:** a swirl field drawn as glowing spiral arms.
- **Progression:** carry 3 passengers on a map to open the next one. A "new place" banner appears and the map button gets a dot. The Places list shows locks and progress dots.
- **Results:** a test player docked every trip on every map in 2–6 aimed swipes. The river and the lagoon take the most work.

Then **passenger chatter**, to give the passengers personality.
- Game writers call these short lines "barks": a line that answers something the player just did. Good barks give feedback and show who is talking; repetition and generic "skeleton talk" make players tune out. ([How to write video game barks](https://howtowriteagame.substack.com/p/how-to-write-video-game-barks), [Adding life to worlds with dialogue barks](https://gamedeveloper.com/design/adding-life-to-worlds-with-dialogue-barks), [More character in your NPCs](https://pausebutton.substack.com/p/how-to-put-more-character-into-your))
- Animal Crossing gives each villager a personality type and a catchphrase tied to species and personality ([TV Tropes: villager types](https://www.tvtropes.org/pmwiki/pmwiki.php/Characters/AnimalCrossingVillagerTypes), [Nookipedia: Moe](https://www.nookipedia.com/wiki/Moe)). Its "Animalese" voice plays one short sound per letter, higher when happy and lower when cross ([Nookipedia: Animalese](https://nookipedia.com/wiki/Animalese)).
- Built:
  - **Cast:** each passenger has a name, a trait, a catchphrase-ish voice and a babble pitch (`src/toys/boats/dialogue.ts`).
  - **Lines:** written for board (introducing themselves on a first ride), tap, waiting, going fast, bump, wrong pier, each map's twist, and arrival. Arrival lines come from the passenger or from the place.
  - **Rules:** lines have priorities and small remarks have a cooldown, so nobody chatters, and the same line never comes twice in a row.
  - **Bubbles:** the speech bubble fills in letter by letter with a synthesized babble blip on every other letter.

Then **Feed the Koi**, built the Paper Boats way: a clear "someone wants something" (a baby koi with a hunger bubble and growth dots) and a direct control (tap to drop food, swipe to move it).
- The twist comes from the pond itself. Every koi you raise stays in the pond and competes for food, so the game gets busier as you collect.
- Strategies grow out of that: fill the grown-ups up first, toss food far away to distract them, or swirl food over to the baby. A tap right on top of a fish startles it, which teaches a gentle touch.
- Koi are drawn top-down along a bendy spine (head to tail), with per-variety patterns seeded per fish, so every Kohaku's spots differ.
- It reuses the Paper Boats water shader, shore painter and collision code (now a shared `WaterScene`), with a new garden ground style: moss, stones, maples, azaleas and stone lanterns.

## Round 3: fewer, deeper games
Feedback: Koi and Lantern Lights didn't land, and Pond's idea wasn't clear (all three are parked; `?lab=1` shows them). Water the Garden should become a real incremental game. Paper Boats should be one open world built like a taxi game. And there's a new idea: a penguin you move around. Plan, in order:

1. **Penguin Island** (built: v1). A top-down snowy island; drag to waddle, flick to belly-glide. Terrain changes the glide (ice slippery, powder slow, a slope speeds you up), and the camera follows. Rescue 6 lost chicks who follow in a line, collect fish and shiny pebbles, help three islanders, and buy hats. It borrows from Paper Boats: the island shape is a `WaterScene` of overlapping land circles, and it reuses the sea shader, the camera with fluid `shift`, and the speech bubbles with babble voices.
2. **Water the Garden as an incremental garden.** Petals from blooms, a shop (seeds, plots, helpers like a sprinkler, bees and a gnome), prices at `base × 1.15^owned`, growth while away with a welcome-back summary, and real-time stages that leave breathers. Based on *My Tiny Garden*, *Herb Garden*, *Tiny Desk Pot* and [The Math of Idle Games](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i).
3. **Paper Boats as an open-world water taxi**, at a cozy pace.
   - **The loop:** fares wait around one big world (the five maps become regions), and you learn the destination after pickup. You get a distance fare plus a speed tip (a fading happy face, no fail), skill tips and a streak bonus.
   - **Progress:** upgrades open regions, and regulars have request chains.
   - **Based on:** *Crazy Taxi* ([manual](https://segaretro.org/images/6/67/CrazyTaxi_DC_US_DigitalManual.pdf)), *Easy Delivery Co.* and *Sail Forth* reviews.

Next: test Penguin Island on a phone, then the incremental garden.

## Drift Studio: a painting app at its own address
A separate page (`studio/`) with only **Paint** and **Glow**, taken as far as a real artist needs. It's built in four milestones:

1. **Foundation** (built):
   - Gallery with autosave, crash recovery and 5 versions.
   - New-painting sizes and paper; zoom, pan and rotate.
   - Layers with blend modes and alpha lock; undo and redo with gestures.
   - A dab brush engine (tip + grain, pressure, tilt, speed, StreamLine, taper) with 17 brushes, plus smudge and eraser.
   - Colour panel and eyedropper; PNG/JPEG export and share.
2. **Make it yours** (built):
   - 30 brushes, including oil paint and a palette knife that mix with the paint already there.
   - The brush editor (about 30 settings, live sample) and *My brushes*.
   - Symmetry: mirror, four ways, radial and kaleidoscope, with a movable centre.
   - QuickShape (line, arc, circle, ellipse, rectangle, triangle, polygon) and predictive stroke.
   - Fill bucket with tolerance and line-art mode; a reference window.
3. **Alive** (built):
   - Live watercolour on our fluid solver: five wet brushes; it freezes, drips, re-wets and dries.
   - The Glow studio: light that stays, freeze, symmetry, skies, blooms, undo, export and keep in gallery.
4. **Share** (built):
   - Time-lapse: frames recorded while painting, made into a video, full or 30 s.
   - The first-painting guide and one-time tips.
   - A performance and memory pass.

**What sets it apart, from reviews of Procreate, Fresco, Infinite Painter, ibisPaint, Sketchbook and Kleki:**
- Paint that really flows.
- Work is never lost.
- Nothing is behind a paywall, exports are full resolution with no watermark.
- Help is built in.

**Notes from building milestone 1:**
- **Wet paint (oil, palette knife)** uses the same carried-paint idea as smudge, plus a refill with the brush colour. It only picks up real paint, not empty canvas, so it stays opaque on a bare layer.
- **QuickShape** fits a line, then a circle or ellipse (from the point cloud's main axes) against corners found by Ramer–Douglas–Peucker. A four-cornered shape with near-right angles becomes a true rectangle. Predictive stroke is a Gaussian smoothing along the line, mirrored at the ends so they stay put.
- **Live watercolour:**
  - A `FluidSim` on its own WebGL canvas, shaped like the painting (up to 1024 px on the short side). Pigment is stored as Beer–Lambert absorption, so washes multiply.
  - It is shown, and dried, through *colour-to-alpha*: the most-absorbed channel sets the opacity. That way the dried paint is an ordinary transparent layer that looks the same over white paper.
  - Re-wetting runs the same conversion backwards.
  - The fluid is tuned calm (low curl, quick to settle), so it reads as watercolour, not ink in water.
- **Glow studio:**
  - With the light no longer fading, faint light drifting everywhere fogged the sky. A small pass fades only the faintest light each frame, and the bloom is tighter than the toy's.
  - Symmetry copies share the brightness (1/√copies), so a mandala isn't many times brighter than one stroke.
- **Time-lapse:**
  - Frames are 720 px JPEGs saved in IndexedDB (a `frames` store, database version 2), at most one every 0.7 s and never mid-stroke. Very long paintings keep every second or fourth change.
  - The video uses `MediaRecorder` on a 720 px canvas, staying under the known Android bug with large canvases. It records MP4/H.264 where Chrome supports it (Chrome 126+), otherwise WebM.
  - Frames are pushed with `requestFrame()` on every tick. A canvas that doesn't change sends no frames, which had cut the held ending short.
- **Performance and memory:**
  - The layers above the active one are cached as one canvas, but only when memory has room for it.
  - The layer limit reserves room for the four working canvases.
  - Watercolour and Glow undo snapshots (whole-page GPU buffers, up to ~18 MB each) are limited by the phone's memory: 3, 5 or 8.
  - Frozen watercolour and Glow stop redrawing until something changes.
- **Smudge** carries a "loaded" brush. It lays its paint down and picks up what it passes over, both measured per distance moved, so smears fade naturally instead of dragging one colour forever.
- **Export:** PNG is the default because it's lossless and keeps transparency. JPEG is offered for quick sharing.
- **Memory:** canvas size and layer count are capped by a memory budget, since iOS caps a canvas at about 16.7 MP.

## What the market shows

**Fluid Simulation** (Pavel Dobryakov) is the closest match to this idea.
- It started as an MIT-licensed web demo with about 16.7k GitHub stars.
- On the App Store it's rated 4.9★ from about 90K ratings and listed for ages 4+.
- It's free, with one main upgrade at about $3.69 (plus larger supporter tiers).
- Reviews keep praising how calming it is and how generous the free version is.
- The complaints are paywalled settings and ads on the "randomize" button.
- People ask for seasonal presets and stickers.
- **Lesson:** people clearly want this core experience, and a generous free tier is good for the app's reputation.

**Pok Pok** won a 2021 Apple Design Award in the Delight & Fun category.
- Its toys have no winning or losing, no levels, no menus and no text. They support multi-touch and use only 11 colors.
- Sounds are soft and hand-recorded, and animations are slow.
- A new toy or event ships every 4–6 weeks.
- Its rule: if a child gets stuck, that's the designers' mistake.
- **Lesson:** calm comes from restraint (a few colors, soft sound, no instructions), and regular new toys bring people back.

**"Antistress" fidget apps** (one claims 100M+ downloads):
- Each app is a big menu of small tactile toys (pop-its, slime, bubble wrap) with no timers or scores.
- **Lesson:** the "satisfying" loop of touch, then instant sound, vibration and a visual response, is the hook.

**Silk** (weavesilk), interactive generative art:
- Apple featured it in 120+ countries, with the pitch that anyone can feel like an artist.
- **Lesson:** make the user feel talented on their first stroke.

**Talking Tom** (Outfit7):
- A character that reacts to you, plus ads, coin packs and a $14.99 "Remove Ads" purchase.
- **Lesson:** attachment to a character drives retention. A fluid "companion" creature is a strong later addition.

**Finch** (self-care pet):
- Uses widgets and gentle timed "adventures" so people return without nagging.
- **Lesson:** give people something gentle to look forward to, and never punish a missed day.

## Design rules we follow

1. Something beautiful happens on the first touch, with no tutorial or text.
2. Nothing can go wrong: no failing, no timers, no score.
3. Multi-touch: each finger gets its own color.
4. It never looks dead: gentle movement when idle, and a ghost finger that invites you to touch.
5. Sound and touch you can feel: pentatonic notes (no wrong notes), a soft background sound, light vibration.
6. Kid-proof exit: hold the home button to leave.
7. Calm limits: small palettes and slow, eased motion.

## Compliance notes (read before adding ads)

- **Google Play Families:**
  - If the store listing or graphics look aimed at children, Google may treat the app as a kids' app.
  - Mixed-audience apps need a **neutral age screen**.
  - Children may only see ads from **Families self-certified ad SDKs**, with no personalized ads and no remarketing.
- **Apple Kids category:**
  - A **parental gate** is required before purchases or outside links.
  - Third-party ads and analytics are tightly limited.
  - We are *not* planning to list in the Kids category.
- **Apple guideline 4.2 (minimum functionality):**
  - Apple rejects apps that are basically a website in a box.
  - The app must work fully offline and use native features such as haptics, notifications and saving to Photos.

## Roadmap

1. **Prototype (now):** three toys, generated sound, vibration, auto quality, home screen.
2. **Android app:**
   - Wrap with Capacitor, with all files bundled for offline use.
   - Add native haptics, keep-awake, an icon and a splash screen.
   - Test on a cheap phone.
3. **Retention:**
   - A new toy every 4–6 weeks (bubbles, sand, aurora, rain on a window, lava lamp).
   - A daily "gift" color palette.
   - Save a moment as a wallpaper.
   - A bedtime mode with a sleep timer.
   - Seasonal themes.
   - Later, a fluid companion creature.
4. **Monetization:**
   - A neutral age screen on first launch.
   - **Rewarded ads only** ("try this premium toy today"), never interrupting play.
   - One-time purchases: "Unlock everything" (about ₹149–299 / $3–5) and "Remove ads".
   - A parental gate before any purchase.
   - AdMob (with child-directed treatment for users under 13) and RevenueCat.
5. **iOS:**
   - Needs a Mac or a cloud build service.
   - Check guideline 4.2 before submitting.

## Sources

- [Fluid Simulation on the App Store](https://apps.apple.com/app/id1443124993)
- [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)
- [Sketch: how Pok Pok designs its playroom](https://sketch.com/blog/pok-pok)
- [Pok Pok on the App Store](https://apps.apple.com/us/app/pok-pok-montessori-preschool/id1550204730)
- [GamesBeat: Pok Pok Playroom and open-ended play](https://gamesbeat.com/pok-pok-playroom-mobile-app-lets-kids-engage-in-open-ended-play/)
- [Apple Design Awards 2021](https://apple.com/au/newsroom/2021/06/apple-announces-winners-of-the-2021-apple-design-awards)
- [Clubic: Antistress - Relaxing games](https://www.clubic.com/telecharger-fiche441708-antistress-relaxing-games.html)
- [Silk 2 on the App Store](https://apps.apple.com/us/app/silk-2-generative-art/id1050339928)
- [YourStory: how Talking Tom became a billion-dollar empire](https://yourstory.com/2025/03/talking-tom-success-story)
- [My Talking Tom 2 on the App Store](https://apps.apple.com/app/1337578317)
- [Deconstructor of Fun: Finch's retention widgets](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl)
- [Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Families Self-Certified Ads SDK Policy](https://support.google.com/googleplay/android-developer/answer/12918983)
- [TechCrunch: Apple revises kids' app rules (2019)](https://techcrunch.com/2019/09/12/apple-tweaks-app-store-rule-changes-for-childrens-apps-and-sign-in-services/)
- [Ionic forum: Apple 4.2 minimum functionality](https://forum.ionicframework.com/t/apple-4-2-minimum-functionality/189688)
- [MobiLoud: App Store guidelines for webview apps](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
- [RevenueCat Capacitor docs](https://revenuecat.com/docs/getting-started/installation/capacitor)
- [Capgo AdMob plugin docs](https://capgo.app/docs/plugins/admob/getting-started)
