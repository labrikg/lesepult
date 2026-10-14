import { useId } from "react";

/** The app icon (serif L over a highlighter stroke on walnut) as a small inline mark. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const id = useId();
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Lesepult"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d2f24" />
          <stop offset="1" stopColor="#251c16" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill={`url(#${id}-bg)`} />
      <g transform="translate(0 -40)">
        <path
          d="M238 770 L812 742 Q834 741 835 763 L838 820 Q839 842 817 843 L243 871 Q221 872 220 850 L217 793 Q216 771 238 770 Z"
          fill="#d9a93f"
        />
        <path
          d="M296 214 L536 214 L536 262 L514 268 Q478 278 478 312 L478 702 L676 702 Q712 702 726 668 L746 622 L790 622 L780 806 L296 806 L296 758 L318 752 Q354 742 354 708 L354 312 Q354 278 318 268 L296 262 Z"
          fill="#f6efe2"
        />
      </g>
      <rect width="1024" height="1024" rx="230" fill={`url(#${id}-sheen)`} />
      <rect x="6" y="6" width="1012" height="1012" rx="226" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="12" />
    </svg>
  );
}
