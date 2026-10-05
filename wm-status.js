/* we make! вместе — даты, таймер и статус СЗ на makers-shop.team из одного файла.
 *
 * Подключается один раз в Тильде (Настройки сайта → Ещё → HTML-код для вставки внутрь
 * HEAD): <script src="…/wm-status.js" defer></script>. Данные — sz-status.json рядом со
 * скриптом; их собирает скрипты/поставки-cs.py из Planfix, писем склада, чата и
 * трекинга Атлантика, МоегоСклада.
 *
 * Что делает — только поверх уже опубликованных блоков Тильды, дизайн не трогает:
 *  1. таймер (блоки T415 на главной и в каталоге): «с ДД/ММ по ДД/ММ» и отсчёт до
 *     дедлайна текущей СЗ;
 *  2. страница статуса /about-status/order?n=26 (копия страницы order0025): заголовок
 *     и список этапов (блок T508) — пройденные с галочкой, текущий с точкой;
 *  3. поиск на /about-status: номер закупки ведёт на страницу статуса;
 *  4. корзина (блок T706): скрытое поле sz = номер текущей СЗ («0026») — его подставляет
 *     письмо покупателю ({{sz}} в шаблоне: Тильда → Платёжные системы → Общие настройки),
 *     номер в письме больше не правится руками.
 *
 * Правило: любая ошибка (файл не загрузился, Тильда поменяла разметку) — страница
 * остаётся такой, как опубликована. На <html> ставится data-wm-status: ok / fallback —
 * по нему ежедневная проверка понимает, что скрипт отработал.
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var BASE = me && me.src ? me.src.replace(/[^/]*$/, "") : "";
  var DATA_URL = (me && me.getAttribute("data-src")) || BASE + "sz-status.json";
  var root = document.documentElement;
  var PATH = window.WM_TEST_PATH || location.pathname;      // подмена адреса — только для проверки
  var QUERY = window.WM_TEST_QUERY || location.search;
  // номер текущей СЗ на случай, если sz-status.json не загрузился: подставляет скрипты/опубликовать-статус.py
  // при каждой публикации (в репозитории здесь null). Без него письмо покупателю ушло бы без номера закупки.
  var ЗАПАС_СЗ = 26;

  function mark(state, why) {
    root.setAttribute("data-wm-status", state);
    if (why) root.setAttribute("data-wm-status-why", String(why).slice(0, 200));
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ddmm(iso) { var p = iso.split("-"); return p[2] + "/" + p[1]; }
  function sz4(n) { return ("000" + n).slice(-4); }
  function ready(fn) {
    if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn);
  }
  function load() {
    if (window.WM_STATUS) return Promise.resolve(window.WM_STATUS);       // для проверки без сети
    return fetch(DATA_URL + "?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  // ── 1. таймер ──────────────────────────────────────────────────────────────
  function timers(cur) {
    var blocks = document.querySelectorAll(".t415");
    if (!blocks.length) return 0;
    var deadline = new Date(cur.deadline).getTime();
    if (isNaN(deadline)) throw new Error("bad deadline");
    var range = "с " + ddmm(cur.from) + " по " + ddmm(cur.to);
    var tickers = [];
    Array.prototype.forEach.call(blocks, function (b) {
      // даты в тексте: меняем только сам фрагмент «с ДД/ММ по ДД/ММ», стили остаются
      var walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null), node;
      while ((node = walker.nextNode())) {
        if (/с \d{2}\/\d{2} по \d{2}\/\d{2}/.test(node.nodeValue))
          node.nodeValue = node.nodeValue.replace(/с \d{2}\/\d{2} по \d{2}\/\d{2}/, range);
      }
      // числа: свежие копии отвязывают отсчёт Тильды от опубликованной даты
      var spans = {};
      ["days", "hours", "minutes", "seconds"].forEach(function (k) {
        var old = b.querySelector(".t415__" + k);
        if (!old) return;
        var fresh = old.cloneNode(true); old.parentNode.replaceChild(fresh, old); spans[k] = fresh;
      });
      tickers.push(spans);
    });
    function tick() {
      var t = Math.max(0, deadline - Date.now());
      var v = { days: Math.floor(t / 864e5), hours: Math.floor(t / 36e5) % 24,
                minutes: Math.floor(t / 6e4) % 60, seconds: Math.floor(t / 1e3) % 60 };
      tickers.forEach(function (s) { for (var k in s) s[k].textContent = pad(v[k]); });
      if (t <= 0) clearInterval(iv);
    }
    tick(); var iv = setInterval(tick, 1000);
    return blocks.length;
  }

  // ── 2. страница статуса ───────────────────────────────────────────────────
  function statusPage(data) {
    if (!/\/about-status\/order\/?$/.test(PATH)) return 0;
    var m = QUERY.match(/[?&]n=0*(\d{1,4})/);
    var list = document.querySelector(".t508 ul, .t508__container");
    if (!m || !list) return 0;
    var sz = data.sz[String(+m[1])];
    var title = document.querySelector(".t-section__title");
    if (!sz) {
      if (title) title.textContent = "закупка №" + sz4(+m[1]) + " не найдена — проверьте номер в письме";
      list.style.display = "none";
      return 1;
    }
    var items = list.querySelectorAll("li.t-item");
    var tplDone = items[0], tplNow = items[items.length - 1];
    var stages = sz.stages;
    var html = document.createDocumentFragment();
    stages.forEach(function (s, i) {
      var last = i === stages.length - 1;
      var li = ((last && !sz.done) ? tplNow : tplDone).cloneNode(true);
      var name = li.querySelector(".t-name"), descr = li.querySelector(".t508__descr, .t-descr");
      if (name) name.textContent = s.title;
      if (descr) descr.textContent = s.date || "";
      html.appendChild(li);
    });
    Array.prototype.forEach.call(items, function (li) { li.parentNode.removeChild(li); });
    list.appendChild(html);
    var label = "статус совместной закупки №" + sz4(sz.n);
    if (title) {
      var inner = title.querySelector("div") || title;
      inner.textContent = label;
    }
    document.title = "Закупка №" + sz4(sz.n) + " - " + (sz.done ? "завершена" : "в процессе");
    return 1;
  }

  // ── 3. поиск по номеру ────────────────────────────────────────────────────
  function search(data) {
    if (!/\/about-status\/?$/.test(PATH)) return 0;
    var input = document.querySelector(".t838__input");
    if (!input) return 0;
    function go(e) {
      var m = String(input.value || "").match(/^\s*№?\s*0*(\d{1,4})\s*$/);
      if (!m || !data.sz[String(+m[1])]) return;                // не номер или старая СЗ — поиск Тильды
      if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
      location.href = "/about-status/order?n=" + (+m[1]);
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(e); }, true);
    var form = input.closest("form"); if (form) form.addEventListener("submit", go, true);
    var btn = input.closest(".t838") && input.closest(".t838").querySelector("button, .t838__blockbutton, .t-submit");
    if (btn) btn.addEventListener("click", go, true);
    return 1;
  }

  // ── 4. номер СЗ в заказе ──────────────────────────────────────────────────
  // 04.10.2026 вечером шесть писем подряд ушли без номера, хотя на открытой странице поле стояло. Поэтому поле
  // ставится не один раз при загрузке, а: сразу; в каждую форму корзины, которую Тильда дорисует позже; и ещё
  // раз в момент «Оформить заказ» (до того, как Тильда соберёт форму). Номер — из данных, а без них — ЗАПАС_СЗ.
  var cartN = null;
  function putField(f) {
    if (!cartN) return;
    var i = f.querySelector('input[name="sz"]');
    if (!i) { i = document.createElement("input"); i.type = "hidden"; i.name = "sz"; f.appendChild(i); }
    i.value = sz4(cartN);
  }
  function allCarts() { Array.prototype.forEach.call(document.querySelectorAll('form[data-formcart="y"]'), putField); }
  var cartWatched = false;
  function watchCarts() {
    if (cartWatched) return; cartWatched = true;
    function onSend(e) {
      var f = e.target && e.target.closest && e.target.closest('form[data-formcart="y"]');
      if (f) putField(f);
    }
    document.addEventListener("submit", onSend, true);           // перехват раньше обработчиков Тильды
    document.addEventListener("click", onSend, true);
    document.addEventListener("touchstart", onSend, true);
    if (window.MutationObserver) new MutationObserver(allCarts).observe(document.documentElement, { childList: true, subtree: true });
  }
  function cartField(cur) {
    cartN = cur && cur.n ? cur.n : cartN;
    watchCarts(); allCarts();
    return document.querySelectorAll('form[data-formcart="y"]').length ? 1 : 0;
  }

  ready(function () {
    if (ЗАПАС_СЗ) { try { cartField({ n: ЗАПАС_СЗ }); } catch (e) {} }    // номер в корзине есть, даже если данные не придут
    load().then(function (data) {
      var done = 0;
      try { done += timers(data.current); } catch (e) { mark("fallback", "timer: " + e.message); return; }
      try { done += statusPage(data); } catch (e) { mark("fallback", "status: " + e.message); return; }
      try { done += search(data); } catch (e) { mark("fallback", "search: " + e.message); return; }
      try { done += cartField(data.current); } catch (e) { mark("fallback", "cart: " + e.message); return; }
      root.setAttribute("data-wm-sz", String(data.current.n));
      mark("ok");
    }).catch(function (e) { mark("fallback", "load: " + e.message); });
  });
})();
