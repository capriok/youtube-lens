import { PanelRightOpen, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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
}

const DEFAULT_TAGS: Tag[] = [
  { id: "racing", name: "Racing", color: "#7a5cff" },
  { id: "games", name: "Games", color: "#30c4ff" },
]

const TAGS_KEY = "ytx_tags"
const CHANNEL_TAGS_KEY = "ytx_channel_tags"
const CONTENT_TYPES_KEY = "ytx_content_types"
const PANEL_OPEN_KEY = "ytx_panel_open"

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
}> {
  const area = storageArea()
  if (!area) {
    return {
      tags: DEFAULT_TAGS,
      channelTags: {},
      contentTypes: DEFAULT_CONTENT_TYPES,
      panelOpen: true,
    }
  }

  const result = await area.get([TAGS_KEY, CHANNEL_TAGS_KEY, CONTENT_TYPES_KEY, PANEL_OPEN_KEY])
  const tags = (result[TAGS_KEY] as Tag[] | undefined) ?? DEFAULT_TAGS
  const channelTags = (result[CHANNEL_TAGS_KEY] as ChannelTagMap | undefined) ?? {}
  const contentTypes =
    (result[CONTENT_TYPES_KEY] as ContentTypeFilters | undefined) ?? DEFAULT_CONTENT_TYPES
  const panelOpen = (result[PANEL_OPEN_KEY] as boolean | undefined) ?? true
  return { tags, channelTags, contentTypes, panelOpen }
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
  const [active, setActive] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [channelTags, setChannelTags] = useState<ChannelTagMap>({})
  const [contentTypes, setContentTypes] = useState<ContentTypeFilters>(DEFAULT_CONTENT_TYPES)

  const [panelOpen, setPanelOpen] = useState(true)
  const [manageOpen, setManageOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignChannel, setAssignChannel] = useState<AssignDetail | null>(null)
  const [assignSelection, setAssignSelection] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    loadData().then((data) => {
      if (!mounted) return
      setTags(data.tags)
      setChannelTags(data.channelTags)
      setContentTypes(data.contentTypes)
      setPanelOpen(data.panelOpen)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AssignDetail>).detail
      if (!detail?.channelUrl) return
      const key = normalizeChannelUrl(detail.channelUrl)
      const assigned = channelTags[key] ?? channelTags[detail.channelUrl] ?? []
      setAssignChannel(detail)
      setAssignSelection(assigned)
      setAssignOpen(true)
    }

    window.addEventListener("ytx-open-assign", handler)
    return () => window.removeEventListener("ytx-open-assign", handler)
  }, [channelTags])

  useEffect(() => {
    saveData(tags, channelTags, contentTypes)
  }, [tags, channelTags, contentTypes])

  useEffect(() => {
    savePanelOpen(panelOpen)
  }, [panelOpen])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ytx-filter-change", {
        detail: {
          activeTags: active,
          channelTags,
          contentTypes,
        },
      })
    )
  }, [active, channelTags, contentTypes])

  const activeCount = active.length
  const filtered = useMemo(() => {
    if (!active.length) return tags
    return tags.filter((tag) => active.includes(tag.id))
  }, [active, tags])

  const toggleFilter = (id: string) => {
    setActive((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
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
    setAssignSelection((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const saveAssign = () => {
    if (!assignChannel) return
    const key = normalizeChannelUrl(assignChannel.channelUrl)
    setChannelTags((prev) => ({
      ...prev,
      [key]: assignSelection,
    }))
    setAssignOpen(false)
  }

  return (
    <>
      {!panelOpen ? (
        <Button
          onClick={() => setPanelOpen(true)}
          size="lg"
          variant="secondary"
          className="ytx-root gap-2.5 rounded-xl shadow-xl"
          title="Open subscription tags"
        >
          <PanelRightOpen className="h-5 w-5" />
          <span>Tags</span>
        </Button>
      ) : (
        <Dialog open={panelOpen} onOpenChange={setPanelOpen} modal={false}>
          <DialogContent
            container={portalContainer}
            showOverlay={false}
            className="ytx-root fixed bottom-4 right-4 left-auto top-auto translate-x-0 translate-y-0"
          >
            <DialogTitle>Subscription Tags</DialogTitle>
            <DialogDescription>Filter your feed by channel tags</DialogDescription>

            <div className="mb-5 flex gap-3">
              <Dialog open={manageOpen} onOpenChange={setManageOpen} modal={false}>
                <DialogTrigger asChild>
                  <Button>Manage</Button>
                </DialogTrigger>
                <DialogContent container={portalContainer} showOverlay={false}>
                  <DialogTitle>Manage tags</DialogTitle>
                  <DialogDescription>Create or delete tag names.</DialogDescription>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="New tag"
                      />
                      <Button onClick={createTag}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {tags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-1">
                          <Badge>{tag.name}</Badge>
                          <Button size="icon" variant="ghost" onClick={() => deleteTag(tag.id)}>
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="secondary" onClick={() => setActive([])}>
                Reset
              </Button>
            </div>

            <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">
              Active filters: {activeCount || "None"}
            </p>
            <div className="mb-5 flex flex-wrap gap-3">
              {(filtered.length ? filtered : tags).map((tag) => (
                <button type="button" key={tag.id} onClick={() => toggleFilter(tag.id)}>
                  <Badge variant={active.includes(tag.id) ? "active" : "default"}>{tag.name}</Badge>
                </button>
              ))}
            </div>

            <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">Content:</p>
            <div className="flex flex-wrap gap-3">
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

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent container={portalContainer}>
          <DialogTitle>Add to tags</DialogTitle>
          <DialogDescription>
            {assignChannel
              ? `Channel: ${assignChannel.channelName}`
              : "Choose tags for this channel."}
          </DialogDescription>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {tags.map((tag) => (
                <button type="button" key={tag.id} onClick={() => toggleAssign(tag.id)}>
                  <Badge variant={assignSelection.includes(tag.id) ? "active" : "default"}>
                    {tag.name}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveAssign}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
