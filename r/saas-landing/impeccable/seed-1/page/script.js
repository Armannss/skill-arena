(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  // Today's date on the white original
  const today = document.querySelector('[data-today]');
  if (today) {
    const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
    today.textContent = parts;
  }

  // Signup stubs
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  document.querySelectorAll('form[data-signup]').forEach((form) => {
    const input = form.querySelector('input[type="email"]');
    const msg = form.querySelector('[data-msg]');
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector('[data-label]');

    const clearError = () => {
      if (!form.classList.contains('is-error')) return;
      form.classList.remove('is-error');
      input.removeAttribute('aria-invalid');
      msg.textContent = '';
    };

    input.addEventListener('input', clearError);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();

      if (!emailPattern.test(value)) {
        form.classList.add('is-error');
        input.setAttribute('aria-invalid', 'true');
        msg.textContent = value
          ? 'That email looks incomplete. Check for a typo, like a missing “.com”.'
          : 'Add your email to start your free account.';
        input.focus();
        return;
      }

      button.disabled = true;
      label.textContent = 'Setting up…';

      // Replace with the real sign-up request when the endpoint exists.
      window.setTimeout(() => {
        form.classList.add('is-done');
        msg.textContent = `You’re in. We’ve sent a sign-in link to ${value}.`;
        button.disabled = false;
        label.textContent = 'Start free';
      }, 650);
    });
  });

  // Payment demo: one invoice paid stops the chase and updates the ledger
  const toggle = document.getElementById('pay-toggle');
  const status = document.getElementById('pay-status');
  const counters = {
    owed: { unpaid: 4890, paid: 2490 },
    late: { unpaid: 2400, paid: 0 },
  };

  const roll = (el, to) => {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = String(to);
    if (reduceMotion.matches || from === to) {
      el.textContent = money.format(to);
      return;
    }
    const start = performance.now();
    const duration = 720;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = money.format(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (toggle) {
    let paid = false;
    toggle.addEventListener('click', () => {
      paid = !paid;
      document.body.classList.toggle('is-paid', paid);
      Object.entries(counters).forEach(([key, values]) => {
        const el = document.querySelector(`[data-count="${key}"]`);
        if (el) roll(el, paid ? values.paid : values.unpaid);
      });
      status.textContent = paid
        ? 'Invoice 0147 marked paid. Two scheduled reminders cancelled. Total owed is now $2,490.00.'
        : 'Payment undone. Invoice 0147 is 3 days late again and its reminders are back on schedule.';
    });
  }
})();
