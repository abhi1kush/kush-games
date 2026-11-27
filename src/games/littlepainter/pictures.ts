/**
 * Little Painter's pictures: hand-made SVG outlines on a 400 × 400 board. Each picture is a list of tappable regions
 * (painted in order, so a later region sits on top of an earlier one) plus outline-only details drawn over everything
 * (eyes, smiles, feather shafts) that never take paint. The region counts are mirrored in wasm/little_painter/src/book.rs.
 */
export const BOARD_SIZE = 400;
export const INK_COLOR = '#2f2a3a';
export const REGION_STROKE_WIDTH = 4;
export const DETAIL_STROKE_WIDTH = 3.5;

export type Shape =
  | { kind: 'path'; d: string; transform?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; transform?: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; transform?: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius: number; transform?: string };

export interface Region { name: string; shapes: Shape[]; }
/** A detail drawn on top: an outline only, filled with ink (eyes, nostrils) or white (eye sparkles). */
export interface Detail { shape: Shape; fill: 'none' | 'ink' | 'white'; }
export interface Picture { id: string; title: string; emoji: string; regions: Region[]; details: Detail[]; }

const path = (d: string, transform?: string): Shape => ({ kind: 'path', d, transform });
const circle = (cx: number, cy: number, r: number): Shape => ({ kind: 'circle', cx, cy, r });
const ellipse = (cx: number, cy: number, rx: number, ry: number, transform?: string): Shape => ({ kind: 'ellipse', cx, cy, rx, ry, transform });
const rect = (x: number, y: number, width: number, height: number, radius = 0, transform?: string): Shape => ({ kind: 'rect', x, y, width, height, radius, transform });
const region = (name: string, ...shapes: Shape[]): Region => ({ name, shapes });
const line = (d: string, transform?: string): Detail => ({ shape: path(d, transform), fill: 'none' });
const inkDot = (cx: number, cy: number, r: number): Detail => ({ shape: circle(cx, cy, r), fill: 'ink' });
const sparkle = (cx: number, cy: number, r: number): Detail => ({ shape: circle(cx, cy, r), fill: 'white' });
const round = (value: number) => Math.round(value * 10) / 10;

/** A fluffy cloud, about 80 wide and 40 tall, with its flat bottom at (x, y). */
const cloud = (x: number, y: number) =>
  path(`M${x - 38} ${y} a16 16 0 0 1 6-28 a22 22 0 0 1 38-12 a20 20 0 0 1 30 10 a15 15 0 0 1 2 30 Z`);
/** Five round petals around a centre. */
const petals = (cx: number, cy: number, distance = 13, radius = 11) =>
  [0, 72, 144, 216, 288].map(angle => circle(round(cx + distance * Math.sin(angle * Math.PI / 180)), round(cy - distance * Math.cos(angle * Math.PI / 180)), radius));
/** A five-pointed star path. */
function star(cx: number, cy: number, outer: number, inner = outer * 0.5) {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i * 36) * Math.PI / 180;
    points.push(`${round(cx + radius * Math.sin(angle))} ${round(cy - radius * Math.cos(angle))}`);
  }
  return path(`M${points.join(' L')} Z`);
}
/** Point at `distance` from (cx, cy) in direction `degrees` (0 = straight up, clockwise). */
const polar = (cx: number, cy: number, distance: number, degrees: number) =>
  [round(cx + distance * Math.sin(degrees * Math.PI / 180)), round(cy - distance * Math.cos(degrees * Math.PI / 180))];

/** The peacock's tail backing: a fan with a scalloped edge behind the feathers. */
function scallopedFan(cx: number, cy: number, radius: number, fromDegrees: number, toDegrees: number, scallops: number) {
  const step = (toDegrees - fromDegrees) / scallops;
  let d = `M${cx} ${cy} L${polar(cx, cy, radius, fromDegrees).join(' ')}`;
  for (let i = 0; i < scallops; i++) {
    const control = polar(cx, cy, radius + 34, fromDegrees + step * (i + 0.5));
    const end = polar(cx, cy, radius, fromDegrees + step * (i + 1));
    d += ` Q${control.join(' ')} ${end.join(' ')}`;
  }
  return path(`${d} Z`);
}

