// Web uses the browser's crypto implementation, so there's nothing to polyfill.
//
// Privy's web SDK is loaded here, before React starts. Expo Router first
// loads src/app/_layout.tsx (which imports Privy) inside a useMemo while it
// builds the route tree. Privy defines its styled-components at load time,
// and in development styled-components checks each one with a useState call.
// Inside a useMemo, React reports that as "Do not call Hooks inside
// useEffect(...), useMemo(...)". Loaded here, outside React, the check passes
// quietly. Native has its own polyfills.native.ts and doesn't load this.
import '@privy-io/react-auth';

export {};
