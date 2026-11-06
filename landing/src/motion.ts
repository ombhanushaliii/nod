import { useLayoutEffect, type RefObject } from 'react'

// Page motion from "Nod Landing.dc.html": the hero fades in on load, the hero phones and copy
// drift apart as you scroll, and sections marked `data-reveal` fade up as they come into view.
// Runs before first paint (so nothing flashes) and is skipped for prefers-reduced-motion.

const EASE = 'cubic-bezier(.2,.7,.2,1)'
/** Resting tilt of the wallet phone behind the request phone (set inline in Landing). */
const BACK_TILT = 'rotate(-4deg)'
/** The parallax only suits the two-column hero; below this the hero stacks (see index.css). */
const WIDE = '(min-width: 961px)'

export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = root.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const stops = [heroIntro(el), parallax(el), reveal(el)]
    return () => stops.forEach((stop) => stop())
  }, [root])
}

function heroIntro(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('[data-hero-text]')
  const phones = root.querySelector<HTMLElement>('[data-hero-phones]')
  if (!text || !phones) return () => {}
  const items = [...text.children] as HTMLElement[]
  items.forEach((item, i) => {
    item.style.opacity = '0'
    item.style.transform = 'translateY(20px)'
    item.style.transition = `opacity 700ms ${EASE} ${i * 80}ms, transform 700ms ${EASE} ${i * 80}ms`
  })
  phones.style.opacity = '0'
  phones.style.transform = 'translateY(48px)'
  phones.style.transition = `opacity 900ms ${EASE} 200ms, transform 900ms ${EASE} 200ms`
  // Commit the hidden state, then move to the visible one so the transitions run. Forcing a style
  // flush (instead of waiting for animation frames) means the hero can never get stuck hidden,
  // e.g. in a background tab where frames are paused.
  void phones.offsetWidth
  items.forEach((item) => {
    item.style.opacity = ''
    item.style.transform = ''
  })
  phones.style.opacity = '1'
  phones.style.transform = 'none'
  return () => {
    for (const node of [...items, phones]) {
      node.style.opacity = ''
      node.style.transform = ''
      node.style.transition = ''
    }
  }
}

function parallax(root: HTMLElement) {
  const text = root.querySelector<HTMLElement>('[data-hero-text]')
  const back = root.querySelector<HTMLElement>('[data-phone-back]')
  const front = root.querySelector<HTMLElement>('[data-phone-front]')
  const wide = matchMedia(WIDE)
  const reset = () => {
    if (back) back.style.transform = BACK_TILT
    if (front) front.style.transform = ''
    if (text) {
      text.style.transform = ''
      text.style.opacity = ''
    }
  }
  let frame = 0
  const apply = () => {
    frame = 0
    if (!wide.matches) return reset()
    const y = Math.min(window.scrollY, 900)
    if (back) back.style.transform = `translateY(${y * -0.18}px) rotate(${-4 - y * 0.012}deg)`
    if (front) front.style.transform = `translateY(${y * -0.06}px) rotate(${y * 0.004}deg)`
    if (text) {
      text.style.transform = `translateY(${y * 0.08}px)`
      text.style.opacity = String(Math.max(0.35, 1 - y / 900))
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply)
  }
  apply()
  window.addEventListener('scroll', schedule, { passive: true })
  wide.addEventListener('change', schedule)
  return () => {
    window.removeEventListener('scroll', schedule)
    wide.removeEventListener('change', schedule)
    cancelAnimationFrame(frame)
    reset()
  }
}

function reveal(root: HTMLElement) {
  if (!('IntersectionObserver' in window)) return () => {}
  const sections = [...root.querySelectorAll<HTMLElement>('[data-reveal]')]
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        el.style.opacity = '1'
        el.style.transform = 'none'
        io.unobserve(el)
      }),
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  )
  sections.forEach((el) => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(32px)'
    el.style.transition = `opacity 700ms ${EASE}, transform 700ms ${EASE}`
    io.observe(el)
  })
  return () => {
    io.disconnect()
    sections.forEach((el) => {
      el.style.opacity = ''
      el.style.transform = ''
      el.style.transition = ''
    })
  }
}
