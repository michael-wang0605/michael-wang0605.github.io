(function () {
  'use strict';

  var KEY = 'mw_audio';
  var SESSION_PAUSED_KEY = 'mw_audio_paused_this_visit';
  var STATE_UNKNOWN = 'unknown';
  var audio = document.getElementById('player-audio');
  var btnPlay = document.getElementById('btn-playpause');
  var btnRewind = document.getElementById('btn-rewind');
  var btnForward = document.getElementById('btn-forward');
  var volSlider = document.getElementById('vol-slider');
  var label = document.getElementById('label');
  var turntableBtn = document.getElementById('button');

  if (!audio) return;
  if (window.MWAudioPlayer && window.MWAudioPlayer.audio === audio) return;

  if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
    audio.autoplay = false;
    audio.removeAttribute('autoplay');
    audio.pause();

    window.MWAudioPlayer = {
      audio: audio,
      save: function () {},
      getState: function () {
        return 'paused';
      },
    };

    return;
  }

  var saved = {};
  var autoplayBlocked = false;
  var hasSyncedStartTime = false;

  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}

  var shouldAutoplay = sessionStorage.getItem(SESSION_PAUSED_KEY) !== '1';
  var targetTime = saved.position || 0;

  if (shouldAutoplay && saved.timestamp) {
    targetTime += (Date.now() - saved.timestamp) / 1000;
  }

  audio.autoplay = true;

  if (saved.volume != null) {
    audio.volume = saved.volume;
    if (volSlider) volSlider.value = Math.round(saved.volume * 100);
  }

  function setPlaying(playing) {
    if (btnPlay) btnPlay.textContent = playing ? '||' : '>';
    if (label) {
      label.style.webkitAnimationPlayState = playing ? 'running' : 'paused';
      label.style.animationPlayState = playing ? 'running' : 'paused';
    }
    if (turntableBtn) {
      turntableBtn.style.top = playing ? '155px' : '157px';
      turntableBtn.style.boxShadow = playing ? '2px 2px 0px #111' : '0px 0px 0px #111';
    }
    document.documentElement.classList.toggle('is-audio-awaiting-activation', autoplayBlocked && !playing);
  }

  function syncStartTime() {
    if (hasSyncedStartTime || targetTime <= 0) return;

    try {
      audio.currentTime = isFinite(audio.duration)
        ? Math.min(targetTime % audio.duration, audio.duration)
        : targetTime;
      hasSyncedStartTime = true;
    } catch (e) {}
  }

  function requestPlay() {
    shouldAutoplay = true;
    sessionStorage.removeItem(SESSION_PAUSED_KEY);
    syncStartTime();

    var p = audio.play();

    if (p && p.then) {
      p.then(function () {
        autoplayBlocked = false;
        setPlaying(true);
      }).catch(function () {
        autoplayBlocked = true;
        setPlaying(false);
      });
    }
  }

  function resume() {
    syncStartTime();

    if (shouldAutoplay) {
      requestPlay();
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  resume();
  audio.addEventListener('loadedmetadata', resume, { once: true });
  audio.addEventListener('canplay', resume, { once: true });
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) resume();
  });

  audio.addEventListener('play', function () {
    autoplayBlocked = false;
    setPlaying(true);
  });
  audio.addEventListener('pause', function () { setPlaying(false); });

  if (btnPlay) {
    btnPlay.addEventListener('click', function () {
      if (audio.paused) {
        requestPlay();
      } else {
        shouldAutoplay = false;
        autoplayBlocked = false;
        sessionStorage.setItem(SESSION_PAUSED_KEY, '1');
        audio.pause();
        save();
      }
    });
  }

  if (btnRewind) {
    btnRewind.addEventListener('click', function () {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
    });
  }

  if (btnForward) {
    btnForward.addEventListener('click', function () {
      audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10);
    });
  }

  if (volSlider) {
    volSlider.addEventListener('input', function () {
      audio.volume = volSlider.value / 100;
    });
  }

  if (turntableBtn) {
    turntableBtn.addEventListener('click', function () {
      if (audio.paused) {
        requestPlay();
      } else {
        shouldAutoplay = false;
        autoplayBlocked = false;
        sessionStorage.setItem(SESSION_PAUSED_KEY, '1');
        audio.pause();
        save();
      }
    });
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        position: audio.currentTime,
        playing: !audio.paused,
        timestamp: Date.now(),
        volume: audio.volume
      }));
    } catch (e) {}
  }

  setInterval(save, 500);
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);

  window.MWAudioPlayer = {
    audio: audio,
    save: save,
    getState: function () {
      if (autoplayBlocked) return STATE_UNKNOWN;
      return audio.paused ? 'paused' : 'playing';
    },
  };
}());
