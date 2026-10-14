import { describe, expect, it } from "vitest";
import slides from "./__fixtures__/turing-slides.json";
import { cleanSelectedText } from "./highlights";
import { fixAccents, fontKind, runsToText, splitMath, type TextRun } from "./mathText";

// Text runs as PDF.js reads them from a German beamer PDF (source: __fixtures__/turing-slides.tex).
const page = (n: "1" | "2") => (slides as Record<string, TextRun[]>)[n];
const read = (runs: TextRun[]) => cleanSelectedText(runsToText(runs));

describe("PDF text with formulas", () => {
  it("rebuilds inline formulas and umlauts from a LaTeX slide", () => {
    expect(read(page("1"))).toBe(
      "Turing-Maschinen Beispiel: Multiplikation Zu zwei natürlichen Zahlen $i_1, i_2 \\in \\mathbf{N}$ (Eingabe) " +
        "suchen wir das entsprechende Produkt $i_1 \\cdot i_2$ (Ausgabe). Um die Zahlen $i_1$ und $i_2$ in der " +
        "Eingabe voneinander trennen zu können, erweitern wir das Alphabet um ein Trennsymbol: " +
        "$\\Sigma = \\{0, 1, \\#\\}$. Die entsprechende Funktion $f : \\Sigma^* \\to \\Sigma^*$ ist dann gegeben " +
        "durch $f(\\mathrm{bin}(i_1)\\#\\mathrm{bin}(i_2)) = \\mathrm{bin}(i_1 \\cdot i_2)$ Also zum Beispiel " +
        "$f(110\\#10) = 1100$. Was ist $f(\\#\\#)$?",
    );
  });

  it("handles exponents, indices, sums and every umlaut", () => {
    expect(read(page("2"))).toBe(
      "Mehr Mathe Die Laufzeit ist $T(n) \\le c \\cdot n^2 + \\log_2 n$ für alle $n \\ge n_0$, und es gilt " +
        "$x^{k+1} = \\sum^k_{i=0} a_i$. Größe, Übergänge, Äpfel, Öfen, Straße. " +
        "$\\delta : Q \\times \\Gamma \\to Q \\times \\Gamma \\times \\{L, R, N\\}$",
    );
  });

  it("leaves ordinary text alone", () => {
    const run = (text: string, x: number, y = 700): TextRun => ({ text, font: "ABCDEF+ArialMT", size: 12, x, y, width: text.length * 6 });
    expect(read([run("Kapitel 3, Seite 12: Typ A (siehe Abb. 2) kostet $5.", 50)])).toBe(
      "Kapitel 3, Seite 12: Typ A (siehe Abb. 2) kostet \\$5.",
    );
    // Lines are kept apart and hyphenated words joined.
    expect(read([run("Kolli-", 50), run("sion am Zeilenende", 50, 685)])).toBe("Kollision am Zeilenende");
  });

  it("knows TeX's font roles", () => {
    expect(fontKind("VVCZSD+CMMI10")).toBe("mathItalic");
    expect(fontKind("BAJSKS+CMSY10")).toBe("symbol");
    expect(fontKind("LBWBDW+CMEX10")).toBe("ext");
    expect(fontKind("XYZABC+MSBM10")).toBe("blackboard");
    expect(fontKind("QCCBFV+CMSSI10")).toBe("italic");
    expect(fontKind("PDAINP+CMSSBX10")).toBe("bold");
    expect(fontKind("EHUXDU+CMSS10")).toBe("text");
    expect(fontKind("")).toBe("text");
  });
});

describe("accents", () => {
  it("joins spacing accents with their letter", () => {
    expect(fixAccents("nat¨urlich, k¨onnen, Gr¨oße, ¨Ubung, Franc¸ais, caf´e, na¨ıve, ﬁnden")).toBe(
      "natürlich, können, Größe, Übung, Français, café, naïve, finden",
    );
    expect(fixAccents("x^2 and `code`")).toBe("x^2 and `code`"); // nothing that doesn't compose
  });
});

describe("splitMath", () => {
  it("finds $…$ formulas and keeps escaped dollars literal", () => {
    expect(splitMath("Es gilt $a_1 \\le b$ für \\$5 und $x$.")).toEqual([
      { math: false, text: "Es gilt " },
      { math: true, text: "a_1 \\le b" },
      { math: false, text: " für $5 und " },
      { math: true, text: "x" },
      { math: false, text: "." },
    ]);
    expect(splitMath("no math here")).toEqual([{ math: false, text: "no math here" }]);
  });
});
