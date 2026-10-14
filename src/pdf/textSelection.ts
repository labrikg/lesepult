/**
 * Smooth text selection across PDF.js text layers, adapted from PDF.js's own viewer
 * (web/text_layer_builder.js, Apache-2.0).
 *
 * Text layers are absolutely positioned spans with empty space in between. When a drag crosses
 * that empty space, WebKit snaps the selection to the start of the page. PDF.js counters this
 * with an invisible "endOfContent" element stretched over the layer while selecting (so gaps
 * extend the selection forward instead). PDF.js additionally moves that element next to the
 * selection edge; in WebKit that collapses some selections, so instead, when the mouse is
 * released (or pressed) over empty space, that selection edge is snapped to the nearest text.
 */

/** Caret position (text node + offset) in the text span nearest to a screen point. */
function caretNear(layer: HTMLElement, x: number, y: number): { node: Text; offset: number } | null {
  let best: { span: HTMLElement; rect: DOMRect; d: number } | null = null;
  for (const span of layer.querySelectorAll<HTMLElement>("span")) {
    if (!span.firstChild || span.firstChild.nodeType !== Node.TEXT_NODE) continue;
    const rect = span.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const d = dy * 4 + dx; // prefer the same line over a closer box on another line
    if (!best || d < best.d) best = { span, rect, d };
  }
  if (!best) return null;
  const node = best.span.firstChild as Text;
  if (x >= best.rect.right) return { node, offset: node.length };
  if (x <= best.rect.left) return { node, offset: 0 };
  const caret = document.caretRangeFromPoint?.(x, best.rect.top + best.rect.height / 2);
  if (caret && caret.startContainer === node) return { node, offset: caret.startOffset };
  return { node, offset: x - best.rect.left > best.rect.width / 2 ? node.length : 0 };
}

const inSpanText = (n: Node | null) =>
  !!n && n.nodeType === Node.TEXT_NODE && !!n.parentElement?.closest(".textLayer");

function layerAt(x: number, y: number): HTMLElement | null {
  for (const layer of layers.keys()) {
    const r = layer.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return layer;
  }
  return null;
}

/** If a drag started or ended over empty space, move that edge of the selection onto real text. */
function snapSelection(down: { x: number; y: number }, up: { x: number; y: number }) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  let anchor = { node: sel.anchorNode, offset: sel.anchorOffset };
  let focus = { node: sel.focusNode, offset: sel.focusOffset };
  let changed = false;
  if (!inSpanText(focus.node)) {
    const layer = layerAt(up.x, up.y);
    const c = layer && caretNear(layer, up.x, up.y);
    if (c) {
      focus = c;
      changed = true;
    }
  }
  if (!inSpanText(anchor.node)) {
    const layer = layerAt(down.x, down.y);
    const c = layer && caretNear(layer, down.x, down.y);
    if (c) {
      anchor = c;
      changed = true;
    }
  }
  if (changed && anchor.node && focus.node)
    sel.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
}
const layers = new Map<HTMLElement, HTMLElement>();
let listening = false;

function reset(end: HTMLElement, layer: HTMLElement) {
  layer.append(end);
  end.style.width = "";
  end.style.height = "";
  layer.classList.remove("selecting");
}

function listen() {
  if (listening) return;
  listening = true;
  let pointerDown = false;

  let downAt = { x: 0, y: 0 };
  let downInLayer = false;
  document.addEventListener("pointerdown", (e) => {
    pointerDown = true;
    downAt = { x: e.clientX, y: e.clientY };
    downInLayer = !!(e.target as HTMLElement | null)?.closest?.(".textLayer");
  });
  document.addEventListener("pointerup", (e) => {
    pointerDown = false;
    if (downInLayer) snapSelection(downAt, { x: e.clientX, y: e.clientY });
    downInLayer = false;
    layers.forEach(reset);
  });
  window.addEventListener("blur", () => {
    pointerDown = false;
    layers.forEach(reset);
  });
  document.addEventListener("keyup", () => {
    if (!pointerDown) layers.forEach(reset);
  });
  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
      layers.forEach(reset);
      return;
    }
    const active = new Set<HTMLElement>();
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      for (const layer of layers.keys()) if (range.intersectsNode(layer)) active.add(layer);
    }
    for (const [layer, end] of layers) {
      if (active.has(layer)) layer.classList.add("selecting");
      else reset(end, layer);
    }
  });
}

/** Call after a text layer has rendered. Returns a cleanup function. */
export function registerTextLayer(layer: HTMLElement): () => void {
  const end = document.createElement("div");
  end.className = "endOfContent";
  layer.append(end);
  const onDown = () => layer.classList.add("selecting");
  layer.addEventListener("mousedown", onDown);
  layers.set(layer, end);
  listen();
  return () => {
    layer.removeEventListener("mousedown", onDown);
    layers.delete(layer);
    end.remove();
  };
}
