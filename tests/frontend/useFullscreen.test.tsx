import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useFullscreen } from '../../src/components/useFullscreen';

function Harness() {
  const { panelRef, isFullscreen, toggleFullscreen } = useFullscreen();
  return <section ref={panelRef} aria-label="Plan paneli">
    <button onClick={() => void toggleFullscreen()} aria-pressed={isFullscreen}>Tam ekran</button>
  </section>;
}
const setNative = (enabled: boolean, element: Element | null = null) => {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
};
afterEach(() => {
  for (const property of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) Reflect.deleteProperty(document, property);
});

describe('fullscreen and fallback', () => {
  it('starts outside fullscreen', () => {
    render(<Harness />); expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
  it('falls back to expanded mode when native fullscreen is unavailable', async () => {
    setNative(false); render(<Harness />); await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(document.body.style.overflow).toBe('hidden');
  });
  it('toggles expanded mode off and restores previous scrolling', async () => {
    setNative(false); document.body.style.overflow = 'scroll'; render(<Harness />);
    await userEvent.click(screen.getByRole('button')); await userEvent.click(screen.getByRole('button'));
    expect(document.body.style.overflow).toBe('scroll');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
  it('Escape closes the fallback', async () => {
    setNative(false); render(<Harness />); await userEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
  it('unmount restores scrolling', async () => {
    setNative(false); const { unmount } = render(<Harness />); await userEvent.click(screen.getByRole('button'));
    unmount(); expect(document.body.style.overflow).toBe('');
  });
  it('uses the fallback if native fullscreen rejects the request', async () => {
    setNative(true); render(<Harness />);
    const panel = screen.getByRole('region', { name: 'Plan paneli' });
    panel.requestFullscreen = vi.fn().mockRejectedValue(new Error('Denied'));
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
    expect(panel.requestFullscreen).toHaveBeenCalledOnce();
  });
  it('tracks native fullscreen entry and exit', async () => {
    setNative(true); render(<Harness />);
    const panel = screen.getByRole('region', { name: 'Plan paneli' });
    panel.requestFullscreen = vi.fn().mockImplementation(async () => { setNative(true, panel); fireEvent(document, new Event('fullscreenchange')); });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: vi.fn().mockImplementation(async () => { setNative(true); fireEvent(document, new Event('fullscreenchange')); }) });
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(document.body.style.overflow).toBe('');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
  it('does not close fullscreen behind an open dialog on Escape', async () => {
    setNative(false); render(<><Harness /><dialog open>Save layout</dialog></>);
    await userEvent.click(screen.getByRole('button')); fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
