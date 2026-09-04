# Launch posts — Flutter Supabase Doctor

Tool: https://arling.sk/flutter-supabase-doctor/
All copy below is ready to paste. Read each platform's current rules
immediately before posting (noted per-section) — rules and mod
sentiment change over time and this file won't stay current with
them. GitHub issue states/dates below were checked via the GitHub API
on 2026-09-04 and will drift — re-check before posting if this file
sits for more than a few weeks.

---

## 1. GitHub thread replies — status check + recommendation

Rule applied: **open → post. Closed → post only if the most recent
*human* comment (not a bot) is less than ~12 months old** — otherwise
the thread is dead enough that a reply mostly reaches nobody and just
looks like drive-by self-promo on an abandoned issue.

| # | Issue | State | Last comment | Recommendation |
|---|-------|-------|---------------|-----------------|
| 1 | [supabase/auth#2447](https://github.com/supabase/auth/issues/2447) — redirect URLs with underscores | **Open** | 2026-04-13 (human, ~5 mo ago) | **Post** |
| 2 | [supabase-flutter#766](https://github.com/supabase/supabase-flutter/issues/766) — OAuth + `LaunchMode.inAppWebView` can't redirect | Closed 2023-12-19 | 2023-12-19 (human, ~2 yr 9 mo ago) | **Skip** — dead thread |
| 3 | [supabase-flutter#767](https://github.com/supabase/supabase-flutter/issues/767) — `signInWithOAuth` not redirecting via deep link | Closed 2023-12-17 | 2023-12-17 (human, ~2 yr 9 mo ago) | **Skip** — dead thread |
| 4 | [supabase-flutter#935](https://github.com/supabase/supabase-flutter/issues/935) — `AuthChangeEvent` doesn't fire after OAuth | Closed 2024-05-21 | 2024-05-21 (human, ~2 yr 3 mo ago) | **Skip** — dead thread |
| 5 | [supabase-flutter#688](https://github.com/supabase/supabase-flutter/issues/688) — Android auth deep link broken | Closed 2023-11-03 | 2023-11-03 (human, ~2 yr 10 mo ago) | **Skip** — dead thread |
| 6 | [supabase-flutter#1028](https://github.com/supabase/supabase-flutter/issues/1028) — iOS deep link not working (Facebook) | Closed 2024-09-09 | **2025-10-31** (human, ~10 mo ago) | **Post** — closed, but see note below |
| 7 | [supabase-flutter#1174](https://github.com/supabase/supabase-flutter/issues/1174) — Kakao login issue on iOS | Auto-closed 2026-03-29 (stale bot) | Bot comment 2026-03-29; **last human comment 2025-06-24** (~14 mo ago) | **Skip** — see note below |

Notes on the two judgment calls:

- **#1028** is closed, but a real person (`dante-cervantes-rocketlab`)
  left a substantive comment on 2025-10-31 — 10 months ago, and saying
  the underlying problem ("Apple rejects apps whose sign-in opens an
  external browser") is still live. Closed issues still show up in
  Google/GitHub search for the exact error people are hitting, and a
  reply here reaches whoever finds it that way. Recommended to post.
- **#1174** was auto-closed by `github-actions[bot]` for inactivity in
  March 2026, which makes the *issue metadata* look recent — but the
  bot's own two comments (a 180-day warning, then the close notice)
  are the only activity since the last human comment on 2025-06-24
  (14 months ago). Counting a stale-bot close as "recent activity"
  would be misleading, so this is scored by the human comment date and
  recommended to **skip**.

### 1a. `supabase/auth#2447` — redirect URLs using underscores

> This is exactly right, and it's nastier than "undocumented" — the
> failure is completely silent. A scheme or host with an underscore
> (`my_cool_app://callback`) gets mangled by Google's OAuth redirect
> handling, so Supabase's allow-list match fails and it falls back to
> Site URL with nothing surfaced anywhere in the flow to say why.
>
> Worth flagging for anyone hitting this from Flutter specifically:
> Java/Kotlin package names allow underscores, and it's extremely
> common to reuse the Android `applicationId` directly as the deep
> link scheme — so this bites native-Android-to-Flutter migrations a
> lot, and `supabase_flutter`'s own native deep-linking docs don't
> call it out either.
>
> I built a free, client-side checker for Flutter + `supabase_flutter`
> deep links that flags this specific pattern (plus the allow-list /
> `Info.plist` / `AndroidManifest.xml` mismatches that usually travel
> with it) — it cites this issue directly as the source for the
> underscore check: https://arling.sk/flutter-supabase-doctor/
> Nothing you enter leaves your browser.

### 1b. `supabase-flutter#1028` — iOS deep link not working (Facebook)

> Still a live issue, and I think the thread landed on the real shape
> of it: `LaunchMode.externalApplication` is what actually makes the
> Facebook (and Kakao/Discord) redirect fire correctly, but Apple's
> App Store review can reject a submission where sign-in visibly hands
> off to Safari (guideline 4.0 territory) — and `LaunchMode.inAppWebView`
> avoids that review risk but then several providers just detect the
> embedded WebView and hang, never handing the redirect back, exactly
> like this thread found. There isn't a single setting that satisfies
> both constraints — it's a genuine trade-off, not a missed step.
>
> If you do go with `inAppWebView`, closing it yourself is the
> reliable path: @bqubique's fix here (calling `url_launcher`'s
> `closeInAppWebView()`, driven off `onAuthStateChange`) is still the
> least-bad option I've seen for this combination.
>
> I built a free client-side checker for the config half of this
> (scheme/allow-list/`Info.plist`/`AndroidManifest.xml` mismatches,
> plus a direct flag for `LaunchMode.inAppWebView` with Kakao/Discord/
> Facebook): https://arling.sk/flutter-supabase-doctor/ — it won't
> resolve the Apple-review trade-off for you, but it rules out
> everything else in under a minute so you know where you actually
> stand.

---

## 2. Show HN

**Read HN's guidelines immediately before posting**
(https://news.ycombinator.com/newsguidelines.html and the Show HN
specific notes at https://news.ycombinator.com/showhn.html) — in
particular, post from the account that will actually respond in
comments, and be ready to answer questions for a few hours after
posting.

**Title:**
```
Show HN: Flutter Supabase Doctor – find why your OAuth deep link never returns to the app
```

**Text:**
```
I kept seeing (and hitting myself) the same handful of supabase_flutter
OAuth/magic-link failures where the browser or provider's login screen
never hands control back to the app — it just hangs on the provider's
page, or the app resumes but stays signed out. The cause is almost
always one of a small number of things: an invalid URL scheme (an
underscore in it silently breaks Google's redirect matching — see
supabase/auth#2447), Info.plist or the AndroidManifest intent-filter
not actually registering the scheme your code uses, the value missing
from Supabase's Redirect URLs allow-list, or authScreenLaunchMode set
to LaunchMode.inAppWebView, which several providers (Kakao, Discord,
Facebook) just hang inside of instead of completing.

Flutter Supabase Doctor is a free, static, client-side page: you fill
in your scheme/host, launch mode, flow type, Supabase project config,
and provider, and it works out the exact redirect your app should
produce, checks every layer against it, and reports the specific
mismatch with a copy-paste fix. It's a config linter, not a live
tester — it doesn't call your app, Supabase, or the OAuth providers,
so it won't catch a runtime bug in your deep-link handling or
anything that changed provider-side after this was written. No
account, no server, nothing you enter leaves your browser except
anonymous "a check ran" analytics events. Feedback and missing cases
very welcome.
```

---

## 3. Flutter/Supabase Discord and Reddit (r/FlutterDev, r/Supabase)

**Before posting to any of these, read the current rules first:**
- Flutter Discord / Supabase Discord: check the showcase channel's
  topic/pinned rules for format requirements (some require a specific
  template or a linked repo).
- r/FlutterDev and r/Supabase: check each subreddit's rules (sidebar /
  About / "Rules" tab) for self-promotion policy — many require a
  "Show and Tell" flair, restrict promo to a specific day, or cap how
  often the same link can be posted. If a subreddit disallows
  self-promo outright, skip it rather than risk a ban.

**Short post (works for Discord showcase and Reddit, adjust flair/tags to fit):**
```
Built a small free tool: Flutter Supabase Doctor — fill in your
supabase_flutter deep link config (URL scheme/host, Info.plist,
AndroidManifest intent-filter, Supabase Site URL / Redirect URLs,
OAuth provider) and it flags the exact mismatch causing your OAuth or
magic-link redirect to never return to the app. Static, client-side,
no signup, no backend — everything runs in your browser.

https://arling.sk/flutter-supabase-doctor/

It's a config linter, not a live tester — won't catch runtime bugs in
your deep-link handling, just the config mismatches (invalid/underscored
scheme, Info.plist/AndroidManifest not matching your code, missing
allow-list entry, LaunchMode.inAppWebView hanging on Kakao/Discord/
Facebook) that cause most of the "redirect just doesn't come back"
reports I kept seeing. Would love feedback, especially on cases it
misses.
```

---

## 4. dev.to article

**Working title:** Why your supabase_flutter OAuth redirect never comes back to the app

**Outline:**
1. **Intro** — why this keeps happening (see draft below).
2. **1. An invalid or underscored scheme** — `http`/`https` used as if
   it were a custom scheme; uppercase/whitespace; and specifically an
   underscore (`my_app://`), which Google's OAuth redirect handling
   mangles, silently failing Supabase's allow-list match and falling
   back to Site URL (supabase/auth#2447) — common because Android
   `applicationId`s allow underscores and get reused as the scheme.
3. **2. Info.plist and AndroidManifest drifting from your Dart code** —
   `CFBundleURLSchemes` or the intent-filter's `android:scheme`/
   `android:host` not matching what `redirectTo` actually sends.
4. **3. The Supabase Redirect URLs allow-list** — glob syntax
   (`*`, `**`, `?`), and Site URL as the silent fallback whenever a
   redirect isn't covered.
5. **4. `authScreenLaunchMode` vs. App Store review** — `inAppWebView`
   hangs on Kakao/Discord/Facebook, which detect the embedded WebView;
   `externalApplication` works but can trip Apple's guideline-4.0
   concerns about sign-in leaving the app — the real trade-off behind
   supabase-flutter#1028.
6. **5. Provider console vs. Supabase disagreement** — Google Cloud
   Console / Apple Services ID / GitHub OAuth App / Discord / Kakao
   needing Supabase's own `https://<ref>.supabase.co/auth/v1/callback`,
   not your app's scheme.
7. **Closing** — a checklist, and a link to Flutter Supabase Doctor
   for anyone who wants the check automated rather than manual.

**Draft intro (150 words):**
```
If you've wired up Google, Apple, Facebook, or Kakao sign-in through
Supabase Auth in a Flutter app, there's a good chance you've hit a
redirect that just doesn't come back — the provider's login screen
accepts your credentials, and then the app either never resumes or
resumes still signed out. It happens across enough different setups
that it's clearly not one bug — it's a small number of configuration
mismatches, split across Info.plist, AndroidManifest.xml, the
Supabase dashboard, a provider console, and a few lines of Dart, that
all produce the same symptom: the deep link never makes it back to
your code.

After watching the same handful of root causes show up across GitHub
issues and my own projects — including one, an underscore in the URL
scheme, that fails completely silently — I started keeping a mental
checklist. This post is that checklist, in the order each one
actually trips people up in practice.
```

---

## 5. Sibling-tool cross-promotion (already-live threads/posts)

The web and Expo Redirect Doctor tools may already have their own
launch threads live (see
`../../supabase-redirect-doctor/launch/launch-posts.md` and
`../../redirect-doctor/launch/launch-posts.md`). If either of those
threads gets a comment from a Flutter developer, a short factual
follow-up mentioning this tool is fair game — do not mass-cross-post
unprompted, only reply where someone's stated context is actually
Flutter.
