import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

interface KumaMonitorStub {
  id: number
  name: string
}

interface KumaGroup {
  name: string
  monitorList?: KumaMonitorStub[]
}

interface KumaHeartbeat {
  status: number
  time: string
  msg: string
  ping: number | null
}

interface KumaHeartbeatResponse {
  heartbeatList: Record<number, KumaHeartbeat[] | undefined>
  uptimeList: Record<string, number | undefined>
}

interface KumaPageResponse {
  title?: string
  publicGroupList?: KumaGroup[]
}

export async function GET() {
  if (!config.kuma.enabled) {
    return NextResponse.json({ enabled: false, groups: [] })
  }

  const { baseUrl, slug } = config.kuma

  try {
    const [pageRes, heartbeatRes] = await Promise.all([
      fetch(`${baseUrl}/api/status-page/${slug}`, { cache: 'no-store' }),
      fetch(`${baseUrl}/api/status-page/heartbeat/${slug}`, { cache: 'no-store' }),
    ])

    if (!pageRes.ok || !heartbeatRes.ok) {
      throw new Error(`Kuma API error — page: ${pageRes.status}, heartbeat: ${heartbeatRes.status}`)
    }

    const page = (await pageRes.json()) as KumaPageResponse
    const heartbeat = (await heartbeatRes.json()) as KumaHeartbeatResponse

    const monitors = (page.publicGroupList ?? []).flatMap((group) =>
      (group.monitorList ?? []).map((m) => {
        const hbArr = heartbeat.heartbeatList[m.id] ?? []
        const hb = hbArr.length > 0
          ? hbArr.reduce((a, b) => (a.time >= b.time ? a : b))
          : null
        const uptime24 = heartbeat.uptimeList[`${m.id}_24`]
        return {
          id: m.id,
          name: m.name,
          group: group.name,
          status: hb?.status ?? -1,
          msg: hb?.msg ?? '',
          ping: hb?.ping ?? null,
          uptime24: uptime24 !== undefined ? Math.round(uptime24 * 100) : null,
          checkedAt: hb?.time ?? null,
        }
      })
    )

    return NextResponse.json({
      title: page.title ?? 'Status',
      monitors,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
