#!/usr/bin/env bash
# check-spec-parity.sh — assert that a plan spec.html is internally self-consistent.
#
# WHAT THIS ASSERTS (and, just as importantly, what it does not)
# --------------------------------------------------------------
# The Alloro spec template carries the execution status on TWO surfaces that AGENTS.md
# requires to be updated together: the hero pill and the meta-grid status card. This check
# reads both, out of the FILE (not the diff text), and asserts:
#
#   1. PARITY   — the pill and the status card must agree.
#   2. VOCAB    — the status must come from the documented set in CLAUDE.md
#                 (Pending Execution / In Progress / Needs Revision / Blocked / Completed).
#                 ADVISORY by default; --strict-vocab promotes it to a finding.
#   3. §20.5    — a spec this PR MOVES TO "Completed" must ship a test-results.json that
#                 rolls up Passed. Only fires when the PR actually changes the status, so
#                 brushing a folder whose spec was already Completed asserts nothing new.
#
# It deliberately does NOT read PR state. An earlier design asked GitHub whether the PR had
# merged and failed a spec that said "Completed" while unmerged. That collides head-on with
# the documented --done contract (a --done PR is Completed AND unmerged, by construction),
# and it made the verdict depend on mutable external state — re-running the same workflow on
# the same commit after a merge flipped red to green. Self-consistency is a pure function of
# the tree: same input, same verdict, no network, no `gh`, no pull-requests: read scope.
#
# WHY FILE-BASED, NOT DIFF-BASED
#   Parsing `+` lines out of a diff cannot see a pill that wraps across lines, mis-tracks the
#   current file when an added line itself begins with "++ ", and fires on a pure re-indent of
#   an already-Completed pill. Reading the post-image of each touched file removes all three
#   classes at once, because there is no longer a line-oriented parse.
#
# TEMPLATES RECOGNISED
#   A (documented): <span class="status-pill …">Status</span> + <div class="status-card">…<dd>Status</dd>
#   B (funnel-engine family, 10 specs): <span class="pill …"><span class="dot"></span>Status · …</span>
#     with no status card. Single-surface — no disagreement is possible, so it is not an error.
#     Template B is matched only when no status-pill exists, and only its FIRST pill is read
#     (later `pill meta` spans in that template carry branch names and Rev dates, not status).
#
# USAGE
#   scripts/check-spec-parity.sh --self-test                  # fixture suite, no repo state
#   scripts/check-spec-parity.sh --scan-corpus                # every plans/*/spec.html
#   scripts/check-spec-parity.sh --files a/spec.html b/spec.html
#   scripts/check-spec-parity.sh --base <sha> --head <sha>    # specs touched between two commits
#   BASE_SHA=… HEAD_SHA=… scripts/check-spec-parity.sh        # the CI form
#   …anywhere: --strict-vocab to make an off-vocabulary status a finding rather than a warning.
#
# EXIT CODES  (distinct, so a failure mode is legible from the code alone)
#   0  clean — no spec.html in scope, or every one parsed and agreed
#   1  finding — pill/card disagreement, §20.5 breach, or (with --strict-vocab) bad vocabulary
#   2  usage or infrastructure error — bad flags, no python3, unreadable file, git failure
#   3  FAIL CLOSED — a spec.html in scope carries no extractable status on any known surface
#
# Requires: python3 (preinstalled on ubuntu-latest and already used by the repo script layer).
# No network, no gh, no npm dependency.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

MODE=""
STRICT_VOCAB=0
BASE="${BASE_SHA:-}"
HEAD="${HEAD_SHA:-}"
FILES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --self-test)    MODE="self-test" ;;
    --scan-corpus)  MODE="corpus" ;;
    --files)        MODE="files"; shift; while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do FILES+=("$1"); shift; done; continue ;;
    --base)         shift; BASE="${1:-}" ;;
    --head)         shift; HEAD="${1:-}" ;;
    --strict-vocab) STRICT_VOCAB=1 ;;
    -h|--help)      sed -n '2,50p' "$0"; exit 0 ;;
    *)              echo "check-spec-parity: unknown argument '$1'" >&2; exit 2 ;;
  esac
  shift
done

command -v python3 >/dev/null 2>&1 || {
  echo "check-spec-parity: python3 not found — cannot parse specs, refusing to report clean" >&2
  exit 2
}

