// The statement plays once on the desk, after fonts load and while in view.
(() => {
  const desk = document.querySelector('[data-play]');
  if (!desk) return;
  const finish = () => desk.classList.add('is-played');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { finish(); return; }
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  const timeout = new Promise((done) => setTimeout(done, 1200));
  Promise.race([fonts, timeout]).then(() => {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(finish));
    }, { threshold: 0.35 });
    io.observe(desk);
  });
})();

// Client cards switch the record beside them; without script every record shows.
document.querySelectorAll('[data-tabs]').forEach((list) => {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (e.key in keys) { e.preventDefault(); select(tabs[(i + keys[e.key] + tabs.length) % tabs.length], true); }
      if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
      if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
    });
  });
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0], false);
});

// The sign-up form posts nowhere until an endpoint is set in data-endpoint.
document.querySelectorAll('form[data-endpoint]').forEach((form) => {
  const input = form.querySelector('input');
  const help = form.querySelector('[aria-live]');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = input.checkValidity();
    input.toggleAttribute('aria-invalid', !ok);
    if (!ok) {
      input.setAttribute('aria-describedby', help.id);
      help.textContent = 'That address looks incomplete. Write it as name@example.com.';
      input.focus();
      return;
    }
    input.removeAttribute('aria-describedby');
    if (!form.dataset.endpoint) { help.textContent = 'Nothing was sent: sign-up is not connected yet.'; return; }
    button.setAttribute('aria-busy', 'true');
    fetch(form.dataset.endpoint, { method: 'POST', body: new FormData(form) })
      .then((r) => { help.textContent = r.ok ? 'Check ' + input.value.trim() + ' for a link to set up your account.' : 'That did not go through. Try again in a minute.'; })
      .catch(() => { help.textContent = 'That did not go through. Try again in a minute.'; })
      .finally(() => button.removeAttribute('aria-busy'));
  });
});
