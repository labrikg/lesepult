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
}

/** Joins neighbouring runs of the same font, size and baseline ("nat¨" + "urlichen" → one run). */
function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && prev.font === r.font && prev.size === r.size && Math.abs(prev.y - r.y) < r.size * 0.05 && r.x >= prev.x) {
      out[out.length - 1] = { ...prev, text: prev.text + r.text, width: r.x + r.width - prev.x };
    } else out.push({ ...r });
  }
  // Accents have to be joined before words are told apart from formulas.
  return out.map((r) => ({ ...r, text: fixAccents(r.text) }));
}

/** Groups runs into lines and decides which runs are sub- or superscripts. */
function scriptsAndLines(runs: TextRun[]): { run: TextRun; script: Script; newLine: boolean }[] {
  const out: { run: TextRun; script: Script; newLine: boolean }[] = [];
  let line: TextRun[] = [];
  const flush = () => {
    if (!line.length) return;
    const base = Math.max(...line.map((r) => r.size));
    const ref = line.find((r) => r.size >= base * 0.9 && fontKind(r.font) !== "ext") ?? line[0];
    line.forEach((r, i) => {
      let script: Script = "base";
      const shift = r.y - ref.y;
      if (r.size < base * 0.88 && Math.abs(shift) > base * 0.08) script = shift > 0 ? "sup" : "sub";
      out.push({ run: r, script, newLine: i === 0 && out.length > 0 });
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
  return out;
}

function splitPieces(runs: TextRun[]): Piece[] {
  const pieces: Piece[] = [];
  for (const { run, script, newLine } of scriptsAndLines(runs)) {
    const kind = fontKind(run.font);
    const parts = run.text.match(/\p{L}{2,}|\s+|\p{L}|[^\s\p{L}]+/gu) ?? [];
    parts.forEach((text, i) => {
      pieces.push({ text, kind, script, role: classify(text, kind, script), newLine: newLine && i === 0 });
    });
  }
  return pieces;
}

function classify(text: string, kind: FontKind, script: Script): Role {
  if (/^\s+$/.test(text)) return "space";
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

/**
 * Selected runs (in reading order) → text with `$…$` formulas. Line breaks become "\n" so
 * hyphenated words can be joined afterwards. A literal "$" in the text is written as "\$".
 */
export function runsToText(runs: TextRun[]): string {
  const pieces = splitPieces(runs.filter((r) => r.text.length > 0));
  absorbGlue(pieces);

  let out = "";
  let i = 0;
  while (i < pieces.length) {
    const p = pieces[i];
    if (p.newLine) out += "\n";
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
