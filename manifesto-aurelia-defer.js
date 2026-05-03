(function () {
  'use strict';

  var SRC = 'public/assets/aurelia/aurelia-manifesto.js?v=repo-aurelia-6';

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
