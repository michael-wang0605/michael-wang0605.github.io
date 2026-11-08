# Private portfolio

The existing portfolio entrance is unchanged: the small password underline,
moonlit object, particle title, and slowed dot departure lead into the collection.
All pages use the site's existing black canvas, Noto Sans JP / Source Code Pro,
shared public navigation, fine rules, and spacing conventions.

The collection has dedicated pages:

- `portfolio.html`: collection landing page
- `portfolio-work.html`: professional, engineering, and independent work
- `portfolio-research.html`: scientific and academic work
- `portfolio-life.html`: personal stories, experiences, and the preserved timeline
- `portfolio-archive.html`: documents, earlier versions, and other artifacts
- `portfolio-entry.html?entry=ID`: an individual entry

Every URL is a content-free shell until unlocked. `life.html` redirects to the
protected Life section and contains no personal timeline. The original Life HTML
remains intact outside the site, and an encrypted copy is downloadable inside
Archive. The initial entries are drawn from the owner's existing CV, Life page,
and this website. No publication abstracts, project results, or images have been
invented. The publication records retain their preprint / working-paper status.

## Privacy and session behavior

`public/assets/portfolio.enc.json` is an AES-256-GCM encrypted bundle containing
all entry text, metadata, and the actual bytes of its private attachments. It uses
PBKDF2-SHA-256 with 600,000 iterations, a random 16-byte salt, random 12-byte IV,
and version-specific authenticated additional data. The envelope is version 2;
its decrypted archive format is version 1.

The browser decrypts the bundle only after a correct password. Text is rendered
with DOM text nodes, never injected as HTML. Attachments become in-memory Blob
URLs only when displayed. Private HTML snapshots are download-only attachments.
Links allow web and email URLs; active attachment formats are not embedded.

The unlocked collection stays in memory while navigating between portfolio
pages in the same tab. Locking, leaving for a public page, refreshing, or leaving
the tab's document clears it. Blob URLs are revoked when a view is removed or a
session is locked. Reloading or opening a new tab requires the password again.
There is no password, decrypted content, or key in localStorage, sessionStorage,
cookies, service workers, or URLs. Public pages and the already public CV links
remain accessible as before.

This is password-based encryption for a static website, not user accounts or
server-side authorization. The public host serves ciphertext; a visitor needs
the password to decrypt the collection. The public Git repository must never
contain private source documents or media in plaintext.

The former public Life page is also present in older Git commits. Publishing
this implementation replaces the current page with a protected redirect; it
does not rewrite repository history or remove copies that were already public.
Historical removal is a separate, coordinated repository and indexing task.

## Add or edit content

The editable source is outside the website folder:

`../personal-website-private/archive/archive.json`

Its `assets/` directory holds the original private files. Keep a backup of this
private directory. The earlier `../personal-website-private/portfolio.html` and
`../personal-website-private/life-hidden/life.html` are preserved as originals.

An entry has an ID, section, title, date, kind, summary, optional metadata, and
content blocks. IDs should be neutral, short lowercase identifiers; they appear
in entry URLs. Add another object to `entries`, using one of `work`, `research`,
`life`, or `archive` as its section. It automatically appears in that section's
index and previous/next navigation. No new HTML page or layout is needed.

Supported blocks:

- `paragraph` / `heading`: `{ "type": "paragraph", "text": "..." }`
- `list`: `{ "type": "list", "items": ["..."] }`
- `quote`: `{ "type": "quote", "text": "...", "attribution": "..." }`
- `link`: `{ "type": "link", "label": "...", "url": "https://..." }`
- `media`: `{ "type": "media", "asset": "asset-id", "alt": "...", "caption": "..." }`
- `gallery`: `{ "type": "gallery", "items": [{ "asset": "asset-id", "alt": "...", "caption": "..." }] }`
- `timeline`: `{ "type": "timeline", "items": [{ "date": "...", "datetime": "YYYY-MM", "text": "...", "note": "..." }] }`

Use metadata for roles, collaborators, publication information, dates, and tools.
Use headings and paragraphs for context, contributions, methods, abstracts,
findings, outcomes, or reflections as appropriate. Life and Archive entries can
be a photograph and a few words; they need no professional framing.

Declare each attachment in the source's `assets` object:

```json
{
  "asset-id": {
    "file": "assets/filename.pdf",
    "name": "filename.pdf",
    "type": "application/pdf"
  }
}
```

Supported types include JPEG, PNG, WebP, GIF, AVIF, PDF, plain text, Markdown,
CSV, MP3, Ogg, WAV, MP4, and WebM. Other source artifacts can be stored as
`application/octet-stream` and downloaded. Photos, audio, video, documents, and
galleries reuse the same entry layout. PDFs have a preview and download link.
Keep assets under 25 MB each and the collection under 64 MB before encoding.
Paths, including symlinks, must remain inside the private source directory.

From the website directory, publish an updated encrypted bundle with:

```powershell
node tools/protect-portfolio.mjs ../personal-website-private/archive/archive.json
```

Enter the existing portfolio password at the hidden prompt. The script validates
the source and attachments and atomically replaces only the encrypted bundle.
Never put the password in source files or plaintext content under this website
folder, even if ignored by Git: the local static server would still serve it.
The existing public site still has no package manager or regular build step.

## Verification and publishing

```powershell
node tools/check-portfolio.mjs
python -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000/portfolio.html` or any section URL. Verify the entrance,
unlock, section and entry navigation, media, scrolling on narrow screens, lock,
and public-page exit. Refresh and direct visits must require the password.

The automated check uses synthetic data outside the served folder to verify
cryptography, tamper rejection, path boundaries, rendering, sessions, asset
revocation, and page shells. It does not replace visual review of real media.
Publish the changed public files and encrypted bundle through the site's normal
deployment process; local edits do not update the live domain automatically.
