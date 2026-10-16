import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import NumberField from '../../src/components/NumberField';

function setup(value = 4) {
  const onChange = vi.fn();
  const view = render(<NumberField label="Width" value={value} min={2} max={10} suffix="m" onChange={onChange} />);
  return { ...view, input: screen.getByRole('textbox', { name: 'Width' }), onChange };
}

describe('NumberField', () => {
  it('shows the current number, label and unit', () => {
    const { input } = setup();
    expect(input).toHaveValue('4');
    expect(screen.getByText('m')).toBeVisible();
  });
  it.each(['2', '10', '4.25', '4,25'])('commits valid value %s on blur', (text) => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: text } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(Number(text.replace(',', '.')));
  });
  it.each(['', ' ', 'abc', '1.99', '10.01', 'Infinity'])('rejects %j and explains the allowed range', (text) => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: text } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter 2–10 m.');
  });
  it('Enter commits the edited value', async () => {
    const user = userEvent.setup();
    const { input, onChange } = setup();
    await user.clear(input); await user.type(input, '5{Enter}');
    expect(onChange).toHaveBeenCalledWith(5);
  });
  it('Escape restores the value without submitting a change', () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('4'); expect(onChange).not.toHaveBeenCalled();
  });
  it('clears a validation error as soon as the user edits again', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: '0' } }); fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '3' } });
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
  it('receives external value changes after undo or loading another plan', () => {
    const { input, rerender, onChange } = setup();
    fireEvent.change(input, { target: { value: '8' } });
    rerender(<NumberField label="Width" value={6} min={2} max={10} suffix="m" onChange={onChange} />);
    expect(input).toHaveValue('6');
  });
});
