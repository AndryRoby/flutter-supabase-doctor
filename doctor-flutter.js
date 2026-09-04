// doctor-flutter.js: Supabase Auth Deep Link Doctor (Flutter / supabase_flutter) core logic.
//
// Pure, deterministic, 100% client-side: given a Flutter + supabase_flutter
// OAuth / magic-link deep link configuration (iOS Info.plist, AndroidManifest
// intent-filter, redirectTo, authScreenLaunchMode, authFlowType, the Supabase
// redirect allow-list, and the OAuth provider console), works out the exact
// deep link the app should register, checks every layer against it, and
// reports concrete mismatches + copy-paste fixes.
//
// Nothing in this file makes a network request. It only reads the object you
// pass to diagnose().
//
// This is the third sibling in the "Redirect Doctor" family: same glob
// matcher as the web (doctor-web.js) and Expo (doctor.js) tools (copied
// verbatim, not imported, so this file has zero cross-repo dependencies),
// same diagnose() shape, different domain rules for a native Flutter app
// talking to supabase_flutter directly (no Expo/AuthSession layer).
//
// Rules implemented here are sourced from:
//  - https://supabase.com/docs/guides/auth/native-mobile-deep-linking
//      (redirect URL format scheme://host, e.g. io.supabase.user-management://login-callback;
//      CFBundleURLSchemes in Info.plist; AndroidManifest intent-filter with
//      android:scheme + android:host; scheme should be unique on-device,
//      typically a reverse-domain identifier)
//  - https://supabase.com/docs/reference/dart/auth-signinwithoauth
//      (signInWithOAuth(provider, redirectTo, authScreenLaunchMode, scopes,
//      queryParams): authScreenLaunchMode defaults to LaunchMode.platformDefault;
//      LaunchMode.externalApplication is the documented choice for opening the
//      auth screen outside the app so the OS can hand the deep link back)
//  - https://pub.dev/packages/supabase_flutter
//      (deep links needed for magic link, email confirmation, password reset,
//      and OAuth; redirectTo must be added to Authentication → URL Configuration
//      → Redirect URLs; supabase_flutter uses the app_links package internally;
//      "listen to auth state changes in order to detect when the OAuth login
//      is complete")
//  - https://github.com/supabase/auth/issues/2447
//      (redirect URLs containing an underscore, e.g. my_app://callback, are
//      silently mangled by Google's OAuth redirect handling and *always*
//      fail Supabase's redirect-URL check, falling back to Site URL instead: //      workaround is a hyphen instead of an underscore, e.g. my-app://callback)
//
// Works as an ES module (import { diagnose, expectedValues } from './doctor-flutter.js')
// and, when loaded with <script type="module">, also publishes
// window.RedirectDoctorFlutter = { diagnose, expectedValues } for console/debug use.

// ───────────────────────── small string helpers ─────────────────────────

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

function trimTrailingSlash(s) {
  return safeStr(s).trim().replace(/\/+$/, '');
}

function normalizeHost(rawHost) {
  const input = safeStr(rawHost).trim();
  if (!input) return '';
  return input.replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

// ───────────────────────── Supabase redirect-URL glob matcher ─────────────────────────
// Copied verbatim from the web + Expo Redirect Doctor tools' doctor-web.js /
// doctor.js: the allow-list syntax is a Supabase Auth feature, identical
// for every client. Per https://supabase.com/docs/guides/auth/redirect-urls
//: "." and "/" are separator characters:
//   *   any run of non-separator characters
//   **  any run of characters, including separators
//   ?   exactly one non-separator character
//   [abc] / [!abc]   one character in / not in the class
//   \c  escapes the next character literally

function escapeRegexChar(c) {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern) {
  const src = safeStr(pattern);
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      out += escapeRegexChar(src[++i]);
    } else if (c === '*') {
      if (src[i + 1] === '*') {
        out += '[\\s\\S]*';
        i++;
      } else {
        out += '[^./]*';
      }
    } else if (c === '?') {
      out += '[^./]';
    } else if (c === '[') {
      let j = i + 1;
      let neg = false;
      if (src[j] === '!') {
        neg = true;
        j++;
      }
      let cls = '';
      while (j < src.length && src[j] !== ']') {
        cls += src[j];
        j++;
      }
      out += '[' + (neg ? '^' : '') + cls.replace(/\\/g, '\\\\') + ']';
      i = j;
    } else {
      out += escapeRegexChar(c);
    }
  }
  return new RegExp('^' + out + '$');
}

