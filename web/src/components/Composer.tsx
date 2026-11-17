import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import {
  MAX_PHOTOS_PER_POST,
  MAX_PHOTO_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '../lib/api'
import type {
  ConnectedAccount,
  CreatePostInput,
  FediversePlatform,
  FediverseVisibility,
  PostMedia,
  SoliloVisibility,
} from '../types/solilo'
import { PlatformAccountDropdown } from './PlatformAccountDropdown'

interface PendingPhoto {
  localId: string
  file: File
  previewUrl: string
  alt: string
  uploadedMedia?: PostMedia
}

interface ComposerProps {
  accounts: ConnectedAccount[]
  onUploadMedia: (file: File, alt?: string) => Promise<PostMedia>
  onPublish: (input: CreatePostInput) => Promise<void>
  onOpenAccounts: (preferredPlatform?: FediversePlatform) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Composer({
  accounts,
  onUploadMedia,
  onPublish,
  onOpenAccounts,
}: ComposerProps) {
  const [content, setContent] = useState('')
  const [showCw, setShowCw] = useState(false)
  const [contentWarning, setContentWarning] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [visibility, setVisibility] = useState<SoliloVisibility>('public')
  const [fediverseVisibility, setFediverseVisibility] = useState<FediverseVisibility>('public')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [enterToSubmit, setEnterToSubmit] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastCompositionEndAtRef = useRef<number | null>(null)
  const pendingPhotosRef = useRef<PendingPhoto[]>(pendingPhotos)
  pendingPhotosRef.current = pendingPhotos

  const formHeadingId = useId()
  const contentId = useId()
  const cwId = useId()
  const fileInputId = useId()
  const enterModeId = useId()

  useEffect(() => {
    return () => {
      for (const item of pendingPhotosRef.current) {
        URL.revokeObjectURL(item.previewUrl)
      }
    }
  }, [])

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  function togglePlatformAll(platform: FediversePlatform, selectAll: boolean) {
    const platformIds = accounts
      .filter((acc) => acc.platform === platform)
      .map((acc) => acc.id)
    if (platformIds.length === 0) return

    setSelectedAccountIds((prev) => {
      const withoutPlatform = prev.filter((id) => !platformIds.includes(id))
      return selectAll ? [...withoutPlatform, ...platformIds] : withoutPlatform
    })
  }

  function addPhotoFiles(incomingFiles: File[]) {
    if (incomingFiles.length === 0) return

    const remainingSlots = MAX_PHOTOS_PER_POST - pendingPhotos.length
    if (remainingSlots <= 0) {
      setError(`按照 Mastodon 规则，每条动态最多只能上传 ${MAX_PHOTOS_PER_POST} 张照片。`)
      return
    }

    const accepted: PendingPhoto[] = []
    let notice: string | null = null

    for (const file of incomingFiles) {
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
        notice = '仅支持 JPEG、PNG、WebP 或 GIF 格式的图片。'
        continue
      }
      if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
        notice = '单张照片大小不能超过 10MB。'
        continue
      }
      if (accepted.length >= remainingSlots) {
        notice = `每条动态最多上传 ${MAX_PHOTOS_PER_POST} 张照片，多余的照片未添加。`
        break
      }

      accepted.push({
        localId: `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        alt: '',
      })
    }

    if (accepted.length > 0) {
      setPendingPhotos((prev) => [...prev, ...accepted])
    }
    setError(notice)
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : []
    addPhotoFiles(files)
    event.target.value = ''
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) {
      event.preventDefault()
      addPhotoFiles(files)
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      if (!dragActive) setDragActive(true)
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragActive(false)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) {
      event.preventDefault()
      addPhotoFiles(files)
    }
  }

  function handleRemovePhoto(localId: string) {
    setPendingPhotos((prev) => {
      const target = prev.find((item) => item.localId === localId)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((item) => item.localId !== localId)
    })
    if (error) setError(null)
  }

  function handleAltChange(localId: string, nextAlt: string) {
    setPendingPhotos((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, alt: nextAlt } : item)),
    )
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    lastCompositionEndAtRef.current = event.timeStamp
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd+Enter / Ctrl+Enter always submits cleanly without conflicting with IME
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      formRef.current?.requestSubmit()
      return
    }

    if (enterToSubmit && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      // Guard IME composition across Chromium, Firefox, and Safari (WebKit bug 165004)
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return
      }
      if (
        lastCompositionEndAtRef.current !== null &&
        Math.abs(event.timeStamp - lastCompositionEndAtRef.current) < 50
      ) {
        return
      }

      formRef.current?.requestSubmit()
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = content.trim()
    if (!trimmed && pendingPhotos.length === 0) {
      textareaRef.current?.focus()
      return
    }

    setError(null)
    setPublishing(true)
    try {
      let resolvedMedia: PostMedia[] = []
      if (pendingPhotos.length > 0) {
        setUploadingPhotos(true)
        try {
          const uploadedResults = await Promise.all(
            pendingPhotos.map(async (item) => {
              if (item.uploadedMedia) return item.uploadedMedia
              const media = await onUploadMedia(item.file, item.alt)
              return media
            }),
          )
          resolvedMedia = uploadedResults
          setPendingPhotos((prev) =>
            prev.map((item, idx) => ({
              ...item,
              uploadedMedia: uploadedResults[idx] ?? item.uploadedMedia,
            })),
          )
        } finally {
          setUploadingPhotos(false)
        }
      }

      const validIds = selectedAccountIds.filter((id) => accounts.some((acc) => acc.id === id))
      await onPublish({
        content: trimmed,
        contentWarning: showCw && contentWarning.trim() ? contentWarning.trim() : null,
        visibility,
        fediverseVisibility,
        media: resolvedMedia.map((media, idx) => ({
          id: media.id,
          alt: pendingPhotos[idx]?.alt.trim() || null,
        })),
        accountIds: validIds,
      })

      for (const item of pendingPhotos) {
        URL.revokeObjectURL(item.previewUrl)
      }
      setPendingPhotos([])
      setContent('')
      setContentWarning('')
      setShowCw(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试。')
    } finally {
      setPublishing(false)
    }
  }

  const activeSelectedCount = selectedAccountIds.filter((id) =>
    accounts.some((acc) => acc.id === id),
  ).length

  return (
    <section
      className={`composer-card ${dragActive ? 'drag-active' : ''}`}
      aria-labelledby={formHeadingId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <form ref={formRef} method="post" action="/apps/solilo/api/posts" onSubmit={handleSubmit}>
        <div className="composer-top-row">
          <label htmlFor={contentId} id={formHeadingId} className="composer-label">
            写下此刻的喃喃自语
          </label>
          <div className="composer-top-tools">
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="visually-hidden"
              disabled={publishing || pendingPhotos.length >= MAX_PHOTOS_PER_POST}
              onChange={handleFileInputChange}
            />
            <button
              type="button"
              className="chip-toggle-btn"
              disabled={publishing || pendingPhotos.length >= MAX_PHOTOS_PER_POST}
              onClick={() => fileInputRef.current?.click()}
            >
              ＋ 照片 ({pendingPhotos.length}/{MAX_PHOTOS_PER_POST})
            </button>
            <button
              type="button"
              className="chip-toggle-btn"
              aria-expanded={showCw}
              aria-controls={cwId}
              onClick={() => setShowCw((prev) => !prev)}
            >
              {showCw ? '移除折叠提示 (CW)' : '＋ 折叠提示 (CW)'}
            </button>
          </div>
        </div>

        {showCw ? (
          <div className="cw-field-wrap">
            <label htmlFor={cwId} className="visually-hidden">
              内容折叠提示（CW）
            </label>
            <input
              id={cwId}
              name="contentWarning"
              type="text"
              maxLength={500}
              value={contentWarning}
              onChange={(e) => setContentWarning(e.target.value)}
              placeholder="折叠摘要（例如：剧透 / 深夜碎碎念）"
              className="cw-input"
            />
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          id={contentId}
          name="content"
          required={pendingPhotos.length === 0}
          maxLength={500}
          value={content}
          onPaste={handlePaste}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            setContent(e.target.value)
            if (error) setError(null)
          }}
          placeholder="今天想对自己记下什么？支持粘贴或拖入最多 4 张照片…"
          className="composer-textarea"
        />

        {pendingPhotos.length > 0 ? (
          <ul className="pending-photo-list" aria-label="待发送照片">
            {pendingPhotos.map((photo, index) => {
              const altInputId = `alt-${photo.localId}`
              return (
                <li key={photo.localId} className="pending-photo-card">
                  <div className="pending-photo-preview-wrap">
                    <img
                      src={photo.previewUrl}
                      alt={photo.alt || `待上传的第 ${index + 1} 张照片`}
                      className="pending-photo-thumb"
                    />
                    <span className="pending-photo-size">{formatFileSize(photo.file.size)}</span>
                    <button
                      type="button"
                      className="pending-photo-remove-btn"
                      aria-label={`移除第 ${index + 1} 张照片`}
                      disabled={publishing}
                      onClick={() => handleRemovePhoto(photo.localId)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="pending-photo-alt-wrap">
                    <label htmlFor={altInputId} className="visually-hidden">
                      第 {index + 1} 张照片的无障碍描述（Alt）
                    </label>
                    <input
                      id={altInputId}
                      type="text"
                      maxLength={1500}
                      value={photo.alt}
                      disabled={publishing}
                      onChange={(e) => handleAltChange(photo.localId, e.target.value)}
                      placeholder="图片描述 Alt（可选，同步至 Mastodon / Misskey）"
                      className="pending-photo-alt-input"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="composer-controls">
          <fieldset className="inline-fieldset">
            <legend>Solilo 留存状态</legend>
            <div className="radio-pill-group">
              <span className="radio-pill">
                <input
                  type="radio"
                  id="vis-public"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />
                <label htmlFor="vis-public">公开（允许网站 API 调取）</label>
              </span>
              <span className="radio-pill">
                <input
                  type="radio"
                  id="vis-private"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                <label htmlFor="vis-private">私密（仅自己可见）</label>
              </span>
            </div>
          </fieldset>

          <fieldset className="inline-fieldset">
            <legend>同步发往联邦宇宙（直接勾选全选平台，展开可单选账号）</legend>
            <div className="fediverse-dropdown-row">
              <PlatformAccountDropdown
                platform="mastodon"
                accounts={accounts.filter((acc) => acc.platform === 'mastodon')}
                selectedAccountIds={selectedAccountIds}
                disabled={publishing}
                onTogglePlatformAll={togglePlatformAll}
                onToggleSingleAccount={toggleAccount}
                onRequestConnect={(plat) => onOpenAccounts(plat)}
              />
              <PlatformAccountDropdown
                platform="misskey"
                accounts={accounts.filter((acc) => acc.platform === 'misskey')}
                selectedAccountIds={selectedAccountIds}
                disabled={publishing}
                onTogglePlatformAll={togglePlatformAll}
                onToggleSingleAccount={toggleAccount}
                onRequestConnect={(plat) => onOpenAccounts(plat)}
              />
            </div>
          </fieldset>

          {activeSelectedCount > 0 ? (
            <fieldset className="inline-fieldset">
              <legend>外部实例可见性</legend>
              <div className="radio-pill-group">
                <span className="radio-pill">
                  <input
                    type="radio"
                    id="fedi-public"
                    name="fediverseVisibility"
                    value="public"
                    checked={fediverseVisibility === 'public'}
                    onChange={() => setFediverseVisibility('public')}
                  />
                  <label htmlFor="fedi-public">公开时间轴</label>
                </span>
                <span className="radio-pill">
                  <input
                    type="radio"
                    id="fedi-unlisted"
                    name="fediverseVisibility"
                    value="unlisted"
                    checked={fediverseVisibility === 'unlisted'}
                    onChange={() => setFediverseVisibility('unlisted')}
                  />
                  <label htmlFor="fedi-unlisted">静默公开 (Unlisted / Home)</label>
                </span>
                <span className="radio-pill">
                  <input
                    type="radio"
                    id="fedi-followers"
                    name="fediverseVisibility"
                    value="followers"
                    checked={fediverseVisibility === 'followers'}
                    onChange={() => setFediverseVisibility('followers')}
                  />
                  <label htmlFor="fedi-followers">仅关注者</label>
                </span>
              </div>
            </fieldset>
          ) : null}
        </div>

        <div role="status" aria-live="polite" className="form-error-slot">
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="composer-footer">
          <div className="composer-meta-left">
            <span className="char-counter">{content.length} / 500</span>
            <span className="enter-check-wrap">
              <input
                type="checkbox"
                id={enterModeId}
                name="enterToSubmit"
                checked={enterToSubmit}
                onChange={(e) => setEnterToSubmit(e.target.checked)}
              />
              <label htmlFor={enterModeId}>Enter 发送</label>
            </span>
          </div>

          <button type="submit" className="btn btn-primary" disabled={publishing}>
            {uploadingPhotos
              ? '上传照片中…'
              : publishing
                ? '发送中…'
                : activeSelectedCount > 0
                  ? `记录并同步 (${activeSelectedCount})`
                  : '记入时间线'}
          </button>
        </div>
      </form>
    </section>
  )
}
