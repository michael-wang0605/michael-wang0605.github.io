import { writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createArchiveBundle, encryptArchive } from './portfolio-bundle.mjs';

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

const payload = encryptArchive(bundle, password);
password = '';
const output = resolve(projectRoot, 'public/assets/portfolio.enc.json');
await writeFile(output + '.tmp', JSON.stringify(payload) + '\n');
await rename(output + '.tmp', output);
console.log('Updated the encrypted portfolio. Content and bundled assets are encrypted together.');
