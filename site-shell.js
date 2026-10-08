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
      var pageTarget = this === window || this === document || this === document.body;
      if (pageTarget && token !== activeToken && listener && !listener.__mwPermanent) return;
      nativeAddEventListener.call(this, type, listener, options);

      if (token && listener && !listener.__mwPermanent && (this === window || this === document || this === document.body)) {
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
      addCleanup: function (cleanup, token) {
        token = token || tokenForWork();
        if (token !== activeToken) {
          cleanup();
        } else {
          bucket(token).push(cleanup);
        }
      },
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

  // Decorative work shares a device budget and stops while the page is hidden.
  var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  var pointerPreference = window.matchMedia('(pointer: coarse)');
  var connection = navigator.connection || {};
  var frameTimes = new WeakMap();
  var registeredFrames = new WeakSet();
  var queuedFrames = new WeakSet();
  var suspendedFrames = new Map();
  var performanceProfile = {
    get lowPower() {
      return window.innerWidth < 768 || pointerPreference.matches ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
        (navigator.deviceMemory && navigator.deviceMemory <= 4) || connection.saveData;
    },
    get reducedMotion() { return motionPreference.matches; },
    pixelRatio: function (desktop, mobile) {
      return Math.min(window.devicePixelRatio || 1, this.lowPower ? mobile : desktop);
    },
    isCurrent: function (element, token) {
      return element && element.isConnected && token === lifecycle.getActiveToken();
    },
    debounce: function (callback) {
      var timer;
      return function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(callback, 120);
      };
    },
    refreshFonts: function (callback, token) {
      var refresh = this.debounce(function () {
        if (token === lifecycle.getActiveToken()) callback();
      });
      document.fonts.addEventListener('loadingdone', refresh);
      lifecycle.addCleanup(function () {
        document.fonts.removeEventListener('loadingdone', refresh);
      }, token);
    },
    sampleText: function (context, width, height, x, y, text, fontSize, gap) {
      var halfWidth = context.measureText(text).width / 2 + fontSize * 0.2;
      var left = Math.max(0, Math.floor(x - halfWidth));
      var top = Math.max(0, Math.floor(y - fontSize));
      var sampleWidth = Math.min(width - left, Math.ceil(halfWidth * 2));
      var sampleHeight = Math.min(height - top, Math.ceil(fontSize * 2));
      if (sampleWidth <= 0 || sampleHeight <= 0) return [];
      var pixels = context.getImageData(left, top, sampleWidth, sampleHeight).data;
      var points = [];
      for (var row = 0; row < sampleHeight; row += gap) {
        for (var column = 0; column < sampleWidth; column += gap) {
          var alpha = pixels[(row * sampleWidth + column) * 4 + 3];
          if (alpha > 34) points.push({ x: left + column, y: top + row, alpha: alpha / 255 });
        }
      }
      return points;
    },
    frame: function (callback, token) {
      if (token !== lifecycle.getActiveToken()) return;
      if (queuedFrames.has(callback)) return;
      queuedFrames.add(callback);
      if (!registeredFrames.has(callback)) {
        registeredFrames.add(callback);
        lifecycle.addCleanup(function () {
          suspendedFrames.delete(callback);
          queuedFrames.delete(callback);
        }, token);
      }
      if (document.hidden) {
        suspendedFrames.set(callback, token);
        return;
      }
      lifecycle.run(token, function () {
        window.requestAnimationFrame(function tick(time) {
          if (document.hidden) {
            suspendedFrames.set(callback, token);
            return;
          }
          var interval = 1000 / (performanceProfile.lowPower ? 30 : 60);
          var previous = frameTimes.get(callback);
          if (previous !== undefined && time - previous < interval - 1) {
            window.requestAnimationFrame(tick);
            return;
          }
          frameTimes.set(callback, time);
          queuedFrames.delete(callback);
          callback(time);
        });
      });
    },
    trackRenderer: function (renderer, scenes, token, extraResources) {
      lifecycle.addCleanup(function () {
        (scenes || []).forEach(function (scene) {
          scene.traverse(function (object) {
            if (object.geometry) object.geometry.dispose();
            var materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(function (material) { if (material) material.dispose(); });
          });
        });
        (extraResources || []).forEach(function (resource) { if (resource) resource.dispose(); });
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
      }, token);
    },
  };
  window.MWPerformance = performanceProfile;
  function resumeFrames() {
    if (document.hidden) return;
    var pending = Array.from(suspendedFrames);
    suspendedFrames.clear();
    pending.forEach(function (entry) {
      queuedFrames.delete(entry[0]);
      performanceProfile.frame(entry[0], entry[1]);
    });
  }
  resumeFrames.__mwPermanent = true;
  document.addEventListener('visibilitychange', resumeFrames);

  var SHELL_SCRIPT = /(?:^|\/)site-shell\.js(?:\?|#|$)/;
  var PLAYER_SCRIPT = /(?:^|\/)player\.js(?:\?|#|$)/;
  var navigating = false;
  var currentUrl = new URL(window.location.href);
  var persistentPlayer = null;
  var resourceCache = new Map();

  function fetchText(url) {
    if (resourceCache.has(url)) return resourceCache.get(url);
    var request = fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) throw new Error('Could not load ' + url);
      return response.text();
    }).catch(function (error) {
      resourceCache.delete(url);
      throw error;
    });
    resourceCache.set(url, request);
    if (resourceCache.size > 24) resourceCache.delete(resourceCache.keys().next().value);
    return request;
  }

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

  function hideTransition() {
    window.setTimeout(function () {
      document.documentElement.classList.remove('is-page-transitioning');
    }, 40);
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

      return fetchText(absoluteUrl.href).then(function (code) {
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

    // Fetch independent scripts together, then preserve their execution order.
    scripts.forEach(function (script) {
      var src = script.getAttribute('src');
      if (src && new URL(src, window.location.href).origin === window.location.origin) {
        fetchText(new URL(src, window.location.href).href).catch(function () {});
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
    return fetchText(url.href)
      .then(function (html) {
        var nextDocument = new DOMParser().parseFromString(html, 'text/html');
        var token = lifecycle.next();

        syncHead(nextDocument);
        rebuildBody(nextDocument);
        document.documentElement.classList.remove('shader-ready', 'aurelia-unavailable', 'is-page-transitioning');
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

    if (event.defaultPrevented || event.button !== 0 || !isInternalPageLink(anchor) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    var url = new URL(anchor.getAttribute('href'), window.location.href);

    event.preventDefault();
    navigate(url);
  }

  onClick.__mwPermanent = true;
  window.addEventListener('click', onClick);

  function prefetchIntent(event) {
    if (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || '')) return;
    var anchor = event.target.closest && event.target.closest('a');
    if (!isInternalPageLink(anchor)) return;
    var url = new URL(anchor.href);
    if (samePageUrl(url)) return;
    fetchText(url.href).then(function (html) {
      var page = new DOMParser().parseFromString(html, 'text/html');
      Array.from(page.querySelectorAll('script[src]')).forEach(function (script) {
        var src = new URL(script.getAttribute('src'), url);
        if (src.origin === url.origin && !SHELL_SCRIPT.test(src.href) && !PLAYER_SCRIPT.test(src.href)) {
          fetchText(src.href).catch(function () {});
        }
      });
    }).catch(function () {});
  }
  prefetchIntent.__mwPermanent = true;
  document.addEventListener('pointerover', prefetchIntent, { passive: true });
  document.addEventListener('focusin', prefetchIntent);

  var onPopState = function () {
    navigate(new URL(window.location.href), { history: true });
  };

  onPopState.__mwPermanent = true;
  window.addEventListener('popstate', onPopState);

  window.MWSiteShell = {
    navigate: navigate,
  };
}());
