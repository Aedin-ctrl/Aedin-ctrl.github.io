/* The terminal shell: command line, keyboard, panel rendering, tape, status. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const state = {
    security: null,
    fn: null,
    history: [],
    hpos: -1,
    busy: false,
    lastCmd: null,
  };

  const FKEYS = [
    ["F1", "HELP"], ["F2", "DES"], ["F3", "GP"], ["F4", "FA"],
    ["F5", "CN"], ["F6", "TOP"], ["F7", "WEI"], ["F8", "ECST"],
  ];
  const QUICK = [
    ["DES", "Description"], ["GP", "Price graph"], ["GIP", "Intraday"],
    ["TECH", "Technicals"], ["FA", "Financials"], ["GF", "Fundamentals"],
    ["EE", "Estimates"], ["ERN", "Earnings"], ["ANR", "Analysts"],
    ["CN", "Company news"], ["CF", "SEC filings"], ["HDS", "Holders"],
    ["DVD", "Dividends"], ["RV", "Peers"], ["SI", "Short interest"],
  ];
  const BOOT_TILES = [
    ["WEI", "World indices"], ["TOP", "Top news"], ["GMM", "Macro movers"],
    ["MOST", "Most active"], ["SECT", "Sectors"], ["ECST", "Economics"],
    ["GC", "Yield curve"], ["ECO", "Econ calendar"], ["CRYP", "Crypto"],
    ["FXC", "Currencies"], ["CMDT", "Commodities"], ["HELP", "All functions"],
  ];

  /* ------------------------------------------------------------ formatting */
  const NBSP = " ";
  function num(v, dp) {
    if (v == null || !isFinite(v)) return "--";
    return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function big(v) {
    if (v == null || !isFinite(v)) return "--";
    const a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e12) return s + (a / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(2) + "K";
    return s + a.toFixed(2);
  }
  /* Decimals follow the *level* of the instrument, not the size of the move:
     a 0.58 change on a 7,969 index is still a 2-decimal number. */
  function dpFor(ref) { return ref != null && Math.abs(ref) < 2 && ref !== 0 ? 4 : 2; }
  const FMT = {
    price: (v) => num(v, dpFor(v)),
    num1: (v) => num(v, 1),
    num2: (v) => num(v, 2),
    int: (v) => (v == null ? "--" : Math.round(v).toLocaleString("en-US")),
    vol: (v) => window.Charts.fmtVol(v),
    big: (v) => big(v),
    pct: (v) => (v == null ? "--" : num(v, 2) + "%"),      // already a percentage
    pctraw: (v) => (v == null ? "--" : num(v, 2) + "%"),
    pct01: (v) => (v == null ? "--" : num(v * 100, 2) + "%"), // a 0-1 fraction
    text: (v) => (v == null || v === "" ? "--" : String(v)),
    dim: (v) => (v == null ? "" : String(v)),
    list: (v) => (Array.isArray(v) ? v.join(", ") : v || ""),
  };
  function fmt(v, f) { return (FMT[f] || FMT.text)(v); }

  function toneOf(v, signed) {
    if (!signed || v == null || !isFinite(v)) return "";
    return v > 0 ? "up" : v < 0 ? "down" : "flat";
  }
  /* classList.add("") throws a DOMTokenList error and takes the whole panel
     with it, so every tone application goes through here. */
  function addTone(node, tone) { if (tone) node.classList.add(tone); }
  function signedText(v, f) {
    const s = fmt(v, f);
    return v > 0 && s !== "--" ? "+" + s : s;
  }

  /* --------------------------------------------------------------- fetch */
  /* Two deployments, one app. Served by the backend or the Pi, everything is
     same-origin and there is no key. Embedded as a tab on the website, the
     page is static HTML on a CDN and the data comes from the Pi over its
     tunnel, so it needs a base address and the key that opens the gate.
     The key arrives in the page's own fragment (#k=...), which the browser
     never sends anywhere -- the page reads it and puts it in a header. */
  const API_BASE = (window.TERMINAL_API_BASE || "").replace(/\/$/, "");
  const API_KEY = window.TERMINAL_KEY || "";

  async function api(path) {
    const headers = { Accept: "application/json" };
    if (API_KEY) headers.Authorization = "Bearer " + API_KEY;
    let r;
    try {
      r = await fetch(API_BASE + path, { headers, credentials: "omit" });
    } catch (e) {
      /* A dead tunnel or a sleeping Pi is a network error, not an HTTP one;
         without this the whole screen dies on an uncaught rejection. */
      return { status: 0, body: { ok: false, error: "cannot reach the terminal service" },
               stale: null };
    }
    if (r.status === 401) {
      return { status: 401, body: { ok: false, error: "This tab is locked." }, stale: null };
    }
    const body = await r.json().catch(() => ({ ok: false, error: "bad response from server" }));
    return { status: r.status, body, stale: r.headers.get("X-Terminal-Stale") };
  }

  /* -------------------------------------------------------------- render */
  function renderHeader(h, screen) {
    const bar = $("sechdr");
    bar.innerHTML = "";
    if (!h) {
      // No security loaded: name the screen instead, so a market function is
      // never an anonymous grid of panels.
      if (!screen || !screen.title) { bar.hidden = true; return; }
      bar.hidden = false;
      bar.classList.add("titleonly");
      bar.append(el("div", "sh-tick", screen.fn));
      bar.append(el("div", "sh-title", screen.title));
      if (screen.subtitle) bar.append(el("div", "sh-subtitle", screen.subtitle));
      return;
    }
    bar.classList.remove("titleonly");
    bar.hidden = false;
    bar.append(el("div", "sh-tick", h.symbol));
    bar.append(el("div", "sh-name", h.name || ""));
    const px = el("div", "sh-px", fmt(h.last, "price"));
    const tone = toneOf(h.change_pct, true);
    const dp = dpFor(h.last);
    const chgTxt = h.change == null ? "--"
      : (h.change > 0 ? "+" : "") + num(h.change, dp);
    const chg = el("div", "sh-chg " + tone,
      `${chgTxt}${NBSP}${NBSP}${signedText(h.change_pct, "pctraw")}`);
    bar.append(px, chg);

    const meta = el("div", "sh-meta");
    const cell = (k, v, cls) => {
      const d = el("div", "sh-cell");
      d.append(el("dt", null, k), el("dd", cls || null, v));
      return d;
    };
    if (h.post_price != null) {
      meta.append(cell("POST MKT",
        `${fmt(h.post_price, "price")} ${signedText(h.post_change_pct, "pctraw")}`,
        toneOf(h.post_change_pct, true)));
    }
    if (h.volume != null) meta.append(cell("VOLUME", fmt(h.volume, "vol")));
    if (h.exchange) meta.append(cell("EXCHANGE", h.exchange));
    if (h.currency) meta.append(cell("CCY", h.currency));
    if (h.market_state) {
      const d = el("div", "sh-cell");
      const s = el("span", "sh-state state-" + h.market_state, h.market_state);
      d.append(el("dt", null, "STATUS"), el("dd", null, ""));
      d.lastChild.append(s);
      meta.append(d);
    }
    bar.append(meta);
  }

  function panelShell(p) {
    const wrap = el("section", "panel" + (p.wide ? " wide" : "") + (p.tall ? " tall" : ""));
    const head = el("div", "panel-head");
    head.append(el("span", null, p.title || ""));
    if (p.subtitle) head.append(el("span", "ph-sub", p.subtitle));
    wrap.append(head);
    const body = el("div", "panel-body");
    wrap.append(body);
    if (p.tabs && p.tabs.length) {
      const tabs = el("div", "tabs");
      p.tabs.forEach((t) => {
        const b = el("button", null, t.label);
        b.type = "button";
        b.addEventListener("click", () => execute(t.cmd));
        tabs.append(b);
      });
      body.append(tabs);
    }
    if (p.spans && p.spans.length) {
      const sb = el("div", "spanbar");
      p.spans.forEach((s) => {
        const b = el("button", null, s);
        b.type = "button";
        if (p.currentSpan === s) b.setAttribute("aria-pressed", "true");
        b.addEventListener("click", () =>
          execute(`${state.security || ""} ${state.fn} ${s}`.trim()));
        sb.append(b);
      });
      body.append(sb);
    }
    if (p.footer) wrap.append(el("div", "panel-foot", p.footer));
    return { wrap, body };
  }

  const RENDER = {
    kv(p, body) {
      const dl = el("dl", "kv");
      dl.style.gridTemplateColumns = `repeat(${Math.max(1, p.cols || 2)}, minmax(0,1fr))`;
      (p.items || []).forEach((it) => {
        const row = el("div", "kv-item" + (it.big ? " big" : "") + (it.span === 2 ? " span2" : ""));
        row.append(el("dt", null, it.k));
        const dd = el("dd");
        addTone(dd, it.tone || toneOf(it.v, it.signed));
        if (it.f === "link" && it.v) {
          const a = el("a", "doclink", it.v);
          a.href = it.v; a.target = "_blank"; a.rel = "noopener noreferrer";
          dd.append(a);
        } else {
          dd.textContent = it.signed ? signedText(it.v, it.f) : fmt(it.v, it.f);
        }
        row.append(dd);
        dl.append(row);
      });
      body.append(dl);
    },

    table(p, body) {
      const wrap = el("div", "tbl-wrap");
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", p.title || "Data table");
      wrap.append(el("div", "scroll-hint top"));
      const tb = el("table", "tbl");
      const cap = el("caption", null, p.title || "");
      tb.append(cap);
      const thead = el("thead"), hr = el("tr");
      p.columns.forEach((c) => {
        const th = el("th", null, c.t);
        th.scope = "col";
        if (["text", "list", "dim", "fn", "tag", "ticker", "fredticker"].includes(c.f))
          th.classList.add("text");
        hr.append(th);
      });
      thead.append(hr); tb.append(thead);
      const tbody = el("tbody");
      (p.rows || []).forEach((r) => {
        const tr = el("tr");
        if (r.self) tr.className = "self";
        p.columns.forEach((c) => {
          const v = r[c.k];
          const td = el("td");
          if (["text", "list", "dim", "fn", "tag", "ticker", "fredticker"].includes(c.f))
            td.classList.add("text");
          if (c.f === "dim") td.classList.add("dim");
          addTone(td, toneOf(v, c.signed));

          if (c.f === "doclink" && v) {
            const a = el("a", "doclink", "OPEN");
            a.href = v; a.target = "_blank"; a.rel = "noopener noreferrer";
            td.append(a);
          } else if (c.f === "ticker" && v) {
            const s = el("span", "clickable amber", v);
            s.addEventListener("click", () => execute(`${v} DES`));
            td.append(s);
          } else if (c.f === "fn" && v) {
            const s = el("span", "clickable amber", v);
            s.addEventListener("click", () => execute(r.cmd || v));
            td.append(s);
          } else if (c.f === "fredticker" && v) {
            const s = el("span", "clickable amber", v);
            s.addEventListener("click", () => execute(`FRED ${v}`));
            td.append(s);
          } else if (c.f === "fredlink" && v) {
            const s = el("span", "clickable dim", v);
            s.addEventListener("click", () => execute(`FRED ${v}`));
            td.append(s);
          } else if (c.f === "tag" && v) {
            td.append(el("span", "tagchip", String(v)));
          } else if (c.f === "when") {
            const cls = v === "TODAY" ? "amber" : v === "PAST" ? "dim" : "up";
            td.append(el("span", cls, v === "PAST" ? "" : v || ""));
          } else if (c.f === "action" && v) {
            const cls = /^UPGRADE/i.test(v) ? "up" : /^DOWNGRADE/i.test(v) ? "down" : "";
            td.append(el("span", cls, String(v)));
          } else if (c.f === "dyn") {
            td.textContent = fmt(v, Math.abs(v || 0) >= 1000 ? "big" : "num2");
            if (c.signed) addTone(td, toneOf(v, true));
          } else {
            td.textContent = c.signed ? signedText(v, c.f) : fmt(v, c.f);
          }
          tr.append(td);
        });
        tbody.append(tr);
      });
      tb.append(tbody);
      wrap.append(tb);
      wrap.append(el("div", "scroll-hint bot"));
      body.append(wrap);
    },

    statement(p, body) {
      const wrap = el("div", "tbl-wrap");
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", p.title || "Financial statement");
      const tb = el("table", "tbl stmt");
      tb.append(el("caption", null, p.title || ""));
      const thead = el("thead"), hr = el("tr");
      const th0 = el("th", null, ""); th0.scope = "col"; hr.append(th0);
      (p.periods || []).forEach((pd) => {
        const th = el("th", null, pd); th.scope = "col"; hr.append(th);
      });
      thead.append(hr); tb.append(thead);
      const tbody = el("tbody");
      (p.rows || []).forEach((r) => {
        const tr = el("tr");
        if (r.derived) tr.className = "derived";
        const lab = el("td", "lbl", r.label);
        tr.append(lab);
        (r.values || []).forEach((v) => {
          const td = el("td");
          const pctRow = /%$/.test(r.label);
          const isPerShare = /EPS|per share/i.test(r.label);
          if (pctRow) {
            td.textContent = v == null ? "--" : num(v, 1) + "%";
            if (/growth/i.test(r.label)) addTone(td, toneOf(v, true));
          } else if (isPerShare) {
            td.textContent = num(v, 2);
          } else {
            td.textContent = big(v);
          }
          tr.append(td);
        });
        tbody.append(tr);
      });
      tb.append(tbody); wrap.append(tb); body.append(wrap);
    },

    chart(p, body) {
      const host = el("div");
      body.append(host);
      requestAnimationFrame(() => window.Charts.draw(host, p));
    },

    curve(p, body) {
      const host = el("div");
      body.append(host);
      requestAnimationFrame(() => window.Charts.drawCurve(host, p.series));
    },

    grid(p, body) {
      const g = el("div", "gridtiles");
      (p.items || []).forEach((it) => {
        const tile = el("div", "tile");
        tile.tabIndex = 0;
        tile.setAttribute("role", "button");
        tile.append(el("div", "tile-label", it.label || it.symbol));
        tile.append(el("div", "tile-px", fmt(it.last, "price")));
        const row = el("div", "tile-chg " + toneOf(it.change_pct, true));
        const tdp = dpFor(it.last);
        row.append(el("span", null, it.change == null ? "--"
          : (it.change > 0 ? "+" : "") + num(it.change, tdp)));
        row.append(el("span", null, signedText(it.change_pct, "pctraw")));
        tile.append(row);
        const go = () => execute(`${it.symbol} DES`);
        tile.addEventListener("click", go);
        tile.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
        });
        g.append(tile);
      });
      body.append(g);
    },

    bars(p, body) {
      if (p.gauge != null) {
        const gw = el("div", "gauge");
        const track = el("div", "gauge-track");
        const needle = el("div", "gauge-needle");
        needle.style.left = ((p.gauge + 1) / 2 * 100).toFixed(1) + "%";
        track.append(needle); gw.append(track);
        const sc = el("div", "gauge-scale");
        sc.append(el("span", null, "BEARISH -1"), el("span", null, "0"),
                  el("span", null, "+1 BULLISH"));
        gw.append(sc); body.append(gw);
      }
      const max = Math.max(1, ...(p.items || []).map((i) => Math.abs(i.value || 0)));
      const anyNeg = (p.items || []).some((i) => (i.value || 0) < 0);
      const box = el("div", "bars");
      (p.items || []).forEach((it) => {
        const row = el("div", "bar-row");
        row.append(el("div", "bl", it.label));
        const track = el("div", "bar-track");
        const fill = el("div", "bar-fill");
        const pct = (Math.abs(it.value || 0) / max) * (anyNeg ? 50 : 100);
        const tone = it.tone === "pos" ? "up" : it.tone === "neg" ? "down" : "flat";
        fill.style.background = `var(--${tone === "up" ? "up" : tone === "down" ? "down" : "flat"})`;
        if (anyNeg) {
          const zero = el("div", "bar-zero"); zero.style.left = "50%"; track.append(zero);
          if ((it.value || 0) >= 0) { fill.style.left = "50%"; fill.style.width = pct + "%"; }
          else { fill.classList.add("neg"); fill.style.right = "50%"; fill.style.width = pct + "%"; }
        } else {
          fill.style.left = "0"; fill.style.width = pct + "%";
        }
        track.append(fill);
        row.append(track);
        const val = el("div", "bar-val " + (p.signed ? toneOf(it.value, true) : ""),
          p.signed ? signedText(it.value, "pctraw") : fmt(it.value, "int"));
        row.append(val);
        if (it.cmd) {
          row.classList.add("clickable");
          row.addEventListener("click", () => execute(it.cmd));
        }
        box.append(row);
      });
      body.append(box);
    },

    news(p, body) {
      const list = el("div", "news");
      (p.items || []).forEach((it) => {
        const row = el("div", "news-item");
        const d = it.published ? new Date(it.published) : null;
        row.append(el("div", "news-time", d && !isNaN(d)
          ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
          : "--:--"));
        row.append(el("div", "news-src", it.source || ""));
        const a = el("a", "news-title", it.title);
        a.href = it.link || "#"; a.target = "_blank"; a.rel = "noopener noreferrer";
        const titleCell = el("div");
        titleCell.append(a);
        row.append(titleCell);
        const s = it.sentiment || {};
        const sent = el("div", "news-sent");
        if (s.score != null) {
          const dot = el("span", "sent-dot");
          const tone = s.label === "positive" ? "up" : s.label === "negative" ? "down" : "flat";
          dot.style.background = `var(--${tone === "up" ? "up" : tone === "down" ? "down" : "flat"})`;
          sent.append(dot);
          const v = el("span", tone, (s.score >= 0 ? "+" : "") + s.score.toFixed(2));
          sent.append(v);
        }
        row.append(sent);
        list.append(row);
      });
      body.append(list);
    },

    text(p, body) {
      const block = el("div", "proseblock");
      block.textContent = p.body || "--";
      body.append(block);
    },
  };

  function renderScreen(screen) {
    const root = $("screen");
    root.innerHTML = "";
    renderHeader(screen.header, screen);
    state.fn = screen.fn;
    if (screen.parsed && screen.parsed.security) state.security = screen.parsed.security;

    (screen.panels || []).forEach((p) => {
      const fn = RENDER[p.type];
      if (!fn) return;
      if (p.type === "text" && !p.body) return;
      if (p.spans) p.currentSpan = (screen.subtitle || "").split("·").pop().trim();
      const { wrap, body } = panelShell(p);
      try {
        fn(p, body);
      } catch (err) {
        body.append(el("div", "proseblock down", "Panel failed to render: " + err.message));
      }
      root.append(wrap);
    });
    root.scrollTop = 0;
    root.scrollLeft = 0;
    markFkeys(screen.fn);
    const m = screen.meta || {};
    const bits = [];
    if (m.age != null) bits.push("data " + (m.age < 1 ? "live" : Math.round(m.age) + "s old"));
    if (screen.elapsed_ms != null) bits.push(screen.elapsed_ms + "ms");
    $("stAge").textContent = bits.join(" · ");
    $("stAge").className = "st" + (m.stale ? " st-warn" : "");
    if (m.stale) {
      const note = m.proxy_age != null
        ? `served from the Pi cache, ${Math.round(m.proxy_age)}s old \u2014 the Mac backend is unreachable`
        : (m.errors && m.errors[0] ? m.errors[0] : "upstream unavailable; showing last good data");
      $("stMsg").innerHTML = '<span class="stale-flag">STALE</span> ' + note;
      $("stMsg").className = "st st-msg st-warn";
    } else {
      $("stMsg").textContent = "";
      $("stMsg").className = "st st-msg";
    }
  }

  function renderError(status, body) {
    const root = $("screen");
    root.innerHTML = "";
    const box = el("div", "errbox");
    const kind = (body && body.kind) || "error";
    box.append(el("h2", null,
      kind === "notfound" ? "NOT FOUND"
        : kind === "parse" ? "CANNOT PARSE"
        : kind === "usage" ? "USAGE"
        : kind === "unknown" ? "NO SUCH FUNCTION"
        : kind === "offline" ? "BACKEND OFFLINE"
        : "DATA ERROR"));
    box.append(el("p", null, (body && body.error) || `HTTP ${status}`));
    box.append(el("p", "hint", kind === "offline"
      ? "The Pi is serving this page from its cache. Screens it has seen before "
        + "still open; this one has not been cached yet."
      : "Type HELP for every function, or press F1."));
    root.append(box);
    $("stMsg").textContent = (body && body.error) || "";
    $("stMsg").className = "st st-msg st-err";
  }

  /* ------------------------------------------------------------- execute */
  async function execute(cmdline) {
    const cmd = (cmdline || "").trim();
    if (!cmd || state.busy) return;
    state.busy = true;
    state.lastCmd = cmd;
    $("cmd").value = cmd.toUpperCase();
    hideAC();
    const root = $("screen");
    root.innerHTML = '<div class="loading">LOADING</div>';
    $("stMsg").textContent = "";

    const url = "/api/run?cmd=" + encodeURIComponent(cmd) +
      (state.security ? "&current=" + encodeURIComponent(state.security) : "");
    try {
      const { status, body, stale } = await api(url);
      if (body && body.ok) {
        if (stale && body.meta) {
          body.meta.stale = true;
          body.meta.proxy_age = Number(stale);
        }
        if (state.history[state.history.length - 1] !== cmd) state.history.push(cmd);
        state.hpos = state.history.length;
        renderScreen(body);
        setConn(true);
      } else {
        renderError(status, body);
      }
    } catch (err) {
      setConn(false);
      renderError(0, { error: "Cannot reach the terminal backend. " + err.message });
    } finally {
      state.busy = false;
    }
  }

  function setConn(ok) {
    const n = $("stConn");
    n.textContent = ok ? "● LIVE" : "● OFFLINE";
    n.className = "st " + (ok ? "st-ok" : "st-err");
  }

  function markFkeys(fn) {
    document.querySelectorAll(".fkey").forEach((b) => {
      b.classList.toggle("active", b.dataset.fn === fn);
    });
  }

  /* -------------------------------------------------------- autocomplete */
  let acItems = [], acIdx = -1;
  function hideAC() { $("ac").hidden = true; acItems = []; acIdx = -1; }
  async function showAC() {
    const v = $("cmd").value;
    const last = v.trim().split(/\s+/).pop() || "";
    if (last.length < 1) return hideAC();
    const { body } = await api("/api/suggest?q=" + encodeURIComponent(v));
    const fns = (body && body.items) || [];
    if (!fns.length) return hideAC();
    acItems = fns.slice(0, 8);
    acIdx = 0;
    const ul = $("ac");
    ul.innerHTML = "";
    acItems.forEach((f, i) => {
      const li = el("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === acIdx ? "true" : "false");
      li.append(el("b", null, f), el("span", null, CATALOG[f] || ""));
      li.addEventListener("mousedown", (e) => { e.preventDefault(); applyAC(i); });
      ul.append(li);
    });
    ul.hidden = false;
  }
  function moveAC(d) {
    if ($("ac").hidden) return false;
    acIdx = (acIdx + d + acItems.length) % acItems.length;
    [...$("ac").children].forEach((li, i) =>
      li.setAttribute("aria-selected", i === acIdx ? "true" : "false"));
    return true;
  }
  function applyAC(i) {
    const pick = acItems[i == null ? acIdx : i];
    if (!pick) return;
    const parts = $("cmd").value.trim().split(/\s+/);
    parts[parts.length - 1] = pick;
    $("cmd").value = parts.join(" ").toUpperCase() + " ";
    hideAC();
    $("cmd").focus();
  }

  let CATALOG = {};

  /* ---------------------------------------------------------------- tape */
  async function loadTape() {
    try {
      const { body } = await api("/api/tape");
      if (!body || !body.ok) return;
      const track = $("tapeTrack");
      track.innerHTML = "";
      // Duplicated once so the -50% scroll loops seamlessly.
      for (let pass = 0; pass < 2; pass++) {
        (body.rows || []).forEach((r) => {
          const item = el("div", "tape-item");
          item.append(el("span", "tape-sym", r.label || r.symbol));
          item.append(el("span", "tape-px", num(r.last, dpFor(r.last))));
          item.append(el("span", toneOf(r.change_pct, true), signedText(r.change_pct, "pctraw")));
          item.addEventListener("click", () => execute(`${r.symbol} DES`));
          item.setAttribute("aria-hidden", pass === 1 ? "true" : "false");
          track.append(item);
        });
      }
      setConn(true);
    } catch { setConn(false); }
  }

  async function loadStatus() {
    try {
      const { body } = await api("/api/status");
      if (!body || !body.ok) return;
      const m = body.market || {};
      $("stMkt").textContent = (m.message || "").toUpperCase();
      $("stMkt").className = "st " + (m.status === "open" ? "st-ok" : "");
      const s = body.sentiment || {};
      $("stSent").textContent = "FINBERT " +
        (s.loaded ? "READY (" + (s.device || "cpu").toUpperCase() + ")"
          : s.error ? "UNAVAILABLE" : "IDLE") +
        (body.fred_key ? " · FRED OK" : " · FRED KEY MISSING");
      $("stSent").className = "st" + (body.fred_key ? "" : " st-warn");
    } catch { /* status is cosmetic */ }
  }

  /* -------------------------------------------------------------- chrome */
  function buildFkeys() {
    const row = $("fkeys");
    FKEYS.forEach(([k, fn]) => {
      const b = el("button", "fkey");
      b.type = "button";
      b.dataset.fn = fn;
      b.append(el("kbd", null, k), el("span", null, fn));
      b.addEventListener("click", () => execute(fn));
      row.append(b);
    });
    QUICK.slice(0, 8).forEach(([fn, label]) => {
      const b = el("button", "fkey");
      b.type = "button";
      b.dataset.fn = fn;
      b.append(el("span", "amber", fn), el("span", "dim", label));
      b.addEventListener("click", () => execute(fn));
      row.append(b);
    });
  }

  // The opening screen doubles as a board: real index levels, not placeholders.
  const BOOT_QUOTES = [
    ["^GSPC", "S&P 500"], ["^DJI", "DOW JONES"], ["^IXIC", "NASDAQ"],
    ["^RUT", "RUSSELL 2000"], ["^VIX", "VIX"], ["^TNX", "US 10Y"],
    ["CL=F", "WTI CRUDE"], ["GC=F", "GOLD"], ["BTC-USD", "BITCOIN"],
    ["EURUSD=X", "EUR-USD"], ["DX-Y.NYB", "DOLLAR"], ["XLK", "TECHNOLOGY"],
  ];

  function buildBoot() {
    const g = $("bootGrid");
    g.innerHTML = "";
    BOOT_QUOTES.forEach(([sym, label]) => {
      const t = el("div", "tile");
      t.tabIndex = 0;
      t.setAttribute("role", "button");
      t.dataset.sym = sym;
      t.append(el("div", "tile-label", label));
      t.append(el("div", "tile-px dim", "\u00b7\u00b7\u00b7"));
      t.append(el("div", "tile-chg"));
      const go = () => execute(`${sym} DES`);
      t.addEventListener("click", go);
      t.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
      g.append(t);
    });

    const nav = $("bootNav");
    BOOT_TILES.forEach(([fn, label]) => {
      const b = el("button", "bootfn");
      b.type = "button";
      b.append(el("b", null, fn), el("span", null, label));
      b.addEventListener("click", () => execute(fn));
      nav.append(b);
    });
  }

  async function fillBoot() {
    const g = $("bootGrid");
    if (!g || !g.children.length || !document.getElementById("boot")) return;
    try {
      const { body } = await api("/api/tape?symbols=" +
        encodeURIComponent(BOOT_QUOTES.map((q) => q[0]).join(",")));
      if (!body || !body.ok) return;
      const by = {};
      (body.rows || []).forEach((r) => { by[r.symbol] = r; });
      [...g.children].forEach((tile) => {
        const r = by[tile.dataset.sym];
        if (!r || r.last == null) return;
        const dp = dpFor(r.last);
        tile.children[1].textContent = num(r.last, dp);
        tile.children[1].classList.remove("dim");
        const chg = tile.children[2];
        chg.className = "tile-chg " + toneOf(r.change_pct, true);
        chg.innerHTML = "";
        chg.append(el("span", null, r.change == null ? "--"
          : (r.change > 0 ? "+" : "") + num(r.change, dp)));
        chg.append(el("span", null, signedText(r.change_pct, "pctraw")));
      });
    } catch { /* the boot board is decoration; never block on it */ }
  }

  function tickClock() {
    const now = new Date();
    $("clockTime").textContent = now.toLocaleTimeString("en-US", {
      timeZone: "America/New_York", hour12: false,
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  /* ------------------------------------------------------------ keyboard */
  function wireKeys() {
    const input = $("cmd");

    input.addEventListener("input", () => { showAC(); });
    input.addEventListener("blur", () => setTimeout(hideAC, 120));

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!$("ac").hidden && acIdx >= 0) { applyAC(); return; }
        execute(input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (!$("ac").hidden) hideAC(); else input.value = "";
      } else if (e.key === "Tab" && !$("ac").hidden) {
        e.preventDefault(); applyAC();
      } else if (e.key === "ArrowDown") {
        if (moveAC(1)) e.preventDefault();
      } else if (e.key === "ArrowUp") {
        if (moveAC(-1)) e.preventDefault();
      }
    });

    document.addEventListener("keydown", (e) => {
      const fk = FKEYS.find(([k]) => k === e.key);
      if (fk) { e.preventDefault(); execute(fk[1]); return; }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        if (state.hpos > 0) { state.hpos--; execute(state.history[state.hpos]); }
        return;
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        if (state.hpos < state.history.length - 1) {
          state.hpos++; execute(state.history[state.hpos]);
        }
        return;
      }
      // Any printable key focuses the command line, the way a real terminal does.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 &&
          document.activeElement !== input) {
        input.focus();
      }
    });

    $("go").addEventListener("click", () => execute(input.value));
    $("cancel").addEventListener("click", () => { input.value = ""; hideAC(); input.focus(); });
  }

  /* ----------------------------------------------------------------- boot */
  async function init() {
    buildFkeys();
    buildBoot();
    wireKeys();
    tickClock();
    setInterval(tickClock, 1000);
    try {
      const { body } = await api("/api/catalog");
      (body.functions || []).forEach((f) => { CATALOG[f.mnemonic] = f.desc; });
    } catch { /* suggestions degrade to bare mnemonics */ }
    loadTape(); loadStatus(); fillBoot();
    setInterval(loadTape, 60000);
    setInterval(loadStatus, 60000);
    $("cmd").focus();

    /* The fragment is a deep link -- #AAPL DES opens that screen. When the page
       is embedded as a tab it instead carries the key, which must never be
       treated as a command: it would be sent to the server as a query
       parameter and land in its logs. Anything of the form k=... is config,
       not a command. */
    const hash = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
    if (hash && !/(^|[&?])k=/.test(hash)) execute(hash);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
