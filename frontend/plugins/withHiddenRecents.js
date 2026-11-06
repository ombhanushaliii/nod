// Hides Nod's screen in Android's recent-apps view, like a bank app.
//
// The black cover in src/components/PrivacyCover.tsx works on iOS, but Android
// takes its recents screenshot as the app pauses, before JavaScript can draw
// anything. Android 13+ (API 33) can skip that screenshot entirely, so the card
// shows blank instead of the balance. Unlike FLAG_SECURE, this doesn't block the
// user's own screenshots or screen recordings.
const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'setRecentsScreenshotEnabled(false)';
const SNIPPET = `
    // Never show this screen in the recent-apps view (Android 13+). See plugins/withHiddenRecents.js.
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
      ${MARKER}
    }`;

module.exports = function withHiddenRecents(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('withHiddenRecents: expected a Kotlin MainActivity.');
    }
    const src = mod.modResults.contents;
    if (src.includes(MARKER)) return mod;
    // Right after super.onCreate(...) in MainActivity.onCreate.
    const match = /^(\s*)super\.onCreate\([^)]*\)\s*$/m.exec(src);
    if (!match) throw new Error('withHiddenRecents: no super.onCreate(...) found in MainActivity.');
    const end = match.index + match[0].length;
    mod.modResults.contents = src.slice(0, end) + SNIPPET + src.slice(end);
    return mod;
  });
};
