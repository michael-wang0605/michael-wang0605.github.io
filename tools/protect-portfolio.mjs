import { readFile, writeFile, rename } from 'node:fs/promises';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { AAD, ITERATIONS, createArchiveBundle, encryptArchive } from './portfolio-bundle.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node tools/protect-portfolio.mjs <private archive.json outside the website folder>');
const bundle = await createArchiveBundle(process.argv[2], projectRoot);

let password;
if (process.stdin.isTTY) {
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input: process.stdin, output: silent, terminal: true });
  process.stdout.write('Portfolio password: ');
  password = await reader.question('');
  reader.close();
  process.stdout.write('\n');
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}
if (!password) throw new Error('A password is required.');

const output = resolve(projectRoot, 'public/assets/portfolio.enc.json');
// Updating content must preserve the existing password, including after a typo.
let existing;
try { existing = JSON.parse(await readFile(output, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  if (existing.version !== 2 || existing.iterations !== ITERATIONS) throw new Error('Unsupported existing encryption format; bundle was not changed.');
  const key = pbkdf2Sync(password, Buffer.from(existing.salt, 'base64'), ITERATIONS, 32, 'sha256');
  let chunks = [];
  try {
    const ciphertext = Buffer.from(existing.ciphertext, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(existing.iv, 'base64'));
    decipher.setAAD(Buffer.from(AAD));
    decipher.setAuthTag(ciphertext.subarray(-16));
    chunks.push(decipher.update(ciphertext.subarray(0, -16)));
    chunks.push(decipher.final());
  } catch {
    throw new Error('The password did not unlock the existing bundle. Nothing was changed.');
  } finally {
    key.fill(0);
    chunks.forEach(chunk => chunk.fill(0));
    existing = null;
  }
}

const payload = encryptArchive(bundle, password);
password = '';
await writeFile(output + '.tmp', JSON.stringify(payload) + '\n');
await rename(output + '.tmp', output);
console.log('Updated the encrypted portfolio. Content and bundled assets are encrypted together.');
