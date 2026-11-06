import { useRef, useState } from 'react'

import { useLandingMotion } from './motion'

// Ported 1:1 from "Nod Landing.dc.html": same markup, inline styles and copy.
// Motion (hero intro, scroll parallax, section reveal) lives in ./motion.

const LOGO = `${import.meta.env.BASE_URL}assets/nod-logo.png`

type Tone = 'green' | 'amber' | 'red' | 'gray'

const T: Record<Tone, [bg: string, fg: string]> = {
  green: ['#DCE7EA', '#2F4A52'],
  amber: ['#FFF1CC', '#7B5100'],
  red: ['#FFEAE9', '#C51B32'],
  gray: ['#ececf0', '#55555b'],
}

type Case = {
  label: string
  hint: string
  chip: string
  tone: Tone
  icon: string
  iconTone: Tone
  title: string
  body: string
  reason?: [title: string, detail: string, tag: string, tone: Tone]
  btn: string
  btnBg: string
  btnFg: string
}

const CASES: Case[] = [
  {
    label: '$25 to Mom',
    hint: 'Paid her last week',
    chip: 'Sends',
    tone: 'green',
    icon: '✓',
    iconTone: 'green',
    title: 'Sent $25.00 to Mom',
    body: 'Passed all checks.',
    btn: 'Done',
    btnBg: '#E55B00',
    btnFg: '#fff',
  },
  {
    label: '$10 to Dr. Patel',
    hint: 'First time paying this address',
    chip: 'Waits 24h',
    tone: 'gray',
    icon: '⏱',
    iconTone: 'gray',
    title: 'Unlocks in 24 hours',
    body: 'New people wait a day. Up to $10 can go right away.',
    btn: 'Got it',
    btnBg: '#DCE7EA',
    btnFg: '#25282B',
  },
  {
    label: '$40 to Ari',
    hint: 'Address someone sent you',
    chip: 'Needs Sam',
    tone: 'amber',
    icon: '!',
    iconTone: 'red',
    title: 'Sam needs to OK this',
    body: 'This address has been reported.',
    reason: ['Reported as a scam', '3 verified reports · 2 unverified', 'VERIFIED', 'red'],
    btn: 'Answer 3 questions',
    btnBg: '#E55B00',
    btnFg: '#fff',
  },
  {
    label: '$25 to "Mom"',
    hint: '0x8f3a…c21d · pasted from a text',
    chip: 'Needs Sam',
    tone: 'amber',
    icon: '!',
    iconTone: 'amber',
    title: 'Sam needs to OK this',
    body: 'This isn’t the address you usually use for Mom.',
    reason: ['Looks like Mom’s address', 'Same start and end, different middle. A common trick.', 'LOOK-ALIKE', 'amber'],
    btn: 'Answer 3 questions',
    btnBg: '#E55B00',
    btnFg: '#fff',
  },
  {
    label: '$300 to Landlord',
    hint: 'Paid before, but a big one',
    chip: 'Needs Sam',
    tone: 'amber',
    icon: '!',
    iconTone: 'amber',
    title: 'Sam needs to OK this',
    body: 'Big payments go to Sam first. Sam sets the limit.',
    reason: ['Over your $100 limit', 'Sam set this limit for new payees', 'LIMIT', 'amber'],
    btn: 'Send to Sam',
    btnBg: '#E55B00',
    btnFg: '#fff',
  },
]

type Req = 'pending' | 'allowed' | 'denied'

// [request chip, chip tone, wallet row sub, wallet chip, wallet chip tone]
const RQ: Record<Req, [string, Tone, string, string, Tone]> = {
  pending: ['Needs you', 'amber', 'Waiting on Sam', 'Waiting', 'amber'],
  allowed: ['Allowed', 'green', 'Approved · unlocks in 24h', 'Locked', 'gray'],
  denied: ['Denied', 'red', 'Sam said no', 'Declined', 'red'],
}

type Props = {
  /** The tilted wallet phone behind the trustee's request in the hero. */
  showWalletPhone?: boolean
  /** The "For trustees" section. */
  showTrustee?: boolean
}

