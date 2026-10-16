/**
 * Turns text selected in a PDF into readable text with inline LaTeX for formulas.
 *
 * A PDF has no formulas, only positioned glyphs. But slides made with LaTeX keep enough clues:
 * - the font: TeX's math fonts (CMMI italic letters, CMSY symbols, CMEX big operators, MSBM
 *   blackboard letters) only appear in formulas;
 * - size and baseline: sub- and superscripts are smaller and shifted down or up.
 * From these, inline formulas such as i₁ · i₂ ∈ N become `$i_1 \cdot i_2 \in \mathbf{N}$`.
 * 2D layouts (fractions, matrices) can't be rebuilt from glyph positions this way.
 *
 * It also repairs German umlauts that old TeX encodings store as an accent plus a letter
 * ("nat¨urlich" → "natürlich").
 */

export interface TextRun {
  text: string;
  /** The PDF's font name, e.g. "EHUXDU+CMSS10" (may be empty). */
  font: string;
  /** Font size in PDF points. */
  size: number;
  /** Baseline start in PDF points (y grows upwards). */
  x: number;
  y: number;
  /** Advance width in PDF points. */
  width: number;
}

type FontKind = "text" | "italic" | "mathItalic" | "symbol" | "ext" | "blackboard" | "bold" | "fraktur";

/** What role a font plays, from its name ("ABCDEF+CMMI10" → mathItalic). */
export function fontKind(font: string): FontKind {
  const name = font.replace(/^[A-Z]{6}\+/, "").toUpperCase();
  if (/^(CMMI|CMBRMI|LMMATHITALIC|EULER|EUR[MB])/.test(name) || /MATH-?ITALIC/.test(name)) return "mathItalic";
  if (/^(CMSY|CMBSY|CMBRS|LMMATHSYMBOLS|MSAM|STIXMATH|RSFS|EUS[MB])/.test(name) || /MATHSYMBOL/.test(name))
    return "symbol";
  if (/^(CMEX|LMMATHEXTENSION|EUEX|ESINT)/.test(name) || /MATHEXTENSION/.test(name)) return "ext";
  if (/^MSBM/.test(name)) return "blackboard";
  if (/^EUFM|^EUFB/.test(name)) return "fraktur";
  if (/^(CMSSI|CMTI|CMSL|CMSSSL|CMSSBXI|LMSANS\d*-?OBLIQUE|LMROMAN\d*-?(ITALIC|SLANT))/.test(name) || /ITALIC|OBLIQUE/.test(name))
    return "italic";
  if (/^(CMBX|CMSSBX|CMB\d|LMROMAN\d*-?BOLD|LMSANS\d*-?BOLD)/.test(name) || /BOLD/.test(name)) return "bold";
  return "text";
}

/**
 * Fonts from TeX (Computer Modern, Latin Modern, AMS, …) where formula detection applies. Slides
 * from PowerPoint or Keynote (Arial, Calibri, …) have no TeX formulas: "59% → 1" stays text there.
 * An unknown font (not loaded) counts as TeX, so nothing is lost.
 */
export function isTexFont(font: string): boolean {
  const name = font.replace(/^[A-Z]{6}\+/, "").toUpperCase();
  if (!name) return true;
  return /^(CM|LM|MS[AB]M|EU[FRSXB]|RSFS|STIX|ESINT|SF(RM|SS|TT|BX|SL|TI)|TX|PX|NEWTX|NEWPX|STMARY|WASY)/.test(name) || /MATH/.test(name);
}

/* ---------- Bullets from symbol fonts ---------- */

/**
 * PowerPoint draws its bullets with glyphs from Wingdings and similar fonts, which come out as
 * random characters ("§", "¾", "¬" or private-use codes). By font and code, the bullet they show.
 */
const DINGBATS: Record<string, Record<number, string>> = {
  WINGDINGS: {
    0x6c: "●", 0x6e: "■", 0x6f: "□", 0x71: "❑", 0x72: "❒", 0x75: "◆", 0x76: "❖", 0x77: "◆", 0x9f: "•",
    0xa1: "○", 0xa7: "▪", 0xa8: "□", 0xd8: "➢", 0xe0: "➔", 0xe8: "➔", 0xf0: "⇨", 0xfb: "✗", 0xfc: "✓",
    0xfd: "☒", 0xfe: "☑",
  },
  WINGDINGS2: { 0x4f: "✗", 0x50: "✓", 0x97: "•", 0x98: "•", 0x99: "•", 0x9e: "•", 0x9f: "•", 0xa2: "▪", 0xbe: "▪" },
  WINGDINGS3: { 0x75: "▸", 0x7d: "▸", 0x84: "▸", 0xac: "–", 0xc6: "→", 0xd4: "▸" },
};

