import { useEffect, useState } from 'react'

// getnod.pages.dev/invite?token=... — the link in the trustee invite email.
// It checks the link is still open, explains what a trustee does, and opens
// the Nod app (nod://trustee/invite?token=...), where the trustee signs in
// and accepts. Nothing about who sent the invite is shown here.

const LOGO = `${import.meta.env.BASE_URL}assets/nod-logo.png`
// The api function, e.g. https://<project-ref>.supabase.co/functions/v1/api.
// Without it the page skips the status check.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')

// Invite tokens are 32 random bytes in base64url.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

type Status =
  | { kind: 'checking' }
  | { kind: 'open'; expiresAt?: Date }
  | { kind: 'closed' }
  | { kind: 'not_found' }
  | { kind: 'no_token' }

function readToken(search: string): string | null {
  const token = new URLSearchParams(search).get('token')
  return token && TOKEN_RE.test(token) ? token : null
}

const appLink = (token: string) => `nod://trustee/invite?token=${encodeURIComponent(token)}`

function useInviteStatus(token: string | null): Status {
  // Without an API URL there's nothing to check: offer the app straight away.
  const [status, setStatus] = useState<Status>(
    !token ? { kind: 'no_token' } : API_URL ? { kind: 'checking' } : { kind: 'open' },
  )
  useEffect(() => {
    if (!token || !API_URL) return
    const ctrl = new AbortController()
    fetch(`${API_URL}/public/invites/${token}`, { signal: ctrl.signal, referrerPolicy: 'no-referrer' })
      .then(async (res) => {
        if (res.status === 404) return setStatus({ kind: 'not_found' })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { status: 'open' | 'closed'; expiresAt: string }
        setStatus(body.status === 'open' ? { kind: 'open', expiresAt: new Date(body.expiresAt) } : { kind: 'closed' })
      })
      // Can't tell: let them try in the app, which checks again.
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setStatus({ kind: 'open' })
      })
    return () => ctrl.abort()
  }, [token])
  return status
}

const card = { background: '#fff', borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 } as const
const btn = {
  height: 56,
  borderRadius: 16,
  fontSize: 17,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const
const muted = { margin: 0, fontSize: 16, lineHeight: 1.55, color: '#6e6e73' } as const

const STEPS: [title: string, body: string][] = [
  ['Get the Nod app', 'Install it on your phone. You sign in with Google, no seed phrase.'],
  ['Open this invite in the app', 'Tap the button below on the same phone.'],
  ['Accept', "You'll see who asked you, then you're set."],
]

const DOES: string[] = [
  'You get a notification when a payment looks risky: a new address, a big amount, or a known scam.',
  'You allow it or say no. Everything else sends without you.',
  "You can't move their money, and they can't see your wallet.",
]

export default function Invite() {
  const token = readToken(window.location.search)
  const status = useInviteStatus(token)
  useEffect(() => {
    document.title = 'Your Nod trustee invite'
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: '1px solid #ECE9E2' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#25282B' }}>
            <img src={LOGO} alt="" style={{ width: 32, height: 32, borderRadius: 9, display: 'block' }} />
            <span style={{ fontWeight: 800, fontSize: 18 }}>Nod</span>
          </a>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 640, margin: '0 auto', padding: '40px 20px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {status.kind === 'open' || status.kind === 'checking' ? (
          <Open token={token!} status={status} />
        ) : (
          <Unusable status={status} />
        )}
      </main>

      <footer style={{ borderTop: '1px solid #ECE9E2', padding: '24px 20px', textAlign: 'center', fontSize: 14, color: '#6e6e73' }}>
        Nod · Testnet demo on Ethereum Sepolia
      </footer>
    </div>
  )
}

function Open({ token, status }: { token: string; status: Status }) {
  const expires = status.kind === 'open' ? status.expiresAt : undefined
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: '#C14900' }}>TRUSTEE INVITE</span>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px,6vw,40px)', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.03em' }}>
          Someone picked you as their trusted person.
        </h1>
        <p style={{ ...muted, fontSize: 18 }}>They use Nod, a wallet that checks with someone they trust before risky payments go out.</p>
      </div>

      <section style={card} aria-labelledby="does">
        <h2 id="does" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>What you'd do</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DOES.map((d) => (
            <li key={d} style={{ fontSize: 16, lineHeight: 1.5 }}>{d}</li>
          ))}
        </ul>
      </section>

      <section style={card} aria-labelledby="how">
        <h2 id="how" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>How to accept</h2>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map(([title, body], i) => (
            <li key={title} style={{ display: 'flex', gap: 14 }}>
              <span
                aria-hidden
                style={{ width: 28, height: 28, borderRadius: '50%', background: '#FFF1CC', color: '#7B5100', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i + 1}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 700 }}>{title}</span>
                <span style={{ ...muted, fontSize: 15 }}>{body}</span>
              </div>
            </li>
          ))}
        </ol>
        <a href={appLink(token)} className="btn-orange" style={{ ...btn, marginTop: 4 }}>
          Open in the Nod app
        </a>
        <a href="/#get" className="btn-mist" style={btn}>
          Get the app
        </a>
        <p style={{ ...muted, fontSize: 14 }} aria-live="polite">
          {status.kind === 'checking'
            ? 'Checking the invite…'
            : expires
              ? `This invite works until ${expires.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.`
              : 'Invites work for 7 days.'}
        </p>
      </section>
    </>
  )
}

const UNUSABLE: Record<'closed' | 'not_found' | 'no_token', [title: string, body: string]> = {
  closed: [
    'This invite has been used or has expired.',
    "If you already accepted, open the Nod app: you're all set. If not, ask them to send a new invite from their app.",
  ],
  not_found: [
    "We couldn't find this invite.",
    'They may have sent a newer one, which replaces this link. Check for a more recent email, or ask them to send it again.',
  ],
  no_token: [
    'This link is missing its invite.',
    'Open the link from the invite email again. If you copied it, make sure you got all of it.',
  ],
}

function Unusable({ status }: { status: Status }) {
  const [title, body] = UNUSABLE[status.kind as keyof typeof UNUSABLE]
  return (
    <section style={card}>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
      <p style={muted}>{body}</p>
      <a href="/" className="btn-mist" style={btn}>
        What is Nod?
      </a>
    </section>
  )
}