function globMatch(pattern, value) {
  if (!pattern || !value) return false;
  try {
    return globToRegExp(pattern).test(value);
  } catch (e) {
    return false;
  }
}

function matchesAnyAllowlist(value, patterns) {
  if (!value) return false;
  const list = Array.isArray(patterns) ? patterns : [];
  return list.some((p) => typeof p === 'string' && p.trim() && globMatch(p.trim(), value));
}

// ───────────────────────── expected-value builders ─────────────────────────

function buildRedirectTo(scheme, host) {
  const s = safeStr(scheme).trim();
  if (!s) return null;
  return host ? `${s}://${host}` : `${s}://`;
}

function buildSupabaseCallback(projectUrl) {
  const base = trimTrailingSlash(projectUrl);
  return base ? `${base}/auth/v1/callback` : null;
}

function buildAndroidIntentFilterSnippet(scheme, host) {
  const hostAttr = host ? ` android:host="${host}"` : '';
  return (
    `<intent-filter android:autoVerify="false">\n` +
    `  <action android:name="android.intent.action.VIEW" />\n` +
    `  <category android:name="android.intent.category.DEFAULT" />\n` +
    `  <category android:name="android.intent.category.BROWSABLE" />\n` +
    `  <data android:scheme="${scheme}"${hostAttr} />\n` +
    `</intent-filter>`
  );
}

function buildInfoPlistSnippet(scheme) {
  return (
    `<key>CFBundleURLTypes</key>\n` +
    `<array>\n` +
    `  <dict>\n` +
    `    <key>CFBundleURLSchemes</key>\n` +
    `    <array>\n` +
    `      <string>${scheme}</string>\n` +
    `    </array>\n` +
    `  </dict>\n` +
    `</array>`
  );
}

function computeExpected(cfg) {
  const app = cfg.app && typeof cfg.app === 'object' ? cfg.app : {};
  const supabase = cfg.supabase && typeof cfg.supabase === 'object' ? cfg.supabase : {};

  const scheme = safeStr(app.scheme).trim();
  const host = normalizeHost(app.host);
  const redirectTo = buildRedirectTo(scheme, host);
  const supabaseCallback = buildSupabaseCallback(supabase.projectUrl);

  return {
    redirectTo,
    iosPlistScheme: scheme || null,
    androidIntentFilter: scheme ? buildAndroidIntentFilterSnippet(scheme, host) : null,
    allowListEntry: scheme ? `${scheme}://**` : null,
    supabaseCallback,
  };
}

// ───────────────────────── diagnose() ─────────────────────────

const PROVIDER_FIELD_LABEL = {
  google: '"Authorized redirect URIs" in Google Cloud Console → APIs & Services → Credentials',
  apple: '"Return URLs" on the Services ID in Apple Developer → Certificates, Identifiers & Profiles',
  github: '"Authorization callback URL" in the GitHub OAuth App settings',
  discord: '"Redirects" in the Discord Developer Portal → OAuth2',
  kakao: '"Redirect URI" in Kakao Developers → your app → Product settings → Kakao Login',
  other: "the redirect/callback URL field in your provider's console",
};

function providerLabel(name) {
  return PROVIDER_FIELD_LABEL[name] || PROVIDER_FIELD_LABEL.other;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function sortProblems(problems) {
  return problems
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => (SEVERITY_ORDER[a.p.severity] - SEVERITY_ORDER[b.p.severity]) || (a.idx - b.idx))
    .map((x) => x.p);
}

