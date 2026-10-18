import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { getLanguage, LANGUAGE_KEY, setLanguage, t, translate } from '../../src/i18n';
import { CURRENT_KEY } from '../../src/domain/storage';
import { requestAiPlan } from '../../src/domain/requestAiPlan';
import { requestPreferenceReview } from '../../src/domain/requestPreferenceReview';
import { AI_PROTOCOL } from '../../src/domain/ai';
import { aiPlan, project } from './fixtures';

const stored = () => JSON.parse(localStorage.getItem(CURRENT_KEY)!);
const switchTo = (language: string) => fireEvent.change(document.querySelector('.language-select')!, { target: { value: language } });

describe('website languages', () => {
  it.each(['ru', 'tr'] as const)('translates AI rate-limit and daily-limit messages into %s', language => {
    for (const prefix of ['AI request limit reached.', 'Daily AI request limit reached.']) {
      const text = `${prefix} Try again in 45 seconds. Regular layouts are still available.`;
      const translated = translate(`${text} (AI_RATE_LIMIT)`, language);
      expect(translated).not.toContain(prefix);
      expect(translated).toContain('45');
      expect(translated).toContain('(AI_RATE_LIMIT)');
      expect(translated).toContain(language === 'ru' ? 'секунд' : 'saniye');
    }
  });
  it.each(['ru', 'tr'] as const)('translates native validation into %s and clears it after editing', language => {
    render(<App />); switchTo(language);
    const input = document.querySelector<HTMLInputElement>('input[name="width"]')!;
    fireEvent.change(input, { target: { value: '' } }); fireEvent.invalid(input);
    expect(input.validationMessage).toBe(language === 'ru' ? 'Заполните это поле.' : 'Lütfen bu alanı doldurun.');
    fireEvent.input(input, { target: { value: '5' } });
    expect(input.validationMessage).toBe('');
  });
  it('switches the full setup and document to Russian without resetting room inputs', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Room width'), { target: { value: '8.5' } });
    switchTo('ru');
    expect(screen.getByRole('heading', { name: 'Какого размера ваша комната?' })).toBeVisible();
    expect(screen.getByLabelText('Ширина комнаты')).toHaveValue(8.5);
    expect(screen.getByRole('button', { name: 'Добавить окно' })).toBeVisible();
    expect(document.documentElement.lang).toBe('ru');
    expect(document.title).toContain('Планировщик');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('ru');
    expect(screen.queryByText('What size is your room?')).not.toBeInTheDocument();
  });

  it('supports Turkish quantities, layouts, canvas labels, resizing and validation', async () => {
    const { container } = render(<App />); switchTo('tr');
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki: eşyalar' }));
    fireEvent.change(screen.getByLabelText('Yatak adedi', { exact: true }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Planları göster' }));
    await waitFor(() => expect(container.querySelectorAll('.layout-card')).toHaveLength(3));
    expect(screen.getByRole('heading', { name: 'Algoritma planları' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Yakınlaştır' })).toBeVisible();
    const bed = container.querySelector('.canvas-panel [data-furniture="bed-1"]')!;
    expect(bed).toHaveAttribute('aria-label', 'Yatak 1, 100 × 200 santimetre');
    fireEvent.focus(bed);
    const width = screen.getByLabelText('Eşya genişliği');
    fireEvent.change(width, { target: { value: '120' } }); fireEvent.blur(width);
    expect(stored().furniture[0].width).toBe(120);
    fireEvent.change(width, { target: { value: '0' } }); fireEvent.blur(width);
    expect(screen.getByText('20–400 cm girin.')).toBeVisible();
    const before = stored(); switchTo('ru');
    expect(screen.getByRole('heading', { name: 'Обзор комнаты' })).toBeVisible();
    expect(stored()).toEqual(before);
  });

  it('translates help and saved-layout dialogs while preserving custom layout names', () => {
    render(<App />); switchTo('ru');
    fireEvent.click(screen.getByRole('button', { name: 'Как это работает' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('01. Измерьте комнату');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    fireEvent.click(screen.getByRole('button', { name: 'Пример комнаты' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть пример' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    fireEvent.change(screen.getByLabelText('Название планировки'), { target: { value: 'Berlin Zimmer 42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить в браузере' }));
    switchTo('tr');
    fireEvent.click(screen.getByRole('button', { name: /Planlarım/ }));
    expect(within(screen.getByRole('dialog')).getByText('Berlin Zimmer 42')).toBeVisible();
  });

  it('keeps a mixed-language note unchanged when the interface changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' }));
    const note = 'Растение у окна, und das Bett weit weg von der Tür.';
    fireEvent.change(screen.getByLabelText('Your room preferences'), { target: { value: note } });
    switchTo('tr');
    expect(screen.getByLabelText('Odanız için tercihleriniz')).toHaveValue(note);
    expect(screen.getByText(/Aynı notta bile farklı diller/)).toBeVisible();
  });

  it('cancels an in-flight interpretation when switching language, ignoring late replies', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Next: furniture' }));
    fireEvent.change(screen.getByLabelText('Plant count', { exact: true }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create an AI layout' }));
    fireEvent.change(screen.getByLabelText('Your room preferences'), { target: { value: 'Растение у окна.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show layouts' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    const fetchMock = vi.mocked(fetch); const signal = fetchMock.mock.calls[0][1]!.signal!;
    switchTo('tr');
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(Response.json({ requirements: [{ itemId: 'plant-1', targetId: 'window', relation: 'near' }], unmetRequests: [] }, { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planları göster' })).toBeEnabled();
  });

  it('works with unavailable browser storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
    expect(() => setLanguage('tr')).not.toThrow();
    expect(getLanguage()).toBe('tr'); expect(t('Room')).toBe('Oda');
  });
});

describe('translated dynamic text', () => {
  it.each([
    ['Bed 2', 'Кровать 2', 'Yatak 2'],
    ['Remove condition 1', 'Удалить условие 1', 'Koşul 1 sil'],
    ['Condition 2 target', 'Условие 2: ориентир', 'Koşul 2: hedef'],
    ['Window 2 (right wall)', 'Окно 2 (правая стена)', 'Pencere 2 (sağ duvar)'],
    ['DOOR 1', 'ДВЕРЬ 1', 'KAPI 1'],
    ['Wardrobe 1 and Bed 2 overlap.', 'Шкаф 1 и Кровать 2 пересекаются.', 'Gardırop 1 ve Yatak 2 çakışıyor.'],
    ['Move Door 1, bottom wall, 85 cm wide, offset 10 cm', 'Переместить Дверь 1, нижняя стена, ширина 85 см, отступ 10 см', 'Kapı 1 taşı, alt duvar, 85 cm genişlik, 10 cm uzaklık'],
  ])('translates %s', (source, ru, tr) => {
    expect(translate(source, 'ru')).toBe(ru); expect(translate(source, 'tr')).toBe(tr);
  });
  it('preserves custom names, numbers and English text', () => {
    expect(translate('Berlin Zimmer 42', 'ru')).toBe('Berlin Zimmer 42');
    expect(translate('Room 42', 'tr')).toBe('Room 42');
    expect(translate('Bed 2', 'en')).toBe('Bed 2');
    expect(t(123)).toBe(123); expect(t(undefined)).toBeUndefined();
  });
  it('keeps diagnostic codes readable with translated errors', () => {
    expect(translate('Gemini took too long to respond. (GEMINI_TIMEOUT)', 'tr')).toBe('Gemini zamanında yanıt vermedi. (GEMINI_TIMEOUT)');
  });
});

describe('multilingual AI requests', () => {
  it.each(['ru', 'tr'] as const)('sends %s and the exact mixed note to both endpoints', async language => {
    setLanguage(language);
    const note = 'Растение у окна. Das Bett weit weg von der Tür.';
    const review = { requirements: aiPlan().requirements, unmetRequests: [] };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(review, { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } }))
      .mockResolvedValueOnce(Response.json(aiPlan(), { headers: { 'X-DormFit-AI-Version': AI_PROTOCOL } }));
    vi.stubGlobal('fetch', fetchMock);
    await requestPreferenceReview(project(), note, new AbortController().signal);
    await requestAiPlan(project(), note, new AbortController().signal, review);
    for (const [, options] of fetchMock.mock.calls) expect(JSON.parse(options.body)).toMatchObject({ prompt: note, language });
  });
});
