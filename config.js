// ---------------------------------------------------------------
//  Campus Voice — configuration
//
//  1. Create a free Supabase project (see README.md).
//  2. Supabase → Project Settings → API: copy the "Project URL" and
//     the "anon public" key into the two lines below.
//
//  While these still hold the placeholder values, the site runs in
//  DEMO MODE: sample concerns stored only in the visitor's browser,
//  with one-click "Try as student / Try as management" sign-in.
//  The anon key is safe to publish; the database rules protect data.
// ---------------------------------------------------------------
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-ID.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  APP_NAME: "Campus Voice",

  // Set to true to force demo mode even after connecting Supabase
  // (handy as a backup during a presentation).
  FORCE_DEMO: false,
};
