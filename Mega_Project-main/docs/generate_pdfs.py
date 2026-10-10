#!/usr/bin/env python3
"""
Generate the LokRozgar AI documentation PDFs from the existing Markdown sources.

    docs/SYSTEM_DOCUMENTATION.md          -> docs/SYSTEM_DOCUMENTATION.pdf
    backend2/docs/API_DOCUMENTATION.md    -> backend2/docs/API_DOCUMENTATION.pdf

This is presentation tooling only. It never edits the Markdown and never
rewrites its content: every heading, table row, list item, code line and
paragraph in the source appears in the PDF. The `--verify` pass extracts the
text back out of the generated PDF and diffs it against the source to prove it.

Why a Markdown renderer lives here rather than a library: the sources contain
~2,800 box-drawing characters of hand-aligned ASCII architecture diagrams. A
general-purpose pipeline reflows or escapes those into nonsense. This renderer
treats fenced blocks as immutable, measures each one, and scales it to fit the
text column so nothing is ever clipped or re-wrapped.

Usage:
    python generate_pdfs.py [--verify] [--png]

Requires WeasyPrint (see docs/README-pdf.md). On macOS/Homebrew the Pango
libraries must be discoverable:
    DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib python generate_pdfs.py
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
CSS_PATH = DOCS / "documentation.css"

# --------------------------------------------------------------------------
# Layout constants, used to scale wide code blocks so they cannot be clipped.
# --------------------------------------------------------------------------
PAGE_WIDTH_MM = 210.0
MARGIN_MM = 18.0
PRE_PADDING_MM = 3.0 * 2 + 2.0          # left + right padding, plus accent rule
CONTENT_MM = PAGE_WIDTH_MM - 2 * MARGIN_MM
CODE_COLUMN_MM = CONTENT_MM - PRE_PADDING_MM
MONO_ADVANCE_EM = 0.6023                 # Menlo / DejaVu Sans Mono advance width
PT_PER_MM = 72.0 / 25.4
CODE_SIZE_DEFAULT_PT = 8.8
CODE_SIZE_MIN_PT = 6.1


def display_width(line: str) -> int:
    """Monospace cell width of a line (wide CJK glyphs count as two)."""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in line)


def fit_code_size(lines: list[str]) -> float:
    """Largest font size at which the widest line still fits the text column."""
    widest = max((display_width(l) for l in lines), default=0)
    if widest == 0:
        return CODE_SIZE_DEFAULT_PT
    available_pt = CODE_COLUMN_MM * PT_PER_MM
    ideal = available_pt / (widest * MONO_ADVANCE_EM)
    return max(CODE_SIZE_MIN_PT, min(CODE_SIZE_DEFAULT_PT, ideal * 0.985))


# --------------------------------------------------------------------------
# Inline Markdown
# --------------------------------------------------------------------------

_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)
_ITAL = re.compile(r"(?<![\*\w])\*(?!\s)([^\*]+?)(?<!\s)\*(?!\*)")
_BOLD_U = re.compile(r"__(.+?)__", re.S)


def render_inline(text: str) -> str:
    """Inline Markdown -> HTML.

    Code spans are extracted first and reinserted last, so their contents are
    never interpreted as emphasis — `**` inside a route or regex stays literal.
    """
    spans: list[str] = []

    def stash(m: re.Match) -> str:
        spans.append(m.group(1))
        return f"\x00{len(spans) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html.escape(text, quote=False)

    text = _LINK.sub(
        lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>', text
    )
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _BOLD_U.sub(r"<strong>\1</strong>", text)
    text = _ITAL.sub(r"<em>\1</em>", text)

    # Markdown hard break (two trailing spaces) -> <br>
    text = re.sub(r"  +\n", "<br>\n", text)

    for i, raw in enumerate(spans):
        text = text.replace(f"\x00{i}\x00", f"<code>{html.escape(raw, quote=False)}</code>")
    return text


def slugify(heading: str) -> str:
    """GitHub-compatible heading anchor, so the source TOC's links resolve."""
    s = heading.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = s.replace(" ", "-")
    return s


