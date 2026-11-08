import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

export const SECTIONS = ['work', 'research', 'life', 'archive'];
export const AAD = 'michael-w-archive-v2';
export const ITERATIONS = 600000;
const MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf', 'application/octet-stream', 'text/plain', 'text/markdown', 'text/csv',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'video/mp4', 'video/webm',
]);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BLOCKS = new Set(['paragraph', 'heading', 'list', 'quote', 'media', 'gallery', 'link', 'timeline']);

export function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be nonempty text.`);
}

export function validateArchive(data) {
  if (data.format !== 'mw-archive' || data.version !== 1) throw new Error('Unsupported archive format.');
  requireText(data.introduction, 'Archive introduction');
  for (const id of SECTIONS) {
    if (!data.sections?.[id]) throw new Error(`Missing section: ${id}`);
    requireText(data.sections[id].description, `${id} description`);
  }
  if (!Array.isArray(data.entries)) throw new Error('Entries must be an array.');
  const ids = new Set();
  const asset = id => {
    if (!Object.hasOwn(data.assets || {}, id)) throw new Error('An entry references a missing asset.');
  };
  for (const entry of data.entries) {
    if (!ID.test(entry.id) || ids.has(entry.id)) throw new Error('Entry IDs must be unique, short lowercase identifiers.');
    ids.add(entry.id);
    if (!SECTIONS.includes(entry.section)) throw new Error('Unknown entry section.');
    requireText(entry.title, 'Entry title');
    requireText(entry.summary, 'Entry summary');
    if (!Array.isArray(entry.blocks)) throw new Error('Entry blocks must be an array.');
    for (const block of entry.blocks) {
      if (!BLOCKS.has(block.type)) throw new Error('Unknown content block type.');
      if (['paragraph', 'heading', 'quote'].includes(block.type)) requireText(block.text, 'Block text');
      if (block.type === 'list' && (!Array.isArray(block.items) || block.items.some(item => typeof item !== 'string'))) throw new Error('List items must be text.');
      if (block.type === 'timeline' && (!Array.isArray(block.items) || block.items.some(item => typeof item.text !== 'string' || typeof item.date !== 'string'))) throw new Error('Timeline items need a date and text.');
      if (block.type === 'media') asset(block.asset);
      if (block.type === 'gallery') {
        if (!Array.isArray(block.items)) throw new Error('Gallery items must be an array.');
        block.items.forEach(item => asset(item.asset));
      }
      if (block.type === 'link') {
        requireText(block.label, 'Link label');
        if (!['http:', 'https:', 'mailto:'].includes(new URL(block.url).protocol)) throw new Error('Only web and email links are allowed.');
      }
    }
  }
  for (const [id, item] of Object.entries(data.assets || {})) {
    if (!ID.test(id) || !MEDIA_TYPES.has(item.type)) throw new Error('Invalid asset identifier or media type.');
    requireText(item.name, 'Asset name');
  }
  return data;
}

export async function createArchiveBundle(input, projectRoot) {
  const sourcePath = await realpath(resolve(input));
  const siteRoot = await realpath(projectRoot);
  if (isWithin(siteRoot, sourcePath)) throw new Error('Keep the archive source outside the website folder.');
  const sourceRoot = dirname(sourcePath);
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  validateArchive(source);
  const bundle = structuredClone(source);
  bundle.assets = {};
  let total = 0;
  for (const [id, item] of Object.entries(source.assets || {})) {
    requireText(item.file, 'Asset file');
    const path = await realpath(resolve(sourceRoot, item.file));
    if (!isWithin(sourceRoot, path) || isWithin(siteRoot, path)) throw new Error('Assets must stay inside the private source folder, including symlink targets.');
    const bytes = await readFile(path);
    total += bytes.length;
    if (bytes.length > 25 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('Keep each asset under 25 MB and the collection under 64 MB.');
    bundle.assets[id] = { name: item.name, type: item.type, base64: bytes.toString('base64') };
    bytes.fill(0);
  }
  // Editorial provenance stays outside the published bundle.
  delete bundle.editorialSources;
  return validateArchive(bundle);
}

export function encryptArchive(bundle, password) {
  if (!password) throw new Error('A password is required.');
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const plaintext = Buffer.from(JSON.stringify(bundle));
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(AAD));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    return { version: 2, iterations: ITERATIONS, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}