# Default mode: diff a base against a head. This is the CI shape.
if [ -z "$MODE" ]; then
  if [ -n "$BASE" ] && [ -n "$HEAD" ]; then
    MODE="diff"
  else
    echo "check-spec-parity: no mode selected." >&2
    echo "  pass --self-test, --scan-corpus, --files <paths…>, or --base <sha> --head <sha>" >&2
    echo "  (in CI, set BASE_SHA and HEAD_SHA)" >&2
    exit 2
  fi
fi

# Resolve the file list for diff mode here, in bash, so a git failure is caught and cannot be
# mistaken for "no specs touched" — the exact fail-open shape this rewrite exists to remove.
if [ "$MODE" = "diff" ]; then
  if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
    echo "check-spec-parity: base commit '$BASE' is not resolvable in this checkout" >&2
    exit 2
  fi
  if ! git rev-parse --verify --quiet "$HEAD^{commit}" >/dev/null; then
    echo "check-spec-parity: head commit '$HEAD' is not resolvable in this checkout" >&2
    exit 2
  fi
  changed="$(git diff --name-only "$BASE" "$HEAD" -- '*/spec.html')"
  if [ $? -ne 0 ]; then
    echo "check-spec-parity: git diff $BASE..$HEAD failed" >&2
    exit 2
  fi
  if [ -n "$changed" ]; then
    while IFS= read -r line; do [ -n "$line" ] && FILES+=("$line"); done <<EOF
