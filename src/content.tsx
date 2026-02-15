import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { normalizeChannelUrl } from "./lib/utils"
import styles from "./styles.css?inline"

// =============================================================================
// Constants
// =============================================================================

const ROOT_ID = "ytx-root"
const CARD_MARK = "data-ytx-tag-btn"
const CARD_BTN_MARK = "data-ytx-tag-button"
const MENU_ITEM_MARK = "data-ytx-menu-item"
const CHANNEL_URL_MARK = "data-ytx-channel-url"
const CHANNEL_HEADER_MARK = "data-ytx-channel-header-btn"
const FILTER_WARNING_ID = "ytx-filter-warning"

const VIDEO_CARD_SELECTOR =
  "ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer"

// =============================================================================
// State
// =============================================================================

let lastMenuCard: Element | null = null
let activeFilterTags: string[] = []
let channelTagMap: Record<string, string[]> = {}

type ContentType = "shorts" | "video" | "live" | "upcoming"
type ContentTypeFilterMap = {
  shorts: boolean
  videos: boolean
  live: boolean
  upcoming: boolean
}

const DEFAULT_CONTENT_TYPES: ContentTypeFilterMap = {
  shorts: true,
  videos: true,
  live: true,
  upcoming: true,
}

let contentTypeFilters: ContentTypeFilterMap = { ...DEFAULT_CONTENT_TYPES }

// =============================================================================
// Tag Button Factory
// =============================================================================

type TagButtonVariant = "card" | "header"

type TagButtonConfig = {
  channelUrl: string
  channelName: string
  variant: TagButtonVariant
}

// Colors for tag button states
const TAG_BUTTON_COLOR_DEFAULT = "hsl(0 0% 100%)" // White
const TAG_BUTTON_COLOR_HOVER = "hsl(204 100% 62%)" // Lighter primary blue

const TAG_BUTTON_STYLES: Record<TagButtonVariant, string> = {
  card: `position:absolute;bottom:6px;right:6px;font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid ${TAG_BUTTON_COLOR_DEFAULT};background:rgba(15,15,15,0.9);color:${TAG_BUTTON_COLOR_DEFAULT};cursor:pointer;font-weight:500;z-index:10;transition:color 0.15s,border-color 0.15s;`,
  header: `margin-left:8px;font-size:12px;padding:4px 12px;border-radius:6px;border:1px solid ${TAG_BUTTON_COLOR_DEFAULT};background:#0f0f0f;color:${TAG_BUTTON_COLOR_DEFAULT};cursor:pointer;font-weight:500;vertical-align:middle;transition:color 0.15s,border-color 0.15s;`,
}

function getTagCountForChannel(channelUrl: string): number {
  const normalized = normalizeChannelUrl(channelUrl)
  const tags =
    channelTagMap[normalized] ??
    channelTagMap[channelUrl] ??
    Object.entries(channelTagMap).find(
      ([k]) => normalizeChannelUrl(k) === normalized,
    )?.[1] ??
    []
  return tags.length
}

function getTagButtonLabel(channelUrl: string): string {
  const count = getTagCountForChannel(channelUrl)
  return count > 0 ? `${count} Tag` : "Tag"
}

function applyTagButtonColor(btn: HTMLElement, channelUrl: string): void {
  const count = getTagCountForChannel(channelUrl)
  const color = count > 0 ? TAG_BUTTON_COLOR_HOVER : TAG_BUTTON_COLOR_DEFAULT
  btn.style.color = color
  btn.style.borderColor = color
}

function createTagButton(config: TagButtonConfig): HTMLButtonElement {
  const { channelUrl, channelName, variant } = config

  const btn = document.createElement("button")
  btn.setAttribute(variant === "card" ? CARD_BTN_MARK : CHANNEL_HEADER_MARK, "1")
  btn.setAttribute("data-channel-url", channelUrl)
  btn.textContent = getTagButtonLabel(channelUrl)
  btn.style.cssText = TAG_BUTTON_STYLES[variant]
  btn.type = "button"

  // Apply initial color based on tag count
  applyTagButtonColor(btn, channelUrl)

  // Hover effects (only change color on hover if no tags)
  btn.addEventListener("mouseenter", () => {
    btn.style.color = TAG_BUTTON_COLOR_HOVER
    btn.style.borderColor = TAG_BUTTON_COLOR_HOVER
  })
  btn.addEventListener("mouseleave", () => {
    applyTagButtonColor(btn, channelUrl)
  })

  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    e.preventDefault()
    dispatchAssign(channelUrl, channelName, e.clientX, e.clientY)
  })

  return btn
}

