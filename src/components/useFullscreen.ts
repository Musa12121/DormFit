import { useEffect, useRef, useState } from 'react';

export function useFullscreen() {
  const panelRef = useRef<HTMLElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expandedFallback, setExpandedFallback] = useState(false);
  const isFullscreen = nativeFullscreen || expandedFallback;

  useEffect(() => {
    const sync = () => setNativeFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    if (expandedFallback) document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        if (document.fullscreenElement === panel) void document.exitFullscreen().catch(() => {});
        setExpandedFallback(false);
      }
      if (event.key === 'Tab') {
        const controls = [
          ...panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen, expandedFallback]);

  async function toggleFullscreen() {
    const panel = panelRef.current;
    if (!panel) return;
    if (expandedFallback) {
      setExpandedFallback(false);
      return;
    }
    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }
    if (document.fullscreenEnabled && panel.requestFullscreen) {
      try {
        await panel.requestFullscreen();
        return;
      } catch {
        /* Embedded/mobile browsers can deny native fullscreen. */
      }
    }
    setExpandedFallback(true);
  }

  return { panelRef, isFullscreen, expandedFallback, toggleFullscreen };
}
