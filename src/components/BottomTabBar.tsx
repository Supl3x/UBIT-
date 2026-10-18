import { Link, useLocation } from 'react-router-dom'
import { useStore, type Role } from '../store'
import { t } from '../i18n'
import { useFieldQueue } from '../lib/fieldQueue'

interface TabItem { key: string; path: string; icon: string; badge?: number }

const ROLE_TABS: Record<Role, TabItem[]> = {
  coordinator: [],
  volunteer: [
    { key: 'tasks', path: '/field/tasks', icon: 'checklist' },
    { key: 'detail', path: '/field/tasks', icon: 'near_me' },
    { key: 'buddy', path: '/field/buddy', icon: 'volunteer_activism' },
    { key: 'sync', path: '/field/sync', icon: 'sync' },
    { key: 'communityShort', path: '/community-shelters', icon: 'volunteer_activism' },
  ],
  registrar: [
    { key: 'register', path: '/register', icon: 'app_registration' },
    { key: 'communityShort', path: '/community-shelters', icon: 'volunteer_activism' },
  ],
  shelter: [
    { key: 'shelter', path: '/shelter', icon: 'night_shelter' },
    { key: 'communityShort', path: '/community-shelters', icon: 'volunteer_activism' },
  ],
  viewer: [],
}

export default function BottomTabBar() {
  const user = useStore((s) => s.user)
  const language = useStore((s) => s.language)
  const loc = useLocation()
  const { list } = useFieldQueue()
  const queued = useStore((s) => s.syncItems.filter((i) => i.status !== 'synced').length)
  if (!user) return null
  const items = (ROLE_TABS[user.role] || []).map((it) => {
    if (it.key === 'detail') return { ...it, path: list[0] ? `/field/task/${list[0].c.id}` : '/field/tasks' }
    if (it.key === 'sync') return { ...it, badge: queued || undefined }
    return it
  })
  if (items.length === 0) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
      <div className="h-20 px-space-xs flex items-center justify-around">
        {items.map((item) => {
          const active = item.key === 'detail' ? loc.pathname.startsWith('/field/task/') : loc.pathname === item.path
          return (
            <Link key={item.key} to={item.path}
              className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] w-20 py-1 rounded-xl transition-all ${active ? 'text-primary font-bold scale-105' : 'text-on-surface-variant'}`}>
              <div className="relative">
                <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
                {item.badge && (
                  <span className="absolute -top-1 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-container text-on-primary font-telemetry-sm text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(242,169,59,0.6)]">{item.badge}</span>
                )}
              </div>
              <span className={`font-body-sm text-body-sm mt-0.5 leading-none ${language === 'ur' ? 'font-urdu-body' : ''}`}>{t(item.key as any, language)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
