#!/usr/bin/env python3
"""
Download Bible translations from BibleGateway and convert to scrollmapper JSON format.
Uses the `meaningless` library.

Usage:
  source .venv/bin/activate
  python3 data/download-biblegateway.py

Output: data/sources/<ABBREV>.json for each translation
"""

import json
import os
import sys
from pathlib import Path

from meaningless import JSONDownloader
import meaningless.utilities.common as common

# Override to handle chapters with many verses
def custom_get_capped_integer(number, min_value=1, max_value=200):
    return min(max(int(number), int(min_value)), int(max_value))
common.get_capped_integer = custom_get_capped_integer

TRANSLATIONS = ["NIV", "ESV", "NASB", "NKJV", "NLT", "AMP"]

BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Proverbs",
    "Ecclesiastes", "Song Of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
    "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
    "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
    "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
    "Jude", "Revelation"
]

# Map BibleGateway book names to scrollmapper format
BOOK_NAME_MAP = {
    "Psalm": "Psalms",
    "Song Of Solomon": "Song of Solomon",
}

ROOT = Path(__file__).resolve().parent
SOURCES_DIR = ROOT / "sources"
TEMP_DIR = ROOT / "bg_temp"


def download_translation(abbrev):
    """Download all books for a translation and convert to scrollmapper JSON."""
    print(f"\nDownloading {abbrev}...")

    output_file = SOURCES_DIR / f"{abbrev}.json"
    if output_file.exists():
        print(f"  {abbrev}.json already exists, skipping")
        return True

    temp_path = TEMP_DIR / abbrev
    temp_path.mkdir(parents=True, exist_ok=True)

    downloader = JSONDownloader(
        translation=abbrev,
        show_passage_numbers=False,
        strip_excess_whitespace=True
    )

    # Download each book
    combined = {}
    total = len(BOOKS)
    for i, book in enumerate(BOOKS):
        print(f"\r  [{i+1:2d}/{total}] {book:<20s}", end="", flush=True)
        book_file = temp_path / f"{book}.json"

        try:
            downloader.download_book(book, str(book_file))
            with open(book_file, encoding='utf-8') as f:
                data = json.load(f)
                if "Info" in data:
                    del data["Info"]
                combined.update(data)
        except Exception as e:
            print(f"\n  Failed to download {book}: {e}")
            continue

    print(f"\r  Downloaded {len(combined)} books" + " " * 30)

    # Convert to scrollmapper format
    scrollmapper = {
        "translation": f"{abbrev}",
        "books": []
    }

    for book_name in BOOKS:
        # BibleGateway might use slightly different names
        bg_name = book_name
        display_name = BOOK_NAME_MAP.get(book_name, book_name)

        if bg_name not in combined:
            # Try alternate names
            if book_name in BOOK_NAME_MAP:
                bg_name = BOOK_NAME_MAP[book_name]
            if bg_name not in combined:
                print(f"  Book '{book_name}' not found in download")
                continue

        chapters_data = combined[bg_name]
        chapters = []

        for ch_num_str in sorted(chapters_data.keys(), key=int):
            verses_data = chapters_data[ch_num_str]
            verses = []
            for v_num_str in sorted(verses_data.keys(), key=int):
                text = verses_data[v_num_str].strip()
                # Clean up extra whitespace
                text = " ".join(text.split())
                verses.append({"verse": int(v_num_str), "text": text})
            chapters.append({"chapter": int(ch_num_str), "verses": verses})

        scrollmapper["books"].append({
            "name": display_name,
            "chapters": chapters
        })

    # Write output
    with open(output_file, "w", encoding='utf-8') as f:
        json.dump(scrollmapper, f, indent=2)

    size_mb = output_file.stat().st_size / 1024 / 1024
    verse_count = sum(
        len(ch["verses"])
        for book in scrollmapper["books"]
        for ch in book["chapters"]
    )
    print(f"  Saved {output_file.name} ({size_mb:.1f} MB, {verse_count} verses)")
    return True


def main():
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    print(f"=== Downloading {len(TRANSLATIONS)} translations from BibleGateway ===")
    print(f"Translations: {', '.join(TRANSLATIONS)}")

    for abbrev in TRANSLATIONS:
        try:
            download_translation(abbrev)
        except Exception as e:
            print(f"\n  {abbrev} failed: {e}")

    print(f"\nDone! Check {SOURCES_DIR} for output files.\n")


if __name__ == "__main__":
    main()
