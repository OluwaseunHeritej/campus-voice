# Campus Voice

An anonymous concerns board for a school. Students sign in with their school email, raise concerns, and upvote each other's. At the end of each cycle (monthly or per semester) the top-voted concern is picked automatically, and management posts updates on it until it is resolved.

Everything here runs on free plans: **Supabase** (database + email sign-in), **Gmail** (sends the sign-in emails) and **GitHub Pages** or **Netlify** (hosts the website). No credit card is needed.

---

## What's in the folder

| Path | What it is |
|---|---|
| `index.html` | The website (one page with Concerns, How it works and Management views) |
| `css/styles.css` | All styling, light and dark mode |
| `js/config.js` | **The only file you edit**: your Supabase URL and key |
| `js/app.js` | The website's behaviour |
| `js/api-supabase.js` | Talks to the live database |
| `js/api-demo.js` | Demo mode: sample data saved in the visitor's browser |
| `supabase/schema.sql` | The database: tables, rules and functions. Run once in Supabase |

**Demo mode:** until you put real keys in `js/config.js`, the site runs on sample data with "Try as a student / Try as management" buttons. Useful for rehearsing, and as a backup during your presentation (`FORCE_DEMO: true`).

To preview locally, run a tiny web server in the folder (opening the file directly also works in most browsers):

```
python -m http.server 8000
```

then open http://localhost:8000.

---

## Features

**Students**
- Sign in with a school email. No password: a link and a 6-digit code are emailed.
- Raise a concern (title, category, optional details). While typing the title, similar existing concerns appear so students vote instead of reposting.
- One vote per student per concern; a vote can be taken back while voting is open.
- A daily post limit (default 2) keeps the board from being flooded.
- "Mine" tab lists your own posts. It is remembered only on your device, never on your account.
- Countdown to the end of the cycle and which concern is leading.

**Management**
- Start a cycle with a name and closing date (e.g. "November 2026" or "First Semester 2026/27"); change the date if needed.
- Close the cycle: the top-voted open concern is committed automatically. Management cannot pick a different one, so students can trust the vote.
- Post updates and move the concern through In progress → Resolved (or Declined, with a reason).
- Merge duplicates (votes move across with no double counting) and hide posts that break the rules.
- Settings: school name, posts per day, concerns committed per cycle, whether the public can read the board.
- Access: which email domains count as students, who is management, categories.

---

## Setup (about 30–45 minutes)

### 1. Put the code on GitHub
1. Create a free account at github.com and a new **public** repository, e.g. `campus-voice`.
2. Upload the contents of this folder (Add file → Upload files), so `index.html` sits at the top level.

### 2. Create the Supabase project
1. Sign up at supabase.com (free plan) and create a **New project**. Choose a strong database password and the region nearest your school.
2. When it's ready, open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**.
3. In a new query, run these two lines with your real values:
   ```sql
   insert into public.allowed_domains (domain) values ('yourschool.edu.ng');
   insert into public.admins (email) values ('dean.students@yourschool.edu.ng');
   ```
   The first is the part after `@` in student emails (subdomains such as `students.yourschool.edu.ng` are included automatically). The second is the first management account; more can be added from the website later.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key into `js/config.js` (edit it on GitHub with the pencil icon). The anon key is meant to be public; the database rules are what protect the data.

### 3. Send sign-in emails through Gmail
Supabase's built-in email only delivers to members of your Supabase team, about 2 per hour, so students would never get their sign-in emails. Use a free Gmail account instead:

1. Create a Gmail account for the project (e.g. `campusvoice.yourschool@gmail.com`).
2. In that Google account, turn on **2-Step Verification**, then create an **App password** (search "App passwords" in your Google Account settings). Copy the 16-character password.
3. In Supabase go to **Authentication → Emails → SMTP Settings**, turn on custom SMTP and enter:
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: the Gmail address · Password: the app password
   - Sender email: the Gmail address · Sender name: `Campus Voice`
4. Under **Authentication → Rate Limits**, check the limit for emails sent per hour and raise it if a whole class may sign in at once. A personal Gmail account can send roughly 500 emails a day.

Alternative: Brevo's free plan sends 300 emails a day, but it expects you to verify a domain you own.

### 4. Add the code to the sign-in email
School email systems often "pre-click" links to scan them, which can use up a one-time sign-in link. A typed code avoids that and also works when a student opens the email on a different device.

In **Authentication → Emails → Templates → Magic Link**, replace the message body with:

```html
<h2>Sign in to Campus Voice</h2>
<p>Your code: <strong style="font-size:22px;letter-spacing:3px">{{ .Token }}</strong></p>
<p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
<p>Your name and email are never attached to anything you post.</p>
```

### 5. Publish the website
1. On GitHub: **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. After a minute your site is at `https://<your-username>.github.io/campus-voice/`.
   *(Or drag the folder onto app.netlify.com/drop for a `*.netlify.app` address.)*
2. In Supabase go to **Authentication → URL Configuration** and set **Site URL** to that address. Add the same address under **Redirect URLs**.

### 6. First run
1. Open the site and sign in with the management email → **Management** → **Start cycle**.
2. Sign in with a student email in another browser, raise a concern, vote.
3. Back in Management, try merging, posting an update, and closing a cycle.

---

## Presentation tips
- **Free projects pause after a week with no activity.** Open the site or the Supabase dashboard a day before presenting. If it's paused, click **Restore project** in Supabase.
- **Panel members without school emails:** add a temporary domain (e.g. `gmail.com`) under Management → Access before the session, and remove it afterwards.
- **Backup:** if the network fails, set `FORCE_DEMO: true` in `js/config.js` and the site runs on sample data in the browser.

---

## How anonymity works (and its limits)

What is stored when a student posts: the title, details, category and **date only**. There is no author column, posts get random IDs, and there are no times, so a post cannot be lined up with a sign-in.

Votes and the daily post limit need to know "has this student already…?" without knowing who the student is. Each one is stored with a pseudonym: `HMAC-SHA256(secret key, account id)`. The secret key is generated inside the database in a `private` schema that the website API cannot reach. Nobody can read individual votes through the API at all; only the totals are visible.

Who can see what:

| Who | Can see who posted a concern? | Can see who voted? |
|---|---|---|
| Other students, the public | No | No |
| Management (website dashboard) | No | No |
| Someone with the Supabase **owner** login | Not directly | Possibly, with effort |

The last row is the honest limit. The Supabase project owner can open the database directly, read the secret key and the list of accounts, recompute every pseudonym, and so see which concerns an account voted for. Because a new post starts with its author's own vote, that could also hint at who wrote a post. Supabase also keeps short-lived request logs that the owner can see.

So in practice: **the Supabase owner account should be held by a neutral party** (e.g. the student union or your project team, not school management), and management should only ever use the website. That separation is part of the design; say so when you present it.

Students should also keep their own posts anonymous: avoid personal details and don't name staff or students.

---

## Free-plan limits worth knowing
- Supabase free: 500 MB database, 50,000 monthly active users, 2 free projects, pauses after 1 week of inactivity.
- Gmail SMTP: about 500 emails per day.
- The board loads up to 1,000 concerns at once, plenty for a school; archive old ones in SQL if you ever get near that.
