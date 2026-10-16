import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '../../src/components/Modal';

describe('modal interactions', () => {
  it('opens and presents its title and content', () => {
    render(<Modal title="Save layout" onClose={vi.fn()}>Layout name</Modal>);
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Save layout' })).toBeVisible();
    expect(screen.getByText('Layout name')).toBeVisible();
  });
  it('close button requests dismissal', () => {
    const close = vi.fn(); render(<Modal title="Plan" onClose={close}>Text</Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); expect(close).toHaveBeenCalledOnce();
  });
  it('native Escape/cancel requests dismissal', () => {
    const close = vi.fn(); render(<Modal title="Plan" onClose={close}>Text</Modal>);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true })); expect(close).toHaveBeenCalledOnce();
  });
  it('clicking content does not dismiss it', () => {
    const close = vi.fn(); render(<Modal title="Plan" onClose={close}><p>Inner text</p></Modal>);
    fireEvent.click(screen.getByText('Inner text')); expect(close).not.toHaveBeenCalled();
  });
  it('clicking outside the dialog rectangle requests dismissal', () => {
    const close = vi.fn(); render(<Modal title="Plan" onClose={close}>Text</Modal>);
    fireEvent.click(screen.getByRole('dialog'), { clientX: -5, clientY: -5 }); expect(close).toHaveBeenCalledOnce();
  });
});
