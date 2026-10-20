(function () {
  'use strict';

  var audio = document.getElementById('player-audio');
  var PLAYING_KEY = 'mw_audio_playing_this_visit';

  if (!audio || (window.MWAudioPlayer && window.MWAudioPlayer.audio === audio)) {
    return;
  }

  audio.loop = true;

  function syncControls() {
    var playing = !audio.paused;
    document.querySelectorAll('.music-toggle').forEach(function (button) {
      button.textContent = playing ? '||' : '>';
      button.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
      button.title = playing ? 'Pause music' : 'Play music';
    });
  }

  window.MWAudioPlayer = { audio: audio, syncControls: syncControls };

  function playAudio() {
    var playback = audio.play();
    if (playback && playback.catch) {
      playback.catch(syncControls);
    }
  }

  function onPlaybackChange() {
    try { sessionStorage.setItem(PLAYING_KEY, audio.paused ? '0' : '1'); } catch (e) {}
    syncControls();
  }

  function onClick(event) {
    if (!event.target.closest || !event.target.closest('.music-toggle')) return;
    if (audio.paused) {
      playAudio();
    } else {
      audio.pause();
    }
  }

  // This handler belongs to the persistent player and survives page changes.
  onClick.__mwPermanent = true;
  document.addEventListener('click', onClick);
  audio.addEventListener('play', onPlaybackChange);
  audio.addEventListener('pause', onPlaybackChange);
  syncControls();

  try {
    if (sessionStorage.getItem(PLAYING_KEY) === '1') playAudio();
  } catch (e) {}

}());
