/* =========================================================================
   Site behavior: mobile nav, footer year, hero graph (signature),
   and data-driven publication list rendered from data/publications.json.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- footer year ---- */
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* ---- mobile nav ---- */
  var toggle = document.querySelector(".nav__toggle");
  var links = document.querySelector(".nav__links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* =======================================================================
     HERO GRAPH — nodes and edges, a nod to graph neural networks + 3D mesh.
     Restrained monochrome maroon/ink with faint spectral node tints. Honors
     prefers-reduced-motion by rendering a single static frame.
     ===================================================================== */
  var canvas = document.querySelector(".hero__canvas");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var css = getComputedStyle(document.documentElement);
    var MAROON = css.getPropertyValue("--maroon").trim() || "#7c1d2b";
    var TINTS = ["--s1", "--s2", "--s3", "--s4", "--s5"].map(function (v) {
      return css.getPropertyValue(v).trim();
    });
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var W, H, DPR, nodes = [];
    var LINK_DIST = 150;

    function hexToRgb(hex) {
      hex = hex.replace("#", "");
      if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
      var n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var MRGB = hexToRgb(MAROON);

    function seed() {
      var rect = canvas.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = W * DPR; canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var count = Math.max(18, Math.min(46, Math.round((W * H) / 22000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: 1.6 + Math.random() * 2.2,
          tint: Math.random() < 0.28 ? TINTS[Math.floor(Math.random() * TINTS.length)] : null
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // edges
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i], b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_DIST) {
            var alpha = (1 - d / LINK_DIST) * 0.16;
            ctx.strokeStyle = "rgba(" + MRGB[0] + "," + MRGB[1] + "," + MRGB[2] + "," + alpha + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      // nodes
      for (var k = 0; k < nodes.length; k++) {
        var p = nodes[k];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.tint ? hexA(p.tint, 0.55) : "rgba(" + MRGB[0] + "," + MRGB[1] + "," + MRGB[2] + ",0.5)";
        ctx.fill();
      }
    }

    function hexA(hex, a) {
      var c = hexToRgb(hex);
      return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
    }

    function step() {
      for (var i = 0; i < nodes.length; i++) {
        var p = nodes[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    var raf;
    function start() {
      seed();
      if (reduce) { draw(); }
      else { cancelAnimationFrame(raf); step(); }
    }
    start();

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(start, 200);
    });
    // pause when hero scrolled out of view
    if ("IntersectionObserver" in window && !reduce) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { if (!raf) step(); }
          else { cancelAnimationFrame(raf); raf = null; }
        });
      }).observe(canvas);
    }
  }

  /* =======================================================================
     PUBLICATIONS — fetch JSON, group by section, render, filter.
     ===================================================================== */
  var SECTIONS = [
    { key: "journal",       label: "Journal articles" },
    { key: "book",          label: "Book chapters" },
    { key: "international",  label: "International conferences" },
    { key: "national",      label: "National conferences" }
  ];
  var OWNER = /Cruz-?Guerrero,?\s*I\.?\s*A\.?/;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function highlightMe(authors) {
    // bold the site owner's name within the author string
    return esc(authors).replace(
      /(Cruz-Guerrero,?\s*I\.?\s*A\.?)/,
      '<span class="me">$1</span>'
    );
  }

  function pubHTML(p) {
    var title = p.url
      ? '<a href="' + esc(p.url) + '">' + esc(p.title) + "</a>"
      : esc(p.title);
    var det = p.details ? ' <span class="det">' + esc(p.details) + "</span>" : "";
    return (
      '<div class="pub" data-section="' + esc(p.section) + '">' +
        '<div class="pub__year">' + esc(p.year) + "</div>" +
        "<div>" +
          '<p class="pub__title">' + title + "</p>" +
          '<p class="pub__authors">' + highlightMe(p.authors) + "</p>" +
          '<p class="pub__venue">' + esc(p.venue) + det + "</p>" +
        "</div>" +
      "</div>"
    );
  }

  function render(data) {
    var list = document.getElementById("pubList");
    var countEl = document.getElementById("pubCount");
    if (!list) return;
    var pubs = (data.publications || []).slice();
    // newest first within each section
    pubs.sort(function (a, b) { return b.year - a.year; });

    var html = "";
    SECTIONS.forEach(function (sec) {
      var group = pubs.filter(function (p) { return p.section === sec.key; });
      if (!group.length) return;
      html +=
        '<h3 class="pub-group__title" data-section="' + sec.key + '">' +
        esc(sec.label) + " <span>" + group.length + "</span></h3>";
      html += group.map(pubHTML).join("");
    });
    list.innerHTML = html || '<p class="pub-empty">No publications found.</p>';
    if (countEl) countEl.textContent = pubs.length + " items";
    if (data.last_updated) {
      var note = document.createElement("p");
      note.className = "pub-note";
      note.style.marginTop = "2rem";
      note.textContent = "Last updated " + data.last_updated + ".";
      list.appendChild(note);
    }
    wireFilters();
  }

  function wireFilters() {
    var buttons = document.querySelectorAll("#pubFilters .filter");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var f = btn.getAttribute("data-filter");
        document.querySelectorAll("#pubList .pub, #pubList .pub-group__title")
          .forEach(function (el) {
            var show = f === "all" || el.getAttribute("data-section") === f;
            el.style.display = show ? "" : "none";
          });
      });
    });
  }

  fetch("data/publications.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function (err) {
      var list = document.getElementById("pubList");
      if (list) {
        list.innerHTML =
          '<p class="pub-empty">Could not load publications (' + esc(err.message) +
          "). If you are viewing this file directly, run a local server " +
          "(python3 -m http.server) or view it on GitHub Pages.</p>";
      }
    });
})();
