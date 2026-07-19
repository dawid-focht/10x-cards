# Lessons — rejestr lekcji z incydentów (append-only)

## L-001 CLAUDE.md jest symlinkiem — zapis niszczy AGENTS.md

- **Context:** bootstrap F-01; create-astro generuje `CLAUDE.md -> AGENTS.md` (symlink).
- **Problem:** zapis treści „do CLAUDE.md" podążył za symlinkiem i nadpisał pełne
  reguły w AGENTS.md jedną linijką importu.
- **Rule:** przed nadpisaniem pliku konfiguracyjnego sprawdź `ls -la`, czy nie jest
  symlinkiem; reguły edytuj wyłącznie w AGENTS.md.
- **Applies to:** AGENTS.md, CLAUDE.md, wszystkie pliki generowane starterem.
