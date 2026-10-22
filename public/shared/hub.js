/* Launcher page: fills the decorative icons on the app cards. */
(function () {
  'use strict';
  document.querySelectorAll('[data-icon]').forEach(function (el) {
    el.innerHTML = window.UI.icon(el.getAttribute('data-icon'));
  });
})();
