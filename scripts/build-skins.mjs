// Builds the colour themes ("skins") from their palettes:
//   src/styles/skins.css  — token overrides per theme, light and dark
//   src/lib/skins.ts      — names and preview swatches for the Settings menu
// Run: node scripts/build-skins.mjs   (re-run after editing a palette below)
//
// Each theme maps its palette onto Lesepult's design tokens (see src/styles/tokens.css).
// Text colours are checked for contrast (WCAG): where a palette colour is too faint for the
// role it plays, it is moved toward legible in OKLab (same hue, a little darker or lighter),
// and the script reports it.
import { writeFileSync } from "node:fs";

/* ---------- Colour maths (sRGB hex ⇄ OKLab, WCAG contrast) ---------- */

const hexToRgb = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};
const rgbToHex = (c) =>
  "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return rgbToHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(fromLin),
  );
}
/** `amount` of `b` mixed into `a` (0 = a, 1 = b), in OKLab like CSS color-mix(in oklab). */
const mix = (a, b, amount) => {
  const A = toOklab(a);
  const B = toOklab(b);
  return fromOklab(A.map((v, i) => v + (B[i] - v) * amount));
};
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x, y) => {
  const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};
const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).map((v) => Math.round(v * 255)).join(", ")}, ${alpha})`;

const notes = [];
/** Moves `color` toward `toward` until it reaches `min` contrast against every background. */
function legible(color, backgrounds, toward, min, label) {
  let c = color;
  let step = 0;
  while (backgrounds.some((bg) => contrast(c, bg) < min) && step < 25) {
    step++;
    c = mix(color, toward, step * 0.04);
  }
  if (step) notes.push(`${label}: ${color} → ${c} (${(step * 4).toString()}% toward ${toward})`);
  return c;
}

/* ---------- Palettes ---------- */

// Per variant: surfaces from darkest-to-lightest in the light theme's sense (the dark ones are
// mapped analogously), text levels, an accent with the text colour on it, and six hues for tags,
// quotes and marks.
const THEMES = [
  {
    id: "catppuccin",
    name: "Catppuccin",
    variants: {
      light: (() => {
        // Latte
        const p = {
          crust: "#dce0e8", mantle: "#e6e9ef", base: "#eff1f5", surface0: "#ccd0da", surface1: "#bcc0cc",
          overlay1: "#8c8fa1", subtext0: "#6c6f85", subtext1: "#5c5f77", text: "#4c4f69",
          red: "#d20f39", peach: "#fe640b", yellow: "#df8e1d", green: "#40a02b", blue: "#1e66f5", mauve: "#8839ef",
        };
        return {
          bg: p.mantle, sidebar: p.crust, surface: p.base, paper: mix(p.base, "#ffffff", 0.5),
          pdfBackdrop: p.surface0, toolbar: mix(p.mantle, p.crust, 0.5), segment: mix(p.surface0, p.base, 0.45),
          field: p.base, line: p.surface0, lineStrong: p.surface1, linePane: p.surface0, lineCard: mix(p.surface0, p.base, 0.4),
          sidebarActive: p.surface0, hoverMenu: mix(p.surface0, p.base, 0.55), hoverTool: p.surface0, rowActions: mix(p.surface0, p.base, 0.3),
          ink: p.text, inkSoft: p.subtext1, meta: p.subtext0, muted: p.subtext0, faint: p.overlay1,
          accent: p.mauve, onAccent: p.base, danger: p.red,
          hues: { red: p.red, orange: p.peach, yellow: p.yellow, green: p.green, blue: p.blue, purple: p.mauve },
        };
      })(),
      dark: (() => {
        // Mocha
        const p = {
          crust: "#11111b", mantle: "#181825", base: "#1e1e2e", surface0: "#313244", surface1: "#45475a",
          overlay1: "#7f849c", subtext0: "#a6adc8", subtext1: "#bac2de", text: "#cdd6f4",
          red: "#f38ba8", peach: "#fab387", yellow: "#f9e2af", green: "#a6e3a1", blue: "#89b4fa", mauve: "#cba6f7",
        };
        return {
          bg: p.base, sidebar: p.mantle, surface: mix(p.base, p.surface0, 0.12), paper: mix(p.base, p.surface0, 0.45),
          pdfBackdrop: p.crust, toolbar: p.mantle, segment: p.surface0,
          field: p.mantle, line: p.surface0, lineStrong: p.surface1, linePane: mix(p.mantle, p.surface0, 0.6), lineCard: p.surface0,
          sidebarActive: p.surface0, hoverMenu: p.surface0, hoverTool: p.surface0, rowActions: mix(p.base, p.surface0, 0.5),
          ink: p.text, inkSoft: p.subtext1, meta: p.subtext0, muted: p.subtext0, faint: p.overlay1,
          accent: p.mauve, onAccent: p.crust, danger: p.red,
          hues: { red: p.red, orange: p.peach, yellow: p.yellow, green: p.green, blue: p.blue, purple: p.mauve },
        };
      })(),
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    variants: {
      light: (() => {
        // Dawn
        const p = {
          base: "#faf4ed", surface: "#fffaf3", overlay: "#f2e9e1", muted: "#9893a5", subtle: "#797593", text: "#575279",
          love: "#b4637a", gold: "#ea9d34", rose: "#d7827e", pine: "#286983", foam: "#56949f", iris: "#907aa9",
          hlLow: "#f4ede8", hlMed: "#dfdad9", hlHigh: "#cecacd",
        };
        return {
          bg: p.base, sidebar: p.overlay, surface: p.surface, paper: mix(p.surface, "#ffffff", 0.4),
          pdfBackdrop: p.hlMed, toolbar: p.overlay, segment: mix(p.overlay, p.hlMed, 0.4),
          field: p.base, line: p.hlMed, lineStrong: p.hlHigh, linePane: p.hlMed, lineCard: mix(p.overlay, p.hlMed, 0.3),
          sidebarActive: p.hlMed, hoverMenu: p.hlLow, hoverTool: p.hlMed, rowActions: p.overlay,
          ink: p.text, inkSoft: mix(p.text, p.subtle, 0.4), meta: p.subtle, muted: p.subtle, faint: p.muted,
          accent: p.love, onAccent: p.surface, danger: mix(p.love, "#b4402a", 0.5),
          hues: { red: p.love, orange: p.rose, yellow: p.gold, green: p.foam, blue: p.pine, purple: p.iris },
        };
      })(),
      dark: (() => {
        // Main
        const p = {
          base: "#191724", surface: "#1f1d2e", overlay: "#26233a", muted: "#6e6a86", subtle: "#908caa", text: "#e0def4",
          love: "#eb6f92", gold: "#f6c177", rose: "#ebbcba", pine: "#31748f", foam: "#9ccfd8", iris: "#c4a7e7",
          hlLow: "#21202e", hlMed: "#403d52", hlHigh: "#524f67",
        };
        return {
          bg: p.base, sidebar: mix(p.base, "#000000", 0.18), surface: p.surface, paper: p.overlay,
          pdfBackdrop: mix(p.base, "#000000", 0.35), toolbar: mix(p.base, p.surface, 0.5), segment: p.overlay,
          field: mix(p.base, "#000000", 0.1), line: mix(p.overlay, p.hlMed, 0.45), lineStrong: p.hlMed, linePane: p.overlay, lineCard: mix(p.overlay, p.hlMed, 0.35),
          sidebarActive: p.overlay, hoverMenu: mix(p.overlay, p.hlMed, 0.4), hoverTool: p.overlay, rowActions: p.hlLow,
          ink: p.text, inkSoft: mix(p.text, p.subtle, 0.3), meta: p.subtle, muted: p.subtle, faint: p.muted,
          accent: p.rose, onAccent: p.base, danger: p.love,
          hues: { red: p.love, orange: p.rose, yellow: p.gold, green: p.foam, blue: p.pine, purple: p.iris },
        };
      })(),
    },
  },
  {
    id: "nord",
    name: "Nord",
    variants: {
      light: (() => {
        const n = {
          n0: "#2e3440", n1: "#3b4252", n2: "#434c5e", n3: "#4c566a", n4: "#d8dee9", n5: "#e5e9f0", n6: "#eceff4",
          n8: "#88c0d0", n10: "#5e81ac", n11: "#bf616a", n12: "#d08770", n13: "#ebcb8b", n14: "#a3be8c", n15: "#b48ead",
        };
        return {
          bg: n.n5, sidebar: mix(n.n4, n.n5, 0.45), surface: n.n6, paper: mix(n.n6, "#ffffff", 0.5),
          pdfBackdrop: n.n4, toolbar: mix(n.n4, n.n5, 0.5), segment: mix(n.n4, n.n6, 0.35),
          field: n.n6, line: mix(n.n4, n.n3, 0.08), lineStrong: mix(n.n4, n.n3, 0.18), linePane: n.n4, lineCard: mix(n.n4, n.n6, 0.3),
          sidebarActive: n.n4, hoverMenu: mix(n.n4, n.n6, 0.5), hoverTool: n.n4, rowActions: mix(n.n4, n.n6, 0.4),
          ink: n.n0, inkSoft: n.n1, meta: n.n2, muted: n.n3, faint: mix(n.n3, n.n4, 0.35),
          accent: n.n10, onAccent: n.n6, danger: n.n11,
          hues: { red: n.n11, orange: n.n12, yellow: n.n13, green: n.n14, blue: n.n10, purple: n.n15 },
        };
      })(),
      dark: (() => {
        const n = {
          n0: "#2e3440", n1: "#3b4252", n2: "#434c5e", n3: "#4c566a", n4: "#d8dee9", n5: "#e5e9f0", n6: "#eceff4",
          n8: "#88c0d0", n9: "#81a1c1", n11: "#bf616a", n12: "#d08770", n13: "#ebcb8b", n14: "#a3be8c", n15: "#b48ead",
        };
        return {
          bg: n.n0, sidebar: mix(n.n0, "#000000", 0.15), surface: mix(n.n0, n.n1, 0.25), paper: n.n1,
          pdfBackdrop: mix(n.n0, "#000000", 0.25), toolbar: mix(n.n0, "#000000", 0.07), segment: n.n1,
          field: mix(n.n0, "#000000", 0.1), line: n.n2, lineStrong: n.n3, linePane: n.n1, lineCard: mix(n.n1, n.n2, 0.6),
          sidebarActive: n.n1, hoverMenu: n.n2, hoverTool: n.n2, rowActions: n.n1,
          ink: n.n6, inkSoft: n.n5, meta: n.n4, muted: mix(n.n4, n.n3, 0.3), faint: mix(n.n3, n.n4, 0.4),
          accent: n.n8, onAccent: n.n0, danger: n.n11,
          hues: { red: n.n11, orange: n.n12, yellow: n.n13, green: n.n14, blue: n.n9, purple: n.n15 },
        };
      })(),
    },
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    variants: {
      light: (() => {
        const g = {
          bg0h: "#f9f5d7", bg0: "#fbf1c7", bg0s: "#f2e5bc", bg1: "#ebdbb2", bg2: "#d5c4a1", bg3: "#bdae93",
          fg: "#3c3836", fg2: "#504945", fg3: "#665c54", fg4: "#7c6f64", gray: "#928374",
          red: "#9d0006", orange: "#af3a03", yellow: "#b57614", green: "#79740e", blue: "#076678", purple: "#8f3f71",
        };
        return {
          bg: g.bg0, sidebar: g.bg0s, surface: g.bg0h, paper: mix(g.bg0h, "#ffffff", 0.4),
          pdfBackdrop: g.bg1, toolbar: g.bg0s, segment: mix(g.bg1, g.bg0s, 0.4),
          field: g.bg0h, line: mix(g.bg1, g.bg2, 0.5), lineStrong: g.bg2, linePane: g.bg1, lineCard: mix(g.bg1, g.bg0s, 0.3),
          sidebarActive: g.bg1, hoverMenu: mix(g.bg0s, g.bg1, 0.5), hoverTool: g.bg1, rowActions: mix(g.bg0s, g.bg1, 0.6),
          ink: g.fg, inkSoft: g.fg2, meta: g.fg3, muted: g.fg4, faint: g.gray,
          accent: g.orange, onAccent: g.bg0h, danger: g.red,
          hues: { red: g.red, orange: g.orange, yellow: g.yellow, green: g.green, blue: g.blue, purple: g.purple },
        };
      })(),
      dark: (() => {
        const g = {
          bg0h: "#1d2021", bg0: "#282828", bg0s: "#32302f", bg1: "#3c3836", bg2: "#504945", bg3: "#665c54",
          fg: "#ebdbb2", fg2: "#d5c4a1", fg3: "#bdae93", fg4: "#a89984", gray: "#928374",
          red: "#fb4934", orange: "#fe8019", yellow: "#fabd2f", green: "#b8bb26", blue: "#83a598", purple: "#d3869b",
        };
        return {
          bg: g.bg0, sidebar: g.bg0h, surface: mix(g.bg0, g.bg0s, 0.3), paper: g.bg0s,
          pdfBackdrop: mix(g.bg0h, "#000000", 0.25), toolbar: mix(g.bg0, g.bg0h, 0.5), segment: g.bg1,
          field: g.bg0h, line: g.bg1, lineStrong: g.bg2, linePane: mix(g.bg0s, g.bg1, 0.5), lineCard: g.bg1,
          sidebarActive: g.bg1, hoverMenu: g.bg1, hoverTool: g.bg1, rowActions: g.bg0s,
          ink: g.fg, inkSoft: g.fg2, meta: g.fg3, muted: g.fg4, faint: g.gray,
          accent: g.orange, onAccent: g.bg0h, danger: g.red,
          hues: { red: g.red, orange: g.orange, yellow: g.yellow, green: g.green, blue: g.blue, purple: g.purple },
        };
      })(),
    },
  },
  {
    id: "solarized",
    name: "Solarized",
    variants: {
      light: (() => {
        const s = {
          base03: "#002b36", base02: "#073642", base01: "#586e75", base00: "#657b83", base0: "#839496",
          base1: "#93a1a1", base2: "#eee8d5", base3: "#fdf6e3",
          yellow: "#b58900", orange: "#cb4b16", red: "#dc322f", magenta: "#d33682", violet: "#6c71c4",
          blue: "#268bd2", cyan: "#2aa198", green: "#859900",
        };
        return {
          bg: mix(s.base3, s.base2, 0.45), sidebar: s.base2, surface: s.base3, paper: mix(s.base3, "#ffffff", 0.45),
          pdfBackdrop: mix(s.base2, s.base1, 0.3), toolbar: s.base2, segment: mix(s.base2, s.base1, 0.15),
          field: s.base3, line: mix(s.base2, s.base1, 0.3), lineStrong: mix(s.base2, s.base1, 0.5), linePane: mix(s.base2, s.base1, 0.25), lineCard: mix(s.base2, s.base1, 0.12),
          sidebarActive: mix(s.base2, s.base1, 0.25), hoverMenu: mix(s.base3, s.base2, 0.7), hoverTool: mix(s.base2, s.base1, 0.2), rowActions: mix(s.base2, s.base1, 0.12),
          ink: s.base02, inkSoft: s.base01, meta: s.base00, muted: s.base00, faint: s.base1,
          accent: s.blue, onAccent: s.base3, danger: s.red,
          hues: { red: s.red, orange: s.orange, yellow: s.yellow, green: s.green, blue: s.blue, purple: s.violet },
        };
      })(),
      dark: (() => {
        const s = {
          base03: "#002b36", base02: "#073642", base01: "#586e75", base00: "#657b83", base0: "#839496",
          base1: "#93a1a1", base2: "#eee8d5", base3: "#fdf6e3",
          yellow: "#b58900", orange: "#cb4b16", red: "#dc322f", magenta: "#d33682", violet: "#6c71c4",
          blue: "#268bd2", cyan: "#2aa198", green: "#859900",
        };
        return {
          bg: s.base03, sidebar: mix(s.base03, "#000000", 0.18), surface: mix(s.base03, s.base02, 0.3), paper: s.base02,
          pdfBackdrop: mix(s.base03, "#000000", 0.35), toolbar: mix(s.base03, "#000000", 0.08), segment: s.base02,
          field: mix(s.base03, "#000000", 0.12), line: mix(s.base02, s.base01, 0.3), lineStrong: mix(s.base02, s.base01, 0.55), linePane: mix(s.base02, s.base01, 0.15), lineCard: mix(s.base02, s.base01, 0.25),
          sidebarActive: s.base02, hoverMenu: mix(s.base02, s.base01, 0.25), hoverTool: mix(s.base02, s.base01, 0.2), rowActions: s.base02,
          ink: mix(s.base1, s.base2, 0.45), inkSoft: s.base1, meta: s.base0, muted: s.base0, faint: s.base01,
          accent: s.blue, onAccent: s.base03, danger: s.red,
          hues: { red: s.red, orange: s.orange, yellow: s.yellow, green: s.green, blue: s.blue, purple: s.violet },
        };
      })(),
    },
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    // Lesepult's own: candy pink with plum ink by day, a berry night with bubblegum pink after dark.
    variants: {
      light: (() => {
        const b = {
          blush: "#fdeef5", petal: "#fbe2ee", cream: "#fff7fb", white: "#ffffff", rose: "#f6cfe0", rose2: "#eeb9d0",
          plum: "#4a2040", plum2: "#64355a", mauve: "#7d5272", lilac: "#a07f96",
          pink: "#e8448d", red: "#e5486b", peach: "#ff8a65", butter: "#e9a93a", mint: "#3fa37c", sky: "#4f8fe6", lavender: "#9a6bea",
        };
        return {
          bg: b.blush, sidebar: b.petal, surface: b.cream, paper: b.white,
          pdfBackdrop: mix(b.rose, b.petal, 0.3), toolbar: b.petal, segment: mix(b.rose, b.cream, 0.45),
          field: b.cream, line: b.rose, lineStrong: b.rose2, linePane: mix(b.rose, b.petal, 0.4), lineCard: mix(b.rose, b.cream, 0.45),
          sidebarActive: b.rose, hoverMenu: mix(b.rose, b.cream, 0.55), hoverTool: b.rose, rowActions: mix(b.rose, b.cream, 0.35),
          ink: b.plum, inkSoft: b.plum2, meta: b.mauve, muted: b.mauve, faint: b.lilac,
          accent: b.pink, onAccent: b.white, danger: b.red,
          hues: { red: b.red, orange: b.peach, yellow: b.butter, green: b.mint, blue: b.sky, purple: b.lavender },
        };
      })(),
      dark: (() => {
        const b = {
          night: "#24131f", berry: "#2c1727", berry2: "#341c2f", berry3: "#3f2339", line: "#4d2c46", line2: "#62395a",
          ink: "#ffe8f3", ink2: "#f3cde0", muted: "#cfa0bd", faint: "#9c7390",
          pink: "#ff8fc4", red: "#ff7a9a", peach: "#ffb08a", butter: "#ffd98a", mint: "#8fe3c0", sky: "#9cc8ff", lavender: "#d3b0ff",
        };
        return {
          bg: b.berry, sidebar: b.night, surface: mix(b.berry, b.berry2, 0.5), paper: b.berry3,
          pdfBackdrop: mix(b.night, "#000000", 0.3), toolbar: mix(b.night, b.berry, 0.5), segment: b.berry3,
          field: b.night, line: b.line, lineStrong: b.line2, linePane: mix(b.berry3, b.line, 0.5), lineCard: b.line,
          sidebarActive: b.berry3, hoverMenu: b.line, hoverTool: b.berry3, rowActions: b.berry2,
          ink: b.ink, inkSoft: b.ink2, meta: b.muted, muted: b.muted, faint: b.faint,
          accent: b.pink, onAccent: b.night, danger: b.red,
          hues: { red: b.red, orange: b.peach, yellow: b.butter, green: b.mint, blue: b.sky, purple: b.lavender },
        };
      })(),
    },
  },
  {
    id: "everforest",
    name: "Everforest",
    variants: {
      light: (() => {
        // Light, medium contrast
        const e = {
          bgDim: "#efebd4", bg0: "#fdf6e3", bg1: "#f4f0d9", bg2: "#efebd4", bg3: "#e6e2cc", bg4: "#e0dcc7", bg5: "#bdc3af",
          fg: "#5c6a72", grey0: "#a6b0a0", grey1: "#939f91", grey2: "#829181",
          red: "#f85552", orange: "#f57d26", yellow: "#dfa000", green: "#8da101", aqua: "#35a77c", blue: "#3a94c5", purple: "#df69ba",
        };
        return {
          bg: e.bg1, sidebar: e.bg2, surface: e.bg0, paper: mix(e.bg0, "#ffffff", 0.4),
          pdfBackdrop: e.bg4, toolbar: e.bg2, segment: e.bg3,
          field: e.bg0, line: e.bg4, lineStrong: mix(e.bg4, e.bg5, 0.5), linePane: e.bg3, lineCard: e.bg3,
          sidebarActive: e.bg3, hoverMenu: mix(e.bg2, e.bg3, 0.5), hoverTool: e.bg3, rowActions: e.bg2,
          ink: mix(e.fg, "#2b3339", 0.35), inkSoft: e.fg, meta: e.grey2, muted: e.grey2, faint: e.grey1,
          accent: e.green, onAccent: e.bg0, danger: e.red,
          hues: { red: e.red, orange: e.orange, yellow: e.yellow, green: e.aqua, blue: e.blue, purple: e.purple },
        };
      })(),
      dark: (() => {
        // Dark, medium contrast
        const e = {
          bgDim: "#232a2e", bg0: "#2d353b", bg1: "#343f44", bg2: "#3d484d", bg3: "#475258", bg4: "#4f585e",
          fg: "#d3c6aa", grey0: "#7a8478", grey1: "#859289", grey2: "#9da9a0",
          red: "#e67e80", orange: "#e69875", yellow: "#dbbc7f", green: "#a7c080", aqua: "#83c092", blue: "#7fbbb3", purple: "#d699b6",
        };
        return {
          bg: e.bg0, sidebar: e.bgDim, surface: mix(e.bg0, e.bg1, 0.3), paper: e.bg1,
          pdfBackdrop: mix(e.bgDim, "#000000", 0.25), toolbar: mix(e.bg0, e.bgDim, 0.5), segment: e.bg2,
          field: e.bgDim, line: e.bg2, lineStrong: e.bg3, linePane: mix(e.bg1, e.bg2, 0.5), lineCard: e.bg2,
          sidebarActive: e.bg2, hoverMenu: e.bg2, hoverTool: e.bg2, rowActions: e.bg1,
          ink: e.fg, inkSoft: mix(e.fg, e.grey2, 0.35), meta: e.grey2, muted: e.grey2, faint: e.grey1,
          accent: e.green, onAccent: e.bg0, danger: e.red,
          hues: { red: e.red, orange: e.orange, yellow: e.yellow, green: e.aqua, blue: e.blue, purple: e.purple },
        };
      })(),
    },
  },
  {
    id: "one",
    name: "One",
    // Atom's One Light / One Dark (as in many editors).
    variants: {
      light: (() => {
        const o = {
          bg: "#fafafa", bg2: "#f0f0f0", bg3: "#e5e5e6", line: "#dbdbdc", line2: "#c9c9ca",
          fg: "#383a42", fg2: "#4f525e", comment: "#696c77", faint: "#a0a1a7",
          red: "#e45649", orange: "#986801", yellow: "#c18401", green: "#50a14f", blue: "#4078f2", purple: "#a626a4", cyan: "#0184bc",
        };
        return {
          bg: o.bg2, sidebar: mix(o.bg2, o.bg3, 0.5), surface: o.bg, paper: "#ffffff",
          pdfBackdrop: o.bg3, toolbar: mix(o.bg2, o.bg3, 0.4), segment: o.bg3,
          field: o.bg, line: o.line, lineStrong: o.line2, linePane: o.line, lineCard: mix(o.bg3, o.line, 0.5),
          sidebarActive: o.bg3, hoverMenu: mix(o.bg2, o.bg3, 0.6), hoverTool: o.bg3, rowActions: o.bg3,
          ink: o.fg, inkSoft: o.fg2, meta: o.comment, muted: o.comment, faint: o.faint,
          accent: o.blue, onAccent: "#ffffff", danger: o.red,
          hues: { red: o.red, orange: o.orange, yellow: o.yellow, green: o.green, blue: o.blue, purple: o.purple },
        };
      })(),
      dark: (() => {
        const o = {
          bg: "#282c34", darker: "#21252b", darkest: "#1b1d23", raised: "#2c313a", line: "#3e4451", line2: "#4b5263",
          fg: "#abb2bf", fg2: "#9da5b4", comment: "#7f848e", faint: "#5c6370",
          red: "#e06c75", orange: "#d19a66", yellow: "#e5c07b", green: "#98c379", blue: "#61afef", purple: "#c678dd", cyan: "#56b6c2",
        };
        return {
          bg: o.bg, sidebar: o.darker, surface: o.bg, paper: o.raised,
          pdfBackdrop: o.darkest, toolbar: o.darker, segment: o.raised,
          field: o.darker, line: o.line, lineStrong: o.line2, linePane: mix(o.raised, o.line, 0.5), lineCard: o.line,
          sidebarActive: o.raised, hoverMenu: o.line, hoverTool: o.raised, rowActions: o.raised,
          ink: mix(o.fg, "#ffffff", 0.25), inkSoft: o.fg, meta: o.fg2, muted: o.comment, faint: o.faint,
          accent: o.blue, onAccent: o.darkest, danger: o.red,
          hues: { red: o.red, orange: o.orange, yellow: o.yellow, green: o.green, blue: o.blue, purple: o.purple },
        };
      })(),
    },
  },
];

/* ---------- Palette → tokens ---------- */

function tokens(t, v, dark) {
  const P = { ...v };
  const label = (k) => `${t.name} ${dark ? "dark" : "light"} ${k}`;
  const backs = [P.bg, P.surface, P.paper, P.sidebar];
  const towardText = dark ? "#ffffff" : "#000000";

  // Text levels: body text 4.5:1 on every surface, the faintest 3:1.
  for (const k of ["ink", "inkSoft", "meta", "muted"]) P[k] = legible(P[k], backs, towardText, 4.5, label(k));
  P.faint = legible(P.faint, backs, towardText, 3, label("faint"));
  // Accent: its button label must read (4.5:1); moving the accent away from the label colour
  // also keeps accent-coloured text legible on the page.
  P.accent = legible(P.accent, [P.onAccent], dark ? "#ffffff" : "#000000", 4.5, label("accent"));
  P.danger = legible(P.danger, [P.paper, P.surface], towardText, 4.5, label("danger"));

  const H = P.hues;
  const tint = (c, a) => mix(P.paper, c, a);
  const onTint = (c, bg, k) => legible(dark ? c : mix(c, P.ink, 0.25), [bg], towardText, 4.5, label(k));

  const out = {
    "color-scheme": dark ? "dark" : "light",
    "--bg": P.bg,
    "--sidebar": P.sidebar,
    "--sidebar-active": P.sidebarActive,
    "--surface": P.surface,
    "--paper": P.paper,
    "--pdf-backdrop": P.pdfBackdrop,
    "--toolbar": P.toolbar,
    "--segment": P.segment,
    "--field": P.field,
    "--line": P.line,
    "--line-strong": P.lineStrong,
    "--line-pane": P.linePane,
    "--line-card": P.lineCard,
    "--ink": P.ink,
    "--ink-soft": P.inkSoft,
    "--meta": P.meta,
    "--muted": P.muted,
    "--faint": P.faint,
    "--hover": rgba(P.ink, dark ? 0.05 : 0.045),
    "--hover-menu": P.hoverMenu,
    "--hover-tool": P.hoverTool,
    "--row-actions": P.rowActions,
    "--accent": P.accent,
    "--accent-hover": mix(P.accent, dark ? "#ffffff" : "#000000", 0.12),
    "--on-accent": P.onAccent,
    "--danger": P.danger,
    "--danger-tint": tint(H.red, dark ? 0.2 : 0.14),
    "--mark": dark ? rgba(H.yellow, 0.4) : mix(P.paper, H.yellow, 0.5),
    "--text-selection": rgba(P.accent, dark ? 0.35 : 0.25),
    "--backdrop": rgba(dark ? "#000000" : P.ink, dark ? 0.55 : 0.28),
    "--scrim": rgba(dark ? "#000000" : P.ink, dark ? 0.3 : 0.12),
  };
  for (const [name, hue] of [
    ["yellow", H.yellow],
    ["blue", H.blue],
    ["green", H.green],
  ]) {
    const bg = tint(hue, dark ? 0.16 : 0.16);
    out[`--quote-${name}-tint`] = bg;
    out[`--quote-${name}-swatch`] = hue;
    out[`--quote-${name}-head`] = onTint(hue, bg, `quote ${name}`);
  }
  for (const [name, hue] of [
    ["moss", H.green],
    ["clay", H.red],
    ["sky", H.blue],
    ["ochre", H.yellow],
    ["plum", H.purple],
    ["sand", P.muted],
  ]) {
    const bg = tint(hue, dark ? 0.2 : 0.16);
    out[`--tag-${name}-bg`] = bg;
    out[`--tag-${name}-fg`] = onTint(hue, bg, `tag ${name}`);
  }
  // Shadows tinted with the theme's ink in light mode; plain black ones in dark mode. (Every key
  // is set in both variants, so the light rule never leaks into dark mode.)
  const sh = dark ? "#000000" : P.ink;
  out["--shadow-pop"] = dark
    ? `0 12px 32px ${rgba(sh, 0.45)}, 0 0 0 1px ${rgba(P.ink, 0.04)}`
    : `0 10px 30px ${rgba(sh, 0.14)}`;
  out["--shadow-page"] = `0 1px 2px ${rgba(sh, dark ? 0.4 : 0.12)}, 0 8px 24px ${rgba(sh, dark ? 0.35 : 0.1)}`;
  out["--shadow-chip"] = `0 1px 3px ${rgba(sh, dark ? 0.5 : 0.25)}`;
  return out;
}

/* ---------- Output ---------- */

const block = (selector, tk) =>
  `  ${selector} {\n${Object.entries(tk)
    .map(([k, v]) => `    ${k}: ${v};`)
    .join("\n")}\n  }`;

let css = `/*
 * Colour themes ("skins"), chosen by <html data-skin="…">; light/dark still comes from data-theme.
 * GENERATED by scripts/build-skins.mjs from the palettes there — edit those and re-run.
 * Screen only: printing and PDF export keep the plain light look (tokens.css).
 */
