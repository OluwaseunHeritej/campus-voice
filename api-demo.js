// Demo data layer: same interface as the live one, but everything is kept
// in this browser's localStorage and follows the same rules as the database
// (one vote per student, daily post limit, automatic top pick, no authors).
window.DemoAPI = function createDemoAPI() {
  const KEY = "campus-voice-demo-v1";
  const DEMO_DOMAIN = "demo.edu.ng";
  const DEMO_ADMIN = "dean.students@demo.edu.ng";
  let listener = () => {};
  let memory = null; // fallback when localStorage is blocked

  const iso = (d) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const stampAgo = (days, h = 10) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  // stand-in for the database's HMAC pseudonym
  const pseudonym = (email) => {
    let h = 5381; for (const ch of "demo-secret:" + email) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
    return "v" + h.toString(16);
  };
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));
  const fail = (msg) => { throw new Error(msg); };

  function seed() {
    const cyc1 = uid(), cyc2 = uid(), cyc3 = uid();
    const c = (title, body, category, ago, votes, status = "open", extra = {}) =>
      ({ id: uid(), title, body, category, created_on: daysFrom(-ago), status, vote_count: votes,
         merged_into: null, selected_in: null, status_note: null, updated_at: null, ...extra });

    const lights = c("Path behind the female hostel has no working streetlights",
      "Students coming back from night reading walk through complete darkness between the library and the female hostel. Two lamps have been out since resumption.",
      "Safety & Security", 70, 211, "resolved", { selected_in: cyc1 });
    const water = c("No running water in Block C hostel most mornings",
      "Taps in Block C run dry from about 6am to 10am. Students queue at the borehole and miss early lectures.",
      "Hostel & Accommodation", 38, 186, "in_progress", { selected_in: cyc2 });

    const open = [
      c("Power goes off in the hostels during exam week",
        "The generator schedule ends at 10pm, but most of us read until 1am during exams. Please extend generator hours for the two weeks of exams.",
        "Hostel & Accommodation", 9, 143),
      c("Course registration portal crashes on the last day",
        "The portal times out when everyone registers at once. Many students paid late registration fines because of it.",
        "Fees & Administration", 12, 118),
      c("Library Wi-Fi drops after 6pm",
        "The connection works in the morning but becomes unusable in the evening when most students come to read.",
        "Academics", 6, 97),
      c("Cafeteria raised prices without any notice",
        "Rice and stew went from ₦800 to ₦1,200 in one week. Students should be told before prices change.",
        "Food & Cafeteria", 4, 74),
      c("Shuttle to the main gate stops running at 7pm",
        "Evening lectures end at 7pm, so students walk 25 minutes to the gate in the dark.",
        "Transport", 15, 61),
      c("Timetable clash for 300-level CSC and MTH electives",
        "CSC 305 and MTH 307 hold their lectures at the same time on Tuesdays, but both are required for some programmes.",
        "Academics", 3, 42),
      c("Broken ceiling fans in Lecture Theatre 2",
        "Four of the six fans in LT2 do not work. The hall is very hot during afternoon classes.",
        "Facilities & Maintenance", 7, 33),
      c("School clinic often runs out of basic drugs",
        "Students are sent away to buy paracetamol and antimalarials outside campus.",
        "Health & Wellbeing", 2, 29),
      c("Results take too long to be released",
        "Last semester's results were released three weeks into the new semester, after course registration had closed.",
        "Academics", 20, 26),
    ];

    const updates = [
      { id: uid(), complaint_id: lights.id, status: "selected", created_at: stampAgo(61),
        body: "Chosen as the top concern of Cycle 1, 2026/27 First Semester with 211 votes. Management has committed to act on it." },
      { id: uid(), complaint_id: lights.id, status: "in_progress", created_at: stampAgo(55),
        body: "Works department has inspected the path. Six lamp heads and one cable section need replacing. Parts ordered." },
      { id: uid(), complaint_id: lights.id, status: "resolved", created_at: stampAgo(41),
        body: "All eight streetlights on the path are now working. Security will also patrol the path from 8pm to midnight." },
      { id: uid(), complaint_id: water.id, status: "selected", created_at: stampAgo(9),
        body: "Chosen as the top concern of Cycle 2, 2026/27 First Semester with 186 votes. Management has committed to act on it." },
      { id: uid(), complaint_id: water.id, status: "in_progress", created_at: stampAgo(6),
        body: "The Block C pump is faulty. A temporary water tanker will be stationed behind Block C from 5:30am daily until the new pump is installed." },
      { id: uid(), complaint_id: water.id, status: null, created_at: stampAgo(2),
        body: "New pump has been delivered. Installation is scheduled for next week. The tanker stays until then." },
    ];

    return {
      settings: { id: 1, school_name: "Example University (demo)", posts_per_day: 2, picks_per_cycle: 1, public_read: true },
      domains: [DEMO_DOMAIN],
      admins: [DEMO_ADMIN],
      categories: ["Academics", "Hostel & Accommodation", "Food & Cafeteria", "Facilities & Maintenance",
        "Safety & Security", "Fees & Administration", "Health & Wellbeing", "Transport", "Other"],
      cycles: [
        { id: cyc3, label: "Cycle 3 · 2026/27 First Semester", starts_on: daysFrom(-9), ends_on: daysFrom(19), closed_at: null },
        { id: cyc2, label: "Cycle 2 · 2026/27 First Semester", starts_on: daysFrom(-39), ends_on: daysFrom(-9), closed_at: stampAgo(9, 9) },
        { id: cyc1, label: "Cycle 1 · 2026/27 First Semester", starts_on: daysFrom(-90), ends_on: daysFrom(-61), closed_at: stampAgo(61, 9) },
      ],
      complaints: [lights, water, ...open],
      votes: [],
      updates,
      quota: {},
      session: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage blocked */ }
    if (!memory) memory = seed();
    return memory;
  }
  let db = load();
  function save() {
    memory = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* keep in memory */ }
  }
  save();

  const email = () => (db.session && db.session.email) || "";
  const isAdmin = () => !!email() && db.admins.includes(email());
  const isStudent = () => {
    if (!email() || isAdmin()) return false;
    const dom = email().split("@")[1] || "";
    return db.domains.some((d) => dom === d || dom.endsWith("." + d));
  };
  const canRead = () => db.settings.public_read || isStudent() || isAdmin();
  const today = () => iso(new Date());
  const requireAdmin = () => { if (!isAdmin()) fail("Management access only."); };
  const byId = (id) => db.complaints.find((c) => c.id === id);
  const addUpdate = (complaint_id, body, status) =>
    db.updates.push({ id: uid(), complaint_id, body, status: status || null, created_at: new Date().toISOString() });

  return {
    mode: "demo",
    demoDomain: DEMO_DOMAIN,
    demoAdmin: DEMO_ADMIN,

    async init(onAuthChange) { listener = onAuthChange; },
    reset() { db = seed(); save(); listener(); },

    // ---- auth (no email in demo; signs in straight away)
    async sendSignInEmail(addr) {
      db.session = { email: addr.toLowerCase().trim() }; save();
      setTimeout(listener, 0);
      return delay();
    },
    async verifyCode() { return delay(); },
    async signOut() { db.session = null; save(); listener(); },

    // ---- reads
    async whoami() {
      const used = db.quota[pseudonym(email()) + "|" + today()] || 0;
      return delay({
        signed_in: !!email(), email: email() || null, is_admin: isAdmin(), is_student: isStudent(),
        posts_left: isStudent() ? Math.max(db.settings.posts_per_day - used, 0) : 0,
      });
    },
    async settings() { return delay({ ...db.settings }); },
    async categories() { return delay([...db.categories]); },
    async domains() { return delay([...db.domains].sort()); },
    async admins() { requireAdmin(); return delay([...db.admins].sort()); },
    async cycles() { return delay([...db.cycles].sort((a, b) => b.starts_on.localeCompare(a.starts_on))); },
    async complaints() {
      if (!canRead()) return delay([]);
      return delay(db.complaints.filter((c) => isAdmin() || c.status !== "hidden").map((c) => ({ ...c })));
    },
    async updates(ids) {
      if (!canRead()) return delay([]);
      const set = new Set(ids);
      return delay(db.updates.filter((u) => set.has(u.complaint_id)).sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    async myVotes() {
      if (!isStudent()) return new Set();
      const me = pseudonym(email());
      return new Set(db.votes.filter((v) => v.voter === me).map((v) => v.complaint_id));
    },
    async similar(q) {
      const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
      const qw = words(q);
      if (q.trim().length < 4 || !qw.size) return delay([]);
      return delay(db.complaints
        .filter((c) => ["open", "selected", "in_progress"].includes(c.status))
        .map((c) => {
          const cw = words(c.title + " " + c.body);
          let hit = 0; qw.forEach((w) => { if ([...cw].some((x) => x.startsWith(w.slice(0, 5)))) hit++; });
          return { id: c.id, title: c.title, status: c.status, vote_count: c.vote_count, score: hit / qw.size };
        })
        .filter((r) => r.score >= 0.34)
        .sort((a, b) => b.score - a.score || b.vote_count - a.vote_count)
        .slice(0, 5));
    },

    // ---- student actions
    async post(title, body, category) {
      if (!isStudent()) fail("Only signed-in students with a school email can post.");
      title = (title || "").trim(); body = (body || "").trim();
      if (title.length < 8 || title.length > 120) fail("The title must be 8 to 120 characters.");
      if (body.length > 2000) fail("Details must be 2,000 characters or fewer.");
      if (!db.categories.includes(category)) fail("Choose a category.");
      const me = pseudonym(email()); const k = me + "|" + today();
      if ((db.quota[k] || 0) >= db.settings.posts_per_day)
        fail("You have reached today's posting limit. Upvote an existing concern instead, or try again tomorrow.");
      const row = { id: uid(), title, body, category, created_on: today(), status: "open", vote_count: 1,
        merged_into: null, selected_in: null, status_note: null, updated_at: null };
      db.complaints.push(row);
      db.quota[k] = (db.quota[k] || 0) + 1;
      db.votes.push({ complaint_id: row.id, voter: me });
      save();
      return delay(row.id);
    },
    async toggleVote(id) {
      if (!isStudent()) fail("Only signed-in students with a school email can vote.");
      const c = byId(id); if (!c) fail("Concern not found.");
      if (c.status !== "open") fail("Voting is closed for this concern.");
      const me = pseudonym(email());
      const i = db.votes.findIndex((v) => v.complaint_id === id && v.voter === me);
      if (i >= 0) { db.votes.splice(i, 1); c.vote_count = Math.max(0, c.vote_count - 1); }
      else { db.votes.push({ complaint_id: id, voter: me }); c.vote_count++; }
      save();
      return delay({ voted: i < 0, vote_count: c.vote_count });
    },

    // ---- management actions
    async startCycle(label, endsOn) {
      requireAdmin();
      if (db.cycles.some((c) => !c.closed_at)) fail("Close the current cycle before starting a new one.");
      if (!label || label.trim().length < 2) fail("Give the cycle a name.");
      if (!endsOn || endsOn < today()) fail("The end date must be today or later.");
      db.cycles.push({ id: uid(), label: label.trim(), starts_on: today(), ends_on: endsOn, closed_at: null });
      save(); return delay();
    },
    async extendCycle(endsOn) {
      requireAdmin();
      const cyc = db.cycles.find((c) => !c.closed_at);
      if (!cyc || !endsOn || endsOn < cyc.starts_on) fail("No open cycle, or the date is before the cycle started.");
      cyc.ends_on = endsOn; save(); return delay();
    },
    async closeCycle() {
      requireAdmin();
      const cyc = db.cycles.find((c) => !c.closed_at);
      if (!cyc) fail("There is no open cycle to close.");
      const picks = db.complaints.filter((c) => c.status === "open" && c.vote_count > 0)
        .sort((a, b) => b.vote_count - a.vote_count || a.created_on.localeCompare(b.created_on))
        .slice(0, db.settings.picks_per_cycle);
      picks.forEach((c) => {
        c.status = "selected"; c.selected_in = cyc.id; c.updated_at = new Date().toISOString();
        addUpdate(c.id, `Chosen as the top concern of ${cyc.label} with ${c.vote_count} vote${c.vote_count === 1 ? "" : "s"}. Management has committed to act on it.`, "selected");
      });
      cyc.closed_at = new Date().toISOString();
      save();
      return delay({ cycle: cyc.label, selected: picks.map((c) => ({ id: c.id, title: c.title, votes: c.vote_count })) });
    },
    async postUpdate(id, body, status) {
      requireAdmin();
      if (!body || !body.trim()) fail("Write the update first.");
      const c = byId(id); if (!c) fail("Concern not found.");
      addUpdate(id, body.trim(), status);
      if (status) c.status = status;
      c.updated_at = new Date().toISOString();
      save(); return delay();
    },
    async moderate(id, hide, note) {
      requireAdmin();
      const c = byId(id); if (!c) fail("Concern not found.");
      c.status = hide ? "hidden" : "open"; c.status_note = (note || "").trim() || null;
      c.updated_at = new Date().toISOString();
      save(); return delay();
    },
    async merge(dup, into) {
      requireAdmin();
      if (dup === into) fail("Pick two different concerns.");
      const a = byId(dup), b = byId(into);
      if (!a || !b || !["open", "selected", "in_progress"].includes(b.status)) fail("The concern you merge into must still be active.");
      const already = new Set(db.votes.filter((v) => v.complaint_id === into).map((v) => v.voter));
      const moving = db.votes.filter((v) => v.complaint_id === dup);
      const overlap = moving.filter((v) => already.has(v.voter)).length;
      db.votes = db.votes.filter((v) => v.complaint_id !== dup)
        .concat(moving.filter((v) => !already.has(v.voter)).map((v) => ({ ...v, complaint_id: into })));
      b.vote_count += Math.max(a.vote_count - overlap, 0);
      a.vote_count = 0; a.status = "merged"; a.merged_into = into; a.updated_at = new Date().toISOString();
      save(); return delay();
    },
    async saveSettings(s) {
      requireAdmin();
      Object.assign(db.settings, {
        school_name: s.school_name.trim() || db.settings.school_name,
        posts_per_day: Math.min(20, Math.max(1, +s.posts_per_day || 1)),
        picks_per_cycle: Math.min(5, Math.max(1, +s.picks_per_cycle || 1)),
        public_read: !!s.public_read,
      });
      save(); return delay();
    },
    async setDomain(d, on) {
      requireAdmin(); d = (d || "").toLowerCase().trim();
      if (on) { if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) fail("Enter a domain like school.edu.ng"); if (!db.domains.includes(d)) db.domains.push(d); }
      else db.domains = db.domains.filter((x) => x !== d);
      save(); return delay();
    },
    async setAdmin(e, on) {
      requireAdmin(); e = (e || "").toLowerCase().trim();
      if (on) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail("Enter a full email address."); if (!db.admins.includes(e)) db.admins.push(e); }
      else { if (e === email()) fail("You cannot remove yourself."); db.admins = db.admins.filter((x) => x !== e); }
      save(); return delay();
    },
    async setCategory(n, on) {
      requireAdmin(); n = (n || "").trim();
      if (on) { if (n.length < 2) fail("Category names need at least 2 characters."); if (!db.categories.includes(n)) db.categories.push(n); }
      else { if (db.complaints.some((c) => c.category === n)) fail("That category is in use and cannot be removed."); db.categories = db.categories.filter((x) => x !== n); }
      save(); return delay();
    },
  };
};
