(function () {
  'use strict';

  var audio = document.getElementById('player-audio');
  var QUIET_KEY = 'mw_audio_quiet_this_visit';
  var hasMusicGate = document.getElementById('music-gate');

  if (!audio || (window.MWAudioPlayer && window.MWAudioPlayer.audio === audio)) {
    return;
  }

  audio.loop = true;

  window.MWAudioPlayer = { audio: audio };

  // The homepage deliberately waits for its explicit sound-entry prompt.
  if (hasMusicGate) {
    return;
  }

  try {
    if (sessionStorage.getItem(QUIET_KEY) === '1') {
      return;
    }
  } catch (e) {}

  audio.autoplay = true;

  function playAudio() {
    var playback = audio.play();

    if (playback && playback.catch) {
      playback.catch(function () {
        // Some browsers require the visitor's first interaction before sound
        // can begin. Retry transparently on that interaction.
        document.addEventListener('pointerdown', playAudio, { once: true, capture: true });
        document.addEventListener('keydown', playAudio, { once: true, capture: true });
      });
    }
  }

  playAudio();
  audio.addEventListener('canplay', playAudio, { once: true });
  window.addEventListener('pageshow', playAudio);

}());
