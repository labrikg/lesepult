interface SlashItem {
  title: string;
  aliases?: readonly string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/**
 * The slash-menu item whose name or alias is exactly what was typed after "/", ignoring case,
 * spaces and dashes ("/latex", "/h2", "/codeblock"). Returns undefined when nothing matches exactly.
 */
export function findExactSlashItem<T extends SlashItem>(items: T[], query: string): T | undefined {
  const q = norm(query.trim());
  if (!q) return undefined;
  return (
    items.find((i) => norm(i.title) === q) ?? items.find((i) => (i.aliases ?? []).some((a) => norm(a) === q))
  );
}
