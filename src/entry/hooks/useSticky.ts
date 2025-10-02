import { useEffect, useRef, useState } from "react";

/**
 * Custom hook to detect if a sticky element is currently stuck
 * @returns object containing sentinelRef (to attach to sentinel div), stickyRef (to attach to sticky element), and isSticky state
 */
export function useSticky<T extends HTMLElement>(): {
  sentinelRef: React.RefObject<HTMLDivElement>;
  stickyRef: React.RefObject<T>;
  isSticky: boolean;
} {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<T>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When sentinel is not visible, the sticky element is stuck
        setIsSticky(!entry.isIntersecting);
      },
      { threshold: [1], rootMargin: "0px 0px 0px 0px" },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { sentinelRef, stickyRef, isSticky };
}
