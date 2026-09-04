// tests.mjs — plain Node test runner for doctor-flutter.js (no external dependencies).
// Run with: node tests.mjs

import { diagnose, expectedValues } from './doctor-flutter.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  }
}

function eq(name, actual, expected) {
  const condition = actual === expected;
  ok(name, condition, condition ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function has(name, arr, code) {
  const condition = Array.isArray(arr) && arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `expected a problem with code "${code}", got codes [${(arr || []).map((p) => p.code).join(', ')}]`);
}

function lacks(name, arr, code) {
  const condition = Array.isArray(arr) && !arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `did not expect a problem with code "${code}"`);
}

function severityOf(arr, code) {
  const p = (arr || []).find((x) => x.code === code);
  return p ? p.severity : undefined;
}

// Access the internal glob matcher the same way diagnose() uses it, via the
// allow-list check inside diagnose(): build a minimal config whose only
// pass/fail signal is whether the value under test matches the single
// allow-list pattern under test.
function globMatches(pattern, value) {
  const result = diagnose({
    app: { scheme: 'x', host: '' },
    code: { redirectTo: value },
    supabase: { allowedRedirectUrls: [pattern] },
  });
  return !result.problems.some((p) => p.code === 'redirect_not_allowlisted');
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Glob matcher — Supabase redirect-URL allow-list syntax
//    (https://supabase.com/docs/guides/auth/redirect-urls)
// ─────────────────────────────────────────────────────────────────────────

ok('glob: ** matches a nested path', globMatches('myapp://**', 'myapp://auth/callback'));
ok('glob: ** matches empty remainder', globMatches('myapp://**', 'myapp://'));
ok('glob: * matches a single path segment', globMatches('myapp://*', 'myapp://callback'));
ok('glob: * does NOT cross a "/" separator', !globMatches('myapp://*', 'myapp://callback/sub'));
ok('glob: ** DOES cross a "/" separator', globMatches('myapp://**', 'myapp://callback/sub'));
ok('glob: doc example — localhost/** matches nested path', globMatches('http://localhost:3000/**', 'http://localhost:3000/foo/bar'));
ok('glob: doc example — localhost/* matches one segment', globMatches('http://localhost:3000/*', 'http://localhost:3000/foo'));
ok('glob: doc example — localhost/* rejects two segments', !globMatches('http://localhost:3000/*', 'http://localhost:3000/foo/bar'));
ok('glob: io.supabase.myapp:// exact scheme with **', globMatches('io.supabase.myapp://**', 'io.supabase.myapp://login-callback'));
ok('glob: "." in scheme is literal, not a wildcard', !globMatches('io.supabase.myapp://**', 'ioXsupabaseXmyapp://login-callback'));
ok('glob: ? matches exactly one non-separator char', globMatches('myapp://x?', 'myapp://xy'));
ok('glob: ? does not match two chars', !globMatches('myapp://x?', 'myapp://xyz'));
ok('glob: ? does not cross a "." separator', !globMatches('myapp://x?', 'myapp://x.y'));
ok('glob: [abc] character class matches a member', globMatches('myapp://[abc]', 'myapp://a'));
ok('glob: [abc] character class rejects a non-member', !globMatches('myapp://[abc]', 'myapp://d'));
ok('glob: [!abc] negated class matches a non-member', globMatches('myapp://[!abc]', 'myapp://d'));
ok('glob: [!abc] negated class rejects a member', !globMatches('myapp://[!abc]', 'myapp://a'));
ok('glob: exact string matches itself', globMatches('myapp://login-callback', 'myapp://login-callback'));
ok('glob: exact string rejects a superstring', !globMatches('myapp://login-callback', 'myapp://login-callback2'));
ok('glob: \\c escapes the next character literally', globMatches('myapp://a\\*b', 'myapp://a*b'));

// ─────────────────────────────────────────────────────────────────────────
// 2. expectedValues() — scheme://host, Info.plist scheme, intent-filter,
//    allow-list entry, Supabase provider callback
//    (https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
// ─────────────────────────────────────────────────────────────────────────

const ev = expectedValues({
  app: { scheme: 'io.supabase.myapp', host: 'login-callback' },
  supabase: { projectUrl: 'https://abcd1234.supabase.co' },
});
eq('expected: redirectTo = scheme://host', ev.redirectTo, 'io.supabase.myapp://login-callback');
eq('expected: iosPlistScheme = the scheme', ev.iosPlistScheme, 'io.supabase.myapp');
eq('expected: allowListEntry = scheme://**', ev.allowListEntry, 'io.supabase.myapp://**');
eq('expected: Supabase provider callback', ev.supabaseCallback, 'https://abcd1234.supabase.co/auth/v1/callback');
ok('expected: intent-filter snippet has the scheme', ev.androidIntentFilter.includes('android:scheme="io.supabase.myapp"'));
ok('expected: intent-filter snippet has the host', ev.androidIntentFilter.includes('android:host="login-callback"'));

const evNoHost = expectedValues({ app: { scheme: 'myapp', host: '' } });
eq('expected: empty host → scheme:// with no host', evNoHost.redirectTo, 'myapp://');
ok('expected: empty host → no android:host attribute', !evNoHost.androidIntentFilter.includes('android:host='));

const evEmpty = expectedValues({});
eq('expected: empty config → redirectTo is null', evEmpty.redirectTo, null);
eq('expected: empty config → iosPlistScheme is null', evEmpty.iosPlistScheme, null);
eq('expected: empty config → androidIntentFilter is null', evEmpty.androidIntentFilter, null);
eq('expected: empty config → allowListEntry is null', evEmpty.allowListEntry, null);
eq('expected: empty config → supabaseCallback is null', evEmpty.supabaseCallback, null);

// ─────────────────────────────────────────────────────────────────────────
// 3. diagnose() scenarios
//    (https://supabase.com/docs/reference/dart/auth-signinwithoauth,
//     https://pub.dev/packages/supabase_flutter, supabase/auth#2447)
// ─────────────────────────────────────────────────────────────────────────

const passConfig = {
  app: {
    scheme: 'io.supabase.myapp',
    host: 'login-callback',
    androidPackage: 'io.supabase.myapp',
    iosBundleId: 'io.supabase.myapp',
    launchMode: 'externalApplication',
    authFlowType: 'pkce',
    iosSchemesInPlist: ['io.supabase.myapp'],
    androidIntentFilter: { scheme: 'io.supabase.myapp', host: 'login-callback', autoVerify: false },
  },
  supabase: {
    projectUrl: 'https://abcd1234.supabase.co',
    siteUrl: 'https://myapp.com',
    allowedRedirectUrls: ['io.supabase.myapp://**'],
  },
  provider: {
    name: 'google',
    authorizedRedirectUris: ['https://abcd1234.supabase.co/auth/v1/callback'],
  },
  code: {
    redirectTo: 'io.supabase.myapp://login-callback',
    usesSkipBrowserRedirect: null,
    listensToAuthStateChange: true,
  },
};

// Scenario: pass
{
  const r = diagnose(passConfig);
  eq('scenario pass: status is "pass"', r.status, 'pass');
  ok('scenario pass: no problems reported', r.problems.length === 0, `got ${JSON.stringify(r.problems.map((p) => p.code))}`);
}

// Scenario: fully empty config — must not throw, must fail loudly.
{
  const r = diagnose({});
  ok('empty config: does not throw and returns a status', ['pass', 'warn', 'fail'].includes(r.status));
  eq('empty config: status is "fail" (missing scheme etc.)', r.status, 'fail');
  has('empty config: reports missing_scheme', r.problems, 'missing_scheme');
}

// Scenario: scheme is http/https instead of a custom scheme.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.scheme = 'https';
  const r = diagnose(cfg);
  has('scheme http: reports scheme_reserved_http', r.problems, 'scheme_reserved_http');
  eq('scheme http: severity is medium', severityOf(r.problems, 'scheme_reserved_http'), 'medium');
}

