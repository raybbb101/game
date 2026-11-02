// All static game content: elements, personalities, species, items, photo requests, fairy tasks.
// Pure data — no DOM — so the node test tool can import it too.

export const ELEMENTS = {
  flame: { name: 'Flame', color: '#ff7a45', icon: '🔥' },
  tide: { name: 'Tide', color: '#3fa7ff', icon: '💧' },
  leaf: { name: 'Leaf', color: '#4cc96b', icon: '🌿' },
  spark: { name: 'Spark', color: '#ffd23f', icon: '⚡' },
  stone: { name: 'Stone', color: '#a68a6d', icon: '🪨' },
  wind: { name: 'Wind', color: '#8fe3e0', icon: '🌀' },
  dream: { name: 'Dream', color: '#b48cff', icon: '🌙' },
};

// attacker element -> elements it is strong against
export const STRONG_AGAINST = {
  flame: ['leaf', 'wind'],
  tide: ['flame', 'stone'],
  leaf: ['tide', 'stone'],
  spark: ['tide', 'wind'],
  stone: ['spark', 'flame'],
  wind: ['leaf', 'spark'],
  dream: ['dream'],
};

// How a monster reacts to people. `luck` = base chance it simply walks up and joins you.
export const PERSONALITIES = {
  friendly: {
    label: 'Friendly', emoji: '😊', luck: 0.16,
    desc: 'Loves humans. A nice chat is all it takes.',
  },
  curious: {
    label: 'Curious', emoji: '🤩', luck: 0.08,
    desc: 'Wants to see something from your world. Snap it a photo!',
  },
  playful: {
    label: 'Playful', emoji: '😜', luck: 0.1,
    desc: 'Loves games. Win its little game and it will tag along.',
  },
  shy: {
    label: 'Shy', emoji: '🥺', luck: 0.05,
    desc: 'Nervous around people. A treat helps it open up.',
  },
  proud: {
    label: 'Proud', emoji: '😤', luck: 0.03,
    desc: 'Only respects strong humans. Show your strength.',
  },
  fierce: {
    label: 'Fierce', emoji: '😠', luck: 0.0,
    desc: 'Does not like humans. You will have to beat it.',
  },
};

export const RARITY = {
  common: { label: 'Common', weight: 60, xp: 20, color: '#9fb4c7' },
  uncommon: { label: 'Uncommon', weight: 28, xp: 35, color: '#5fd38d' },
  rare: { label: 'Rare', weight: 10, xp: 70, color: '#58a6ff' },
  legendary: { label: 'Legendary', weight: 2, xp: 150, color: '#ffb02e' },
};