$changed
EOF
  fi
  MODE="files"
  if [ ${#FILES[@]} -eq 0 ]; then
    echo "check-spec-parity: no spec.html changed between $BASE and $HEAD — nothing in scope."
    exit 0
  fi
fi

CSP_MODE="$MODE" CSP_STRICT_VOCAB="$STRICT_VOCAB" CSP_BASE="$BASE" \
python3 - ${FILES+"${FILES[@]}"} <<'PY'
import glob
import html
import json
import os
import re
import subprocess
import sys
import tempfile

MODE = os.environ.get("CSP_MODE", "")
STRICT_VOCAB = os.environ.get("CSP_STRICT_VOCAB", "0") == "1"
BASE = os.environ.get("CSP_BASE", "")

# §4.2 — the documented vocabulary, named once. Sourced from CLAUDE.md > Spec Artifact Convention.
VOCABULARY = ("pending execution", "in progress", "needs revision", "blocked", "completed")
DONE_STATUS = "completed"

EXIT_OK, EXIT_FINDING, EXIT_ERROR, EXIT_UNPARSEABLE = 0, 1, 2, 3


class CheckError(Exception):
    """Infrastructure failure. Raised, never swallowed — §3.2."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message

STATUS_PILL_OPEN = re.compile(
    r'<span\b[^>]*\bclass\s*=\s*["\'][^"\']*\bstatus-pill\b[^"\']*["\'][^>]*>', re.I)
ANY_PILL_OPEN = re.compile(
    r'<span\b[^>]*\bclass\s*=\s*["\'][^"\']*\bpill\b[^"\']*["\'][^>]*>', re.I)
CARD_OPEN = re.compile(
    r'<[a-z]+\b[^>]*\bclass\s*=\s*["\'][^"\']*\bstatus-card\b[^"\']*["\'][^>]*>', re.I)
DD = re.compile(r'<dd\b[^>]*>(.*?)</dd\s*>', re.I | re.S)
SPAN_OPEN = re.compile(r'<span\b', re.I)
SPAN_CLOSE = re.compile(r'</span\s*>', re.I)
# Split the status head-token off any trailing commentary. A bare "-" only separates when
# spaced, so a hyphenated word is never truncated.
SEPARATOR = re.compile(r'\s*(?:·|—|–|\||\(|,|\+|(?<=\s)-(?=\s))\s*')
LABEL = re.compile(r'^status\s*:\s*', re.I)


def span_inner(text, open_start):
    """Inner text of the <span> whose '<' sits at open_start, nesting-aware.

    Template B nests <span class="dot"></span> inside the pill; a non-greedy
    (.*?)</span> would stop at the inner close and capture nothing.
    """
    gt = text.find(">", open_start)
    if gt < 0:
        return None
    depth, pos, start = 1, gt + 1, gt + 1
    while True:
        close = SPAN_CLOSE.search(text, pos)
        if not close:
            return None
        nxt = SPAN_OPEN.search(text, pos)
        if nxt and nxt.start() < close.start():
            depth += 1
            pos = nxt.end()
            continue
        depth -= 1
        if depth == 0:
            return text[start:close.start()]
        pos = close.end()


def normalize(raw):
    """Tags stripped, entities resolved, whitespace collapsed, head-token, lowercased.

    This is what makes "Deployed to Dev" and "Completed &middot; 17/17 audited" visible:
    the status no longer has to be the entire pill content.
    """
    if raw is None:
        return None
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    text = LABEL.sub("", text)
    head = SEPARATOR.split(text)[0]
    return re.sub(r"\s+", " ", head).strip().lower()


def extract(text):
    """-> (pill, card, template). Values are normalized head-tokens or None."""
    template = None
    match = STATUS_PILL_OPEN.search(text)
    if match:
        template = "A"
    else:
        match = ANY_PILL_OPEN.search(text)
        if match:
            template = "B"
    pill = normalize(span_inner(text, match.start())) if match else None

    card = None
    card_match = CARD_OPEN.search(text)
    if card_match:
        dd = DD.search(text, card_match.end())
        if dd:
            card = normalize(dd.group(1))
    return pill, card, template


def acceptance_verdict(plan_dir):
    """The §20.5 rollup, recomputed from items rather than trusting the top-level field."""
    path = os.path.join(plan_dir, "test-results.json")
    if not os.path.exists(path):
        return False, "no test-results.json beside the spec"
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception as exc:  # unreadable/invalid -> fail closed, never "assume passed"
        return False, "test-results.json is unreadable (%s)" % exc
    items = data.get("items") or []
    if not items:
        return False, "test-results.json lists no items"
    for item in items:
        status = str(item.get("status", "")).lower()
        if status == "pass":
            continue
        if status == "fail" and str(item.get("waiver", "")).strip():
            continue
        return False, "item %s is '%s' with no waiver" % (item.get("id", "?"), status or "pending")
    return True, "rolls up Passed"


def base_status(path):
    """The spec's status at BASE, or None when the file is new/unreadable there."""
    if not BASE:
        return None
    try:
        blob = subprocess.run(
            ["git", "show", "%s:%s" % (BASE, path)],
            capture_output=True, check=False)
    except Exception:
        return None
    if blob.returncode != 0:
        return None
    text = blob.stdout.decode("utf-8", "replace")
    pill, card, _ = extract(text)
    return pill or card


def check(path, assume_newly_done=False, strict_vocab=None):
    """-> (findings, warnings, unparseable) for one spec file.

    assume_newly_done arms the §20.5 rule without consulting git — the fixture suite has no
    repository behind it, and a brand-new spec has no base version either.
    """
    if strict_vocab is None:
        strict_vocab = STRICT_VOCAB
    findings, warnings = [], []
    try:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    except OSError as exc:
        raise CheckError(EXIT_ERROR, "cannot read %s (%s)" % (path, exc))

    pill, card, template = extract(text)
    present = [v for v in (pill, card) if v]

    if not present:
        return [], [], (
            "%s\n"
            "     no status found. Searched: <span class=\"status-pill\">, <span class=\"pill\">, "
            "and the status-card <dd>.\n"
            "     Give the hero a status pill from the documented vocabulary." % path)

    # 1. PARITY. A spec with only one surface cannot disagree with itself.
    if pill and card and pill != card:
        findings.append(
            "%s\n     hero pill says '%s' but the status card says '%s' — AGENTS.md requires "
            "both to be updated together." % (path, pill, card))

    # 2. VOCABULARY.
    for surface, value in (("pill", pill), ("status card", card)):
        if value and value not in VOCABULARY:
            message = ("%s\n     %s status '%s' is not in the documented vocabulary (%s)."
                       % (path, surface, value, ", ".join(VOCABULARY)))
            (findings if strict_vocab else warnings).append(message)

    # 3. §20.5 — only when THIS change moves the spec to Completed. A PR that merely brushes a
    #    folder whose spec was already Completed asserts nothing new and must not be gated.
    effective = pill or card
    if effective == DONE_STATUS:
        newly_done = assume_newly_done or (bool(BASE) and base_status(path) != DONE_STATUS)
        if newly_done:
            passed, why = acceptance_verdict(os.path.dirname(path))
            if not passed:
                findings.append(
                    "%s\n     status is 'Completed' but the acceptance artifact does not roll up "
                    "Passed: %s (§20.5)." % (path, why))
    return findings, warnings, None


# --------------------------------------------------------------------------- fixtures

def spec_html(pill=None, card=None, pill_class="status-pill status-pending",
              quote='"', body="", pill_extra="", wrapped=False):
    parts = ["<!doctype html><html><head><style>", ".status-pill { color: #fff; }",
             "</style></head><body><main class=\"spec-shell\"><header class=\"spec-hero\">"]
    if pill is not None:
        if wrapped:
            parts.append("<span\n  class=%s%s%s\n>%s\n  %s\n</span>"
                         % (quote, pill_class, quote, pill_extra, pill))
        else:
            parts.append("<span class=%s%s%s>%s%s</span>"
                         % (quote, pill_class, quote, pill_extra, pill))
    parts.append("<h1>Fixture</h1><dl class=\"meta-grid\">")
    if card is not None:
        parts.append("<div class=\"status-card\"><dt>Status</dt><dd>%s</dd></div>" % card)
    parts.append("<div><dt>Size</dt><dd>Small</dd></div></dl></header>")
    parts.append(body)
    parts.append("</main></body></html>")
    return "".join(parts)


PASSING_ACCEPTANCE = {"status": "Passed", "items": [{"id": "T1", "status": "pass"}]}

# (name, spec html, test-results.json or None, expected exit, strict_vocab)
FIXTURES = [
    # --- parity findings: the two surfaces disagree --------------------------
    ("pill-completed-card-pending",
     spec_html(pill="Completed", card="Pending Execution"), None, EXIT_FINDING, False),
    ("card-only-completed",
     spec_html(pill="In Progress", card="Completed"), None, EXIT_FINDING, False),

    # --- §20.5: a Completed spec must ship a passing acceptance artifact -----
    ("completed-without-acceptance-artifact",
     spec_html(pill="Completed", card="Completed"), None, EXIT_FINDING, False),
    ("acceptance-pending-item-blocks",
     spec_html(pill="Completed", card="Completed"),
     {"status": "Passed", "items": [{"id": "T1", "status": "pending"}]}, EXIT_FINDING, False),
    ("acceptance-top-level-lies-items-do-not",
     spec_html(pill="Completed", card="Completed"),
     {"status": "Passed", "items": [{"id": "T1", "status": "fail"}]}, EXIT_FINDING, False),
    ("waived-failure-still-passes",
     spec_html(pill="Completed", card="Completed"),
     {"items": [{"id": "T1", "status": "pass"},
                {"id": "T2", "status": "fail", "waiver": "owner accepted, deploy pending"}]},
     EXIT_OK, False),

    # --- statuses the old line-regex could not see (trailing text) -----------
    # Both surfaces agree on the head-token, so parity is clean; the status is merely
    # off-vocabulary. Advisory by default, a finding under --strict-vocab. Under the old
    # regex neither was visible at all.
    ("trailing-text-deployed-to-dev-advisory",
     spec_html(pill="Deployed to Dev", card="Deployed to dev + tested"), None, EXIT_OK, False),
    ("trailing-text-deployed-to-dev-strict",
     spec_html(pill="Deployed to Dev", card="Deployed to dev + tested"), None,
     EXIT_FINDING, True),
    ("trailing-text-completed-17-of-17",
     spec_html(pill="Completed &middot; 17/17 audited", card="In Progress"),
     None, EXIT_FINDING, False),

    # --- latent evasions, covered by construction ----------------------------
    ("single-quoted-class",
     spec_html(pill="Completed", card="Blocked", quote="'"), None, EXIT_FINDING, False),
    ("class-reordered",
     spec_html(pill="Completed", card="Blocked", pill_class="pill status-pill dark"),
     None, EXIT_FINDING, False),
    ("pill-wrapped-across-lines",
     spec_html(pill="Completed", card="Blocked", wrapped=True), None, EXIT_FINDING, False),
    ("nested-dot-span-template-b",
     spec_html(pill="Completed &middot; Rev 4", pill_class="pill complete",
               pill_extra="<span class=\"dot\"></span>"),
     PASSING_ACCEPTANCE, EXIT_OK, False),
    ("template-b-meta-pills-not-mistaken-for-status",
     spec_html(pill="In Progress &middot; Rev 11", pill_class="pill status",
               pill_extra="<span class=\"dot\"></span>",
               body="<span class=\"pill meta\">Branch: claude/x &rarr; dev/dave</span>"),
     None, EXIT_OK, False),
    ("diff-header-collision",
     spec_html(pill="Completed", card="Blocked",
               body="<pre><code>++ b/plans/x/spec.html\n+++ b/y</code></pre>"),
     None, EXIT_FINDING, False),

    # --- must NOT fire: the false-positive class of the old line regex --------
    ("reindent-only-completed-pill",
     spec_html(pill="Completed", card="Completed", wrapped=True),
     PASSING_ACCEPTANCE, EXIT_OK, False),
    ("class-swap-pending-to-completed-text-unchanged",
     spec_html(pill="Completed", card="Completed", pill_class="status-pill status-completed"),
     PASSING_ACCEPTANCE, EXIT_OK, False),
    ("pill-only-no-status-card",
     spec_html(pill="In Progress"), None, EXIT_OK, False),
    ("card-separator-suffix-agrees",
     spec_html(pill="Completed", card="Completed &mdash; owner-verified 2026-07-01"),
     PASSING_ACCEPTANCE, EXIT_OK, False),
    ("status-label-prefix-stripped",
     spec_html(pill="Status: Blocked &mdash; build withdrawn", pill_class="pill dark"),
     None, EXIT_OK, False),

    # --- fail closed ---------------------------------------------------------
    ("no-status-surface-at-all",
     spec_html(), None, EXIT_UNPARSEABLE, False),
    ("empty-pill-text",
     spec_html(pill=""), None, EXIT_UNPARSEABLE, False),
]


def run_self_test():
    passed = failed = 0
    root = tempfile.mkdtemp(prefix="spec-parity-fixtures-")
    for name, spec, results, expected, strict in FIXTURES:
        plan = os.path.join(root, name)
        os.makedirs(plan, exist_ok=True)
        spec_path = os.path.join(plan, "spec.html")
        with open(spec_path, "w", encoding="utf-8") as handle:
            handle.write(spec)
        if results is not None:
            with open(os.path.join(plan, "test-results.json"), "w", encoding="utf-8") as handle:
                json.dump(results, handle)
        # A fixture has no base version, which is the same shape as a brand-new spec: this
        # change introduces the status, so the §20.5 rule is armed.
        code = evaluate([spec_path], assume_newly_done=True, strict_vocab=strict, quiet=True)
        if code == expected:
            passed += 1
            print("  PASS  %-48s exit %d" % (name, code))
        else:
            failed += 1
            print("  FAIL  %-48s expected exit %d, got %d" % (name, expected, code))
    print("")
    print("check-spec-parity self-test: %d passed, %d failed, %d cases"
          % (passed, failed, len(FIXTURES)))
    return EXIT_OK if failed == 0 else EXIT_FINDING


# --------------------------------------------------------------------------- driver

def evaluate(paths, assume_newly_done=False, strict_vocab=None, quiet=False):
    findings, warnings, unparseable = [], [], []
    try:
        for path in paths:
            got = check(path, assume_newly_done=assume_newly_done, strict_vocab=strict_vocab)
            findings.extend(got[0])
            warnings.extend(got[1])
            if got[2]:
                unparseable.append(got[2])
    except CheckError as exc:
        print("check-spec-parity: %s" % exc.message, file=sys.stderr)
        return EXIT_ERROR

    if not quiet:
        for warning in warnings:
            print("  WARN  %s" % warning)
        for item in unparseable:
            print("  FAIL-CLOSED  %s" % item, file=sys.stderr)
        for finding in findings:
            print("  FINDING  %s" % finding, file=sys.stderr)

    if unparseable:
        return EXIT_UNPARSEABLE
    if findings:
        return EXIT_FINDING
    return EXIT_OK


def main():
    paths = sys.argv[1:]

    if MODE == "self-test":
        return run_self_test()

    if MODE == "corpus":
        paths = sorted(glob.glob("plans/*/spec.html"))
        if not paths:
            print("check-spec-parity: no plans/*/spec.html found — refusing to report clean",
                  file=sys.stderr)
            return EXIT_ERROR

    if not paths:
        print("check-spec-parity: no spec.html in scope — nothing to assert.")
        return EXIT_OK

    missing = [p for p in paths if not os.path.exists(p)]
    # A spec deleted by the PR is legitimately absent from the head checkout.
    paths = [p for p in paths if os.path.exists(p)]
    for path in missing:
        print("  note: %s is not present in this checkout (deleted?) — skipped." % path)
    if not paths:
        print("check-spec-parity: every spec.html in scope was deleted — nothing to assert.")
        return EXIT_OK

    code = evaluate(paths)

    if code == EXIT_OK:
        print("check-spec-parity: %d spec.html checked, all self-consistent." % len(paths))
    elif code == EXIT_UNPARSEABLE:
        print("check-spec-parity: FAIL CLOSED — a spec in scope has no extractable status.",
              file=sys.stderr)
    elif code == EXIT_FINDING:
        print("check-spec-parity: FAIL — spec status is not self-consistent.", file=sys.stderr)
    return code


sys.exit(main())
PY
rc=$?
exit $rc
