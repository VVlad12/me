/*
 * One-line animal sketches drawn on <canvas>.
 * Each animal is a single continuous brush stroke. The stroke is revealed
 * from start to end, so you watch the brush travel; the eye is dabbed on last.
 * A numeric seed gives the hand its wobble and the brush its pressure, so the
 * same number always draws the same sketch.
 */
window.Sketch = (function () {
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { ink: v("--bark"), beet: v("--beet"), moss: v("--moss"), paper: v("--paper"), muted: v("--muted") };
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeInOut = (x) => (1 - Math.cos(Math.PI * x)) / 2;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  /* ---------- the animals ----------
   * Every animal has several poses; each pose is one brush path, in order.
   * Points live in a 100 x 100 box, y down, every animal facing left. A point
   * given twice is a sharp corner (ear tips, beaks). "eye" is dabbed on once the
   * stroke is finished.
   */
  const S = (p) => [p, p]; // sharp corner helper
  // a zigzag of spikes along an arc (centre, radius, spike height, from/to angle in degrees)
  function spikes(cx, cy, R, h, a0, a1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180, r = i % 2 ? R + h : R;
      out.push(...S([cx + Math.cos(a) * r, cy - Math.sin(a) * r]));
    }
    return out;
  }
  const ANIMALS = {
    cat: {
      label: "Cat",
      poses: [
        { name: "sitting", eye: [19, 31], pts: [
            [92, 70], [98, 80], [96, 92], [86, 97], [76, 94],              // tail on the ground, tip curled up
            [82, 86], [84, 72], [78, 56], [68, 42], [56, 34], [48, 29],    // rump, back, nape
            [47, 22], ...S([49, 9]), [42, 17], [36, 16],                   // back ear
            [30, 16], ...S([24, 5]), [20, 15],                             // front ear
            [15, 22], [11, 30], [10, 37], ...S([12, 41]), [16, 44], [22, 46], [27, 50], // forehead, nose, chin, throat
            [30, 58], [30, 68], [28, 80], [27, 92], [22, 97], [30, 99], [37, 97], [38, 90], [38, 80], // chest, front leg, paw, back up
            [46, 72], [58, 66], [68, 70], [73, 80], [70, 92], [62, 98], [52, 96], // round haunch drawn over the body, hind foot
        ] },
        { name: "walking", eye: [10, 38], pts: [
            [84, 10], [92, 16], [94, 30], [90, 42], [84, 48],              // tail held high, curled at the tip
            [72, 44], [58, 42], [44, 42], [34, 40],                        // back to the nape
            [32, 36], ...S([33, 24]), [27, 30], [22, 29],                  // back ear
            [18, 29], ...S([12, 20]), [10, 30],                            // front ear
            [6, 36], [3, 44], ...S([5, 50]), [10, 52], [16, 53],           // forehead, nose, chin
            [24, 56], [26, 62], [26, 76], [24, 90], ...S([18, 94]), [30, 94], [32, 80], [34, 66], // chest, front leg down and up
            [44, 68], [58, 68], [66, 66],                                  // belly
            [70, 70], [72, 84], [72, 94], ...S([84, 94]), [84, 82], [88, 68], [90, 56], // hind leg down, paw, hock, up to the rump
        ] },
        { name: "stretching", eye: [12, 66], pts: [
            [86, 8], [94, 14], [92, 30], [86, 40],                         // tail straight up, rump high
            [74, 44], [60, 52], [46, 60], [36, 64],                        // back sloping down to the nape
            [34, 60], ...S([36, 50]), [30, 56], [26, 56],                  // back ear
            [22, 56], ...S([16, 48]), [14, 58],                            // front ear
            [8, 64], [4, 72], ...S([6, 78]), [12, 82], [20, 82],           // head held low, nose, chin
            [24, 86], [18, 92], ...S([6, 96]), [20, 98], [32, 96],         // front leg stretched out, paw
            [40, 88], [50, 84], [62, 80],                                  // under the chest and belly
            [70, 82], [76, 90], ...S([74, 98]), [86, 98], [90, 86], [92, 66], [90, 52], // hind leg, paw, back up to the tail
        ] },
      ],
    },
    dog: {
      label: "Dog",
      poses: [
        { name: "sitting", eye: [20, 31], pts: [
            [40, 84], [40, 97], [30, 100], [20, 99], [20, 92],             // start under the chest: front leg and paw
            [22, 80], [22, 68], [20, 56], [22, 46], [18, 42], [10, 42],    // front leg, chest, throat, under the muzzle
            ...S([4, 40]), [6, 35], [14, 31], [22, 27], [27, 19], [34, 14], [42, 14], [46, 17], // nose, muzzle, stop, round skull
            [50, 22], [52, 32], ...S([49, 43]), [44, 35], [43, 26],        // drop ear
            [50, 27], [60, 30], [72, 36], [82, 46], [88, 58], [90, 70],    // neck and back
            [95, 64], [98, 54], ...S([97, 44]), [94, 56], [92, 68], [90, 80], // tail up and down again
            [88, 90], [82, 97], [70, 99], [60, 98], [56, 92],              // rump and hind foot
            [56, 82], [62, 72], [72, 70], [80, 76], [82, 86], [76, 94],    // haunch drawn over the body
        ] },
        { name: "standing", eye: [20, 29], pts: [
            ...S([97, 12]), [92, 24], [86, 34],                            // tail up, from the tip to the root
            [74, 30], [60, 30], [48, 28],                                  // back, towards the head
            [44, 24], [46, 36], ...S([42, 44]), [38, 34], [40, 24],        // drop ear
            [34, 20], [26, 21], [22, 26], [12, 32], ...S([3, 40]),         // skull, stop, muzzle, nose
            [10, 42], [18, 45], [26, 50], [30, 58],                        // jaw, throat, chest
            [30, 72], [30, 86], ...S([26, 96]), [38, 96], [38, 80], [40, 64], // front leg down, paw, up
            [52, 68], [66, 66], [76, 64],                                  // belly
            [80, 72], [78, 86], ...S([74, 96]), [86, 96], [88, 82], [92, 66], [92, 52], [90, 40], // hind leg, paw, up to the tail
        ] },
        { name: "lying down", eye: [17, 30], pts: [
            ...S([4, 36]), [10, 30], [18, 26], [26, 20], [34, 20],         // nose, muzzle, stop, skull
            [38, 24], [40, 36], ...S([37, 44]), [34, 34], [35, 26],        // drop ear
            [42, 28], [52, 40], [66, 46], [80, 48], [92, 54],              // neck and long back
            [96, 66], [92, 78], [84, 84], [74, 84],                        // haunch and hind foot
            [62, 84], [50, 84], [40, 86], [30, 88], [16, 88], ...S([6, 90]), // belly and front paws stretched forward
            [10, 84], [22, 82], [30, 74], [30, 62],                        // top of the paw, up the leg
            [24, 54], [18, 46], [10, 42], [5, 40],                         // chest, throat, under the jaw
        ] },
      ],
    },
    pigeon: {
      label: "Pigeon",
      poses: [
        { name: "standing", eye: [17, 31], pts: [
            [86, 58], [72, 50], [58, 42], [48, 36], [40, 28],              // folded wing, tip to shoulder
            [32, 22], [22, 23], [14, 29], [9, 36], ...S([3, 40]), [9, 42], // small head and beak
            [12, 50], [20, 64], [30, 74], [42, 80], [50, 82],              // puffed chest
            [50, 91], ...S([43, 95]), [52, 92], [53, 83],                  // short leg and toe
            [62, 79], [74, 73], [84, 66], ...S([96, 64]), ...S([98, 56]),  // belly and tail
            [88, 52], [78, 45], [66, 38], [56, 34], [50, 32],              // back, ending above the wing
        ] },
        { name: "pecking", eye: [14, 74], pts: [
            ...S([6, 84]), [10, 76], [16, 70], [24, 64],                   // beak on the ground, head, nape
            [36, 52], [50, 44], [66, 42], [80, 46], [92, 50], ...S([99, 48]), ...S([96, 58]), // back rising to the tail
            [86, 60], [74, 66], [60, 74],                                  // under the tail, belly
            [50, 76], [48, 88], ...S([42, 92]), [50, 90], [52, 78],        // leg and toe
            [42, 80], [30, 84], [20, 84], [12, 86],                        // chest leaning forward to the throat
        ] },
        { name: "flying", eye: [12, 46], pts: [
            ...S([4, 50]), [10, 44], [18, 42],                             // beak and head
            [30, 36], [44, 20], ...S([58, 6]), [50, 24], [44, 40],         // near wing raised, tip, trailing edge
            [56, 46], [70, 50], [84, 54], ...S([96, 50]), ...S([94, 62]), [82, 62], // back and spread tail
            [66, 64], [52, 66],                                            // belly
            [44, 72], [40, 84], ...S([36, 96]), [44, 86], [50, 72],        // far wing swept down, tip, back up
            [36, 64], [22, 60], [12, 56], [6, 52],                         // chest to the throat
        ] },
      ],
    },
    squirrel: {
      label: "Squirrel",
      poses: [
        { name: "sitting up", eye: [24, 33], pts: [
            ...S([16, 38]), [18, 32], [24, 26],                            // nose and forehead
            [30, 22], [32, 14], [38, 14], [40, 22],                        // round ear
            [46, 26], [54, 34], [60, 46], [62, 60], [60, 72],              // nape, hunched back, rump
            [66, 70], [76, 60], [82, 46], [80, 30], [70, 16], [56, 10],    // tail, inner curve going up
            ...S([48, 6]), [62, 2], [80, 6], [94, 20], [99, 42], [95, 64], [85, 82], [72, 94], [58, 98], // round the tip, outer curve down
            [44, 99], [32, 96], [30, 86], [32, 74],                        // hind foot, haunch, belly
            [28, 66], ...S([24, 62]), [32, 58], [34, 50], [32, 44], [26, 42], [18, 40], // paws held up, chest, chin
        ] },
        { name: "running", eye: [11, 44], pts: [
            ...S([3, 50]), [8, 44], [16, 40],                              // nose and head, stretched forward
            [20, 36], ...S([22, 28]), [26, 36],                            // ear
            [36, 34], [52, 32], [66, 36], [76, 42],                        // long back
            [84, 40], [92, 30], [96, 16], ...S([94, 4]), [86, 14], [82, 28], [80, 40], // tail streaming behind, out and back
            [84, 50], [88, 60], ...S([94, 66]), [84, 64], [76, 56],        // hind leg pushing off
            [64, 56], [50, 58],                                            // belly
            [40, 56], [30, 60], ...S([18, 66]), [28, 58], [34, 52],        // front leg reaching
            [24, 50], [14, 52], [6, 52],                                   // throat to the chin
        ] },
        { name: "eating", eye: [15, 50], pts: [
            ...S([56, 8]), [68, 6], [82, 12], [92, 26], [96, 44], [92, 60], [82, 68], // tail: tip, outer curve, down to the base
            [82, 80], [74, 92], ...S([62, 94]), [56, 88],                  // rump and hind foot
            [46, 84], [36, 80], [28, 72], ...S([22, 68]), [26, 62],        // belly, paws holding a nut
            [20, 58], [14, 60], ...S([8, 56]), [12, 48], [20, 42],         // throat, chin, nose, forehead
            [26, 38], ...S([28, 28]), [32, 36],                            // ear
            [40, 36], [52, 34], [64, 38], [74, 46], [80, 56],              // back, hunched
            [86, 52], [88, 36], [80, 20], [66, 14],                        // tail inner curve, ending near the tip
        ] },
      ],
    },
    rabbit: {
      label: "Rabbit",
      poses: [
        { name: "sitting", eye: [19, 31], pts: [
            ...S([8, 36]), [12, 28], [20, 22],                             // nose and forehead
            [24, 14], [28, 4], [33, 3], [36, 10], [36, 22],                // front ear, rounded
            [40, 12], [44, 3], [49, 4], [51, 12], [50, 22],                // back ear
            [54, 28], [64, 32], [76, 42], [84, 56], [87, 70],              // back
            [92, 74], [94, 82], [88, 88], [80, 96], [66, 99], [50, 98], [44, 94], // tail puff, rump, hind foot
            [48, 88], [40, 86], [34, 88], [32, 98], [22, 99], [18, 92],    // belly and front paw
            [22, 80], [24, 68], [22, 56], [18, 46], [12, 42], [8, 40],     // front leg, chest, chin
        ] },
        { name: "crouching", eye: [12, 56], pts: [
            ...S([4, 62]), [10, 54], [18, 48],                             // nose and forehead, low
            [22, 40], [26, 30], [30, 28], [32, 36], [30, 48],              // front ear
            [36, 36], [40, 26], [44, 26], [46, 36], [44, 48],              // back ear
            [54, 46], [68, 46], [82, 52], [92, 62], [94, 76], ...S([98, 82]), // long back, rump, tail
            [90, 88], [78, 92], [64, 92], [50, 90], [36, 90],              // hind foot and belly, flat to the ground
            [26, 92], ...S([14, 94]), [16, 86], [14, 76], [10, 68], [6, 64], // front paw, chest, back to the nose
        ] },
        { name: "hopping", eye: [13, 41], pts: [
            ...S([6, 46]), [10, 40], [18, 36],                             // nose and head
            [26, 32], [40, 26], ...S([52, 22]), [42, 32], [30, 38],        // ears laid back, out and back
            [38, 44], [52, 44], [66, 46], [80, 50], [90, 58], ...S([96, 60]), // back, rump, tail
            [92, 68], [96, 80], ...S([98, 90]), [88, 84], [80, 72],        // hind leg stretched out behind
            [68, 66], [54, 64],                                            // belly
            [42, 66], [30, 72], ...S([18, 80]), [28, 68], [34, 58],        // front legs reaching forward
            [26, 52], [16, 50], [8, 50],                                   // throat to the chin
        ] },
      ],
    },
    fox: {
      label: "Fox",
      poses: [
        { name: "sitting", eye: [16, 37], pts: [
            ...S([3, 44]), [10, 37], [18, 31], [24, 25],                   // pointed nose, muzzle, forehead
            [28, 20], ...S([30, 4]), [38, 16], [42, 16],                   // front ear
            [46, 16], ...S([52, 4]), [55, 20],                             // back ear
            [58, 26], [66, 34], [76, 46], [84, 60], [88, 74], [88, 86], [92, 94], // nape, back, rump, tail root
            [84, 100], [68, 100], [50, 99], [34, 97], ...S([22, 93]),      // under edge of the thick tail, to the white tip
            [30, 86], [46, 84], [60, 85], [70, 88],                        // top edge of the tail, lying over the paws
            [76, 84], [74, 72], [64, 68], [56, 74], [54, 84],              // haunch drawn over the body
            [44, 86], [40, 74], [38, 62], [34, 54], [30, 48],              // front leg and chest
            [24, 48], ...S([18, 52]), [10, 48], [5, 46],                   // fluffy cheek, under the muzzle
        ] },
        { name: "trotting", eye: [14, 36], pts: [
            ...S([2, 44]), [8, 38], [16, 32], [22, 26],                    // nose, muzzle, forehead
            [26, 22], ...S([28, 8]), [34, 20],                             // front ear
            [38, 18], ...S([44, 6]), [46, 20],                             // back ear
            [50, 26], [62, 30], [76, 32], [82, 34],                        // nape and back
            [90, 30], [98, 22], ...S([100, 16]), [94, 30], [88, 42], [84, 50], // brush tail straight out, over and under
            [92, 62], [94, 78], ...S([96, 94]), [86, 94], [84, 80], [80, 66], // hind leg, paw, up the front of the thigh
            [68, 62], [54, 62], [44, 60],                                  // belly
            [40, 70], [38, 86], ...S([36, 96]), [26, 96], [28, 82], [30, 68], // front leg, paw, up
            [28, 56], [24, 50], [18, 50], ...S([12, 52]), [6, 48], [3, 46], // chest, cheek, under the muzzle
        ] },
        { name: "curled asleep", eye: [14, 46], pts: [
            [26, 60], [14, 58], ...S([6, 50]), [14, 40], [18, 28],         // cheek, chin, nose, forehead
            ...S([22, 12]), [30, 26], [38, 26], ...S([40, 14]), [46, 22],  // both ears
            [62, 18], [80, 28], [92, 46], [92, 66], [84, 80], [70, 90], [54, 94], [38, 92], [26, 86], // the curled back
            [14, 80], [8, 70], ...S([4, 62]),                              // tail wrapping round the front, to the tip
            [12, 66], [22, 68], [34, 72], [46, 74], [58, 72],              // upper edge of the tail, tucked under the chin
        ] },
      ],
    },
    hedgehog: {
      label: "Hedgehog",
      poses: [
        { name: "snuffling", eye: [17, 65], pts: [
            ...S([3, 76]), [8, 70], [14, 64], [20, 59], [26, 56],          // long pointed snout up to the brow
            ...spikes(58, 66, 32, 6, 148, -8, 19),                         // the spiny dome, every point a corner
            [88, 80], [82, 90], [74, 95], [66, 94], [62, 90],              // rump and hind foot
            [52, 91], [40, 91], [32, 95], [24, 95], [22, 89],              // belly and front foot
            [18, 82], [10, 78], [5, 77],                                   // chin, back under the snout
        ] },
        { name: "curled up", eye: [22, 70], pts: [
            ...S([14, 76]), [20, 70], [26, 66],                            // snout peeking out
            ...spikes(54, 54, 34, 7, 200, -60, 25),                        // spikes nearly all the way round
            [60, 90], [44, 88], [30, 84], [20, 80],                        // tucked underside, back to the chin
        ] },
        { name: "sniffing", eye: [16, 60], pts: [
            ...S([4, 48]), [10, 51], [18, 55], [26, 57],                   // nose lifted, snout up to the brow
            ...spikes(58, 66, 32, 6, 148, -8, 17),                         // the spiny dome
            [88, 80], [82, 90], [74, 95], [66, 94], [62, 90],              // rump and hind foot
            [52, 91], [40, 91], [32, 95], [24, 95], [22, 89],              // belly and front foot
            [20, 80], [14, 72], [10, 64], [6, 56], [4, 52],                // round cheek and throat, back under the lifted nose
        ] },
      ],
    },
  };
  const NAMES = Object.keys(ANIMALS);

  /* ---------- ways of drawing ----------
   * base: brush width, wobble: how far control points drift, tremor: hand shake
   * across the line, press: pressure range, drop: share of control points the
   * hand skips (a looser, cruder drawing), dry: dry-brush patches.
   */
  const STYLES = [
    { key: "fine", label: "fine pen", base: 0.9, wobble: 0.5, tremor: 0.07, tremorN: 90, press: [0.8, 1], drop: 0, dry: false },
    { key: "brush", label: "ink brush", base: 2.3, wobble: 1.2, tremor: 0.2, tremorN: 70, press: [0.55, 1], drop: 0, dry: true },
    { key: "loose", label: "loose brush", base: 1.7, wobble: 2.2, tremor: 0.4, tremorN: 28, press: [0.35, 1], drop: 0.08, dry: true },
    { key: "bold", label: "bold marker", base: 3.3, wobble: 0.9, tremor: 0.1, tremorN: 50, press: [0.85, 1], drop: 0, dry: false },
  ];

  /* ---------- geometry ---------- */
  // Centripetal Catmull-Rom through the points: no overshoot between unevenly
  // spaced points. A point listed twice splits the curve, which makes a corner.
  function spline(pts, perSeg) {
    const runs = [[]];
    pts.forEach((p, i) => (i && pts[i - 1] === p ? runs.push([p]) : runs[runs.length - 1].push(p)));
    const out = [];
    const d = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-4;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    runs.forEach((run) => {
      const P = (i) => run[Math.max(0, Math.min(run.length - 1, i))];
      for (let i = 0; i < run.length - 1; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
        for (let k = 0; k < perSeg; k++) {
          const t = t1 + ((t2 - t1) * k) / perSeg;
          const A1 = mix(p0, p1, (t - t0) / (t1 - t0)), A2 = mix(p1, p2, (t - t1) / (t2 - t1)), A3 = mix(p2, p3, (t - t2) / (t3 - t2));
          const B1 = mix(A1, A2, (t - t0) / (t2 - t0)), B2 = mix(A2, A3, (t - t1) / (t3 - t1));
          out.push(mix(B1, B2, (t - t1) / (t2 - t1)));
        }
      }
      out.push(run[run.length - 1].slice());
    });
    return out;
  }

  // smooth random curve on 0..1 made of `n` knots with cosine interpolation
  function wave(r, n) {
    const k = Array.from({ length: n + 1 }, () => r());
    return (x) => {
      const f = clamp01(x) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
      const m = (1 - Math.cos(Math.PI * t)) / 2;
      return k[i] * (1 - m) + k[i + 1] * m;
    };
  }

  /* ---------- model ---------- */
  function build(name, seed, styleKey, poseIdx) {
    const a = ANIMALS[name];
    const r = rng(seed);
    const pi = poseIdx >= 0 && poseIdx < a.poses.length ? +poseIdx : Math.floor(r() * a.poses.length);
    const pose = a.poses[pi];
    const st = STYLES.find((x) => x.key === styleKey) || STYLES[Math.floor(r() * STYLES.length)];
    // the hand is never exact: nudge every control point a little
    let pts = pose.pts.map((p, i, arr) => {
      // a repeated point stays repeated, so corners survive the wobble
      if (i > 0 && arr[i - 1] === p) return null;
      return [p[0] + (r() - 0.5) * st.wobble, p[1] + (r() - 0.5) * st.wobble];
    });
    for (let i = 0; i < pts.length; i++) if (pts[i] === null) pts[i] = pts[i - 1];
    // a loose hand skips some of the smooth points (never a corner, nor the ends)
    if (st.drop) {
      const corner = (i) => i > 0 && i < pts.length - 1 && (pts[i - 1] === pts[i] || pts[i] === pts[i + 1]);
      pts = pts.filter((p, i) => i === 0 || i === pts.length - 1 || corner(i - 1) || corner(i) || corner(i + 1) || r() > st.drop);
    }

    const raw = spline(pts, 14);
    // arc length, then even resampling so the reveal moves at constant speed
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const L = cum[cum.length - 1], N = 700, path = [];
    for (let i = 0, j = 0; i <= N; i++) {
      const d = (i / N) * L;
      while (j < cum.length - 2 && cum[j + 1] < d) j++;
      const t = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0;
      path.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * t, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * t]);
    }

    const pressure = wave(r, 10), tremor = wave(r, st.tremorN);
    const lifts = [0.15 + r() * 0.2, 0.4 + r() * 0.2, 0.65 + r() * 0.25]; // where the brush ran dry
    const inks = ["ink", "ink", "ink", "ink", "beet", "moss"];
    const [lo, hi] = st.press;
    return {
      name, label: a.label, pose: pi, poseLabel: pose.name, style: st,
      eye: [pose.eye[0] + (r() - 0.5) * st.wobble, pose.eye[1] + (r() - 0.5) * st.wobble],
      path, length: L, ink: inks[Math.floor(r() * inks.length)],
      // brush width along the stroke, 0..1: random pressure, lighter at both ends
      width: (s) => {
        const taper = Math.min(1, s / 0.035, (1 - s) / 0.05);
        return (lo + (hi - lo) * pressure(s)) * (0.3 + 0.7 * easeOut(clamp01(taper)));
      },
      tremor: (s) => (tremor(s) - 0.5) * 2 * st.tremor,
      dry: (s) => st.dry && lifts.some((l) => Math.abs(s - l) < 0.025),
    };
  }

  /* ---------- drawing ---------- */
  // progress: 0..1 of the stroke length; eye: 0..1 of the eye dab
  function draw(ctx, m, W, H, progress, eye, pal) {
    const pad = Math.min(W, H) * 0.08;
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / 100;
    const ox = (W - 100 * scale) / 2, oy = (H - 100 * scale) / 2;
    const X = (p) => [ox + p[0] * scale, oy + p[1] * scale];
    const base = scale * m.style.base; // full-pressure brush width
    const n = Math.max(1, Math.floor(progress * (m.path.length - 1)));

    // centre line with a touch of hand tremor across the stroke
    const C = [], T = [];
    for (let i = 0; i <= n; i++) {
      const a = m.path[Math.max(0, i - 1)], b = m.path[Math.min(m.path.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const s = i / (m.path.length - 1);
      const [x, y] = X(m.path[i]);
      const j = m.tremor(s) * scale;
      C.push([x - dy * j, y + dx * j]);
      // like an ink brush: fuller when pulled down the page, finer when pushed up
      T.push([-dy, dx, m.width(s) * base * (0.9 + 0.18 * dy)]);
    }

    // the ribbon: left edge forward, right edge back
    ctx.beginPath();
    for (let i = 0; i <= n; i++) ctx.lineTo(C[i][0] + T[i][0] * T[i][2] / 2, C[i][1] + T[i][1] * T[i][2] / 2);
    for (let i = n; i >= 0; i--) ctx.lineTo(C[i][0] - T[i][0] * T[i][2] / 2, C[i][1] - T[i][1] * T[i][2] / 2);
    ctx.closePath();
    ctx.fillStyle = pal[m.ink];
    ctx.fill();
    // round the two ends
    for (const i of [0, n]) {
      ctx.beginPath(); ctx.arc(C[i][0], C[i][1], T[i][2] / 2, 0, Math.PI * 2); ctx.fill();
    }
    // a wet blob where the brush first touched the paper
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(C[0][0], C[0][1], base * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // dry-brush streaks: paper shows through where the pressure was light
    ctx.strokeStyle = pal.paper; ctx.lineWidth = Math.max(0.7, base * 0.12); ctx.lineCap = "round";
    ctx.globalAlpha = 0.5;
    for (const off of [-0.24, 0.05, 0.27]) {
      let open = false;
      for (let i = 0; i <= n; i++) {
        const s = i / (m.path.length - 1);
        if (m.dry(s)) {
          const x = C[i][0] + T[i][0] * T[i][2] * off, y = C[i][1] + T[i][1] * T[i][2] * off;
          if (!open) { ctx.beginPath(); ctx.moveTo(x, y); open = true; } else ctx.lineTo(x, y);
        } else if (open) { ctx.stroke(); open = false; }
      }
      if (open) ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the brush tip, hovering just ahead while the stroke is still going
    if (progress < 1) {
      const [x, y] = C[n];
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(x, y, base * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // the eye, dabbed on last
    if (eye > 0) {
      const [x, y] = X(m.eye), k = easeOut(eye), e = Math.max(base * 0.34, scale * 0.6);
      ctx.beginPath(); ctx.ellipse(x, y, e * k, e * 0.78 * k, -0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: w, H: h };
  }

  /* ---------- the animated sketch ---------- */
  function sketch(canvas, onInfo) {
    let m = null, seed = 0, start = 0, raf = 0, animating = false, duration = 2400;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const EYE_PAUSE = 260, EYE = 220;

    function frame(now) {
      const { ctx, W, H } = fit(canvas);
      const pal = palette();
      const t = reduce ? 1e9 : now - start;
      ctx.clearRect(0, 0, W, H);
      const progress = easeInOut(clamp01(t / duration));
      const eye = clamp01((t - duration - EYE_PAUSE) / EYE);
      draw(ctx, m, W, H, progress, eye, pal);
      animating = eye < 1;
      if (animating) raf = requestAnimationFrame(frame);
    }

    // name: one of Sketch.NAMES, style: one of Sketch.STYLES keys, pose: an index; nothing means random
    function paint(name, newSeed, style, pose) {
      seed = newSeed ?? Math.floor(Math.random() * 9000) + 1000;
      const r = rng(seed);
      const which = ANIMALS[name] ? name : NAMES[Math.floor(r() * NAMES.length)];
      m = build(which, seed, style, pose);
      duration = 900 + m.length * 5; // longer strokes take longer, like a real hand
      cancelAnimationFrame(raf);
      start = performance.now();
      raf = requestAnimationFrame(frame);
      if (onInfo) onInfo({ seed, name: which, label: m.label, pose: m.pose, poseLabel: m.poseLabel, style: m.style.key, styleLabel: m.style.label });
    }

    const still = () => { if (!animating && m) frame(performance.now()); };
    new ResizeObserver(still).observe(canvas);
    document.addEventListener("themechange", still);

    return { paint, get seed() { return seed; }, get name() { return m && m.name; }, get style() { return m && m.style.key; } };
  }

  // draw a finished sketch at once, no animation
  function still(canvas, name, seed, style, pose) {
    const { ctx, W, H } = fit(canvas);
    ctx.clearRect(0, 0, W, H);
    draw(ctx, build(ANIMALS[name] ? name : NAMES[0], seed || 1, style, pose), W, H, 1, 1, palette());
  }

  return { sketch, still, NAMES, ANIMALS, STYLES, labelOf: (n) => ANIMALS[n] && ANIMALS[n].label };
})();
