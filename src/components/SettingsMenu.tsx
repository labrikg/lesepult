import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useStore } from "../store";
import type { ThemePref } from "../lib/theme";
import { SKINS, type SkinSwatch } from "../lib/skins";
import { Popover } from "./Popover";

/** The built-in look first, then the generated themes (see scripts/build-skins.mjs). */
const ALL_SKINS = [
  {
    id: "lesepult",
    name: "Lesepult",
    light: { bg: "#f4eee4", paper: "#fffefb", ink: "#2a2420", accent: "#4a6741", line: "#dcd1bf" },
    dark: { bg: "#1d1915", paper: "#2a251f", ink: "#ede4d6", accent: "#8fae7f", line: "#352f28" },
  },
  ...SKINS,
];

/** A tiny picture of the theme: its page colour, a card with two lines of text and an accent. */
function SkinPreview({ s }: { s: SkinSwatch }) {
  return (
    <span className="skin-preview" style={{ background: s.bg, borderColor: s.line }} aria-hidden="true">
      <span className="skin-preview-card" style={{ background: s.paper, borderColor: s.line }}>
        <span style={{ background: s.ink, width: "70%" }} />
        <span style={{ background: s.ink, width: "45%", opacity: 0.55 }} />
        <span className="skin-preview-accent" style={{ background: s.accent }} />
      </span>
    </span>
  );
}

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function SettingsMenu({ anchor, onClose }: { anchor: RefObject<HTMLElement | null>; onClose(): void }) {
  const themePref = useStore((s) => s.themePref);
  const theme = useStore((s) => s.theme);
  const darkPdf = useStore((s) => s.darkPdf);
  const skin = useStore((s) => s.skin);
  const { setThemePref, setDarkPdf, setSkin } = useStore.getState();

  // Two rows of themes show at once; the rest scroll in. The bottom edge fades while there is more.
  const grid = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const measure = () => {
    const el = grid.current;
    if (el) setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  };
  // The menu focuses the chosen theme when it opens, which also scrolls it into view.
  useEffect(() => {
    requestAnimationFrame(measure);
  }, []);

  return (
    <Popover
      anchor={anchor}
      onClose={onClose}
      label="Settings"
      width={296}
      focusSelector='.skin-option[aria-checked="true"]'
    >
      <div className="menu-label">Theme</div>
      <div
        ref={grid}
        className={`skin-grid${atEnd ? "" : " has-more"}`}
        role="group"
        aria-label="Theme"
        onScroll={measure}
      >
        {ALL_SKINS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="menuitemradio"
            aria-checked={skin === k.id}
            className="skin-option"
            onClick={() => setSkin(k.id)}
          >
            <SkinPreview s={theme === "dark" ? k.dark : k.light} />
            <span className="skin-name">{k.name}</span>
          </button>
        ))}
      </div>
      <div className="menu-divider" role="separator" />
      <div className="menu-label">Light or dark</div>
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="menuitemradio"
          aria-checked={themePref === value}
          className="menu-item"
          onClick={() => setThemePref(value)}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
          {themePref === value && <Check size={14} className="menu-check" aria-hidden="true" />}
        </button>
      ))}
      <div className="menu-divider" role="separator" />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={darkPdf}
        className="menu-item menu-item--two-line"
        disabled={theme !== "dark"}
        onClick={() => setDarkPdf(!darkPdf)}
      >
        <span>
          <span className="menu-item-title">Dark PDF pages</span>
          <span className="menu-item-sub">
            {theme === "dark" ? "Light text on dark pages, snips too" : "Available in the dark theme"}
          </span>
        </span>
        <span className={`switch${darkPdf ? " is-on" : ""}`} aria-hidden="true" />
      </button>
    </Popover>
  );
}
