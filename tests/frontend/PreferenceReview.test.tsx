import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreferenceReviewModal from '../../src/components/PreferenceReviewModal';
import type { PreferenceReview } from '../../src/domain/ai';
import { requestPreferenceReview } from '../../src/domain/requestPreferenceReview';
import { AI_PROTOCOL } from '../../src/domain/ai';
import { furniture, project } from './fixtures';

const initial: PreferenceReview = { requirements: [{ itemId: 'plant-1', targetId: 'window', relation: 'near' }], unmetRequests: ['Cannot verify sunlight.'] };
function setup(overrides: { busy?: boolean; error?: string; review?: PreferenceReview } = {}) {
  const onConfirm = vi.fn(), onClose = vi.fn();
  function Harness() {
    const [review, setReview] = useState(overrides.review ?? structuredClone(initial));
    return <PreferenceReviewModal project={project()} prompt="Plant near window" review={review} busy={overrides.busy ?? false}
      error={overrides.error ?? ''} onChange={setReview} onConfirm={() => onConfirm(review)} onClose={onClose} />;
  }
  return { ...render(<Harness />), onConfirm, onClose };
}

describe('preference review', () => {
  it('lets the user change a relation and target before confirming', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText('Condition 1 relation'), { target: { value: 'away' } });
    fireEvent.change(screen.getByLabelText('Condition 1 target'), { target: { value: 'left-wall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & create layout' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ requirements: [{ itemId: 'plant-1', targetId: 'left-wall', relation: 'away' }] }));
  });
  it('supports removing and adding conditions', () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(screen.queryByLabelText('Condition 1 target')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.getByLabelText('Condition 1 target')).toBeVisible();
  });
  it('allows unsupported requests to be removed explicitly', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove unsupported request 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & create layout' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ unmetRequests: [] }));
  });
  it('disables confirmation while interpreting and allows cancellation', () => {
    const { onClose } = setup({ busy: true });
    expect(screen.getByRole('status')).toHaveTextContent('No AI layout');
    expect(screen.getByRole('button', { name: 'Confirm & create layout' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' })); expect(onClose).toHaveBeenCalledOnce();
  });
  it('prevents contradictory conditions', () => {
    setup({ review: { ...initial, requirements: [...initial.requirements, { ...initial.requirements[0], relation: 'away' }] } });
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be both near and away');
    expect(screen.getByRole('button', { name: 'Confirm & create layout' })).toBeDisabled();
  });
  it('allows manual conditions if interpretation fails', () => {
    setup({ error: 'AI unavailable.', review: { requirements: [], unmetRequests: [] } });
    expect(screen.getByRole('alert')).toHaveTextContent('edit conditions manually');
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.getByRole('button', { name: 'Confirm & create layout' })).toBeEnabled();
  });
});

describe('preference review request', () => {
  const request = () => requestPreferenceReview(project(), 'Plant near window', new AbortController().signal);
  it('understands a clear dining-table-to-window note without a model request', async () => {
    const room = { ...project(), furniture: [furniture({ id: 'dining-table-1', kind: 'dining-table', name: 'Dining table 1' })] };
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(requestPreferenceReview(room, 'dining table should be near the window', new AbortController().signal))
      .resolves.toEqual({ requirements: [{ itemId: 'dining-table-1', targetId: 'window', relation: 'near' }], unmetRequests: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('explains when a simple note names furniture that was not selected', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(requestPreferenceReview(project(), 'dining table should be near the window', new AbortController().signal))
      .resolves.toEqual({ requirements: [], unmetRequests: ['Dining table is not selected, so this condition cannot be applied.'] });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requests interpretation without sending a key or layout-generation request', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(initial, { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } })); vi.stubGlobal('fetch', fetch);
    expect(await request()).toEqual(initial);
    expect(fetch).toHaveBeenCalledWith('/api/interpret-preferences', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ project: project(), prompt: 'Plant near window', language: 'en' });
  });
  it('rejects a stale backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(initial)));
    await expect(request()).rejects.toThrow(/old or incompatible backend/);
  });
  it('rejects invented targets and empty interpretations', async () => {
    for (const value of [{ requirements: [], unmetRequests: [] }, { ...initial, requirements: [{ itemId: 'plant-1', targetId: 'invented', relation: 'near' }] }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value, { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } })));
      await expect(request()).rejects.toThrow(/invalid preference review/);
    }
  });
  it('reports a safe service failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Please try again.' }, { status: 429 })));
    await expect(request()).rejects.toThrow('Please try again.');
  });
});
