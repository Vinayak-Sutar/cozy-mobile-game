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
| **Water the Garden** | A spring pours water from the top. Swirl to steer the stream onto dry seeds. Each seed fills a ring and blooms. | Herbarium album; new garden scenes | M |
| **Feed the Koi** | Food drifts on the current. Swirl it to hungry koi, which grow and change patterns. | Koi collection | M–L |
| **Lantern Lights** | Guide matching coloured light into floating lanterns. Lit lanterns rise into a constellation. | Constellation album | M |
| **Little Painter** | A creature asks for a colour. Mix pigments on its dish until the meter fills. | Stickers; teaches colour mixing | S–M |
| **Paper Boats** | Make currents to steer boats to the matching dock. Missed boats drift back. | Passengers and boat designs | M |
| **Hidden Picture** | Swirl water to wash away mist and reveal a picture. | Picture album; great for toddlers | S |
| **Cloud Shepherd** | Push clouds over thirsty fields to make rain and rainbows. | Seasons and scenes | M |

Every one of these needs the same shared pieces:
- A small GPU "probe" that reads fluid density, colour or velocity at a few points via a tiny framebuffer and `readPixels`.
- Goal markers with soft progress rings.
- A completion celebration.
- A persistent collection album.

Suggested first: **Water the Garden**, then **Little Painter**.

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
