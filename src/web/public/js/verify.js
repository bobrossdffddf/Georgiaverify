/* Drives the verify page states from window.__DATA injected by the server. */
(function () {
  var data = window.__DATA || { state: 'notoken' };

  function el(id) { return document.getElementById(id); }
  function show(id) { var e = el(id); if (e) e.classList.remove('hidden'); }
  function hide(id) { var e = el(id); if (e) e.classList.add('hidden'); }
  function text(id, t) { var e = el(id); if (e) e.textContent = t; }

  var help = el('help-link');
  if (help && data.discordUrl) help.href = data.discordUrl;

  function showExpired() {
    hide('state-ready'); hide('progress'); hide('state-error'); hide('state-notoken');
    show('state-expired');
  }

  if (data.state === 'ready') {
    show('progress');
    show('state-ready');

    if (data.discord) {
      text('dc-name', data.discord.username || 'Discord user');
      var av = el('dc-avatar');
      if (av) {
        if (data.discord.avatar) {
          var img = document.createElement('img');
          img.src = data.discord.avatar;
          img.alt = '';
          av.innerHTML = '';
          av.appendChild(img);
        } else {
          av.textContent = (data.discord.username || 'D').charAt(0).toUpperCase();
        }
      }
    }

    var btn = el('roblox-btn');
    if (btn) {
      btn.setAttribute('href', data.robloxStartUrl || '#');
      btn.addEventListener('click', function () {
        // Optimistic progress + spinner while the browser navigates to Roblox.
        var s2 = el('seg2'), s3 = el('seg3');
        if (s2) s2.style.width = '100%';
        setTimeout(function () { if (s3) s3.style.width = '100%'; }, 250);
        var rbximg = btn.querySelector('img.rbx');
        if (rbximg) rbximg.classList.add('hidden');
        text('roblox-btn-label', 'Connecting to Roblox…');
        var sp = document.createElement('span');
        sp.className = 'spinner';
        btn.insertBefore(sp, btn.firstChild);
        btn.style.pointerEvents = 'none';
      });
    }

    // Auto-flip to "expired" exactly when the link dies.
    if (data.expiresAt) {
      var ms = data.expiresAt - Date.now();
      if (ms > 0 && ms < 24 * 3600 * 1000) setTimeout(showExpired, ms);
    }
  } else if (data.state === 'expired') {
    show('state-expired');
  } else if (data.state === 'error') {
    if (data.title) text('err-title', data.title);
    if (data.message) text('err-message', data.message);
    show('state-error');
  } else {
    show('state-notoken');
  }
})();
