import { useEffect, useMemo, useState } from "react"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
  { id: "tech", name: "Tech", color: "#30c4ff" },
]

const TAGS_KEY = "ytx_tags"
const CHANNEL_TAGS_KEY = "ytx_channel_tags"
const CONTENT_TYPES_KEY = "ytx_content_types"

function storageArea() {
  if (typeof chrome !== "undefined" && chrome.storage?.sync) return chrome.storage.sync
  if (typeof chrome !== "undefined" && chrome.storage?.local) return chrome.storage.local
  return null
}

async function loadData(): Promise<{
  tags: Tag[]
  channelTags: ChannelTagMap
  contentTypes: ContentTypeFilters
}> {
  const area = storageArea()
  if (!area) {
    return { tags: DEFAULT_TAGS, channelTags: {}, contentTypes: DEFAULT_CONTENT_TYPES }
  }

  const result = await area.get([TAGS_KEY, CHANNEL_TAGS_KEY, CONTENT_TYPES_KEY])
  const tags = (result[TAGS_KEY] as Tag[] | undefined) ?? DEFAULT_TAGS
  const channelTags = (result[CHANNEL_TAGS_KEY] as ChannelTagMap | undefined) ?? {}
  const contentTypes =
    (result[CONTENT_TYPES_KEY] as ContentTypeFilters | undefined) ?? DEFAULT_CONTENT_TYPES
  return { tags, channelTags, contentTypes }
}

async function saveData(tags: Tag[], channelTags: ChannelTagMap, contentTypes: ContentTypeFilters) {
  const area = storageArea()
  if (!area) return
  await area.set({
    [TAGS_KEY]: tags,
    [CHANNEL_TAGS_KEY]: channelTags,
    [CONTENT_TYPES_KEY]: contentTypes,
  })
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
    <div className="ytx-root w-[280px] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-[hsl(var(--foreground))] shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Subscription Tags</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Filter your feed by channel tags
          </div>
        </div>
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />
      </div>

      <div className="mb-3 flex gap-2">
        <Dialog open={manageOpen} onOpenChange={setManageOpen} modal={false}>
          <DialogTrigger asChild>
            <Button size="sm">Manage</Button>
          </DialogTrigger>
          <DialogContent container={portalContainer}>
            <DialogHeader>
              <DialogTitle>Manage tags</DialogTitle>
              <DialogDescription>Create or delete tag names.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="New tag"
                />
                <Button onClick={createTag} size="sm">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-1">
                    <Badge>{tag.name}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTag(tag.id)}
                    >
                      x
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="secondary" size="sm" onClick={() => setActive([])}>
          Reset
        </Button>
      </div>

      <div className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">
        Active filters: {activeCount || "None"}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(filtered.length ? filtered : tags).map((tag) => (
          <button type="button" key={tag.id} onClick={() => toggleFilter(tag.id)}>
            <Badge
              variant={active.includes(tag.id) ? "active" : "default"}
              className="cursor-pointer"
            >
              {tag.name}
            </Badge>
          </button>
        ))}
      </div>

      <div className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">Content:</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["shorts", "Shorts"],
            ["videos", "Videos"],
            ["live", "Live"],
            ["upcoming", "Upcoming"],
          ] as const
        ).map(([key, label]) => (
          <button type="button" key={key} onClick={() => toggleContentType(key)}>
            <Badge variant={contentTypes[key] ? "active" : "default"} className="cursor-pointer">
              {label}
            </Badge>
          </button>
        ))}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen} modal={false}>
        <DialogContent container={portalContainer}>
          <DialogHeader>
            <DialogTitle>Add to tags</DialogTitle>
            <DialogDescription>
              {assignChannel
                ? `Channel: ${assignChannel.channelName}`
                : "Choose tags for this channel."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button type="button" key={tag.id} onClick={() => toggleAssign(tag.id)}>
                  <Badge
                    variant={assignSelection.includes(tag.id) ? "active" : "default"}
                    className="cursor-pointer"
                  >
                    {tag.name}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveAssign}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