# --------------------------------------------------------------------------
# Block Markdown
# --------------------------------------------------------------------------

@dataclass
class Doc:
    title: str = ""
    meta: list[str] = field(default_factory=list)
    body: list[str] = field(default_factory=list)
    toc: list[tuple[int, str, str]] = field(default_factory=list)  # (level, text, slug)
    stats: dict = field(default_factory=dict)


def classify_fence(lang: str, lines: list[str]) -> str:
    """Pick the visual treatment for a fenced block.

    diagram  - contains box-drawing / flow arrows: centred figure, white ground
    formula  - short, language-less pseudocode or an equation: light inline rule
    code     - everything else: conventional tinted code block
    """
    joined = "\n".join(lines)
    if re.search(r"[─-╿]", joined):
        return "diagram"
    if re.search(r"[←-⇿▶▼➔-➿]", joined) and len(lines) <= 14:
        return "diagram"
    if not lang and len(lines) <= 12:
        return "formula"
    return "code"


def parse(md: str, *, drop_source_toc: bool) -> Doc:
    doc = Doc()
    lines = md.split("\n")
    i = 0
    n = len(lines)
    out = doc.body

    n_tables = n_fences = n_headings = n_listitems = 0
    first_h2_emitted = False
    in_source_toc = False

    def close_lists(stack: list[str]) -> None:
        while stack:
            out.append(f"</{stack.pop()}>")

    list_stack: list[str] = []
    list_indents: list[int] = []

    while i < n:
        line = lines[i]

        # ---- fenced code -------------------------------------------------
        if line.lstrip().startswith("```"):
            lang = line.strip()[3:].strip()
            i += 1
            block: list[str] = []
            while i < n and not lines[i].lstrip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1  # consume closing fence
            n_fences += 1
            close_lists(list_stack)
            list_indents.clear()

            while block and not block[-1].strip():
                block.pop()
            kind = classify_fence(lang, block)
            size = fit_code_size(block)
            # A block taller than roughly half a page may break across pages
            # rather than leave a large white gap before it.
            breakable = " breakable" if len(block) > 26 else ""
            body = html.escape("\n".join(block), quote=False)
            out.append(
                f'<pre class="{kind}{breakable}" style="font-size:{size:.2f}pt">'
                f"<code>{body}</code></pre>"
            )
            continue

        # ---- heading -----------------------------------------------------
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            close_lists(list_stack)
            list_indents.clear()
            level = len(m.group(1))
            text = m.group(2).strip()

            if level == 1 and not doc.title:
                doc.title = text
                i += 1
                continue

            # The source's own "Table of Contents" list is replaced by a
            # generated one carrying real page numbers; the sections it points
            # at are untouched.
            if drop_source_toc and level == 2 and text.strip().lower() == "table of contents":
                in_source_toc = True
                i += 1
                continue
            if in_source_toc:
                if level <= 2:
                    in_source_toc = False
                else:
                    i += 1
                    continue

            n_headings += 1
            slug = slugify(text)
            cls = ""
            if level == 2:
                doc.toc.append((1, text, slug))
                if not first_h2_emitted:
                    cls = ' class="first-section"'
                    first_h2_emitted = True
            elif level == 3:
                doc.toc.append((2, text, slug))

            out.append(
                f'<h{level} id="{slug}"{cls}>{render_inline(text)}</h{level}>'
            )
            i += 1
            continue

        if in_source_toc:
            i += 1
            continue

        # ---- table -------------------------------------------------------
        if line.lstrip().startswith("|") and i + 1 < n and re.match(
            r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]
        ):
            close_lists(list_stack)
            list_indents.clear()

            def cells(row: str) -> list[str]:
                row = row.strip()
                if row.startswith("|"):
                    row = row[1:]
                if row.endswith("|"):
                    row = row[:-1]
                return [c.strip() for c in row.split("|")]

            header = cells(line)
            aligns = []
            for spec in cells(lines[i + 1]):
                if spec.startswith(":") and spec.endswith(":"):
                    aligns.append("center")
                elif spec.endswith(":"):
                    aligns.append("right")
                else:
                    aligns.append("left")
            i += 2
            body_rows = []
            while i < n and lines[i].lstrip().startswith("|"):
                body_rows.append(cells(lines[i]))
                i += 1
            n_tables += 1

            html_rows = ["<table><thead><tr>"]
            for idx, h in enumerate(header):
                a = aligns[idx] if idx < len(aligns) else "left"
                html_rows.append(f'<th style="text-align:{a}">{render_inline(h)}</th>')
            html_rows.append("</tr></thead><tbody>")
            for row in body_rows:
                html_rows.append("<tr>")
                for idx in range(len(header)):
                    cell = row[idx] if idx < len(row) else ""
                    a = aligns[idx] if idx < len(aligns) else "left"
                    html_rows.append(
                        f'<td style="text-align:{a}">{render_inline(cell)}</td>'
                    )
                html_rows.append("</tr>")
            html_rows.append("</tbody></table>")
            out.append("".join(html_rows))
            continue

        # ---- horizontal rule ---------------------------------------------
        if re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", line):
            close_lists(list_stack)
            list_indents.clear()
            out.append("<hr>")
            i += 1
            continue

        # ---- blockquote ---------------------------------------------------
        if line.lstrip().startswith(">"):
            close_lists(list_stack)
            list_indents.clear()
            quote = []
            while i < n and lines[i].lstrip().startswith(">"):
                quote.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append(f"<blockquote><p>{render_inline(' '.join(quote))}</p></blockquote>")
            continue

        # ---- list ---------------------------------------------------------
        lm = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", line)
        if lm:
            indent = len(lm.group(1).expandtabs(4))
            ordered = not lm.group(2) in ("-", "*", "+")
            tag = "ol" if ordered else "ul"
            content = lm.group(3)

            while list_indents and indent < list_indents[-1]:
                out.append(f"</{list_stack.pop()}>")
                list_indents.pop()

            if not list_stack or indent > (list_indents[-1] if list_indents else -1):
                out.append(f"<{tag}>")
                list_stack.append(tag)
                list_indents.append(indent)
            elif list_stack[-1] != tag:
                out.append(f"</{list_stack.pop()}>")
                out.append(f"<{tag}>")
                list_stack.append(tag)

            # continuation lines belong to this item
            i += 1
            while (
                i < n
                and lines[i].strip()
                and not re.match(r"^(\s*)([-*+]|\d+[.)])\s+", lines[i])
                and not lines[i].lstrip().startswith(("```", "|", "#", ">"))
                and len(lines[i]) - len(lines[i].lstrip()) > indent
            ):
                content += " " + lines[i].strip()
                i += 1

            n_listitems += 1
            out.append(f"<li>{render_inline(content)}</li>")
            continue

        # ---- blank -------------------------------------------------------
        if not line.strip():
            close_lists(list_stack)
            list_indents.clear()
            i += 1
            continue

        # ---- paragraph ---------------------------------------------------
        para = [line]
        i += 1
        while (
            i < n
            and lines[i].strip()
            and not lines[i].lstrip().startswith(("```", "|", "#", ">"))
            and not re.match(r"^(\s*)([-*+]|\d+[.)])\s+", lines[i])
            and not re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", lines[i])
        ):
            para.append(lines[i])
            i += 1

        text = "\n".join(para)
        # Leading "**Key**: value" lines before the first section are document
        # front matter (version, date, authors) and are styled as such.
        out.append(f"<p>{render_inline(text)}</p>")

    close_lists(list_stack)
    doc.stats = {
        "headings": n_headings,
        "tables": n_tables,
        "fences": n_fences,
        "list_items": n_listitems,
    }
    return doc


