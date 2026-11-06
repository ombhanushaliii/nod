import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'

// getnod.pages.dev/export?return=nod://... — opened by the Nod app once the
// user's trustee allowed a key export (D2).
//
// The user signs in with the same Google account, then the page asks the API
// to use up the trustee's Allow (POST /exports/claim, single use, within an
// hour). Only then does it open Privy's export, which shows the key in Privy's
// own secure frame: neither this page nor the app ever sees it. When done, it
// signs out and sends the user back to the app with ?status=success or
// ?status=error&error=<code>.

const LOGO = `${import.meta.env.BASE_URL}assets/nod-logo.png`
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const APP_ID = (import.meta.env.VITE_PRIVY_APP_ID as string | undefined)?.trim()

// Only send people back into the Nod app, never to another site.
const RETURN_RE = /^(nod|exp\+nod):\/\//
const RETURN_KEY = 'nod-export-return'

// Privy's Google sign-in comes back to this page without our query string
// in some flows, so the return link is kept for this tab too.
function readReturn(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('return')
  if (fromUrl && RETURN_RE.test(fromUrl)) {
    try { sessionStorage.setItem(RETURN_KEY, fromUrl) } catch { /* private mode */ }
    return fromUrl
  }
  try {
    const saved = sessionStorage.getItem(RETURN_KEY)
    return saved && RETURN_RE.test(saved) ? saved : null
  } catch {
    return null
  }
}

type Outcome = { status: 'success' } | { status: 'error'; error: 'export_not_allowed' | 'wrong_account' | 'export_failed' | 'unavailable' }

function backToApp(returnTo: string | null, o: Outcome) {
  if (!returnTo) return
  try { sessionStorage.removeItem(RETURN_KEY) } catch { /* private mode */ }
  const q = new URLSearchParams(o.status === 'success' ? { status: 'success' } : { status: 'error', error: o.error })
  window.location.assign(`${returnTo}${returnTo.includes('?') ? '&' : '?'}${q}`)
}

// The trustee's Allow, used up once. Throws an Outcome when it can't be used.
async function claim(token: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/exports/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    throw { status: 'error', error: 'unavailable' } satisfies Outcome
  }
  if (res.ok) return
  const body = await res.json().catch(() => ({})) as { error?: string }
  if (body.error === 'not_onboarded') throw { status: 'error', error: 'wrong_account' } satisfies Outcome
  if (body.error === 'export_not_allowed') throw { status: 'error', error: 'export_not_allowed' } satisfies Outcome
  throw { status: 'error', error: 'unavailable' } satisfies Outcome
}

const btn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16,
  fontSize: 17, fontWeight: 700, border: 0, cursor: 'pointer', width: '100%',
} as const
const muted = { margin: 0, fontSize: 16, lineHeight: 1.55, color: '#6e6e73' } as const

const MESSAGES: Record<Exclude<Outcome, { status: 'success' }>['error'], string> = {
  export_not_allowed: "Your trustee hasn't allowed an export, or the approval was used or ran out. Ask them again from the Nod app.",
  wrong_account: "That Google account doesn't have a Nod wallet. Sign in with the account you use in the app.",
  export_failed: "The export didn't finish. Ask your trustee again from the Nod app.",
  unavailable: "Couldn't reach Nod. Check your connection and try again.",
}

function ExportFlow() {
  const { ready, authenticated, login, logout, getAccessToken, exportWallet } = usePrivy()
  const [returnTo] = useState(readReturn)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // If Privy never starts (this site isn't in its allowed domains, no network), say so.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (ready) return
    const t = setTimeout(() => setSlow(true), 15_000)
    return () => clearTimeout(t)
  }, [ready])

  const finish = async (o: Outcome) => {
    setOutcome(o)
    // Sign out of this page, so nothing stays signed in here.
    await logout().catch(() => {})
    backToApp(returnTo, o)
  }

  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      const token = await getAccessToken()
      if (!token) throw { status: 'error', error: 'wrong_account' } satisfies Outcome
      await claim(token)
      // The Allow is used up now; if this fails, the user asks again.
      try {
        await exportWallet()
      } catch {
        throw { status: 'error', error: 'export_failed' } satisfies Outcome
      }
      await finish({ status: 'success' })
    } catch (err) {
      const o = (err as Outcome)?.status === 'error' ? err as Outcome : { status: 'error', error: 'unavailable' } as const
      // A wrong account can sign in again here; anything else goes back to the app.
      if (o.status === 'error' && o.error === 'wrong_account') { setOutcome(o); await logout().catch(() => {}) }
      else await finish(o)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <p style={muted} role={slow ? 'alert' : undefined}>{slow ? "Privy didn't load. Check your connection and try again." : 'Loading…'}</p>
  return (
    <>
      {outcome?.status === 'error' && <p role="alert" style={{ ...muted, color: '#C14900' }}>{MESSAGES[outcome.error]}</p>}
      {outcome?.status === 'success' && <p style={muted}>Done. You can go back to the Nod app.</p>}
      {!authenticated ? (
        <button type="button" className="btn-orange" style={btn} onClick={() => login()}>
          Sign in with Google
        </button>
      ) : !outcome || outcome.status === 'error' ? (
        <button type="button" className="btn-orange" style={btn} disabled={busy} onClick={() => void run()}>
          {busy ? 'Checking…' : 'Show my key'}
        </button>
      ) : null}
    </>
  )
}

export default function Export() {
  useEffect(() => {
    document.title = 'Export your Nod wallet key'
  }, [])
  const configured = !!APP_ID && !!API_URL

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: '1px solid #ECE9E2' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO} alt="" style={{ width: 32, height: 32, borderRadius: 9, display: 'block' }} />
          <span style={{ fontWeight: 800, fontSize: 18 }}>Nod</span>
        </div>
      </header>
      <main style={{ flex: 1, width: '100%', maxWidth: 640, margin: '0 auto', padding: '40px 20px 64px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: '#C14900' }}>KEY EXPORT</span>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px,6vw,40px)', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.03em' }}>
          Your wallet key
        </h1>
        <p style={muted}>
          Your trustee allowed this once. Anyone with this key controls your money, so never share it. Nobody from Nod will ever ask for it.
        </p>
        <p style={muted}>The key shows in Privy&apos;s secure window. This page never sees it.</p>
        {configured ? (
          <PrivyProvider appId={APP_ID!} config={{ loginMethods: ['google'], embeddedWallets: { ethereum: { createOnLogin: 'off' } } }}>
            <ExportFlow />
          </PrivyProvider>
        ) : (
          <p role="alert" style={muted}>Key export isn&apos;t set up on this site.</p>
        )}
      </main>
    </div>
  )
}
