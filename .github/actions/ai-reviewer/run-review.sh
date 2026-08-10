#!/usr/bin/env bash
#
# Uruchamia agenta z ai-review/ na diffie przekazanym w zmiennej DIFF i tłumaczy
# jego kod wyjścia na werdykt akcji.
#
# Kontrakt agenta (ai-review/README.md):
#   0 → bramka przepuszcza      → verdict=pass
#   1 → bramka blokuje          → verdict=blocked  (krok NIE pada — najpierw komentarz na PR)
#   2 → agent nie wystartował   → verdict=error    (krok pada od razu, nie ma czego komentować)
#
# Rozdzielenie 1 od 2 jest po to, żeby „recenzja zablokowała merge" nie wyglądało
# w CI tak samo jak „agent się wysypał" — to dwa różne zdarzenia i dwie różne reakcje.
#
# BEZPIECZEŃSTWO: OPENROUTER_API_KEY wchodzi tu wyłącznie przez env i nigdzie nie
# jest wypisywany. Żadnego `set -x` w tym pliku — trace pokazałby wartość zmiennej
# w logu przebiegu. Wejście od autora PR-a (DIFF, tytuł, opis) jest czytane z env
# i nigdy nie trafia do kodu powłoki przez interpolację.

set -euo pipefail

AGENT_DIR="${GITHUB_WORKSPACE}/ai-review"
DIFF_FILE="${RUNNER_TEMP}/ai-review-input.diff"
JSON_FILE="${RUNNER_TEMP}/ai-review.json"
LOG_FILE="${RUNNER_TEMP}/ai-review.log"
COMMENT_FILE="${RUNNER_TEMP}/ai-review-comment.md"

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "::error title=Brak klucza::wejście api-key jest puste. W przebiegu z forka sekrety repozytorium nie są dostępne — to oczekiwane."
  echo "verdict=error" >> "$GITHUB_OUTPUT"
  exit 1
fi

if [ ! -d "$AGENT_DIR" ]; then
  echo "::error title=Brak paczki agenta::nie znaleziono ${AGENT_DIR}. Akcja jest wariantem lokalnym — działa w repozytorium, które trzyma agenta w ai-review/."
  echo "verdict=error" >> "$GITHUB_OUTPUT"
  exit 1
fi

printf '%s' "${DIFF:-}" > "$DIFF_FILE"
echo "diff na wejściu: $(wc -c < "$DIFF_FILE") bajtów"

cd "$AGENT_DIR"

# Diff idzie przez plik, nie przez potok — dzięki temu kod wyjścia agenta jest
# kodem wyjścia jedynego procesu w linii i nie miesza się z SIGPIPE po stronie printf.
code=0
npx --no-install tsx review.ts < "$DIFF_FILE" > "$JSON_FILE" 2> "$LOG_FILE" || code=$?

# stderr agenta to model, koszt, tokeny i powody bramki — to ma być widoczne w logu.
echo "----- ai-review (stderr) -----"
cat "$LOG_FILE"
echo "------------------------------"

case "$code" in
  0) verdict=pass ;;
  1) verdict=blocked ;;
  *) verdict=error ;;
esac
echo "verdict=${verdict}" >> "$GITHUB_OUTPUT"
echo "kod wyjścia agenta: ${code} → verdict=${verdict}"

if [ "$verdict" = "error" ]; then
  echo "::error title=Agent code review nie wystartował::kod wyjścia ${code}. Szczegóły w sekcji stderr powyżej."
  exit 1
fi

if ! jq -e . "$JSON_FILE" > /dev/null 2>&1; then
  echo "::error title=Niepoprawne wyjście agenta::na stdout nie ma poprawnego JSON-a mimo kodu wyjścia ${code}."
  exit 1
fi

# Komentarz budujemy jq-em prosto do pliku. Treść od modelu ani razu nie przechodzi
# przez interpolację powłoki — gdyby przechodziła, wystarczyłby diff z odpowiednim
# ciągiem, żeby wykonać polecenie na runnerze.
if [ "$verdict" = "blocked" ]; then
  printf '## Agent code review — BRAMKA BLOKUJE\n\n' > "$COMMENT_FILE"
else
  printf '## Agent code review — bramka przepuszcza\n\n' > "$COMMENT_FILE"
fi

jq -r '
  if (.skipped // false) then
    "Diff względem gałęzi bazowej jest pusty — nie ma czego recenzować."
  else
    [
      (.summary // "_model nie zwrócił pola summary_"),
      "",
      "### Bramka",
      (if .gate.passed
        then "Żadna z trzech reguł progowych nie zadziałała."
        else (.gate.reasons | map("- " + .) | join("\n"))
      end),
      "",
      "### Oceny (odczytane z odpowiedzi, nie z narracji modelu)",
      "",
      "| kryterium | ocena |",
      "| --- | --- |",
      (.scores | to_entries | map("| `\(.key)` | \(.value) |") | join("\n")),
      "| **średnia** | **\(.average)** |",
      "",
      "### Przebieg",
      "",
      "| pole | wartość |",
      "| --- | --- |",
      "| model | `\(.model)` |",
      "| provider | `\(.provider // "nieznany")` |",
      "| werdykt modelu (doradczy) | `\(.modelVerdict)` |",
      "| diff | \(.diff.chars) znaków\(if .diff.truncated then " (przycięty)" else "" end) |",
      "| tokeny | in \(.usage.inputTokens // "?") / out \(.usage.outputTokens // "?") / total \(.usage.totalTokens // "?") |",
      "| koszt | \(if .usage.costUsd == null then "nieznany — \(.usage.costSource)" else "$\(.usage.costUsd)" end) |",
      "| czas | \(.usage.durationMs) ms |",
      (if ((.warnings // []) | length) > 0
        then "\n### Ostrzeżenia\n\n" + ((.warnings) | map("- " + .) | join("\n"))
        else ""
      end)
    ] | join("\n")
  end
' "$JSON_FILE" >> "$COMMENT_FILE"

# Ścieżki dla kolejnych kroków joba — konsument nie musi ich znać na pamięć.
{
  echo "AI_REVIEW_COMMENT_FILE=${COMMENT_FILE}"
  echo "AI_REVIEW_JSON_FILE=${JSON_FILE}"
} >> "$GITHUB_ENV"

# Ten sam raport na stronie przebiegu — zostaje czytelny nawet wtedy, gdy
# komentowanie PR-a padnie na uprawnieniach.
cat "$COMMENT_FILE" >> "$GITHUB_STEP_SUMMARY"
