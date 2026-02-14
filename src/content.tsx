import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { normalizeChannelUrl } from "./lib/utils"
import styles from "./styles.css?inline"

const ROOT_ID = "ytx-root"
const CARD_MARK = "data-ytx-tag-btn"
const CARD_BTN_MARK = "data-ytx-tag-button"
const MENU_ITEM_MARK = "data-ytx-menu-item"
const CHANNEL_BTN_MARK = "data-ytx-channel-btn"
const CHANNEL_URL_MARK = "data-ytx-channel-url"

let lastMenuCard: Element | null = null
let activeFilterTags: string[] = []
let channelTagMap: Record<string, string[]> = {}

type ContentType = "shorts" | "video" | "live" | "upcoming"
type ContentTypeFilterMap = { shorts: boolean; videos: boolean; live: boolean; upcoming: boolean }

const DEFAULT_CONTENT_TYPES: ContentTypeFilterMap = {
  shorts: true,
  videos: true,
  live: true,
  upcoming: true,
}

let contentTypeFilters: ContentTypeFilterMap = { ...DEFAULT_CONTENT_TYPES }

function isSubscriptionsFeed(): boolean {
  return location.pathname === "/feed/subscriptions"
}

type HostNodes = {
  shadow: ShadowRoot
  portalContainer: HTMLElement
}

function ensureHost(): HostNodes {
  const existing = document.getElementById(ROOT_ID)
  if (existing?.shadowRoot) {
    const existingPortal = existing.shadowRoot.querySelector<HTMLElement>("[data-ytx-portal]")
    if (existingPortal) {
      return { shadow: existing.shadowRoot, portalContainer: existingPortal }
    }
  }

  const host = document.createElement("div")
  host.id = ROOT_ID
  host.style.position = "fixed"
  host.style.right = "16px"
  host.style.top = "88px"
  host.style.zIndex = "999999"
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = styles
  shadow.appendChild(style)

  const mount = document.createElement("div")
  shadow.appendChild(mount)

  const portalContainer = document.createElement("div")
  portalContainer.setAttribute("data-ytx-portal", "1")
  shadow.appendChild(portalContainer)

  return { shadow, portalContainer }
}

function renderApp(hostNodes: HostNodes): void {
  const mount = hostNodes.shadow.querySelector("div")
  if (!mount) return
  createRoot(mount).render(
    <React.StrictMode>
      <App portalContainer={hostNodes.portalContainer} />
    </React.StrictMode>
  )
}

function isChannelUrl(href: string): boolean {
  return (
    href.includes("/channel/") || href.includes("/@") || href.includes("/c/")
  )
}

function findChannelLink(card: Element): HTMLAnchorElement | null {
  const selectors = [
    "ytd-channel-name a[href*='/channel/'], ytd-channel-name a[href*='/@'], ytd-channel-name a[href*='/c/']",
    "ytd-video-meta-block a[href*='/channel/'], ytd-video-meta-block a[href*='/@'], ytd-video-meta-block a[href*='/c/']",
    "ytd-video-owner-renderer a[href*='/channel/'], ytd-video-owner-renderer a[href*='/@']",
    "a#avatar-link",
    "a.yt-simple-endpoint.yt-formatted-string[href*='/channel/'], a.yt-simple-endpoint.yt-formatted-string[href*='/@']",
    "#byline-container a[href*='/channel/'], #byline-container a[href*='/@']",
    "#metadata-line a[href*='/channel/'], #metadata-line a[href*='/@']",
  ]
  for (const sel of selectors) {
    const link = card.querySelector<HTMLAnchorElement>(sel)
    if (link?.href && isChannelUrl(link.href)) return link
  }
  // Fallback: any channel link in card, excluding three-dot menu
  const allLinks = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))
  for (const a of allLinks) {
    if (a.closest("ytd-menu-renderer")) continue
    if (isChannelUrl(a.href)) return a
  }
  return null
}

function dispatchAssign(channelUrl: string, channelName: string) {
  window.dispatchEvent(
    new CustomEvent("ytx-open-assign", {
      detail: { channelUrl, channelName },
    })
  )
}

