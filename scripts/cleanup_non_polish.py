#!/usr/bin/env python3
"""
One-time cleanup: reject auto_detected athletes who are NOT Polish.

Criteria for rejection (both must hold):
  - person is not a Polish citizen / does not represent Poland
  - OR is a global superstar (regardless of nationality — not a "gap" for Red Bull)

Sets discovery_status='rejected' (never deletes — preserves dedup trail).
Runs once; safe to re-run (idempotent — already-rejected rows are skipped).

Usage:
  source .env.local && python3 scripts/cleanup_non_polish.py
  # or: python3 -c "import dotenv; dotenv.load_dotenv('.env.local')" ...
"""

import json
import os
import sys
import time
from supabase import create_client, Client
import anthropic

HAIKU_MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 8  # athletes per single LLM call


def load_env_local() -> None:
    """Load .env.local into os.environ if running outside GitHub Actions."""
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if not os.path.exists(env_file):
        return
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if k not in os.environ:
                    os.environ[k] = v


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def get_claude() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def classify_batch(claude: anthropic.Anthropic, athletes: list[dict]) -> list[dict]:
    """
    Ask Haiku to classify a batch of athletes.
    Returns list of dicts with: id, name, is_polish, is_global_superstar, reasoning, action
    """
    athletes_list = "\n".join(
        f"{i+1}. {a['name']} (discipline: {a.get('discipline', 'unknown')})"
        for i, a in enumerate(athletes)
    )

    prompt = f"""You are a sports data quality auditor for a Polish talent scouting system.
For each athlete below, determine:
1. is_polish: true if they hold Polish citizenship OR officially represent Poland in their sport. false if they are clearly from another country. null only if genuinely ambiguous.
2. is_global_superstar: true if this person is recognized globally beyond their sport's fan base (e.g. LeBron James, Serena Williams, Erling Haaland, Robert Lewandowski, Iga Swiatek). The key question: would a random non-sports-fan on the street likely recognize this name? true = not a "gap" talent for Red Bull Poland.
3. reasoning: one sentence explaining your decision.
4. action: "keep" if is_polish=true AND is_global_superstar=false. "reject" otherwise.

Athletes:
{athletes_list}

Return valid JSON array only (no markdown, no code block):
[
  {{"id_index": 1, "name": "...", "is_polish": true/false/null, "is_global_superstar": true/false, "reasoning": "...", "action": "keep"/"reject"}},
  ...
]"""

    response = claude.messages.create(
        model=HAIKU_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    results = json.loads(raw.strip())
    # Map id_index back to real athlete IDs
    for r in results:
        idx = r["id_index"] - 1
        if 0 <= idx < len(athletes):
            r["db_id"] = athletes[idx]["id"]
    return results


def main() -> None:
    load_env_local()
    sb = get_supabase()
    claude = get_claude()

    # Fetch all auto_detected athletes (skip already rejected)
    res = (
        sb.table("athletes")
        .select("id,name,discipline,discovery_status")
        .eq("discovery_status", "auto_detected")
        .execute()
    )
    athletes = res.data or []
    print(f"Found {len(athletes)} auto_detected athletes to review\n")

    if not athletes:
        print("Nothing to clean up.")
        return

    all_results: list[dict] = []
    kept: list[dict] = []
    rejected: list[dict] = []
    errors: list[str] = []

    # Process in batches
    for batch_start in range(0, len(athletes), BATCH_SIZE):
        batch = athletes[batch_start : batch_start + BATCH_SIZE]
        names = [a["name"] for a in batch]
        print(f"Batch {batch_start // BATCH_SIZE + 1}: {', '.join(names)}")

        try:
            results = classify_batch(claude, batch)
            all_results.extend(results)

            for r in results:
                if r.get("action") == "reject":
                    rejected.append(r)
                    # Update DB
                    sb.table("athletes").update(
                        {"discovery_status": "rejected"}
                    ).eq("id", r["db_id"]).execute()
                    print(f"  ODRZUCONY: {r['name']} — {r['reasoning']}")
                else:
                    kept.append(r)
                    print(f"  ZACHOWANY:  {r['name']} — {r['reasoning']}")

        except json.JSONDecodeError as e:
            msg = f"JSON parse error in batch starting at {batch_start}: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)
        except Exception as e:
            msg = f"Error in batch starting at {batch_start}: {e}"
            print(f"  [ERR] {msg}")
            errors.append(msg)

        time.sleep(0.5)  # rate-limit guard

    # -----------------------------------------------------------------------
    # Final report
    # -----------------------------------------------------------------------
    print("\n" + "=" * 70)
    print(f"PODSUMOWANIE: {len(rejected)} odrzuconych, {len(kept)} zachowanych")
    print("=" * 70)

    print(f"\n--- ODRZUCENI ({len(rejected)}) ---")
    for r in rejected:
        polish_flag = r.get("is_polish")
        superstar_flag = r.get("is_global_superstar")
        reason_tags = []
        if polish_flag is False:
            reason_tags.append("nie-Polak")
        if superstar_flag is True:
            reason_tags.append("global superstar")
        tags = " + ".join(reason_tags) if reason_tags else "patrz reasoning"
        print(f"  • {r['name']:30s} [{tags}]")
        print(f"    {r['reasoning']}")

    print(f"\n--- ZACHOWANI ({len(kept)}) ---")
    for r in kept:
        print(f"  • {r['name']:30s} — {r['reasoning']}")

    if errors:
        print(f"\n--- BŁĘDY ({len(errors)}) ---")
        for e in errors:
            print(f"  ! {e}")
        sys.exit(1)

    print("\nCleanup zakończony.")


if __name__ == "__main__":
    main()