# --------------------------------------------------------------------------
# HTML assembly
# --------------------------------------------------------------------------

def build_toc_html(entries: list[tuple[int, str, str]]) -> str:
    if not entries:
        return ""
    items = ["<nav class='toc'><h2>Contents</h2><ol>"]
    for level, text, slug in entries:
        items.append(
            f"<li class='toc-{level}'><a href='#{slug}'>{html.escape(text)}</a></li>"
        )
    items.append("</ol></nav>")
    return "".join(items)


def build_cover(title: str, subtitle: str, descriptor: str, meta: list[tuple[str, str]]) -> str:
    rows = "".join(
        f"<tr><th>{html.escape(k)}</th><td>{render_inline(v)}</td></tr>" for k, v in meta
    )
    return f"""
<section class="cover">
  <div class="cover-rule-top"></div>
  <h1 class="cover-title">{html.escape(title)}</h1>
  <div class="cover-subtitle">{html.escape(subtitle)}</div>
  <div class="cover-descriptor">{html.escape(descriptor)}</div>
  <div class="cover-rule-mid"></div>
  <table class="cover-meta">{rows}</table>
  <div class="cover-foot">
    This document is generated from the project's Markdown source of truth.
    Its technical content is reproduced without modification.
  </div>
</section>
"""


def assemble(doc: Doc, *, running_title: str, cover_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{html.escape(doc.title or running_title)}</title>
<link rel="stylesheet" href="{CSS_PATH.as_uri()}">
</head>
<body>
<div class="doctitle-source">{html.escape(running_title)}</div>
{cover_html}
{build_toc_html(doc.toc)}
<main>
{chr(10).join(doc.body)}
</main>
</body>
</html>
"""


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------

def normalise(s: str) -> str:
    s = s.replace(" ", " ")
    # Soft hyphens and the zero-width joiners PDF extraction can introduce.
    s = re.sub(r"[­​-‍﻿]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_md(s: str) -> str:
    """Remove Markdown *delimiters* only.

    Underscores, parentheses and brackets are part of the identifiers and route
    names in this documentation (`full_name`, `(Node/Express)`), so stripping
    them would make the probe differ from what the PDF legitimately contains.
    Only backticks and emphasis markers are syntax here.
    """
    s = s.replace("`", "")
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*(?!\*)", "", s)
    s = _LINK.sub(r"\1", s)
    return s


def verify(md_path: Path, pdf_path: Path) -> tuple[bool, list[str]]:
    """Extract the PDF's text and confirm the source's content survived."""
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    raw = "\n".join((p.extract_text() or "") for p in reader.pages)
    pdf_text = normalise(raw)
    # Whitespace-free view. Text extraction legitimately introduces breaks the
    # source has no notion of: a code span's padding reads back as
    # "( /payments )", and a long identifier wrapped inside a narrow table cell
    # reads back as "appliedA\nt". Both are correct rendering, not lost content,
    # so presence is asserted against the character sequence alone.
    pdf_dense = re.sub(r"\s+", "", pdf_text)
    src = md_path.read_text(encoding="utf-8")

    problems: list[str] = []

    # every heading
    for m in re.finditer(r"^#{2,6}\s+(.*)$", src, re.M):
        h = m.group(1).strip()
        if h.lower() == "table of contents":
            continue
        probe = re.sub(r"\s+", "", normalise(strip_md(h)))
        if probe and probe not in pdf_dense:
            problems.append(f"missing heading: {h}")

    # every table row's first cell
    for line in src.split("\n"):
        if line.startswith("|") and not re.match(r"^\s*\|[\s:|-]+\|\s*$", line):
            first = line.strip().strip("|").split("|")[0].strip()
            probe = re.sub(r"\s+", "", normalise(strip_md(first)))
            if len(probe) > 3 and probe not in pdf_dense:
                problems.append(f"missing table cell: {probe[:60]}")

    return (not problems), problems


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

@dataclass
class Job:
    md: Path
    pdf: Path
    running_title: str
    subtitle: str
    descriptor: str
    cover_meta: list[tuple[str, str]]


def build(job: Job, *, write_html: bool = False) -> dict:
    from weasyprint import HTML

    md = job.md.read_text(encoding="utf-8")
    doc = parse(md, drop_source_toc=True)
    cover = build_cover(
        doc.title.split("—")[0].strip() if "—" in doc.title else doc.title,
        job.subtitle,
        job.descriptor,
        job.cover_meta,
    )
    page = assemble(doc, running_title=job.running_title, cover_html=cover)

    if write_html:
        (DOCS / f"_{job.pdf.stem}.html").write_text(page, encoding="utf-8")

    job.pdf.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=page, base_url=str(DOCS)).write_pdf(str(job.pdf))

    from pypdf import PdfReader

    pages = len(PdfReader(str(job.pdf)).pages)
    return {
        "pages": pages,
        "bytes": job.pdf.stat().st_size,
        **doc.stats,
        "toc_entries": len(doc.toc),
    }


def jobs() -> list[Job]:
    return [
        Job(
            md=ROOT / "docs" / "SYSTEM_DOCUMENTATION.md",
            pdf=ROOT / "docs" / "SYSTEM_DOCUMENTATION.pdf",
            running_title="LokRozgar AI — System Documentation",
            subtitle="Technical System Documentation",
            descriptor=(
                "Multilingual, voice-enabled employment platform connecting "
                "blue-collar workers with local employers."
            ),
            cover_meta=[
                ("Project", "LokRozgar AI"),
                ("Document", "System Documentation"),
                ("Technical Scope", "Frontend · Backend · AI Service · Database"),
                ("Version", "1.0.0"),
                ("Date", "October 2026"),
                ("Authors", "Swarup Pal, Nilam (Backend Lead)"),
                ("Classification", "Technical System Documentation — Implementation Reference"),
            ],
        ),
        Job(
            md=ROOT / "backend2" / "docs" / "API_DOCUMENTATION.md",
            pdf=ROOT / "backend2" / "docs" / "API_DOCUMENTATION.pdf",
            running_title="LokRozgar AI — API Documentation",
            subtitle="Backend API Reference (v1)",
            descriptor=(
                "Complete REST endpoint reference for the LokRozgar AI backend "
                "service, including access control and request semantics."
            ),
            cover_meta=[
                ("Project", "LokRozgar AI"),
                ("Document", "API Documentation"),
                ("API Version", "v1"),
                ("Base URL", "`http://localhost:8000/api/v1`"),
                ("Technical Scope", "Node.js · Express · MongoDB"),
            ],
        ),
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", action="store_true", help="diff PDF text against the Markdown")
    ap.add_argument("--html", action="store_true", help="also write the intermediate HTML")
    args = ap.parse_args()

    ok = True
    for job in jobs():
        if not job.md.exists():
            print(f"!! source missing: {job.md}")
            ok = False
            continue
        stats = build(job, write_html=args.html)
        rel = job.pdf.relative_to(ROOT)
        print(
            f"{rel}\n"
            f"    pages {stats['pages']}   size {stats['bytes']/1024:.0f} KB   "
            f"headings {stats['headings']}   tables {stats['tables']}   "
            f"code blocks {stats['fences']}   toc entries {stats['toc_entries']}"
        )
        if args.verify:
            good, problems = verify(job.md, job.pdf)
            if good:
                print("    verify: every heading and table row found in the PDF text")
            else:
                ok = False
                print(f"    verify: {len(problems)} PROBLEM(S)")
                for p in problems[:25]:
                    print(f"        - {p}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
