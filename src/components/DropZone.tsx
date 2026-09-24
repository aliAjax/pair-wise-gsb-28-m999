import { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

interface DropZoneProps {
  id: string;
  container: string;
  emptyText: string;
  children: ReactNode;
}

/** 可投放容器：未派池或某司机的已排队列（已发车区不包在里面） */
export function DropZone({ id, container, emptyText, children }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "zone", container } });
  const isEmpty = Array.isArray(children) ? children.filter(Boolean).length === 0 : !children;

  return (
    <div ref={setNodeRef} className={`drop-zone${isOver ? " drop-zone-over" : ""}`}>
      {isEmpty ? <div className="drop-empty">{emptyText}</div> : children}
    </div>
  );
}
