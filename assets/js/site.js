(function () {
  "use strict";

  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");

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
