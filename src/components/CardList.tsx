import { useEffect, useState } from 'react';

// Wyspa React: lista fiszek użytkownika + ręczne dodawanie, edycja i usuwanie.

interface Flashcard {
  id: number;
  front: string;
  back: string;
  source: 'ai-full' | 'ai-edited' | 'manual';
}

const SOURCE_LABELS: Record<Flashcard['source'], string> = {
  'ai-full': 'AI',
  'ai-edited': 'AI (edytowana)',
  manual: 'Ręczna',
};

export default function CardList() {
  const [items, setItems] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const data = (await res.json()) as { error?: string };
      return data.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/flashcards');
        if (!res.ok) {
          throw new Error(await readError(res, 'Nie udało się pobrać fiszek.'));
        }
        const data = (await res.json()) as { items: Flashcard[]; total: number };
        if (!cancelled) setItems(data.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Nie udało się pobrać fiszek.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addCard() {
    setError(null);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: newFront, back: newBack }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, 'Nie udało się dodać fiszki.'));
      }
      const data = (await res.json()) as Flashcard | { item: Flashcard };
      const card = 'item' in data ? data.item : data;
      setItems((prev) => [...prev, card]);
      setNewFront('');
      setNewBack('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać fiszki.');
    }
  }

  async function saveEdit(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/flashcards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: editFront, back: editBack }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, 'Nie udało się zapisać zmian.'));
      }
      setItems((prev) =>
        prev.map((c) => (c.id === id ? { ...c, front: editFront, back: editBack } : c)),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać zmian.');
    }
  }

  async function removeCard(id: number) {
    if (!window.confirm('Usunąć tę fiszkę?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/flashcards/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(await readError(res, 'Nie udało się usunąć fiszki.'));
      }
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć fiszki.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Dodaj fiszkę ręcznie</h2>
        <div className="space-y-2">
          <input
            type="text"
            aria-label="Przód fiszki"
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            placeholder="Przód fiszki"
            className="w-full rounded border border-slate-200 p-2 focus:border-indigo-600 focus:outline-none"
          />
          <input
            type="text"
            aria-label="Tył fiszki"
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            placeholder="Tył fiszki"
            className="w-full rounded border border-slate-200 p-2 focus:border-indigo-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={addCard}
            disabled={!newFront.trim() || !newBack.trim()}
            className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Dodaj fiszkę
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Ładowanie...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Nie masz jeszcze fiszek.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((card) => (
            <li key={card.id} className="rounded border border-slate-200 bg-white p-4">
              {editingId === card.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    aria-label="Przód fiszki"
                    value={editFront}
                    onChange={(e) => setEditFront(e.target.value)}
                    className="w-full rounded border border-slate-200 p-2 focus:border-indigo-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    aria-label="Tył fiszki"
                    value={editBack}
                    onChange={(e) => setEditBack(e.target.value)}
                    className="w-full rounded border border-slate-200 p-2 focus:border-indigo-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(card.id)}
                    className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Zapisz
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{card.front}</p>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {SOURCE_LABELS[card.source]}
                    </span>
                  </div>
                  <p className="text-slate-600">{card.back}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(card.id);
                        setEditFront(card.front);
                        setEditBack(card.back);
                      }}
                      className="rounded border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100"
                    >
                      Edytuj
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCard(card.id)}
                      className="rounded border border-slate-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      Usuń
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
