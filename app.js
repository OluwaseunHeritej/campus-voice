(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  const cfg = window.APP_CONFIG || {};
  const placeholder = /YOUR-PROJECT|YOUR-ANON/i.test((cfg.SUPABASE_URL || "") + (cfg.SUPABASE_ANON_KEY || ""));
  let isDemo = !!cfg.FORCE_DEMO || placeholder || !cfg.SUPABASE_URL;
  let api;
  let startupError = "";
  try {
    api = isDemo ? window.DemoAPI() : window.SupabaseAPI(cfg);
  } catch (e) {
    startupError = e.message;
    isDemo = true;
    api = window.DemoAPI();
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const state = {
    me: { signed_in: false, is_admin: false, is_student: false, posts_left: 0 },
    settings: { school_name: "", posts_per_day: 2, picks_per_cycle: 1, public_read: true },
    categories: [], domains: [], admins: [], cycles: [], complaints: [], updates: [],
    myVotes: new Set(),
    tab: "top", search: "", cat: "",
    busyVotes: new Set(),
    adminConfirm: null,
    loaded: false,
  };

  // Concerns posted from this device ("Mine" tab). Kept only in this browser,
  // so the server never learns which student wrote what.
  const MINE_KEY = "campus-voice-mine";
  const mine = {
    get() { try { return JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); } catch (e) { return []; } },
    add(id) { try { const l = mine.get(); l.unshift(id); localStorage.setItem(MINE_KEY, JSON.stringify(l.slice(0, 200))); } catch (e) { /* ignore */ } },
  };

  // ------------------------------------------------------------------
  // Formatting helpers
  // ------------------------------------------------------------------
  const STATUS = {
    open: "Open for votes", selected: "Committed", in_progress: "In progress",
    resolved: "Resolved", declined: "Declined", merged: "Merged", hidden: "Hidden",
  };
  const parseDay = (d) => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd); };
  const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmtDate = (d) => (typeof d === "string" && d.length === 10 ? parseDay(d) : new Date(d))
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const isoDay = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  function ago(day) {
    const n = Math.round((todayStart() - parseDay(day)) / 86400000);
    if (n <= 0) return "Today";
    if (n === 1) return "Yesterday";
    if (n < 7) return n + " days ago";
    if (n < 35) { const w = Math.round(n / 7); return w + (w === 1 ? " week ago" : " weeks ago"); }
    return fmtDate(day);
  }
  const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));
  const nf = new Intl.NumberFormat("en-GB");
  const cycleById = (id) => state.cycles.find((c) => c.id === id);
  const openCycle = () => state.cycles.find((c) => !c.closed_at);
  const byId = (id) => state.complaints.find((c) => c.id === id);
  const updatesFor = (id) => state.updates.filter((u) => u.complaint_id === id);

  // ------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------
  let toastTimer;
  function toast(msg, kind) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (kind ? " toast-" + kind : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, kind === "error" ? 6000 : 3500);
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------
  async function refresh() {
    try {
      const [me, settings, categories, cycles, complaints, domains] = await Promise.all([
        api.whoami(), api.settings(), api.categories(), api.cycles(), api.complaints(), api.domains(),
      ]);
      Object.assign(state, { me, settings, categories, cycles, complaints, domains });
      state.myVotes = me.is_student ? await api.myVotes() : new Set();
      const tracked = complaints.filter((c) => ["selected", "in_progress", "resolved", "declined"].includes(c.status)).map((c) => c.id);
      state.updates = await api.updates(tracked);
      if (me.is_admin) {
        try { state.admins = await api.admins(); } catch (e) { state.admins = []; }
      }
      state.loaded = true;
    } catch (e) {
      toast(e.message, "error");
    }
    renderAll();
  }

  // ------------------------------------------------------------------
  // Rendering: header, cycle band, commitments, list
  // ------------------------------------------------------------------
  function renderAll() {
    renderHeader();
    renderCycle();
    renderCommitments();
    renderFilters();
    renderList();
    route(true);
  }

  function renderHeader() {
    const name = cfg.APP_NAME || "Campus Voice";
    $("#brand-name").textContent = name;
    $("#brand-school").textContent = state.settings.school_name || "";
    $("#foot-name").textContent = name + (state.settings.school_name ? " · " + state.settings.school_name : "");
    document.title = name;
    $("#nav-admin").hidden = !state.me.is_admin;
    $("#demo-banner").hidden = !isDemo;
    if (startupError) {
      $("#demo-banner .demo-inner span").innerHTML = "<strong>Could not connect.</strong> " + esc(startupError) + " Showing demo data.";
    }

    const acc = $("#account");
    if (!state.me.signed_in) {
      acc.innerHTML = '<button class="btn btn-small" type="button" data-action="signin">Sign in</button>';
    } else {
      const role = state.me.is_admin ? "Management" : state.me.is_student ? "Student" : "Not a school email";
      acc.innerHTML =
        '<span class="who"><span class="who-role' + (state.me.is_student || state.me.is_admin ? "" : " who-warn") + '">' + esc(role) + "</span>" +
        '<span class="who-email">' + esc(state.me.email || "") + "</span></span>" +
        '<button class="btn btn-small btn-quiet" type="button" data-action="signout">Sign out</button>';
    }

    const pl = $("#posts-left");
    if (state.me.is_student) pl.textContent = plural(state.me.posts_left, "post") + " left today";
    else if (state.me.is_admin) pl.textContent = "Management accounts can post updates, not concerns.";
    else pl.textContent = "Sign in with your school email to post or vote.";
  }

  function renderCycle() {
    const band = $("#cycle-band");
    const cyc = openCycle();
    const leaders = state.complaints.filter((c) => c.status === "open")
      .sort((a, b) => b.vote_count - a.vote_count || a.created_on.localeCompare(b.created_on));
    const lead = leaders[0];
    const picks = state.settings.picks_per_cycle || 1;
    const pickText = picks === 1 ? "the top-voted concern becomes" : "the top " + picks + " concerns become";

    if (!cyc) {
      band.innerHTML =
        '<div class="cycle-main"><p class="eyebrow">Between cycles</p>' +
        '<h1 class="cycle-title">Voting opens with the next cycle</h1>' +
        '<p class="cycle-rule">You can still raise and upvote concerns. When management opens the next cycle, the votes carry over.</p></div>';
      return;
    }
    const start = parseDay(cyc.starts_on), end = parseDay(cyc.ends_on);
    const total = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const left = Math.round((end - todayStart()) / 86400000);
    const pct = Math.min(100, Math.max(0, ((total - Math.max(left, 0)) / total) * 100));
    const leftText = left > 1 ? left + " days left" : left === 1 ? "Closes tomorrow" : left === 0 ? "Closes today" : "Closing soon";

    band.innerHTML =
      '<div class="cycle-main">' +
        '<p class="eyebrow">' + esc(cyc.label) + "</p>" +
        '<h1 class="cycle-title">' + esc(leftText) + "</h1>" +
        '<p class="cycle-rule">When this cycle closes on <strong>' + esc(fmtDate(cyc.ends_on)) + "</strong>, " + pickText +
        " management’s commitment. The vote decides.</p>" +
        '<div class="cycle-meter" role="img" aria-label="' + Math.round(pct) + '% of the cycle has passed"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
        '<div class="cycle-dates"><span>Opened ' + esc(fmtDate(cyc.starts_on)) + "</span><span>Closes " + esc(fmtDate(cyc.ends_on)) + "</span></div>" +
      "</div>" +
      (lead
        ? '<button class="leader" type="button" data-open="' + esc(lead.id) + '">' +
            '<span class="leader-label">Leading right now</span>' +
            '<span class="leader-votes">' + nf.format(lead.vote_count) + "<small>votes</small></span>" +
            '<span class="leader-title">' + esc(lead.title) + "</span>" +
            (leaders[1] ? '<span class="leader-gap">' + plural(lead.vote_count - leaders[1].vote_count, "vote") + " ahead of the next concern</span>" : "") +
          "</button>"
        : '<div class="leader leader-empty"><span class="leader-label">No votes yet</span><span class="leader-title">Be the first to raise a concern this cycle.</span></div>');
  }

  const STEPS = ["selected", "in_progress", "resolved"];
  function progressSteps(status) {
    if (status === "declined") {
      return '<ol class="steps-mini" aria-label="Progress"><li class="done">Committed</li><li class="declined">Declined</li></ol>';
    }
    const at = status === "resolved" ? STEPS.length : STEPS.indexOf(status);
    return '<ol class="steps-mini" aria-label="Progress">' +
      ["Committed", "In progress", "Resolved"].map((label, i) =>
        '<li class="' + (i < at ? "done" : i === at ? "now" : "") + '">' + label + "</li>").join("") + "</ol>";
  }

  function stamp(status) {
    return '<span class="stamp stamp-' + esc(status) + '">' + esc(STATUS[status] || status) + "</span>";
  }

  function renderCommitments() {
    const active = state.complaints.filter((c) => c.status === "selected" || c.status === "in_progress");
    const recent = state.complaints.filter((c) => (c.status === "resolved" || c.status === "declined") && c.selected_in)
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 2);
    const list = active.concat(recent);
    const box = $("#commit-list");
    if (!list.length) {
      box.innerHTML = '<p class="empty">No commitments yet. When the first cycle closes, the top concern will appear here with management’s updates.</p>';
      return;
    }
    box.innerHTML = list.map((c) => {
      const ups = updatesFor(c.id);
      const last = ups[ups.length - 1];
      const cyc = cycleById(c.selected_in);
      return '<article class="commit">' +
        '<div class="commit-top">' + stamp(c.status) +
          '<span class="commit-cycle">' + esc(cyc ? cyc.label : "") + "</span></div>" +
        '<h3><button type="button" class="linkish title-link" data-open="' + esc(c.id) + '">' + esc(c.title) + "</button></h3>" +
        progressSteps(c.status) +
        (last ? '<div class="commit-update"><p class="commit-update-meta">Latest update · ' + esc(fmtDate(last.created_at)) + "</p><p>" + esc(last.body) + "</p></div>" : "") +
        '<p class="commit-foot"><span class="tabnum">' + plural(c.vote_count, "vote") + "</span> · " + plural(ups.length, "update") +
          ' · <button type="button" class="linkish" data-open="' + esc(c.id) + '">See full history</button></p>' +
        "</article>";
    }).join("");
  }

  function renderFilters() {
    const sel = $("#f-cat");
    const cur = state.cat;
    sel.innerHTML = '<option value="">All categories</option>' +
      state.categories.map((c) => '<option value="' + esc(c) + '"' + (c === cur ? " selected" : "") + ">" + esc(c) + "</option>").join("");
    $$("#tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
  }

  function visibleList() {
    let list = state.complaints.slice();
    const mineIds = mine.get();
    if (state.tab === "top") list = list.filter((c) => c.status === "open")
      .sort((a, b) => b.vote_count - a.vote_count || a.created_on.localeCompare(b.created_on));
    else if (state.tab === "new") list = list.filter((c) => c.status === "open")
      .sort((a, b) => b.created_on.localeCompare(a.created_on) || b.vote_count - a.vote_count);
    else if (state.tab === "done") list = list.filter((c) => c.status === "resolved" || c.status === "declined")
      .sort((a, b) => String(b.updated_at || b.created_on).localeCompare(String(a.updated_at || a.created_on)));
    else if (state.tab === "mine") list = mineIds.map(byId).filter(Boolean);
    if (state.cat) list = list.filter((c) => c.category === state.cat);
    const q = state.search.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.title + " " + c.body).toLowerCase().includes(q));
    return list;
  }

  function voteButton(c, big) {
    const voted = state.myVotes.has(c.id);
    const open = c.status === "open";
    const label = open ? (voted ? "Remove your vote from" : "Upvote") : "Votes for";
    return '<button type="button" class="vote' + (big ? " vote-big" : "") + (voted ? " is-voted" : "") + '"' +
      (open ? ' data-vote="' + esc(c.id) + '" aria-pressed="' + voted + '"' : " disabled") +
      ' aria-label="' + esc(label + ": " + c.title + " (" + c.vote_count + " votes)") + '">' +
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.5 14 10H2z" fill="currentColor"/></svg>' +
      '<span class="vote-n">' + nf.format(c.vote_count) + "</span>" +
      "</button>";
  }

  function renderList() {
    const ol = $("#concern-list");
    if (!state.loaded) { ol.innerHTML = '<li class="empty">Loading concerns…</li>'; return; }
    if (!state.settings.public_read && !state.me.is_student && !state.me.is_admin) {
      ol.innerHTML = '<li class="empty">Concerns are visible to students only. <button class="linkish" type="button" data-action="signin">Sign in with your school email</button> to see them.</li>';
      return;
    }
    const list = visibleList();
    if (!list.length) {
      const msg = {
        top: "No open concerns yet. Raise the first one.",
        new: "No open concerns yet. Raise the first one.",
        done: "Nothing resolved yet. Resolved concerns will show here with management’s final update.",
        mine: "Concerns you post from this device show here. They are remembered only in this browser, not on your account.",
      }[state.tab];
      ol.innerHTML = '<li class="empty">' + esc(state.search || state.cat ? "No concerns match your filters." : msg) + "</li>";
      return;
    }
    ol.innerHTML = list.map((c, i) => {
      const rank = state.tab === "top" && !state.search && !state.cat ? '<span class="rank tabnum" aria-hidden="true">' + (i + 1) + "</span>" : "";
      const merged = c.status === "merged" && byId(c.merged_into)
        ? '<p class="merged-note">Merged into <button type="button" class="linkish" data-open="' + esc(c.merged_into) + '">' + esc(byId(c.merged_into).title) + "</button>. Its votes moved there.</p>" : "";
      return '<li class="concern' + (c.status !== "open" ? " is-" + esc(c.status) : "") + '">' +
        rank + voteButton(c) +
        '<div class="concern-main">' +
          '<p class="concern-meta"><span class="cat">' + esc(c.category) + '</span><span aria-hidden="true">·</span><span>' + esc(ago(c.created_on)) + "</span></p>" +
          '<h3 class="concern-title"><button type="button" class="title-link" data-open="' + esc(c.id) + '">' + esc(c.title) + "</button></h3>" +
          (c.body ? '<p class="concern-body">' + esc(c.body) + "</p>" : "") +
          merged +
        "</div>" +
        (c.status !== "open" ? '<div class="concern-stamp">' + stamp(c.status) + "</div>" : "") +
        "</li>";
    }).join("");
  }

  // ------------------------------------------------------------------
  // Detail dialog
  // ------------------------------------------------------------------
  async function openDetail(id) {
    let c = byId(id);
    if (!c) { toast("That concern is no longer available.", "error"); return; }
    let ups = updatesFor(id);
    if (!ups.length && c.status !== "open") {
      try { ups = await api.updates([id]); } catch (e) { /* show without */ }
    }
    const cyc = cycleById(c.selected_in);
    const body = $("#detail-body");
    body.innerHTML =
      '<div class="detail-head">' + voteButton(c, true) +
        '<div><p class="concern-meta"><span class="cat">' + esc(c.category) + '</span><span aria-hidden="true">·</span><span>Posted ' + esc(fmtDate(c.created_on)) + "</span></p>" +
        '<h2 id="detail-title">' + esc(c.title) + "</h2>" +
        '<div class="detail-status">' + stamp(c.status) + (cyc ? '<span class="commit-cycle">' + esc(cyc.label) + "</span>" : "") + "</div></div>" +
      "</div>" +
      (c.body ? '<p class="detail-text">' + esc(c.body) + "</p>" : '<p class="detail-text muted">No extra details were given.</p>') +
      (c.status === "open" ? '<p class="detail-hint">' + (state.myVotes.has(c.id) ? "You have voted for this. Tap the arrow again to take your vote back." : "Agree? Upvote it. The most-voted concern when the cycle closes becomes management’s commitment.") + "</p>" : "") +
      (c.status === "merged" && byId(c.merged_into) ? '<p class="merged-note">This was a duplicate. It was merged into <button type="button" class="linkish" data-open="' + esc(c.merged_into) + '">' + esc(byId(c.merged_into).title) + "</button>.</p>" : "") +
      (c.status === "hidden" ? '<p class="merged-note">Hidden from students' + (c.status_note ? ": " + esc(c.status_note) : ".") + "</p>" : "") +
      (ups.length
        ? '<h3 class="tl-h">Management updates</h3><ol class="timeline">' + ups.map((u) =>
            '<li><p class="tl-meta">' + esc(fmtDate(u.created_at)) + (u.status ? " · " + stamp(u.status) : "") + "</p><p>" + esc(u.body) + "</p></li>").join("") + "</ol>"
        : "");
    const dlg = $("#dlg-detail");
    if (!dlg.open) dlg.showModal();
  }

  // ------------------------------------------------------------------
  // Voting
  // ------------------------------------------------------------------
  async function vote(id) {
    if (!state.me.signed_in) { openSignIn("Sign in with your school email to vote."); return; }
    if (state.me.is_admin) { toast("Management accounts cannot vote. Votes are for students.", "error"); return; }
    if (!state.me.is_student) { toast("Only school email addresses can vote. Sign out and use your school email.", "error"); return; }
    if (state.busyVotes.has(id)) return;
    const c = byId(id); if (!c) return;
    state.busyVotes.add(id);
    const was = state.myVotes.has(id);
    // optimistic update
    if (was) { state.myVotes.delete(id); c.vote_count--; } else { state.myVotes.add(id); c.vote_count++; }
    rerenderVotes(id);
    try {
      const res = await api.toggleVote(id);
      c.vote_count = res.vote_count;
      if (res.voted) state.myVotes.add(id); else state.myVotes.delete(id);
    } catch (e) {
      if (was) { state.myVotes.add(id); c.vote_count++; } else { state.myVotes.delete(id); c.vote_count--; }
      toast(e.message, "error");
    }
    state.busyVotes.delete(id);
    rerenderVotes(id);
  }
  function rerenderVotes(id) {
    renderList(); renderCycle();
    if ($("#dlg-detail").open && $("#detail-body [data-vote]") && $("#detail-body [data-vote]").dataset.vote === id) openDetail(id);
    renderSimilarVotes();
  }

  // ------------------------------------------------------------------
  // Sign-in
  // ------------------------------------------------------------------
  function domainOk(email) {
    const dom = (email.split("@")[1] || "").toLowerCase();
    return state.domains.some((d) => dom === d || dom.endsWith("." + d));
  }

  function openSignIn(reason, step, email) {
    const box = $("#signin-body");
    const domains = state.domains.length ? state.domains.map((d) => "@" + d).join(", ") : "";
    if (step === "code") {
      box.innerHTML =
        '<h2 id="signin-h">Check your school inbox</h2>' +
        '<p>We sent a sign-in email to <strong>' + esc(email) + "</strong>. Open the link in it, or type the code from the email here.</p>" +
        '<form id="code-form" class="stack" novalidate>' +
          '<div class="field"><label for="si-code">Code from the email</label>' +
          '<input id="si-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" required></div>' +
          '<p class="form-error" id="si-error" role="alert" hidden></p>' +
          '<div class="dlg-actions"><button type="button" class="btn" data-action="signin-back">Use a different email</button>' +
          '<button class="btn btn-primary" type="submit">Sign in</button></div>' +
        "</form>" +
        '<p class="fine">No email after a few minutes? Check spam or junk, then try again.</p>';
      box.dataset.email = email;
    } else {
      box.innerHTML =
        '<h2 id="signin-h">Sign in</h2>' +
        (reason ? '<p class="signin-reason">' + esc(reason) + "</p>" : "") +
        "<p>Use your school email" + (domains ? " (ending in " + esc(domains) + ")" : "") + ". There is no password: we email you a link and a code.</p>" +
        '<form id="email-form" class="stack" novalidate>' +
          '<div class="field"><label for="si-email">School email</label>' +
          '<input id="si-email" type="email" autocomplete="email" required placeholder="' + esc(isDemo ? "you@" + (api.demoDomain || "demo.edu.ng") : "you@" + (state.domains[0] || "school.edu")) + '"></div>' +
          '<p class="form-error" id="si-error" role="alert" hidden></p>' +
          '<button class="btn btn-primary btn-block" type="submit" id="si-send">' + (isDemo ? "Sign in (demo: no email sent)" : "Email me a sign-in link") + "</button>" +
        "</form>" +
        (isDemo
          ? '<div class="demo-quick"><p class="fine">Demo shortcuts</p>' +
            '<div class="demo-quick-row"><button type="button" class="btn" data-action="demo-student">Try as a student</button>' +
            '<button type="button" class="btn" data-action="demo-admin">Try as management</button></div>' +
            '<p class="fine">Each “Try as a student” click signs in a different student, so you can show one-vote-per-student.</p></div>'
          : "") +
        '<p class="fine">Signing in only proves you are a student. Your name and email are never shown on, or saved with, anything you post.</p>';
    }
    const dlg = $("#dlg-signin");
    if (!dlg.open) dlg.showModal();
    setTimeout(() => { const f = $("#si-code") || $("#si-email"); if (f) f.focus(); }, 30);
  }

  async function submitEmail(e) {
    e.preventDefault();
    const input = $("#si-email"); const err = $("#si-error");
    const email = input.value.trim().toLowerCase();
    err.hidden = true;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter your full school email address."; err.hidden = false; return; }
    if (state.domains.length && !domainOk(email) && !input.dataset.confirmed) {
      err.innerHTML = "That is not a school address, so it will not be able to post or vote. Management accounts can still continue. " +
        '<button type="button" class="linkish" data-action="signin-anyway">Continue anyway</button>';
      err.hidden = false; return;
    }
    const btn = $("#si-send"); btn.disabled = true; btn.textContent = "Sending…";
    try {
      await api.sendSignInEmail(email);
      if (isDemo) { $("#dlg-signin").close(); toast("Signed in as " + email); }
      else openSignIn("", "code", email);
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = "Email me a sign-in link";
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    const code = $("#si-code").value.replace(/\s/g, "");
    const err = $("#si-error"); err.hidden = true;
    if (!/^\d{6,10}$/.test(code)) { err.textContent = "Enter the number code from the email."; err.hidden = false; return; }
    try {
      await api.verifyCode($("#signin-body").dataset.email, code);
      $("#dlg-signin").close();
      toast("You are signed in.");
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  }

  // ------------------------------------------------------------------
  // Posting
  // ------------------------------------------------------------------
  function openPost() {
    if (!state.me.signed_in) { openSignIn("Sign in with your school email to raise a concern."); return; }
    if (state.me.is_admin) { toast("Management accounts post updates from the Management page, not concerns.", "error"); return; }
    if (!state.me.is_student) { toast("Only school email addresses can post.", "error"); return; }
    if (state.me.posts_left <= 0) { toast("You have used today’s posts. Upvote an existing concern, or come back tomorrow.", "error"); return; }
    const f = $("#post-form"); f.reset();
    $("#p-cat").innerHTML = '<option value="">Choose a category</option>' + state.categories.map((c) => '<option>' + esc(c) + "</option>").join("");
    $("#p-title-count").textContent = "0";
    $("#similar").hidden = true; $("#post-error").hidden = true;
    $("#dlg-post").showModal();
    setTimeout(() => $("#p-title").focus(), 30);
  }

  let simTimer, simSeq = 0, simResults = [];
  function onTitleInput() {
    const v = $("#p-title").value;
    $("#p-title-count").textContent = v.length;
    clearTimeout(simTimer);
    simTimer = setTimeout(async () => {
      const seq = ++simSeq;
      if (v.trim().length < 4) { simResults = []; renderSimilarVotes(); return; }
      try {
        const res = await api.similar(v.trim());
        if (seq !== simSeq) return;
        simResults = res || [];
      } catch (e) { simResults = []; }
      renderSimilarVotes();
    }, 350);
  }
  function renderSimilarVotes() {
    const box = $("#similar");
    if (!simResults.length) { box.hidden = true; return; }
    box.hidden = false;
    $("#similar-list").innerHTML = simResults.map((r) => {
      const c = byId(r.id) || r;
      return "<li>" + (c.status === "open" ? voteButton(c) : stamp(c.status)) +
        '<button type="button" class="linkish sim-title" data-open="' + esc(c.id) + '">' + esc(c.title) + "</button></li>";
    }).join("");
  }

  async function submitPost(e) {
    e.preventDefault();
    const title = $("#p-title").value.trim(), body = $("#p-body").value.trim(), cat = $("#p-cat").value;
    const err = $("#post-error"); err.hidden = true;
    const problem = title.length < 8 ? "Give your concern a title of at least 8 characters."
      : !cat ? "Choose a category so others can find it." : "";
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    const btn = $("#post-submit"); btn.disabled = true; btn.textContent = "Posting…";
    try {
      const id = await api.post(title, body, cat);
      mine.add(id);
      $("#dlg-post").close();
      state.tab = "new";
      await refresh();
      toast("Posted anonymously. Your vote is already counted.");
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    }
    btn.disabled = false; btn.textContent = "Post anonymously";
  }

  // ------------------------------------------------------------------
  // Management dashboard
  // ------------------------------------------------------------------
  function renderAdmin() {
    const root = $("#admin-root");
    if (!state.me.is_admin) {
      root.innerHTML = '<div class="admin-gate"><h1>Management</h1><p>This page is for school management. Sign in with a management email to post updates and run voting cycles.</p>' +
        (state.me.signed_in ? "<p class=\"fine\">You are signed in as " + esc(state.me.email) + ", which is not a management account.</p>" : '<button class="btn btn-primary" type="button" data-action="signin">Sign in</button>') + "</div>";
      return;
    }
    const cyc = openCycle();
    const open = state.complaints.filter((c) => c.status === "open").sort((a, b) => b.vote_count - a.vote_count || a.created_on.localeCompare(b.created_on));
    const active = state.complaints.filter((c) => ["open", "selected", "in_progress"].includes(c.status));
    const committed = state.complaints.filter((c) => c.status === "selected" || c.status === "in_progress");
    const hidden = state.complaints.filter((c) => c.status === "hidden");
    const picks = state.settings.picks_per_cycle;
    const s = state.settings;
    const conf = state.adminConfirm || {};
    const defaultEnd = isoDay(new Date(Date.now() + 28 * 86400000));

    const cycleCard = cyc
      ? '<div class="panel-row"><div><p class="eyebrow">Open cycle</p><h3>' + esc(cyc.label) + "</h3>" +
          '<p class="muted">' + esc(fmtDate(cyc.starts_on)) + " to " + esc(fmtDate(cyc.ends_on)) + " · " + plural(open.length, "open concern") + "</p></div>" +
          '<form class="inline-form" data-form="extend"><label for="a-extend">Change end date</label><input id="a-extend" type="date" value="' + esc(cyc.ends_on) + '" min="' + esc(cyc.starts_on) + '" required><button class="btn btn-small" type="submit">Save date</button></form></div>' +
        '<div class="close-box"><p><strong>Closing picks automatically.</strong> The ' + (picks === 1 ? "top-voted open concern" : "top " + picks + " open concerns") +
          " will be marked Committed and every student will see it. Ties go to the older post.</p>" +
          (open.length ? '<ol class="preview-picks">' + open.slice(0, picks).map((c) => "<li><span class=\"tabnum\">" + plural(c.vote_count, "vote") + "</span> " + esc(c.title) + "</li>").join("") + "</ol>" : '<p class="muted">No open concerns with votes yet. Closing now will commit to nothing.</p>') +
          (conf.type === "close"
            ? '<div class="confirm-row"><span>Close <strong>' + esc(cyc.label) + "</strong> now? This cannot be undone.</span>" +
              '<button class="btn btn-small" type="button" data-action="cancel-confirm">Keep it open</button><button class="btn btn-small btn-danger" type="button" data-action="close-cycle-confirm">Close and commit</button></div>'
            : '<button class="btn btn-primary" type="button" data-action="close-cycle">Close cycle and commit to the top concern</button>') +
        "</div>"
      : '<p class="muted">No cycle is open. Start one to set when voting closes. Votes from before carry over.</p>' +
        '<form class="grid-form" data-form="start">' +
          '<div class="field"><label for="a-label">Cycle name</label><input id="a-label" required maxlength="60" placeholder="e.g. November 2026, or First Semester 2026/27"></div>' +
          '<div class="field"><label for="a-end">Voting closes on</label><input id="a-end" type="date" required value="' + esc(defaultEnd) + '" min="' + esc(isoDay(new Date())) + '"></div>' +
          '<div class="field-actions"><button class="btn btn-primary" type="submit">Start cycle</button></div>' +
        "</form>";

    const commitCards = committed.length ? committed.map((c) => {
      const ups = updatesFor(c.id); const last = ups[ups.length - 1];
      return '<div class="admin-commit">' +
        '<div class="admin-commit-head">' + stamp(c.status) + '<h4><button type="button" class="linkish title-link" data-open="' + esc(c.id) + '">' + esc(c.title) + "</button></h4>" +
          '<span class="muted tabnum">' + plural(c.vote_count, "vote") + " · " + plural(ups.length, "update") + "</span></div>" +
        (last ? '<p class="muted small">Last update ' + esc(fmtDate(last.created_at)) + ": " + esc(last.body) + "</p>" : "") +
        '<form class="update-form" data-form="update" data-id="' + esc(c.id) + '">' +
          '<label for="u-' + esc(c.id) + '">Post an update students will see</label>' +
          '<textarea id="u-' + esc(c.id) + '" rows="3" maxlength="2000" required placeholder="What has been done, what happens next, and when."></textarea>' +
          '<div class="update-row"><label class="visually-hidden" for="us-' + esc(c.id) + '">New status</label><select id="us-' + esc(c.id) + '">' +
            '<option value="">Keep status: ' + esc(STATUS[c.status]) + "</option>" +
            (c.status !== "in_progress" ? '<option value="in_progress">Mark In progress</option>' : "") +
            '<option value="resolved">Mark Resolved</option><option value="declined">Mark Declined (explain why)</option></select>' +
            '<button class="btn btn-primary btn-small" type="submit">Post update</button></div>' +
        "</form></div>";
    }).join("") : '<p class="muted">Nothing committed yet. The top concern appears here when you close a cycle.</p>';

    const modRows = open.length ? open.map((c) => {
      const isHide = conf.type === "hide" && conf.id === c.id;
      const isMerge = conf.type === "merge" && conf.id === c.id;
      return '<li class="mod-row">' +
        '<div class="mod-main"><span class="tabnum mod-votes">' + nf.format(c.vote_count) + '</span><div><button type="button" class="linkish title-link" data-open="' + esc(c.id) + '">' + esc(c.title) + "</button>" +
        '<p class="muted small">' + esc(c.category) + " · " + esc(fmtDate(c.created_on)) + "</p></div></div>" +
        (isHide
          ? '<form class="mod-form" data-form="hide" data-id="' + esc(c.id) + '"><label for="h-' + esc(c.id) + '">Reason (kept with the post)</label><input id="h-' + esc(c.id) + '" required maxlength="300" placeholder="e.g. Names an individual staff member">' +
            '<button class="btn btn-small" type="button" data-action="cancel-confirm">Cancel</button><button class="btn btn-small btn-danger" type="submit">Hide post</button></form>'
          : isMerge
            ? '<form class="mod-form" data-form="merge" data-id="' + esc(c.id) + '"><label for="m-' + esc(c.id) + '">Merge this duplicate into</label><select id="m-' + esc(c.id) + '" required><option value="">Choose the original concern</option>' +
              active.filter((x) => x.id !== c.id).map((x) => '<option value="' + esc(x.id) + '">' + esc(x.title.slice(0, 70)) + " (" + x.vote_count + ")</option>").join("") +
              '</select><button class="btn btn-small" type="button" data-action="cancel-confirm">Cancel</button><button class="btn btn-small btn-primary" type="submit">Merge votes</button></form>'
            : '<div class="mod-actions"><button class="btn btn-small" type="button" data-action="merge" data-id="' + esc(c.id) + '">Merge duplicate</button>' +
              '<button class="btn btn-small btn-quiet" type="button" data-action="hide" data-id="' + esc(c.id) + '">Hide</button></div>') +
        "</li>";
    }).join("") : '<li class="muted">No open concerns.</li>';

    const hiddenRows = hidden.length ? '<h4 class="sub-h">Hidden posts</h4><ul class="chip-list col">' + hidden.map((c) =>
      '<li class="mod-row"><div class="mod-main"><div>' + esc(c.title) + '<p class="muted small">' + esc(c.status_note || "No reason given") + "</p></div></div>" +
      '<div class="mod-actions"><button class="btn btn-small" type="button" data-action="restore" data-id="' + esc(c.id) + '">Restore</button></div></li>').join("") + "</ul>" : "";

    const chips = (items, action, label) => '<ul class="chip-list">' + items.map((x) =>
      '<li class="chip">' + esc(x) + '<button type="button" aria-label="Remove ' + esc(x) + '" data-action="' + action + '" data-value="' + esc(x) + '">×</button></li>').join("") +
      (items.length ? "" : '<li class="muted small">' + esc(label) + "</li>") + "</ul>";

    root.innerHTML =
      '<div class="admin-head"><h1>Management</h1><p class="muted">Signed in as ' + esc(state.me.email) + ". Students see every update you post here.</p></div>" +
      '<div class="admin-grid">' +
        '<section class="panel panel-wide" aria-labelledby="ah-cycle"><h2 id="ah-cycle">Voting cycle</h2>' + cycleCard + "</section>" +
        '<section class="panel panel-wide" aria-labelledby="ah-commit"><h2 id="ah-commit">Commitments</h2>' + commitCards + "</section>" +
        '<section class="panel panel-wide" aria-labelledby="ah-mod"><h2 id="ah-mod">Moderation</h2><p class="muted">Merge duplicates so votes are not split. Hide only posts that break the rules, such as naming a person.</p><ul class="mod-list">' + modRows + "</ul>" + hiddenRows + "</section>" +
        '<section class="panel" aria-labelledby="ah-set"><h2 id="ah-set">Settings</h2>' +
          '<form class="stack" data-form="settings">' +
            '<div class="field"><label for="s-name">School name</label><input id="s-name" maxlength="80" value="' + esc(s.school_name) + '"></div>' +
            '<div class="two"><div class="field"><label for="s-posts">Posts per student per day</label><input id="s-posts" type="number" min="1" max="20" value="' + esc(s.posts_per_day) + '"></div>' +
            '<div class="field"><label for="s-picks">Concerns committed per cycle</label><input id="s-picks" type="number" min="1" max="5" value="' + esc(s.picks_per_cycle) + '"></div></div>' +
            '<label class="check"><input id="s-public" type="checkbox"' + (s.public_read ? " checked" : "") + "> Anyone with the link can read concerns (only students can post or vote)</label>" +
            '<button class="btn btn-primary" type="submit">Save settings</button>' +
          "</form></section>" +
        '<section class="panel" aria-labelledby="ah-access"><h2 id="ah-access">Access</h2>' +
          '<h4 class="sub-h">Student email domains</h4>' + chips(state.domains, "rm-domain", "No domains yet, so nobody can post.") +
          '<form class="inline-form" data-form="domain"><label class="visually-hidden" for="d-new">Add domain</label><input id="d-new" placeholder="school.edu.ng" required><button class="btn btn-small" type="submit">Add</button></form>' +
          '<h4 class="sub-h">Management accounts</h4>' + chips(state.admins, "rm-admin", "") +
          '<form class="inline-form" data-form="admin"><label class="visually-hidden" for="ad-new">Add management email</label><input id="ad-new" type="email" placeholder="dean@school.edu.ng" required><button class="btn btn-small" type="submit">Add</button></form>' +
          '<h4 class="sub-h">Categories</h4>' + chips(state.categories, "rm-cat", "") +
          '<form class="inline-form" data-form="category"><label class="visually-hidden" for="c-new">Add category</label><input id="c-new" maxlength="40" placeholder="New category" required><button class="btn btn-small" type="submit">Add</button></form>' +
        "</section>" +
      "</div>";
  }

  async function adminDo(fn, okMsg) {
    try {
      const res = await fn();
      state.adminConfirm = null;
      await refresh();
      if (okMsg) toast(typeof okMsg === "function" ? okMsg(res) : okMsg);
    } catch (e) { toast(e.message, "error"); }
  }

  function onAdminSubmit(form) {
    const kind = form.dataset.form, id = form.dataset.id;
    const v = (sel) => $(sel, form).value;
    if (kind === "start") return adminDo(() => api.startCycle(v("#a-label").trim(), v("#a-end")), "Cycle started. Students can see the closing date.");
    if (kind === "extend") return adminDo(() => api.extendCycle(v("#a-extend")), "Closing date updated.");
    if (kind === "update") {
      const body = v("#u-" + id).trim(), st = v("#us-" + id);
      if (!body) { toast("Write the update first.", "error"); return; }
      return adminDo(() => api.postUpdate(id, body, st || null), "Update posted. Students can see it now.");
    }
    if (kind === "hide") return adminDo(() => api.moderate(id, true, v("#h-" + id)), "Post hidden.");
    if (kind === "merge") {
      const into = v("#m-" + id); if (!into) { toast("Choose the original concern.", "error"); return; }
      return adminDo(() => api.merge(id, into), "Merged. The votes moved to the original concern.");
    }
    if (kind === "settings") return adminDo(() => api.saveSettings({
      school_name: v("#s-name"), posts_per_day: +v("#s-posts"), picks_per_cycle: +v("#s-picks"), public_read: $("#s-public", form).checked,
    }), "Settings saved.");
    if (kind === "domain") return adminDo(() => api.setDomain(v("#d-new"), true), "Domain added.");
    if (kind === "admin") return adminDo(() => api.setAdmin(v("#ad-new"), true), "Management account added.");
    if (kind === "category") return adminDo(() => api.setCategory(v("#c-new"), true), "Category added.");
  }

  // ------------------------------------------------------------------
  // Routing (#board, #how, #admin, #concern-<id>)
  // ------------------------------------------------------------------
  function currentView() {
    const h = location.hash.slice(1);
    if (h === "how" || h === "anonymity") return "how";
    if (h === "admin") return "admin";
    return "board";
  }
  function route(quiet) {
    const h = location.hash.slice(1);
    const view = currentView();
    $$(".view").forEach((v) => { v.hidden = v.id !== "view-" + view; });
    $$("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === view ? "page" : "false"));
    if (view === "admin") renderAdmin();
    if (!quiet) {
      if (h === "anonymity") { const t = $("#anonymity"); if (t) t.scrollIntoView(); }
      else window.scrollTo(0, 0);
    }
    if (h.startsWith("concern-") && state.loaded) {
      const id = h.slice(8);
      history.replaceState(null, "", location.pathname + location.search + "#board");
      openDetail(id);
    }
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-vote],[data-open],[data-action],[data-tab],[data-close]");
    if (!t) return;
    if (t.dataset.vote) { e.preventDefault(); vote(t.dataset.vote); return; }
    if (t.dataset.open) {
      e.preventDefault();
      if ($("#dlg-post").open) $("#dlg-post").close();
      openDetail(t.dataset.open); return;
    }
    if (t.dataset.tab) { state.tab = t.dataset.tab; renderFilters(); renderList(); return; }
    if (t.hasAttribute("data-close")) { t.closest("dialog").close(); return; }
    const a = t.dataset.action;
    const demoIn = (email) => api.sendSignInEmail(email).then(() => { $("#dlg-signin").close(); toast("Signed in as " + email); });
    switch (a) {
      case "signin": openSignIn(); break;
      case "signout": api.signOut().then(() => toast("Signed out.")); break;
      case "signin-back": openSignIn(); break;
      case "signin-anyway": $("#si-email").dataset.confirmed = "1"; $("#email-form").requestSubmit(); break;
      case "demo-student": demoIn("student" + Math.floor(1000 + Math.random() * 9000) + "@" + api.demoDomain); break;
      case "demo-admin": demoIn(api.demoAdmin); break;
      case "close-cycle": state.adminConfirm = { type: "close" }; renderAdmin(); break;
      case "close-cycle-confirm": adminDo(() => api.closeCycle(), (r) => r.selected.length
        ? "Cycle closed. Committed to: " + r.selected.map((x) => x.title).join("; ")
        : "Cycle closed. No concern had votes, so nothing was committed."); break;
      case "cancel-confirm": state.adminConfirm = null; renderAdmin(); break;
      case "hide": state.adminConfirm = { type: "hide", id: t.dataset.id }; renderAdmin(); setTimeout(() => { const i = $("#h-" + t.dataset.id); if (i) i.focus(); }, 0); break;
      case "merge": state.adminConfirm = { type: "merge", id: t.dataset.id }; renderAdmin(); break;
      case "restore": adminDo(() => api.moderate(t.dataset.id, false, null), "Post restored."); break;
      case "rm-domain": adminDo(() => api.setDomain(t.dataset.value, false), "Domain removed."); break;
      case "rm-admin": adminDo(() => api.setAdmin(t.dataset.value, false), "Management account removed."); break;
      case "rm-cat": adminDo(() => api.setCategory(t.dataset.value, false), "Category removed."); break;
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.method === "dialog") return;
    e.preventDefault();
    if (f.id === "email-form") return submitEmail(e);
    if (f.id === "code-form") return submitCode(e);
    if (f.id === "post-form") return submitPost(e);
    if (f.dataset.form) return onAdminSubmit(f);
  });

  $("#open-post").addEventListener("click", openPost);
  $("#p-title").addEventListener("input", onTitleInput);
  $("#f-search").addEventListener("input", (e) => { state.search = e.target.value; renderList(); });
  $("#f-cat").addEventListener("change", (e) => { state.cat = e.target.value; renderList(); });
  $("#demo-reset").addEventListener("click", () => { if (api.reset) { api.reset(); toast("Sample data reset."); } });
  // close a dialog by clicking its backdrop
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  $("#tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = $$("#tabs [data-tab]"); const i = tabs.findIndex((b) => b.dataset.tab === state.tab);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    state.tab = n.dataset.tab; renderFilters(); renderList(); n.focus();
  });
  window.addEventListener("hashchange", () => {
    const h = location.hash;
    if (h.includes("=")) return; // sign-in tokens, handled by Supabase
    route(false);
  });

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
  (async function start() {
    renderAll();
    try {
      await api.init(() => { refresh(); });
    } catch (e) { toast(e.message, "error"); }
    // Remove sign-in tokens or errors Supabase left in the address bar
    if (/access_token=|error_description=|error=/.test(location.hash)) {
      const err = /error_description=([^&]+)/.exec(location.hash);
      history.replaceState(null, "", location.pathname + "#board");
      if (err) toast(decodeURIComponent(err[1].replace(/\+/g, " ")) + " Request a new sign-in email.", "error");
    }
    await refresh();
  })();
})();