// ---------------------------------------------------------------- Peacock
const TAIL_X = 200, TAIL_Y = 250;
const FEATHER_ANGLES = [-69, -42, -15, 15, 42, 69];
const featherTransform = (angle: number) => `translate(${TAIL_X} ${TAIL_Y}) rotate(${angle})`;
const FEATHER_PATH = 'M0 -30 C -34 -80 -38 -150 0 -184 C 38 -150 34 -80 0 -30 Z';

const peacock: Picture = {
  id: 'peacock', title: 'Peacock', emoji: '🦚',
  regions: [
    region('sky', rect(0, 0, 400, 400)),
    region('sun', circle(46, 48, 28)),
    region('cloud', cloud(336, 70)),
    region('grass', path('M0 330 Q100 305 200 322 Q300 338 400 318 L400 400 L0 400 Z')),
    region('tail fan', scallopedFan(TAIL_X, TAIL_Y, 164, -88, 88, 8)),
    ...FEATHER_ANGLES.map((angle, i) => region(`feather ${i + 1}`, path(FEATHER_PATH, featherTransform(angle)))),
    ...FEATHER_ANGLES.map((angle, i) => region(`eyespot ${i + 1}`, ellipse(0, -136, 18, 23, featherTransform(angle)))),
    ...FEATHER_ANGLES.map((angle, i) => region(`eyespot centre ${i + 1}`, ellipse(0, -136, 9, 12, featherTransform(angle)))),
    region('legs and feet', rect(183, 330, 10, 34, 5), rect(207, 330, 10, 34, 5), ellipse(186, 367, 14, 7), ellipse(214, 367, 14, 7)),
    region('neck', path('M184 268 C 178 236 186 206 190 180 L 218 180 C 218 206 228 236 224 268 Z')),
    region('body', ellipse(203, 292, 44, 52)),
    region('wing', path('M206 258 C 248 256 262 306 234 340 C 214 328 202 296 206 258 Z')),
    region('head', circle(204, 164, 23)),
    region('crest', circle(193, 129, 8.5), circle(204, 121, 8.5), circle(215, 129, 8.5)),
    region('beak', path('M224 157 L249 166 L224 175 Z')),
    region('left flower petals', ...petals(52, 356)),
    region('left flower centre', circle(52, 356, 9)),
    region('right flower petals', ...petals(350, 352)),
    region('right flower centre', circle(350, 352, 9)),
  ],
  details: [
    ...FEATHER_ANGLES.map(angle => line('M0 -36 L0 -110', featherTransform(angle))),
    line('M199 142 L197 136'), line('M204 141 L204 130'), line('M209 142 L211 136'),
    inkDot(212, 160, 4.5), sparkle(213.6, 158.4, 1.6),
    line('M196 174 Q205 180 214 175'),
    line('M180 370 L176 376 M188 371 L188 378 M208 370 L206 377 M218 371 L222 377'),
  ],
};

// ---------------------------------------------------------------- Butterfly
const butterfly: Picture = {
  id: 'butterfly', title: 'Butterfly', emoji: '🦋',
  regions: [
    region('sky', rect(0, 0, 400, 400)),
    region('cloud', cloud(80, 66)),
    region('grass', path('M0 336 Q110 316 200 330 Q300 344 400 326 L400 400 L0 400 Z')),
    region('top left wing', path('M196 192 C 150 92 62 58 46 118 C 32 178 108 216 196 212 Z')),
    region('top right wing', path('M204 192 C 250 92 338 58 354 118 C 368 178 292 216 204 212 Z')),
    region('bottom left wing', path('M196 216 C 128 220 72 262 94 304 C 116 344 180 304 198 242 Z')),
    region('bottom right wing', path('M204 216 C 272 220 328 262 306 304 C 284 344 220 304 202 242 Z')),
    region('top left spot', circle(110, 132, 25)),
    region('top right spot', circle(290, 132, 25)),
    region('bottom left spot', circle(134, 280, 17)),
    region('bottom right spot', circle(266, 280, 17)),
    region('little dots', circle(162, 180, 10), circle(238, 180, 10)),
    region('body', ellipse(200, 238, 14, 64)),
    region('head', circle(200, 164, 19)),
    region('antenna tips', circle(170, 104, 9), circle(230, 104, 9)),
    region('left flower petals', ...petals(64, 352)),
    region('left flower centre', circle(64, 352, 9)),
    region('right flower petals', ...petals(338, 356)),
    region('right flower centre', circle(338, 356, 9)),
  ],
  details: [
    line('M193 148 Q182 124 175 112'), line('M207 148 Q218 124 225 112'),
    inkDot(193, 161, 3.6), inkDot(207, 161, 3.6), sparkle(194.2, 159.8, 1.2), sparkle(208.2, 159.8, 1.2),
    line('M193 170 Q200 176 207 170'),
    line('M187 214 Q200 220 213 214'), line('M187 240 Q200 246 213 240'), line('M188 266 Q200 272 212 266'),
  ],
};

