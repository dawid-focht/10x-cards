import { useEffect, useState } from 'react';

// Wyspa React: sesja powtórek SM-2 — kolejka fiszek due, oceny again/hard/good/easy.

interface ReviewCard {
  id: number;
  front: string;
  back: string;
}

type Grade = 'again' | 'hard' | 'good' | 'easy';

const GRADE_BUTTONS: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Jeszcze raz' },
  { grade: 'hard', label: 'Trudne' },
  { grade: 'good', label: 'Dobre' },
  { grade: 'easy', label: 'Łatwe' },
];

export default function ReviewSession() {
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [grading, setGrading] = useState(false);

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
        const res = await fetch('/api/reviews');
        if (!res.ok) {
          throw new Error(await readError(res, 'Nie udało się pobrać fiszek do powtórki.'));
        }
        const data = (await res.json()) as ReviewCard[] | { items: ReviewCard[] };
        const items = Array.isArray(data) ? data : data.items;
        if (!cancelled) setQueue(items);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Nie udało się pobrać fiszek do powtórki.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function grade(g: Grade) {
    const current = queue[0];
    if (!current || grading) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flashcardId: current.id, grade: g }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, 'Nie udało się zapisać oceny.'));
      }
      const rest = queue.slice(1);
      if (g === 'again') {
        setQueue([...rest, current]);
      } else {
        setQueue(rest);
        setDoneCount((n) => n + 1);
      }
      setShowBack(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać oceny.');
    } finally {
      setGrading(false);
    }
  }

  if (loading) {
    return <p className="text-slate-500">Ładowanie...</p>;
  }

  if (queue.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6 text-center">
        {error && (
          <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}
        {doneCount > 0 ? (
          <p className="text-lg font-medium">Sesja zakończona! Powtórzono {doneCount} fiszek.</p>
        ) : (
          <p className="text-slate-600">Brak fiszek do powtórki. Wróć później!</p>
        )}
      </div>
    );
  }

  const current = queue[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Pozostało: {queue.length}</p>
      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}
      <div className="rounded border border-slate-200 bg-white p-6">
        <p className="text-xl font-medium">{current.front}</p>
        {showBack ? (
          <>
            <p className="mt-4 border-t border-slate-200 pt-4 text-slate-600">{current.back}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {GRADE_BUTTONS.map(({ grade: g, label }) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => grade(g)}
                  disabled={grading}
                  className="rounded border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowBack(true)}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Pokaż odpowiedź
          </button>
        )}
      </div>
    </div>
  );
}
