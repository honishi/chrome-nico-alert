import { useEffect, useRef, useState } from "react";

/**
 * Custom hook to detect if a sticky element is currently stuck
 * @returns tuple of [ref to attach to element, isSticky boolean state]
 */
export function useSticky<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Create a sentinel element just above the sticky element
    const sentinel = document.createElement("div");
    sentinel.style.height = "1px";
    sentinel.style.width = "100%";
    sentinel.style.pointerEvents = "none";

    const parent = element.parentElement;
    if (!parent) return;

    parent.insertBefore(sentinel, element);

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
      sentinel.remove();
    };
  }, []);

  return [ref, isSticky];
}
