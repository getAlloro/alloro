#!/usr/bin/env python3
"""
Alloro State of Now session-start substrate loader.

Fired by Claude Code's SessionStart hook (matcher: startup). Fetches the
canonical State of Now Notion page, injects its contents as additionalContext
(via stdout), caches a last-good copy locally for offline fallback, and
surfaces a doctrine diff against the previous cache to the terminal (stderr).

stdout -> Claude's additionalContext (becomes part of the system prompt)
stderr -> visible to the operator in the session-start banner

Why this hook exists:
  - The CLAUDE.md Session Cycle Step 0 says fetch the State of Now first.
  - That rule was previously enforced by Claude (CC) remembering to invoke
    the Notion MCP on its own, which inherits Claude's reliability.
  - This hook makes the fetch deterministic: every session starts with the
    substrate in context, whether Claude remembers to fetch or not.
  - Per Corey 2026-05-23: explicit terminal-visible logs so the hook does
    not become invisible infrastructure that drifts silently.

Failure handling:
  - No NOTION_TOKEN in env: log fatal, inject a tiny "substrate unreachable"
    context block, exit 0 (do not block the session).
  - Network or HTTP failure: fall back to .claude/cache/state-of-now-last-good.json
    with an explicit STALE FALLBACK header in the context.
  - Both fresh fetch fail AND no cache: minimal context block + exit 0.

Anti-pattern guard:
  - The hook never silently caches a malformed payload; it only writes the
    cache after a successful fresh fetch.
  - The doctrine diff runs only when a fresh fetch succeeds against a prior
    cache; if the cache is what we are running on, there is no diff baseline.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

PAGE_ID = "369fdaf1-20c4-81c6-98bf-df4c0b32c556"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
CACHE_DIR = PROJECT_DIR / ".claude" / "cache"
CACHE_FILE = CACHE_DIR / "state-of-now-last-good.json"

LOG_PREFIX = "[SubstrateHook]"


def log(message):
    """Write a timestamped status line to stderr (terminal-visible)."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sys.stderr.write("{} {} {}\n".format(LOG_PREFIX, ts, message))
    sys.stderr.flush()


def fetch_notion_page(token):
    """Fetch State of Now block children. Returns parsed JSON or None on failure."""
    url = "{}/blocks/{}/children?page_size=100".format(NOTION_API, PAGE_ID)
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer {}".format(token),
            "Notion-Version": NOTION_VERSION,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log("fetch_failed status={} reason={}".format(e.code, e.reason))
        return None
    except urllib.error.URLError as e:
        log("fetch_failed network_error={}".format(e.reason))
        return None
    except Exception as e:
        log("fetch_failed unexpected={}:{}".format(type(e).__name__, e))
        return None


def extract_doctrine_entries(page_data):
    """Find Section 4 (Doctrine refs) and return a list of entry texts."""
    blocks = page_data.get("results", []) if isinstance(page_data, dict) else []
    in_section_4 = False
    entries = []
    for block in blocks:
        btype = block.get("type")
        if btype == "heading_2":
            heading_text = "".join(
                rt.get("plain_text", "")
                for rt in block.get(btype, {}).get("rich_text", [])
            )
            if "Doctrine refs" in heading_text or heading_text.startswith("4."):
                in_section_4 = True
                continue
            # any other heading_2 closes Section 4
            if in_section_4:
                in_section_4 = False
                continue
        if btype == "divider" and in_section_4:
            in_section_4 = False
            continue
        if in_section_4 and btype == "bulleted_list_item":
            text = "".join(
                rt.get("plain_text", "")
                for rt in block.get(btype, {}).get("rich_text", [])
            )
            if text:
                entries.append(text)
    return entries


def page_summary(page_data):
    """Render the full page content as a markdown-ish text block for context."""
    blocks = page_data.get("results", []) if isinstance(page_data, dict) else []
    lines = ["# Alloro State of Now (auto-fetched at session start)", ""]
    for block in blocks:
        btype = block.get("type")
        content = block.get(btype, {})
        rich_text = (
            content.get("rich_text", []) if isinstance(content, dict) else []
        )
        text = "".join(rt.get("plain_text", "") for rt in rich_text)
        if btype == "heading_1":
            lines.append("# {}".format(text))
        elif btype == "heading_2":
            lines.append("## {}".format(text))
        elif btype == "heading_3":
            lines.append("### {}".format(text))
        elif btype == "bulleted_list_item":
            lines.append("- {}".format(text))
        elif btype == "numbered_list_item":
            lines.append("1. {}".format(text))
        elif btype == "paragraph":
            lines.append(text)
        elif btype == "divider":
            lines.append("---")
        elif btype == "callout":
            lines.append("> {}".format(text))
        elif btype == "quote":
            lines.append("> {}".format(text))
    return "\n".join(lines)


