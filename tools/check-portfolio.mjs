import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecipheriv, pbkdf2Sync, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { AAD, createArchiveBundle, encryptArchive, validateArchive, isWithin } from './portfolio-bundle.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = name => readFile(join(site, name), 'utf8');
const password = 'synthetic-test-password';
const temporary = await mkdtemp(join(tmpdir(), 'mw-archive-check-'));

class Events {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) { for (const fn of [...this.listeners.get(event.type) || []]) fn(event); }
  emit(type, detail) { this.dispatchEvent({ type, detail }); }
}

class Element extends Events {
  constructor(tag = 'div') {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.isConnected = true;
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.scrollTop = 0;
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) };
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent?.removeChild(node);
      node.parent = this;
      this.children.push(node);
    }
  }
  removeChild(node) { this.children = this.children.filter(child => child !== node); node.parent = null; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; }); this.children = []; this.ownText = ''; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(); this.ownText = String(value); }
  get textContent() { return (this.ownText || '') + this.children.map(node => node.textContent).join(''); }
  set innerHTML(_value) { throw new Error('Private content must never be inserted as HTML.'); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  pause() { this.paused = true; }
  load() {}
  querySelectorAll(selector) {
    const names = selector.split(',').map(s => s.trim().toUpperCase());
    const result = [];
    const visit = node => { for (const child of node.children) { if (names.includes(child.tagName)) result.push(child); visit(child); } };
    visit(this);
    return result;
  }
}

async function harness(payload) {
  const document = new Events(), window = new Events(), urls = new Map(), timers = new Map();
  let nextId = 0, cleanups = [], current;
  class TestURL extends URL {
    static createObjectURL(blob) { const url = `blob:http://localhost:8000/${++nextId}`; urls.set(url, blob); return url; }
    static revokeObjectURL(url) { urls.delete(url); }
  }
  class CustomEvent { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } }
  window.location = new URL('http://localhost:8000/portfolio.html');
  window.crypto = webcrypto;
  window.matchMedia = () => ({ matches: false });
  window.setTimeout = (fn, duration) => { const id = ++nextId; timers.set(id, { fn, duration }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.MWPageLifecycle = { addCleanup: fn => cleanups.push(fn) };
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new Error('Persistent storage must not be used.'); } });
  Object.defineProperty(document, 'cookie', { get() { throw new Error('Cookies must not be used.'); }, set() { throw new Error('Cookies must not be used.'); } });
  document.createElement = tag => new Element(tag);
  document.getElementById = id => current.nodes[id];
  document.querySelector = selector => selector === '.portfolio-main' ? current.main : current.heading;
  let pendingFetch = null;
  const context = vm.createContext({ window, document, console, URL: TestURL, Blob, TextEncoder, TextDecoder, Uint8Array, AbortController, DOMException, crypto: webcrypto, atob, CustomEvent, performance, queueMicrotask,
    fetch: async (_path, options) => { if (pendingFetch) await pendingFetch; if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); return { ok: true, json: async () => structuredClone(payload) }; }
  });
  const scripts = Object.fromEntries(await Promise.all(['portfolio-session.js', 'portfolio-renderer.js', 'portfolio.js'].map(async name => [name, await source(name)])));
  async function mount(section = 'portfolio', query = '') {
    cleanups.forEach(fn => fn());
    cleanups = [];
    if (current) current.root.isConnected = false;
    const nodes = Object.fromEntries(['portfolio-root', 'portfolio-form', 'portfolio-password', 'portfolio-submit', 'portfolio-message', 'portfolio-content', 'portfolio-lock'].map(id => [id, new Element()]));
    const body = new Element('body'), main = new Element('main'), heading = new Element('h1');
    nodes['portfolio-root'].dataset.portfolioSection = section;
    body.append(main);
    main.append(heading, nodes['portfolio-root']);
    nodes['portfolio-root'].append(nodes['portfolio-form'], nodes['portfolio-message'], nodes['portfolio-content'], nodes['portfolio-lock']);
    nodes['portfolio-form'].append(nodes['portfolio-password'], nodes['portfolio-submit']);
    current = { nodes, body, main, heading, root: nodes['portfolio-root'], content: nodes['portfolio-content'] };
    document.body = body;
    window.location = new URL(`http://localhost:8000/${section === 'portfolio' ? 'portfolio' : 'portfolio-' + section}.html${query}`);
    for (const name of Object.keys(scripts)) vm.runInContext(scripts[name], context);
    return current;
  }
  async function flush(duration) {
    const found = [...timers].find(([, timer]) => timer.duration === duration);
    assert.ok(found, `Expected the ${duration}ms animation stage.`);
    timers.delete(found[0]);
    found[1].fn();
    await new Promise(resolve => setImmediate(resolve));
  }
  async function until(predicate) {
    const end = Date.now() + 10000;
    while (!predicate() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(predicate(), 'Expected the asynchronous unlock to finish.');
  }
  function submit(value) {
    current.nodes['portfolio-password'].value = value;
    current.nodes['portfolio-form'].dispatchEvent({ type: 'submit', preventDefault() {} });
  }
  return { window, document, context, urls, timers, mount, flush, until, submit, session: () => window.MWPortfolioSession,
    waitForFetch: promise => { pendingFetch = promise; }, cleanup: () => cleanups.forEach(fn => fn()) };
}

