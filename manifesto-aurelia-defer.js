(function () {
  'use strict';

  var SRC = 'public/assets/aurelia/aurelia-manifesto.js?v=repo-aurelia-6';

  function revealManifestoBackdropWhenReady() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('manifesto-backdrop-revealed');
      return;
    }

    var root = document.getElementById('manifesto-aurelia');

    if (!root) {
      return;
    }

    var revealed = false;

    function reveal() {
      if (revealed) {
        return;
      }

      revealed = true;
      document.body.classList.add('manifesto-backdrop-revealed');
    }

    if (root.querySelector('canvas')) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(reveal);
      });
      return;
    }

    var observer = new MutationObserver(function () {
      if (root.querySelector('canvas')) {
        observer.disconnect();
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(reveal);
        });
      }
    });

    observer.observe(root, { childList: true, subtree: true });

    window.setTimeout(function () {
      observer.disconnect();
      reveal();
    }, 12000);
  }

  function inject() {
    var lifecycle = window.MWPageLifecycle;
    var url = new URL(SRC, window.location.href).href;

    fetch(url, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Could not load ' + url);
        }
        return response.text();
      })
      .then(function (code) {
        function run() {
          (new Function(code + '\n//# sourceURL=' + url))();
        }

        if (lifecycle && typeof lifecycle.run === 'function' && typeof lifecycle.getActiveToken === 'function') {
          lifecycle.run(lifecycle.getActiveToken(), run);
        } else {
          run();
        }

        revealManifestoBackdropWhenReady();
      })
      .catch(function (error) {
        console.error('Aurelia bundle failed to load.', error);
      });
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(
      function () {
        inject();
      },
      { timeout: 2800 },
    );
  } else {
    window.setTimeout(inject, 150);
  }
}());
