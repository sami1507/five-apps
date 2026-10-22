/* Registers the app's service worker (sw.js in the app's folder) so it opens offline once installed. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline caching is optional */ });
  }
})();
