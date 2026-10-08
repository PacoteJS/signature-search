/** Marks the "On this page" line for the chapter in view, and lets a line over the red band take paper colours. */
const nav = document.querySelector<HTMLElement>('.page-index')

if (nav) {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
  const chapters = links.map((link) =>
    document.querySelector<HTMLElement>(link.hash),
  )
  const lines = [...nav.querySelectorAll<HTMLElement>('p, li')]
  const bands = [...document.querySelectorAll<HTMLElement>('main .on-accent')]

  const update = () => {
    // A chapter is in view once its top passes 40% of the viewport; at the page bottom the last one is.
    const line = innerHeight * 0.4
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2
    let current = atEnd ? links.length - 1 : 0
    if (!atEnd)
      chapters.forEach((chapter, i) => {
        if (chapter && chapter.getBoundingClientRect().top <= line) current = i
      })
    links.forEach((link, i) => {
      if (i === current) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    })

    for (const el of lines) {
      const { top, height } = el.getBoundingClientRect()
      const middle = top + height / 2
      el.toggleAttribute(
        'data-flood',
        bands.some((band) => {
          const rect = band.getBoundingClientRect()
          return middle >= rect.top && middle < rect.bottom
        }),
      )
    }
  }

  // ponytail: measures every chapter on each frame of scroll; one IntersectionObserver per chapter if this ever shows in a profile.
  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      update()
    })
  }

  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  update()
}