/** A run's text with symbol-font bullets turned into the characters they show. */
export function mapDingbats(text: string, font: string): string {
  const name = font.replace(/^[A-Z]{6}\+/, "").toUpperCase().replace(/[\s,-]+/g, "");
  const family = /^WINGDINGS[23]?|^WEBDINGS|DINGBATS|^ZAPF|^MARLETT/.exec(name)?.[0];
  if (!family) return text;
  const table = DINGBATS[family.startsWith("WINGDINGS") ? family : ""] ?? {};
  return [...text]
    .map((ch) => {
      if (/\s/.test(ch)) return ch;
      let code = ch.codePointAt(0)!;
      if (code >= 0xf000 && code <= 0xf0ff) code -= 0xf000; // private-use copy of the font's codes
      return table[code] ?? "•";
    })
    .join("");
}

/** Characters that start a list item. */
export const BULLET_CHARS = "•▪■□▶►▸‣◦○●❑❒❖◆➢➔⇨✓✗☒☑–—*·-";

/* ---------- Umlauts and other accents ---------- */

// Spacing accents (as old TeX fonts emit them) → combining marks.
const ACCENTS: Record<string, string> = {
  "¨": "̈", // ¨
  "´": "́", // ´
  "`": "̀", // `
  "ˆ": "̂", // ˆ
  "^": "̂", // ^
  "˜": "̃", // ˜
  "˚": "̊", // ˚
  "ˇ": "̌", // ˇ
  "˘": "̆", // ˘
  "˙": "̇", // ˙
  "˝": "̋", // ˝
  "¯": "̄", // ¯
};
const TRAILING: Record<string, string> = { "¸": "̧", "˛": "̨" }; // ¸ ˛ come after the letter

const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };

function compose(letter: string, mark: string): string | null {
  const base = letter === "ı" ? "i" : letter === "ȷ" ? "j" : letter;
  const out = (base + mark).normalize("NFC");
  return [...out].length === 1 ? out : null;
}

