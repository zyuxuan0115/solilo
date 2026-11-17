import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccountsDialog } from './components/AccountsDialog'
import { ApiKeysEmbedDialog } from './components/ApiKeysEmbedDialog'
import { AuthScreen } from './components/AuthScreen'
import { Composer } from './components/Composer'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ImageLightboxDialog } from './components/ImageLightboxDialog'
import { TimelineItem } from './components/TimelineItem'
import {
  createCloudSoliloClient,
  createSandboxSoliloClient,
  type SoliloClient,
} from './lib/api'
import { getClientAuth, onAuthStateChanged, signOut, type User } from './lib/firebase'
import {
  applyThemeChoice,
  readStoredThemeChoice,
  subscribeThemeStorageSync,
  type ThemeChoice,
} from './lib/theme'
import { formatDayHeading, getLocalDayKey } from './lib/time'
import type {
  ApiKeyMetadata,
  ConnectedAccount,
  CreatePostInput,
  FediversePlatform,
  Post,
  PostMedia,
  UpdatePostInput,
} from './types/solilo'

type VisibilityFilter = 'all' | 'public' | 'private'

export function App() {
  const [authReady, setAuthReady] = useState(false)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [sandboxActive, setSandboxActive] = useState(false)

  const [posts, setPosts] = useState<Post[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyMetadata[]>([])
  const [filter, setFilter] = useState<VisibilityFilter>('all')

  const [accountsModalOpen, setAccountsModalOpen] = useState(false)
  const [preferredAccountPlatform, setPreferredAccountPlatform] =
    useState<FediversePlatform>('mastodon')
  const [embedModalOpen, setEmbedModalOpen] = useState(false)
  const [postPendingDelete, setPostPendingDelete] = useState<Post | null>(null)
  const [deletingPost, setDeletingPost] = useState(false)
  const [lightboxState, setLightboxState] = useState<{
    mediaList: PostMedia[]
    index: number
  } | null>(null)
  const [banner, setBanner] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => readStoredThemeChoice())

  useEffect(() => {
    return subscribeThemeStorageSync(setThemeChoice)
  }, [])

  function handleThemeChange(next: ThemeChoice) {
    setThemeChoice(next)
    applyThemeChoice(next)
  }

  useEffect(() => {
    const auth = getClientAuth()
    if (!auth) {
      setAuthReady(true)
      return
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      if (user) setSandboxActive(false)
      setAuthReady(true)
    })
    return unsub
  }, [])

  // Handle OAuth / MiAuth redirect query parameters (?connected=mastodon&acct=...)
  useEffect(() => {
    const url = new URL(window.location.href)
    const connected = url.searchParams.get('connected')
    if (!connected) return

    if (connected === 'error') {
      const reason = url.searchParams.get('reason') || '授权未完成'
      setBanner({ tone: 'error', text: `账号连接失败：${reason}` })
    } else {
      const acct = url.searchParams.get('acct') || connected
      setBanner({ tone: 'info', text: `已成功连接联邦宇宙账号 ${acct}` })
    }

    url.searchParams.delete('connected')
    url.searchParams.delete('acct')
    url.searchParams.delete('reason')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  }, [])

  const client: SoliloClient | null = useMemo(() => {
    if (firebaseUser) return createCloudSoliloClient()
    if (sandboxActive) return createSandboxSoliloClient()
    return null
  }, [firebaseUser, sandboxActive])

  const loadWorkspace = useCallback(async (activeClient: SoliloClient) => {
    setLoadingPosts(true)
    try {
      const [postPage, accList, keyList] = await Promise.all([
        activeClient.listPosts({ limit: 25 }),
        activeClient.listAccounts(),
        activeClient.listApiKeys(),
      ])
      setPosts(postPage.items)
      setNextCursor(postPage.nextCursor)
      setAccounts(accList)
      setApiKeys(keyList)
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : '加载时间线失败。',
      })
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  useEffect(() => {
    if (!client) {
      setPosts([])
      setAccounts([])
      setApiKeys([])
      setNextCursor(null)
      return
    }
    void loadWorkspace(client)
  }, [client, loadWorkspace])

  async function handleUploadMedia(file: File, alt?: string) {
    if (!client) throw new Error('未登录')
    return client.uploadMedia(file, alt)
  }

  async function handlePublish(input: CreatePostInput) {
    if (!client) return
    const created = await client.createPost(input)
    setPosts((prev) => [created, ...prev])
  }

  async function handleUpdatePost(id: string, patch: UpdatePostInput) {
    if (!client) return
    const updated = await client.updatePost(id, patch)
    setPosts((prev) => prev.map((item) => (item.id === id ? updated : item)))
  }

  async function handleRetryDelivery(postId: string, accountId: string): Promise<Post> {
    if (!client) throw new Error('未登录')
    const updated = await client.retryDelivery(postId, accountId)
    setPosts((prev) => prev.map((item) => (item.id === postId ? updated : item)))
    return updated
  }

  async function handleConfirmDeletePost() {
    if (!client || !postPendingDelete) return
    setDeletingPost(true)
    try {
      await client.deletePost(postPendingDelete.id)
      const removedId = postPendingDelete.id
      setPosts((prev) => prev.filter((item) => item.id !== removedId))
      setPostPendingDelete(null)
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : '删除失败。',
      })
    } finally {
      setDeletingPost(false)
    }
  }

  async function handleLoadMore() {
    if (!client || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await client.listPosts({ limit: 25, cursor: nextCursor })
      setPosts((prev) => [...prev, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof Error ? err.message : '加载更多记录失败。',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleConnectAccount(platform: FediversePlatform, instance: string) {
    if (!client) return
    const res = await client.startConnectAccount(platform, instance)
    if (res.authorizeUrl) {
      window.location.assign(res.authorizeUrl)
      return
    }
    if (res.sandboxAccount) {
      const added = res.sandboxAccount
      setAccounts((prev) => [...prev, added])
      setBanner({ tone: 'info', text: `已在本地预览中添加 ${added.acct}` })
    }
  }

  async function handleDisconnectAccount(accountId: string) {
    if (!client) return
    await client.deleteAccount(accountId)
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
  }

  async function handleCreateApiKey(input: { label: string; allowedOrigins: string[] }) {
    if (!client) throw new Error('未登录')
    const created = await client.createApiKey(input)
    const { rawKey: _ignored, ...meta } = created
    setApiKeys((prev) => [meta, ...prev])
    return created
  }

  async function handleRevokeApiKey(id: string) {
    if (!client) return
    await client.deleteApiKey(id)
    setApiKeys((prev) => prev.filter((k) => k.id !== id))
  }

  async function handleSignOut() {
    if (sandboxActive) {
      setSandboxActive(false)
      return
    }
    const auth = getClientAuth()
    if (auth) {
      await signOut(auth)
    }
  }

  const filteredPosts = useMemo(() => {
    if (filter === 'all') return posts
    return posts.filter((p) => p.visibility === filter)
  }, [posts, filter])

  const groupedDays = useMemo(() => {
    const groups: Array<{ dayKey: string; heading: string; items: Post[] }> = []
    for (const post of filteredPosts) {
      const dayKey = getLocalDayKey(post.createdAt)
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.dayKey === dayKey) {
        lastGroup.items.push(post)
      } else {
        groups.push({
          dayKey,
          heading: formatDayHeading(post.createdAt),
          items: [post],
        })
      }
    }
    return groups
  }, [filteredPosts])

  if (!authReady) {
    return (
      <div className="boot-screen" role="status">
        正在载入 Solilo…
      </div>
    )
  }

  if (!client) {
    return <AuthScreen onEnterSandbox={() => setSandboxActive(true)} />
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-brand">
          <span className="brand-mark" aria-hidden="true">
            ◌
          </span>
          <span className="brand-name">Solilo</span>
          {client.mode === 'sandbox' ? (
            <span className="mode-pill" title="数据仅保存在当前浏览器 localStorage">
              本地预览
            </span>
          ) : (
            <span className="user-email">{firebaseUser?.email}</span>
          )}
        </div>

        <nav className="top-bar-actions" aria-label="功能与设置">
          <button
            type="button"
            className="nav-btn"
            onClick={() => setAccountsModalOpen(true)}
          >
            联邦账号 ({accounts.length})
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={() => setEmbedModalOpen(true)}
          >
            设置
          </button>
          <button type="button" className="nav-btn subtle" onClick={() => void handleSignOut()}>
            {client.mode === 'sandbox' ? '退出预览' : '退出'}
          </button>
        </nav>
      </header>

      <main className="timeline-container">
        {banner ? (
          <div className={`status-banner ${banner.tone}`} role="status">
            <span>{banner.text}</span>
            <button
              type="button"
              className="text-link-btn"
              onClick={() => setBanner(null)}
            >
              关闭
            </button>
          </div>
        ) : null}

        <Composer
          accounts={accounts}
          onUploadMedia={handleUploadMedia}
          onPublish={handlePublish}
          onOpenAccounts={(plat) => {
            if (plat) setPreferredAccountPlatform(plat)
            setAccountsModalOpen(true)
          }}
        />

        <section className="timeline-section" aria-label="过往时间线">
          <div className="timeline-filter-bar">
            <h2 className="timeline-heading">过往记录</h2>
            <div className="filter-tabs" role="group" aria-label="按可见范围筛选">
              <button
                type="button"
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                全部 ({posts.length})
              </button>
              <button
                type="button"
                className={`filter-tab ${filter === 'public' ? 'active' : ''}`}
                aria-pressed={filter === 'public'}
                onClick={() => setFilter('public')}
              >
                公开 ({posts.filter((p) => p.visibility === 'public').length})
              </button>
              <button
                type="button"
                className={`filter-tab ${filter === 'private' ? 'active' : ''}`}
                aria-pressed={filter === 'private'}
                onClick={() => setFilter('private')}
              >
                私密 ({posts.filter((p) => p.visibility === 'private').length})
              </button>
            </div>
          </div>

          {loadingPosts ? (
            <p className="empty-timeline" role="status">
              正在读取你的过往时间线…
            </p>
          ) : groupedDays.length === 0 ? (
            <p className="empty-timeline">
              这里还很安静。写下第一句喃喃自语吧。
            </p>
          ) : (
            <div className="day-groups">
              {groupedDays.map((group) => (
                <section key={group.dayKey} className="day-group">
                  <h3 className="day-heading">{group.heading}</h3>
                  <div className="day-entries">
                    {group.items.map((post) => (
                      <TimelineItem
                        key={post.id}
                        post={post}
                        onUpdate={handleUpdatePost}
                        onRetryDelivery={handleRetryDelivery}
                        onRequestDelete={setPostPendingDelete}
                        onOpenMedia={(mediaList, index) =>
                          setLightboxState({ mediaList, index })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {nextCursor ? (
            <div className="load-more-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? '载入中…' : '载入更早的记录'}
              </button>
            </div>
          ) : null}
        </section>
      </main>

      <AccountsDialog
        open={accountsModalOpen}
        isSandbox={client.mode === 'sandbox'}
        accounts={accounts}
        initialPlatform={preferredAccountPlatform}
        onClose={() => setAccountsModalOpen(false)}
        onConnect={handleConnectAccount}
        onDisconnect={handleDisconnectAccount}
      />

      <ApiKeysEmbedDialog
        open={embedModalOpen}
        posts={posts}
        apiKeys={apiKeys}
        themeChoice={themeChoice}
        onChangeTheme={handleThemeChange}
        onClose={() => setEmbedModalOpen(false)}
        onCreateKey={handleCreateApiKey}
        onRevokeKey={handleRevokeApiKey}
      />

      <ImageLightboxDialog
        mediaList={lightboxState?.mediaList ?? null}
        activeIndex={lightboxState?.index ?? 0}
        onChangeIndex={(nextIndex) =>
          setLightboxState((prev) => (prev ? { ...prev, index: nextIndex } : null))
        }
        onClose={() => setLightboxState(null)}
      />

      <ConfirmDialog
        open={postPendingDelete !== null}
        title="删除这条记录？"
        description="删除后将从你的 Solilo 时间线、云存储及网站嵌入缓存中移除（已同步发送到 Mastodon / Misskey 的远端动态不会自动撤回）。"
        confirmLabel="确认删除"
        busy={deletingPost}
        onConfirm={() => void handleConfirmDeletePost()}
        onCancel={() => setPostPendingDelete(null)}
      />
    </div>
  )
}
