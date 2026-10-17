import type { PlaceId } from './landmarks';
import type { Twist } from './maps';

/**
 * What the passengers say. Short "barks": each one answers something that
 * just happened (getting on, a bump, the wrong pier, arriving) in that
 * character's own voice, so they feel like someone rather than a prop.
 * {place} is where they want to go ("the lighthouse"); {Place} starts a sentence.
 */
export type Moment = 'board' | 'arrive' | 'tap' | 'idle' | 'fast' | 'bump' | 'wrong' | 'twist';

/** How a line sounds: happy lines go up in pitch, cross ones down. */
export type Mood = 'happy' | 'calm' | 'cross';

export interface Personality {
  name: string;
  /** One or two words, shown in the boat log. */
  trait: string;
  /** Base pitch of their babble voice (MIDI). */
  voice: number;
  lines: Record<Exclude<Moment, 'twist'>, string[]>;
  twist: Record<Exclude<Twist, 'calm'>, string>;
}

export const PERSONALITIES: Record<string, Personality> = {
  frog: {
    name: 'Hoppy',
    trait: 'Loves a pun',
    voice: 55,
    lines: {
      board: ['To {place}, please! Hop to it!', "{Place}! I'm feeling ribbit-ing!", 'Next stop: {place}. Toad-ally!'],
      arrive: ['That was un-frog-ettable!', 'Hop-py landing! Thanks!', "You're toad-ally the best captain!"],
      tap: ['Ribbit!', "What's a frog's favourite drink? Croak-a-cola!", 'Why so jumpy? Ha!'],
      idle: ['I could hop there, you know.', 'Are we there yet? Just kidding. Are we?'],
      fast: ['Wheee! Faster than a fly!', 'Hold on to your lily pads!'],
      bump: ['Bonk! Toad-ally fine!', 'Oof! Bumpy!'],
      wrong: ['Wrong lily pad! {Place}!', 'Nope! {Place}, remember?'],
    },
    twist: {
      river: "Go with the flow! It's ribbit-ing!",
      wind: "Whoosh! I'm a flying frog!",
      ice: "Brrr! I'm a frog, not a popsicle!",
      whirlpool: 'Round and round! I feel hop-sy turvy!',
    },
  },
  duckling: {
    name: 'Puddle',
    trait: 'Very excited',
    voice: 74,
    lines: {
      board: ['Boat ride! Boat ride! To {place}!', "{Place}! {Place}! Let's go!", 'Quack! I mean... {place}, please!'],
      arrive: ['AGAIN! Can we go again?!', 'Best. Ride. EVER! Quack-tastic!', "I'm telling my whole family!"],
      tap: ['Hi hi hi!', 'Quack!', 'Boop!'],
      idle: ['Are we there yet? Are we? Are we?', 'Swish the water! Swish it!'],
      fast: ['WHEEEE!', 'Faster! FASTER!'],
      bump: ['Boing! Hehe!', 'Bump! Do it again!'],
      wrong: ["This isn't {place}, silly!", 'Not here! {Place}!'],
    },
    twist: {
      river: 'The river is giving us a piggyback!',
      wind: "Wind! I'm flying! I'm a real duck!",
      ice: 'Ice! Can we go skating?',
      whirlpool: 'Spinny water! Wheee!',
    },
  },
  bunny: {
    name: 'Clover',
    trait: 'Shy and sweet',
    voice: 67,
    lines: {
      board: ['Um, hello... could you take me to {place}?', "Sorry to bother you... {place}, please?", "Hi! {Place}, if that's okay?"],
      arrive: ['Th-thank you... that was lovely.', "You're very kind. Thank you!", "I wasn't scared at all! ...Maybe a little."],
      tap: ['Oh! Hello...', 'Eep! Hi!', '*wiggles ears*'],
      idle: ['Um... no rush. Really.', 'Maybe a little swish?'],
      fast: ['Eek! Too fast!', 'My ears! My ears!'],
      bump: ["Ow... I'm okay!", 'Oops! Sorry, rock.'],
      wrong: ['Um... I think it was {place}?', "Sorry, it's {place}..."],
    },
    twist: {
      river: "The river's so strong... hold on tight!",
      wind: 'My ears are flapping in the wind!',
      ice: 'Careful of the ice... please?',
      whirlpool: "I'm getting a little dizzy...",
    },
  },
  kitten: {
    name: 'Miso',
    trait: 'Hates getting wet',
    voice: 64,
    lines: {
      board: ['{Place}. And keep me dry.', 'Water? Ugh. Fine. {Place}.', "{Place}. I'm very important."],
      arrive: ['Not one wet paw. Impressive.', "Fine. That was fun. Don't tell anyone.", 'Purr-fect. You may go now.'],
      tap: ["Don't rock the boat.", 'Mrow?', 'I was napping.'],
      idle: ["I'm waiting...", 'Any time now. Purr-haps today?'],
      fast: ['Careful! My fur!', 'Too splashy! Too splashy!'],
      bump: ['Hey! Watch it!', 'Was that on purpose?'],
      wrong: ['Does this look like {place} to you?', 'Wrong. {Place}.'],
    },
    twist: {
      river: "This river is far too wet.",
      wind: 'My whiskers! The wind!',
      ice: 'Ice? Cold AND wet? Wonderful.',
      whirlpool: 'Stop the spinning. Now, please.',
    },
  },
  mouse: {
    name: 'Crumb',
    trait: 'Ever so polite',
    voice: 79,
    lines: {
      board: ['Good day! {Place}, if you please.', "{Place}, please. Gently! I'm very small.", 'Oh, a boat! To {place}, kindly.'],
      arrive: ['Thank you ever so much!', 'What a smooth ride! Well done!', "I shall write you a thank-you note!"],
      tap: ['Squeak! How do you do?', 'Oh! Hello there!', 'Charmed, I am sure.'],
      idle: ['A gentle swish, perhaps?', 'Pardon me, are we moving?'],
      fast: ['Goodness gracious!', 'Oh my whiskers!'],
      bump: ['Oh dear!', 'Mind the shore, please!'],
      wrong: ['Pardon me, I said {place}.', 'Not quite! {Place}, please.'],
    },
    twist: {
      river: 'Such a busy river! Do take care.',
      wind: "Hold me down, I'll blow away!",
      ice: 'Oh my, icebergs! Steer gently!',
      whirlpool: 'Oh dear, oh dear, round we go!',
    },
  },
  bear: {
    name: 'Bramble',
    trait: 'Sleepy and hungry',
    voice: 50,
    lines: {
      board: ['*yawn* ...{place}, please.', "Is there honey at {place}? Let's find out.", "To {place}. Wake me when we're there."],
      arrive: ['Thanks... *yawn* ...nap time.', 'That ride was sweet. Like honey.', 'Thank you! Now, snacks.'],
      tap: ['Hm? Are we there?', '*snore*... oh, hi!', 'Got any honey?'],
      idle: ['Zzz...', "This is a nice nap, actually."],
      fast: ['Woah... now I am awake.', 'My tummy feels wobbly.'],
      bump: ['Huh? What was that?', 'Bonk. Okay.'],
      wrong: ['Is this {place}? ...No.', "{Place} is somewhere else. I think."],
    },
    twist: {
      river: 'The river is doing the work. I like it.',
      wind: 'Breezy... good for napping.',
      ice: 'Ice. Too cold for a bear nap.',
      whirlpool: 'Whoa. Like stirring honey.',
    },
  },
  penguin: {
    name: 'Sir Waddles',
    trait: 'Very proper',
    voice: 58,
    lines: {
      board: ['{Place}, captain. Full steam ahead!', 'Splendid boat. To {place}, please.', 'One penguin to {place}. Chop chop!'],
      arrive: ['Jolly good sailing! Thank you!', 'Top marks, captain!', 'Splendid! I tip my hat to you.'],
      tap: ['Good day to you!', 'Ahem. Eyes on the water, captain.', 'Lovely weather for it!'],
      idle: ['The tide waits for no one, captain!', 'Shall we press on?'],
      fast: ['Tally-ho!', 'Now we are sailing!'],
      bump: ['Steady on!', 'I say!'],
      wrong: ['Wrong port, captain! {Place}!', 'Ahem. {Place}, if you please.'],
    },
    twist: {
      river: 'A brisk current! Most invigorating.',
      wind: 'Batten down the hatches!',
      ice: 'Ah, ice! Just like home. Jolly good!',
      whirlpool: 'A whirlpool! How thrilling!',
    },
  },
  fox: {
    name: 'Rusty',
    trait: 'A bit of a show-off',
    voice: 62,
    lines: {
      board: ["{Place}. I could swim, but this is classier.", 'To {place}! Try to keep up.', 'Ahoy! {Place}, and make it snappy.'],
      arrive: ["Not bad! I'd have been faster, though.", "Easy-peasy! Nice steering.", "You're almost as clever as me!"],
      tap: ['Wanna race?', 'Ha! You found me.', 'Psst. I know a shortcut.'],
      idle: ['Need a hint? Push the water!', "I'm getting old here."],
      fast: ['Now THIS is speed!', 'Woo-hoo! Easy-peasy!'],
      bump: ['Smooth. Very smooth.', 'I meant to do that.'],
      wrong: ['Nice try. {Place}!', 'Lost? {Place} is the other way.'],
    },
    twist: {
      river: 'Ride the current. Classic fox move.',
      wind: 'Use the wind! Trust me.',
      ice: 'Bump the ice out of the way. Easy-peasy.',
      whirlpool: 'Slingshot round it! Like a pro!',
    },
  },
};