def main():
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        log("FATAL NOTION_TOKEN not set in environment; substrate fetch skipped.")
        log("Set NOTION_TOKEN in your shell profile to enable. Session continues without substrate.")
        print("# Alloro Substrate Unreachable")
        print("")
        print(
            "NOTION_TOKEN not set in environment; State of Now substrate did not load. "
            "Operate from in-context rules only this session."
        )
        return 0

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        log("cache_dir_create_failed error={}".format(e))

    log("fetch_start page_id={}".format(PAGE_ID))
    page_data = fetch_notion_page(token)
    used_cache = False
    cached_at = "unknown"

    if page_data is None:
        # Fall back to cache.
        if CACHE_FILE.exists():
            try:
                with CACHE_FILE.open() as f:
                    cached = json.load(f)
                page_data = cached.get("page_data")
                cached_at = cached.get("cached_at", "unknown")
                used_cache = True
                log("falling_back_to_cache cached_at={}".format(cached_at))
            except Exception as e:
                log("cache_read_failed error={}".format(e))
                page_data = None
        if page_data is None:
            log("FATAL fresh fetch failed AND no usable cache; injecting minimal context")
            print("# Alloro Substrate Unreachable")
            print("")
            print(
                "Notion fetch failed and no local cache exists. "
                "Operating without substrate. Investigate NOTION_TOKEN validity "
                "and Notion API status before relying on doctrine claims."
            )
            return 0

    # Doctrine diff: compare current fetch against the prior cache.
    doctrine_now = extract_doctrine_entries(page_data)
    doctrine_diff_for_claude = []
    if not used_cache and CACHE_FILE.exists():
        try:
            with CACHE_FILE.open() as f:
                cached_prev = json.load(f).get("page_data", {})
            doctrine_prev = extract_doctrine_entries(cached_prev)
            prev_set = set(doctrine_prev)
            now_set = set(doctrine_now)
            new_entries = [e for e in doctrine_now if e not in prev_set]
            removed_entries = [e for e in doctrine_prev if e not in now_set]
            if new_entries:
                log("doctrine_diff +{} new entries:".format(len(new_entries)))
                for e in new_entries:
                    snippet = e[:160].replace("\n", " ")
                    log("  NEW: {}".format(snippet))
                    doctrine_diff_for_claude.append(snippet)
            if removed_entries:
                log("doctrine_diff -{} removed entries:".format(len(removed_entries)))
                for e in removed_entries:
                    snippet = e[:160].replace("\n", " ")
                    log("  REMOVED: {}".format(snippet))
            if not new_entries and not removed_entries:
                log("doctrine_diff unchanged ({} entries)".format(len(doctrine_now)))
        except Exception as e:
            log("doctrine_diff_failed error={}".format(e))

    # Update cache only on fresh fetch success.
    if not used_cache:
        try:
            payload = {
                "cached_at": datetime.now(timezone.utc).isoformat(),
                "page_data": page_data,
            }
            CACHE_FILE.write_text(json.dumps(payload))
            try:
                rel = CACHE_FILE.relative_to(PROJECT_DIR)
            except ValueError:
                rel = CACHE_FILE
            log("cached_to {}".format(rel))
        except Exception as e:
            log("cache_write_failed error={}".format(e))

    summary = page_summary(page_data)

    if used_cache:
        prefix = (
            "# Alloro Substrate (STALE FALLBACK FROM CACHE, cached_at={})\n\n"
            "Notion fetch failed this session. Loading last-good cached copy. "
            "Treat live-state claims as advisory. Doctrine entries are still binding.\n\n"
        ).format(cached_at)
    else:
        prefix = ""

    diff_block = ""
    if doctrine_diff_for_claude:
        diff_lines = "\n".join("- {}".format(line) for line in doctrine_diff_for_claude)
        diff_block = (
            "# Doctrine changes since last session\n\n"
            "{}\n\n".format(diff_lines)
        )

    print(prefix + diff_block + summary)
    log(
        "injected_to_context bytes={} used_cache={} doctrine_entries={}".format(
            len(summary), used_cache, len(doctrine_now)
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
