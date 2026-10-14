import type { DragEvent } from "react";
import { create } from "zustand";

/**
 * Drag & drop in the sidebar: pages and folders can be dropped onto a course (top level) or a
 * folder. Drop zones nest, so only the innermost one under the pointer highlights.
 */
export const PAGE_DRAG_TYPE = "application/x-lesepult-page";
export const FOLDER_DRAG_TYPE = "application/x-lesepult-folder";

export interface Dragged {
  kind: "page" | "folder";
  id: string;
}

// The dragged item is also kept here because a dragover event can't read the drag data.
let current: Dragged | null = null;

export function startDrag(e: DragEvent, item: Dragged) {
  current = item;
  e.dataTransfer.setData(item.kind === "page" ? PAGE_DRAG_TYPE : FOLDER_DRAG_TYPE, item.id);
  e.dataTransfer.effectAllowed = "move";
}

export function currentDrag(): Dragged | null {
  return current;
}

export function endDrag() {
  current = null;
  useDropTarget.getState().set(null);
}

/** Which drop zone is highlighted ("course:<id>" or "folder:<id>"). */
export const useDropTarget = create<{ over: string | null; set(over: string | null): void }>((set) => ({
  over: null,
  set: (over) => set({ over }),
}));

/**
 * Props for a drop zone. `accept` decides whether the dragged item may land here (e.g. a folder
 * can't go into itself); `onDrop` performs the move.
 */
export function dropZone(key: string, accept: (d: Dragged) => boolean, onDrop: (d: Dragged) => void) {
  return {
    onDragOver(e: DragEvent) {
      const d = current;
      if (!d || !accept(d)) return;
      e.preventDefault();
      e.stopPropagation(); // the innermost zone wins
      e.dataTransfer.dropEffect = "move";
      if (useDropTarget.getState().over !== key) useDropTarget.getState().set(key);
    },
    onDragLeave(e: DragEvent) {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      if (useDropTarget.getState().over === key) useDropTarget.getState().set(null);
    },
    onDrop(e: DragEvent) {
      const d = current;
      if (!d || !accept(d)) return;
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      onDrop(d);
    },
  };
}