function decrypt(payload, secret, aad = AAD) {
  const key = pbkdf2Sync(secret, Buffer.from(payload.salt, 'base64'), payload.iterations, 32, 'sha256');
  try {
    const encrypted = Buffer.from(payload.ciphertext, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  } finally { key.fill(0); }
}

try {
  const privateRoot = join(temporary, 'private'), publicRoot = join(temporary, 'site');
  await mkdir(privateRoot);
  await mkdir(publicRoot);
  await writeFile(join(privateRoot, 'note.txt'), 'private attachment sentinel');
  await writeFile(join(privateRoot, 'photo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII=', 'base64'));
  const sections = Object.fromEntries(['work', 'research', 'life', 'archive'].map(id => [id, { description: `Private ${id} description.` }]));
  const fixture = { format: 'mw-archive', version: 1, introduction: 'Private introduction.', sections,
    entries: Object.keys(sections).map((section, index) => ({ id: `e${index}`, section, title: `Private ${section} title`, summary: 'Private summary.', date: 'test period', kind: 'test record',
      metadata: [{ label: 'test', value: 'private metadata' }], blocks: [{ type: 'paragraph', text: '<script>private text, never executable</script>' }] })),
    assets: { note: { file: 'note.txt', name: 'note.txt', type: 'text/plain' }, photo: { file: 'photo.png', name: 'photo.png', type: 'image/png' } },
    editorialSources: 'Must not be published in the bundle.'
  };
  fixture.entries[0].blocks.push({ type: 'heading', text: 'A heading' }, { type: 'list', items: ['A contribution'] }, { type: 'quote', text: 'A private quote', attribution: 'test' },
    { type: 'media', asset: 'note' }, { type: 'gallery', items: [{ asset: 'photo', alt: 'Test image', caption: 'A test caption' }] },
    { type: 'timeline', items: [{ date: 'test date', text: 'private milestone' }] }, { type: 'link', label: 'Source', url: 'https://example.com/paper' });
  const sourcePath = join(privateRoot, 'archive.json');
  await writeFile(sourcePath, JSON.stringify(fixture));
  const bundle = await createArchiveBundle(sourcePath, publicRoot);
  assert.equal(bundle.editorialSources, undefined);
  assert.equal(bundle.assets.note.file, undefined);
  assert.equal(Buffer.from(bundle.assets.note.base64, 'base64').toString(), 'private attachment sentinel');
  const encrypted = encryptArchive(bundle, password);
  assert.deepEqual(JSON.parse(decrypt(encrypted, password)), bundle);
  assert.throws(() => decrypt(encrypted, 'incorrect'));
  assert.throws(() => decrypt(encrypted, password, 'incorrect version binding'));
  const tampered = structuredClone(encrypted);
  const bytes = Buffer.from(tampered.ciphertext, 'base64'); bytes[10] ^= 1; tampered.ciphertext = bytes.toString('base64');
  assert.throws(() => decrypt(tampered, password));
  assert.notEqual(encryptArchive(bundle, password).ciphertext, encrypted.ciphertext);
  assert.ok(!JSON.stringify(encrypted).includes('private attachment sentinel'));
  const invalid = structuredClone(fixture); invalid.entries[0].blocks.push({ type: 'link', label: 'bad', url: 'javascript:alert(1)' });
  assert.throws(() => validateArchive(invalid));
  const missing = structuredClone(fixture); missing.entries[0].blocks.push({ type: 'media', asset: 'missing' });
  assert.throws(() => validateArchive(missing));
  await writeFile(join(publicRoot, 'archive.json'), JSON.stringify(fixture));
  await assert.rejects(createArchiveBundle(join(publicRoot, 'archive.json'), publicRoot), /outside/);
  await writeFile(join(temporary, 'outside.txt'), 'outside');
  const escaping = structuredClone(fixture); escaping.assets.note.file = '../outside.txt';
  await writeFile(join(privateRoot, 'escaping.json'), JSON.stringify(escaping));
  await assert.rejects(createArchiveBundle(join(privateRoot, 'escaping.json'), publicRoot), /inside/);
  console.log('PASS encryption, integrity, randomization, schema, and private-source boundaries');

  const app = await harness(encrypted);
  let view = await app.mount();
  assert.equal(app.session().read(), null);
  assert.equal(view.content.hidden, true);
  assert.equal(view.content.textContent, '');
  app.submit('incorrect');
  await app.until(() => view.nodes['portfolio-message'].textContent.includes('Incorrect password'));
  assert.equal(view.root.dataset.state, 'locked');
  assert.equal(view.nodes['portfolio-password'].disabled, false);
  assert.equal(app.session().read(), null);
  app.submit(password);
  assert.equal(view.nodes['portfolio-password'].value, '');
  await app.until(() => view.root.dataset.state === 'fading');
  assert.equal(view.content.textContent, '', 'No private DOM before the entrance has emptied.');
  await app.flush(380);
  assert.equal(view.root.dataset.state, 'departing');
  assert.equal(view.content.hidden, true);
  await app.flush(2300);
  assert.equal(view.root.dataset.state, 'unlocked');
  assert.ok(view.body.classList.contains('is-portfolio-open'));
  assert.equal(view.content.querySelectorAll('h1')[0].textContent, 'portfolio');
  for (const section of Object.keys(sections)) assert.ok(view.content.querySelectorAll('a').some(anchor => anchor.href === `portfolio-${section}.html`));
  app.window.emit('mw:page-leave', { url: 'http://localhost:8000/portfolio-work.html' });
  view = await app.mount('work');
  assert.equal(view.root.dataset.state, 'unlocked', 'Private navigation retains the in-memory session.');
  assert.equal(view.content.querySelectorAll('h1')[0].textContent, 'work');
  view = await app.mount('entry', '?entry=e0');
  assert.equal(view.content.querySelectorAll('h1')[0].textContent, 'Private work title');
  assert.ok(view.content.textContent.includes('<script>private text, never executable</script>'));
  assert.equal(view.content.querySelectorAll('script').length, 0);
  assert.equal(view.content.querySelectorAll('ol').length, 1);
  assert.ok(view.content.querySelectorAll('img')[0].src.startsWith('blob:'));
  assert.ok(!view.content.querySelectorAll('a').some(anchor => String(anchor.href).startsWith('javascript:')));
  const download = view.content.querySelectorAll('a').find(anchor => anchor.download === 'note.txt');
  assert.equal(await app.urls.get(download.href).text(), 'private attachment sentinel');
  assert.ok(app.urls.size >= 2);
  view.nodes['portfolio-lock'].dispatchEvent({ type: 'click' });
  assert.equal(view.content.hidden, true);
  assert.equal(view.content.textContent, '');
  assert.equal(app.urls.size, 0);
  assert.equal(app.session().read(), null);
  assert.equal(view.root.dataset.state, 'locked');
  console.log('PASS real Web Crypto unlock, retry, entrance sequence, safe rendering, private navigation, attachment decoding, and lock cleanup');

  await app.session().unlock(password);
  app.session().assetUrl('note');
  app.window.emit('mw:page-leave', { url: 'http://localhost:8000/interests.html' });
  assert.equal(app.session().read(), null);
  assert.equal(app.urls.size, 0);
  await app.session().unlock(password);
  app.window.emit('mw:page-leave', { url: 'http://localhost:8000/unrelated/portfolio.html' });
  assert.equal(app.session().read(), null);
  await app.session().unlock(password);
  app.window.emit('pagehide');
  assert.equal(app.session().read(), null, 'Back/forward cache cannot retain an unlocked view.');
  assert.equal(view.content.textContent, '');
  let release;
  app.waitForFetch(new Promise(resolve => { release = resolve; }));
  const pending = app.session().unlock(password);
  app.session().lock();
  release();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(app.session().read(), null);
  app.waitForFetch(null);
  view = await app.mount('life');
  app.submit(password);
  await app.until(() => view.root.dataset.state === 'fading');
  await app.flush(380);
  app.window.emit('mw:page-leave', { url: 'http://localhost:8000/contact.html' });
  app.cleanup();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.content.textContent, '');
  assert.equal(app.session().read(), null);
  assert.equal(app.timers.size, 0, 'Leaving during departure cancels pending animation stages.');
  app.window.matchMedia = () => ({ matches: true });
  view = await app.mount('life');
  app.submit(password);
  await app.until(() => view.root.dataset.state === 'fading');
  await app.flush(100);
  await app.flush(260);
  assert.equal(view.root.dataset.state, 'unlocked', 'Reduced-motion mode uses the short fade sequence.');
  assert.equal(view.content.querySelectorAll('h1')[0].textContent, 'life');
  app.window.emit('pagehide');
  assert.equal(view.content.hidden, true);
  app.cleanup();
  console.log('PASS public-page exit, exact route boundaries, pagehide, late-unlock cancellation, interrupted departure, and reduced motion');

  for (const section of ['portfolio', 'work', 'research', 'life', 'archive', 'entry']) {
    const filename = section === 'portfolio' ? 'portfolio.html' : `portfolio-${section}.html`;
    const html = await source(filename);
    assert.ok(html.includes(`data-portfolio-section="${section}"`));
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /<title>michael w\.<\/title>/);
    assert.ok(html.indexOf('src="portfolio-session.js') < html.indexOf('src="portfolio.js'));
    assert.ok(html.indexOf('src="portfolio-renderer.js') < html.indexOf('src="portfolio.js'));
    assert.doesNotMatch(html, /href="life\.html"/);
    assert.doesNotMatch(html, /life-events|private attachment sentinel/);
  }
  const redirect = await source('life.html');
  assert.match(redirect, /url=portfolio-life\.html/);
  assert.doesNotMatch(redirect, /life-events|<time\b/);
  for (const filename of ['index.html', 'interests.html', 'manifesto.html', 'contact.html']) assert.doesNotMatch(await source(filename), /href="life\.html"/);
  console.log('PASS protected direct-entry shells, public menus, and the legacy Life redirect');
} finally {
  // Only remove the freshly created test directory in the OS temporary folder.
  if (!isWithin(tmpdir(), temporary) || !temporary.includes('mw-archive-check-')) throw new Error('Unexpected test cleanup path.');
  await rm(temporary, { recursive: true, force: true });
}
