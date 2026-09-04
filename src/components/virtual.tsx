"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function VirtualList({
  count,
  rowHeight,
  renderItem,
  emptyState,
  className = "",
}: {
  count: number;
  rowHeight: number;
  renderItem: (index: number) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (element) setScrollTop(element.scrollTop);
  }, []);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  if (count === 0) return <>{emptyState}</>;

  const overscan = 8;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  const rows = [];
  for (let index = start; index < end; index += 1) {
    rows.push(
      <div key={index} style={{ height: rowHeight }} className="pr-2">
        {renderItem(index)}
      </div>,
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className={`overflow-y-auto ${className}`}>
      <div style={{ height: count * rowHeight }} className="relative">
        <div style={{ transform: `translateY(${start * rowHeight}px)` }}>{rows}</div>
      </div>
    </div>
  );
}