/** "nat¨urlich" → "natürlich", "Gr¨oße" → "Größe", "c¸a" → "ça"; leaves anything else alone. */
export function fixAccents(text: string): string {
  return text
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)
    .replace(/([¨´`ˆ^˜˚ˇ˘˙˝¯]) ?(\p{L})/gu, (m, acc, letter) =>
      compose(letter, ACCENTS[acc]) ?? m,
    )
    .replace(/(\p{L})([¸˛])/gu, (m, letter, acc) => compose(letter, TRAILING[acc]) ?? m);
}

/* ---------- Symbols ---------- */

const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "varepsilon", ϵ: "epsilon", ζ: "zeta", η: "eta",
  θ: "theta", ϑ: "vartheta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", π: "pi",
  ϖ: "varpi", ρ: "rho", ϱ: "varrho", σ: "sigma", ς: "varsigma", τ: "tau", υ: "upsilon", φ: "varphi",
  ϕ: "phi", χ: "chi", ψ: "psi", ω: "omega", Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi",
  Π: "Pi", Σ: "Sigma", Υ: "Upsilon", Φ: "Phi", Ψ: "Psi", Ω: "Omega",
};

const SYMBOLS: Record<string, string> = {
  "∈": "\\in", "∉": "\\notin", "∋": "\\ni", "≤": "\\le", "≥": "\\ge", "≠": "\\neq", "≈": "\\approx",
  "≡": "\\equiv", "≅": "\\cong", "∼": "\\sim", "≃": "\\simeq", "∝": "\\propto", "≪": "\\ll", "≫": "\\gg",
  "·": "\\cdot", "⋅": "\\cdot", "×": "\\times", "÷": "\\div", "±": "\\pm", "∓": "\\mp", "∘": "\\circ",
  "•": "\\bullet", "∗": "*", "⋆": "\\star", "−": "-", "→": "\\to", "←": "\\leftarrow", "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow", "↦": "\\mapsto", "↑": "\\uparrow",
  "↓": "\\downarrow", "∞": "\\infty", "∂": "\\partial", "∇": "\\nabla", "∀": "\\forall", "∃": "\\exists",
  "∄": "\\nexists", "¬": "\\neg", "∧": "\\wedge", "∨": "\\vee", "∩": "\\cap", "∪": "\\cup", "⊂": "\\subset",
  "⊆": "\\subseteq", "⊃": "\\supset", "⊇": "\\supseteq", "⊊": "\\subsetneq", "∅": "\\emptyset",
  "′": "\\prime", "″": "\\prime\\prime", "…": "\\ldots", "⋯": "\\cdots", "⋮": "\\vdots", "‖": "\\|",
  "⟨": "\\langle", "⟩": "\\rangle", "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil",
  "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∮": "\\oint", "√": "\\surd", "⊕": "\\oplus", "⊗": "\\otimes",
  "⊥": "\\perp", "∥": "\\parallel", "∠": "\\angle", "⊢": "\\vdash", "⊨": "\\models", "ℕ": "\\mathbb{N}",
  "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℝ": "\\mathbb{R}", "ℂ": "\\mathbb{C}", "ℓ": "\\ell", "ℏ": "\\hbar",
  "{": "\\{", "}": "\\}", "#": "\\#", "%": "\\%", "&": "\\&", "_": "\\_", $: "\\$", "\\": "\\backslash",
  "~": "\\sim", "|": "|",
};

// CMEX has no Unicode mapping: its glyphs come out as plain letters.
const CMEX: Record<string, string> = {
  P: "\\sum", X: "\\sum", Q: "\\prod", Y: "\\prod", R: "\\int", Z: "\\int", H: "\\oint", I: "\\oint",
  S: "\\bigcup", T: "\\bigcap", V: "\\bigvee", W: "\\bigwedge",
};

const FUNCTIONS = new Set([
  "log", "ln", "lg", "exp", "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "max", "min", "sup", "inf", "lim", "liminf", "limsup", "det", "dim", "ker",
  "deg", "gcd", "arg", "Pr", "hom",
]);
// Upright words that are formula parts in lecture slides (shown with \mathrm).
const UPRIGHT_WORDS = new Set(["bin", "mod", "dist", "rank", "id", "succ", "pred", "true", "false", "poly", "len", "lcm", "sgn"]);

const MATH_CHAR = /[∈∉∋≤≥≠≈≡≅∼≃∝≪≫·⋅×÷±∓∘∗⋆→←↔⇒⇐⇔↦∞∂∇∀∃∄¬∧∨∩∪⊂⊆⊃⊇⊊∅′″⋯⋮‖⟨⟩⌊⌋⌈⌉∑∏∫∮√⊕⊗⊥∥∠⊢⊨ℕℤℚℝℂℓℏα-ωϑϖϱϕϵΓΔΘΛΞΠΣΥΦΨΩ]/;
const isLetter = (s: string) => /^\p{L}$/u.test(s);

/* ---------- Pieces ---------- */

type Script = "base" | "sup" | "sub";
type Role = "math" | "glue" | "text" | "space";

interface Piece {
  text: string;
  kind: FontKind;
  script: Script;
  role: Role;
  /** First piece of a new line. */
  newLine: boolean;
  /** Which line of the selection it's on. */
  line: number;
}

/** Where a line of selected text sits: left edge, right edge and font size, in PDF points. */
export interface LineBox {
  start: number;
  end: number;
  size: number;
  text: string;
  /** Baseline (PDF points, y grows upwards). */
  y?: number;
  /** Where the words start when the line begins with a separate item marker ("–", "•"). */
  textStart?: number;
}

const MARKER = new RegExp(`^[${BULLET_CHARS}]$`, "u");

/** Item markers that are real text in the PDF (Beamer draws its ▶ and ■ as graphics). */
const ITEM_START = new RegExp(
  `^\\s*(?:[${BULLET_CHARS}](?=\\s)|\\d{1,2}[.)](?=\\s)|[a-z]\\)(?=\\s)|[${BULLET_CHARS.replace(/[–—*·-]/g, "")}])`,
  "u",
);

/**
 * Which line breaks of a selection are real (a new bullet, paragraph or heading) and which only
 * wrap a long line, and how far each line is indented (as a level, 0 = leftmost).
 * A break is real when the next line starts further left or right (another list level), starts
 * with an item marker, or follows a line that stops well short of the others and either ends a
 * sentence or is followed by a capital letter (a ragged line before a formula or a lowercase word
 * still just wraps).
 */
export function lineBreaks(lines: LineBox[]): { hard: boolean[]; level: number[] } {
  const n = lines.length;
  const hard = lines.map(() => false);
  if (!n) return { hard, level: [] };
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const em = sizes[Math.floor(sizes.length / 2)] || 10;
  // The last line ends where the selection ends, so it doesn't tell how wide the text is.
  const widest = n > 1 ? Math.max(...lines.slice(0, -1).map((l) => l.end)) : lines[0].end;
  for (let k = 1; k < n; k++) {
    const prev = lines[k - 1];
    const cur = lines[k];
    // A wrapped item lines up with the words after its marker, not with the marker.
    const from = prev.textStart !== undefined && cur.textStart === undefined ? prev.textStart : prev.start;
    // The selection can start in the middle of the first line, so only a step left counts there.
    const shifted = k === 1 ? cur.start > from + em * 0.8 : Math.abs(cur.start - from) > em * 0.8;
    const marker = cur.textStart !== undefined;
    const short = prev.end < widest - em * 3;
    const ends = /[.!?]\s*$/.test(prev.text);
    // Latin capitals only: a Greek one (Σ, Γ) at the start of a line is a formula.
    const capital = /^\s*[A-ZÄÖÜ]/.test(cur.text);
    hard[k] = shifted || marker || ITEM_START.test(cur.text) || (short && (ends || capital));
  }
  // Indent levels from the left edges of lines that begin a block.
  const edges = lines
    .map((l, k) => (k > 0 && hard[k] ? l.start : null))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  // The first line counts only when it's further left than all the others (so not a selection
  // that starts mid-line) and close above the next one: the top item of a list, not a slide
  // title set far above the body.
  const close = lines[0].y === undefined || lines[1]?.y === undefined || Math.abs(lines[0].y - lines[1].y) < em * 2.5;
  if (n > 1 && close && edges.length && lines[0].start < edges[0] - em * 0.8) edges.unshift(lines[0].start);
  const clusters: number[] = [];
  for (const x of edges) if (!clusters.length || x - clusters[clusters.length - 1] > em * 0.8) clusters.push(x);
  const levelOf = (x: number, firstLine: boolean) => {
    if (!clusters.length) return 0;
    // The first line may start mid-line: take the nearest level at or left of it.
    let lvl = 0;
    clusters.forEach((c, i) => {
      if (c <= x + em * 0.8) lvl = i;
    });
    if (!firstLine && x < clusters[0] - em * 0.8) return 0;
    return lvl;
  };
  const level = lines.map((l, k) => levelOf(l.start, k === 0));
  // Wrapped lines take the level of the line they continue.
  for (let k = 1; k < n; k++) if (!hard[k]) level[k] = level[k - 1];
  const min = Math.min(...level);
  return { hard, level: level.map((l) => l - min) };
}

/** Joins neighbouring runs of the same font, size and baseline ("nat¨" + "urlichen" → one run). */
function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const raw of runs) {
    const r = { ...raw, text: mapDingbats(raw.text, raw.font) };
    const prev = out[out.length - 1];
    // An item marker stays its own run, so the line knows where its words start.
    const marker = prev && MARKER.test(prev.text.trim());
    if (prev && !marker && prev.font === r.font && prev.size === r.size && Math.abs(prev.y - r.y) < r.size * 0.05 && r.x >= prev.x) {
      out[out.length - 1] = { ...prev, text: prev.text + r.text, width: r.x + r.width - prev.x };
    } else out.push({ ...r });
  }
  // Accents have to be joined before words are told apart from formulas.
  return out.map((r) => ({ ...r, text: fixAccents(r.text) }));
}

/** Groups runs into lines and decides which runs are sub- or superscripts. */
function scriptsAndLines(runs: TextRun[]): {
  items: { run: TextRun; script: Script; newLine: boolean; line: number }[];
  lines: LineBox[];
} {
  const out: { run: TextRun; script: Script; newLine: boolean; line: number }[] = [];
  const lines: LineBox[] = [];
  let line: TextRun[] = [];
  const flush = () => {
    if (!line.length) return;
    const base = Math.max(...line.map((r) => r.size));
    const ref = line.find((r) => r.size >= base * 0.9 && fontKind(r.font) !== "ext") ?? line[0];
    const index = lines.length;
    // Leading spaces don't move where the text starts.
    const words = line.filter((r) => r.text.trim());
    const first = words[0] ?? line[0];
    const markerOnly = words.length > 1 && MARKER.test(first.text.trim());
    // A marker set apart in the PDF is followed by a space, even without a space character.
    if (markerOnly && !/^\s/.test(words[1].text)) first.text = `${first.text.trimEnd()} `;
    lines.push({
      start: first.x,
      end: Math.max(...line.map((r) => r.x + r.width)),
      size: base,
      text: line.map((r) => r.text).join(""),
      y: ref.y,
      ...(markerOnly ? { textStart: words[1].x } : {}),
    });
    line.forEach((r, i) => {
      let script: Script = "base";
      const shift = r.y - ref.y;
      if (r.size < base * 0.88 && Math.abs(shift) > base * 0.08) script = shift > 0 ? "sup" : "sub";
      out.push({ run: r, script, newLine: i === 0 && out.length > 0, line: index });
    });
    line = [];
  };
  for (const r of mergeRuns(runs)) {
    const prev = line[line.length - 1];
    if (prev) {
      const size = Math.max(prev.size, r.size);
      const dy = Math.abs(r.y - prev.y);
      // A new line goes back to the left (or jumps far). Scripts and big operators shift the
      // baseline too, but the text keeps moving right (limits of a sum stack at the same x).
      const wrapped = r.x < prev.x + prev.width - size && dy > size * 0.3;
      if (wrapped || dy > size * 1.6) flush();
    }
    line.push(r);
  }
  flush();
  return { items: out, lines };
}

function splitPieces(items: ReturnType<typeof scriptsAndLines>["items"]): Piece[] {
  const pieces: Piece[] = [];
  for (const { run, script, newLine, line } of items) {
    const kind = fontKind(run.font);
    const parts = run.text.match(/\p{L}{2,}|\s+|\p{L}|[^\s\p{L}]+/gu) ?? [];
    parts.forEach((text, i) => {
      pieces.push({
        text,
        kind,
        script,
        role: classify(text, kind, script, isTexFont(run.font)),
        newLine: newLine && i === 0,
        line,
      });
    });
  }
  return pieces;
}

function classify(text: string, kind: FontKind, script: Script, tex = true): Role {
  if (/^\s+$/.test(text)) return "space";
  if (!tex) return "text";
  if (kind === "ext" || kind === "symbol" || kind === "blackboard" || kind === "fraktur" || kind === "mathItalic")
    return "math";
  if (script !== "base") return "math";
  if (MATH_CHAR.test(text) && !/\p{L}{2,}/u.test(text.replace(new RegExp(MATH_CHAR.source, "gu"), "")))
    return "math";
  const word = /^\p{L}{2,}$/u.test(text);
  if (kind === "italic") return word ? "text" : "math"; // italic words are emphasis, single letters variables
  if (word) return FUNCTIONS.has(text) || UPRIGHT_WORDS.has(text) ? "glue" : "text";
  return "glue"; // digits, brackets, operators, single letters: math only next to math
}

/**
 * Glue (digits, brackets, "=", function names) joins a formula when it is next to math,
 * possibly across spaces and other glue, but not when it is stuck to a word ("(Eingabe)").
 */
function absorbGlue(pieces: Piece[]) {
  const touchesText = (i: number) =>
    (pieces[i - 1]?.role === "text" && !pieces[i].newLine) || (pieces[i + 1]?.role === "text" && !pieces[i + 1].newLine);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i].role !== "glue" || touchesText(i)) continue;
      const near = (step: number) => {
        for (let j = i + step; j >= 0 && j < pieces.length; j += step) {
          if (pieces[j].role === "space" && !pieces[step > 0 ? j : j + 1]?.newLine) continue;
          return pieces[j].role === "math" && !(step > 0 ? pieces[j].newLine : pieces[i].newLine);
        }
        return false;
      };
      if (near(-1) || near(1)) {
        pieces[i].role = "math";
        changed = true;
      }
    }
  }
  for (const p of pieces) if (p.role === "glue") p.role = "text";
}

/* ---------- LaTeX for one formula ---------- */

function pieceToLatex(p: Piece): string {
  let out = "";
  if (p.kind === "ext") {
    for (const ch of p.text) out += CMEX[ch] ?? SYMBOLS[ch] ?? ch;
    return out;
  }
  if (/^\p{L}{2,}$/u.test(p.text)) {
    if (p.kind === "bold") return `\\mathbf{${p.text}}`;
    if (p.kind === "blackboard") return [...p.text].map((c) => `\\mathbb{${c}}`).join("");
    if (FUNCTIONS.has(p.text)) return `\\${p.text}`;
    if (p.kind === "text") return `\\mathrm{${p.text}}`;
  }
  for (const ch of p.text) {
    if (GREEK[ch]) out += `\\${GREEK[ch]}`;
    else if (SYMBOLS[ch]) out += SYMBOLS[ch];
    else if (isLetter(ch) && p.kind === "blackboard") out += `\\mathbb{${ch}}`;
    else if (isLetter(ch) && p.kind === "bold") out += `\\mathbf{${ch}}`;
    else if (isLetter(ch) && p.kind === "fraktur") out += `\\mathfrak{${ch}}`;
    else out += ch;
  }
  return out;
}

/** Appends a token, adding a space where a command would otherwise run into a letter. */
function append(out: string, token: string): string {
  if (!token) return out;
  if (/\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z0-9]/.test(token)) return `${out} ${token}`;
  return out + token;
}

function formulaToLatex(pieces: Piece[]): string {
  let out = "";
  let i = 0;
  while (i < pieces.length) {
    const p = pieces[i];
    if (p.role === "space") {
      if (out && !out.endsWith(" ")) out += " ";
      i++;
      continue;
    }
    if (p.script === "base") {
      out = append(out, pieceToLatex(p));
      i++;
      continue;
    }
    // A run of script pieces of the same kind becomes one ^{…} or _{…}.
    const script = p.script;
    let body = "";
    while (i < pieces.length && pieces[i].script === script && pieces[i].role !== "space") {
      body = append(body, pieceToLatex(pieces[i]));
      i++;
    }
    out = out.replace(/ $/, "");
    out += `${script === "sup" ? "^" : "_"}${body.length === 1 ? body : `{${body}}`}`;
  }
  // "f (x)" → "f(x)": the PDF's italic-correction gap isn't a real space.
  return out.replace(/([A-Za-z0-9}]) \(/g, "$1(").trim();
}

/* ---------- Everything together ---------- */

/** Indentation written per list level in quoted text. */
export const INDENT = "   ";

/**
 * Selected runs (in reading order) → text with `$…$` formulas. Real line breaks (bullets,
 * headings, paragraphs; see lineBreaks) become "\n" followed by the line's indentation; lines
 * that only wrap become "\r", which cleanSelectedText turns into a space (or joins a hyphenated
 * word). A literal "$" in the text is written as "\$".
 */
export function runsToText(runs: TextRun[]): string {
  const { items, lines } = scriptsAndLines(runs.filter((r) => r.text.length > 0));
  const pieces = splitPieces(items);
  absorbGlue(pieces);
  const { hard, level } = lineBreaks(lines);

  let out = INDENT.repeat(level[0] ?? 0);
  let i = 0;
  while (i < pieces.length) {
    const p = pieces[i];
    if (p.newLine) out += hard[p.line] ? `\n${INDENT.repeat(level[p.line] ?? 0)}` : "\r";
    if (p.role !== "math") {
      out += p.role === "space" ? " " : p.text.replace(/\$/g, "\\$");
      i++;
      continue;
    }
    // Collect one formula: math pieces and the spaces between them on the same line.
    let j = i;
    let end = i;
    while (j < pieces.length && (j === i || !pieces[j].newLine)) {
      if (pieces[j].role === "math") end = j;
      else if (pieces[j].role !== "space") break;
      j++;
    }
    const formula = pieces.slice(i, end + 1);
    // Sentence punctuation at the end belongs to the text: "$\Sigma = \{0,1\}$."
    let trailing = "";
    const last = formula[formula.length - 1];
    const m = last.script === "base" && last.kind !== "mathItalic" ? /[.,;:!?]+$/.exec(last.text) : null;
    if (m && m.index > 0) {
      trailing = m[0];
      formula[formula.length - 1] = { ...last, text: last.text.slice(0, m.index) };
    } else if (m && formula.length > 1) {
      trailing = m[0];
      formula.pop();
    }
    const latex = formulaToLatex(formula);
    if (latex) out += `$${latex}$`;
    out += trailing;
    i = end + 1;
  }
  return fixAccents(out);
}

/** Splits text into plain parts and `$…$` formulas (for rendering). "\$" stays a literal dollar. */
export function splitMath(text: string): { math: boolean; text: string }[] {
  const parts: { math: boolean; text: string }[] = [];
  const re = /(?<!\\)\$((?:\\\$|[^$])+?)\$/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ math: false, text: text.slice(last, m.index).replace(/\\\$/g, "$") });
    parts.push({ math: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ math: false, text: text.slice(last).replace(/\\\$/g, "$") });
  return parts;
}
