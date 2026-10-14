import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { Check, Filter, Pencil, Plus, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import { cleanTagName, TAG_COLORS, type Tag, type TagColor, type TagInfo } from "../lib/repo";
import { Popover } from "./Popover";
import { InlineInput } from "./InlineInput";

const COLOR_NAMES: Record<TagColor, string> = {
  moss: "Moss",
  clay: "Clay",
  sky: "Sky",
  ochre: "Ochre",
  plum: "Plum",
  sand: "Sand",
};

/** A tag as a coloured pill. */
export function TagChip({ tag, onRemove, onClick }: { tag: Tag; onRemove?(): void; onClick?(): void }) {
  return (
    <span className={`tag-chip${onRemove ? " tag-chip--removable" : ""}`} data-color={tag.color}>
      {onClick ? (
        <button type="button" className="tag-chip-name" onClick={onClick} title={`Show all pages tagged “${tag.name}”`}>
          {tag.name}
        </button>
      ) : (
        <span className="tag-chip-name">{tag.name}</span>
      )}
      {onRemove && (
        <button type="button" className="tag-chip-remove" aria-label={`Remove tag ${tag.name}`} onClick={onRemove}>
          <X size={12} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** The open note's tags, under its title. */
export function NoteTags() {
  const pageTags = useStore((s) => s.pageTags);
  const { removeTag, setTagFilter } = useStore.getState();
  const [picking, setPicking] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setPicking(false), []);

  return (
    <div className="note-tags" aria-label="Tags">
      {pageTags.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={() => removeTag(t.id)} onClick={() => setTagFilter(t.id)} />
      ))}
      <button
        ref={addButton}
        type="button"
        className={`tag-add${pageTags.length ? " tag-add--compact" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={picking}
        aria-label="Add tag"
        title="Add tag"
        onClick={() => setPicking((p) => !p)}
      >
        <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
        {pageTags.length === 0 && <span>Add tag</span>}
      </button>
      {picking && <TagPicker anchor={addButton} onClose={close} />}
    </div>
  );
}

type Option = { kind: "tag"; tag: TagInfo } | { kind: "create"; name: string };

/** Find-or-create field for tagging the open page. Stays open so several tags can be added. */
function TagPicker({ anchor, onClose }: { anchor: RefObject<HTMLElement | null>; onClose(): void }) {
  const tags = useStore((s) => s.tags);
  const pageTags = useStore((s) => s.pageTags);
  const { addTag, removeTag } = useStore.getState();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const onPage = new Set(pageTags.map((t) => t.id));
    const q = cleanTagName(query).toLowerCase();
    const matches = tags.filter((t) => !onPage.has(t.id) && t.name.toLowerCase().includes(q));
    // Names that start with the query first.
    matches.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)));
    const list: Option[] = matches.slice(0, 8).map((tag) => ({ kind: "tag", tag }));
    const exists = tags.some((t) => t.name.toLowerCase() === q) || pageTags.some((t) => t.name.toLowerCase() === q);
    if (q && !exists) list.push({ kind: "create", name: cleanTagName(query) });
    return list;
  }, [tags, pageTags, query]);

  const choose = async (o: Option | undefined) => {
    if (!o) return;
    await addTag(o.kind === "tag" ? o.tag.name : o.name);
    setQuery("");
    setActive(0);
  };

  return (
    <Popover anchor={anchor} onClose={onClose} label="Add tag" width={264} role="dialog" focusSelector="input">
      <input
        className="tag-picker-input"
        aria-label="Find or create a tag"
        placeholder={tags.length ? "Find or create a tag…" : "Name a tag, e.g. exam"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Backspace" && !query && pageTags.length) {
            // Like a token field: Backspace in the empty field removes the last tag.
            e.preventDefault();
            removeTag(pageTags[pageTags.length - 1].id);
          }
        }}
      />
      {options.length > 0 && (
        <div className="tag-picker-list" role="listbox" aria-label="Tags">
          {options.map((o, i) => (
            <button
              key={o.kind === "tag" ? o.tag.id : "create"}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              className="menu-item tag-picker-option"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the field
              onClick={() => choose(o)}
            >
              {o.kind === "tag" ? (
                <>
                  <TagChip tag={o.tag} />
                  <span className="row-meta">{o.tag.count}</span>
                </>
              ) : (
                <>
                  <span className="tag-picker-create">Create</span>
                  <TagChip tag={{ id: "", name: o.name, color: nextColor(tags.length) }} />
                </>
              )}
            </button>
          ))}
        </div>
      )}
      {options.length === 0 && !query && (
        <div className="menu-empty">{tags.length ? "All your tags are on this page." : "Type a name and press Enter."}</div>
      )}
    </Popover>
  );
}

/** The colour a new tag will get (matches the repository's rotation as long as no tags were deleted). */
const nextColor = (count: number): TagColor => TAG_COLORS[count % TAG_COLORS.length];

/** Rename, recolour, filter by or delete a tag (from the sidebar). */
export function TagMenu({
  tag,
  anchor,
  onClose,
}: {
  tag: TagInfo;
  anchor: RefObject<HTMLElement | null>;
  onClose(): void;
}) {
  const { renameTag, setTagColor, deleteTag, setTagFilter } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Popover
      key={renaming ? "rename" : "main"}
      anchor={anchor}
      onClose={onClose}
      label={`Tag ${tag.name}`}
      width={240}
      focusSelector={renaming ? "input" : "button:not(:disabled)"}
    >
      {renaming ? (
        <div className="menu-field">
          <InlineInput
            label="Rename tag"
            placeholder="Tag name"
            initial={tag.name}
            onSubmit={(name) => {
              onClose();
              renameTag(tag.id, name);
            }}
            onCancel={() => setRenaming(false)}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              onClose();
              setTagFilter(tag.id);
            }}
          >
            <Filter size={15} aria-hidden="true" />
            Show its pages
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => setRenaming(true)}>
            <Pencil size={15} aria-hidden="true" />
            Rename
          </button>
          <div className="menu-divider" role="separator" />
          <div className="menu-label">Colour</div>
          <div className="tag-swatches" role="group" aria-label="Colour">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitemradio"
                aria-checked={tag.color === c}
                aria-label={COLOR_NAMES[c]}
                title={COLOR_NAMES[c]}
                className="tag-swatch"
                data-color={c}
                onClick={() => setTagColor(tag.id, c)}
              >
                {tag.color === c && <Check size={12} strokeWidth={3} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`menu-item menu-item--danger${confirmDelete ? " is-armed" : ""}`}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onClose();
              deleteTag(tag.id);
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            {confirmDelete
              ? `Remove from ${tag.count} ${tag.count === 1 ? "page" : "pages"}?`
              : "Delete tag"}
          </button>
        </>
      )}
    </Popover>
  );
}
