'use strict';

/** Deepdesk always-on-top mini timer. Collapsed: time + ring. Hover: controls. */
(function () {
  const api = window.deepdesk;
  const CIRC = 2 * Math.PI * 18;
  const $ = (id) => document.getElementById(id);

  const colors = {
    idle: '#6c8cff',
    focus: '#6c8cff',
    shortBreak: '#3ecf8e',
    longBreak: '#f5b04c',
  };
  const labels = {
    idle: 'Ready',
    focus: 'Focus',
    shortBreak: 'Short break',
    longBreak: 'Long break',
  };
  const icons = { idle: '◈', focus: '⚡', shortBreak: '☕', longBreak: '🌿' };

  let lastState = null;

  function fmt(ms) {
    const total = Math.ceil(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function render(state) {
    lastState = state;
    const idle = state.phase === 'idle';
    $('time').textContent = idle ? fmt(state.config.focusMs) : fmt(state.remainingMs);
    $('phase').textContent = idle
      ? 'Ready'
      : `${labels[state.phase]}${state.running ? '' : ' · paused'}${state.intent ? ' — ' + state.intent : ''}`;
    $('icon').textContent = icons[state.phase] || '◈';
    const rfg = $('rfg');
    rfg.style.stroke = colors[state.phase] || colors.idle;
    rfg.style.strokeDashoffset = String(CIRC * (1 - (idle ? 0 : state.progress)));
    $('btnToggle').textContent = idle ? 'Start' : (state.running ? 'Pause' : 'Resume');
  }

  api.timer.onState(render);
  api.timer.getState().then(render);

  // Hover to expand (window is resized by main so nothing clips).
  document.body.addEventListener('mouseenter', () => {
    document.body.classList.add('expanded');
    api.mini.setExpanded(true);
  });
  document.body.addEventListener('mouseleave', () => {
    document.body.classList.remove('expanded');
    api.mini.setExpanded(false);
  });

  $('btnToggle').addEventListener('click', () => {
    if (!lastState || lastState.phase === 'idle') api.timer.start();
    else if (lastState.running) api.timer.pause();
    else api.timer.resume();
  });
  $('btnSkip').addEventListener('click', () => api.timer.skip());
  $('btnOpen').addEventListener('click', () => api.mini.showMain());
})();