// ---------------------------------------------------------------- Rocket
const rocket: Picture = {
  id: 'rocket', title: 'Rocket', emoji: '🚀',
  regions: [
    region('space', rect(0, 0, 400, 400)),
    region('planet ring', ellipse(80, 92, 64, 15, 'rotate(-18 80 92)')),
    region('planet', circle(80, 92, 38)),
    region('moon', circle(334, 76, 30)),
    region('stars', star(42, 248, 14), star(352, 206, 13), star(300, 146, 10), star(64, 336, 12), star(158, 40, 11), star(352, 296, 10)),
    region('smoke puffs', circle(142, 362, 18), circle(116, 382, 17), circle(258, 362, 18), circle(284, 382, 17)),
    region('big flame', path('M168 304 C 156 342 184 362 200 394 C 216 362 244 342 232 304 Z')),
    region('little flame', path('M182 304 C 178 330 192 346 200 370 C 208 346 222 330 218 304 Z')),
    region('left fin', path('M156 222 C 116 238 100 280 104 320 L 158 292 Z')),
    region('right fin', path('M244 222 C 284 238 300 280 296 320 L 242 292 Z')),
    region('body', path('M154 132 L246 132 C 256 182 258 242 248 292 L152 292 C 142 242 144 182 154 132 Z')),
    region('nose cone', path('M154 132 C 162 104 178 84 200 64 C 222 84 238 104 246 132 Z')),
    region('window frame', circle(200, 188, 31)),
    region('window glass', circle(200, 188, 19)),
    region('middle fin', rect(188, 236, 24, 66, 10)),
    region('engine', rect(164, 290, 72, 18, 5)),
  ],
  details: [
    line('M186 178 Q190 172 196 171'),
    inkDot(164, 150, 2.6), inkDot(236, 150, 2.6), inkDot(162, 230, 2.6), inkDot(238, 230, 2.6),
    line('M316 66 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0'), line('M344 92 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0'),
    line('M60 76 Q80 70 98 78'), line('M58 104 Q80 112 102 104'),
  ],
};

// ---------------------------------------------------------------- Dinosaur
const dinosaur: Picture = {
  id: 'dinosaur', title: 'Dinosaur', emoji: '🦕',
  regions: [
    region('sky', rect(0, 0, 400, 400)),
    region('sun', circle(336, 58, 30)),
    region('cloud', cloud(136, 70)),
    region('grass', path('M0 322 Q200 292 400 322 L400 400 L0 400 Z')),
    region('tree trunk', path('M54 330 C 62 270 58 216 66 172 L82 174 C 76 216 80 270 76 330 Z')),
    region('tree leaves', path('M74 172 C 50 128 14 136 4 168 C 30 158 52 160 74 172 Z'), path('M74 172 C 62 124 78 100 104 94 C 92 122 84 148 74 172 Z'),
      path('M74 172 C 100 130 138 138 148 168 C 122 158 98 160 74 172 Z'), path('M74 172 C 40 166 20 190 22 218 C 40 196 56 184 74 172 Z'),
      path('M74 172 C 108 166 128 190 126 218 C 108 196 92 184 74 172 Z')),
    region('egg', ellipse(344, 334, 26, 34)),
    region('tail', path('M122 282 C 80 286 44 270 26 246 C 60 262 100 262 136 250 Z')),
    region('back plate 1', path('M128 228 L136 184 L164 214 Z')),
    region('back plate 2', path('M162 214 L180 168 L204 210 Z')),
    region('back plate 3', path('M200 212 L222 174 L238 222 Z')),
    region('legs', path('M136 288 L164 288 L164 340 Q150 348 134 340 Z'), path('M200 290 L228 290 L230 340 Q215 348 198 340 Z')),
    region('body', ellipse(182, 262, 72, 50)),
    region('belly', ellipse(186, 282, 48, 22)),
    region('neck', path('M224 240 C 240 212 248 186 258 164 L 290 170 C 284 198 272 232 248 264 Z')),
    region('head', ellipse(286, 150, 40, 28)),
  ],
  details: [
    inkDot(296, 140, 5), sparkle(297.8, 138.2, 1.8), inkDot(318, 145, 2),
    line('M286 162 Q302 170 318 158'),
    line('M140 332 L140 340 M150 334 L150 342 M204 332 L204 340 M216 334 L216 342'),
    line('M330 326 L338 334 L346 324 L354 334 L360 326'),
    line('M158 280 Q160 290 158 298 M186 284 Q188 294 186 302 M214 280 Q216 290 214 298'),
  ],
};