// Scenario: underscore in the scheme (Google OAuth mangles it — supabase/auth#2447).
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.scheme = 'io_supabase_myapp';
  const r = diagnose(cfg);
  has('scheme underscore: reports scheme_underscore', r.problems, 'scheme_underscore');
  eq('scheme underscore: severity is high', severityOf(r.problems, 'scheme_underscore'), 'high');
  eq('scheme underscore: status is "fail"', r.status, 'fail');
}

// Scenario: underscore in the host instead of the scheme.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.host = 'login_callback';
  const r = diagnose(cfg);
  has('host underscore: reports scheme_underscore', r.problems, 'scheme_underscore');
  const p = r.problems.find((x) => x.code === 'scheme_underscore');
  ok('host underscore: points at app.host', p && p.where === 'app.host', p && p.where);
}

// Scenario: uppercase letters in the scheme.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.scheme = 'IO.Supabase.MyApp';
  const r = diagnose(cfg);
  has('scheme uppercase: reports scheme_invalid_case', r.problems, 'scheme_invalid_case');
  eq('scheme uppercase: severity is high', severityOf(r.problems, 'scheme_invalid_case'), 'high');
}

// Scenario: scheme has a character outside the valid URL-scheme grammar.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.scheme = 'io#supabase';
  const r = diagnose(cfg);
  has('scheme invalid chars: reports scheme_invalid_chars', r.problems, 'scheme_invalid_chars');
}

