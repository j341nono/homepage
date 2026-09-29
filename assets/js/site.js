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
  // スクリーンショットのカルーセル
  // ==================================================
  function setupCarousel(carousel) {
    var slides = Array.from(carousel.querySelectorAll(".engineering-carousel-slide"));
    var dots = Array.from(carousel.querySelectorAll("[data-slide-index]"));
    var current = 0;
    var touchStart = null;

    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (slide, slideIndex) {
        slide.hidden = slideIndex !== current;
      });
      dots.forEach(function (dot, dotIndex) {
        if (dotIndex === current) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });
    }

    carousel.querySelector("[data-carousel-prev]").addEventListener("click", function () {
      show(current - 1);
    });
    carousel.querySelector("[data-carousel-next]").addEventListener("click", function () {
      show(current + 1);
    });
    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        show(Number(dot.dataset.slideIndex));
      });
    });

    carousel.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
    carousel.addEventListener("touchstart", function (event) {
      touchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }, { passive: true });
    carousel.addEventListener("touchend", function (event) {
      if (!touchStart) return;
      var differenceX = event.changedTouches[0].clientX - touchStart.x;
      var differenceY = event.changedTouches[0].clientY - touchStart.y;
      if (Math.abs(differenceX) > 40 && Math.abs(differenceX) > Math.abs(differenceY)) {
        show(current + (differenceX < 0 ? 1 : -1));
      }
      touchStart = null;
    }, { passive: true });

    show(0);
    carousel.classList.add("is-ready");
  }

  document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
})();
