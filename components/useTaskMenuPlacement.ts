"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

type TaskMenuPlacement = {
  opensUpward: boolean;
  maxHeight?: number;
};

export function useTaskMenuPlacement(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
): TaskMenuPlacement {
  const [placement, setPlacement] = useState<TaskMenuPlacement>({ opensUpward: false });

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return;

    const updatePlacement = () => {
      const triggerRect = triggerRef.current!.getBoundingClientRect();
      const menuRect = menuRef.current!.getBoundingClientRect();
      const scrollContainer = triggerRef.current!.closest(".chat-area");
      const containerRect = scrollContainer?.getBoundingClientRect();
      const topBoundary = Math.max(0, containerRect?.top ?? 0);
      const bottomBoundary = Math.min(window.innerHeight, containerRect?.bottom ?? window.innerHeight);
      const spaceAbove = triggerRect.top - topBoundary - 4;
      const spaceBelow = bottomBoundary - triggerRect.bottom - 4;
      const opensUpward = menuRect.height > spaceBelow && spaceAbove > spaceBelow;
      const availableHeight = opensUpward ? spaceAbove : spaceBelow;

      setPlacement({
        opensUpward,
        maxHeight: Math.max(0, Math.floor(availableHeight)),
      });
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [isOpen, triggerRef, menuRef]);

  return placement;
}
