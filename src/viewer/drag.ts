// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Drag-to-pan handlers                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export interface DragState {
  active: boolean;
}

export interface DragHandlers {
  drag: DragState;
  onDragMove: (e: MouseEvent) => void;
  onDragEnd: () => void;
}

/** Set up drag-to-pan on compDiv */
export function setupDragHandlers(compDiv: HTMLDivElement): DragHandlers {
  const drag: DragState = { active: false };
  let isPotentialDrag = false;
  let dStartX = 0,
    dStartY = 0,
    sLeft0 = 0,
    sTop0 = 0;
  const DRAG_THRESH = 4;

  compDiv.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isPotentialDrag = true;
    drag.active = false;
    dStartX = e.clientX;
    dStartY = e.clientY;
    sLeft0 = compDiv.scrollLeft;
    sTop0 = compDiv.scrollTop;
  });

  function onDragMove(e: MouseEvent) {
    if (!isPotentialDrag) return;
    const dx = e.clientX - dStartX;
    const dy = e.clientY - dStartY;
    if (!drag.active) {
      if (Math.abs(dx) > DRAG_THRESH || Math.abs(dy) > DRAG_THRESH) {
        drag.active = true;
        compDiv.classList.add("_scf_dragging");
      } else {
        return;
      }
    }
    compDiv.scrollLeft = sLeft0 - dx;
    compDiv.scrollTop = sTop0 - dy;
  }

  function onDragEnd() {
    if (isPotentialDrag) {
      isPotentialDrag = false;
      drag.active = false;
      compDiv.classList.remove("_scf_dragging");
    }
  }

  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);

  return { drag, onDragMove, onDragEnd };
}

export function pointerColumn(e: MouseEvent, numCols: number): number {
  const relX = Math.max(
    0,
    Math.min(0.9999, e.clientX / window.innerWidth),
  );
  return Math.floor(relX * numCols);
}
