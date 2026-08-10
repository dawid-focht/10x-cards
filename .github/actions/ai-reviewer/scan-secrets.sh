#!/usr/bin/env bash
#
# Skan sekretów w diffie — uruchamiany PRZED wysłaniem czegokolwiek do modelu.
#
# Kolejność jest całym sensem tego kroku. Gdyby skan stał po recenzji, sekret
# najpierw poleciałby do zewnętrznego API (OpenRouter → provider modelu), a
# dopiero potem model uprzejmie doniósłby, że w diffie jest sekret. Wyciek już
# by się wtedy wydarzył. Dlatego: znalezisko = przebieg pada, model nic nie widzi.
#
# DWIE ZASADY, KTÓRYCH NIE WOLNO ZŁAMAĆ PRZY EDYCJI TEGO PLIKU:
#
# 1. Wzorce są pełnymi wyrażeniami regularnymi z klasami znaków, nie gołymi
#    prefiksami. Powód jest podwójny:
#      - goły prefiks (np. "sk-or-v1-") pasowałby do linii, która ten prefiks
#        tylko definiuje — czyli do diffu dodającego TEN plik. Skan wywalałby
#        się na własnym pull requeście. Zapis z klasą znaków po prefiksie nie
#        pasuje sam do siebie, bo po prefiksie stoi "[", a nie znak z klasy.
#      - ai-review/fixtures/sample-diff.patch zawiera syntetyczny klucz
#        "sk-or-v1-EXAMPLE000...", celowo łamiący format hex prawdziwych kluczy
#        OpenRoutera. Wzorzec wymagający 16+ znaków hex go nie łapie, więc PR
#        dotykający fixtur nie generuje fałszywego alarmu — a prawdziwy klucz
#        w tej samej fixturze złapie.
#
# 2. Skrypt NIGDY nie wypisuje dopasowanej treści — wyłącznie nazwę wzorca i
#    liczbę trafień. Wypisanie linii przeniosłoby sekret prosto do logu
#    przebiegu, czyli w miejsce, do którego zagląda więcej ludzi niż do diffu.

set -euo pipefail

DIFF="${DIFF:-}"

if [ -z "$DIFF" ]; then
  echo "skan sekretów: diff jest pusty — nie ma czego skanować."
  exit 0
fi

# Format wpisu: "nazwa czytelna|regex ERE". W żadnym regexie nie ma znaku "|",
# bo służy on tu za separator pola.
PATTERNS=(
  "klucz OpenRouter|sk-or-v1-[0-9a-f]{16,}"
  "klucz Anthropic|sk-ant-[A-Za-z0-9_-]{20,}"
  "klucz projektowy OpenAI|sk-proj-[A-Za-z0-9_-]{20,}"
  "GitHub personal access token|ghp_[A-Za-z0-9]{36}"
  "GitHub OAuth token|gho_[A-Za-z0-9]{36}"
  "AWS access key id|AKIA[0-9A-Z]{16}"
  "klucz prywatny w formacie PEM|-----BEGIN [A-Z ]*PRIVATE KEY-----"
)

found=0

for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"
  regex="${entry#*|}"
  # grep -c zwraca 1, gdy nic nie znalazł — stąd "|| true" pod `set -e`.
  hits=$(printf '%s' "$DIFF" | grep -cE -- "$regex" || true)
  if [ "$hits" -gt 0 ]; then
    echo "::error title=Sekret w diffie::${name}: ${hits} pasujących linii. Treść świadomie nie trafia do logu."
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  cat >&2 <<'MSG'

Przebieg zatrzymany PRZED wywołaniem modelu — diff pasuje do wzorca sekretu.

Co zrobić:
  1. Znajdź linię lokalnie:  git diff origin/main...HEAD | grep -nE '<wzorzec>'
  2. Usuń sekret z historii gałęzi (sam commit "usuwający" nie wystarczy —
     wartość zostaje w poprzednim commicie i jest już w remote).
  3. Uznaj klucz za spalony i wymień go u dostawcy.

Jeżeli to fałszywy alarm (np. przykład w dokumentacji), zmień przykład tak, by
łamał format prawdziwego klucza — wzorce z tego skanu są celowo wąskie i
poluzowanie ich jest gorszym rozwiązaniem niż poprawienie przykładu.
MSG
  exit 1
fi

echo "skan sekretów: czysto (sprawdzono ${#PATTERNS[@]} wzorców)."
