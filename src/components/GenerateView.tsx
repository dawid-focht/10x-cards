import { useState } from 'react';
import { SOURCE_TEXT_MIN, SOURCE_TEXT_MAX } from '../lib/validation';

// Wyspa React: generowanie propozycji fiszek z tekstu źródłowego + bramka akceptacji.

type ProposalStatus = 'pending' | 'accepted' | 'edited' | 'rejected';

interface ProposalItem {
  front: string;
  back: string;
  status: ProposalStatus;
  editedFront: string;
  editedBack: string;
}

export default function GenerateView() {
  const [sourceText, setSourceText] = useState('');
  const [proposals, setProposals] = useState<ProposalItem[] | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const trimmedLength = sourceText.trim().length;
  const canGenerate =
    !loading && trimmedLength >= SOURCE_TEXT_MIN && trimmedLength <= SOURCE_TEXT_MAX;

  const acceptedCount =
    proposals?.filter((p) => p.status === 'accepted' || p.status === 'edited').length ?? 0;

  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const data = (await res.json()) as { error?: string };
      return data.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setSavedCount(null);
    try {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, 'Nie udało się wygenerować fiszek.'));
      }
      const data = (await res.json()) as {
        generationId: number;
        proposals: { front: string; back: string }[];
      };
      setGenerationId(data.generationId);
      setProposals(
        data.proposals.map((p) => ({
          front: p.front,
          back: p.back,
          status: 'pending' as const,
          editedFront: p.front,
          editedBack: p.back,
        })),
      );
      setEditingIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wygenerować fiszek.');
    } finally {
      setLoading(false);
    }
  }

  function updateProposal(index: number, patch: Partial<ProposalItem>) {
    setProposals((prev) =>
      prev ? prev.map((p, i) => (i === index ? { ...p, ...patch } : p)) : prev,
    );
  }

  async function saveAccepted() {
    if (!proposals) return;
    const accepted = proposals
      .filter((p) => p.status === 'accepted' || p.status === 'edited')
      .map((p) =>
        p.status === 'edited'
          ? { front: p.editedFront, back: p.editedBack, edited: true }
          : { front: p.front, back: p.back, edited: false },
      );
    const rejectedCount = proposals.filter((p) => p.status === 'rejected').length;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, accepted, rejectedCount }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, 'Nie udało się zapisać fiszek.'));
      }
      setSavedCount(accepted.length);
      setProposals(null);
      setGenerationId(null);
      setEditingIndex(null);
      setSourceText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać fiszek.');
    } finally {
      setSaving(false);
    }
  }

  if (proposals === null) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6">
        {savedCount !== null && (
          <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-800">
            <p>Zapisano {savedCount} fiszek.</p>
            <a href="/cards" className="font-medium text-indigo-600 underline">
              Przejdź do Moje fiszki
            </a>
          </div>
        )}
        <label htmlFor="source-text" className="mb-2 block font-medium">
          Tekst źródłowy
        </label>
        <textarea
          id="source-text"
          rows={10}
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className="w-full rounded border border-slate-200 p-3 focus:border-indigo-600 focus:outline-none"
        />
        <div className="mt-1 flex justify-between text-sm text-slate-500">
          <span>Minimum {SOURCE_TEXT_MIN} znaków.</span>
          <span>
            {sourceText.length} / {SOURCE_TEXT_MAX} znaków
          </span>
        </div>
        {error && (
          <div role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="mt-2 rounded border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className="mt-4 rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generuj fiszki
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">Propozycje ({proposals.length})</h2>
      {error && (
        <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}
      <ul className="space-y-3">
        {proposals.map((p, i) => {
          const isAccepted = p.status === 'accepted' || p.status === 'edited';
          const front = p.status === 'edited' ? p.editedFront : p.front;
          const back = p.status === 'edited' ? p.editedBack : p.back;
          return (
            <li
              key={i}
              className={`rounded border border-slate-200 p-4 ${
                isAccepted ? 'bg-green-50' : p.status === 'rejected' ? 'opacity-50' : ''
              }`}
            >
              <p className="font-medium">{front}</p>
              <p className="text-slate-600">{back}</p>
              {isAccepted && (
                <p className="mt-1 text-sm font-medium text-green-700">Zaakceptowana</p>
              )}
              {p.status === 'rejected' && (
                <p className="mt-1 text-sm text-slate-500">Odrzucona</p>
              )}
              {editingIndex === i ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    aria-label="Przód fiszki"
                    value={p.editedFront}
                    onChange={(e) => updateProposal(i, { editedFront: e.target.value })}
                    className="w-full rounded border border-slate-200 p-2 focus:border-indigo-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    aria-label="Tył fiszki"
                    value={p.editedBack}
                    onChange={(e) => updateProposal(i, { editedBack: e.target.value })}
                    className="w-full rounded border border-slate-200 p-2 focus:border-indigo-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      updateProposal(i, { status: 'edited' });
                      setEditingIndex(null);
                    }}
                    className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Zapisz zmiany
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateProposal(i, { status: 'accepted' })}
                    className="rounded border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100"
                  >
                    Akceptuj
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(i)}
                    className="rounded border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100"
                  >
                    Edytuj
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProposal(i, { status: 'rejected' })}
                    className="rounded border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100"
                  >
                    Odrzuć
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={saveAccepted}
        disabled={acceptedCount === 0 || saving}
        className="mt-6 rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Zapisz zaakceptowane ({acceptedCount})
      </button>
    </div>
  );
}
