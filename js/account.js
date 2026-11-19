/* FixIT Student — tài khoản thành viên MÔ PHỎNG: đăng ký, đăng nhập, lịch sử đơn đã đặt.
   Không có máy chủ hay cơ sở dữ liệu: mọi thứ lưu trong trình duyệt qua FixStore (main.js).
   Vì vậy tài khoản chỉ tồn tại trên đúng trình duyệt đã tạo ra nó.
   Khách chưa đăng nhập vẫn xem web bình thường; riêng đặt lịch và xem đơn của mình thì cần tài khoản. */
(function () {
  'use strict';
  if (!window.FixStore) return;

  var Store = window.FixStore;
  var USERS_KEY = 'fixit_users_v1';      /* danh sách tài khoản: { khóa: thông tin } */
  var SESSION_KEY = 'fixit_session_v1';  /* khóa của người đang đăng nhập */
  var ORDERS_KEY = 'fixit_orders_v1';    /* các đơn do cart.js lưu, mỗi đơn có trường owner */

  /* Tiến trình đơn: giống hệt track.js (đổi trạng thái sau 0, 1, 3, 6 phút kể từ lúc thanh toán) */
  var STEPS = ['Đã nhận đơn', 'Đã xác nhận lịch hẹn', 'Đang xử lý', 'Sẵn sàng nhận máy'];
  var STAGE_AT_MIN = [0, 1, 3, 6];

  /* ---------- Đọc và ghi dữ liệu ---------- */
  function readJson(key) {
    try {
      return JSON.parse(Store.get(key) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function readUsers() {
    return readJson(USERS_KEY);
  }

  function writeUsers(all) {
    Store.set(USERS_KEY, JSON.stringify(all));
  }

  /* Khóa của một tên: chữ thường, bỏ dấu, bỏ khoảng trắng. "Minh Debug" và "minh debug" là một. */
  function keyOf(name) {
    var s = String(name).trim().toLowerCase();
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/đ/g, 'd');
    s = s.replace(/\s+/g, '');
    return s;
  }

  function current() {
    var key = Store.get(SESSION_KEY);
    if (!key) return null;
    var all = readUsers();
    if (!all[key]) return null;
    var user = all[key];
    user.key = key;
    return user;
  }

  function changed() {
    document.dispatchEvent(new CustomEvent('fixaccount:change'));
  }

  /* Các đơn của một tài khoản, đơn mới nhất đứng đầu */
  function ordersOf(user) {
    var all = readJson(ORDERS_KEY);
    var mine = [];
    Object.keys(all).forEach(function (code) {
      if (all[code].owner === user.key) mine.push(all[code]);
    });
    mine.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
    return mine;
  }

  /* Trạng thái hiện tại của một đơn */
  function statusOf(order) {
    if (!order.paidAt) return 'Chờ xác nhận thanh toán';
    var mins = (Date.now() - order.paidAt) / 60000;
    var stage = 0;
    STAGE_AT_MIN.forEach(function (m, i) { if (mins >= m) stage = i; });
    return STEPS[stage];
  }

  /* ---------- Băm mật khẩu ----------
     Mật khẩu không được lưu dạng chữ. Ta trộn nó với một chuỗi ngẫu nhiên (salt) rồi băm SHA-256.
     Lưu ý: dữ liệu vẫn nằm trên máy người dùng nên đây chỉ là mô phỏng, không phải bảo mật thật. */
  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return out;
  }

  function hashPassword(salt, password) {
    var text = salt + ':' + password;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(toHex);
    }
    /* Trình duyệt không có Web Crypto (ví dụ mở file trực tiếp): dùng hàm băm đơn giản thay thế */
    var h = 5381;
    for (var i = 0; i < text.length; i++) {
      h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    }
    return Promise.resolve('x' + h.toString(16));
  }

  function randomInt() {
    var buf = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    return buf[0];
  }

  /* ---------- Đăng ký, đăng nhập, đăng xuất ---------- */
  function register(name, password, avatar, major) {
    var key = keyOf(name);
    if (readUsers()[key]) return Promise.resolve({ ok: false, error: 'Tên này đã có trên trình duyệt này. Thử tên khác hoặc đăng nhập.' });
    var salt = randomInt().toString(16);
    return hashPassword(salt, password).then(function (hash) {
      var fresh = readUsers();
      fresh[key] = {
        name: String(name).trim(), salt: salt, hash: hash, avatar: avatar, major: major,
        no: Object.keys(fresh).length + 1, created: Date.now()
      };
      writeUsers(fresh);
      Store.set(SESSION_KEY, key);
      changed();
      return { ok: true };
    });
  }

  function login(name, password) {
    var user = readUsers()[keyOf(name)];
    if (!user) return Promise.resolve({ ok: false, error: 'Chưa có tài khoản tên này trên trình duyệt này.' });
    return hashPassword(user.salt, password).then(function (hash) {
      if (hash !== user.hash) return { ok: false, error: 'Sai mật khẩu. Thử lại nhé.' };
      Store.set(SESSION_KEY, keyOf(name));
      changed();
      return { ok: true, name: user.name };
    });
  }

  function logout() {
    Store.set(SESSION_KEY, '');
    changed();
  }

  function removeCurrent() {
    var user = current();
    if (!user) return;
    var all = readUsers();
    delete all[user.key];
    writeUsers(all);
    logout();
  }

  /* ---------- Thông báo nhỏ ở góc trái dưới ---------- */
  var toastHost = null;
  function toast(title, text) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'fx-toasts';
    }
    /* Hộp thoại đang mở nằm ở lớp trên cùng và che mọi thứ khác,
       nên lúc đó khung thông báo phải nằm bên trong hộp thoại thì mới nhìn thấy được */
    var home = document.querySelector('dialog[open]') || document.body;
    if (toastHost.parentNode !== home) home.appendChild(toastHost);
    var box = document.createElement('div');
    box.className = 'fx-toast';
    box.setAttribute('role', 'status');
    var head = document.createElement('p');
    head.className = 'fx-toast-k';
    head.textContent = title;
    var body = document.createElement('p');
    body.className = 'fx-toast-v';
    body.textContent = text;
    box.appendChild(head);
    box.appendChild(body);
    toastHost.appendChild(box);
    window.setTimeout(function () { box.classList.add('is-out'); }, 3800);
    window.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 4300);
  }

  /* ---------- Hình đại diện tự vẽ ----------
     Từ một con số (seed) sinh ra lưới 5 x 5 ô đối xứng trái phải. Cùng seed thì luôn ra cùng hình. */
  function makeRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function avatarSvg(seed) {
    var NS = 'http://www.w3.org/2000/svg';
    var rand = makeRandom(seed || 1);
    var colors = ['#730394', '#0000EE', '#100015'];
    var color = colors[Math.floor(rand() * colors.length)];
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 7 7');
    svg.setAttribute('aria-hidden', 'true');
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', '7');
    bg.setAttribute('height', '7');
    bg.setAttribute('fill', '#F0E3F3');
    svg.appendChild(bg);
    for (var row = 0; row < 5; row++) {
      for (var col = 0; col < 3; col++) {
        if (rand() < 0.5) continue;
        var cells = col === 2 ? [2] : [col, 4 - col];
        for (var c = 0; c < cells.length; c++) {
          var cell = document.createElementNS(NS, 'rect');
          cell.setAttribute('x', String(cells[c] + 1));
          cell.setAttribute('y', String(row + 1));
          cell.setAttribute('width', '1.02');
          cell.setAttribute('height', '1.02');
          cell.setAttribute('fill', color);
          svg.appendChild(cell);
        }
      }
    }
    return svg;
  }

  function putAvatar(host, seed) {
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(avatarSvg(seed));
  }

  function memberNo(n) {
    var s = String(n || 0);
    while (s.length < 4) s = '0' + s;
    return 'FX-' + s;
  }

  /* Ngày giờ dạng 19/11/2026, 10:42 */
  function dateText(ms, withTime) {
    var d = new Date(ms);
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    var out = two(d.getDate()) + '/' + two(d.getMonth() + 1) + '/' + d.getFullYear();
    if (withTime) out += ', ' + two(d.getHours()) + ':' + two(d.getMinutes());
    return out;
  }

  function each(selector, fn, root) {
    var list = (root || document).querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  /* ---------- Thẻ thành viên ---------- */
  function fillCard(card, data) {
    card.querySelector('[data-mcard-name]').textContent = data.name;
    card.querySelector('[data-mcard-no]').textContent = memberNo(data.no);
    card.querySelector('[data-mcard-since]').textContent = data.created ? 'Thành viên từ ' + dateText(data.created).slice(3) : 'Thành viên FixIT';
    card.querySelector('[data-mcard-orders]').textContent = String(data.orders || 0);
    putAvatar(card.querySelector('[data-mcard-ava]'), data.avatar);
  }

  var GUEST = { name: 'Tên của bạn', no: 0, avatar: 7, orders: 0 };

  /* ---------- Nút tài khoản trên header ---------- */
  function renderChips() {
    var user = current();
    each('[data-account-chip]', function (chip) {
      var label = chip.querySelector('[data-account-name]');
      var ava = chip.querySelector('[data-account-ava]');
      if (user) {
        label.textContent = user.name;
        putAvatar(ava, user.avatar);
        chip.classList.add('is-in');
        chip.setAttribute('aria-label', 'Trang thành viên của ' + user.name);
      } else {
        label.textContent = 'Log in';
        while (ava.firstChild) ava.removeChild(ava.firstChild);
        chip.classList.remove('is-in');
        chip.removeAttribute('aria-label');
      }
    });
  }

  /* ---------- Hộp thoại đăng nhập / đăng ký ---------- */
  var dialog = null, loginForm = null, signupForm = null, doneBox = null;
  var draft = { avatar: 7, major: 'Python' };   /* các lựa chọn đang làm dở khi đăng ký */
  var step = 1;

  function setTab(mode) {
    var isLogin = mode === 'login';
    each('[role="tab"]', function (tab) {
      tab.setAttribute('aria-selected', tab.getAttribute('data-auth-tab') === mode ? 'true' : 'false');
    }, dialog);
    var tabs = dialog.querySelector('[data-auth-tabs]');
    tabs.hidden = false;
    tabs.setAttribute('data-mode', mode);
    loginForm.hidden = !isLogin;
    signupForm.hidden = isLogin;
    doneBox.hidden = true;
    dialog.querySelector('[data-auth-title]').textContent = isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản thành viên';
    if (!isLogin) setStep(1);
    previewCard();
  }

  function setStep(n) {
    step = n;
    each('[data-step]', function (el) { el.hidden = Number(el.getAttribute('data-step')) !== n; }, signupForm);
    var dots = signupForm.querySelectorAll('.auth-steps li');
    for (var i = 0; i < dots.length; i++) dots[i].className = i < n ? 'is-on' : '';
    var first = signupForm.querySelector('[data-step="' + n + '"] input');
    if (first) first.focus();
  }

  /* Thẻ bên trái hộp thoại đổi theo những gì người dùng đang gõ */
  function previewCard() {
    var card = dialog.querySelector('[data-mcard-preview]');
    if (!card) return;
    var user = current();
    if (user && !doneBox.hidden) {
      fillCard(card, { name: user.name, no: user.no, avatar: user.avatar, created: user.created, orders: ordersOf(user).length });
      return;
    }
    var typed = signupForm.hidden ? loginForm.elements.name.value : signupForm.elements.name.value;
    /* Đang đăng nhập và tên gõ vào trùng một tài khoản có sẵn: hiện luôn thẻ của tài khoản đó */
    var known = signupForm.hidden ? readUsers()[keyOf(typed)] : null;
    if (known) {
      known.key = keyOf(typed);
      fillCard(card, { name: known.name, no: known.no, avatar: known.avatar, created: known.created, orders: ordersOf(known).length });
      return;
    }
    fillCard(card, {
      name: typed.trim() || GUEST.name,
      no: Object.keys(readUsers()).length + (signupForm.hidden ? 0 : 1),
      avatar: signupForm.hidden ? GUEST.avatar : draft.avatar,
      orders: 0
    });
  }

  function showError(el, message) {
    el.textContent = message || '';
    el.hidden = !message;
  }

  function shake(el) {
    el.classList.remove('is-shake');
    void el.offsetWidth;            /* buộc trình duyệt tính lại để animation chạy lại từ đầu */
    el.classList.add('is-shake');
  }

  /* Chấm độ mạnh mật khẩu từ 0 đến 4 */
  function strength(password) {
    if (password.length < 6) return 0;
    var score = 1;
    if (password.length >= 10) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) score++;
    return score;
  }
  var STRENGTH_TEXT = [
    'Ít nhất 6 ký tự.',
    'Yếu, nên dài hơn.',
    'Tạm ổn. Thêm số hoặc ký hiệu sẽ chắc hơn.',
    'Khá chắc.',
    'Rất chắc.'
  ];

  function nextStep() {
    if (step === 1) {
      var name = signupForm.elements.name.value.trim();
      var error = '';
      if (name.length < 2) error = 'Tên cần ít nhất 2 ký tự.';
      else if (!keyOf(name)) error = 'Tên cần có chữ hoặc số.';
      else if (readUsers()[keyOf(name)]) error = 'Tên này đã có trên trình duyệt này. Thử tên khác hoặc đăng nhập.';
      showError(signupForm.querySelector('#su-name-err'), error);
      if (error) { shake(signupForm.elements.name); return; }
      setStep(2);
    } else if (step === 2) {
      if (strength(signupForm.elements.pass.value) === 0) { shake(signupForm.elements.pass); return; }
      setStep(3);
      putAvatar(signupForm.querySelector('[data-ava-preview]'), draft.avatar);
    }
  }

  function openDialog(mode) {
    if (!dialog) return;
    setTab(mode === 'signup' ? 'signup' : 'login');
    showError(dialog.querySelector('[data-login-err]'), '');
    if (!dialog.open) {
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    }
    (mode === 'signup' ? signupForm : loginForm).elements.name.focus();
  }

  function closeDialog() {
    if (!dialog || !dialog.open) return;
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  }

  function bindDialog() {
    dialog = document.querySelector('[data-auth]');
    if (!dialog) return;
    loginForm = dialog.querySelector('[data-auth-login]');
    signupForm = dialog.querySelector('[data-auth-signup]');
    doneBox = dialog.querySelector('[data-auth-done]');

    each('[data-auth-tab]', function (btn) {
      btn.addEventListener('click', function () {
        setTab(btn.getAttribute('data-auth-tab'));
        (btn.getAttribute('data-auth-tab') === 'signup' ? signupForm : loginForm).elements.name.focus();
      });
    }, dialog);
    each('[data-auth-close]', function (btn) { btn.addEventListener('click', closeDialog); }, dialog);
    /* Bấm ra vùng tối bên ngoài hộp thoại thì đóng */
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });

    /* Nút Hiện / Ẩn mật khẩu */
    each('[data-pass-toggle]', function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.getAttribute('data-pass-toggle'));
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Ẩn' : 'Hiện';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
    }, dialog);

    loginForm.elements.name.addEventListener('input', previewCard);
    signupForm.elements.name.addEventListener('input', previewCard);

    /* Thanh đo độ mạnh mật khẩu */
    signupForm.elements.pass.addEventListener('input', function () {
      var score = strength(signupForm.elements.pass.value);
      dialog.querySelector('[data-meter]').setAttribute('data-score', String(score));
      dialog.querySelector('[data-meter-msg]').textContent = STRENGTH_TEXT[score];
    });

    each('[data-step-next]', function (btn) { btn.addEventListener('click', nextStep); }, signupForm);
    each('[data-step-back]', function (btn) { btn.addEventListener('click', function () { setStep(step - 1); }); }, signupForm);
    /* Nhấn Enter ở bước 1 và 2 thì sang bước kế, không gửi biểu mẫu */
    signupForm.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && step < 3) { e.preventDefault(); nextStep(); }
    });

    dialog.querySelector('[data-ava-roll]').addEventListener('click', function () {
      draft.avatar = randomInt();
      putAvatar(signupForm.querySelector('[data-ava-preview]'), draft.avatar);
      previewCard();
    });
    each('[data-major-opt]', function (chip) {
      chip.addEventListener('click', function () {
        draft.major = chip.getAttribute('data-major-opt');
        each('[data-major-opt]', function (other) {
          var on = other === chip;
          other.classList.toggle('is-active', on);
          other.setAttribute('aria-pressed', on ? 'true' : 'false');
        }, signupForm);
      });
    }, signupForm);

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errorBox = dialog.querySelector('[data-login-err]');
      login(loginForm.elements.name.value, loginForm.elements.pass.value).then(function (result) {
        if (!result.ok) {
          showError(errorBox, result.error);
          shake(loginForm);
          return;
        }
        loginForm.reset();
        closeDialog();
        toast('Chào lại, ' + result.name, 'Bạn đã đăng nhập');
      });
    });

    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (step !== 3) return;
      register(signupForm.elements.name.value, signupForm.elements.pass.value, draft.avatar, draft.major).then(function (result) {
        if (!result.ok) {
          showError(dialog.querySelector('[data-signup-err]'), result.error);
          return;
        }
        signupForm.reset();
        signupForm.hidden = true;
        dialog.querySelector('[data-auth-tabs]').hidden = true;
        dialog.querySelector('[data-auth-title]').textContent = 'Chào mừng bạn';
        dialog.querySelector('[data-done-name]').textContent = current().name;
        doneBox.hidden = false;
        previewCard();
        doneBox.querySelector('.auth-done-h').focus();
      });
    });
  }

  /* ---------- Trang thành viên ---------- */
  function renderPage() {
    var page = document.querySelector('[data-account-page]');
    if (!page) return;
    var user = current();
    var member = document.querySelector('[data-acc-member]');
    member.hidden = !user;
    page.querySelector('[data-acc-guest]').hidden = !!user;

    var orders = user ? ordersOf(user) : [];
    each('[data-mcard]', function (card) {
      if (card.hasAttribute('data-mcard-preview')) return;
      if (user) fillCard(card, { name: user.name, no: user.no, avatar: user.avatar, created: user.created, orders: orders.length });
      else fillCard(card, GUEST);
    });
    if (!user) {
      page.querySelector('[data-acc-hello]').textContent = 'Trang thành viên';
      page.querySelector('[data-acc-lead]').textContent = 'Đăng nhập để đặt lịch, theo dõi tiến trình và xem lại các đơn bạn đã đặt.';
      return;
    }
    page.querySelector('[data-acc-hello]').textContent = 'Chào ' + user.name;
    page.querySelector('[data-acc-lead]').textContent = orders.length
      ? 'Bạn đã đặt ' + orders.length + ' đơn. Theo dõi tiến trình từng đơn ngay bên dưới.'
      : 'Bạn chưa đặt đơn nào. Chọn dịch vụ và đặt lịch, đơn sẽ hiện ở trang này.';

    /* Danh sách đơn: mã, ngày đặt, dịch vụ, tổng tiền, trạng thái, nút Theo dõi */
    var list = member.querySelector('[data-acc-orders]');
    while (list.firstChild) list.removeChild(list.firstChild);
    orders.forEach(function (order) {
      var row = document.createElement('li');
      row.className = 'order';

      var head = document.createElement('div');
      head.className = 'order-head';
      var code = document.createElement('strong');
      code.className = 'order-code';
      code.textContent = order.code;
      var status = document.createElement('span');
      status.className = 'order-status';
      status.textContent = statusOf(order);
      head.appendChild(code);
      head.appendChild(status);

      var names = [];
      (order.items || []).forEach(function (item) { names.push(item.title); });
      var items = document.createElement('p');
      items.className = 'order-items';
      items.textContent = names.join(', ');

      var meta = document.createElement('p');
      meta.className = 'order-meta';
      meta.textContent = 'Đặt lúc ' + dateText(order.created, true) + ' · ' + (order.slot || '');

      var foot = document.createElement('div');
      foot.className = 'order-foot';
      var total = document.createElement('span');
      total.className = 'order-total';
      total.textContent = window.FixVnd ? window.FixVnd(order.total) : String(order.total);
      var link = document.createElement('a');
      link.className = 'btn btn--secondary btn--small';
      link.href = list.getAttribute('data-track-url') + '?code=' + encodeURIComponent(order.code);
      link.textContent = 'Theo dõi';
      foot.appendChild(total);
      foot.appendChild(link);

      row.appendChild(head);
      row.appendChild(items);
      row.appendChild(meta);
      row.appendChild(foot);
      list.appendChild(row);
    });
    member.querySelector('[data-acc-orders-empty]').hidden = orders.length > 0;
  }

  function bindPage() {
    var member = document.querySelector('[data-acc-member]');
    if (!member) return;
    member.querySelector('[data-acc-logout]').addEventListener('click', function () {
      logout();
      toast('Đã đăng xuất', 'Hẹn gặp lại bạn');
    });
    var deleteBtn = member.querySelector('[data-acc-delete]');
    deleteBtn.addEventListener('click', function () {
      /* Bấm lần đầu: hỏi lại. Bấm lần hai trong 4 giây: xóa thật. */
      if (deleteBtn.getAttribute('data-armed') !== '1') {
        deleteBtn.setAttribute('data-armed', '1');
        deleteBtn.textContent = 'Bấm lần nữa để xóa hẳn';
        window.setTimeout(function () {
          deleteBtn.removeAttribute('data-armed');
          deleteBtn.textContent = 'Xóa tài khoản này';
        }, 4000);
        return;
      }
      removeCurrent();
      toast('Đã xóa tài khoản', 'Tài khoản này không còn trên trình duyệt');
    });
  }

  /* Thẻ thành viên nghiêng theo con trỏ chuột */
  function bindTilt() {
    each('[data-mcard-tilt]', function (card) {
      card.addEventListener('pointermove', function (e) {
        var box = card.getBoundingClientRect();
        var x = (e.clientX - box.left) / box.width - 0.5;
        var y = (e.clientY - box.top) / box.height - 0.5;
        card.style.transform = 'perspective(900px) rotateY(' + (x * 14).toFixed(2) + 'deg) rotateX(' + (-y * 12).toFixed(2) + 'deg)';
        card.style.setProperty('--shine-x', ((x + 0.5) * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* ---------- Việc cần tài khoản ----------
     Biểu mẫu đặt lịch ở giỏ hàng chỉ hiện khi đã đăng nhập; khách thấy khung [data-gate] thay vào đó. */
  function syncGates() {
    var user = current();
    each('[data-gate]', function (gate) {
      gate.hidden = !!user;
      var locked = document.querySelector(gate.getAttribute('data-gate'));
      if (locked) locked.hidden = !user;
    });
  }

  function bindGates() {
    /* Chặn thêm một lớp: lỡ biểu mẫu đặt lịch bị gửi khi chưa đăng nhập thì dừng lại và mở hộp thoại.
       Tham số true = bắt sự kiện ở pha "capture", tức là chạy trước code xử lý gửi đơn của cart.js. */
    document.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-cart-form]') || current()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openDialog('login');
    }, true);
  }

  /* Trang chủ: thành viên được chào bằng tên ở dòng chữ nhỏ trên khẩu hiệu */
  function renderHello() {
    var line = document.querySelector('[data-hello]');
    if (!line) return;
    if (!line.getAttribute('data-hello')) line.setAttribute('data-hello', line.textContent);
    var user = current();
    line.textContent = user ? 'Chào ' + user.name + ', hôm nay máy bạn ổn chứ?' : line.getAttribute('data-hello');
  }

  function renderAll() {
    syncGates();
    renderChips();
    renderPage();
    renderHello();
  }

  function init() {
    bindDialog();
    bindPage();
    bindTilt();
    bindGates();

    /* Nút trên header: đã đăng nhập thì đi tới trang thành viên, chưa thì mở hộp thoại */
    each('[data-account-chip]', function (chip) {
      chip.addEventListener('click', function (e) {
        if (current()) return;
        e.preventDefault();
        openDialog('login');
      });
    });
    each('[data-account-open]', function (btn) {
      btn.addEventListener('click', function () { openDialog(btn.getAttribute('data-account-open')); });
    });

    document.addEventListener('fixaccount:change', renderAll);
    renderAll();
  }

  window.FixAccount = { current: current, open: openDialog, logout: logout, toast: toast };

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
