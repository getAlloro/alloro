# Edge-block artifacts — point-in-time copies

These are version-controlled copies of the live files on **alloro-renderer**:
- `refresh-cidrs.sh`, `analyze-dryrun.py`, `analyze-dryrun.sh` → live at `/opt/alloro/edge-block/`
- `Caddyfile.current` → live at `/etc/caddy/Caddyfile`

The **box is the runtime**; these are for reference / version control. The renderer deploy
(`Hamiltonwise/website-renderer` → `/home/ubuntu/website-renderer`) does NOT touch `/etc/caddy`
or `/opt/alloro`, so the live copies are deploy-safe. See ../RUNBOOK.md (esp. §8 enforce, §11 gotchas).