export default function Landing({ showWalletPhone = true, showTrustee = true }: Props) {
  const [sel, setSel] = useState(2)
  const [req, setReq] = useState<Req>('pending')
  const rq = RQ[req]
  const root = useRef<HTMLDivElement>(null)
  useLandingMotion(root)

  return (
    <div ref={root} style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      <Header />

      <section
        id="top"
        className="hero"
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          display: 'grid',
          alignItems: 'center',
          overflow: 'hidden',
        }}>
        <div data-hero-text="" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 999,
              background: '#FFECDC',
              color: '#C14900',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.04em',
            }}>
            USDC WALLET · NO SEED PHRASE
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(40px,5.4vw,72px)',
              lineHeight: 1.02,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              textWrap: 'balance',
            }}>
            Risky payments wait for a nod.
          </h1>
          <p className="hero-lede" style={{ margin: 0, lineHeight: 1.5, color: '#6e6e73', maxWidth: 520, textWrap: 'pretty' }}>
            Pick one person you trust. When a payment looks like a scam, it goes to them before the money leaves. Everything else
            sends like normal.
          </p>
          <div className="hero-ctas" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 4 }}>
            <a href="#get" className="btn-orange" style={{ height: 56, padding: '0 24px', borderRadius: 16, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
              Get the app
            </a>
            <a href="#how" className="btn-mist" style={{ height: 56, padding: '0 24px', borderRadius: 16, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
              See how it works
            </a>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: 14, color: '#6e6e73', paddingTop: 8 }}>
            <span>Sign in with Google</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>No gas to pay</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>Face ID lock</span>
          </div>
        </div>

        <div data-hero-phones="" className="hero-phones" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'nowrap', minWidth: 0 }}>
          {showWalletPhone && <WalletPhone rowSub={rq[2]} chip={rq[3]} chipTone={rq[4]} />}
          <RequestPhone
            req={req}
            chip={rq[0]}
            chipTone={rq[1]}
            onAllow={() => setReq('allowed')}
            onDeny={() => setReq('denied')}
            onReset={() => setReq('pending')}
          />
        </div>
      </section>

      <HowItWorks />
      <Checks sel={sel} onSelect={setSel} />
      <Questions />
      {showTrustee && <ForTrustees />}
      <GetNod />
      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(247,246,242,0.92)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #ECE9E2',
      }}>
      <div
        className="header-inner"
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#25282B' }}>
          <img src={LOGO} alt="Nod" style={{ width: 36, height: 36, borderRadius: 10, display: 'block' }} />
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Nod</span>
        </a>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 15, fontWeight: 600 }}>
          <a href="#how" className="nav-link" style={{ color: '#6e6e73' }}>
            How it works
          </a>
          <a href="#checks" className="nav-link" style={{ color: '#6e6e73' }}>
            What we check
          </a>
          <a href="#trustee" className="nav-link" style={{ color: '#6e6e73' }}>
            For trustees
          </a>
          <a
            href="#get"
            style={{
              height: 40,
              padding: '0 16px',
              borderRadius: 12,
              background: '#25282B',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              fontWeight: 700,
            }}>
            Get Nod
          </a>
        </nav>
      </div>
    </header>
  )
}

