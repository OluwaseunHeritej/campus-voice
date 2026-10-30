// Live data layer: talks to Supabase. Every write goes through a
// database function that enforces the rules (see supabase/schema.sql).
window.SupabaseAPI = function createSupabaseAPI(cfg) {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error("Could not load the Supabase library. Check your internet connection.");
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      // "implicit" lets a student request the link on a laptop and open it on a phone.
      flowType: "implicit",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(friendly(error.message));
    return data;
  };
  const rpc = async (fn, args) => unwrap(await sb.rpc(fn, args || {}));

  function friendly(msg) {
    if (!msg) return "Something went wrong. Please try again.";
    if (/rate limit/i.test(msg)) return "Too many sign-in emails were requested. Wait a few minutes and try again.";
    if (/Token has expired|invalid/i.test(msg) && /otp|token/i.test(msg)) return "That code is wrong or has expired. Request a new one.";
    if (/Failed to fetch/i.test(msg)) return "Cannot reach the server. Check your connection. (If this is a new project, it may be paused in Supabase.)";
    return msg;
  }

  return {
    mode: "live",

    async init(onAuthChange) {
      await sb.auth.getSession();
      sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") onAuthChange();
      });
    },

    // ---- auth
    async sendSignInEmail(email) {
      unwrap(await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
      }));
    },
    async verifyCode(email, token) {
      unwrap(await sb.auth.verifyOtp({ email, token, type: "email" }));
    },
    async signOut() { await sb.auth.signOut(); },

    // ---- reads
    whoami: () => rpc("whoami"),
    async settings() { return unwrap(await sb.from("settings").select("*").eq("id", 1).single()); },
    async categories() { return unwrap(await sb.from("categories").select("name").order("sort").order("name")).map((c) => c.name); },
    async domains() { return unwrap(await sb.from("allowed_domains").select("domain").order("domain")).map((d) => d.domain); },
    async admins() { return unwrap(await sb.from("admins").select("email").order("email")).map((a) => a.email); },
    async cycles() { return unwrap(await sb.from("cycles").select("*").order("starts_on", { ascending: false }).limit(50)); },
    async complaints() {
      return unwrap(await sb.from("complaints").select("*")
        .order("vote_count", { ascending: false }).limit(1000));
    },
    async updates(ids) {
      if (!ids.length) return [];
      return unwrap(await sb.from("updates").select("*").in("complaint_id", ids).order("created_at"));
    },
    async myVotes() { return new Set((await rpc("my_votes")) || []); },
    similar: (q) => rpc("similar_complaints", { q }),

    // ---- student actions
    post: (title, body, category) => rpc("post_complaint", { p_title: title, p_body: body, p_category: category }),
    toggleVote: (id) => rpc("toggle_vote", { p_complaint: id }),

    // ---- management actions
    startCycle: (label, endsOn) => rpc("admin_start_cycle", { p_label: label, p_ends_on: endsOn }),
    extendCycle: (endsOn) => rpc("admin_extend_cycle", { p_ends_on: endsOn }),
    closeCycle: () => rpc("admin_close_cycle"),
    postUpdate: (id, body, status) => rpc("admin_post_update", { p_complaint: id, p_body: body, p_status: status || null }),
    moderate: (id, hide, note) => rpc("admin_moderate", { p_complaint: id, p_hide: hide, p_note: note || null }),
    merge: (dup, into) => rpc("admin_merge", { p_duplicate: dup, p_into: into }),
    saveSettings: (s) => rpc("admin_save_settings", {
      p_school_name: s.school_name, p_posts_per_day: s.posts_per_day,
      p_picks_per_cycle: s.picks_per_cycle, p_public_read: s.public_read,
    }),
    setDomain: (d, on) => rpc("admin_set_domain", { p_domain: d, p_allowed: on }),
    setAdmin: (e, on) => rpc("admin_set_admin", { p_email: e, p_admin: on }),
    setCategory: (n, on) => rpc("admin_set_category", { p_name: n, p_add: on }),
  };
};
