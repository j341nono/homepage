(function () {
  "use strict";

  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");

  var languageSwitch = document.querySelector("[data-language-switch]");

  // ==================================================
  // 下へ読む間は隠し、上へ戻ると再表示するヘッダー
  // ==================================================
  var header = document.querySelector(".site-header");
  if (header) {
    var headerHeight = 0;
    var scrollDirection = 0;
    var scrollDistance = 0;
    var scrollPending = false;

    function scrollPosition() {
      // モバイルの上下端でのバウンドを方向転換として扱わない。
      var maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(maximum, Math.max(0, window.scrollY));
    }

    var lastScrollPosition = scrollPosition();

    function measureHeader() {
      headerHeight = Math.ceil(header.getBoundingClientRect().height);
      root.style.setProperty("--site-header-height", headerHeight + "px");
    }

    function showHeader() {
      header.classList.remove("is-scroll-hidden");
      scrollDistance = 0;
    }

    function updateHeader() {
      scrollPending = false;
      var position = scrollPosition();
      var delta = position - lastScrollPosition;
      var direction = Math.sign(delta);

      if (direction && direction !== scrollDirection) {
        scrollDirection = direction;
        scrollDistance = 0;
      }
      scrollDistance += Math.abs(delta);
      lastScrollPosition = position;

      // 先頭付近、言語メニューの展開中、キーボードでの操作中は表示を保つ。
      if (position <= headerHeight || (languageSwitch && languageSwitch.open) || header.querySelector(":focus-visible")) {
        showHeader();
      } else if (scrollDistance >= 12) {
        header.classList.toggle("is-scroll-hidden", direction > 0);
        scrollDistance = 0;
      }
    }

    header.classList.add("is-scroll-aware");
    measureHeader();
    window.addEventListener("scroll", function () {
      if (!scrollPending) {
        scrollPending = true;
        window.requestAnimationFrame(updateHeader);
      }
    }, { passive: true });
    window.addEventListener("resize", measureHeader);
    if (window.ResizeObserver) {
      new ResizeObserver(measureHeader).observe(header);
    }
    header.addEventListener("focusin", showHeader);
    if (languageSwitch) {
      languageSwitch.addEventListener("toggle", function () {
        if (languageSwitch.open) showHeader();
      });
    }
  }

  if (languageSwitch) {
    document.addEventListener("click", function (event) {
      if (!languageSwitch.contains(event.target)) languageSwitch.open = false;
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && languageSwitch.open) {
        languageSwitch.open = false;
        languageSwitch.querySelector("summary").focus();
      }
    });
  }

  // ==================================================
  // テーマ切り替え
  // ==================================================
  function storedTheme() {
    try { return localStorage.getItem("portfolio-theme"); } catch (error) { return null; }
  }

  function setTheme(theme, save) {
    root.dataset.theme = theme;
    if (toggle) {
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
    if (save) {
      try { localStorage.setItem("portfolio-theme", theme); } catch (error) {}
    }
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key === "portfolio-theme") {
      setTheme(event.newValue === "dark" ? "dark" : "light", false);
    }
  });

  if (window.matchMedia) {
    var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    if (systemTheme.addEventListener) {
      systemTheme.addEventListener("change", function (event) {
        if (!storedTheme()) setTheme(event.matches ? "dark" : "light", false);
      });
    }
  }

  setTheme(root.dataset.theme === "dark" ? "dark" : "light", false);

  // ==================================================
  // Home のセクション開閉。JS がない場合は本文を表示し続ける。
  // ==================================================
  var collapsibleSections = [];
  document.querySelectorAll("[data-section-toggle]").forEach(function (button) {
    var content = document.getElementById(button.getAttribute("aria-controls"));
    if (!content) return;

    function setExpanded(expanded) {
      var label = expanded ? button.dataset.collapseLabel : button.dataset.expandLabel;
      content.hidden = !expanded;
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
      button.setAttribute("aria-label", button.dataset.sectionTitle + ": " + label);
      button.setAttribute("title", label);
    }

    button.addEventListener("click", function () {
      setExpanded(button.getAttribute("aria-expanded") !== "true");
    });
    button.hidden = false;
    collapsibleSections.push({
      section: button.closest("[data-collapsible-section]"),
      content: content,
      setExpanded: setExpanded
    });
  });

  // ページ内リンクで移動した先が閉じている場合は開く。
  function revealHashSection() {
    var id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (error) { return; }
    var target = id && document.getElementById(id);
    if (!target) return;
    var revealed = false;
    collapsibleSections.forEach(function (entry) {
      if (entry.content.hidden && entry.section.contains(target)) {
        entry.setExpanded(true);
        revealed = true;
      }
    });
    if (revealed) target.scrollIntoView({ block: "start" });
  }
  window.addEventListener("hashchange", revealHashSection);
  revealHashSection();

  // ==================================================
  // Products のカテゴリ絞り込み
  // ==================================================
  var filter = document.querySelector("[data-products-filter]");

  if (filter) {
    var filterButtons = Array.from(filter.querySelectorAll("[data-filter]"));
    var productCards = Array.from(document.querySelectorAll(".products-card[data-categories]"));

    function applyFilter(category) {
      filterButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", button.dataset.filter === category ? "true" : "false");
      });
      productCards.forEach(function (card) {
        card.hidden = category !== "all" && card.dataset.categories.split("|").indexOf(category) === -1;
      });
    }

    filterButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        applyFilter(button.dataset.filter);
      });
    });

    // JS が動かない環境では絞り込みを出さず、全件をそのまま見せる
    filter.hidden = false;
  }
})();