// Scenario: Supabase Site URL still points to localhost.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.supabase.siteUrl = 'http://localhost:54321';
  const r = diagnose(cfg);
  has('site url localhost: reports site_url_is_localhost', r.problems, 'site_url_is_localhost');
  eq('site url localhost: severity is medium', severityOf(r.problems, 'site_url_is_localhost'), 'medium');
  eq('site url localhost: status is "warn"', r.status, 'warn');
}

// Scenario: project URL doesn't look like a Supabase project URL.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.supabase.projectUrl = 'not-a-valid-url';
  const r = diagnose(cfg);
  has('project url unusual: reports project_url_unusual', r.problems, 'project_url_unusual');
}

// Scenario: project URL missing entirely.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.supabase.projectUrl = '';
  const r = diagnose(cfg);
  has('project url missing: reports missing_project_url', r.problems, 'missing_project_url');
  eq('project url missing: severity is low', severityOf(r.problems, 'missing_project_url'), 'low');
  lacks('project url missing: no provider callback problem (nothing to compute)', r.problems, 'provider_redirect_uri_missing');
}

// Scenario: redirectTo in code doesn't match scheme://host.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.code.redirectTo = 'wrongscheme://otherhost';
  const r = diagnose(cfg);
  has('redirectTo mismatch: reports redirect_to_mismatch', r.problems, 'redirect_to_mismatch');
  eq('redirectTo mismatch: severity is high', severityOf(r.problems, 'redirect_to_mismatch'), 'high');
}

// Scenario: redirectTo is right except for a trailing slash.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.code.redirectTo = 'io.supabase.myapp://login-callback/';
  const r = diagnose(cfg);
  has('redirectTo trailing slash: reports redirect_to_trailing_slash', r.problems, 'redirect_to_trailing_slash');
  lacks('redirectTo trailing slash: still allow-listed under scheme://**, no separate allow-list problem', r.problems, 'redirect_not_allowlisted');
}

// Scenario: redirect not covered by the Supabase allow-list.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.supabase.allowedRedirectUrls = [];
  const r = diagnose(cfg);
  eq('allow-list missing: status is "fail"', r.status, 'fail');
  has('allow-list missing: reports redirect_not_allowlisted', r.problems, 'redirect_not_allowlisted');
}

// Scenario: iOS Info.plist doesn't list the scheme.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.iosSchemesInPlist = [];
  const r = diagnose(cfg);
  has('plist missing scheme: reports ios_scheme_missing_in_plist', r.problems, 'ios_scheme_missing_in_plist');
  eq('plist missing scheme: severity is high', severityOf(r.problems, 'ios_scheme_missing_in_plist'), 'high');
  eq('plist missing scheme: status is "fail"', r.status, 'fail');
}

// Scenario: no AndroidManifest intent-filter configured at all.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.androidIntentFilter = { scheme: '', host: '', autoVerify: null };
  const r = diagnose(cfg);
  has('intent-filter missing: reports android_intent_filter_missing', r.problems, 'android_intent_filter_missing');
  lacks('intent-filter missing: no mismatch problem (nothing to mismatch against)', r.problems, 'android_intent_filter_mismatch');
}

// Scenario: intent-filter host doesn't match app.host.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.androidIntentFilter.host = 'wrong-host';
  const r = diagnose(cfg);
  has('intent-filter host mismatch: reports android_intent_filter_mismatch', r.problems, 'android_intent_filter_mismatch');
  eq('intent-filter host mismatch: severity is high', severityOf(r.problems, 'android_intent_filter_mismatch'), 'high');
}

// Scenario: intent-filter scheme doesn't match app.scheme.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.androidIntentFilter.scheme = 'io.supabase.otherapp';
  const r = diagnose(cfg);
  has('intent-filter scheme mismatch: reports android_intent_filter_mismatch', r.problems, 'android_intent_filter_mismatch');
}

// Scenario: autoVerify=true on a custom-scheme intent-filter has no effect.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.androidIntentFilter.autoVerify = true;
  const r = diagnose(cfg);
  has('autoVerify no effect: reports android_autoverify_no_effect', r.problems, 'android_autoverify_no_effect');
  eq('autoVerify no effect: severity is low', severityOf(r.problems, 'android_autoverify_no_effect'), 'low');
  eq('autoVerify no effect: status is "warn"', r.status, 'warn');
}

