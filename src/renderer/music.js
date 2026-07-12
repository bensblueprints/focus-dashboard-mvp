'use strict';

/**
 * Deepdesk music player: imported local tracks + the bundled Lofi Focus Pack.
 * Plays through an HTMLAudioElement, so it mixes freely with the WebAudio
 * ambient engine — both can run at once with independent volumes.
 */
(function () {
  const api = window.deepdesk;
  const $ = (id) => document.getElementById(id);

  let music = { tracks: [], volume: 0.5, shuffle: false, loopPlaylist: true };
  let lofi = { installed: false, tracks: [] };

  // Playback queue: which list is playing and in what order.
  let queue = [];          // [{ path, name, id? }] in play order
  let queueSource = null;  // 'library' | 'lofi'
  let queueIndex = -1;
  let playing = false;

  const audio = new Audio();
  audio.preload = 'auto';

  const durations = new Map(); // path -> seconds (probed lazily, in-memory)

  // ---------------- Helpers ----------------
  function fmtTime(sec) {
    if (!Number.isFinite(sec)) return '–:––';
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function shuffled(list, firstPath) {
    const rest = list.filter((t) => t.path !== firstPath);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const first = list.find((t) => t.path === firstPath);
    return first ? [first, ...rest] : rest;
  }

  function buildQueue(source, startPath) {
    const list = source === 'lofi' ? lofi.tracks : music.tracks;
    if (!list.length) return false;
    const first = startPath || (music.shuffle
      ? list[Math.floor(Math.random() * list.length)].path
      : list[0].path);
    queue = music.shuffle ? shuffled(list, first) : list.slice();
    queueSource = source;
    queueIndex = Math.max(0, queue.findIndex((t) => t.path === first));
    return true;
  }

  function currentTrack() {
    return queueIndex >= 0 ? queue[queueIndex] : null;
  }

  // ---------------- Playback ----------------
  function playIndex(idx) {
    if (!queue.length) return;
    queueIndex = ((idx % queue.length) + queue.length) % queue.length;
    const track = queue[queueIndex];
    audio.src = api.music.fileUrl(track.path);
    audio.volume = music.volume;
    audio.play().then(() => { playing = true; renderPlayer(); renderList(); })
      .catch(() => { playing = false; renderPlayer(); });
  }

  function togglePlay() {
    if (playing) {
      audio.pause();
      playing = false;
      renderPlayer();
      return;
    }
    if (currentTrack()) {
      audio.play().then(() => { playing = true; renderPlayer(); }).catch(() => {});
    } else if (buildQueue(music.tracks.length ? 'library' : 'lofi')) {
      playIndex(queueIndex);
    }
  }

  function step(dir) {
    if (!queue.length) return;
    const next = queueIndex + dir;
    if (next >= queue.length || next < 0) {
      if (!music.loopPlaylist) {
        audio.pause();
        audio.currentTime = 0;
        playing = false;
        renderPlayer();
        return;
      }
      if (music.shuffle && queue.length > 1) buildQueue(queueSource); // reshuffle each loop
    }
    playIndex(next);
  }

  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('timeupdate', renderTime);
  audio.addEventListener('error', () => {
    // Missing/unreadable file — skip ahead rather than dying silently.
    if (playing && queue.length > 1) step(1);
    else { playing = false; renderPlayer(); }
  });

  // ---------------- Duration probing ----------------
  function probeDuration(track) {
    if (durations.has(track.path)) return;
    durations.set(track.path, NaN); // in-flight marker
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.addEventListener('loadedmetadata', () => {
      durations.set(track.path, probe.duration);
      renderList();
    });
    probe.addEventListener('error', () => durations.delete(track.path));
    probe.src = api.music.fileUrl(track.path);
  }

  // ---------------- Rendering ----------------
  function renderPlayer() {
    const track = currentTrack();
    $('musicPlay').textContent = playing ? '⏸' : '▶';
    $('musicTrackName').textContent = track
      ? `${queueSource === 'lofi' ? '🎧 ' : ''}${track.name}`
      : 'Nothing playing';
    $('musicShuffle').classList.toggle('on', !!music.shuffle);
    $('musicLoop').classList.toggle('on', !!music.loopPlaylist);
    renderTime();
  }

  function renderTime() {
    const track = currentTrack();
    $('musicTrackTime').textContent = track && Number.isFinite(audio.duration)
      ? `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`
      : '';
  }

  function renderList() {
    const list = $('musicList');
    const current = currentTrack();

    // Built-in Lofi Focus Pack row (kept as the first, permanent entry).
    const lofiRow = $('lofiPackRow');
    lofiRow.classList.toggle('disabled', !lofi.installed);
    lofiRow.classList.toggle('playing', playing && queueSource === 'lofi');
    $('lofiPackMeta').textContent = lofi.installed
      ? `${lofi.tracks.length} tracks`
      : 'pack not installed';

    // Imported tracks.
    list.querySelectorAll('.music-item:not(.music-lofi), .music-empty').forEach((el) => el.remove());
    if (!music.tracks.length) {
      const li = document.createElement('li');
      li.className = 'music-empty';
      li.textContent = 'No imported tracks yet.';
      list.appendChild(li);
      return;
    }
    music.tracks.forEach((t, i) => {
      if (!durations.has(t.path)) probeDuration(t);
      const li = document.createElement('li');
      li.className = 'music-item'
        + (current && queueSource === 'library' && current.path === t.path ? ' playing' : '');

      const title = document.createElement('span');
      title.className = 'music-item-title';
      title.textContent = t.name;
      title.title = t.path;

      const meta = document.createElement('span');
      meta.className = 'music-item-meta';
      meta.textContent = fmtTime(durations.get(t.path));

      const up = trackBtn('↑', 'Move up', i === 0, async (e) => {
        e.stopPropagation();
        music = await api.music.move(i, i - 1);
        renderList();
      });
      const down = trackBtn('↓', 'Move down', i === music.tracks.length - 1, async (e) => {
        e.stopPropagation();
        music = await api.music.move(i, i + 1);
        renderList();
      });
      const del = trackBtn('✕', 'Remove from playlist', false, async (e) => {
        e.stopPropagation();
        music = await api.music.remove(t.id);
        renderList();
      });
      del.classList.add('music-item-del');

      li.append(title, meta, up, down, del);
      li.addEventListener('click', () => {
        if (buildQueue('library', t.path)) playIndex(queueIndex);
      });
      list.appendChild(li);
    });
  }

  function trackBtn(text, title, disabled, onClick) {
    const b = document.createElement('button');
    b.className = 'music-item-btn';
    b.textContent = text;
    b.title = title;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------------- Controls ----------------
  $('musicPlay').addEventListener('click', togglePlay);
  $('musicNext').addEventListener('click', () => step(1));
  $('musicPrev').addEventListener('click', () => {
    // Standard player behavior: restart the track unless we're near its start.
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    step(-1);
  });
  $('musicShuffle').addEventListener('click', async () => {
    music = await api.music.setPrefs({ shuffle: !music.shuffle });
    if (queueSource) buildQueue(queueSource, currentTrack() && currentTrack().path);
    renderPlayer();
  });
  $('musicLoop').addEventListener('click', async () => {
    music = await api.music.setPrefs({ loopPlaylist: !music.loopPlaylist });
    renderPlayer();
  });
  $('musicVolume').addEventListener('input', (e) => {
    audio.volume = e.target.value / 100;
    persistVolumeDebounced(audio.volume);
  });

  let volumeSaveTimer = null;
  function persistVolumeDebounced(v) {
    music.volume = v;
    clearTimeout(volumeSaveTimer);
    volumeSaveTimer = setTimeout(() => api.music.setPrefs({ volume: v }), 500);
  }

  $('musicImport').addEventListener('click', async () => {
    music = await api.music.import();
    renderList();
  });

  $('lofiPackRow').addEventListener('click', () => {
    if (!lofi.installed) return;
    if (buildQueue('lofi')) playIndex(queueIndex);
  });

  // ---------------- Drag & drop import ----------------
  const panel = $('musicPanel');
  for (const ev of ['dragover', 'drop']) {
    // Never let the window navigate to a dropped file.
    window.addEventListener(ev, (e) => e.preventDefault());
  }
  panel.addEventListener('dragover', () => panel.classList.add('dropping'));
  panel.addEventListener('dragleave', () => panel.classList.remove('dropping'));
  panel.addEventListener('drop', async (e) => {
    panel.classList.remove('dropping');
    const paths = [...(e.dataTransfer ? e.dataTransfer.files : [])]
      .map((f) => api.music.pathForFile(f))
      .filter(Boolean);
    if (!paths.length) return;
    music = await api.music.addPaths(paths);
    renderList();
  });

  // ---------------- Boot ----------------
  (async function boot() {
    [music, lofi] = await Promise.all([api.music.get(), api.music.getLofiPack()]);
    audio.volume = music.volume;
    $('musicVolume').value = Math.round(music.volume * 100);
    renderPlayer();
    renderList();
  })();
})();