function updateTagButtonLabels(): void {
  const buttons = document.querySelectorAll<HTMLElement>(
    `button[${CARD_BTN_MARK}], button[${CHANNEL_HEADER_MARK}]`,
  )
  buttons.forEach((btn) => {
    const channelUrl = btn.getAttribute("data-channel-url")
    if (channelUrl) {
      btn.textContent = getTagButtonLabel(channelUrl)
      applyTagButtonColor(btn, channelUrl)
    }
  })
}

function dispatchAssign(channelUrl: string, channelName: string, x: number, y: number) {
  window.dispatchEvent(
    new CustomEvent("ytx-open-assign", {
      detail: { channelUrl, channelName, x, y },
    }),
  )
}

// =============================================================================
// Page Detection
// =============================================================================

function isSubscriptionsFeed(): boolean {
  return location.pathname === "/feed/subscriptions"
}

function isChannelPage(): boolean {
  return (
    location.pathname.startsWith("/@") ||
    location.pathname.startsWith("/channel/") ||
    location.pathname.startsWith("/c/")
  )
}

function getChannelPageUrl(): string {
  const match = location.pathname.match(/^(\/@[^/]+|\/channel\/[^/]+|\/c\/[^/]+)/)
  if (match) {
    return location.origin + match[1]
  }
  return location.href
}

// =============================================================================
// Channel Link Detection
// =============================================================================

function isChannelUrl(href: string): boolean {
  if (!href) return false
  try {
    const url = new URL(href, window.location.origin)
    const path = url.pathname
    return path.includes("/channel/") || path.startsWith("/@") || path.startsWith("/c/")
  } catch {
    return href.includes("/channel/") || href.includes("/@") || href.includes("/c/")
  }
}

const CHANNEL_LINK_SELECTORS = [
  "ytd-channel-name a[href*='/channel/'], ytd-channel-name a[href*='/@'], ytd-channel-name a[href*='/c/']",
  "ytd-video-meta-block a[href*='/channel/'], ytd-video-meta-block a[href*='/@'], ytd-video-meta-block a[href*='/c/']",
  "ytd-video-owner-renderer a[href*='/channel/'], ytd-video-owner-renderer a[href*='/@']",
  "#byline-container a[href*='/channel/'], #byline-container a[href*='/@']",
  "#metadata-line a[href*='/channel/'], #metadata-line a[href*='/@']",
  "#text-container a[href*='/channel/'], #text-container a[href*='/@']",
  "yt-formatted-string#text a[href*='/channel/'], yt-formatted-string#text a[href*='/@']",
  "#channel-info a[href*='/channel/'], #channel-info a[href*='/@']",
]

function findAllChannelLinks(card: Element): HTMLAnchorElement[] {
  const foundLinks = new Map<string, HTMLAnchorElement>()

  // First priority: avatar link (most reliable)
  const avatarLink = card.querySelector<HTMLAnchorElement>("a#avatar-link")
  if (avatarLink?.href && isChannelUrl(avatarLink.href)) {
    foundLinks.set(avatarLink.href, avatarLink)
  }

  // Second priority: specific selectors
  for (const sel of CHANNEL_LINK_SELECTORS) {
    const links = card.querySelectorAll<HTMLAnchorElement>(sel)
    links.forEach((link) => {
      if (link.href && isChannelUrl(link.href) && !link.closest("ytd-menu-renderer")) {
        foundLinks.set(link.href, link)
      }
    })
  }

  // Fallback: any channel link in the card
  if (foundLinks.size === 0) {
    const allLinks = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))
    for (const a of allLinks) {
      if (a.closest("ytd-menu-renderer")) continue
      if (isChannelUrl(a.href)) {
        foundLinks.set(a.href, a)
      }
    }
  }

  return Array.from(foundLinks.values())
}

function findChannelLink(card: Element): HTMLAnchorElement | null {
  const links = findAllChannelLinks(card)
  return links.length > 0 ? links[0] : null
}

// =============================================================================
// Shadow DOM & App Host
// =============================================================================

type HostNodes = {
  shadow: ShadowRoot
  portalContainer: HTMLElement
}

function ensureHost(): HostNodes {
  const existing = document.getElementById(ROOT_ID)
  if (existing?.shadowRoot) {
    const existingPortal =
      existing.shadowRoot.querySelector<HTMLElement>("[data-ytx-portal]")
    if (existingPortal) {
      return { shadow: existing.shadowRoot, portalContainer: existingPortal }
    }
  }

  const host = document.createElement("div")
  host.id = ROOT_ID
  host.style.position = "fixed"
  host.style.right = "16px"
  host.style.bottom = "16px"
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
    </React.StrictMode>,
  )
}

