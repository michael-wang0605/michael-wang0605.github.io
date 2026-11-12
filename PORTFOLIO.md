# Private portfolio

The portfolio uses the site's existing type and monochrome palette, with the
original Life starfield behind both the password entrance and unlocked views.
Content and attachments remain encrypted. Public pages and shared styling are
unchanged; nothing is deployed by the local editing tools.

## Routes

- `portfolio.html`: short introduction and four collection links.
- `portfolio-work.html`: Defense, Treasury, NOVA, and ESTO.
- `portfolio-research.html`: ferroptosis, LLM bias research, and a working paper.
- `portfolio-life.html`: the actual photograph, timeline, and event notes.
- `portfolio-archive.html`: compact project notes and expandable documents.
- `portfolio-entry.html?entry=ID`: reusable detail view.

All 17 entry IDs remain valid. Work: `w05`, `w01`, `w03`, `w02`; Research:
`r02`, `r01`, `r03`; Life: `l02`, `l01`; Archive: `a03`–`a07`; documents / earlier
versions: `w04`, `a01`, `a02`. No existing public route was renamed or replaced.
`life.html` already redirected into the portfolio before this task and remains
byte-for-byte unchanged, as does `life-background.js`.

## Editing content

The source is outside the served repository:

`../personal-website-private/archive/archive.json`

Its `assets/` directory contains the actual attachments. Never move private
source into this site, even into an ignored folder: the HTTP server can serve it.
Backups before the CV review and editorial cleanup are stored beside the source.

Each entry has `id`, `section`, `title`, `date`, `kind`, `summary`, `metadata`, and
`blocks`. Array order controls listing and previous / next order. Useful options:

- `signal`: a short, supported credential or project milestone.
- `secondary: true`: a Research entry on the working-papers shelf.
- `reference: true`: an Archive entry inside the documents disclosure.
- `inline: true`: a short note shown directly in the list instead of an extra click.

The top-level `credentialLine` is an optional overview line. `sections` contains
descriptions, optional media `blocks`, and Life `groups` referencing entry IDs.
Empty groups are omitted. Do not add placeholder headings or media slots just
to fill out a case study; add actual materials when available.

Block types: `paragraph`, `heading`, `list`, `quote`, `link`, `media`, `gallery`,
`timeline`, `note`, and `media-slot`. A note with `collapsed: true` becomes an
expandable disclosure, useful for research context or metric definitions. Lists
use `items`; other text blocks use `text`. A link needs `label` and `url`.
Media references an ID in `assets`; galleries contain media items. Images display
without download clutter unless `download: true` is set. Other attachments retain
download links. HTML snapshots are download-only.

The UI uses one sticky navigation row, concise entry summaries, a reading column,
and previous / next links. Entries with more than three headings have optional
collapsed contents. Archive notes are inline; older documents are collapsed.
The CSS is consolidated and scoped to the portfolio.

## Evidence and copy

Titles and month-level periods match the repository CV. The stronger editorial
pass foregrounds CV-supported appointments, selections, technical work, and pilot
milestones. It does not turn a pilot into revenue, assets into company valuation,
or a prototype into a production deployment. The CV remains the source of these
claims, not independent verification. Full provenance is stored privately in
`editorialSources`, which is stripped from the encrypted published bundle.

CV experiment-specific bias figures lead the research account. The earlier
owner-supplied percentage-point / utility figures remain in collapsed evaluation
notes with their unresolved benchmark context. The author / publication links
previously verified against PubMed and SSRN are retained. No missing screenshots,
architecture diagrams, methods, personal stories, or experimental data are invented.

Private reviews: `../personal-website-private/portfolio-cv-review.md` and the
source's editorial provenance. The CV PDF copies are unchanged.

## Build and verify locally

There is no package manager or site build. Rebuild encrypted content with:

```powershell
node tools/protect-portfolio.mjs ../personal-website-private/archive/archive.json
node tools/check-portfolio.mjs ../personal-website-private/archive/archive.json
python -m http.server 8000 --bind 0.0.0.0
```

The rebuild verifies the existing password before atomically replacing
`public/assets/portfolio.enc.json`. A typo leaves the bundle intact. Never put a
real password in a command argument, source, documentation, or test fixture.
The optional private `rebuild-portfolio-local.py` helper provides masked local
entry and does not print or persist the password.

Node checks cover encryption / tampering, password-preserving updates, path
boundaries, all entry views, links, attachments, locking, reduced motion, stable
in-place navigation, history, and cleanup. Private browser review scripts test
real rendering with an intercepted encrypted test copy of the source; they never
replace the real bundle with a synthetic password.

Completed checks include all 17 entries at 1440 / 390 / 320 px, navigation at
1024 px, frame sampling for flicker, normal and reduced-motion starfields,
disclosures, media, public exit, refresh, and authentication. Public source files
and CV copies retain their original hashes. The encrypted bundle was rebuilt
with the existing password; no deployment was performed.

## Navigation and security

Private views render synchronously in the same root, retaining the canvas and
lifecycle. Back / forward restores reading position. Public exit, refresh,
pagehide, and lock clear decrypted content; no passwords, keys, or plaintext are
stored in browser persistence. Blob attachment URLs are revoked when discarded.

The only shared-script exception remains three lines in `site-shell.js`: a
guarded portfolio history hook, its comment, and URL synchronization. Public /
locked routes decline the hook and use the existing router. Original vs updated
public navigation, history, typography, and geometry matched in browser checks.

Protection is browser-side AES-256-GCM encryption with PBKDF2-SHA-256 (600,000
iterations), not server-side authorization. Ciphertext can be downloaded for
offline password guessing; security depends on the password and host / script
integrity. Already public CVs, images, or Git history are not made private by
bundling encrypted copies. The existing encryption format and password flow are
unchanged.
