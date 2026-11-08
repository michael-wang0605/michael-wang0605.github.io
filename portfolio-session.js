(() => {
  'use strict';
  if (window.MWPortfolioSession) {
    window.MWPortfolioSession.preparePage();
    return;
  }
  const pages = new Set(['portfolio.html', 'portfolio-work.html', 'portfolio-research.html', 'portfolio-life.html', 'portfolio-archive.html', 'portfolio-entry.html'].map(page => new URL(page, window.location.href).pathname));
  const assetTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf', 'application/octet-stream', 'text/plain', 'text/markdown', 'text/csv', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'video/mp4', 'video/webm']);
  let data = null, generation = 0;
  const urls = new Map();
  const bytes = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
  const encoder = new TextEncoder();

  function releaseAssets() {
    urls.forEach(url => URL.revokeObjectURL(url));
    urls.clear();
  }

  function lock() {
    generation += 1;
    data = null;
    releaseAssets();
    document.dispatchEvent(new CustomEvent('mw:portfolio-locked'));
  }

  function check(signal, token) {
    if (signal?.aborted || token !== generation) throw new DOMException('Unlock cancelled.', 'AbortError');
  }

  async function unlock(password, signal) {
    const token = ++generation;
    data = null;
    releaseAssets();
    const response = await fetch('public/assets/portfolio.enc.json', { cache: 'no-store', signal });
    if (!response.ok) throw new Error('The collection could not be loaded. Please try again.');
    const payload = await response.json();
    check(signal, token);
    if (payload.version !== 2 || payload.iterations !== 600000) throw new Error('This collection needs to be updated before it can be opened.');
    const salt = bytes(payload.salt), iv = bytes(payload.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('The collection could not be read.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    password = '';
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: payload.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    check(signal, token);
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('michael-w-archive-v2'), tagLength: 128 }, key, bytes(payload.ciphertext));
    } catch (error) {
      if (error.name === 'OperationError') {
        const incorrect = new Error('Incorrect password. Try again.');
        incorrect.name = 'IncorrectPassword';
        throw incorrect;
      }
      throw error;
    }
    let collection;
    try {
      check(signal, token);
      collection = JSON.parse(new TextDecoder().decode(plaintext));
    } finally {
      new Uint8Array(plaintext).fill(0);
    }
    if (collection.format !== 'mw-archive' || collection.version !== 1 || !Array.isArray(collection.entries) || !['work', 'research', 'life', 'archive'].every(id => collection.sections?.[id])) throw new Error('The collection could not be read.');
    for (const asset of Object.values(collection.assets || {})) {
      if (!assetTypes.has(asset.type) || typeof asset.base64 !== 'string' || typeof asset.name !== 'string') throw new Error('The collection contains an unsupported attachment.');
    }
    check(signal, token);
    data = collection;
    return collection;
  }

  function assetUrl(id) {
    if (!data || !Object.hasOwn(data.assets || {}, id)) throw new Error('Attachment unavailable.');
    if (!urls.has(id)) {
      const asset = data.assets[id];
      urls.set(id, URL.createObjectURL(new Blob([bytes(asset.base64)], { type: asset.type })));
    }
    return urls.get(id);
  }

  function preparePage() {
    if (data) document.body.classList.add('is-portfolio-departing', 'is-portfolio-empty');
  }

  const onLeave = event => {
    const url = new URL(event.detail.url, window.location.href);
    if (url.origin !== window.location.origin || !pages.has(url.pathname)) lock();
  };
  const onHide = () => lock();
  onLeave.__mwPermanent = onHide.__mwPermanent = true;
  window.addEventListener('mw:page-leave', onLeave);
  window.addEventListener('pagehide', onHide);
  window.MWPortfolioSession = Object.freeze({ unlock, lock, assetUrl, releaseAssets, preparePage, read: () => data });
})();