function ensureAppOnSubscriptions(): void {
  const host = document.getElementById(ROOT_ID)
  const shouldShow = isSubscriptionsFeed() || isChannelPage()
  if (shouldShow) {
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

// =============================================================================
// Tag Button Injection
// =============================================================================

const CHANNEL_NAME_SELECTORS = [
  "ytd-c4-tabbed-header-renderer ytd-channel-name yt-formatted-string#text",
  "ytd-c4-tabbed-header-renderer ytd-channel-name #text",
  "#page-header ytd-channel-name yt-formatted-string",
  "#page-header yt-dynamic-text-view-model .yt-core-attributed-string",
  "#channel-header ytd-channel-name #text",
  "#channel-header-container ytd-channel-name #text",
  "ytd-c4-tabbed-header-renderer #channel-name",
  "#page-header #channel-name",
]

function addTagButtonToChannelHeader(): void {
  if (!isChannelPage()) return
  if (document.querySelector(`[${CHANNEL_HEADER_MARK}]`)) return

  let channelName = "Channel"
  let channelNameEl: Element | null = null

  for (const sel of CHANNEL_NAME_SELECTORS) {
    channelNameEl = document.querySelector(sel)
    if (channelNameEl) {
      channelName = channelNameEl.textContent?.trim() || "Channel"
      break
    }
  }

  const channelUrl = getChannelPageUrl()
  const btn = createTagButton({ channelUrl, channelName, variant: "header" })

  // Try to insert next to channel name element
  if (channelNameEl) {
    const container = channelNameEl.closest("ytd-channel-name") as HTMLElement | null
    if (container) {
      container.style.display = "inline-flex"
      container.style.alignItems = "center"
      container.appendChild(btn)
      return
    }
    const parent = channelNameEl.parentElement
    if (parent) {
      parent.style.display = "inline-flex"
      parent.style.alignItems = "center"
      parent.appendChild(btn)
      return
    }
  }

  // Fallback: Insert into header container
  const headerContainer =
    document.querySelector("#page-header") || document.querySelector("#contentContainer")
  if (headerContainer) {
    const channelInfo = headerContainer.querySelector(
      "#channel-header-container, #inner-header-container, .page-header-view-model-wiz__page-header-headline",
    )
    if (channelInfo) {
      ;(channelInfo as HTMLElement).style.display = "flex"
      ;(channelInfo as HTMLElement).style.alignItems = "center"
      channelInfo.appendChild(btn)
      return
    }
    headerContainer.appendChild(btn)
  }
}

const THUMBNAIL_SELECTORS = [
  "ytd-thumbnail",
  "#thumbnail",
  "a#thumbnail",
  ".ytd-thumbnail",
  "#dismissible ytd-thumbnail",
  "#dismissible #thumbnail",
]

function addTagButtonToCard(card: Element): void {
  const link = findChannelLink(card)
  if (!link) return

  card.setAttribute(CHANNEL_URL_MARK, link.href)

  const existing = card.querySelector<HTMLButtonElement>(`button[${CARD_BTN_MARK}]`)
  const currentUrl = card.getAttribute(CHANNEL_URL_MARK)
  const marked = card.getAttribute(CARD_MARK) === "1"
  if (marked && existing && currentUrl === link.href) return

  if (existing) existing.remove()

  const channelName = link.textContent?.trim() || "Channel"
  const btn = createTagButton({ channelUrl: link.href, channelName, variant: "card" })

  let thumbnail: HTMLElement | null = null
  for (const sel of THUMBNAIL_SELECTORS) {
    thumbnail = card.querySelector(sel) as HTMLElement | null
    if (thumbnail) break
  }

  if (thumbnail) {
    thumbnail.style.position = "relative"
    thumbnail.appendChild(btn)
  } else {
    const cardEl = card as HTMLElement
    cardEl.style.position = "relative"
    cardEl.appendChild(btn)
  }
  card.setAttribute(CARD_MARK, "1")
}

// =============================================================================
// Context Menu Integration
// =============================================================================

function attachMenuTracking(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null
    if (!target) return
    const menuRenderer = target.closest("ytd-menu-renderer")
    if (!menuRenderer) return
    const card = menuRenderer.closest(VIDEO_CARD_SELECTOR)
    if (card) {
      lastMenuCard = card
    }
  })
}

function injectMenuItem(): void {
  const listboxes = document.querySelectorAll(
    "ytd-menu-popup-renderer tp-yt-paper-listbox, ytd-menu-popup-renderer paper-listbox",
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
      dispatchAssign(link.href, channelName, event.clientX, event.clientY)
    })

    listbox.appendChild(item)
  })
}

