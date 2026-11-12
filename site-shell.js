(function () {
  'use strict';

  var lifecycle = window.MWPageLifecycle;

  if (!lifecycle) {
    var nativeAddEventListener = EventTarget.prototype.addEventListener;
    var nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
    var nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    var nativeSetTimeout = window.setTimeout.bind(window);
    var nativeSetInterval = window.setInterval.bind(window);
    var nativeClearInterval = window.clearInterval.bind(window);
    var activeToken = 1;
    var executingToken = activeToken;
    var cleanups = new Map();

    function bucket(token) {
      if (!cleanups.has(token)) {
        cleanups.set(token, []);
      }
      return cleanups.get(token);
    }

    function tokenForWork() {
      return executingToken || activeToken;
    }

    function runWithToken(token, callback) {
      var previousToken = executingToken;
      executingToken = token;
      try {
        return callback();
      } finally {
        executingToken = previousToken;
      }
    }

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      var token = tokenForWork();
      nativeAddEventListener.call(this, type, listener, options);

      if (token !== -1 && token && !listener.__mwPermanent && (this === window || this === document || this === document.body)) {
        var target = this;
        bucket(token).push(function () {
          nativeRemoveEventListener.call(target, type, listener, options);
        });
      }
    };

    window.requestAnimationFrame = function (callback) {
      var token = tokenForWork();

      return nativeRequestAnimationFrame(function (time) {
        if (token !== -1 && token !== activeToken) {
          return;
        }

        runWithToken(token, function () {
          callback(time);
        });
      });
    };

    window.setTimeout = function (callback, delay) {
      var token = tokenForWork();
      var args = Array.prototype.slice.call(arguments, 2);

      return nativeSetTimeout(function () {
        if (token !== -1 && token !== activeToken) {
          return;
        }

        runWithToken(token, function () {
          callback.apply(window, args);
        });
      }, delay);
    };

    window.setInterval = function (callback, delay) {
      var token = tokenForWork();
      var args = Array.prototype.slice.call(arguments, 2);
      var id = nativeSetInterval(function () {
        if (token !== -1 && token !== activeToken) {
          nativeClearInterval(id);
          return;
        }

        runWithToken(token, function () {
          callback.apply(window, args);
        });
      }, delay);

      bucket(token).push(function () {
        nativeClearInterval(id);
      });

      return id;
    };

    lifecycle = {
      getActiveToken: function () {
        return activeToken;
      },
      run: runWithToken,
      addCleanup: function (cleanup, token) {
        token = token || tokenForWork();
        if (token !== activeToken) {
          cleanup();
        } else {
          bucket(token).push(cleanup);
        }
      },
      yield: function () {
        return new Promise(function (resolve) {
          nativeSetTimeout(resolve, 0);
        });
      },
      next: function () {
        var oldToken = activeToken;
        var oldCleanups = cleanups.get(oldToken) || [];

        oldCleanups.forEach(function (cleanup) {
          try {
            cleanup();
          } catch (error) {
            console.warn('Page cleanup failed.', error);
          }
        });

        cleanups.delete(oldToken);
        activeToken += 1;
        executingToken = activeToken;
        return activeToken;
      },
      settle: function () {
        executingToken = null;
      },
    };

    window.MWPageLifecycle = lifecycle;
    // Background preparation survives a soft navigation. Keep its scheduling
    // separate from the timers/frames cancelled with each page's lifecycle.
    lifecycle.backgroundFrame = nativeRequestAnimationFrame;
    lifecycle.backgroundDelay = nativeSetTimeout;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        lifecycle.settle();
      }, { once: true });
    } else {
      lifecycle.settle();
    }
  }

  if (window.MWSiteShell) {
    return;
  }

  var SHELL_SCRIPT = /(?:^|\/)site-shell\.js(?:\?|#|$)/;
  var PLAYER_SCRIPT = /(?:^|\/)player\.js(?:\?|#|$)/;
  var navigating = false;
  var currentUrl = new URL(window.location.href);
  var persistentPlayer = null;
  var scriptSources = new Map();
  var externalScripts = new Map();
  var pageRequests = new Map();
  var backgrounds = new Map();
  var backgroundScripts = {
      'interests.html': ['interests', 'interest-background.js?v=cursor-orbit'],
    'contact.html': ['contact', 'contact-background.js?v=background-warmup'],
    'manifesto.html': ['manifesto', 'manifesto-runtime.js?v=aurelia-frame-clock'],
  };

  function prepareBackground(name) {
    var entry = backgrounds.get(name);
    if (!entry) {
      entry = {};
      backgrounds.set(name, entry);
    }
    if (entry.instance && entry.instance.isUsable && !entry.instance.isUsable()) {
      entry.promise = null;
      entry.instance = null;
    }
    if (!entry.promise) {
      entry.promise = Promise.resolve().then(function () {
        if (entry.factory) return;
        var source = Object.values(backgroundScripts).find(function (item) { return item[0] === name; });
        return loadScriptSource(new URL(source[1], window.location.href).href).then(function (code) {
          Function('mwPreload', code)(true);
        });
      }).then(function () {
        return entry.factory();
      }).then(function (instance) {
        entry.instance = instance;
        return instance;
      }).catch(function (error) {
        entry.promise = null;
        throw error;
      });
    }
    return entry.promise;
  }

  var backgroundRuntime = {
    define: function (name, factory) {
      var entry = backgrounds.get(name) || {};
      if (!entry.factory) entry.factory = factory;
      backgrounds.set(name, entry);
    },
    prepare: prepareBackground,
    // Token -1 identifies reusable GPU work, independent of a page's lifetime.
    run: function (callback) { return lifecycle.run(-1, callback); },
    frame: function (callback) {
      return lifecycle.backgroundFrame(function (time) { lifecycle.run(-1, function () { callback(time); }); });
    },
    delay: function (ms) {
      return new Promise(function (resolve) { lifecycle.backgroundDelay(resolve, ms); });
    },
    mount: function (name, placeholder, ready) {
      var token = lifecycle.getActiveToken();
      prepareBackground(name).then(async function (instance) {
        if (ready) await ready;
        if (!placeholder.isConnected || lifecycle.getActiveToken() !== token) return;
        var stop = instance.start(placeholder);
        lifecycle.addCleanup(stop, token);
      }).catch(function (error) {
        console.warn(name + ' background failed.', error);
      });
    },
  };
  window.MWBackgrounds = backgroundRuntime;

  function prefetchBackground(url) {
    var config = backgroundScripts[url.pathname.split('/').pop()];
    if (!config) return Promise.resolve();
    return loadPage(url).then(function (html) {
      var page = new DOMParser().parseFromString(html, 'text/html');
      var scripts = Array.from(page.body.querySelectorAll('script[src]')).filter(function (script) {
        var src = script.getAttribute('src');
        return !SHELL_SCRIPT.test(src) && !PLAYER_SCRIPT.test(src) &&
          new URL(src, url).origin === url.origin;
      });
      return Promise.all(scripts.map(function (script) {
        return loadScriptSource(new URL(script.getAttribute('src'), url).href);
      }));
    }).then(function () { return prepareBackground(config[0]); });
  }

  function canWarmBackgrounds() {
    var connection = navigator.connection;
    return !document.hidden && !(connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType)));
  }

  async function warmBackgrounds() {
    // Let the homepage's title and wireframe settle before using spare GPU time.
    await backgroundRuntime.delay(2200);
    // Finish the lighter scenes before the more expensive ray-marched shader.
    for (var filename of ['contact.html', 'manifesto.html', 'interests.html']) {
      if (!canWarmBackgrounds()) return;
      await new Promise(function (resolve) {
        if (window.requestIdleCallback) window.requestIdleCallback(resolve, { timeout: 2000 });
        else lifecycle.backgroundDelay(resolve, 200);
      });
      if (!canWarmBackgrounds()) return;
      try {
        await prefetchBackground(new URL(filename, window.location.href));
      } catch (error) {
        // A failed speculative request can be retried when the page is opened.
      }
      await backgroundRuntime.delay(1200);
    }
  }

  var startWarmup = function () { warmBackgrounds(); };
  startWarmup.__mwPermanent = true;
  if (document.readyState === 'complete') startWarmup();
  else window.addEventListener('load', startWarmup, { once: true });
  var resumeWarmup = function () { if (canWarmBackgrounds()) warmBackgrounds(); };
  resumeWarmup.__mwPermanent = true;
  document.addEventListener('visibilitychange', resumeWarmup);

  function samePageUrl(url) {
    return url.origin === window.location.origin &&
      url.pathname === currentUrl.pathname &&
      url.search === currentUrl.search;
  }

  function isInternalPageLink(anchor) {
    if (!anchor || anchor.target || anchor.hasAttribute('download')) {
      return false;
    }

    var href = anchor.getAttribute('href');

    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) {
      return false;
    }

    var url = new URL(href, window.location.href);
    var filename = url.pathname.split('/').pop();
    var extension = filename.indexOf('.') === -1 ? '' : filename.split('.').pop().toLowerCase();

    return url.origin === window.location.origin && (extension === 'html' || extension === '');
  }

  function loadScriptSource(url) {
    if (!scriptSources.has(url)) {
      var request = fetch(url).then(function (response) {
        if (!response.ok) throw new Error('Could not load ' + url);
        return response.text();
      }).catch(function (error) {
        scriptSources.delete(url);
        throw error;
      });
      scriptSources.set(url, request);
    }
    return scriptSources.get(url);
  }

  function loadPage(url) {
    if (!pageRequests.has(url.href)) {
      // Revalidate HTML so soft navigation cannot restore an older page from
      // the browser cache after a deployment or local edit.
      var request = fetch(url.href, { credentials: 'same-origin', cache: 'no-cache' }).then(function (response) {
        if (!response.ok) throw new Error('Could not load ' + url.href);
        return response.text();
      }).catch(function (error) {
        pageRequests.delete(url.href);
        throw error;
      });
      pageRequests.set(url.href, request);
    }
    return pageRequests.get(url.href);
  }

  function syncHead(nextDocument) {
    document.title = nextDocument.title;

    Array.prototype.forEach.call(nextDocument.head.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"], link[rel="preconnect"]'), function (link) {
      var href = link.getAttribute('href');
      var rel = link.getAttribute('rel');

      if (!href || document.head.querySelector('link[rel="' + rel + '"][href="' + href + '"]')) {
        return;
      }

      document.head.appendChild(link.cloneNode(true));
    });
  }

  function removePageScripts(fragment) {
    Array.prototype.forEach.call(fragment.querySelectorAll('script'), function (script) {
      var src = script.getAttribute('src') || '';

      if (SHELL_SCRIPT.test(src) || PLAYER_SCRIPT.test(src)) {
        script.remove();
      }
    });
  }

  function keepPersistentPlayer(nextBody) {
    var incomingPlayer = nextBody.querySelector('.turntable-fixed');

    if (!persistentPlayer) {
      persistentPlayer = document.querySelector('.turntable-fixed');
    }

    if (incomingPlayer) {
      incomingPlayer.remove();
    }
  }

  function rebuildBody(nextDocument) {
    var nextBody = nextDocument.body;
    var fragment = document.createDocumentFragment();

    keepPersistentPlayer(nextBody);
    removePageScripts(nextBody);

    Array.prototype.forEach.call(nextBody.childNodes, function (node) {
      fragment.appendChild(document.importNode(node, true));
    });

    document.body.className = nextBody.className;
    // Keep the audio connected: detaching it can pause playback in the browser.
    Array.from(document.body.childNodes).forEach(function (node) {
      if (node !== persistentPlayer) node.remove();
    });
    document.body.insertBefore(fragment, persistentPlayer);

    if (window.MWAudioPlayer) {
      window.MWAudioPlayer.syncControls();
    }
  }

  function executeScript(script, token) {
    var src = script.getAttribute('src');
    var type = (script.getAttribute('type') || '').toLowerCase();

    if (src && (SHELL_SCRIPT.test(src) || PLAYER_SCRIPT.test(src))) {
      return Promise.resolve();
    }

    if (type === 'module') {
      var moduleUrl = src ? new URL(src, window.location.href).href : URL.createObjectURL(new Blob([script.textContent], {
        type: 'text/javascript',
      }));

      // Vendor modules define shared custom elements and must load only once.
      // Local page modules still need to execute for each navigation.
      if (src && !script.hasAttribute('data-load-once') && new URL(moduleUrl).origin === window.location.origin) {
        moduleUrl += (moduleUrl.indexOf('?') === -1 ? '?' : '&') + 'mw_nav=' + token;
      }
      return import(moduleUrl).finally(function () {
        if (!src) {
          URL.revokeObjectURL(moduleUrl);
        }
      });
    }

    if (src) {
      var absoluteUrl = new URL(src, window.location.href);

      if (absoluteUrl.origin !== window.location.origin) {
        if (window.katex && absoluteUrl.pathname.endsWith('/katex.min.js')) return Promise.resolve();
        if (externalScripts.has(absoluteUrl.href)) return externalScripts.get(absoluteUrl.href);
        var request = new Promise(function (resolve, reject) {
          var externalScript = document.createElement('script');
          externalScript.src = absoluteUrl.href;
          externalScript.onload = resolve;
          externalScript.onerror = function (error) {
            externalScripts.delete(absoluteUrl.href);
            externalScript.remove();
            reject(error);
          };
          document.head.appendChild(externalScript);
        });
        externalScripts.set(absoluteUrl.href, request);
        return request;
      }

      return loadScriptSource(absoluteUrl.href)
        .then(function (code) {
          lifecycle.run(token, function () {
            Function(code + '\n//# sourceURL=' + absoluteUrl.href)();
          });
        });
    }

    return Promise.resolve().then(function () {
      lifecycle.run(token, function () {
        Function(script.textContent)();
      });
    });
  }

  function runPageScripts(nextDocument, token) {
    var scripts = Array.prototype.filter.call(nextDocument.body.querySelectorAll('script'), function (script) {
      var src = script.getAttribute('src') || '';
      return !SHELL_SCRIPT.test(src) && !PLAYER_SCRIPT.test(src);
    });

    // Download independent files together, then execute in document order.
    scripts.forEach(function (script) {
      var src = script.getAttribute('src');
      if (!src || script.type === 'module') return;
      var url = new URL(src, window.location.href);
      if (url.origin === window.location.origin) {
        loadScriptSource(url.href).catch(function () {});
      }
    });

    return scripts.reduce(function (chain, script) {
      return chain.then(function () {
        return executeScript(script, token);
      });
    }, Promise.resolve());
  }

  function navigate(url, options) {
    if (navigating || samePageUrl(url)) {
      if (url.hash) {
        history.replaceState(null, '', url.href);
      }
      return Promise.resolve();
    }

    navigating = true;

    return loadPage(url)
      .then(function (html) {
        var nextDocument = new DOMParser().parseFromString(html, 'text/html');
        window.dispatchEvent(new CustomEvent('mw:page-leave', { detail: { url: url.href } }));
        var token = lifecycle.next();

        syncHead(nextDocument);
        rebuildBody(nextDocument);
        currentUrl = new URL(url.href);

        if (!options || !options.history) {
          history.pushState(null, '', url.href);
        }

        window.scrollTo(0, 0);
        return runPageScripts(nextDocument, token).then(function () {
          lifecycle.settle();
        });
      })
      .catch(function (error) {
        console.warn('Soft navigation failed; falling back to a full page load.', error);
        window.location.href = url.href;
      })
      .finally(function () {
        navigating = false;
      });
  }

  function onLinkIntent(event) {
    var anchor = event.target.closest && event.target.closest('a');
    if (!isInternalPageLink(anchor)) return;
    var url = new URL(anchor.getAttribute('href'), window.location.href);
    if (!samePageUrl(url)) {
      loadPage(url).catch(function () {});
      if (canWarmBackgrounds()) prefetchBackground(url).catch(function () {});
    }
  }

  onLinkIntent.__mwPermanent = true;
  window.addEventListener('pointerover', onLinkIntent);
  window.addEventListener('focusin', onLinkIntent);

  function onClick(event) {
    var anchor = event.target.closest && event.target.closest('a');

    if (!isInternalPageLink(anchor) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    var url = new URL(anchor.getAttribute('href'), window.location.href);

    event.preventDefault();
    navigate(url);
  }

  onClick.__mwPermanent = true;
  window.addEventListener('click', onClick);

  var onPopState = function () {
    // An unlocked portfolio can switch its own views without rebuilding the shell.
    if (window.MWPortfolioNavigation && window.MWPortfolioNavigation.handlePopState()) return;
    navigate(new URL(window.location.href), { history: true });
  };

  onPopState.__mwPermanent = true;
  window.addEventListener('popstate', onPopState);

  window.MWSiteShell = {
    navigate: navigate,
    loadScriptSource: loadScriptSource,
    syncUrl: function () { currentUrl = new URL(window.location.href); },
  };
}());
