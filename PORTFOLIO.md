The private portfolio lives at `portfolio.html`. Its content is encrypted with
AES-256-GCM and a password-derived key (PBKDF2-SHA-256, 600,000 iterations).
The password and decrypted content are never saved to browser storage.
Leaving the page or choosing “lock portfolio” locks it again.

To edit the private content:

1. Edit `../personal-website-private/portfolio.html`, outside this website folder.
2. From this folder, run:

   ```powershell
   node tools/protect-portfolio.mjs ../personal-website-private/portfolio.html
   ```

3. Enter the portfolio password when prompted, then publish the updated
   `public/assets/portfolio.enc.json` with the site. There is no regular build step.

Keep confidential text in the external source file. Do not add an unencrypted
copy under this website folder, even if it is ignored by Git: a static server
can still serve ignored files. Linked images, PDFs, and other files in the public
folder remain public; this mechanism encrypts the portfolio HTML, not those files.

The page uses the browser's Web Crypto API, available on HTTPS and localhost.
This is password-based content encryption for a static site, not user accounts or
server-side access control. Anyone with the shared password can decrypt the content.
