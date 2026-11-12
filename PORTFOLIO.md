# Private portfolio

The portfolio retains the existing typography, monochrome palette, editorial
lists, and continuous Life starfield. All collection content and attachments
are encrypted. Unrelated public pages and shared styles are unchanged.

## Routes and entries

- `portfolio.html`: index of five collections.
- `portfolio-work.html`: Defense / CDAO, Treasury, Zontra, and ESTO.
- `portfolio-research.html`: ferroptosis and multimodal AI bias research.
- `portfolio-side-quests.html`: hackathons, projects, an award, and a working paper.
- `portfolio-life.html`: the actual photograph, year-only timeline, and event links.
- `portfolio-archive.html`: earlier experiments and sanitized reference documents.
- `portfolio-entry.html?entry=ID`: reusable detail view.

All 17 previous entry URLs remain valid, with two additions (19 total):

- Work: `w05`, `w01`, `w03`, `w02`.
- Research: `r02`, `r01`.
- Side Quests: `a04`, `q02`, `a05`, `a06`, `r03`, `q01`.
- Life: `l02`, `l01`.
- Archive: `a03`, `a07`, `w04`, `a01`, `a02`.

Projects moved to Side Quests were updated rather than duplicated. Existing
public routes were not renamed. `life.html` already redirected into the portfolio
before this task; that file and `life-background.js` remain unchanged.

## Content source

Edit `../personal-website-private/archive/archive.json`, outside the HTTP-served
repository. Its `assets/` directory contains the private attachment sources.
Backups before each content review remain beside it. Never move private source
under the website, even into an ignored folder: HTTP can still serve that folder.

Entries have `id`, `section`, `title`, `date`, `kind`, `summary`, `metadata`, and
`blocks`. Dates must be years or year ranges only (or blank if undocumented).
Optional `status` is `Current`, `Previously`, or `Operationally passive`.
Array order controls listing and previous / next order.

Optional fields:

- `signal`: a concise, supported project detail.
- `secondary: true`: a separate shelf inside a collection.
- `reference: true`: an Archive reference inside a collapsed documents section.
- `inline: true`: a short note shown directly in a list.

Sections have `description`, optional media `blocks`, and optional Life `groups`
that reference existing entry IDs. Empty groups are omitted. Do not add empty
case-study headings or simulated media merely to fill space.

Block types: `paragraph`, `heading`, `list`, `quote`, `link`, `media`, `gallery`,
`timeline`, `note`, and `media-slot`. A note with `collapsed: true` is expandable.
Text blocks use `text`; lists use `items`; external links use `label` and `url`.
Media references an ID in `assets`. Images have no download clutter unless
`download: true` is set. Other attachments retain download links.

The thin sticky section bar and previous / next links remain. On narrow screens
the section row scrolls horizontally and brings the current section into view.
All new styles and renderer behavior are portfolio-specific.

## Accuracy and privacy

The latest owner instructions govern roles, statuses, naming, prospective
relationships, and experimental findings. Government descriptions stay high-level.
Unverified older research numbers remain only in private provenance pending
underlying evaluation support. No deployments, realized savings, signed customers,
clinical validation, or publication status are inferred.

Public source links are included only where a project / author or award record
was checked. Award wording conflicts and missing evidence are recorded in
`../personal-website-private/portfolio-accuracy-review.md`. The private
`editorialSources` object is stripped from the published encrypted bundle.

Birth and childhood identifiers were removed from the portfolio timeline. Raw
CV / old HTML downloads were replaced by sanitized text references. Originals
remain backed up outside the website. Photo metadata was stripped with identical
decoded pixels. The portfolio header shows the existing `michael-wang-cv.pdf`
link after a successful unlock and hides it again on lock. This controls the
link's visibility; the existing public PDF is not password-protected.
Existing public CV files used by unrelated pages are unchanged and need a
separate privacy review; this task does not rewrite public files or Git history.

## Local rebuild and checks

```powershell
node tools/protect-portfolio.mjs ../personal-website-private/archive/archive.json
node tools/check-portfolio.mjs ../personal-website-private/archive/archive.json
python -m http.server 8000 --bind 0.0.0.0
```

The rebuild verifies the existing password, then atomically replaces
`public/assets/portfolio.enc.json`. A wrong password leaves it unchanged. Never
put a real password in source, command arguments, docs, or browser fixtures.
The optional private `rebuild-portfolio-local.py` helper provides masked local
entry without printing or persisting the secret. The static site has no package
manager or general build step. No deployment is part of this update.

Node checks cover encryption, tampering, private paths, year-only dates, statuses,
all seven protected shells, all 19 entries, in-place navigation, Side Quests
session retention, history, assets, locking, and cleanup. Private browser checks
use an intercepted encrypted test copy without replacing real ciphertext. They
cover desktop / tablet / mobile, actual images, sanitized downloads, scrollable
navigation, year-only / privacy audits, statuses, history, lock, refresh, and exit.

Private views keep the same root, starfield canvas, and lifecycle. The only prior
shared-script exception remains the small guarded portfolio history hook in
`site-shell.js`; this update does not change it. Public navigation still clears
the private session. Keys, passwords, and plaintext are not persisted in browser
storage, and attachment Blob URLs are revoked when discarded.

Protection remains browser-side AES-256-GCM with PBKDF2-SHA-256 (600,000
iterations), not server-side authorization. Downloadable ciphertext can be
subjected to offline password guessing; security depends on the password and
host / script integrity. Already public files and history are not made private
by including sanitized copies in this collection.
