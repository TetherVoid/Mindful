// Runs inside a page (Runtime.evaluate) and returns what it measured as JSON.
// No dependencies; plain browser APIs. Used by scripts/sweep/run.mjs.
//
// Every check reports facts with a selector, never a judgement — triage happens
// in the findings, by a person.

;(() => {
  const doc = document.documentElement
  const vw = doc.clientWidth
  const out = {
    url: location.pathname,
    scrollWidth: doc.scrollWidth,
    viewport: vw,
    overflow: [],
    clipped: [],
    escape: [],
    overlap: [],
    fixedOverlap: [],
    contrast: [],
    uiContrast: [],
    tap: [],
    align: [],
    states: [],
    components: [],
    hiddenMotion: [],
    imageBg: 0,
  }

  // --- helpers --------------------------------------------------------------
  const cs = (el) => getComputedStyle(el)
  function visible(el) {
    const s = cs(el)
    if (s.display === 'none' || s.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  function label(el) {
    const part = (e) => {
      let s = e.tagName.toLowerCase()
      if (e.id) s += `#${e.id}`
      const cls = [...(e.classList ?? [])].filter((c) => !/^_|^css-/.test(c)).slice(0, 3)
      if (cls.length) s += `.${cls.join('.')}`
      return s
    }
    const parts = [part(el)]
    let p = el.parentElement
    while (p && parts.length < 3 && p !== document.body) {
      if (p.classList.length || p.id) parts.unshift(part(p))
      p = p.parentElement
    }
    return parts.join(' > ')
  }
  const text = (el) => (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const all = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName))
  const vis = all.filter(visible)


  function parseColor(str) {
    const m = /rgba?\(([^)]+)\)/.exec(str)
    if (!m) return null
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const blend = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  })
  function lum({ r, g, b }) {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }
  const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

  // The colour actually behind an element: composite every background up the tree.
  function backdrop(el) {
    const layers = []
    let image = false
    for (let e = el; e; e = e.parentElement) {
      const s = cs(e)
      if (s.backgroundImage !== 'none' && !/^url\(.*\.svg/.test(s.backgroundImage)) image = true
      const c = parseColor(s.backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = layers.length - 1; i >= 0; i -= 1) bg = blend(layers[i], bg)
    return { bg, image }
  }
  function opacityChain(el) {
    let o = 1
    for (let e = el; e; e = e.parentElement) o *= Number(cs(e).opacity)
    return o
  }

  // --- 1. horizontal overflow -----------------------------------------------
  const scrollsX = (e) => /(auto|scroll|hidden|clip)/.test(cs(e).overflowX) && e !== doc && e !== document.body
  if (doc.scrollWidth > vw + 0.5) {
    for (const el of vis) {
      const r = el.getBoundingClientRect()
      if (r.right <= vw + 0.5 && r.left >= -0.5) continue
      let inside = false
      for (let p = el.parentElement; p; p = p.parentElement) if (scrollsX(p)) inside = true
      if (inside) continue
      const pr = el.parentElement?.getBoundingClientRect()
      if (pr && (pr.right > vw + 0.5 || pr.left < -0.5)) continue // report the outermost
      out.overflow.push({ sel: label(el), right: Math.round(r.right), left: Math.round(r.left), text: text(el) })
    }
  }

  // --- 2. clipped and escaping text ------------------------------------------
  for (const el of vis) {
    if (!hasOwnText(el)) continue
    const s = cs(el)
    const clips = /(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflowY)
    if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && s.textOverflow !== 'ellipsis' && !/-webkit-box/.test(s.display)) {
      out.clipped.push({ sel: label(el), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, text: text(el) })
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue
    if (n.parentElement.closest('svg')) continue
    let box = n.parentElement
    while (box && cs(box).display.startsWith('inline')) box = box.parentElement
    if (!box) continue
    range.selectNodeContents(n)
    const t = range.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    const s = cs(box)
    const right = b.right - parseFloat(s.borderRightWidth)
    const left = b.left + parseFloat(s.borderLeftWidth)
    if (t.width && (t.right > right + 1 || t.left < left - 1)) {
      out.escape.push({ sel: label(box), by: Math.round(Math.max(t.right - right, left - t.left)), text: n.textContent.trim().slice(0, 50) })
    }
  }

  // --- 3. overlapping leaves ------------------------------------------------
  const interactive = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])'
  const isFixed = (el) => {
    for (let e = el; e; e = e.parentElement) if (/(fixed|sticky)/.test(cs(e).position)) return e
    return null
  }
  const leaves = vis.filter((el) => (hasOwnText(el) || el.matches(interactive) || el.tagName === 'text') && !isFixed(el))
  // Per-line boxes: an inline element that wraps has a bounding box covering
  // both lines, which would "overlap" its neighbours without touching them.
  const boxes = leaves.map((el) => ({ el, rs: [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0) }))
  const hit = (a, b) => {
    for (const x of a) for (const y of b) {
      const w = Math.min(x.right, y.right) - Math.max(x.left, y.left)
      const h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top)
      if (w > 2 && h > 2) return { w, h }
    }
    return null
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      const o = hit(a.rs, b.rs)
      if (o) out.overlap.push({ a: label(a.el), b: label(b.el), w: Math.round(o.w), h: Math.round(o.h), at: text(a.el).slice(0, 25) + ' / ' + text(b.el).slice(0, 25) })
    }
    if (out.overlap.length > 60) break
  }

  // --- 4. fixed and sticky things covering text, at top, middle and bottom ---
  // Decorative layers (pointer-events: none, no text of their own) sit over
  // everything by design and are skipped.
  const fixed = vis.filter((el) => /(fixed|sticky)/.test(cs(el).position) && !(cs(el).pointerEvents === 'none' && !text(el)))
  const maxScroll = doc.scrollHeight - innerHeight
  // At the top, anything fixed or sticky that covers text is a defect. Further
  // down, text passing under a sticky header is just scrolling; what matters is
  // the end of the page, where text under a bottom-anchored element (the dock)
  // can never be scrolled clear of it.
  for (const y of [0, maxScroll]) {
    scrollTo(0, y)
    for (const f of fixed) {
      if (!visible(f)) continue
      const fr = f.getBoundingClientRect()
      if (y > 0 && fr.top < innerHeight / 2) continue
      for (const el of leaves) {
        if (f.contains(el)) continue
        const r = el.getBoundingClientRect()
        const w = Math.min(fr.right, r.right) - Math.max(fr.left, r.left)
        const h = Math.min(fr.bottom, r.bottom) - Math.max(fr.top, r.top)
        if (w > 2 && h > 2) out.fixedOverlap.push({ fixed: label(f), covers: label(el), scrollY: y, text: text(el).slice(0, 40) })
      }
    }
  }
  scrollTo(0, 0)

  // --- 5. contrast: text, placeholders, UI boundaries -------------------------
  for (const el of vis) {
    if (!hasOwnText(el) || el.closest('svg')) continue
    const s = cs(el)
    const { bg, image } = backdrop(el)
    if (image) {
      out.imageBg += 1
      continue
    }
    let fg = parseColor(s.color)
    if (!fg) continue
    fg = { ...fg, a: fg.a * opacityChain(el) }
    const c = ratio(blend(fg, bg), bg)
    const px = parseFloat(s.fontSize)
    const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700)
    const need = large ? 3 : 4.5
    if (c < need) {
      out.contrast.push({ sel: label(el), fg: hex(blend(fg, bg)), bg: hex(bg), ratio: +c.toFixed(2), need, px, disabled: el.closest(':disabled,[aria-disabled=true]') ? true : undefined, text: text(el).slice(0, 40) })
    }
  }
  for (const el of vis.filter((e) => e.matches('input:not([type=hidden]),textarea,select') && Number(cs(e).opacity) > 0)) {
    const s = cs(el)
    const parentBg = backdrop(el.parentElement).bg
    const ownBg = parseColor(s.backgroundColor)
    const border = parseColor(s.borderBottomColor)
    const borderW = parseFloat(s.borderBottomWidth)
    const edge = borderW > 0 && border ? ratio(blend(border, parentBg), parentBg) : 0
    const fill = ownBg && ownBg.a > 0 ? ratio(blend(ownBg, parentBg), parentBg) : 0
    if (Math.max(edge, fill) < 3) {
      out.uiContrast.push({ sel: label(el), edge: +edge.toFixed(2), fill: +fill.toFixed(2) })
    }
    if (el.placeholder) {
      const ph = parseColor(getComputedStyle(el, '::placeholder').color)
      const bg = ownBg && ownBg.a > 0 ? blend(ownBg, parentBg) : parentBg
      if (ph) {
        const c = ratio(blend(ph, bg), bg)
        if (c < 4.5) out.contrast.push({ sel: `${label(el)}::placeholder`, fg: hex(blend(ph, bg)), bg: hex(bg), ratio: +c.toFixed(2), need: 4.5, px: parseFloat(s.fontSize), text: el.placeholder.slice(0, 40) })
      }
    }
  }

  // --- 6. tap targets ----------------------------------------------------------
  for (const el of vis.filter((e) => e.matches(interactive))) {
    let target = el
    const s = cs(el)
    // A visually hidden checkbox is hit through its label.
    if (el.matches('input[type=checkbox],input[type=radio]') && (Number(s.opacity) === 0 || el.getBoundingClientRect().width < 2)) {
      target = el.closest('label') ?? (el.id && document.querySelector(`label[for="${el.id}"]`)) ?? el
    }
    const r = target.getBoundingClientRect()
    if (r.width >= 44 && r.height >= 44) continue
    const inline = cs(target).display === 'inline' && target.parentElement && hasOwnText(target.parentElement)
    out.tap.push({ sel: label(target), w: Math.round(r.width), h: Math.round(r.height), inline: inline || undefined, text: text(target).slice(0, 30) || target.getAttribute('aria-label') })
  }

  // --- 7. near-miss alignment between siblings ------------------------------
  for (const parent of vis) {
    const kids = [...parent.children].filter((k) => visible(k) && !cs(k).display.startsWith('inline') && !/(absolute|fixed)/.test(cs(k).position))
    if (kids.length < 2) continue
    const rs = kids.map((k) => k.getBoundingClientRect())
    for (let i = 1; i < kids.length; i += 1) {
      const a = rs[i - 1]
      const b = rs[i]
      const stacked = b.top >= a.bottom - 1
      if (stacked) {
        const d = Math.abs(a.left - b.left)
        if (d >= 1 && d < 4) out.align.push({ kind: 'left', parent: label(parent), a: label(kids[i - 1]), b: label(kids[i]), offset: +d.toFixed(1) })
      } else {
        const same = Math.abs(a.height - b.height) < 2
        const d = same ? Math.abs(a.top - b.top) : Math.abs(a.top + a.height / 2 - (b.top + b.height / 2))
        if (d >= 1 && d < 4) out.align.push({ kind: same ? 'top' : 'centre', parent: label(parent), a: label(kids[i - 1]), b: label(kids[i]), offset: +d.toFixed(1) })
      }
    }
  }

  // --- 8. interaction states, from the stylesheets ----------------------------
  const rules = []
  const collect = (list) => {
    for (const rule of list) {
      if (rule.cssRules) collect(rule.cssRules)
      if (rule.selectorText) rules.push(rule.selectorText)
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      collect(sheet.cssRules)
    } catch {
      /* cross-origin */
    }
  }
  const STATES = ['hover', 'focus-visible', 'active', 'disabled']
  const stateRules = Object.fromEntries(
    STATES.map((st) => [
      st,
      rules
        .flatMap((r) => r.split(','))
        .filter((r) => r.includes(`:${st}`) || (st === 'disabled' && r.includes('[disabled]')))
        .map((r) => r.replace(new RegExp(`:${st}(\\([^)]*\\))?|\\[disabled\\]`, 'g'), '').replace(/::?[a-z-]+(\([^)]*\))?/g, '').trim() || '*'),
    ])
  )
  const seen = new Set()
  for (const el of vis.filter((e) => e.matches('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]'))) {
    const key = `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}${el.type && el.tagName === 'INPUT' ? `[${el.type}]` : ''}`
    if (seen.has(key)) continue
    seen.add(key)
    const missing = STATES.filter((st) => {
      if (st === 'disabled' && el.tagName === 'A') return false
      return !stateRules[st].some((sel) => {
        try {
          return sel === '*' || el.matches(sel)
        } catch {
          return false
        }
      })
    })
    if (missing.length) out.states.push({ key, missing, sel: label(el) })
  }

  // --- 8b. widows: a heading or standfirst whose last line is one word ------
  out.widows = []
  for (const el of vis.filter((e) => e.matches('h1,h2,h3,h4,.folio-standfirst,.panel-note,.empty-state'))) {
    const words = []
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      for (const m of n.textContent.matchAll(/\S+/g)) {
        const r = document.createRange()
        r.setStart(n, m.index)
        r.setEnd(n, m.index + m[0].length)
        const b = r.getBoundingClientRect()
        if (b.width) words.push({ w: m[0], top: Math.round(b.top) })
      }
    }
    if (words.length < 3) continue
    const lastTop = words.at(-1).top
    const onLast = words.filter((x) => Math.abs(x.top - lastTop) < 4)
    const lines = new Set(words.map((x) => Math.round(x.top / 4))).size
    if (lines > 1 && onLast.length === 1) out.widows.push({ sel: label(el), word: onLast[0].w, text: text(el).slice(0, 50) })
  }

  // --- 9. component styles, compared across pages in run.mjs ------------------
  const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'height', 'color', 'backgroundColor', 'boxShadow']
  const COMPONENTS = 'button,a[class*=btn],input:not([type=hidden]),textarea,select,table,th,td,h1,h2,h3,h4,label,[class*=panel],[class*=eyebrow],[class*=kicker]'
  const compSeen = new Set()
  for (const el of vis.filter((e) => e.matches(COMPONENTS))) {
    const key = `${el.tagName.toLowerCase()}${[...el.classList].sort().map((c) => `.${c}`).join('')}`
    if (compSeen.has(key)) continue
    compSeen.add(key)
    const s = cs(el)
    out.components.push({ key, style: Object.fromEntries(PROPS.map((p) => [p, s[p]])) })
  }

  // --- 10. still-animating or invisible content (read at reduced motion) ----
  for (const el of vis) {
    const s = cs(el)
    const anim = s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01
    const trans = parseFloat(s.transitionDuration) > 0.01 && s.transitionProperty !== 'none'
    const faded = Number(s.opacity) < 0.99 && el.closest('main') && hasOwnText(el)
    if (anim || faded) out.hiddenMotion.push({ sel: label(el), anim: anim ? s.animationName : undefined, opacity: faded ? s.opacity : undefined, transition: trans ? s.transitionDuration : undefined })
  }

  return out
})()
