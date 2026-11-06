if (window.self !== window.top) document.documentElement.hidden = true;
(function () {
  var root = document.documentElement;
  var mode = 'auto';
  try {
    var saved = localStorage.getItem('aghs-theme');
    if (saved === 'light' || saved === 'dark') mode = saved;
    if (mode !== 'auto') root.setAttribute('data-color-mode', mode);
    var palette = localStorage.getItem('aghs-palette');
    if (palette && /^[a-z-]{1,40}$/.test(palette) && palette !== 'github') root.setAttribute('data-palette', palette);
  } catch (e) {
    mode = 'auto';
  }
  var dark = mode === 'dark' || (mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-scheme', dark ? 'dark' : 'light');
})();