/**
 * @param {object} config
 * @param {{scheme?:string, host?:string, androidPackage?:string, iosBundleId?:string, launchMode?:'externalApplication'|'inAppWebView'|'platformDefault'|'inAppBrowserView'|'', authFlowType?:'pkce'|'implicit'|'', iosSchemesInPlist?:string[], androidIntentFilter?:{scheme?:string, host?:string, autoVerify?:boolean|null}}} [config.app]
 * @param {{projectUrl?:string, siteUrl?:string, allowedRedirectUrls?:string[]}} [config.supabase]
 * @param {{name?:'google'|'apple'|'github'|'discord'|'kakao'|'other', authorizedRedirectUris?:string[]}} [config.provider]
 * @param {{redirectTo?:string, usesSkipBrowserRedirect?:boolean|null, listensToAuthStateChange?:boolean|null}} [config.code]
 * @returns {{status:'pass'|'warn'|'fail', summary:string, expected:object, problems:Array, fixes:Array, checklist:string[], disclaimer:string}}
 */
export function diagnose(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const app = cfg.app && typeof cfg.app === 'object' ? cfg.app : {};
  const supabase = cfg.supabase && typeof cfg.supabase === 'object' ? cfg.supabase : {};
  const provider = cfg.provider && typeof cfg.provider === 'object' ? cfg.provider : {};
  const code = cfg.code && typeof cfg.code === 'object' ? cfg.code : {};

  const problems = [];
  const fixes = [];
  const checklist = [];

  const scheme = safeStr(app.scheme).trim();
  const host = normalizeHost(app.host);
  const launchMode = safeStr(app.launchMode).trim();
  const authFlowType = safeStr(app.authFlowType).trim().toLowerCase();

  const expected = computeExpected(cfg);
  const { redirectTo: expectedRedirectTo, supabaseCallback } = expected;

  // ── 1. scheme validity ──────────────────────────────────────────────
  const hostHasUnderscore = host.includes('_');
  const schemeHasUnderscore = scheme.includes('_');

  if (!scheme) {
    problems.push({
      severity: 'high',
      code: 'missing_scheme',
      message: 'app.scheme is empty. A native OAuth / magic-link redirect needs a custom URL scheme to bring the user back into the app.',
      where: 'app.scheme',
    });
  } else if (/^https?$/i.test(scheme)) {
    problems.push({
      severity: 'medium',
      code: 'scheme_reserved_http',
      message: `"${scheme}" is http/https, not a custom scheme. That only works via iOS Universal Links / Android App Links (a separate setup: apple-app-site-association, assetlinks.json, autoVerify + a real https host): if that's not what you've set up, use a custom scheme like "io.supabase.myapp" instead.`,
      where: 'app.scheme',
    });
  } else if (schemeHasUnderscore || hostHasUnderscore) {
    const where = schemeHasUnderscore && hostHasUnderscore ? 'app.scheme, app.host' : schemeHasUnderscore ? 'app.scheme' : 'app.host';
    problems.push({
      severity: 'high',
      code: 'scheme_underscore',
      message: `"${schemeHasUnderscore ? scheme : host}" contains an underscore. Google's OAuth redirect handling mangles underscores in redirect URLs: a scheme or host like "my_app" *always* fails Supabase's redirect-URL check and silently falls back to Site URL (tracked in supabase/auth#2447). Use a hyphen instead.`,
      where,
    });
    fixes.push({
      title: 'Replace underscores with hyphens',
      value: `${(schemeHasUnderscore ? scheme : '').replace(/_/g, '-')}${schemeHasUnderscore && hostHasUnderscore ? ' / ' : ''}${(hostHasUnderscore ? host : '').replace(/_/g, '-')}`.trim(),
      where,
    });
  } else if (/[A-Z]/.test(scheme) || /\s/.test(scheme)) {
    problems.push({
      severity: 'high',
      code: 'scheme_invalid_case',
      message: `"${scheme}" has uppercase letters or whitespace. URL schemes are case-sensitive at the OS registration level and must not contain spaces: Android and iOS will fail to match the intent-filter / CFBundleURLSchemes entry otherwise.`,
      where: 'app.scheme',
    });
    fixes.push({ title: 'Use a lowercase scheme with no spaces', value: scheme.toLowerCase().replace(/\s+/g, ''), where: 'app.scheme' });
  } else if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
    const suggestion = scheme.toLowerCase().replace(/[^a-z0-9+.-]/g, '').replace(/^[^a-z]+/, '') || 'myapp';
    problems.push({
      severity: 'high',
      code: 'scheme_invalid_chars',
      message: `"${scheme}" is not a valid URL scheme. Use letters, digits, "+", "-", "." only, and start with a letter (e.g. "io.supabase.myapp").`,
      where: 'app.scheme',
    });
    fixes.push({ title: 'Use a valid scheme', value: suggestion, where: 'app.scheme' });
  }

  // ── 2. Supabase Site URL ─────────────────────────────────────────────
  const siteUrl = trimTrailingSlash(supabase.siteUrl);
  const siteUrlIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(siteUrl);
  if (siteUrl && siteUrlIsLocal) {
    problems.push({
      severity: 'medium',
      code: 'site_url_is_localhost',
      message: 'Supabase Site URL still points to localhost. Supabase falls back to Site URL whenever redirectTo is missing or not on the allow-list, so a rejected redirect silently sends users to a localhost URL: including from production installs.',
      where: 'supabase.siteUrl',
    });
    fixes.push({
      title: 'Set Site URL to a real production URL',
      value: 'https://your-production-domain.com',
      where: 'Supabase → Authentication → URL Configuration → Site URL',
    });
  }

  // ── 3. Supabase project URL shape ───────────────────────────────────
  const projectUrl = safeStr(supabase.projectUrl).trim();
  if (projectUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(projectUrl) && !/^https:\/\/[a-z0-9.-]+\/?$/i.test(projectUrl)) {
    problems.push({
      severity: 'medium',
      code: 'project_url_unusual',
      message: `"${projectUrl}" doesn't look like a standard https://<ref>.supabase.co project URL. If this is a custom auth domain, confirm it's mapped correctly: otherwise check for a typo.`,
      where: 'supabase.projectUrl',
    });
  } else if (!projectUrl) {
    problems.push({
      severity: 'low',
      code: 'missing_project_url',
      message: "supabase.projectUrl is empty, so the exact OAuth provider callback URL can't be computed or verified.",
      where: 'supabase.projectUrl',
    });
  }

  // ── 4. redirectTo in code vs. scheme://host ─────────────────────────
  const rawRedirectTo = safeStr(code.redirectTo).trim();
  if (rawRedirectTo && expectedRedirectTo && rawRedirectTo !== expectedRedirectTo) {
    const isTrailingSlashOnly = rawRedirectTo === `${expectedRedirectTo}/`;
    problems.push({
      severity: 'high',
      code: isTrailingSlashOnly ? 'redirect_to_trailing_slash' : 'redirect_to_mismatch',
      message: isTrailingSlashOnly
        ? `code.redirectTo is "${rawRedirectTo}": a trailing slash that "${expectedRedirectTo}" doesn't have. Keep it exact: signInWithOAuth's redirectTo is matched against the allow-list and against Info.plist / the intent-filter byte-for-byte.`
        : `code.redirectTo is "${rawRedirectTo}", but app.scheme + app.host produce "${expectedRedirectTo}". These must match exactly: Supabase rejects a redirect that isn't allow-listed exactly as sent, and falls back to Site URL.`,
      where: 'code.redirectTo',
    });
    fixes.push({ title: 'Use the exact scheme://host redirectTo', value: expectedRedirectTo, where: 'code.redirectTo' });
  }

  // ── 5. redirect allow-listed in Supabase? ───────────────────────────
  const allowList = Array.isArray(supabase.allowedRedirectUrls)
    ? supabase.allowedRedirectUrls.filter((x) => typeof x === 'string' && x.trim())
    : [];
  const valueToCheck = rawRedirectTo || expectedRedirectTo;
  if (valueToCheck) {
    const allowed = matchesAnyAllowlist(valueToCheck, allowList);
    if (!allowed) {
      problems.push({
        severity: 'high',
        code: 'redirect_not_allowlisted',
        message: `"${valueToCheck}" is not covered by any pattern in supabase.allowedRedirectUrls. Supabase will refuse the redirect and fall back to Site URL.`,
        where: 'supabase.allowedRedirectUrls',
      });
      fixes.push({
        title: 'Add to Supabase → Auth → URL Configuration → Redirect URLs',
        value: expected.allowListEntry || valueToCheck,
        where: 'supabase.allowedRedirectUrls',
      });
    }
  }
  checklist.push(
    expected.allowListEntry
      ? `Add "${expected.allowListEntry}" (covers every path under your scheme) to the Supabase redirect allow-list.`
      : 'Add your app scheme, e.g. "io.supabase.myapp://**", to the Supabase redirect allow-list.'
  );

  // ── 6. iOS: CFBundleURLSchemes contains scheme? ─────────────────────
  const iosSchemesInPlist = Array.isArray(app.iosSchemesInPlist)
    ? app.iosSchemesInPlist.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    : [];
  if (scheme) {
    const iosHasScheme = iosSchemesInPlist.includes(scheme);
    if (!iosHasScheme) {
      problems.push({
        severity: 'high',
        code: 'ios_scheme_missing_in_plist',
        message: `Info.plist's CFBundleURLSchemes doesn't list "${scheme}". Without it, iOS never hands the OAuth/magic-link redirect back to your app: Safari (or the auth screen) just sits on the URL, or the OS reports it can't open the link.`,
        where: 'app.iosSchemesInPlist',
      });
      fixes.push({ title: 'Add the scheme to ios/Runner/Info.plist', value: buildInfoPlistSnippet(scheme), where: 'ios/Runner/Info.plist' });
    }
  }

  // ── 7. Android: intent-filter scheme + host match ───────────────────
  const androidIntentFilter = app.androidIntentFilter && typeof app.androidIntentFilter === 'object' ? app.androidIntentFilter : {};
  const filterScheme = safeStr(androidIntentFilter.scheme).trim();
  const filterHost = normalizeHost(androidIntentFilter.host);
  const filterAutoVerify = androidIntentFilter.autoVerify;
  if (scheme) {
    const hasAnyFilterConfig = filterScheme || filterHost || filterAutoVerify != null;
    const filterMismatch = filterScheme !== scheme || filterHost !== host;
    if (!hasAnyFilterConfig) {
      problems.push({
        severity: 'high',
        code: 'android_intent_filter_missing',
        message: `No AndroidManifest intent-filter scheme/host was provided. Without a <data android:scheme="${scheme}"${host ? ` android:host="${host}"` : ''} /> intent-filter, Android has nothing registered to catch the redirect and the OAuth flow strands the user in the browser.`,
        where: 'app.androidIntentFilter',
      });
      fixes.push({ title: 'Add the intent-filter to android/app/src/main/AndroidManifest.xml', value: expected.androidIntentFilter, where: 'AndroidManifest.xml → <activity>' });
    } else if (filterMismatch) {
      problems.push({
        severity: 'high',
        code: 'android_intent_filter_mismatch',
        message: `The AndroidManifest intent-filter has scheme "${filterScheme || '(empty)'}" / host "${filterHost || '(empty)'}", but app.scheme + app.host expect "${scheme}" / "${host || '(empty)'}". A mismatched intent-filter never fires for this redirect, so Android drops the user back in the browser.`,
        where: 'app.androidIntentFilter',
      });
      fixes.push({ title: 'Fix the intent-filter to match your scheme/host', value: expected.androidIntentFilter, where: 'AndroidManifest.xml → <activity>' });
    }
    if (filterAutoVerify === true) {
      problems.push({
        severity: 'low',
        code: 'android_autoverify_no_effect',
        message: 'android:autoVerify="true" is set on a custom-scheme intent-filter. autoVerify only does anything for https Android App Links (it triggers Digital Asset Links verification): on a custom scheme like this one it is silently ignored, so leaving it true just invites confusion later.',
        where: 'app.androidIntentFilter.autoVerify',
      });
      fixes.push({ title: 'Drop autoVerify on the custom-scheme intent-filter', value: '<intent-filter> <!-- no android:autoVerify attribute -->', where: 'AndroidManifest.xml' });
    }
  }

  // ── 8. launchMode ─────────────────────────────────────────────────────
  if (launchMode === 'inAppWebView') {
    problems.push({
      severity: 'medium',
      code: 'launch_mode_in_app_webview',
      message: 'authScreenLaunchMode is LaunchMode.inAppWebView. Several providers (Kakao, Discord, Facebook) detect an embedded WebView and either refuse to complete sign-in or never hand control back to the OS to trigger your custom-scheme redirect: the flow just hangs on the provider\'s page.',
      where: 'app.launchMode',
    });
    fixes.push({
      title: 'Switch to LaunchMode.externalApplication',
      value: "supabase.auth.signInWithOAuth(provider, redirectTo: redirectTo, authScreenLaunchMode: LaunchMode.externalApplication)",
      where: 'signInWithOAuth() call',
    });
  } else if (!launchMode) {
    problems.push({
      severity: 'low',
      code: 'launch_mode_not_set',
      message: 'app.launchMode is not set. signInWithOAuth() defaults authScreenLaunchMode to LaunchMode.platformDefault, which on some devices opens an in-app browser tab that behaves inconsistently across providers: set it explicitly.',
      where: 'app.launchMode',
    });
    fixes.push({
      title: 'Set authScreenLaunchMode explicitly',
      value: "authScreenLaunchMode: LaunchMode.externalApplication",
      where: 'signInWithOAuth() call',
    });
  }

  // ── 9. authFlowType ────────────────────────────────────────────────────
  if (authFlowType === 'implicit') {
    problems.push({
      severity: 'medium',
      code: 'auth_flow_type_implicit',
      message: 'authFlowType is implicit. PKCE is the recommended flow for native apps: implicit flow returns the session in the URL fragment, which in-app browsers, custom tabs, and deep links don\'t always preserve intact.',
      where: 'app.authFlowType',
    });
    fixes.push({
      title: 'Switch to PKCE',
      value: "SupabaseAuth.initialize(authFlowType: AuthFlowType.pkce, ...)",
      where: 'Supabase.initialize() options',
    });
  } else if (!authFlowType) {
    problems.push({
      severity: 'low',
      code: 'auth_flow_type_not_set',
      message: 'app.authFlowType is not set. supabase_flutter defaults to PKCE, but confirming it explicitly makes the deep-link/session-exchange behavior predictable and self-documenting.',
      where: 'app.authFlowType',
    });
  }

  // ── 10. provider console has the exact Supabase callback? ───────────
  const providerName = ['google', 'apple', 'github', 'discord', 'kakao', 'other'].includes(provider.name) ? provider.name : 'other';
  const providerUris = Array.isArray(provider.authorizedRedirectUris)
    ? provider.authorizedRedirectUris.filter((x) => typeof x === 'string' && x.trim())
    : [];
  if (supabaseCallback) {
    const providerHasCallback = providerUris.some((u) => trimTrailingSlash(u) === supabaseCallback);
    if (!providerHasCallback) {
      const pointsToAppScheme = scheme && providerUris.some((u) => u.trim().toLowerCase().startsWith(`${scheme.toLowerCase()}://`));
      if (pointsToAppScheme) {
        problems.push({
          severity: 'high',
          code: 'provider_uri_points_to_app_scheme',
          message: `${providerLabel(providerName)} has a redirect URI using your app's own scheme instead of the Supabase callback. In the OAuth handshake the provider redirects to Supabase first (${supabaseCallback}), and only then does Supabase redirect on to your app's scheme: your app's scheme never goes in the provider console.`,
          where: 'provider.authorizedRedirectUris',
        });
      } else {
        problems.push({
          severity: 'high',
          code: 'provider_redirect_uri_missing',
          message: `${providerLabel(providerName)} doesn't contain the exact URL "${supabaseCallback}". OAuth providers require an exact match here: wildcards aren't accepted.`,
          where: 'provider.authorizedRedirectUris',
        });
      }
      fixes.push({
        title: `Add the exact callback in the ${providerName === 'other' ? 'provider' : providerName} console`,
        value: supabaseCallback,
        where: providerLabel(providerName),
      });
    }
  }
  checklist.push(supabaseCallback
    ? `Add "${supabaseCallback}" to ${providerLabel(providerName)}: exact match, no wildcards.`
    : 'Set supabase.projectUrl so the exact provider callback URL can be computed.');

  // ── 11. skipBrowserRedirect ───────────────────────────────────────────
  if (code.usesSkipBrowserRedirect === true) {
    problems.push({
      severity: 'low',
      code: 'skip_browser_redirect_manual',
      message: "code.usesSkipBrowserRedirect is true: you're opening the OAuth URL yourself instead of letting signInWithOAuth() launch it. That's fine, but you now own presenting it (e.g. a custom tab / SFSafariViewController session) and routing the resulting redirect back through Supabase's deep-link handling yourself.",
      where: 'code.usesSkipBrowserRedirect',
    });
  }

  // ── 12. listensToAuthStateChange ─────────────────────────────────────
  if (code.listensToAuthStateChange === false) {
    problems.push({
      severity: 'low',
      code: 'auth_state_listener_missing',
      message: "code.listensToAuthStateChange is false. Even once the deep link correctly reaches your app and supabase_flutter parses the session from it, nothing updates your UI without a listener: sign-in silently \"completes\" while the app still shows a logged-out screen.",
      where: 'code.listensToAuthStateChange',
    });
    fixes.push({
      title: 'Listen for the session on redirect',
      value: "supabase.auth.onAuthStateChange.listen((data) {\n  final session = data.session;\n  // update UI / navigate on sign-in\n});",
      where: 'app startup (e.g. main.dart or a root widget)',
    });
  }

  checklist.push('Use authFlowType: AuthFlowType.pkce and authScreenLaunchMode: LaunchMode.externalApplication together.');
  checklist.push('Re-run this check after every change: Info.plist, AndroidManifest.xml, and the Supabase/provider consoles drift independently from your Dart code.');

  const sorted = sortProblems(problems);
  const highCount = sorted.filter((p) => p.severity === 'high').length;
  const medCount = sorted.filter((p) => p.severity === 'medium').length;
  const lowCount = sorted.filter((p) => p.severity === 'low').length;

  let status = 'pass';
  if (highCount > 0) status = 'fail';
  else if (medCount > 0 || lowCount > 0) status = 'warn';

  let summary;
  if (status === 'pass') {
    summary = 'No mismatches found. The redirect your app registers is on the Supabase allow-list, Info.plist and the intent-filter agree with it, and the provider console has the exact Supabase callback.';
  } else if (status === 'fail') {
    const top = sorted.find((p) => p.severity === 'high');
    summary = `${highCount} blocking mismatch${highCount > 1 ? 'es' : ''} found. Most urgent: ${top.message}`;
  } else {
    const top = sorted[0];
    summary = `Nothing blocking, but ${medCount + lowCount} thing${medCount + lowCount > 1 ? 's' : ''} worth fixing. Top of the list: ${top.message}`;
  }

  return {
    status,
    summary,
    expected,
    problems: sorted,
    fixes,
    checklist,
    disclaimer:
      'Read-only, client-side analysis of the values you entered. Nothing is verified against your live Supabase project, Info.plist, AndroidManifest.xml, or provider console: always confirm in your own environment before shipping.',
  };
}

/**
 * Standalone helper: just the expected values for a config, without running
 * the full diagnostic. Handy for live-updating a preview as the user types.
 */
export function expectedValues(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  return computeExpected(cfg);
}

// Also expose as a plain browser global when loaded via <script type="module">.
if (typeof window !== 'undefined') {
  window.RedirectDoctorFlutter = { diagnose, expectedValues };
}
