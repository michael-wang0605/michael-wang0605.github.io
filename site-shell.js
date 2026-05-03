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

      if (token && !listener.__mwPermanent && (this === window || this === document || this === document.body)) {
        var target = this;
        bucket(token).push(function () {
          nativeRemoveEventListener.call(target, type, listener, options);
        });
      }
    };

    window.requestAnimationFrame = function (callback) {
      var token = tokenForWork();

      return nativeRequestAnimationFrame(function (time) {
        if (token !== activeToken) {
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
        if (token !== activeToken) {
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
        if (token !== activeToken) {
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

  var TRANSITION_MS = 520;
  var SHELL_SCRIPT = /(?:^|\/)site-shell\.js(?:\?|#|$)/;
  var PLAYER_SCRIPT = /(?:^|\/)player\.js(?:\?|#|$)/;
  var navigating = false;
  var currentUrl = new URL(window.location.href);
  var persistentPlayer = null;

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

  function showTransition() {
    document.documentElement.classList.add('is-page-transitioning');
  }

  function hideTransition() {
    window.setTimeout(function () {
      document.documentElement.classList.remove('is-page-transitioning');
    }, 120);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function syncHead(nextDocument) {
    document.title = nextDocument.title;

    Array.prototype.forEach.call(nextDocument.head.querySelectorAll('link[rel="stylesheet"]'), function (link) {
      var href = link.getAttribute('href');

      if (!href || document.head.querySelector('link[rel="stylesheet"][href="' + href + '"]')) {
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
    document.body.replaceChildren(fragment);

    if (persistentPlayer) {
      document.body.appendChild(persistentPlayer);
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

      moduleUrl += (moduleUrl.indexOf('?') === -1 ? '?' : '&') + 'mw_nav=' + token;
      return import(moduleUrl).finally(function () {
        if (!src) {
          URL.revokeObjectURL(moduleUrl);
        }
      });
    }

    if (src) {
      var absoluteUrl = new URL(src, window.location.href);

      if (absoluteUrl.origin !== window.location.origin) {
        return new Promise(function (resolve, reject) {
          var externalScript = document.createElement('script');
          externalScript.src = absoluteUrl.href;
          externalScript.onload = resolve;
          externalScript.onerror = reject;
          document.head.appendChild(externalScript);
        });
      }

      return fetch(absoluteUrl.href)
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Could not load ' + absoluteUrl.href);
          }
          return response.text();
        })
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
    showTransition();

    return Promise.all([
      fetch(url.href, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) {
          throw new Error('Could not load ' + url.href);
        }
        return response.text();
      }),
      wait(TRANSITION_MS),
    ])
      .then(function (results) {
        var nextDocument = new DOMParser().parseFromString(results[0], 'text/html');
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
        hideTransition();
      });
  }

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
    navigate(new URL(window.location.href), { history: true });
  };

  onPopState.__mwPermanent = true;
  window.addEventListener('popstate', onPopState);

  window.MWSiteShell = {
    navigate: navigate,
  };
}());
