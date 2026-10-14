import type { RefObject } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useStore } from "../store";
import type { ThemePref } from "../lib/theme";
import { Popover } from "./Popover";

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function SettingsMenu({ anchor, onClose }: { anchor: RefObject<HTMLElement | null>; onClose(): void }) {
  const themePref = useStore((s) => s.themePref);
  const theme = useStore((s) => s.theme);
  const darkPdf = useStore((s) => s.darkPdf);
  const { setThemePref, setDarkPdf } = useStore.getState();

  return (
    <Popover anchor={anchor} onClose={onClose} label="Settings" width={272}>
      <div className="menu-label">Appearance</div>
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
