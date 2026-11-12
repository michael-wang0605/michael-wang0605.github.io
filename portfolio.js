(() => {
  'use strict';
  const root = document.getElementById('portfolio-root');
  if (!root) return;
  const session = window.MWPortfolioSession;
  const form = document.getElementById('portfolio-form');
  const input = document.getElementById('portfolio-password');
  const submit = document.getElementById('portfolio-submit');
  const message = document.getElementById('portfolio-message');
  const content = document.getElementById('portfolio-content');
  const lock = document.getElementById('portfolio-lock');
  const cv = document.getElementById('portfolio-cv');
  const heading = document.querySelector('.portfolio-fallback-title');
  const main = document.querySelector('.portfolio-main');
  let section = root.dataset.portfolioSection || 'portfolio';
  let entryId = new URL(window.location.href).searchParams.get('entry');
  let currentUrl = new URL(window.location.href);
  const routes = new Map(['portfolio', 'work', 'research', 'side-quests', 'life', 'archive', 'entry'].map(id => [
    new URL(id === 'portfolio' ? 'portfolio.html' : `portfolio-${id}.html`, currentUrl).pathname, id,
  ]));
  const scrollPositions = new Map();
  let previousScrollRestoration = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let busy = false, destroyed = false, attempt = 0, controller = null, disposeView = null;
  const isCurrent = () => !destroyed && root.isConnected;

  function releaseHistory() {
    if (previousScrollRestoration === null) return;
    window.history.scrollRestoration = previousScrollRestoration;
    previousScrollRestoration = null;
  }

  function pause(duration, signal) {
    return new Promise(resolve => {
      if (signal.aborted) return resolve();
      const finish = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = window.setTimeout(finish, duration);
      signal.addEventListener('abort', finish, { once: true });
    });
  }

  function forgetView() {
    attempt += 1;
    controller?.abort();
    controller = null;
    input.value = '';
    input.removeAttribute('aria-invalid');
    disposeView?.();
    disposeView = null;
    content.replaceChildren();
    content.hidden = true;
    session.releaseAssets();
  }

  function resetScene() {
    const restore = document.body.classList.contains('is-portfolio-departing');
    document.body.classList.remove('is-portfolio-open', 'is-portfolio-departing', 'is-portfolio-empty');
    if (heading) heading.hidden = false;
    if (restore) document.dispatchEvent(new CustomEvent('mw:portfolio-reset'));
  }

  function start() {
    if (!isCurrent()) return;
    releaseHistory();
    forgetView();
    busy = false;
    form.hidden = false;
    lock.hidden = true;
    if (cv) {
      cv.hidden = true;
      cv.removeAttribute('href');
    }
    root.dataset.state = 'locked';
    root.setAttribute('aria-label', 'Private portfolio');
    resetScene();
    main.scrollTop = 0;
    message.textContent = '';
    form.setAttribute('aria-busy', 'false');
    input.disabled = submit.disabled = !window.crypto?.subtle;
    if (input.disabled) message.textContent = 'Use HTTPS or localhost to open the collection.';
  }

  function reveal() {
    const data = session.read();
    if (!data || !isCurrent()) return;
    if (previousScrollRestoration === null && window.history && 'scrollRestoration' in window.history) {
      previousScrollRestoration = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
    }
    document.body.classList.add('is-portfolio-open', 'is-portfolio-empty', 'is-portfolio-departing');
    if (heading) heading.hidden = true;
    form.hidden = true;
    root.dataset.state = 'unlocked';
    root.setAttribute('aria-label', 'Portfolio collection');
    content.hidden = false;
    if (cv) {
      cv.setAttribute('href', 'michael-wang-cv.pdf');
      cv.hidden = false;
    }
    disposeView = window.MWPortfolioRenderer.render(content, data, { section, entryId, assetUrl: session.assetUrl, lockButton: lock });
    main.scrollTop = 0;
    message.textContent = '';
    content.focus({ preventScroll: true });
  }

  function showRoute(url, fromHistory = false) {
    if (!session.read() || !isCurrent()) return;
    const previous = currentUrl.pathname + currentUrl.search;
    const destination = url.pathname + url.search;
    if (previous === destination) {
      if (!fromHistory) main.scrollTop = 0;
      currentUrl = url;
      window.MWSiteShell?.syncUrl?.();
      return;
    }
    scrollPositions.set(previous, main.scrollTop);
    disposeView?.();
    disposeView = null;
    session.releaseAssets();
    section = routes.get(url.pathname);
    entryId = url.searchParams.get('entry');
    root.dataset.portfolioSection = section;
    if (!fromHistory) window.history.pushState(null, '', url.href);
    currentUrl = url;
    window.MWSiteShell?.syncUrl?.();
    // Render synchronously in the existing page. No locked shell, GPU restart,
    // empty animation frame, or full-body replacement between private views.
    reveal();
    main.scrollTop = fromHistory ? scrollPositions.get(destination) || 0 : 0;
    if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
  }

  function onPortfolioClick(event) {
    if (!session.read() || !isCurrent() || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !routes.has(url.pathname)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showRoute(url);
  }

  function onPortfolioPop() {
    const url = new URL(window.location.href);
    if (!session.read() || !isCurrent() || !routes.has(url.pathname)) return false;
    showRoute(url, true);
    return true;
  }

  async function authenticate() {
    if (busy || !input.value || !window.crypto?.subtle) return;
    const currentAttempt = ++attempt;
    let password = input.value;
    input.value = '';
    busy = true;
    form.setAttribute('aria-busy', 'true');
    input.disabled = submit.disabled = true;
    controller = new AbortController();
    const signal = controller.signal;
    root.dataset.state = 'busy';
    message.textContent = 'Unlocking…';
    try {
      const unlocking = session.unlock(password, signal);
      password = '';
      await unlocking;
      if (!isCurrent() || currentAttempt !== attempt) return;
      root.dataset.state = 'fading';
      message.textContent = '';
      input.blur();
      await pause(reducedMotion.matches ? 100 : 380, signal);
      if (!isCurrent() || currentAttempt !== attempt) return;
      form.hidden = true;
      root.dataset.state = 'departing';
      const duration = reducedMotion.matches ? 160 : 2200;
      document.body.classList.add('is-portfolio-departing');
      document.dispatchEvent(new CustomEvent('mw:portfolio-dismiss', { detail: { duration, startedAt: performance.now() } }));
      await pause(duration + 100, signal);
      if (!isCurrent() || currentAttempt !== attempt) return;
      reveal();
    } catch (error) {
      if (!isCurrent() || currentAttempt !== attempt || error.name === 'AbortError') return;
      // A rendering or format failure must not leave a partially open session.
      session.lock();
      message.textContent = error.name === 'IncorrectPassword'
        ? 'Incorrect password. Try again.'
        : 'Unable to open the collection. Please try again.';
      if (error.name === 'IncorrectPassword') input.setAttribute('aria-invalid', 'true');
      input.focus({ preventScroll: true });
    } finally {
      password = '';
      if (isCurrent() && currentAttempt === attempt) {
        busy = false;
        controller = null;
        form.setAttribute('aria-busy', 'false');
        input.disabled = submit.disabled = false;
      }
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); authenticate(); });
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
  lock.addEventListener('click', () => { session.lock(); input.focus({ preventScroll: true }); });
  document.addEventListener('mw:portfolio-locked', start);
  document.addEventListener('click', onPortfolioClick, true);
  const navigation = Object.freeze({ handlePopState: onPortfolioPop });
  window.MWPortfolioNavigation = navigation;
  window.MWPageLifecycle.addCleanup(() => {
    destroyed = true;
    releaseHistory();
    document.removeEventListener('mw:portfolio-locked', start);
    document.removeEventListener('click', onPortfolioClick, true);
    if (window.MWPortfolioNavigation === navigation) delete window.MWPortfolioNavigation;
    forgetView();
    document.body.classList.remove('is-portfolio-open', 'is-portfolio-departing', 'is-portfolio-empty');
    // Also close on public navigation through an older, already-open site shell.
    queueMicrotask(() => {
      if (!document.getElementById('portfolio-root')) session.lock();
    });
  });
  if (session.read()) reveal();
  else start();
})();
