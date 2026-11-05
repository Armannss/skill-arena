(function () {
  // Header border once the page scrolls
  var header = document.querySelector(".site-header");
  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // "Start free" links jump to the hero form and focus the email field
  var heroInput = document.getElementById("hero-email");
  document.querySelectorAll("[data-focus-signup]").forEach(function (link) {
    link.addEventListener("click", function () {
      setTimeout(function () {
        if (heroInput && !heroInput.closest(".is-done")) {
          heroInput.focus({ preventScroll: true });
        }
      }, 350);
    });
  });

  // Sign-up forms
  document.querySelectorAll("[data-signup]").forEach(function (form) {
    var input = form.querySelector('input[type="email"]');
    var msg = form.querySelector(".form-msg");

    function setError(text) {
      input.setAttribute("aria-invalid", "true");
      msg.textContent = text;
      msg.className = "form-msg is-error";
    }

    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true") {
        input.removeAttribute("aria-invalid");
        msg.textContent = "";
        msg.className = "form-msg";
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = input.value.trim();

      if (!value) {
        setError("Enter your email to create your free account.");
        input.focus();
        return;
      }
      if (!input.checkValidity() || value.indexOf(".", value.indexOf("@")) === -1) {
        setError("That email doesn't look right. Check it for typos.");
        input.focus();
        return;
      }

      input.removeAttribute("aria-invalid");
      form.classList.add("is-done");
      msg.className = "form-msg is-success";
      msg.textContent = "You're in. We've sent a sign-in link to " + value + ".";
    });
  });

  // Hero toast: alternate between a reminder and a payment
  var toast = document.querySelector(".toast");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!toast || reduceMotion) return;

  var title = toast.querySelector("[data-toast-title]");
  var sub = toast.querySelector("[data-toast-sub]");
  var icon = toast.querySelector("[data-toast-icon]");
  var mailIcon = icon.innerHTML;
  var paidIcon = '<svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7"/></svg>';

  var messages = [
    { title: "Reminder sent to Hale & Co.", sub: "Friendly nudge · just now", icon: mailIcon },
    { title: "Pine Labs paid $950", sub: "INV-0137 · reminders stopped", icon: paidIcon }
  ];
  var index = 0;

  setInterval(function () {
    toast.classList.add("is-hidden");
    setTimeout(function () {
      index = (index + 1) % messages.length;
      title.textContent = messages[index].title;
      sub.textContent = messages[index].sub;
      icon.innerHTML = messages[index].icon;
      toast.classList.remove("is-hidden");
    }, 380);
  }, 4200);
})();
