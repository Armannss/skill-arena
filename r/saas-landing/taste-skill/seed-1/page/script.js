(function () {
  // Menu sheet (under 1024px)
  var menuBtn = document.querySelector('.menu-btn');
  var sheet = document.getElementById('sheet');
  function setMenu(open) {
    sheet.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn.addEventListener('click', function () { setMenu(sheet.hidden); });
  sheet.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) setMenu(false); });

  // "Sign up free" in the nav jumps to the hero form and puts the cursor in the email field
  document.querySelectorAll('[data-focus]').forEach(function (link) {
    link.addEventListener('click', function () {
      var field = document.getElementById(link.getAttribute('data-focus'));
      if (field) setTimeout(function () { field.focus({ preventScroll: true }); }, 0);
    });
  });

  // App frame: pick an invoice from the list to open it
  var invoices = [
    {
      no: 'INV-0143', client: 'Kettle Bakery', amount: '$2,450.00', status: ['draft', 'Draft'],
      sub: 'Not sent yet', due: 'Due 19 Nov 2026',
      items: [['Brand identity, phase 2', '$1,500.00'], ['Packaging layout, 3 sizes', '$650.00'], ['Label artwork, 2 rounds', '$300.00']],
      steps: [['done', 'Draft saved', '5 Nov'], ['next', 'Send to client', 'Today'], ['later', 'Reminder 1, 1 day late', '20 Nov'], ['later', 'Reminder 2, 7 days late', '26 Nov'], ['later', 'Reminder 3, 14 days late', '3 Dec']],
      actions: ['Send invoice', 'Edit draft']
    },
    {
      no: 'INV-0142', client: 'Alder Studio', amount: '$2,400.00', status: ['late', '6 days late'],
      sub: 'Sent 16 Oct 2026', due: 'Due 30 Oct 2026',
      items: [['Website redesign, 8 pages', '$2,000.00'], ['Copy editing, 10 hours', '$400.00']],
      steps: [['done', 'Sent to client', '16 Oct'], ['done', 'Reminder 1, 1 day late', '31 Oct'], ['next', 'Reminder 2, 7 days late', '6 Nov'], ['later', 'Reminder 3, 14 days late', '13 Nov']],
      actions: ['Send reminder now', 'Mark as paid']
    },
    {
      no: 'INV-0141', client: 'Kettle Bakery', amount: '$1,150.00', status: ['due', 'Due 12 Nov'],
      sub: 'Sent 29 Oct 2026', due: 'Due 12 Nov 2026',
      items: [['Menu boards, 4 designs', '$900.00'], ['Window lettering', '$250.00']],
      steps: [['done', 'Sent to client', '29 Oct'], ['later', 'Reminder 1, 1 day late', '13 Nov'], ['later', 'Reminder 2, 7 days late', '19 Nov'], ['later', 'Reminder 3, 14 days late', '26 Nov']],
      actions: ['Mark as paid', 'Edit reminders']
    },
    {
      no: 'INV-0140', client: 'Northgate Press', amount: '$3,200.00', status: ['due', 'Due 18 Nov'],
      sub: 'Sent 4 Nov 2026', due: 'Due 18 Nov 2026',
      items: [['Book cover design', '$1,400.00'], ['Interior layout, 240 pages', '$1,800.00']],
      steps: [['done', 'Sent to client', '4 Nov'], ['later', 'Reminder 1, 1 day late', '19 Nov'], ['later', 'Reminder 2, 7 days late', '25 Nov'], ['later', 'Reminder 3, 14 days late', '2 Dec']],
      actions: ['Mark as paid', 'Edit reminders']
    },
    {
      no: 'INV-0139', client: 'Northgate Press', amount: '$940.00', status: ['paid', 'Paid 2 Nov'],
      sub: 'Sent 20 Oct 2026', due: 'Due 3 Nov 2026',
      items: [['Catalogue proofing', '$700.00'], ['Print checks, 2 rounds', '$240.00']],
      steps: [['done', 'Sent to client', '20 Oct'], ['done', 'Paid in full', '2 Nov'], ['off', 'Reminders stopped', '2 Nov']],
      actions: ['Duplicate invoice']
    },
    {
      no: 'INV-0138', client: 'Kettle Bakery', amount: '$1,600.00', status: ['paid', 'Paid 28 Oct'],
      sub: 'Sent 1 Oct 2026', due: 'Due 15 Oct 2026',
      items: [['Seasonal poster set', '$1,200.00'], ['Social media templates', '$400.00']],
      steps: [['done', 'Sent to client', '1 Oct'], ['done', 'Reminder 1, 1 day late', '16 Oct'], ['done', 'Reminder 2, 7 days late', '22 Oct'], ['done', 'Paid in full', '28 Oct'], ['off', 'Reminders stopped', '28 Oct']],
      actions: ['Duplicate invoice']
    }
  ];

  var detail = document.querySelector('[data-detail]');
  var options = document.querySelectorAll('[data-inv]');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(inv) {
    var rows = inv.items.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('');
    var steps = inv.steps.map(function (s) { return '<li class="is-' + s[0] + '"><span>' + esc(s[1]) + '</span><span>' + esc(s[2]) + '</span></li>'; }).join('');
    var actions = inv.actions.map(function (a, i) { return '<span class="ui-btn' + (i === 0 ? ' ui-btn--primary' : '') + '">' + esc(a) + '</span>'; }).join('');
    detail.innerHTML =
      '<div class="det__head"><div><span class="det__client">' + esc(inv.client) + '</span>' +
      '<span class="det__sub">' + esc(inv.no) + ' · ' + esc(inv.sub) + '</span></div>' +
      '<span class="pill pill--' + inv.status[0] + '">' + esc(inv.status[1]) + '</span></div>' +
      '<div class="det__amt"><span class="det__total">' + esc(inv.amount) + '</span><span class="det__due">' + esc(inv.due) + '</span></div>' +
      '<div class="det__cols"><div><span class="label">Items</span><table class="items items--app"><tbody>' + rows +
      '</tbody><tfoot><tr><td>Total</td><td>' + esc(inv.amount) + '</td></tr></tfoot></table></div>' +
      '<div><span class="label">Chasing</span><ol class="steps">' + steps + '</ol></div></div>' +
      '<div class="det__actions">' + actions + '</div>';
  }

  options.forEach(function (btn) {
    btn.addEventListener('click', function () {
      options.forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      render(invoices[Number(btn.getAttribute('data-inv'))]);
    });
  });
})();
