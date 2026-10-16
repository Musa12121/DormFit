import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import AiControls from '../../src/components/AiControls';
import type { AiOptions } from '../../src/domain/ai';

function Controls() {
  const [options, setOptions] = useState<AiOptions>({ enabled: false, prompt: 'Place the plant near the window.' });
  return <AiControls options={options} disabled={false} onChange={setOptions} />;
}

describe('AI controls', () => {
  it('starts with AI off and hides the note field', () => {
    render(<Controls />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('turning AI on exposes a named note input with the saved text', async () => {
    render(<Controls />); await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('textbox', { name: 'Your room preferences' })).toHaveValue('Place the plant near the window.');
    expect(screen.getByText(/Gemini chooses furniture positions/)).toBeVisible();
  });
  it('edits the note without disabling AI', () => {
    const onChange = vi.fn();
    render(<AiControls options={{ enabled: true, prompt: '' }} disabled={false} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Place my desk on the right.' } });
    expect(onChange).toHaveBeenCalledWith({ enabled: true, prompt: 'Place my desk on the right.' });
  });
  it('turning AI off and on preserves the note', async () => {
    render(<Controls />); const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox); await userEvent.click(checkbox); await userEvent.click(checkbox);
    expect(screen.getByRole('textbox')).toHaveValue('Place the plant near the window.');
  });
  it('disables input while generation is running', () => {
    render(<AiControls options={{ enabled: true, prompt: '' }} disabled onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeDisabled(); expect(screen.getByRole('textbox')).toBeDisabled();
  });
  it('limits the note to 600 characters in the browser', () => {
    render(<Controls />); fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '600');
  });
  it('supports multiple instances with distinct input labels', () => {
    const props = { options: { enabled: true, prompt: 'Qeyd' }, disabled: false, onChange: vi.fn() };
    render(<><AiControls {...props} /><AiControls {...props} /></>);
    const fields = screen.getAllByRole('textbox', { name: 'Your room preferences' });
    expect(fields[0].id).not.toBe(fields[1].id);
  });
});