// look: parameters for the procedural SVG art (see art.js)
// likes: tags used for chat answers and photo requests
export const SPECIES = [
  {
    id: 'sprigling', name: 'Sprigling', element: 'leaf', rarity: 'common',
    base: { hp: 44, atk: 10, def: 11, spd: 9 },
    personalities: { friendly: 4, curious: 3, shy: 2 },
    likes: ['green', 'greenery', 'sky', 'flower', 'fruit', 'sunny', 'calm'],
    blurb: 'A sprout that naps in sunbeams. It grows a new leaf every time it makes a friend.',
    look: { shape: 'round', main: '#7bd88f', accent: '#3f9e5a', belly: '#d9f7c8', top: 'sprout', eyes: 'big', extra: 'none' },
    moves: ['tackle', 'vine_whip', 'guard'],
  },
  {
    id: 'emberkit', name: 'Emberkit', element: 'flame', rarity: 'common',
    base: { hp: 40, atk: 13, def: 9, spd: 12 },
    personalities: { playful: 4, proud: 2, friendly: 2 },
    likes: ['red', 'orange', 'sunset', 'warm', 'food', 'games', 'brave'],
    blurb: 'A kitten made of campfire. Its tail flickers brighter when it is excited.',
    look: { shape: 'round', main: '#ff9a5a', accent: '#e8552d', belly: '#ffe0b8', top: 'cat', eyes: 'big', extra: 'flametail' },
    moves: ['scratch', 'ember', 'guard'],
  },
  {
    id: 'bubbloo', name: 'Bubbloo', element: 'tide', rarity: 'common',
    base: { hp: 48, atk: 10, def: 10, spd: 9 },
    personalities: { friendly: 5, curious: 3 },
    likes: ['blue', 'water', 'sky', 'calm', 'food', 'cute'],
    blurb: 'Blows bubbles when happy, which is almost always.',
    look: { shape: 'round', main: '#6cc4ff', accent: '#2f7fd6', belly: '#d8f1ff', top: 'fins', eyes: 'big', extra: 'bubbles' },
    moves: ['tackle', 'splash', 'guard'],
  },
  {
    id: 'zapple', name: 'Zapple', element: 'spark', rarity: 'common',
    base: { hp: 38, atk: 12, def: 8, spd: 14 },
    personalities: { playful: 4, curious: 3, friendly: 1 },
    likes: ['yellow', 'night', 'lights', 'games', 'fast', 'fruit'],
    blurb: 'An apple-sized bundle of static. Do not pet it with wool gloves.',
    look: { shape: 'round', main: '#ffe066', accent: '#f0a500', belly: '#fff6c9', top: 'bolts', eyes: 'sparkle', extra: 'none' },
    moves: ['tackle', 'zap', 'guard'],
  },
  {
    id: 'pebblet', name: 'Pebblet', element: 'stone', rarity: 'common',
    base: { hp: 52, atk: 10, def: 14, spd: 5 },
    personalities: { shy: 4, friendly: 3 },
    likes: ['grey', 'calm', 'greenery', 'sleep', 'cute'],
    blurb: 'Pretends to be an ordinary rock when strangers walk by. It is not very good at it.',
    look: { shape: 'lump', main: '#b8aea2', accent: '#7d7368', belly: '#e5dfd7', top: 'none', eyes: 'sleepy', extra: 'spots' },
    moves: ['tackle', 'pebble_toss', 'guard'],
  },
  {
    id: 'breezel', name: 'Breezel', element: 'wind', rarity: 'common',
    base: { hp: 40, atk: 11, def: 9, spd: 15 },
    personalities: { curious: 4, playful: 3 },
    likes: ['sky', 'white', 'blue', 'fast', 'adventure', 'flower'],
    blurb: 'Rides gusts between rooftops and collects lost kites.',
    look: { shape: 'pear', main: '#e9fbff', accent: '#7fd6dd', belly: '#ffffff', top: 'tuft', eyes: 'big', extra: 'wings' },
    moves: ['peck', 'gust', 'guard'],
  },
  {
    id: 'honeybop', name: 'Honeybop', element: 'leaf', rarity: 'common',
    base: { hp: 42, atk: 11, def: 10, spd: 11 },
    personalities: { friendly: 4, curious: 4 },
    likes: ['yellow', 'flower', 'food', 'sweet', 'sunny', 'cute'],
    blurb: 'A fuzzy little forager. Will follow anyone who smells like cake.',
    look: { shape: 'round', main: '#ffcb47', accent: '#5a3d1e', belly: '#fff0b3', top: 'antennae', eyes: 'big', extra: 'stripes' },
    moves: ['tackle', 'pollen_puff', 'guard'],
  },
  {
    id: 'mossling', name: 'Mossling', element: 'leaf', rarity: 'uncommon',
    base: { hp: 50, atk: 12, def: 13, spd: 7 },
    personalities: { shy: 4, curious: 3 },
    likes: ['green', 'greenery', 'calm', 'night', 'flower', 'rain'],
    blurb: 'Wears a mushroom cap as a hat. Glows faintly on rainy nights.',
    look: { shape: 'pear', main: '#9fd6a0', accent: '#d9534f', belly: '#eef9e8', top: 'mushroom', eyes: 'sleepy', extra: 'spots' },
    moves: ['tackle', 'spore_cloud', 'guard'],
  },
  {
    id: 'ripplefin', name: 'Ripplefin', element: 'tide', rarity: 'uncommon',
    base: { hp: 46, atk: 13, def: 11, spd: 12 },
    personalities: { curious: 4, shy: 2, playful: 2 },
    likes: ['blue', 'water', 'calm', 'sky', 'adventure', 'food'],
    blurb: 'Swims through puddles as if they were oceans. Very good at hide and seek.',
    look: { shape: 'long', main: '#4fb3d9', accent: '#1d6f9c', belly: '#c9efff', top: 'fins', eyes: 'big', extra: 'fintail' },
    moves: ['tackle', 'tidal_spin', 'guard'],
  },
  {
    id: 'voltabun', name: 'Voltabun', element: 'spark', rarity: 'uncommon',
    base: { hp: 44, atk: 14, def: 9, spd: 15 },
    personalities: { playful: 5, friendly: 2 },
    likes: ['yellow', 'pink', 'games', 'fast', 'sweet', 'lights'],
    blurb: 'Hops so fast it leaves little lightning footprints.',
    look: { shape: 'round', main: '#fff1a8', accent: '#ffb000', belly: '#ffffff', top: 'bunny', eyes: 'sparkle', extra: 'none' },
    moves: ['scratch', 'thunder_hop', 'guard'],
  },
  {
    id: 'frostnib', name: 'Frostnib', element: 'tide', rarity: 'uncommon',
    base: { hp: 46, atk: 12, def: 13, spd: 10 },
    personalities: { shy: 3, proud: 3 },
    likes: ['white', 'blue', 'calm', 'night', 'sweet'],
    blurb: 'Leaves frost flowers on windows. Melts a little when complimented.',
    look: { shape: 'round', main: '#eaf6ff', accent: '#7cb7e8', belly: '#ffffff', top: 'spikes', eyes: 'big', extra: 'none' },
    moves: ['tackle', 'frost_breath', 'guard'],
  },
  {
    id: 'cindermaw', name: 'Cindermaw', element: 'flame', rarity: 'rare',
    base: { hp: 54, atk: 17, def: 12, spd: 11 },
    personalities: { fierce: 5, proud: 3 },
    likes: ['red', 'brave', 'strong', 'warm', 'food'],
    blurb: 'Guards its territory with a roar like a furnace. Only bows to the strong.',
    look: { shape: 'lump', main: '#d9453b', accent: '#5b1a1a', belly: '#ffb27a', top: 'horns', eyes: 'fierce', extra: 'flametail' },
    moves: ['bite', 'inferno', 'roar'],
  },
  {
    id: 'granitusk', name: 'Granitusk', element: 'stone', rarity: 'rare',
    base: { hp: 62, atk: 15, def: 18, spd: 6 },
    personalities: { proud: 5, fierce: 3 },
    likes: ['grey', 'strong', 'brave', 'calm', 'greenery'],
    blurb: 'An old mountain spirit. It tests every traveller who crosses its path.',
    look: { shape: 'lump', main: '#8e8a86', accent: '#4d4945', belly: '#c9c3bb', top: 'horns', eyes: 'fierce', extra: 'spots' },
    moves: ['bite', 'rockslide', 'roar'],
  },
  {
    id: 'galecrest', name: 'Galecrest', element: 'wind', rarity: 'rare',
    base: { hp: 50, atk: 15, def: 11, spd: 18 },
    personalities: { proud: 4, curious: 2, fierce: 2 },
    likes: ['sky', 'blue', 'fast', 'adventure', 'brave'],
    blurb: 'Rules the rooftops. Its crest feathers point toward the next storm.',
    look: { shape: 'pear', main: '#7fd0e6', accent: '#2c6e8f', belly: '#e6fbff', top: 'crest', eyes: 'fierce', extra: 'wings' },
    moves: ['peck', 'cyclone', 'roar'],
  },
  {
    id: 'lumimoth', name: 'Lumimoth', element: 'dream', rarity: 'rare',
    base: { hp: 48, atk: 14, def: 12, spd: 14 },
    personalities: { friendly: 3, curious: 4, shy: 2 },
    likes: ['night', 'lights', 'purple', 'flower', 'calm', 'sweet'],
    blurb: 'Drawn to porch lights and kind hearts. Its wings show dreams you have forgotten.',
    look: { shape: 'pear', main: '#d7c2ff', accent: '#7a52d1', belly: '#f6efff', top: 'antennae', eyes: 'sparkle', extra: 'mothwings' },
    moves: ['tackle', 'dream_dust', 'guard'],
  },
  {
    id: 'nyxtail', name: 'Nyxtail', element: 'dream', rarity: 'legendary',
    base: { hp: 66, atk: 19, def: 16, spd: 16 },
    personalities: { proud: 4, fierce: 2, curious: 2 },
    likes: ['night', 'purple', 'lights', 'brave', 'strong', 'sky'],
    blurb: 'Said to sweep the stars across the sky with its tail. Few have seen it twice.',
    look: { shape: 'star', main: '#3b2d7a', accent: '#ffd76a', belly: '#6b58c9', top: 'crown', eyes: 'sparkle', extra: 'startail' },
    moves: ['bite', 'starfall', 'roar'],
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// kind: 'hit' (damage), 'guard' (halve next hit), 'buff' (raise attack)
export const MOVES = {
  tackle: { name: 'Tackle', element: null, power: 40, acc: 1, kind: 'hit' },
  scratch: { name: 'Scratch', element: null, power: 42, acc: 1, kind: 'hit' },
  peck: { name: 'Peck', element: null, power: 42, acc: 1, kind: 'hit' },
  bite: { name: 'Bite', element: null, power: 48, acc: 0.95, kind: 'hit' },
  guard: { name: 'Guard', element: null, power: 0, acc: 1, kind: 'guard' },
  roar: { name: 'Roar', element: null, power: 0, acc: 1, kind: 'buff' },
  vine_whip: { name: 'Vine Whip', element: 'leaf', power: 62, acc: 0.92, kind: 'hit' },
  ember: { name: 'Ember', element: 'flame', power: 62, acc: 0.92, kind: 'hit' },
  splash: { name: 'Splash Wave', element: 'tide', power: 62, acc: 0.92, kind: 'hit' },
  zap: { name: 'Zap', element: 'spark', power: 62, acc: 0.92, kind: 'hit' },
  pebble_toss: { name: 'Pebble Toss', element: 'stone', power: 62, acc: 0.92, kind: 'hit' },
  gust: { name: 'Gust', element: 'wind', power: 62, acc: 0.92, kind: 'hit' },
  pollen_puff: { name: 'Pollen Puff', element: 'leaf', power: 62, acc: 0.92, kind: 'hit' },
  spore_cloud: { name: 'Spore Cloud', element: 'leaf', power: 68, acc: 0.9, kind: 'hit' },
  tidal_spin: { name: 'Tidal Spin', element: 'tide', power: 68, acc: 0.9, kind: 'hit' },
  thunder_hop: { name: 'Thunder Hop', element: 'spark', power: 68, acc: 0.9, kind: 'hit' },
  frost_breath: { name: 'Frost Breath', element: 'tide', power: 68, acc: 0.9, kind: 'hit' },
  inferno: { name: 'Inferno', element: 'flame', power: 80, acc: 0.85, kind: 'hit' },
  rockslide: { name: 'Rockslide', element: 'stone', power: 80, acc: 0.85, kind: 'hit' },
  cyclone: { name: 'Cyclone', element: 'wind', power: 80, acc: 0.85, kind: 'hit' },
  dream_dust: { name: 'Dream Dust', element: 'dream', power: 70, acc: 0.92, kind: 'hit' },
  starfall: { name: 'Starfall', element: 'dream', power: 88, acc: 0.88, kind: 'hit' },
};

export const ITEMS = {
  berry: {
    name: 'Sweetberry', icon: '🍓', rarity: 'common',
    desc: 'A treat. Shy monsters open up when you share one.',
  },
  cake: {
    name: 'Honey Cake', icon: '🍰', rarity: 'uncommon',
    desc: 'A fancy treat. Makes any chat go a lot better.',
  },
  tonic: {
    name: 'Sparkle Tonic', icon: '🧪', rarity: 'common',
    desc: 'Heals a buddy by 50% (in battle or from the Buddies screen).',
  },
  clover: {
    name: 'Lucky Clover', icon: '🍀', rarity: 'uncommon',
    desc: 'Triples the chance that the next monster you meet simply likes you.',
  },
  bell: {
    name: 'Guardian Bell', icon: '🔔', rarity: 'rare',
    desc: 'If you lose a battle, it rings and keeps your buddies safe. Used up when it rings.',
  },
  candy: {
    name: 'Star Candy', icon: '🍬', rarity: 'rare',
    desc: 'A buddy who eats it grows one level.',
  },
  feather: {
    name: 'Moon Feather', icon: '🪶', rarity: 'rare',
    desc: 'The next non-legendary monster you meet will want to be your friend.',
  },
  prism: {
    name: 'Rainbow Prism', icon: '💎', rarity: 'legendary',
    desc: 'A fairy treasure. Revives and fully heals your whole team, and they all grow a level.',
  },
};

// Photo requests. kind 'color' and 'scene' are checked with on-device pixel analysis,
// kind 'object' uses an on-device image classifier (falls back to a color hint offline).
export const REQUESTS = [
  { id: 'red', kind: 'color', tags: ['red', 'warm'], ask: 'something RED', line: 'Red is the color of brave hearts! Can you show me something red?' },
  { id: 'orange', kind: 'color', tags: ['orange', 'warm'], ask: 'something ORANGE', line: 'I dream about orange things. Bring me something orange?' },
  { id: 'yellow', kind: 'color', tags: ['yellow', 'sunny'], ask: 'something YELLOW', line: 'Yellow makes me feel like sunshine. Show me something yellow!' },
  { id: 'green', kind: 'color', tags: ['green'], ask: 'something GREEN', line: 'Green, green, green! I want to see something green.' },
  { id: 'blue', kind: 'color', tags: ['blue', 'water'], ask: 'something BLUE', line: 'Blue is so calm... could you find me something blue?' },
  { id: 'purple', kind: 'color', tags: ['purple', 'night'], ask: 'something PURPLE', line: 'Purple is the rarest color, I think. Can you find one?' },
  { id: 'pink', kind: 'color', tags: ['pink', 'cute', 'sweet'], ask: 'something PINK', line: 'Pink things are the cutest. Show me something pink, please!' },
  { id: 'white', kind: 'color', tags: ['white', 'calm'], ask: 'something WHITE', line: 'I like things white like clouds and snow. Show me one?' },
  { id: 'sky', kind: 'scene', tags: ['sky', 'adventure', 'fast'], ask: 'a photo of the SKY', line: 'I want to see the sky above where you live. Take a picture for me?' },
  { id: 'greenery', kind: 'scene', tags: ['greenery', 'calm', 'green', 'rain'], ask: 'trees, grass or plants', line: 'Show me somewhere green and leafy! Trees, grass, plants...' },
  { id: 'sunset', kind: 'scene', tags: ['sunset', 'warm'], ask: 'a sunset (or warm glowing light)', line: 'Have you seen the sky turn orange? Show me a sunset!' },
  { id: 'night', kind: 'scene', tags: ['night', 'lights'], ask: 'lights in the dark', line: 'I love little lights in the dark. Can you show me some?' },
  { id: 'flower', kind: 'object', tags: ['flower', 'cute'], ask: 'a FLOWER', line: 'Flowers smell like happiness. Can you find me a flower?', labels: ['daisy', 'flower', 'rose', 'sunflower', 'pot', 'flowerpot', 'vase', 'bouquet', "yellow lady's slipper", 'rapeseed'], fallback: { colors: ['pink', 'purple', 'yellow', 'red'], min: 0.1, plus: 'green' } },
  { id: 'fruit', kind: 'object', tags: ['fruit', 'food', 'sweet'], ask: 'some FRUIT', line: 'My tummy is rumbling... I would love to see some fruit!', labels: ['banana', 'orange', 'lemon', 'strawberry', 'pineapple', 'granny smith', 'apple', 'pomegranate', 'fig', 'custard apple', 'jackfruit', 'grape'], fallback: { colors: ['red', 'orange', 'yellow', 'green'], min: 0.25 } },
  { id: 'food', kind: 'object', tags: ['food', 'warm'], ask: 'something DELICIOUS to eat', line: 'What do humans eat? Show me something yummy!', labels: ['pizza', 'cheeseburger', 'hotdog', 'hot dog', 'bagel', 'pretzel', 'french loaf', 'burrito', 'carbonara', 'meat loaf', 'potpie', 'plate', 'consomme', 'hot pot', 'guacamole', 'mashed potato', 'dough', 'ice cream', 'trifle', 'chocolate sauce', 'espresso', 'banana', 'strawberry', 'orange', 'soup bowl', 'wok', 'frying pan'], fallback: { colors: ['orange', 'yellow', 'red'], min: 0.25 } },
  { id: 'sweet', kind: 'object', tags: ['sweet', 'cute'], ask: 'a SWEET treat', line: 'I heard humans have sweets... can I see one?', labels: ['ice cream', 'ice lolly', 'trifle', 'chocolate sauce', 'candy', 'confectionery', 'bakery', 'bagel', 'pretzel', 'strawberry', 'cup', 'dough'], fallback: { colors: ['pink', 'white', 'orange'], min: 0.2 } },
  { id: 'cup', kind: 'object', tags: ['calm', 'warm'], ask: 'a CUP or MUG', line: 'What do you drink from? Show me your cup!', labels: ['cup', 'coffee mug', 'espresso', 'teapot', 'water bottle', 'beer glass', 'goblet', 'coffeepot', 'pitcher'], fallback: { colors: ['white'], min: 0.3 } },
  { id: 'wheels', kind: 'object', tags: ['fast', 'adventure'], ask: 'something with WHEELS', line: 'Humans zoom around on round things! Show me something with wheels.', labels: ['car', 'cab', 'minivan', 'sports car', 'convertible', 'jeep', 'bicycle', 'mountain bike', 'tricycle', 'motor scooter', 'moped', 'bus', 'school bus', 'trolleybus', 'streetcar', 'pickup', 'limousine', 'wagon', 'racer', 'go-kart', 'car wheel', 'tow truck', 'trailer truck', 'moving van', 'police van', 'ambulance', 'unicycle', 'skateboard'], fallback: { colors: ['black', 'grey'], min: 0.3 } },
  { id: 'book', kind: 'object', tags: ['calm', 'adventure'], ask: 'a BOOK', line: 'I heard books hold whole worlds inside. Show me one!', labels: ['book jacket', 'comic book', 'library', 'bookshop', 'bookcase', 'notebook', 'binder', 'menu'], fallback: { colors: ['white'], min: 0.25 } },
  { id: 'shoes', kind: 'object', tags: ['adventure', 'fast'], ask: 'your SHOES', line: 'You walk so far every day! Show me your shoes.', labels: ['running shoe', 'sandal', 'clog', 'loafer', 'cowboy boot', 'sock', 'shoe shop'], fallback: { colors: ['black', 'white', 'grey'], min: 0.3 } },
];

export const REQUESTS_BY_ID = Object.fromEntries(REQUESTS.map((r) => [r.id, r]));

// Friendly chat questions. Each answer carries tags; a monster's `likes` decide how much it enjoys the answer.
export const CHAT_QUESTIONS = [
  {
    q: 'What do you like doing on a free day?',
    a: [
      { text: 'Napping somewhere quiet', tags: ['calm', 'sleep'] },
      { text: 'Exploring somewhere new', tags: ['adventure', 'fast'] },
      { text: 'Eating something tasty', tags: ['food', 'sweet'] },
      { text: 'Playing games', tags: ['games'] },
    ],
  },
  {
    q: 'What is your favorite time of day?',
    a: [
      { text: 'Bright sunny noon', tags: ['sunny', 'sky'] },
      { text: 'Sunset', tags: ['sunset', 'warm'] },
      { text: 'Late at night', tags: ['night', 'lights'] },
      { text: 'Rainy mornings', tags: ['rain', 'calm', 'water'] },
    ],
  },
  {
    q: 'If we were friends, where would you take me?',
    a: [
      { text: 'A park full of trees', tags: ['greenery', 'green', 'flower'] },
      { text: 'The beach', tags: ['water', 'blue'] },
      { text: 'A rooftop to see the sky', tags: ['sky', 'adventure'] },
      { text: 'A bakery!', tags: ['food', 'sweet'] },
    ],
  },
  {
    q: 'What do you think of me?',
    a: [
      { text: 'You look really strong!', tags: ['strong', 'brave'] },
      { text: 'You are super cute', tags: ['cute'] },
      { text: 'You seem very fast', tags: ['fast'] },
      { text: 'You seem gentle and kind', tags: ['calm'] },
    ],
  },
  {
    q: 'Which color do you like best?',
    a: [
      { text: 'Red or orange', tags: ['red', 'orange', 'warm'] },
      { text: 'Blue', tags: ['blue', 'water'] },
      { text: 'Green', tags: ['green', 'greenery'] },
      { text: 'Purple or pink', tags: ['purple', 'pink'] },
      { text: 'Yellow', tags: ['yellow', 'sunny'] },
    ],
  },
  {
    q: 'Are you brave?',
    a: [
      { text: 'Of course! Nothing scares me', tags: ['brave', 'strong'] },
      { text: 'A little... with friends around', tags: ['cute', 'calm'] },
      { text: 'I run away really fast', tags: ['fast', 'games'] },
    ],
  },
  {
    q: 'What should we eat together?',
    a: [
      { text: 'Fresh fruit', tags: ['fruit', 'sweet'] },
      { text: 'Something spicy and hot', tags: ['warm', 'brave', 'food'] },
      { text: 'Cake and candy', tags: ['sweet', 'food'] },
      { text: 'Just water, thanks', tags: ['water', 'calm'] },
    ],
  },
];

// ---- Fairies ----
export const FAIRY_KINDS = {
  trickster: {
    name: 'Trickster Fairy', color: '#ff7ad9', glow: '#ffd1f3',
    hello: ['Hee hee! A human! Play with me, play with me!', 'Boo! Did I scare you? No? Hmph. Then entertain me!', 'Psst... want a present? You have to earn it~'],
  },
  quizzy: {
    name: 'Question Fairy', color: '#7ad7ff', glow: '#d4f4ff',
    hello: ['Oh! Oh! I have a question for you!', 'Human! I have been wondering about something all day...', 'Hello hello! Answer me this, please!'],
  },
};

// Fairy tasks. type: 'quiz' (one right answer), 'opinion' (any answer makes them happy),
// 'guess' (luck), 'photo' (show a color/scene), 'give' (hand over an item), 'riddle'.
export const FAIRY_TASKS = {
  trickster: [
    { type: 'guess', text: 'I hid a sparkle in one of my hands. Which one? Hee hee!', options: ['Left hand', 'Right hand'] },
    { type: 'guess', text: 'Three flowers, one is really me in disguise! Which one?', options: ['🌸', '🌼', '🌺'] },
    { type: 'riddle', text: 'Riddle time! What has hands but cannot clap?', options: ['A clock', 'A fairy', 'A glove'], answer: 0 },
    { type: 'riddle', text: 'Riddle! What gets wetter the more it dries?', options: ['A sponge', 'A towel', 'A cloud'], answer: 1 },
    { type: 'riddle', text: 'Riddle! What has keys but opens no locks?', options: ['A piano', 'A janitor', 'A treasure map'], answer: 0 },
    { type: 'riddle', text: 'What goes up but never comes down?', options: ['A balloon', 'Your age', 'A bird'], answer: 1 },
    { type: 'photo', request: 'pink', text: 'I want something PINK! Pink pink pink! Show me or no present!' },
    { type: 'photo', request: 'yellow', text: 'Find me something as yellow as my favorite candy!' },
    { type: 'photo', request: 'sky', text: 'I am bored of flying. Show me the sky from down there!' },
    { type: 'give', item: 'berry', text: 'I smell Sweetberries in your bag... give me one? Pretty please?' },
    { type: 'opinion', text: 'Tell me a joke! A good one!', options: ['Why did the fairy cross the road? To get to the other SIDE-kick!', 'I would tell you a pizza joke, but it is too cheesy.', 'Knock knock. ...Who is there? ...Not me, hee hee!'] },
  ],
  quizzy: [
    { type: 'quiz', text: 'How many legs does a spider have?', options: ['6', '8', '10'], answer: 1 },
    { type: 'quiz', text: 'Which planet is known as the red planet?', options: ['Venus', 'Mars', 'Jupiter'], answer: 1 },
    { type: 'quiz', text: 'What do bees make?', options: ['Milk', 'Honey', 'Silk'], answer: 1 },
    { type: 'quiz', text: 'What color do you get when you mix blue and yellow?', options: ['Green', 'Purple', 'Orange'], answer: 0 },
    { type: 'quiz', text: 'Which of these is NOT a fruit?', options: ['Tomato', 'Carrot', 'Cucumber'], answer: 1 },
    { type: 'quiz', text: 'How many days are in a leap year?', options: ['365', '366', '364'], answer: 1 },
    { type: 'quiz', text: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Pacific'], answer: 2 },
    { type: 'quiz', text: 'Where does the sun rise?', options: ['East', 'West', 'North'], answer: 0 },
    { type: 'opinion', text: 'What is your favorite season? I collect answers!', options: ['Spring 🌸', 'Summer ☀️', 'Autumn 🍂', 'Winter ❄️'] },
    { type: 'opinion', text: 'If you could fly, where would you go first?', options: ['Over the ocean', 'Up to the clouds', 'To see my friends', 'To the moon!'] },
    { type: 'opinion', text: 'What makes you happy?', options: ['Good food', 'My friends', 'Adventures', 'A cozy nap'] },
    { type: 'photo', request: 'greenery', text: 'What does a human tree look like? Show me some trees or plants!' },
    { type: 'photo', request: 'blue', text: 'I am researching the color blue. Can you show me something blue?' },
  ],
};

export const FAIRY_SUCCESS = [
  'Yay! You are the best human ever!', 'Hee hee, that was fun! Pick a present!', 'Wonderful! A gift for you~',
  'I like you! Choose something nice!',
];
export const FAIRY_FAIL = [
  'Wrong~! Hee hee! Better luck next time!', 'Hmm, no, that is not it! Bye-bye!', 'Pfft! Not even close! *giggles away*',
];

// Things monsters say
export const LINES = {
  luck: [
    'Hey... I like you! Can I come with you?', 'You smell like adventure. Let me be your friend!',
    'I have been waiting for someone like you! Let us go together!', 'Hi hi! You seem nice. I want to be your buddy!',
  ],
  shyHide: ['*hides and peeks at you nervously*', '*trembles a little... and stares at your bag*'],
  proudLow: ['Hmph. You and your little friends are not strong enough for me.', 'Come back when you are stronger, human.'],
  proudHigh: ['Your partners are strong... I respect that. I will walk with you.', 'Hm. You are worthy. Lead the way.'],
  fierce: ['GRRRR! Go away, human!', '*growls and bares its teeth*', 'Humans... I do not trust them.'],
  chatWin: ['That was fun! Can I stay with you?', 'I like talking to you! Let us be friends!', 'You get me! Take me with you!'],
  chatLose: ['Hmm... we are not quite the same. Maybe another time.', '*yawns* ...I think I will go now.'],
  playIntro: ['Let us play a game! Guess which paw hides the acorn!', 'Game time! Which paw is it in? Win two times!'],
  requestThanks: ['Yes! That is exactly it! I will be your friend!', 'Wow... it is beautiful! Thank you! Let us be friends forever!'],
  requestNope: ['Hmm, that is not quite it...', 'No no, that is not what I meant! Try again?'],
};
