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
      // Title, block title and paragraphs on their own lines; wrapped lines joined; the centred
      // display formula on its own, indented line.
      "Turing-Maschinen\n" +
        "Beispiel: Multiplikation\n" +
        "Zu zwei natürlichen Zahlen $i_1, i_2 \\in \\mathbf{N}$ (Eingabe) " +
        "suchen wir das entsprechende Produkt $i_1 \\cdot i_2$ (Ausgabe).\n" +
        "Um die Zahlen $i_1$ und $i_2$ in der " +
        "Eingabe voneinander trennen zu können, erweitern wir das Alphabet um ein Trennsymbol: " +
        "$\\Sigma = \\{0, 1, \\#\\}$.\n" +
        "Die entsprechende Funktion $f : \\Sigma^* \\to \\Sigma^*$ ist dann gegeben durch\n" +
        "   $f(\\mathrm{bin}(i_1)\\#\\mathrm{bin}(i_2)) = \\mathrm{bin}(i_1 \\cdot i_2)$\n" +
        "Also zum Beispiel $f(110\\#10) = 1100$. Was ist $f(\\#\\#)$?",
    );
  });

  it("handles exponents, indices, sums and every umlaut", () => {
    expect(read(page("2"))).toBe(
      "Mehr Mathe\n" +
        "Die Laufzeit ist $T(n) \\le c \\cdot n^2 + \\log_2 n$ für alle $n \\ge n_0$, und es gilt " +
        "$x^{k+1} = \\sum^k_{i=0} a_i$. Größe, Übergänge, Äpfel, Öfen, Straße.\n" +
        "   $\\delta : Q \\times \\Gamma \\to Q \\times \\Gamma \\times \\{L, R, N\\}$",
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

  it("keeps a slide's bullet structure: levels, items and wrapped lines", () => {
    // A Beamer list (its ▶ and ■ are graphics, so not in the text); the dash item is text.
    const run = (text: string, x: number, y: number, size = 11): TextRun => ({
      text,
      font: "ABCDEF+ArialMT",
      size,
      x,
      y,
      width: text.length * size * 0.5,
    });
    const lines = [
      run("Notenbonus für PT1 durch Präsenzübung", 90, 700, 14),
      run("Möglich: Sammeln von Notenbonus für die Klausur", 120, 680),
      run("Klausur muss bestanden sein – erst danach wird der Notenbonus", 150, 664),
      run("berücksichtigt", 150, 650),
      run("Nur gültig für den ersten Klausurtermin in diesem Semester", 150, 634),
      run("–", 175, 618),
      run("Mitnahme des Notenbonus in PT2 nur mit sehr guter Begründung", 185, 618),
      run("möglich (Krankheit, zeitgleiche Klausur)", 185, 604),
      run("Bonussystem", 120, 588),
      run("Wer mehr als 50% der Zulassungspunkte in der Präsenzübung hat,", 150, 572),
      run("kann bis zu 5% Notenbonus erlangen", 150, 558),
    ];
    expect(read(lines)).toBe(
      [
        "Notenbonus für PT1 durch Präsenzübung",
        "   Möglich: Sammeln von Notenbonus für die Klausur",
        "      Klausur muss bestanden sein – erst danach wird der Notenbonus berücksichtigt",
        "      Nur gültig für den ersten Klausurtermin in diesem Semester",
        "         – Mitnahme des Notenbonus in PT2 nur mit sehr guter Begründung möglich (Krankheit, zeitgleiche Klausur)",
        "   Bonussystem",
        "      Wer mehr als 50% der Zulassungspunkte in der Präsenzübung hat, kann bis zu 5% Notenbonus erlangen",
      ].join("\n"),
    );
  });

  it("turns PowerPoint's symbol-font bullets into bullets and leaves Arial text without formulas", () => {
    // As PDF.js reads an RWTH slide made in PowerPoint: bullets in Wingdings 2/3, text in Arial.
    const run = (text: string, font: string, x: number, y: number, width: number): TextRun => ({
      text,
      font,
      size: 20,
      x,
      y,
      width,
    });
    const lines = [
      run("\u0097", "AAAAAN+Wingdings2", 40, 400, 12),
      run("Notenbonus für PT1 durch Präsenzübung", "AAAABT+Arial-BoldMT", 70, 400, 420),
      run("\u0084", "AAAAAS+Wingdings3", 70, 370, 12),
      run("Bonussystem", "AAAAAE+ArialMT", 100, 370, 130),
      run("¾", "AAAABG+Wingdings2", 100, 340, 12),
      run("Wer mehr als 50% hat", "AAAAAE+ArialMT", 130, 340, 230),
      run("¬", "AAAABL+Wingdings3", 130, 310, 12),
      run("linear von 50% bis 95%", "AAAAAE+ArialMT", 160, 310, 250),
      run("-", "AAAAAE+ArialMT", 160, 280, 8),
      run("59% → 1 Bonuspunkt; 68% → 2 Bonuspunkte", "AAAAAE+ArialMT", 190, 280, 430),
    ];
    expect(read(lines)).toBe(
      [
        "• Notenbonus für PT1 durch Präsenzübung",
        "   ▸ Bonussystem",
        "      ▪ Wer mehr als 50% hat",
        "         – linear von 50% bis 95%",
        "            - 59% → 1 Bonuspunkt; 68% → 2 Bonuspunkte",
      ].join("\n"),
    );
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
