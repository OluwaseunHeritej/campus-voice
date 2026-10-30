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
  SUPABASE_URL: "https://ezgdkhykwbcvjvfipjbh.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6Z2RraHlrd2Jjdmp2ZmlwamJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNDkzODAsImV4cCI6MjEwODkyNTM4MH0.sMpty7O8mmPeODwh1-SloLyywMyTUKVo0Ql51RNnZQ0",

  APP_NAME: "Campus Voice",

  // Set to true to force demo mode even after connecting Supabase
  // (handy as a backup during a presentation).
  FORCE_DEMO: false,
};