function addTagButtonToCard(card: Element): void {
  const link = findChannelLink(card)
  if (!link) return
  card.setAttribute(CHANNEL_URL_MARK, link.href)

  const existing = card.querySelector<HTMLButtonElement>(`button[${CARD_BTN_MARK}]`)
  const currentUrl = card.getAttribute(CHANNEL_URL_MARK)
  const marked = card.getAttribute(CARD_MARK) === "1"
  if (marked && existing && currentUrl === link.href) return

  if (existing) existing.remove()

  const btn = document.createElement("button")
  btn.setAttribute(CARD_BTN_MARK, "1")
  btn.textContent = "Tag"
  btn.style.cssText =
    "margin-left:6px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid #3ea6ff;background:#0f0f0f;color:#3ea6ff;cursor:pointer;font-weight:500;"
  btn.type = "button"

  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    e.preventDefault()
    const channelName = link.textContent?.trim() || "Channel"
    dispatchAssign(link.href, channelName)
  })

  // Inject next to channel link - try multiple parent strategies (incl. collaboration layouts)
  const channelBlock =
    link.closest("ytd-channel-name") ||
    link.closest("ytd-video-meta-block") ||
    link.closest("ytd-video-owner-renderer") ||
    link.closest("#metadata-line")?.parentElement ||
    link.closest("#byline-container") ||
    link.parentElement
  const blockEl = channelBlock as HTMLElement | null
  if (blockEl) {
    blockEl.style.display = "inline-flex"
    blockEl.style.alignItems = "center"
    blockEl.style.flexWrap = "wrap"
    blockEl.appendChild(btn)
    card.setAttribute(CARD_MARK, "1")
  }
}

/** Query selector within element and its descendant shadow roots. */
function queryInCard(card: Element, selector: string): Element | null {
  const el = card.querySelector(selector)
  if (el) return el
  const walk = (root: Element | Document | ShadowRoot): Element | null => {
    for (const child of Array.from(root.querySelectorAll("*"))) {
      if (child.shadowRoot) {
        const found = child.shadowRoot.querySelector(selector)
        if (found) return found
        const inner = walk(child.shadowRoot)
        if (inner) return inner
      }
    }
    return null
  }
  return walk(card)
}

function getContentType(card: Element): ContentType {
  // Shorts: /shorts/ link or overlay-style=SHORTS
  if (
    queryInCard(card, 'a[href^="/shorts/"]') ||
    queryInCard(card, "ytd-thumbnail-overlay-time-status-renderer[overlay-style=SHORTS]")
  ) {
    return "shorts"
  }
  // Live: overlay-style=LIVE or live badge
  if (
    queryInCard(card, 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]') ||
    queryInCard(card, ".yt-badge-shape--thumbnail-live")
  ) {
    return "live"
  }
  // Upcoming: overlay-style=UPCOMING
  if (
    queryInCard(card, 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]')
  ) {
    return "upcoming"
  }
  return "video"
}

function matchesContentTypeFilter(card: Element): boolean {
  const type = getContentType(card)
  const filterKey = type === "video" ? "videos" : type
  return contentTypeFilters[filterKey] === true
}

function matchesFilter(channelUrl: string | null): boolean {
  if (!activeFilterTags.length) return true
  if (!channelUrl) return false // Hide unidentified videos when filtering
  const normalized = normalizeChannelUrl(channelUrl)
  // Check both normalized key and original (for backwards compatibility)
  const assigned =
    channelTagMap[normalized] ??
    channelTagMap[channelUrl] ??
    Object.entries(channelTagMap).find(([k]) => normalizeChannelUrl(k) === normalized)?.[1] ??
    []
  return assigned.some((tagId) => activeFilterTags.includes(tagId))
}

function queryAllCards(): Element[] {
  const sel =
    "ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer"
  const roots: (Document | ShadowRoot)[] = [document]
  const app = document.querySelector("ytd-app")
  if (app?.shadowRoot) roots.push(app.shadowRoot)
  const found: Element[] = []
  for (const root of roots) {
    root.querySelectorAll(sel).forEach((el) => {
      found.push(el)
    })
  }
  return [...new Set(found)]
}

function applyFilter(): void {
  if (!isSubscriptionsFeed()) return
  const cards = queryAllCards()
  cards.forEach((card) => {
    const channelUrl = card.getAttribute(CHANNEL_URL_MARK)
    const show =
      matchesFilter(channelUrl) && matchesContentTypeFilter(card)
    ;(card as HTMLElement).style.display = show ? "" : "none"
  })
}

function attachFilterListener(): void {
  window.addEventListener(
    "ytx-filter-change",
    (event) => {
      const detail = (
        event as CustomEvent<{
          activeTags: string[]
          channelTags: Record<string, string[]>
          contentTypes?: ContentTypeFilterMap
        }>
      ).detail
      if (!detail) return
      activeFilterTags = detail.activeTags ?? []
      channelTagMap = detail.channelTags ?? {}
      if (detail.contentTypes) {
        contentTypeFilters = { ...DEFAULT_CONTENT_TYPES, ...detail.contentTypes }
      }
      applyFilter()
    },
    { passive: true }
  )
}

