#!/usr/bin/env python3
"""
update_publications.py
======================
Refresh ``data/publications.json`` from a Google Scholar profile.

Google Scholar does not tell us which *section* a paper belongs to
(journal article, book chapter, international/national conference), so this
script is a **merge**, not a blind overwrite:

* Existing entries are matched to Scholar records by a normalized title.
  Their ``section`` and any manual edits you made are preserved.
* New Scholar records are added with a best-guess ``section`` and marked
  ``"source": "auto"`` so you can review and correct them.
* Entries you curated by hand (``"source": "manual"``) are never
  reclassified automatically.

Run it, then open the JSON, fix the section of anything marked ``auto``,
change its ``source`` to ``manual`` to lock it in, and commit.

Usage
-----
    pip install -r scripts/requirements.txt
    python scripts/update_publications.py --user 6WnxDuUAAAAJ
    python scripts/update_publications.py --dry-run     # preview only

Notes
-----
Scholar has no official API and may rate-limit or block automated access.
If a fetch fails, the existing JSON is left untouched. The GitHub Action in
``.github/workflows/update-publications.yml`` runs this on a schedule and
commits any changes for you to review via pull request / diff.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "publications.json"
DEFAULT_USER = "6WnxDuUAAAAJ"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def norm_title(title: str) -> str:
    """Lowercased, accent- and punctuation-stripped title for matching."""
    t = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9\s]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def slug(title: str, year) -> str:
    t = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9\s-]", "", t).lower().strip()
    return re.sub(r"[\s-]+", "-", t)[:60] + f"-{year}"


# Keyword heuristics for guessing the section of a NEW Scholar record.
_NATIONAL = re.compile(r"mexican conference|cnib|congreso nacional", re.I)
_CONFERENCE = re.compile(
    r"conference|symposium|workshop|proceedings|isbi|embc|sipaim|miccai|dsd|claib",
    re.I,
)
_BOOK = re.compile(r"\bpress\b|\bpublishing\b|chapter|\bin\s+[A-Z]", re.I)
_JOURNAL = re.compile(
    r"journal|transactions|letters|\bnpj\b|signal processing|applied sciences|"
    r"medical image analysis|healthcare technology",
    re.I,
)


def guess_section(venue: str) -> str:
    v = venue or ""
    if _NATIONAL.search(v):
        return "national"
    if _CONFERENCE.search(v):
        return "international"
    if _JOURNAL.search(v):
        return "journal"
    if _BOOK.search(v):
        return "book"
    return "journal"  # safest default; flagged as auto for review


def scholar_records(user_id: str, limit: int | None):
    """Yield simplified publication dicts from a Scholar profile."""
    try:
        from scholarly import scholarly
    except ImportError:
        sys.exit(
            "The 'scholarly' package is required.\n"
            "Install it with:  pip install -r scripts/requirements.txt"
        )

    author = scholarly.search_author_id(user_id)
    author = scholarly.fill(author, sections=["publications"])
    pubs = author.get("publications", [])
    if limit:
        pubs = pubs[:limit]

    for i, pub in enumerate(pubs, 1):
        try:
            filled = scholarly.fill(pub)
        except Exception:
            filled = pub
        bib = filled.get("bib", {})
        title = bib.get("title", "").strip()
        if not title:
            continue
        year = bib.get("pub_year") or bib.get("year") or ""
        venue = (
            bib.get("journal")
            or bib.get("venue")
            or bib.get("booktitle")
            or bib.get("conference")
            or bib.get("publisher")
            or ""
        ).strip()
        authors = bib.get("author", "")
        if isinstance(authors, list):
            authors = ", ".join(authors)
        # scholarly returns "A and B and C" -> make it "A, B, C"
        authors = re.sub(r"\s+and\s+", ", ", authors).strip()
        url = filled.get("pub_url") or filled.get("eprint_url") or ""
        yield {
            "title": title,
            "year": int(year) if str(year).isdigit() else year,
            "venue": venue,
            "authors": authors,
            "url": url,
        }
        print(f"  [{i}] {title[:70]}")


# ---------------------------------------------------------------------------
# main merge
# ---------------------------------------------------------------------------

def load_existing() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {"owner_name": "", "last_updated": "", "publications": []}


def merge(existing: dict, records: list[dict]) -> tuple[dict, int, int]:
    by_title = {norm_title(p["title"]): p for p in existing.get("publications", [])}
    added, updated = 0, 0

    for rec in records:
        key = norm_title(rec["title"])
        if key in by_title:
            entry = by_title[key]
            # refresh only fields that are safe to auto-update; never touch
            # a manually-curated section or manually-set fields.
            if not entry.get("url") and rec.get("url"):
                entry["url"] = rec["url"]
                updated += 1
            if entry.get("source") == "auto":
                # keep auto entries in sync with Scholar until you lock them
                for f in ("authors", "venue", "year"):
                    if rec.get(f):
                        entry[f] = rec[f]
        else:
            entry = {
                "section": guess_section(rec["venue"]),
                "year": rec["year"],
                "title": rec["title"],
                "authors": rec["authors"],
                "venue": rec["venue"],
                "details": "",
                "url": rec.get("url", ""),
                "source": "auto",  # <-- review me
                "id": slug(rec["title"], rec["year"]),
            }
            existing.setdefault("publications", []).append(entry)
            by_title[key] = entry
            added += 1

    existing["last_updated"] = dt.date.today().isoformat()
    return existing, added, updated


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user", default=DEFAULT_USER, help="Google Scholar user id")
    ap.add_argument("--limit", type=int, default=None, help="max publications to fetch (debug)")
    ap.add_argument("--dry-run", action="store_true", help="print changes without writing")
    args = ap.parse_args()

    print(f"Fetching Scholar profile: {args.user}")
    try:
        records = list(scholar_records(args.user, args.limit))
    except SystemExit:
        raise
    except Exception as e:  # network / rate limit / parse
        print(f"\nCould not fetch from Scholar ({e}). Existing JSON left unchanged.")
        sys.exit(1)

    if not records:
        print("No records returned; leaving JSON unchanged.")
        sys.exit(1)

    existing = load_existing()
    merged, added, updated = merge(existing, records)

    print(f"\nFetched {len(records)} records | added {added} new | updated {updated} fields")
    auto = [p for p in merged["publications"] if p.get("source") == "auto"]
    if auto:
        print(f"\n{len(auto)} entr{'y' if len(auto)==1 else 'ies'} need review (source=\"auto\"):")
        for p in auto:
            print(f'  - [{p["section"]}] {p["title"][:65]}')
        print('Fix the "section" if wrong, then set "source":"manual" to lock it.')

    if args.dry_run:
        print("\n--dry-run: no file written.")
        return

    DATA_FILE.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nWrote {DATA_FILE.relative_to(DATA_FILE.parent.parent)}")


if __name__ == "__main__":
    main()