// Scenario: LaunchMode.inAppWebView breaks Kakao/Discord/Facebook-style providers.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.launchMode = 'inAppWebView';
  const r = diagnose(cfg);
  has('inAppWebView: reports launch_mode_in_app_webview', r.problems, 'launch_mode_in_app_webview');
  eq('inAppWebView: severity is medium', severityOf(r.problems, 'launch_mode_in_app_webview'), 'medium');
  eq('inAppWebView: status is "warn"', r.status, 'warn');
}

// Scenario: launchMode not set at all.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.launchMode = '';
  const r = diagnose(cfg);
  has('launchMode not set: reports launch_mode_not_set', r.problems, 'launch_mode_not_set');
  lacks('launchMode not set: does not also report inAppWebView problem', r.problems, 'launch_mode_in_app_webview');
}

// Scenario: authFlowType implicit — recommend PKCE.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.authFlowType = 'implicit';
  const r = diagnose(cfg);
  has('implicit flow: reports auth_flow_type_implicit', r.problems, 'auth_flow_type_implicit');
  eq('implicit flow: severity is medium', severityOf(r.problems, 'auth_flow_type_implicit'), 'medium');
}

// Scenario: authFlowType not set.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.authFlowType = '';
  const r = diagnose(cfg);
  has('authFlowType not set: reports auth_flow_type_not_set', r.problems, 'auth_flow_type_not_set');
  eq('authFlowType not set: severity is low', severityOf(r.problems, 'auth_flow_type_not_set'), 'low');
}

// Scenario: provider console redirect URI is wrong / missing entirely.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.provider.authorizedRedirectUris = ['https://example.com/callback'];
  const r = diagnose(cfg);
  has('provider URI missing: reports provider_redirect_uri_missing', r.problems, 'provider_redirect_uri_missing');
  eq('provider URI missing: status is "fail"', r.status, 'fail');
}

// Scenario: provider console has the app's own scheme instead of the Supabase callback.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.provider.authorizedRedirectUris = ['io.supabase.myapp://login-callback'];
  const r = diagnose(cfg);
  has('provider URI = app scheme: reports provider_uri_points_to_app_scheme', r.problems, 'provider_uri_points_to_app_scheme');
  eq('provider URI = app scheme: severity is high', severityOf(r.problems, 'provider_uri_points_to_app_scheme'), 'high');
  lacks('provider URI = app scheme: does not also report the generic missing-URI problem', r.problems, 'provider_redirect_uri_missing');
}

// Scenario: Kakao provider uses its own field label (sanity check for the extra provider).
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.provider.name = 'kakao';
  cfg.provider.authorizedRedirectUris = [];
  const r = diagnose(cfg);
  const p = r.problems.find((x) => x.code === 'provider_redirect_uri_missing');
  ok('kakao provider: message references the Kakao console', p && /Kakao/.test(p.message), p && p.message);
}

// Scenario: usesSkipBrowserRedirect true is informational only.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.code.usesSkipBrowserRedirect = true;
  const r = diagnose(cfg);
  has('skipBrowserRedirect true: reports skip_browser_redirect_manual', r.problems, 'skip_browser_redirect_manual');
  eq('skipBrowserRedirect true: severity is low', severityOf(r.problems, 'skip_browser_redirect_manual'), 'low');
}

// Scenario: not listening to auth state changes — session never reaches the UI.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.code.listensToAuthStateChange = false;
  const r = diagnose(cfg);
  has('no auth listener: reports auth_state_listener_missing', r.problems, 'auth_state_listener_missing');
  eq('no auth listener: severity is low', severityOf(r.problems, 'auth_state_listener_missing'), 'low');
  const fix = r.fixes.find((f) => f.title.toLowerCase().includes('listen'));
  ok('no auth listener: a fix suggests onAuthStateChange', !!fix, JSON.stringify(r.fixes.map((f) => f.title)));
}

// Scenario: multiple high-severity problems still yield exactly one "fail" status.
{
  const cfg = JSON.parse(JSON.stringify(passConfig));
  cfg.app.scheme = 'my_app';
  cfg.app.iosSchemesInPlist = [];
  const r = diagnose(cfg);
  eq('multiple high problems: status is still just "fail"', r.status, 'fail');
  ok('multiple high problems: summary mentions the count', /blocking mismatch/.test(r.summary), r.summary);
}

// ─────────────────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
}