function attachMenuTracking(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null
    if (!target) return
    const menuRenderer = target.closest("ytd-menu-renderer")
    if (!menuRenderer) return
    const card = menuRenderer.closest(
      "ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer"
    )
    if (card) {
      lastMenuCard = card
    }
  })
}

function injectMenuItem(): void {
  const listboxes = document.querySelectorAll(
    "ytd-menu-popup-renderer tp-yt-paper-listbox, ytd-menu-popup-renderer paper-listbox"
  )
  listboxes.forEach((listbox) => {
    if (listbox.querySelector(`[${MENU_ITEM_MARK}]`)) return

    const item = document.createElement("tp-yt-paper-item")
    item.setAttribute(MENU_ITEM_MARK, "1")
    item.setAttribute("role", "menuitem")
    item.className = "style-scope ytd-menu-popup-renderer"
    item.style.cursor = "pointer"

    const label = document.createElement("yt-formatted-string")
    label.className = "style-scope ytd-menu-popup-renderer"
    label.textContent = "Add to tag"

    item.appendChild(label)
    item.addEventListener("click", (event) => {
      event.stopPropagation()
      event.preventDefault()
      if (!lastMenuCard) return
      const link = findChannelLink(lastMenuCard)
      if (!link) return
      const channelName = link.textContent?.trim() || "Channel"
      dispatchAssign(link.href, channelName)
    })

    listbox.appendChild(item)
  })
}

function addTagButtonToChannelHeader(): void {
  const header =
    document.querySelector("ytd-c4-tabbed-header-renderer") ||
    document.querySelector("ytd-channel-video-player-renderer")
  if (!header) return
  if (header.querySelector(`[${CHANNEL_BTN_MARK}]`)) return

  const nameEl =
    header.querySelector<HTMLElement>("#channel-name #text") ||
    header.querySelector<HTMLElement>("#channel-name yt-formatted-string") ||
    header.querySelector<HTMLElement>("yt-formatted-string#text") ||
    header.querySelector<HTMLElement>("h1.ytd-channel-name")
  const channelName = nameEl?.textContent?.trim() || "Channel"

  const buttonHost =
    header.querySelector<HTMLElement>("#buttons") ||
    header.querySelector<HTMLElement>("#subscribe-button")?.parentElement ||
    header.querySelector<HTMLElement>("ytd-subscribe-button-renderer")?.parentElement
  if (!buttonHost) return

  const btn = document.createElement("button")
  btn.setAttribute(CHANNEL_BTN_MARK, "1")
  btn.textContent = "Add to tag"
  btn.style.cssText =
    "margin-left:8px;font-size:12px;padding:6px 12px;border-radius:999px;border:1px solid #3ea6ff;background:#0f0f0f;color:#3ea6ff;cursor:pointer;font-weight:500;"
  btn.type = "button"

  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    e.preventDefault()
    dispatchAssign(location.href, channelName)
  })

  buttonHost.appendChild(btn)
}

function scanAndInject(): void {
  for (const card of queryAllCards()) addTagButtonToCard(card)

  injectMenuItem()
  addTagButtonToChannelHeader()
  applyFilter()
}

function observeFeed(): void {
  const observer = new MutationObserver(() => scanAndInject())
  observer.observe(document.body, { childList: true, subtree: true })
  scanAndInject()
}

function ensureAppOnSubscriptions(): void {
  const host = document.getElementById(ROOT_ID)
  if (isSubscriptionsFeed()) {
    const hostNodes = ensureHost()
    const mount = hostNodes.shadow.querySelector("div")
    if (mount && !mount.hasChildNodes()) {
      renderApp(hostNodes)
    }
    if (host) host.style.display = ""
  } else if (host) {
    host.style.display = "none"
  }
}

function init(): void {
  ensureAppOnSubscriptions()
  observeFeed()
  attachMenuTracking()
  attachFilterListener()

  // Re-run when YouTube SPA navigates (history/popstate)
  let lastPath = location.pathname
  const checkPath = () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      ensureAppOnSubscriptions()
      scanAndInject()
    }
  }
  window.addEventListener("popstate", checkPath)
  const observer = new MutationObserver(() => checkPath())
  observer.observe(document.body, { childList: true, subtree: true })
}

init()
