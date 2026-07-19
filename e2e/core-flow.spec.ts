import { expect, test } from '@playwright/test';

// ~15 zdań po ~80+ znaków, każde zakończone kropką — łącznie >= 1000 znaków
// (limit FR-003), a każde zdanie >= 20 znaków, więc MockProvider zwróci 5 propozycji.
const sourceText = Array.from(
  { length: 15 },
  (_, i) =>
    `Zdanie numer ${i + 1} tego materiału opisuje bardzo ważne zagadnienie potrzebne do nauki.`,
).join(' ');

test('przepływ krytyczny: rejestracja → generacja → akceptacja → lista → powtórka', async ({
  page,
}) => {
  expect(sourceText.length).toBeGreaterThanOrEqual(1000);
  const email = `e2e+${Date.now()}@example.com`;

  // Rejestracja
  await page.goto('/register');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel(/Hasło/).fill('super-tajne-haslo-1');
  await page.getByRole('button', { name: 'Zarejestruj się' }).click();
  await page.waitForURL('**/generate');

  // Generacja propozycji (MOCK_AI=1 → deterministycznie 5 propozycji)
  await page.getByLabel('Tekst źródłowy').fill(sourceText);
  await page.getByRole('button', { name: 'Generuj fiszki' }).click();
  await expect(page.getByText(/Propozycje/).first()).toBeVisible();

  // Lista propozycji: tylko ona zawiera przyciski „Akceptuj"
  const proposalList = page
    .getByRole('list')
    .filter({ has: page.getByRole('button', { name: 'Akceptuj' }) });
  const proposals = proposalList.getByRole('listitem');
  await expect(proposals).toHaveCount(5);

  await proposals.nth(0).getByRole('button', { name: 'Akceptuj' }).click();
  await proposals.nth(1).getByRole('button', { name: 'Akceptuj' }).click();
  await proposals.nth(2).getByRole('button', { name: 'Odrzuć' }).click();

  // Zapis wyłącznie zaakceptowanych (FR-005): licznik na przycisku = 2
  await page.getByRole('button', { name: /Zapisz zaakceptowane \(2\)/ }).click();
  await expect(page.getByText('Zapisano 2 fiszek.')).toBeVisible();

  // Lista fiszek: dokładnie 2 pozycje, każda z badge „AI"
  await page.getByRole('link', { name: 'Przejdź do Moje fiszki' }).click();
  await page.waitForURL('**/cards');
  await expect(page.getByRole('heading', { level: 1, name: 'Moje fiszki' })).toBeVisible();
  const aiCards = page
    .getByRole('listitem')
    .filter({ has: page.getByText('AI', { exact: true }) });
  await expect(aiCards).toHaveCount(2);

  // Powtórka: 2 fiszki due; ocena „Dobre" zdejmuje kartę z sesji (licznik maleje),
  // po ocenie obu kart sesja jest pusta.
  await page.goto('/review');
  await expect(page.getByRole('button', { name: 'Pokaż odpowiedź' })).toBeVisible();
  await page.getByRole('button', { name: 'Pokaż odpowiedź' }).click();
  await expect(page.getByRole('button', { name: 'Dobre' })).toBeVisible();
  await page.getByRole('button', { name: 'Dobre' }).click();

  // Została 1 karta — przycisk „Pokaż odpowiedź" pojawia się dla kolejnej
  await expect(page.getByRole('button', { name: 'Pokaż odpowiedź' })).toBeVisible();
  await page.getByRole('button', { name: 'Pokaż odpowiedź' }).click();
  await page.getByRole('button', { name: 'Dobre' }).click();

  // 0 kart due → sesja zakończona, nie ma już nic do odsłonięcia
  await expect(page.getByRole('button', { name: 'Pokaż odpowiedź' })).toHaveCount(0);
});

test('ochrona dostępu: /cards bez sesji przekierowuje na /login', async ({ page }) => {
  // Każdy test dostaje świeży kontekst przeglądarki — brak cookies = brak sesji.
  await page.goto('/cards');
  await expect(page).toHaveURL(/\/login/);
});