@media screen {
`;
const meta = [];
for (const t of THEMES) {
  const light = tokens(t, t.variants.light, false);
  const dark = tokens(t, t.variants.dark, true);
  // Same keys in both, so the light rule never leaks into dark mode.
  const missing = Object.keys(light).filter((k) => !(k in dark));
  if (missing.length) throw new Error(`${t.name}: dark variant lacks ${missing.join(", ")}`);
  css += `${block(`:root[data-skin="${t.id}"]`, light)}\n\n${block(`:root[data-skin="${t.id}"][data-theme="dark"]`, dark)}\n\n`;
  meta.push({
    id: t.id,
    name: t.name,
    light: { bg: light["--bg"], paper: light["--paper"], ink: light["--ink"], accent: light["--accent"], line: light["--line"] },
    dark: { bg: dark["--bg"], paper: dark["--paper"], ink: dark["--ink"], accent: dark["--accent"], line: dark["--line"] },
  });
}
css = css.trimEnd() + "\n}\n";
writeFileSync(new URL("../src/styles/skins.css", import.meta.url), css);

const ts = `/* GENERATED by scripts/build-skins.mjs — names and preview swatches of the colour themes. */

export interface SkinSwatch {
  bg: string;
  paper: string;
  ink: string;
  accent: string;
  line: string;
}

export interface Skin {
  id: string;
  name: string;
  light: SkinSwatch;
  dark: SkinSwatch;
}

export const SKINS: Skin[] = ${JSON.stringify(meta, null, 2)};
`;
writeFileSync(new URL("../src/lib/skins.ts", import.meta.url), ts);

console.log(`${THEMES.length} themes written.`);
if (notes.length) console.log(`Adjusted for contrast:\n  ${notes.join("\n  ")}`);
