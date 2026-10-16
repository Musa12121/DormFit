import { describe, it, expect, vi } from 'vitest';
import { readCurrent, readSaved, CURRENT_KEY, SAVED_KEY } from '../../src/domain/storage';
import { project } from './fixtures';

describe('browser plan storage', () => {
  it('starts with no saved workspace', () => { expect(readCurrent()).toBeNull(); expect(readSaved()).toEqual([]); });
  it('restores a valid measured workspace', () => {
    const source = project(); localStorage.setItem(CURRENT_KEY, JSON.stringify(source)); expect(readCurrent()).toEqual(source);
  });
  it.each(['{', 'null', '[]', '{"version":99}'])('ignores invalid current workspace %s', (raw) => {
    localStorage.setItem(CURRENT_KEY, raw); expect(readCurrent()).toBeNull();
  });
  it('handles unavailable localStorage without breaking initial render', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(readCurrent()).toBeNull(); expect(readSaved()).toEqual([]);
  });
  it('filters corrupt snapshots while keeping good ones', () => {
    const good = { id: 'saved-1', updatedAt: '2026-10-15', project: project() };
    localStorage.setItem(SAVED_KEY, JSON.stringify([null, {}, { ...good, project: {} }, good]));
    expect(readSaved()).toEqual([good]);
  });
  it('keeps at most twenty named snapshots', () => {
    localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from({ length: 25 }, (_, index) => ({ id: String(index), updatedAt: '2026-10-15', project: project() }))));
    expect(readSaved()).toHaveLength(20); expect(readSaved()[0].id).toBe('0');
  });
  it.each(['{', '{}', 'null'])('ignores malformed saved data %s', (raw) => {
    localStorage.setItem(SAVED_KEY, raw); expect(readSaved()).toEqual([]);
  });
});