// ---------------------------------------------------------------- House and sun
const SUN_X = 62, SUN_Y = 62;
const house: Picture = {
  id: 'house', title: 'Cozy House', emoji: '🏡',
  regions: [
    region('sky', rect(0, 0, 400, 400)),
    region('sun rays', ...[0, 45, 90, 135, 180, 225, 270, 315].map(angle => rect(-6, -60, 12, 20, 6, `translate(${SUN_X} ${SUN_Y}) rotate(${angle})`))),
    region('sun', circle(SUN_X, SUN_Y, 30)),
    region('cloud', cloud(318, 66)),
    region('grass', path('M0 318 Q200 300 400 318 L400 400 L0 400 Z')),
    region('garden path', path('M178 400 L188 330 L212 330 L222 400 Z')),
    region('chimney smoke', circle(264, 100, 9), circle(280, 80, 12)),
    region('chimney', rect(240, 112, 26, 56, 3)),
    region('walls', rect(110, 190, 180, 140, 2)),
    region('roof', path('M88 198 L200 108 L312 198 Z')),
    region('round window', circle(200, 162, 15)),
    region('door', path('M180 330 L180 280 A20 20 0 0 1 220 280 L220 330 Z')),
    region('left window', rect(128, 220, 42, 38, 5)),
    region('right window', rect(230, 220, 42, 38, 5)),
    region('tree trunk', rect(332, 262, 18, 70, 4)),
    region('tree top', circle(341, 238, 32), circle(316, 258, 20), circle(366, 258, 20)),
    region('bush', circle(110, 330, 16), circle(86, 334, 13), circle(62, 336, 11)),
  ],
  details: [
    line('M149 220 L149 258 M128 239 L170 239'), line('M251 220 L251 258 M230 239 L272 239'),
    line('M200 147 L200 177 M185 162 L215 162'),
    inkDot(211, 306, 3),
    line('M50 56 Q52 54 54 56 M70 56 Q72 54 74 56'), line('M52 70 Q62 78 72 70'),
  ],
};

