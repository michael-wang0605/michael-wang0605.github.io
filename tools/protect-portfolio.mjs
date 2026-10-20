import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2] && await realpath(resolve(process.argv[2]));
if (!inputPath) throw new Error('Usage: node tools/protect-portfolio.mjs <private HTML file outside the website folder>');
const inputRelative = relative(projectRoot, inputPath);
if (inputRelative !== '..' && !inputRelative.startsWith('..' + sep) && !/^[A-Za-z]:/.test(inputRelative)) {
  throw new Error('Keep the unencrypted source outside the website folder so the web server cannot serve it.');
}

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

const salt = randomBytes(16);
const iv = randomBytes(12);
const iterations = 600000;
const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
password = '';
const cipher = createCipheriv('aes-256-gcm', key, iv);
const plaintext = await readFile(inputPath);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
key.fill(0);
plaintext.fill(0);
const payload = {
  version: 1, iterations,
  salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'),
};
await writeFile(resolve(projectRoot, 'public/assets/portfolio.enc.json'), JSON.stringify(payload) + '\n');
console.log('Updated public/assets/portfolio.enc.json. Only encrypted content is published.');