// =============================================================================
// Content Type & Filtering
// =============================================================================

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
  if (
    queryInCard(card, 'a[href^="/shorts/"]') ||
    queryInCard(card, "ytd-thumbnail-overlay-time-status-renderer[overlay-style=SHORTS]")
  ) {
    return "shorts"
  }
  if (
    queryInCard(
      card,
      'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]',
    ) ||
    queryInCard(card, ".yt-badge-shape--thumbnail-live")
  ) {
    return "live"
  }
  if (
    queryInCard(
      card,
      'ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]',
    )
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

function matchesTagFilter(channelUrl: string | null): boolean {
  if (!activeFilterTags.length) return true
  if (!channelUrl) return false
  const normalized = normalizeChannelUrl(channelUrl)
  const assigned =
    channelTagMap[normalized] ??
    channelTagMap[channelUrl] ??
    Object.entries(channelTagMap).find(
      ([k]) => normalizeChannelUrl(k) === normalized,
    )?.[1] ??
    []
  return assigned.some((tagId) => activeFilterTags.includes(tagId))
}

function queryAllCards(): Element[] {
  const roots: (Document | ShadowRoot)[] = [document]
  const app = document.querySelector("ytd-app")
  if (app?.shadowRoot) roots.push(app.shadowRoot)
  const found: Element[] = []
  for (const root of roots) {
    root.querySelectorAll(VIDEO_CARD_SELECTOR).forEach((el) => {
      found.push(el)
    })
  }
  return [...new Set(found)]
}

function applyFilter(): void {
  if (!isSubscriptionsFeed()) return

  const allContentDisabled =
    !contentTypeFilters.shorts &&
    !contentTypeFilters.videos &&
    !contentTypeFilters.live &&
    !contentTypeFilters.upcoming

  // Show/hide warning message for empty filters
  let warning = document.getElementById(FILTER_WARNING_ID)
  if (allContentDisabled) {
    if (!warning) {
      warning = document.createElement("div")
      warning.id = FILTER_WARNING_ID
      warning.style.cssText =
        "padding:40px;text-align:center;font-size:16px;color:#aaa;min-height:50vh;display:flex;align-items:center;justify-content:center;"
      warning.textContent =
        "All content types are hidden. Enable at least one content type in the Tags panel to see videos."
      const container =
        document.querySelector("ytd-rich-grid-renderer") ||
        document.querySelector("#contents") ||
        document.querySelector("#primary")
      if (container) {
        container.prepend(warning)
      }
    }
    warning.style.display = "flex"
  } else if (warning) {
    warning.style.display = "none"
  }

  // Hide/show pagination to prevent infinite scroll when all content is hidden
  const continuationElements = document.querySelectorAll(
    "ytd-continuation-item-renderer, ytd-rich-grid-renderer #continuations",
  )
  continuationElements.forEach((el) => {
    ;(el as HTMLElement).style.display = allContentDisabled ? "none" : ""
  })

  // Apply filters to video cards
  const cards = queryAllCards()
  cards.forEach((card) => {
    const channelUrl = card.getAttribute(CHANNEL_URL_MARK)
    const show = matchesTagFilter(channelUrl) && matchesContentTypeFilter(card)
    ;(card as HTMLElement).style.display = show ? "" : "none"
  })

  // Hide shorts section wrapper when shorts are filtered out
  const shortsShelves = document.querySelectorAll(
    "ytd-rich-shelf-renderer, ytd-reel-shelf-renderer",
  )
  shortsShelves.forEach((shelf) => {
    const hasShortsContent = shelf.querySelector('a[href^="/shorts/"]')
    if (hasShortsContent) {
      ;(shelf as HTMLElement).style.display = contentTypeFilters.shorts ? "" : "none"
    }
  })

  // Hide tag buttons when tag filters are active to prevent accidental untagging
  const tagButtons = document.querySelectorAll(`button[${CARD_BTN_MARK}]`)
  const hasActiveTagFilters = activeFilterTags.length > 0
  tagButtons.forEach((btn) => {
    ;(btn as HTMLElement).style.display = hasActiveTagFilters ? "none" : ""
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
      updateTagButtonLabels()
      applyFilter()
    },
    { passive: true },
  )
}

// =============================================================================
// Main Scan & Init
// =============================================================================

function scanAndInject(): void {
  if (isChannelPage()) {
    addTagButtonToChannelHeader()
  }

  if (!isSubscriptionsFeed()) return

  for (const card of queryAllCards()) {
    addTagButtonToCard(card)
  }

  injectMenuItem()
  applyFilter()
}

function observeFeed(): void {
  const observer = new MutationObserver(() => scanAndInject())
  observer.observe(document.body, { childList: true, subtree: true })
  scanAndInject()
}

function init(): void {
  ensureAppOnSubscriptions()
  observeFeed()
  attachMenuTracking()
  attachFilterListener()

  // Re-run when YouTube SPA navigates
  let lastPath = location.pathname
  const checkPath = () => {
    if (location.pathname !== lastPath) {
      const existingHeaderBtn = document.querySelector(`[${CHANNEL_HEADER_MARK}]`)
      if (existingHeaderBtn) existingHeaderBtn.remove()

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