function WalletPhone({ rowSub, chip, chipTone }: { rowSub: string; chip: string; chipTone: Tone }) {
  return (
    <div
      data-phone-back=""
      style={{
        width: 300,
        height: 620,
        borderRadius: 46,
        background: '#25282B',
        padding: 10,
        boxShadow: '0 30px 60px -20px rgba(37,40,43,0.35)',
        flexShrink: 0,
        marginTop: 56,
        marginRight: -64,
        position: 'relative',
        zIndex: 0,
        transform: 'rotate(-4deg)',
      }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 37,
          background: '#F7F6F2',
          overflow: 'hidden',
          padding: '44px 18px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6e6e73' }}>Your wallet</span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>@alex</span>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '1.5px solid #e6e6ea',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <div
              style={{
                width: 35,
                height: 35,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 34% 34%,#fff 0 19%,#EF6C22 19%)',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#6e6e73' }}>Balance</span>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 22, fontWeight: 700, alignSelf: 'center', marginRight: 2 }}>$</span>
            <span style={{ fontSize: 50, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: '54px', fontVariantNumeric: 'tabular-nums' }}>
              248
            </span>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#a3a3aa', paddingTop: 8 }}>.50</span>
          </div>
          <span style={{ fontSize: 12, color: '#6e6e73' }}>USDC · 1 USDC = $1</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div
            style={{
              flex: 1,
              height: 48,
              borderRadius: 14,
              background: '#E55B00',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            ↑ Send
          </div>
          <div
            style={{
              flex: 1,
              height: 48,
              borderRadius: 14,
              background: '#DCE7EA',
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            ↓ Receive
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>In progress</span>
          <div style={{ borderRadius: 16, background: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>$40 to Ari</span>
              <span style={{ fontSize: 12, color: '#6e6e73' }}>{rowSub}</span>
            </div>
            <span
              style={{
                padding: '4px 9px',
                borderRadius: 999,
                background: T[chipTone][0],
                color: T[chipTone][1],
                fontSize: 11,
                fontWeight: 700,
              }}>
              {chip}
            </span>
          </div>
        </div>
        <div style={{ borderRadius: 18, background: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'radial-gradient(circle at 50% 100%,#ffcc4d 0 47%,#3d5a80 47%)',
            }}
          />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Sam · your trustee
            </span>
            <span style={{ fontSize: 12, color: '#6e6e73' }}>Checks risky payments</span>
          </div>
          <span style={{ padding: '4px 9px', borderRadius: 999, background: '#DCE7EA', color: '#2F4A52', fontSize: 11, fontWeight: 700 }}>
            Active
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', paddingBottom: 4 }}>Recent</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #ECE9E2' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#DCE7EA',
                fontSize: 15,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              ↑
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Sent to Mom</span>
              <span style={{ fontSize: 12, color: '#6e6e73' }}>2h ago</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>−$25.00</span>
          </div>
        </div>
      </div>
    </div>
  )
}

type RequestPhoneProps = {
  req: Req
  chip: string
  chipTone: Tone
  onAllow: () => void
  onDeny: () => void
  onReset: () => void
}

function RequestPhone({ req, chip, chipTone, onAllow, onDeny, onReset }: RequestPhoneProps) {
  const row = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '11px 0', fontSize: 13 } as const
  return (
    <div
      data-phone-front=""
      style={{
        width: 300,
        height: 620,
        borderRadius: 46,
        background: '#25282B',
        padding: 10,
        boxShadow: '0 40px 70px -20px rgba(37,40,43,0.45)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 37,
          background: '#F7F6F2',
          overflow: 'hidden',
          padding: '44px 18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
        <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#DCE7EA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#25282B"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </div>
          <span
            style={{
              padding: '4px 9px',
              borderRadius: 999,
              background: T[chipTone][0],
              color: T[chipTone][1],
              fontSize: 11,
              fontWeight: 700,
            }}>
            {chip}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 34% 34%,#fff 0 19%,#EF6C22 19%)',
            }}
          />
          <span style={{ fontSize: 13, color: '#6e6e73' }}>
            Request from <b style={{ color: '#25282B', fontWeight: 700 }}>@alex</b>
          </span>
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12 }}>Send $40.00 to Ari?</div>
        <div style={{ borderRadius: 18, background: '#fff', padding: '0 14px' }}>
          <div style={{ ...row, borderBottom: '1px solid #ECE9E2' }}>
            <span style={{ color: '#6e6e73' }}>To</span>
            <b style={{ fontWeight: 700 }}>Ari · 0x71c4…09fe</b>
          </div>
          <div style={{ ...row, borderBottom: '1px solid #ECE9E2' }}>
            <span style={{ color: '#6e6e73' }}>Amount</span>
            <b style={{ fontWeight: 700 }}>$40.00</b>
          </div>
          <div style={row}>
            <span style={{ color: '#6e6e73' }}>New person</span>
            <b style={{ fontWeight: 700 }}>Yes · 24h wait</b>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#6e6e73' }}>WHY IT CAME TO YOU</span>
        <div style={{ borderRadius: 18, background: '#fff', padding: '0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 0' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Reported as a scam</span>
              <span style={{ fontSize: 12, color: '#6e6e73', lineHeight: 1.4 }}>3 verified reports · 2 unverified</span>
            </div>
            <span
              style={{
                padding: '3px 7px',
                borderRadius: 999,
                background: '#FFEAE9',
                color: '#C51B32',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.03em',
              }}>
              VERIFIED
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {req === 'pending' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onDeny}
              className="btn-ink"
              style={{ flex: 1, height: 48, border: 0, borderRadius: 14, font: '700 14px Manrope,sans-serif', cursor: 'pointer' }}>
              Deny &amp; report
            </button>
            <button
              type="button"
              onClick={onAllow}
              className="btn-orange"
              style={{ flex: 1, height: 48, border: 0, borderRadius: 14, font: '700 14px Manrope,sans-serif', cursor: 'pointer' }}>
              Allow once
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: '#6e6e73', textAlign: 'center' }}>
              {req === 'allowed'
                ? 'Alex can send it once. Ari is new, so it unlocks in 24 hours.'
                : 'The money stays put. The address is reported so other wallets are warned.'}
            </div>
            <button
              type="button"
              onClick={onReset}
              style={{
                height: 44,
                border: 0,
                borderRadius: 14,
                background: '#DCE7EA',
                color: '#25282B',
                font: '700 14px Manrope,sans-serif',
                cursor: 'pointer',
              }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const eyebrow = { fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#C14900' } as const
const h2 = {
  margin: 0,
  fontSize: 'clamp(32px,4vw,48px)',
  lineHeight: 1.08,
  fontWeight: 800,
  letterSpacing: '-0.035em',
  textWrap: 'balance',
} as const

const STEPS = [
  {
    n: '1',
    title: 'Invite a trustee',
    body: "A daughter, a friend, anyone who'd pick up the phone. They get Nod too and see only what you send them.",
  },
  {
    n: '2',
    title: 'Send like normal',
    body: "Paying people you've paid before? It just goes. Nod checks every address in the background.",
  },
  {
    n: '3',
    title: 'Odd ones wait',
    body: 'You answer three quick questions, and your trustee gets the payment to allow once or deny.',
  },
]

function HowItWorks() {
  return (
    <section id="how" data-reveal="" style={{ borderTop: '1px solid #ECE9E2', background: '#fff' }}>
      <div className="section-88" style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
          <span style={eyebrow}>HOW IT WORKS</span>
          <h2 style={h2}>You keep your money. Someone has your back.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 16 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ borderRadius: 24, background: '#F7F6F2', padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#E55B00',
                  color: '#fff',
                  fontSize: 17,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {s.n}
              </div>
              <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#6e6e73' }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Checks({ sel, onSelect }: { sel: number; onSelect: (i: number) => void }) {
  const c = CASES[sel]
  const reason = c.reason
  return (
    <section
      id="checks"
      data-reveal=""
      className="section-96"
      style={{
        maxWidth: 1160,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))',
        gap: 56,
        alignItems: 'center',
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={eyebrow}>WHAT NOD CHECKS</span>
          <h2 style={h2}>Pick a payment. See what happens.</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CASES.map((k, i) => (
            <button
              key={k.label}
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={i === sel}
              style={{
                textAlign: 'left',
                border: `1.5px solid ${i === sel ? '#E55B00' : '#ECE9E2'}`,
                background: i === sel ? '#fff' : 'transparent',
                borderRadius: 18,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontFamily: 'Manrope,sans-serif',
                color: '#25282B',
              }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{k.label}</span>
                <span style={{ fontSize: 13, color: '#6e6e73' }}>{k.hint}</span>
              </div>
              <span
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  background: T[k.tone][0],
                  color: T[k.tone][1],
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                {k.chip}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          className="check-phone"
          style={{
            width: 320,
            height: 560,
            borderRadius: 48,
            background: '#25282B',
            padding: 10,
            boxShadow: '0 30px 60px -20px rgba(37,40,43,0.35)',
          }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 39,
              background: '#F7F6F2',
              overflow: 'hidden',
              padding: '56px 24px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 16,
            }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: T[c.iconTone][0],
                color: T[c.iconTone][1],
                fontSize: 28,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 24,
              }}>
              {c.icon}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15 }}>{c.title}</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: '#6e6e73' }}>{c.body}</div>
            {reason && (
              <div
                style={{
                  alignSelf: 'stretch',
                  borderRadius: 18,
                  background: '#fff',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  textAlign: 'left',
                }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{reason[0]}</span>
                  <span style={{ fontSize: 12, color: '#6e6e73', lineHeight: 1.4 }}>{reason[1]}</span>
                </div>
                <span
                  style={{
                    padding: '3px 7px',
                    borderRadius: 999,
                    background: T[reason[3]][0],
                    color: T[reason[3]][1],
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                  }}>
                  {reason[2]}
                </span>
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div
              style={{
                alignSelf: 'stretch',
                height: 52,
                borderRadius: 16,
                background: c.btnBg,
                color: c.btnFg,
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {c.btn}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const QUESTIONS = [
  { q: 'Did someone contact you first and ask for this money?', a: 'Yes' },
  { q: 'Are you being rushed, or promised more money back?', a: 'Yes' },
  { q: 'Do you know this person in real life?', a: 'No' },
]

function Questions() {
  return (
    <section data-reveal="" style={{ background: '#25282B', color: '#fff' }}>
      <div
        className="section-88"
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))',
          gap: 48,
          alignItems: 'start',
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ ...eyebrow, color: '#FFB27A' }}>THE THREE QUESTIONS</span>
          <h2 style={h2}>Scams follow a script. These break it.</h2>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: '#c4c4ca', maxWidth: 460 }}>
            Before a flagged payment goes to your trustee, Nod asks you three things. Your answers travel with the request, so they see
            the whole picture.
          </p>
        </div>
        <div style={{ borderRadius: 24, background: '#fff', color: '#25282B', padding: '0 20px' }}>
          {QUESTIONS.map((x, i) => (
            <div
              key={x.q}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '18px 0',
                borderBottom: i < QUESTIONS.length - 1 ? '1px solid #ECE9E2' : undefined,
              }}>
              <span style={{ flex: 1, fontSize: 16, lineHeight: 1.4 }}>{x.q}</span>
              <span style={{ padding: '4px 12px', borderRadius: 999, background: '#FFEAE9', color: '#C51B32', fontSize: 13, fontWeight: 800 }}>
                {x.a}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const TRUSTEE_CARDS = [
  { title: 'Allow once', body: 'Good for that one payment, that amount, for one hour. New people still unlock 24 hours later.' },
  { title: 'Deny & report', body: 'The money stays put, and the address is reported so other Nod wallets get warned too.' },
  { title: 'You set the rules', body: 'Limit, daily max, every time or first time only. They can see every change, but only you can make one.' },
  { title: 'Key export needs you', body: 'Scammers ask for wallet keys. Showing it is a request too, and it waits for your OK.' },
]

function ForTrustees() {
  return (
    <section id="trustee" data-reveal="" className="section-96" style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 680 }}>
        <span style={eyebrow}>FOR TRUSTEES</span>
        <h2 style={h2}>You only hear about the ones that matter.</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 16 }}>
        {TRUSTEE_CARDS.map((t) => (
          <div key={t.title} style={{ borderRadius: 20, background: '#fff', padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.015em' }}>{t.title}</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#6e6e73' }}>{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function GetNod() {
  // The iPhone app isn't out yet: hovering or focusing the button shows a "coming soon" tooltip.
  const [ios, setIos] = useState(false)
  const cta = { height: 56, padding: '0 24px', borderRadius: 16, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center' } as const
  return (
    <section id="get" data-reveal="" className="get-wrap">
      <div
        className="get-card"
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          borderRadius: 32,
          background: '#E55B00',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 20,
        }}>
        <img
          src={LOGO}
          alt=""
          style={{ width: 72, height: 72, borderRadius: 20, display: 'block', boxShadow: '0 0 0 2px rgba(255,255,255,0.35)' }}
        />
        <h2 style={{ ...h2, fontSize: 'clamp(32px,4.4vw,52px)', lineHeight: 1.05 }}>Set it up with the person you'd call anyway.</h2>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5, maxWidth: 520 }}>
          Takes about two minutes. Sign in with Google, pick an avatar, invite your trustee.
        </p>
        <div className="get-ctas" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingTop: 40 }}>
          <div className="get-ios" style={{ position: 'relative', display: 'flex' }}>
            <div
              id="ios-soon"
              role="tooltip"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 12px)',
                left: '50%',
                transform: ios ? 'translate(-50%, 0)' : 'translate(-50%, 6px)',
                opacity: ios ? 1 : 0,
                transition: 'opacity 180ms ease, transform 220ms cubic-bezier(.2,.7,.2,1)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 12,
                background: '#25282B',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: '0 12px 28px -8px rgba(37,40,43,0.45)',
                pointerEvents: 'none',
                zIndex: 2,
              }}>
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  marginLeft: -6,
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid #25282B',
                }}
              />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFB27A', flexShrink: 0 }} />
              <span>Coming soon to the App Store</span>
            </div>
            <a
              href="#get"
              aria-describedby="ios-soon"
              onMouseEnter={() => setIos(true)}
              onMouseLeave={() => setIos(false)}
              onFocus={() => setIos(true)}
              onBlur={() => setIos(false)}
              // Nothing to download yet: on touch screens a tap shows the tooltip instead of jumping.
              onClick={(e) => {
                e.preventDefault()
                setIos(true)
              }}
              style={{
                ...cta,
                background: '#fff',
                color: '#25282B',
                cursor: 'default',
                opacity: ios ? 0.85 : 1,
                transition: 'opacity 180ms ease',
              }}>
              Download for iPhone
            </a>
          </div>
          <a href="#top" className="btn-ink" style={cta}>
            Download for Android
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #ECE9E2' }}>
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '28px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          fontSize: 14,
          color: '#6e6e73',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO} alt="" style={{ width: 24, height: 24, borderRadius: 7, display: 'block' }} />
          <span style={{ fontWeight: 700, color: '#25282B' }}>Nod</span>
          <span>· Testnet demo on Ethereum Sepolia</span>
        </div>
        <span>© 2026 Nod. All rights reserved.</span>
      </div>
    </footer>
  )
}