// ---------------------------------------------------------------- Whale
const whale: Picture = {
  id: 'whale', title: 'Happy Whale', emoji: '🐳',
  regions: [
    region('sky', rect(0, 0, 400, 210)),
    region('sun', circle(330, 62, 28)),
    region('cloud', cloud(96, 66)),
    region('sea', path('M0 200 Q50 186 100 200 T200 200 T300 200 T400 200 L400 400 L0 400 Z')),
    region('seaweed', path('M28 384 C 18 352 44 332 30 300 C 50 322 40 352 48 384 Z'), path('M362 384 C 352 352 374 336 360 306 C 382 326 372 352 382 384 Z')),
    region('sand', path('M0 362 Q200 340 400 366 L400 400 L0 400 Z')),
    region('starfish', star(300, 380, 15, 7)),
    region('little fish body', ellipse(222, 344, 22, 13)),
    region('little fish tail', path('M202 344 L184 332 L184 356 Z')),
    region('striped fish body', ellipse(320, 312, 26, 16)),
    region('striped fish tail', path('M344 312 L364 298 L364 326 Z')),
    region('whale tail', path('M300 246 C 318 218 338 198 366 192 C 358 212 352 226 342 240 C 360 248 372 262 378 282 C 352 272 334 264 312 264 Z')),
    region('whale', path('M68 250 C 68 186 170 160 250 200 C 284 216 296 240 316 240 L 312 266 C 266 300 200 318 130 310 C 94 306 68 286 68 250 Z')),
    region('belly', path('M76 268 C 120 292 200 296 262 280 C 230 304 170 316 126 310 C 100 306 84 292 76 268 Z')),
    region('fin', path('M168 284 C 178 310 198 326 222 330 C 214 312 206 296 194 282 Z')),
    region('water spout', path('M122 176 C 114 144 92 132 78 122 C 100 122 116 132 126 148 C 132 130 148 120 170 118 C 154 130 140 148 134 176 Z')),
    region('bubbles', circle(40, 250, 10), circle(56, 224, 6), circle(250, 160, 7)),
  ],
  details: [
    inkDot(112, 232, 6), sparkle(114, 230, 2),
    line('M84 258 Q100 268 120 260'),
    line('M310 304 L310 320 M322 298 L322 326'),
    inkDot(232, 340, 2.5), inkDot(334, 306, 3),
  ],
};

// ---------------------------------------------------------------- Elephant
const elephant: Picture = {
  id: 'elephant', title: 'Elephant', emoji: '🐘',
  regions: [
    region('sky', rect(0, 0, 400, 400)),
    region('sun', circle(340, 56, 28)),
    region('cloud', cloud(90, 70)),
    region('grass', path('M0 322 Q200 300 400 324 L400 400 L0 400 Z')),
    region('tail', path('M318 226 C 344 232 352 250 350 270 L 342 270 C 342 254 336 242 316 238 Z'), ellipse(347, 280, 10, 13)),
    region('legs', rect(150, 268, 34, 74, 10), rect(196, 280, 34, 64, 10), rect(250, 280, 34, 64, 10), rect(292, 268, 30, 72, 10)),
    region('body', ellipse(230, 240, 95, 68)),
    region('blanket', path('M222 176 C 252 168 290 176 306 192 L 292 238 C 266 246 236 246 216 238 Z')),
    region('trunk', path('M96 222 C 80 252 70 286 82 310 C 90 326 114 322 112 306 L 100 306 C 96 312 92 310 90 302 C 86 280 100 256 118 238 Z')),
    region('head', circle(140, 200, 58)),
    region('ear', path('M150 150 C 200 130 232 170 224 215 C 216 255 176 262 150 240 C 140 210 138 176 150 150 Z')),
    region('tusk', path('M110 240 C 102 258 90 266 74 266 C 86 258 94 248 98 236 Z')),
    region('ball', circle(330, 352, 30)),
    region('ball stripe', path('M330 322 C 314 336 314 368 330 382 C 346 368 346 336 330 322 Z')),
  ],
  details: [
    inkDot(122, 190, 6), sparkle(124, 188, 2),
    line('M108 222 Q118 230 128 224'),
    line('M166 168 Q196 160 206 196'),
    line('M226 244 L224 252 M244 246 L243 254 M262 246 L262 254 M280 242 L281 250'),
    line('M154 336 Q160 330 166 336 M200 338 Q206 332 212 338 M254 338 Q260 332 266 338 M296 334 Q302 328 308 334'),
    line('M92 286 Q98 288 104 284 M88 270 Q95 272 102 268'),
  ],
};

/** The pictures in picker order; the Peacock is first and opens by default. */
export const PICTURES: readonly Picture[] = [peacock, butterfly, rocket, dinosaur, house, whale, elephant];

/** Paint names for the palette buttons (palette index = position + 1). Colours come from wasm (book.rs PALETTE). */
export const PAINT_NAMES = ['Cherry red', 'Orange', 'Sunny yellow', 'Lime', 'Leaf green', 'Teal', 'Sky blue', 'Ocean blue',
  'Purple', 'Pink', 'Peach', 'Brown', 'Sand', 'Cloud gray', 'Charcoal', 'Snow white'] as const;
