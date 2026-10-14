import { useState } from "react";

interface Props {
  initial?: string;
  placeholder: string;
  label: string;
  onSubmit(value: string): void;
  onCancel(): void;
  className?: string;
}

/** Text field for naming things in place: Enter or blur saves, Escape cancels. */
export function InlineInput({ initial = "", placeholder, label, onSubmit, onCancel, className }: Props) {
  const [value, setValue] = useState(initial);

  const commit = () => {
    const v = value.trim();
    if (v && v !== initial) onSubmit(v);
    else onCancel();
  };

  return (
    <input
      className={`inline-input ${className ?? ""}`}
      aria-label={label}
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}