/** How each place is said in a sentence. */
export const PLACE_NAMES: Record<PlaceId, string> = {
  house: 'the little house',
  tree: 'the big tree',
  tent: 'the tent',
  mill: 'the old mill',
  picnic: 'the picnic',
  barn: 'the red barn',
  hut: 'the beach hut',
  lighthouse: 'the lighthouse',
  icecream: 'the ice cream cart',
  igloo: 'the igloo',
  snowman: 'the snowman',
  cabin: 'the log cabin',
  lamp: 'the lamp post',
  treehouse: 'the treehouse',
  observatory: 'the star tower',
};

/** Something anyone might say on arriving somewhere. */
export const PLACE_LINES: Record<PlaceId, string[]> = {
  house: ['Home sweet home!', 'Just in time for tea!'],
  tree: ['Perfect spot for a nap!', "I'm going to climb it. Maybe."],
  tent: ['Camping time!', 'Marshmallows, here I come!'],
  mill: ['Splish, splash, goes the wheel!', 'Fresh bread smells! Yum!'],
  picnic: ['Picnic! Did anyone bring cake?', 'Save me a sandwich!'],
  barn: ['Hay there, barn!', 'Moo! Oh wait, I am not a cow.'],
  hut: ['Sand between my toes!', 'Beach day!'],
  lighthouse: ["I'll wave to the ships!", 'The light keeps boats safe. Like you!'],
  icecream: ['Two scoops, please!', 'Brain freeze, here I come!'],
  igloo: ['Cozy and cold. Perfect!', 'Brr-illiant!'],
  snowman: ["He's my best friend!", "I'll give him a new scarf."],
  cabin: ['Hot cocoa time!', 'Fireplace, here I come!'],
  lamp: ['So glowy!', "I'll read a story under the lamp."],
  treehouse: ['Secret club! Members only!', 'Up, up, up!'],
  observatory: ["I'm going to name a star!", "Let's look at the moon!"],
};

export const MOOD: Record<Moment, Mood> = {
  board: 'happy',
  arrive: 'happy',
  tap: 'happy',
  idle: 'calm',
  fast: 'happy',
  bump: 'cross',
  wrong: 'cross',
  twist: 'calm',
};

const lastLine = new Map<string, string>();

/** A line for a moment, never the same one twice in a row. */
export function lineFor(passenger: string, moment: Moment, place: PlaceId, twist: Twist): string {
  const who = PERSONALITIES[passenger] ?? PERSONALITIES.frog;
  let options: string[];
  if (moment === 'twist') options = twist === 'calm' ? who.lines.idle : [who.twist[twist]];
  else if (moment === 'arrive') options = [...who.lines.arrive, ...PLACE_LINES[place]];
  else options = who.lines[moment];
  const key = `${passenger}:${moment}`;
  const fresh = options.filter((o) => o !== lastLine.get(key));
  const pick = (fresh.length ? fresh : options)[Math.floor(Math.random() * (fresh.length || options.length))];
  lastLine.set(key, pick);
  const name = PLACE_NAMES[place];
  return pick.split('{place}').join(name).split('{Place}').join(name[0].toUpperCase() + name.slice(1));
}
