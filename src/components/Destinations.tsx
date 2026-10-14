import { Check, Folder as FolderIcon } from "lucide-react";
import type { CourseNode, Folder, SemesterNode } from "../lib/repo";

interface Props {
  tree: SemesterNode[];
  /** Where the item is now (shown with a check, not selectable). */
  current: { courseId: string; folderId: string | null };
  /** Folders that can't be picked (a folder and its own sub-folders when moving a folder). */
  exclude?: Set<string>;
  onPick(courseId: string, folderId: string | null): void;
}

/** Every course and folder as a pickable list, folders indented under their course. */
export function Destinations({ tree, current, exclude, onPick }: Props) {
  return (
    <div className="menu-scroll">
      {tree.map((s) => (
        <div key={s.id} role="group" aria-label={s.name}>
          <div className="menu-label">{s.name}</div>
          {s.courses.map((c) => (
            <CourseDestinations key={c.id} course={c} current={current} exclude={exclude} onPick={onPick} />
          ))}
          {s.courses.length === 0 && <div className="menu-empty">No courses</div>}
        </div>
      ))}
    </div>
  );
}

function CourseDestinations({
  course,
  current,
  exclude,
  onPick,
}: { course: CourseNode } & Omit<Props, "tree">) {
  const here = current.courseId === course.id && current.folderId === null;
  const rows = flattenFolders(course.folders);
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        disabled={here}
        onClick={() => onPick(course.id, null)}
      >
        <span className="course-dot" style={{ background: course.color }} aria-hidden="true" />
        <span className="truncate">{course.name}</span>
        {here && <Check size={14} className="menu-check" aria-label="Current place" role="img" />}
      </button>
      {rows.map(({ folder, depth }) => {
        const isHere = current.courseId === course.id && current.folderId === folder.id;
        return (
          <button
            key={folder.id}
            type="button"
            role="menuitem"
            className="menu-item"
            style={{ paddingLeft: 10 + depth * 16 }}
            disabled={isHere || exclude?.has(folder.id)}
            onClick={() => onPick(course.id, folder.id)}
          >
            <FolderIcon size={14} aria-hidden="true" />
            <span className="truncate">{folder.name}</span>
            {isHere && <Check size={14} className="menu-check" aria-label="Current place" role="img" />}
          </button>
        );
      })}
    </>
  );
}

/** Folders depth-first in their sidebar order, with how deep each one sits (1 = top level). */
export function flattenFolders(folders: Folder[]): { folder: Folder; depth: number }[] {
  const children = new Map<string | null, Folder[]>();
  for (const f of folders) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f]);
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      out.push({ folder: f, depth });
      if (depth < 64) walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

/** A folder's id plus all ids below it. */
export function subtreeIds(folders: Folder[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders)
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
  }
  return ids;
}
