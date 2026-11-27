/* Crafts Wholesale look: quantity steppers, add to basket, order bar, colour grid, cart page, quick order. */
(function () {
  var CW = window.CW || {};
  var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';

  function money(cents) {
    var f = CW.sym ? CW.sym + '{{amount}}' : (CW.money || '£{{amount}}');
    var n = (cents || 0) / 100;
    function fmt(d, t, dec) {
      var p = n.toFixed(d).split('.');
      p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, t);
      return p.join(dec);
    }
    return f.replace(/\{\{\s*(\w+)\s*\}\}/, function (m, k) {
      if (k === 'amount_no_decimals') return fmt(0, ',', '.');
      if (k === 'amount_with_comma_separator') return fmt(2, '.', ',');
      if (k === 'amount_no_decimals_with_comma_separator') return fmt(0, '.', ',');
      if (k === 'amount_with_apostrophe_separator') return fmt(2, "'", '.');
      return fmt(2, ',', '.');
    });
  }
  CW.formatMoney = money;

  function toast(text, bad) {
    var t = document.createElement('div');
    t.className = 'cw-toast' + (bad ? ' is-bad' : '');
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function post(url, body) {
    return fetch(root + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.description || j.message || 'Could not update the basket'); return j; }); });
  }

  /* ---------- basket total in the header + order bars ---------- */
  function paint(cart) {
    document.querySelectorAll('[data-cw-cart-total]').forEach(function (el) { el.textContent = cart.item_count ? money(cart.total_price) : (el.getAttribute('data-empty') || 'Basket'); });
    document.querySelectorAll('[data-cw-cart-count]').forEach(function (el) { el.textContent = cart.item_count; });
    var g = goal(cart.total_price);
    document.querySelectorAll('[data-cw-bar]').forEach(function (bar) {
      var msg = bar.querySelector('[data-cw-bar-min]');
      var tot = bar.querySelector('[data-cw-bar-total]');
      var fill = bar.querySelector('[data-cw-bar-fill]');
      if (tot) tot.textContent = cart.item_count + (cart.item_count === 1 ? ' item · ' : ' items · ') + money(cart.total_price);
      if (msg) msg.textContent = g.text;
      if (fill) fill.style.width = g.pct + '%';
      bar.classList.toggle('is-met', g.done);
    });
  }
  /* next goal: the minimum order first, then free delivery */
  function goal(total) {
    var min = Number(CW.min || 0), free = Number(CW.free || 0);
    if (min && total < min) return { text: money(min - total) + ' to the ' + money(min) + ' minimum', pct: Math.min(100, total / min * 100), done: false };
    if (free && total < free) return { text: (min ? 'Minimum reached · ' : '') + money(free - total) + ' more for free delivery', pct: Math.min(100, total / free * 100), done: false };
    if (free) return { text: 'Free delivery unlocked', pct: 100, done: true };
    return { text: min ? 'Minimum order reached' : '', pct: 100, done: true };
  }
  CW.goal = goal;
  function refresh() {
    return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (c) { paint(c); return c; });
  }
  CW.refresh = refresh;

  function addItems(items, btn) {
    items = items.filter(function (i) { return i.id && i.quantity > 0; });
    if (!items.length) { toast('Set a quantity first', true); return Promise.resolve(); }
    if (btn) btn.classList.add('is-busy');
    return post('cart/add.js', { items: items }).then(function () {
      var n = items.reduce(function (s, i) { return s + i.quantity; }, 0);
      toast('Added ' + n + ' to the basket');
      document.dispatchEvent(new CustomEvent('cw:added', { detail: { items: items } }));
      return refresh();
    }).catch(function (e) { toast(e.message, true); }).then(function () { if (btn) btn.classList.remove('is-busy'); });
  }
  CW.addItems = addItems;

  /* ---------- steppers ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cw-step] button[data-d]');
    if (!b) return;
    var input = b.parentNode.querySelector('input');
    var min = Number(input.min || 0), max = input.max ? Number(input.max) : Infinity;
    var v = Math.max(min, Math.min(max, (parseInt(input.value, 10) || 0) + Number(b.getAttribute('data-d'))));
    input.value = v;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------- single add buttons (rows, cards, kit page, quick qty) ---------- */
  document.addEventListener('click', function (e) {
    var q = e.target.closest('[data-cw-setqty]');
    if (q) {
      var box = q.closest('[data-cw-item]');
      var inp = box && box.querySelector('[data-cw-qty]');
      if (inp) { inp.value = q.getAttribute('data-cw-setqty'); inp.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    var a = e.target.closest('[data-cw-add]');
    if (!a) return;
    e.preventDefault();
    var item = a.closest('[data-cw-item]');
    var qty = item && item.querySelector('[data-cw-qty]');
    var id = a.getAttribute('data-variant') || (item && item.getAttribute('data-variant'));
    addItems([{ id: Number(id), quantity: qty ? parseInt(qty.value, 10) || 0 : 1 }], a);
  });

  /* kit page: line total on the add button, variant select */
  function kitLine(item) {
    var lbl = item.querySelector('[data-cw-line]');
    var qty = item.querySelector('[data-cw-qty]');
    if (lbl && qty) lbl.textContent = money((parseInt(qty.value, 10) || 0) * Number(item.getAttribute('data-price') || 0));
  }
  document.addEventListener('change', function (e) {
    var item = e.target.closest('[data-cw-item]');
    if (item && e.target.matches('[data-cw-qty]')) kitLine(item);
    if (e.target.matches('[data-cw-variant-select]')) {
      var o = e.target.selectedOptions[0];
      var it = e.target.closest('[data-cw-item]');
      it.setAttribute('data-variant', o.value);
      it.setAttribute('data-price', o.getAttribute('data-price'));
      it.querySelectorAll('[data-cw-vprice]').forEach(function (el) { el.textContent = o.getAttribute('data-price-text'); });
      it.querySelectorAll('[data-cw-vsku]').forEach(function (el) { el.textContent = o.getAttribute('data-sku') || '—'; });
      it.querySelectorAll('[data-cw-vstock]').forEach(function (el) { el.innerHTML = o.getAttribute('data-stock'); });
      var add = it.querySelector('[data-cw-add]');
      if (add) add.disabled = o.getAttribute('data-available') !== 'true';
      kitLine(it);
      var u = new URL(location.href); u.searchParams.set('variant', o.value); history.replaceState(null, '', u);
    }
  });

  /* ---------- gallery ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cw-thumb]');
    if (!t) return;
    var g = t.closest('.cw-gal');
    var img = g.querySelector('.cw-gal__stage img');
    img.src = t.getAttribute('data-cw-thumb');
    img.removeAttribute('srcset');
    g.querySelectorAll('[data-cw-thumb]').forEach(function (x) { x.classList.toggle('is-on', x === t); });
  });

  /* ---------- kit facts from the description ---------- */
  function facts() {
    document.querySelectorAll('[data-cw-facts]').forEach(function (box) {
      var src = document.querySelector(box.getAttribute('data-cw-facts'));
      if (!src) return;
      var text = src.innerText.replace(/ /g, ' ');
      var found = 0;
      box.querySelectorAll('[data-cw-fact]').forEach(function (f) {
        var keys = f.getAttribute('data-cw-fact').split('|');
        var sep = f.getAttribute('data-cw-sep') === 'opt' ? '[:\\-–]?' : '[:\\-–]';
        var val = null;
        for (var i = 0; i < keys.length && !val; i++) {
          var k = keys[i].replace(/[\/]/g, '\\/');
          var m = text.match(new RegExp('(?:^|\\n|\\s)' + k + '\\s*(?:count|number|of colou?rs)?\\s*' + sep + '\\s*([^\\n]{1,70})', 'i'));
          if (m) val = m[1].trim().replace(/[.;,]$/, '');
        }
        if (val) { f.querySelector('b').textContent = val; f.classList.toggle('is-long', val.length > 16); found++; } else f.remove();
      });
      if (found) box.hidden = false;
    });
  }

  /* ---------- product photos: download all as one zip ---------- */
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (ok, bad) {
      var sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      sc.onload = function () { ok(window.JSZip); }; sc.onerror = bad;
      document.head.appendChild(sc);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cw-photos-all]');
    if (!b) return;
    var box = b.closest('[data-cw-photos]');
    var links = Array.prototype.slice.call(box.querySelectorAll('a[href]'));
    var name = box.getAttribute('data-cw-photos') || 'photos';
    b.classList.add('is-busy');
    loadZip().then(function (JSZip) {
      var zip = new JSZip();
      return Promise.all(links.map(function (a, i) {
        return fetch(a.href).then(function (r) { if (!r.ok) throw new Error('Photo ' + (i + 1) + ' failed'); return r.blob(); }).then(function (blob) {
          var ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          zip.file(name + '-' + String(i + 1).padStart(2, '0') + '.' + ext, blob);
        });
      })).then(function () { return zip.generateAsync({ type: 'blob' }); });
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name + '-photos.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }).catch(function () {
      toast('Could not make the zip, downloading one by one');
      links.forEach(function (a, i) { setTimeout(function () { window.open(a.href, '_blank'); }, i * 400); });
    }).then(function () { b.classList.remove('is-busy'); });
  });

  /* ---------- collection: list / grid, sort, filters on phones ---------- */
  function views() {
    document.querySelectorAll('[data-cw-main]').forEach(function (main) {
      var saved = null;
      try { saved = localStorage.getItem('cw:view'); } catch (e) {}
      if (saved === 'grid') main.classList.add('is-grid');
      var btns = document.querySelectorAll('[data-cw-view]');
      function mark() { btns.forEach(function (b) { var on = (b.getAttribute('data-cw-view') === 'grid') === main.classList.contains('is-grid'); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); }); }
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          main.classList.toggle('is-grid', b.getAttribute('data-cw-view') === 'grid');
          try { localStorage.setItem('cw:view', b.getAttribute('data-cw-view')); } catch (e) {}
          mark();
        });
      });
      mark();
    });
  }
  document.addEventListener('change', function (e) {
    if (!e.target.matches('[data-cw-sort]')) return;
    var u = new URL(location.href);
    u.searchParams.set('sort_by', e.target.value);
    u.searchParams.delete('page');
    location.href = u.toString();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cw-side-toggle]');
    if (t) {
      var s = document.querySelector('.cw-side'); if (!s) return;
      var open = s.classList.toggle('is-closed') === false;
      document.querySelectorAll('[data-cw-side-toggle][aria-expanded]').forEach(function (b) { b.setAttribute('aria-expanded', open); });
      document.documentElement.classList.toggle('cw-sheet-open', open && window.matchMedia('(max-width:900px)').matches);
    }
  });

  /* ---------- side menu ---------- */
  function menuEl() { return document.getElementById('cw-drawer'); }
  function showPane(n) {
    var d = menuEl(); if (!d) return;
    var m = d.querySelector('.cw-menu');
    var panes = d.querySelectorAll('.cw-menu__pane');
    if (!n && panes.length) n = panes[0].getAttribute('data-pane');
    panes.forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== String(n); });
    d.querySelectorAll('[data-cw-pane]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-cw-pane') === String(n)); });
    document.querySelectorAll('.cw-nav__link[data-cw-menu]').forEach(function (b) { b.setAttribute('aria-expanded', b.getAttribute('data-cw-menu') === String(n) && d.classList.contains('is-open')); });
    return m;
  }
  function closeMenu() {
    var d = menuEl(); if (!d) return;
    d.classList.remove('is-open'); document.body.style.overflow = '';
    document.querySelectorAll('.cw-nav__link[aria-expanded]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-cw-menu]');
    if (o) {
      var d = menuEl(); if (!d) return;
      var n = o.getAttribute('data-cw-menu');
      d.classList.add('is-open'); document.body.style.overflow = 'hidden';
      var m = showPane(n);
      if (m) m.classList.toggle('is-sub', !!n);
      return;
    }
    var p = e.target.closest('[data-cw-pane]');
    if (p) { var m2 = showPane(p.getAttribute('data-cw-pane')); if (m2) m2.classList.add('is-sub'); return; }
    if (e.target.closest('[data-cw-pane-back]')) { var m3 = document.querySelector('#cw-drawer .cw-menu'); if (m3) m3.classList.remove('is-sub'); return; }
    if (e.target.closest('[data-cw-menu-close]')) closeMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* ---------- colour grid (yarn) ---------- */
  function colours() {
    document.querySelectorAll('[data-cw-colours]').forEach(function (wrap) {
      var price = Number(wrap.getAttribute('data-price') || 0);
      var bar = document.querySelector(wrap.getAttribute('data-cw-colours'));
      var cells = Array.prototype.slice.call(wrap.querySelectorAll('[data-cw-col]'));
      function sum() {
        var packs = 0, cols = 0, total = 0, dots = [];
        cells.forEach(function (c) {
          var n = parseInt(c.querySelector('input').value, 10) || 0;
          c.classList.toggle('is-picked', n > 0);
          if (n > 0) { packs += n; cols++; total += n * Number(c.getAttribute('data-price') || price); if (dots.length < 10) dots.push(c.getAttribute('data-dot')); }
        });
        if (!bar) return;
        bar.querySelector('[data-cw-ysum]').textContent = packs + (packs === 1 ? ' pack' : ' packs') + ' in ' + cols + (cols === 1 ? ' colour · ' : ' colours · ') + money(total);
        var d = bar.querySelector('[data-cw-ydots]');
        d.innerHTML = '';
        dots.forEach(function (src) { var i = document.createElement('i'); if (src && src.charAt(0) === '#') i.style.background = src; else if (src) i.style.backgroundImage = 'url("' + src + '")'; else i.style.background = '#ccc'; d.appendChild(i); });
        bar.querySelector('[data-cw-yadd]').disabled = packs === 0;
      }
      wrap.addEventListener('change', sum);
      var scope = wrap.closest('.cw') || document;
      var each = scope.querySelector('[data-cw-yeach]');
      if (each) each.addEventListener('click', function () { cells.forEach(function (c) { if (c.getAttribute('data-available') === 'true' && !c.classList.contains('is-hidden')) { var i = c.querySelector('input'); i.value = (parseInt(i.value, 10) || 0) + 1; } }); sum(); });
      var clr = scope.querySelector('[data-cw-yclear]');
      if (clr) clr.addEventListener('click', function () { cells.forEach(function (c) { c.querySelector('input').value = 0; }); sum(); });
      var find = scope.querySelector('[data-cw-yfind]');
      var stockOnly = scope.querySelector('[data-cw-ystock]');
      function filter() {
        var q = find ? find.value.trim().toLowerCase() : '';
        var only = stockOnly && stockOnly.checked;
        cells.forEach(function (c) {
          var hide = (q && c.getAttribute('data-name').toLowerCase().indexOf(q) < 0) || (only && c.getAttribute('data-available') !== 'true');
          c.classList.toggle('is-hidden', !!hide);
        });
      }
      if (find) find.addEventListener('input', filter);
      if (stockOnly) stockOnly.addEventListener('change', filter);
      filter();
      if (bar) bar.querySelector('[data-cw-yadd]').addEventListener('click', function (e) {
        var items = cells.map(function (c) { return { id: Number(c.getAttribute('data-variant')), quantity: parseInt(c.querySelector('input').value, 10) || 0 }; });
        addItems(items, e.currentTarget).then(function () { cells.forEach(function (c) { c.querySelector('input').value = 0; }); sum(); });
      });
      sum();
    });
  }

  /* ---------- cart page ---------- */
  function cartSection(el) {
    var sec = el.closest('[id^="shopify-section-"]');
    return sec ? sec.id.replace('shopify-section-', '') : null;
  }
  function reloadCart(el) {
    var id = cartSection(el);
    if (!id) { location.reload(); return Promise.resolve(); }
    return fetch(root + 'cart?section_id=' + encodeURIComponent(id)).then(function (r) { return r.text(); }).then(function (html) {
      var box = document.getElementById('shopify-section-' + id);
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var fresh = tmp.querySelector('#shopify-section-' + id) || tmp.firstElementChild;
      if (box && fresh) box.innerHTML = fresh.innerHTML;
      return refresh();
    });
  }
  var cartTimer = null;
  document.addEventListener('change', function (e) {
    var line = e.target.closest('[data-cw-cline]');
    if (line && e.target.matches('[data-cw-qty]')) {
      clearTimeout(cartTimer);
      cartTimer = setTimeout(function () {
        line.classList.add('is-busy');
        post('cart/change.js', { id: line.getAttribute('data-key'), quantity: parseInt(e.target.value, 10) || 0 })
          .then(function () { return reloadCart(line); })
          .catch(function (err) { toast(err.message, true); line.classList.remove('is-busy'); });
      }, 350);
      return;
    }
    if (e.target.matches('[data-cw-attr]')) {
      var a = {}; a[e.target.getAttribute('data-cw-attr')] = e.target.value;
      post('cart/update.js', { attributes: a }).catch(function (err) { toast(err.message, true); });
    }
    if (e.target.matches('[data-cw-cartnote]')) post('cart/update.js', { note: e.target.value }).catch(function (err) { toast(err.message, true); });
  });
  document.addEventListener('click', function (e) {
    var x = e.target.closest('[data-cw-remove]');
    if (!x) return;
    var line = x.closest('[data-cw-cline]');
    line.classList.add('is-busy');
    post('cart/change.js', { id: line.getAttribute('data-key'), quantity: 0 }).then(function () { return reloadCart(line); }).catch(function (err) { toast(err.message, true); });
  });

  /* ---------- quick order by SKU ---------- */
  function lookup(sku) {
    var u = root + 'search?type=product&options%5Bfields%5D=variants.sku&options%5Bunavailable_products%5D=last&q=' + encodeURIComponent(sku) + '&section_id=cw-sku';
    return fetch(u).then(function (r) { return r.text(); }).then(function (html) {
      var m = html.match(/<script type="application\/json" data-cw-sku>([\s\S]*?)<\/script>/);
      var list = m ? JSON.parse(m[1]) : [];
      var want = sku.toLowerCase();
      return list.filter(function (v) { return String(v.sku || '').toLowerCase() === want; })[0] || null;
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cw-qo-add]');
    if (!b) return;
    var box = b.closest('[data-cw-qo]');
    var ta = box.querySelector('textarea');
    var msg = box.querySelector('[data-cw-qo-msg]');
    var lines = ta.value.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 100);
    if (!lines.length) return;
    var wanted = lines.map(function (l) {
      var p = l.split(/[\s,;\t]+/);
      return { sku: p[0], qty: Math.max(1, parseInt(p[1], 10) || 1) };
    });
    b.classList.add('is-busy');
    msg.className = 'cw-qo__msg';
    msg.textContent = 'Looking up ' + wanted.length + ' SKU' + (wanted.length === 1 ? '' : 's') + '…';
    Promise.all(wanted.map(function (w) { return lookup(w.sku).then(function (v) { return { w: w, v: v }; }); })).then(function (res) {
      var bad = res.filter(function (r) { return !r.v; }).map(function (r) { return r.w.sku; });
      var sold = res.filter(function (r) { return r.v && !r.v.available; }).map(function (r) { return r.w.sku; });
      var items = res.filter(function (r) { return r.v && r.v.available; }).map(function (r) { return { id: r.v.id, quantity: r.w.qty }; });
      return (items.length ? post('cart/add.js', { items: items }) : Promise.resolve()).then(function () {
        var out = [];
        if (items.length) out.push('Added ' + items.length + ' line' + (items.length === 1 ? '' : 's') + '.');
        if (bad.length) out.push('Not found: ' + bad.join(', ') + '.');
        if (sold.length) out.push('Out of stock: ' + sold.join(', ') + '.');
        msg.textContent = out.join(' ');
        msg.classList.add(bad.length || sold.length ? 'is-bad' : 'is-ok');
        ta.value = res.filter(function (r) { return !r.v || !r.v.available; }).map(function (r) { return r.w.sku + ' ' + r.w.qty; }).join('\n');
        if (items.length) return box.hasAttribute('data-cw-qo-reload') ? reloadCart(box) : refresh();
      });
    }).catch(function (err) { msg.textContent = err.message; msg.classList.add('is-bad'); }).then(function () { b.classList.remove('is-busy'); });
  });

  function init() { facts(); views(); colours(); document.querySelectorAll('[data-cw-item]').forEach(kitLine); if (document.querySelector('[data-cw-bar],[data-cw-cart-total]')) refresh(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('shopify:section:load', init);
  window.CW = CW;
})();
