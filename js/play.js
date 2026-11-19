/* FixIT Student — phần làm đẹp và tìm nhanh:
   đồng hồ đếm ngược ở trang chủ, vệt sáng theo chuột trên thẻ, bảng lệnh Ctrl + K. */
(function () {
  'use strict';

  var Account = window.FixAccount || null;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function each(selector, fn, root) {
    var list = (root || document).querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }

  /* Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu: "dịch vụ" khớp với "dich vu" */
  function plain(text) {
    return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  /* ---------- 1. Đồng hồ đếm ngược (hình "Một tối trước hạn nộp" ở trang chủ) ----------
     data-countdown là số giây ban đầu. Mỗi giây trừ đi 1; về 0 thì quay lại số ban đầu. */
  function initCountdown() {
    each('[data-countdown]', function (clock) {
      var start = Number(clock.getAttribute('data-countdown'));
      var left = start;
      function two(n) { return (n < 10 ? '0' : '') + n; }
      function paint() {
        var h = Math.floor(left / 3600);
        var m = Math.floor((left % 3600) / 60);
        var s = left % 60;
        clock.textContent = two(h) + ':' + two(m) + ':' + two(s);
      }
      window.setInterval(function () {
        left = left > 0 ? left - 1 : start;
        paint();
      }, 1000);
      paint();
    });
  }

  /* ---------- 2. Vệt sáng tím đi theo con trỏ trên các thẻ ---------- */
  function initSpotlight() {
    if (calm || !window.matchMedia('(hover: hover)').matches) return;
    each('.card, .pain, .order, .ab-value', function (card) {
      var spot = document.createElement('span');
      spot.className = 'spot';
      spot.setAttribute('aria-hidden', 'true');
      card.appendChild(spot);
      card.addEventListener('pointermove', function (e) {
        var box = card.getBoundingClientRect();
        spot.style.setProperty('--mx', (e.clientX - box.left) + 'px');
        spot.style.setProperty('--my', (e.clientY - box.top) + 'px');
      });
    });
  }

  /* ---------- 2b. Tạm dừng hình động ở những phần đang nằm ngoài màn hình ----------
     Phần nào cuộn ra khỏi màn hình thì gắn class is-idle; CSS sẽ dừng mọi animation bên trong.
     Cuộn tới gần (cách 200px) thì bỏ class, hình chạy tiếp từ chỗ đã dừng. Người xem không thấy khác gì,
     nhưng máy không phải vẽ lại những thứ không ai nhìn thấy. */
  function initIdle() {
    if (!('IntersectionObserver' in window)) return;
    var watcher = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        entries[i].target.classList.toggle('is-idle', !entries[i].isIntersecting);
      }
    }, { rootMargin: '200px 0px' });
    each('main section, .site-footer', function (part) { watcher.observe(part); });
  }

  /* Trong lúc đang cuộn: tạm dừng nền tím chuyển động và vòng sáng nút chatbot,
     vì hai thứ này phải vẽ lại cả mảng lớn mỗi khung hình. Ngừng cuộn 0,25 giây thì chạy lại. */
  function initScrollCalm() {
    var root = document.documentElement;
    var timer = 0;
    window.addEventListener('scroll', function () {
      if (!timer) root.classList.add('is-scrolling');
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        root.classList.remove('is-scrolling');
        timer = 0;
      }, 250);
    }, { passive: true });
  }

  /* ---------- 3. Bảng lệnh: Ctrl + K hoặc phím / ---------- */
  function initPalette() {
    var dialog = document.querySelector('[data-cmdk]');
    if (!dialog) return;
    var input = dialog.querySelector('[data-cmdk-input]');
    var rows = dialog.querySelectorAll('[data-cmdk-list] li');
    var empty = dialog.querySelector('[data-cmdk-empty]');
    var active = 0;        /* vị trí dòng đang được chọn trong các dòng còn hiện */

    function shown() {
      var out = [];
      for (var i = 0; i < rows.length; i++) { if (!rows[i].hidden) out.push(rows[i]); }
      return out;
    }

    function paint() {
      var list = shown();
      if (active >= list.length) active = list.length - 1;
      if (active < 0) active = 0;
      for (var i = 0; i < rows.length; i++) rows[i].classList.remove('is-on');
      if (list[active]) {
        list[active].classList.add('is-on');
        list[active].scrollIntoView({ block: 'nearest' });
      }
      empty.hidden = list.length > 0;
    }

    function filter() {
      var words = plain(input.value).split(/\s+/).filter(function (w) { return w; });
      for (var i = 0; i < rows.length; i++) {
        var target = rows[i].firstElementChild;
        var hay = plain(target.textContent) + ' ' + (target.getAttribute('data-k') || '');
        var ok = true;
        for (var w = 0; w < words.length; w++) { if (hay.indexOf(words[w]) === -1) ok = false; }
        rows[i].hidden = !ok;
      }
      active = 0;
      paint();
    }

    function open() {
      if (dialog.open) return;
      input.value = '';
      filter();
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
      input.focus();
    }

    function close() {
      if (dialog.open && dialog.close) dialog.close();
    }

    function run(target) {
      var cmd = target.getAttribute('data-cmd');
      if (!cmd) return;      /* dòng là liên kết: để trình duyệt tự chuyển trang */
      close();
      if (cmd === 'theme') {
        var other = document.querySelector('[data-theme-set][aria-pressed="false"]');
        if (other) other.click();
      } else if (cmd === 'chat') {
        var chat = document.querySelector('[data-chat-toggle]');
        if (chat) chat.click();
      } else if (cmd === 'account') {
        if (Account && Account.current()) {
          var chip = document.querySelector('[data-account-chip]');
          if (chip) window.location.href = chip.href;
        } else if (Account) {
          Account.open('login');
        }
      }
    }

    input.addEventListener('input', filter);
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active++; paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active--; paint(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var list = shown();
        if (list[active]) list[active].firstElementChild.click();
      }
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) { close(); return; }
      var target = e.target.closest ? e.target.closest('[data-cmd]') : null;
      if (target) run(target);
    });

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); open(); }
    });
    each('[data-cmdk-open]', function (btn) { btn.addEventListener('click', open); });
  }

  function init() {
    initCountdown();
    initSpotlight();
    initIdle();
    initScrollCalm();
    initPalette();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
