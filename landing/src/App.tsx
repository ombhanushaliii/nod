import { lazy, Suspense } from 'react'
import Invite from './Invite'
import Landing from './Landing'

// Privy's SDK is large: only /export loads it.
const Export = lazy(() => import('./Export'))

// Three pages: the landing page, /invite (the link in trustee invite emails)
// and /export (key export, opened by the app after the trustee allows it).
// Cloudflare Pages serves index.html for both, so the choice is made here.
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/invite') return <Invite />
  if (path === '/export') return <Suspense fallback={null}><Export /></Suspense>
  return <Landing />
}
