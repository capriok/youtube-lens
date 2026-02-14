import { Edit2Icon, PanelRightOpen, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog"
import { Input } from "./components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "./components/ui/popover"
import { normalizeChannelUrl } from "./lib/utils"

type AppProps = {
  portalContainer: HTMLElement
}

type Tag = {
  id: string
  name: string
  color: string
}

type ChannelTagMap = Record<string, string[]>

type ContentTypeFilters = {
  shorts: boolean
  videos: boolean
  live: boolean
  upcoming: boolean
}

const DEFAULT_CONTENT_TYPES: ContentTypeFilters = {
  videos: true,
  live: true,
  upcoming: true,
  shorts: true,
}

type AssignDetail = {
  channelUrl: string
  channelName: string
  x: number
  y: number
}

const DEFAULT_TAGS: Tag[] = [
  { id: "racing", name: "Racing", color: "#7a5cff" },
  { id: "games", name: "Games", color: "#30c4ff" },
]

const TAGS_KEY = "ytx_tags"
const CHANNEL_TAGS_KEY = "ytx_channel_tags"
const CONTENT_TYPES_KEY = "ytx_content_types"
const PANEL_OPEN_KEY = "ytx_panel_open"
const ACTIVE_FILTERS_KEY = "ytx_active_filters"

function storageArea() {
  if (typeof chrome !== "undefined" && chrome.storage?.sync) return chrome.storage.sync
  if (typeof chrome !== "undefined" && chrome.storage?.local) return chrome.storage.local
  return null
}

async function loadData(): Promise<{
  tags: Tag[]
  channelTags: ChannelTagMap
  contentTypes: ContentTypeFilters
  panelOpen: boolean
  activeFilters: string[]
}> {
  const area = storageArea()
  if (!area) {
    return {
      tags: DEFAULT_TAGS,
      channelTags: {},
      contentTypes: DEFAULT_CONTENT_TYPES,
      panelOpen: true,
      activeFilters: [],
    }
  }

  const result = await area.get([
    TAGS_KEY,
    CHANNEL_TAGS_KEY,
    CONTENT_TYPES_KEY,
    PANEL_OPEN_KEY,
    ACTIVE_FILTERS_KEY,
  ])
  const tags = (result[TAGS_KEY] as Tag[] | undefined) ?? DEFAULT_TAGS
  const channelTags = (result[CHANNEL_TAGS_KEY] as ChannelTagMap | undefined) ?? {}
  const contentTypes =
    (result[CONTENT_TYPES_KEY] as ContentTypeFilters | undefined) ?? DEFAULT_CONTENT_TYPES
  const panelOpen = (result[PANEL_OPEN_KEY] as boolean | undefined) ?? true
  const activeFilters = (result[ACTIVE_FILTERS_KEY] as string[] | undefined) ?? []
  return { tags, channelTags, contentTypes, panelOpen, activeFilters }
}

async function saveData(
  tags: Tag[],
  channelTags: ChannelTagMap,
  contentTypes: ContentTypeFilters,
  panelOpen?: boolean
) {
  const area = storageArea()
  if (!area) return
  const data: Record<string, unknown> = {
    [TAGS_KEY]: tags,
    [CHANNEL_TAGS_KEY]: channelTags,
    [CONTENT_TYPES_KEY]: contentTypes,
  }
  if (panelOpen !== undefined) {
    data[PANEL_OPEN_KEY] = panelOpen
  }
  await area.set(data)
}

async function savePanelOpen(panelOpen: boolean) {
  const area = storageArea()
  if (!area) return
  await area.set({ [PANEL_OPEN_KEY]: panelOpen })
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-")
}

function uniqueId(base: string, existing: Tag[]) {
  if (!existing.some((t) => t.id === base)) return base
  let i = 2
  while (existing.some((t) => t.id === `${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export default function App({ portalContainer }: AppProps) {
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [newTag, setNewTag] = useState("")
  const [channelTags, setChannelTags] = useState<ChannelTagMap>({})
  const [contentTypes, setContentTypes] = useState<ContentTypeFilters>(DEFAULT_CONTENT_TYPES)

  const [panelOpen, setPanelOpen] = useState(true)
  const [manageOpen, setManageOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignChannel, setAssignChannel] = useState<AssignDetail | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover when mouse moves more than 100px away
  useEffect(() => {
    if (!assignOpen) return

    const handleMouseMove = (e: MouseEvent) => {
      const popover = popoverRef.current
      if (!popover) return

      const rect = popover.getBoundingClientRect()
      const distance = Math.max(
        rect.left - e.clientX,
        e.clientX - rect.right,
        rect.top - e.clientY,
        e.clientY - rect.bottom,
        0
      )

      if (distance > 100) {
        setAssignOpen(false)
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    return () => document.removeEventListener("mousemove", handleMouseMove)
  }, [assignOpen])

  useEffect(() => {
    let mounted = true
    loadData().then((data) => {
      if (!mounted) return
      setTags(data.tags)
      setChannelTags(data.channelTags)
      setContentTypes(data.contentTypes)
      setPanelOpen(data.panelOpen)
      // Load single active filter (take first if array, or null)
      const saved = data.activeFilters
      setActiveTag(saved.length > 0 ? saved[0] : null)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AssignDetail>).detail
      if (!detail?.channelUrl) return
      setAssignChannel(detail)
      setAssignOpen(true)
    }

    window.addEventListener("ytx-open-assign", handler)
    return () => window.removeEventListener("ytx-open-assign", handler)
  }, [])

  useEffect(() => {
    saveData(tags, channelTags, contentTypes)
  }, [tags, channelTags, contentTypes])

  useEffect(() => {
    savePanelOpen(panelOpen)
  }, [panelOpen])

  useEffect(() => {
    const area = storageArea()
    if (area) {
      // Save as array for backwards compatibility
      area.set({ [ACTIVE_FILTERS_KEY]: activeTag ? [activeTag] : [] })
    }
  }, [activeTag])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ytx-filter-change", {
        detail: {
          activeTags: activeTag ? [activeTag] : [],
          channelTags,
          contentTypes,
        },
      })
    )
  }, [activeTag, channelTags, contentTypes])

  const toggleFilter = (id: string) => {
    setActiveTag((prev) => (prev === id ? null : id))
  }

  const toggleContentType = (key: keyof ContentTypeFilters) => {
    setContentTypes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const createTag = () => {
    const name = newTag.trim()
    if (!name) return
    const id = uniqueId(slugify(name), tags)
    setTags((prev) => [...prev, { id, name, color: "#ff4d5a" }])
    setNewTag("")
  }

  const deleteTag = (id: string) => {
    setTags((prev) => prev.filter((tag) => tag.id !== id))
    setChannelTags((prev) => {
      const next: ChannelTagMap = {}
      for (const [channel, tagIds] of Object.entries(prev)) {
        next[channel] = tagIds.filter((tagId) => tagId !== id)
      }
      return next
    })
  }

  const toggleAssign = (id: string) => {
    if (!assignChannel) return
    const key = normalizeChannelUrl(assignChannel.channelUrl)
    setChannelTags((prev) => {
      const current = prev[key] ?? []
      const updated = current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
      return { ...prev, [key]: updated }
    })
  }

  // Get currently assigned tags for the popover
  const assignedTags = useMemo(() => {
    if (!assignChannel) return []
    const key = normalizeChannelUrl(assignChannel.channelUrl)
    return channelTags[key] ?? []
  }, [assignChannel, channelTags])

  return (
    <>
      {!panelOpen ? (
        <Badge
          onClick={() => setPanelOpen(true)}
          size="default"
          variant="default"
          className="ytx-root gap-2 rounded-xl shadow-xl text-xl"
          title="Open subscription tags"
        >
          <PanelRightOpen className="size-5" />
          <span>Tags</span>
        </Badge>
      ) : (
        <Dialog open={panelOpen} onOpenChange={setPanelOpen} modal={false}>
          <DialogContent
            container={portalContainer}
            showOverlay={false}
            className="ytx-root fixed bottom-4 right-4 left-auto top-auto translate-x-0 translate-y-0"
          >
            <DialogTitle>Subscription Tags</DialogTitle>
            <div className="flex items-center justify-between w-full">
              <DialogDescription>Filter your feed by channel tags</DialogDescription>
              <Dialog open={manageOpen} onOpenChange={setManageOpen} modal={false}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Edit2Icon className="size-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent container={portalContainer} showOverlay={false}>
                  <DialogTitle>Manage tags</DialogTitle>
                  <DialogDescription>Create or delete tag names.</DialogDescription>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="New tag"
                      />
                      <Button onClick={createTag}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-1">
                          <Badge>{tag.name}</Badge>
                          <Button size="icon" variant="ghost" onClick={() => deleteTag(tag.id)}>
                            <X className="size-5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex w-full flex-wrap gap-2">
              {tags.map((tag) => (
                <button type="button" key={tag.id} onClick={() => toggleFilter(tag.id)}>
                  <Badge variant={activeTag === tag.id ? "active" : "default"}>{tag.name}</Badge>
                </button>
              ))}
            </div>

            <DialogDescription>Content:</DialogDescription>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["videos", "Videos"],
                  ["live", "Live"],
                  ["upcoming", "Upcoming"],
                  ["shorts", "Shorts"],
                ] as const
              ).map(([key, label]) => (
                <button type="button" key={key} onClick={() => toggleContentType(key)}>
                  <Badge variant={contentTypes[key] ? "active" : "default"}>{label}</Badge>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverAnchor
          style={{
            position: "fixed",
            left: assignChannel?.x ?? 0,
            top: assignChannel?.y ?? 0,
          }}
        />
        <PopoverContent
          ref={popoverRef}
          container={portalContainer}
          side="top"
          align="end"
          className="w-auto max-w-xs"
        >
          <div className="space-y-4">
            <p className="text-3xl font-semibold truncate">Assign Tags</p>
            <p className="text-xl text-[hsl(var(--muted-foreground))]">
              {assignChannel?.channelName}
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button type="button" key={tag.id} onClick={() => toggleAssign(tag.id)}>
                  <Badge variant={assignedTags.includes(tag.id) ? "active" : "default"}>
                    {tag.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
