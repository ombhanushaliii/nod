import Invite from './Invite'
import Landing from './Landing'

// Two pages: the landing page, and /invite (the link in trustee invite emails).
// Cloudflare Pages serves index.html for /invite, so the choice is made here.
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '/invite' ? <Invite /> : <Landing />
}
