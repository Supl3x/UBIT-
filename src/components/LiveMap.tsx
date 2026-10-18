import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore, type Assignment, type Case } from '../store'
import type { MapAsset, MapSensor } from '../lib/db'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import { AREA_CENTER, circlePolygon, KARACHI_CENTER } from '../lib/geo'

/**
 * Real map (MapLibre GL). No API key is needed with the default basemap (CARTO raster tiles built on OpenStreetMap).
 * To use your own provider set VITE_MAP_STYLE_URL (and VITE_MAP_API_KEY if the URL contains {key}).
 */

export interface LiveMapHandle {
  zoomIn: () => void
  zoomOut: () => void
  recenter: () => void
}

interface Props {
  cases: Case[]
  assets?: MapAsset[]
  sensors?: MapSensor[]
  assignments?: Assignment[]
  /** Restrict the view to one area (lyari, malir, korangi...). */
  area?: string | null
  focusCaseId?: string | null
  /** 'tier' colours by priority tier; 'confidence' colours by data confidence (the data-quality view). */
  mode?: 'tier' | 'confidence'
  showAssets?: boolean
  showFlood?: boolean
  /** A point to draw a route from (for example the volunteer's GPS) to the focused case. */
  routeFrom?: [number, number] | null
  pitch?: number
  className?: string
  onSelectCase?: (id: string) => void
}

const TIER_COLOR = ['#e5533d', '#f2a93b', '#65d9c5'] // tier 1, 2, 3
const UNKNOWN_COLOR = '#9e8e7c'

function baseStyle(theme: 'dark' | 'light'): maplibregl.StyleSpecification | string {
  const custom = import.meta.env.VITE_MAP_STYLE_URL as string | undefined
  if (custom) return custom.replace('{key}', (import.meta.env.VITE_MAP_API_KEY as string | undefined) || '')
  const path = theme === 'dark' ? 'dark_all' : 'rastertiles/voyager'
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': theme === 'dark' ? '#0b1a1f' : '#e9eef0' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  }
}

const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

function confidenceColor(c?: number) {
  if (c == null) return UNKNOWN_COLOR
  return c < 50 ? '#e5533d' : c < 75 ? '#f2a93b' : '#65d9c5'
}

const LiveMap = forwardRef<LiveMapHandle, Props>(function LiveMap(props, ref) {
  const {
    cases, assets = [], sensors = [], assignments = [], area = null, focusCaseId = null, mode = 'tier',
    showAssets = true, showFlood = true, routeFrom = null, pitch = 35, className = '', onSelectCase,
  } = props
  const theme = useStore((s) => s.theme)
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const pending = useRef<Array<() => void>>([])
  const whenReady = (fn: () => void) => {
    if (readyRef.current) fn()
    else pending.current.push(fn)
  }
  const markers = useRef<maplibregl.Marker[]>([])
  const selectRef = useRef(onSelectCase)
  selectRef.current = onSelectCase

  const visible = useMemo(() => (area ? cases.filter((c) => c.area === area) : cases), [cases, area])

  // ---- data -> GeoJSON
  const caseData = useMemo(
    () =>
      fc(
        visible
          .filter((c) => c.lat != null && c.lng != null && c.status !== 'safe')
          .map((c) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lng!, c.lat!] },
            properties: {
              id: c.id, name: c.name, nameUrdu: c.nameUrdu, tier: c.tier, risk: c.risk, unknown: !!c.unknown,
              location: c.location, vulnerability: c.vulnerability, age: c.age, confidence: c.confidence ?? null,
              approx: c.hideExact || c.exactLocation === false,
              color: mode === 'confidence' ? confidenceColor(c.confidence) : c.unknown ? UNKNOWN_COLOR : TIER_COLOR[c.tier - 1],
            },
          })),
      ),
    [visible, mode],
  )

  const floodData = useMemo(
    () => fc(!showFlood ? [] : sensors.map((s) => ({ ...circlePolygon([s.lng, s.lat], 0.5 + Math.max(0, s.reading) * 0.35), properties: { name: s.name, reading: s.reading } }))),
    [sensors, showFlood],
  )

  const routeData = useMemo(() => {
    const feats: Feature[] = []
    const byId = new Map(assets.map((a) => [a.id, a]))
    const byCase = new Map(cases.map((c) => [c.id, c]))
    for (const a of assignments) {
      const asset = a.assetId ? byId.get(a.assetId) : undefined
      const c = byCase.get(a.caseId)
      if (!asset || !c || c.lat == null || c.lng == null) continue
      if (area && c.area !== area) continue
      feats.push({
        type: 'Feature',
        properties: { status: a.status, label: `${a.assetLabel} to ${a.caseName}, ETA ${a.etaMin} min` },
        geometry: { type: 'LineString', coordinates: [[asset.lng, asset.lat], [c.lng, c.lat]] },
      })
    }
    const f = focusCaseId ? cases.find((c) => c.id === focusCaseId) : undefined
    if (routeFrom && f && f.lat != null && f.lng != null) {
      feats.push({ type: 'Feature', properties: { status: 'you', label: 'Your route' }, geometry: { type: 'LineString', coordinates: [routeFrom, [f.lng, f.lat]] } })
    }
    return fc(feats)
  }, [assignments, assets, cases, area, routeFrom, focusCaseId])

  // ---- create the map (re-created when the theme changes so the basemap matches)
  useEffect(() => {
    if (!el.current) return
    readyRef.current = false
    pending.current = []
    const map = new maplibregl.Map({
      container: el.current,
      style: baseStyle(theme),
      center: KARACHI_CENTER,
      zoom: 10.6,
      pitch,
      bearing: pitch ? -8 : 0,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')

    map.on('load', () => {
      map.addSource('flood', { type: 'geojson', data: fc([]) })
      map.addSource('routes', { type: 'geojson', data: fc([]) })
      map.addSource('cases', { type: 'geojson', data: fc([]) })

      map.addLayer({ id: 'flood-fill', type: 'fill', source: 'flood', paint: { 'fill-color': '#1da290', 'fill-opacity': 0.28 } })
      map.addLayer({ id: 'flood-line', type: 'line', source: 'flood', paint: { 'line-color': '#65d9c5', 'line-width': 1.5, 'line-dasharray': [3, 2] } })
      map.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'status'], 'dispatched', '#65d9c5', 'approved', '#f2a93b', 'you', '#ffffff', '#9e8e7c'],
          'line-width': 3, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9,
        },
      })
      // Tier 1 glow, then the dots. Unknown welfare gets a dashed-look ring so it never reads as "safe".
      map.addLayer({ id: 'cases-glow', type: 'circle', source: 'cases', filter: ['all', ['==', ['get', 'tier'], 1], ['!', ['get', 'unknown']]], paint: { 'circle-radius': 18, 'circle-color': '#e5533d', 'circle-opacity': 0.25, 'circle-blur': 0.7 } })
      map.addLayer({ id: 'cases-unknown-ring', type: 'circle', source: 'cases', filter: ['get', 'unknown'], paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': UNKNOWN_COLOR, 'circle-stroke-width': 2.5, 'circle-stroke-opacity': 0.9 } })
      map.addLayer({
        id: 'cases', type: 'circle', source: 'cases',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'tier'], 1, 6, 2, 5, 4], 14, ['match', ['get', 'tier'], 1, 11, 2, 9, 7]],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['get', 'unknown'], 0.6, 1],
          'circle-stroke-color': '#0b1a1f',
          'circle-stroke-width': 1.5,
        },
      })

      map.on('mouseenter', 'cases', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'cases', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'cases', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as Record<string, unknown>
        const node = document.createElement('div')
        node.style.cssText = 'font:12px Inter,sans-serif;color:#0b1a1f;min-width:190px'
        const line = (txt: string, style = '') => {
          const d = document.createElement('div')
          d.textContent = txt
          if (style) d.style.cssText = style
          node.appendChild(d)
        }
        line(`${p.unknown ? 'Unknown welfare' : `Tier ${p.tier}`} / Risk ${Number(p.risk).toFixed(1)}`, 'font-weight:700')
        line(`${p.name}${p.nameUrdu ? ` / ${p.nameUrdu}` : ''}`, 'font-weight:600;margin-top:2px')
        line(`${p.location}${p.age ? `, age ${p.age}` : ''}`)
        if (p.vulnerability) line(String(p.vulnerability), 'color:#93000a;margin-top:2px')
        if (p.confidence !== null && p.confidence !== undefined && p.confidence !== 'null') line(`Confidence ${Number(p.confidence).toFixed(0)}%`, 'margin-top:2px')
        if (p.approx === true || p.approx === 'true') line('Location approximate (privacy)', 'color:#6b6b6b;font-style:italic')
        if (selectRef.current) {
          const b = document.createElement('button')
          b.textContent = 'Open case'
          b.style.cssText = 'margin-top:6px;padding:4px 10px;border:0;border-radius:6px;background:#f2a93b;color:#2b1a00;font-weight:700;cursor:pointer'
          b.onclick = () => selectRef.current?.(String(p.id))
          node.appendChild(b)
        }
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .setDOMContent(node)
          .addTo(map)
      })
      readyRef.current = true
      const queued = pending.current
      pending.current = []
      queued.forEach((fn) => fn())
    })

    return () => {
      markers.current.forEach((m) => m.remove())
      markers.current = []
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, pitch])

  // ---- push data into the sources whenever it changes (and once the map is ready)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      ;(map.getSource('cases') as maplibregl.GeoJSONSource | undefined)?.setData(caseData)
      ;(map.getSource('flood') as maplibregl.GeoJSONSource | undefined)?.setData(floodData)
      ;(map.getSource('routes') as maplibregl.GeoJSONSource | undefined)?.setData(routeData)
    }
    whenReady(apply)
  }, [caseData, floodData, routeData, theme, pitch])

  // ---- rescue assets as DOM markers (few of them, and they get icons + labels)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      markers.current.forEach((m) => m.remove())
      markers.current = []
      if (!showAssets) return
      const icon = { boat: 'directions_boat', ambulance: 'emergency', team: 'groups' } as const
      for (const a of assets) {
        const node = document.createElement('div')
        node.title = `${a.name}${a.available ? '' : ' (deployed)'}`
        node.style.cssText = `width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.5);background:${a.available ? '#1da290' : '#6b6b6b'};color:#fff;border:2px solid #0b1a1f`
        const i = document.createElement('span')
        i.className = 'material-symbols-outlined'
        i.style.fontSize = '17px'
        i.textContent = icon[a.type]
        node.appendChild(i)
        markers.current.push(new maplibregl.Marker({ element: node }).setLngLat([a.lng, a.lat]).addTo(map))
      }
      for (const s of sensors) {
        const node = document.createElement('div')
        node.title = `${s.name}: ${s.reading} (${s.metric})`
        node.style.cssText = 'padding:2px 6px;border-radius:6px;background:#0b1a1f;color:#65d9c5;font:700 10px "JetBrains Mono",monospace;border:1px solid #65d9c5;white-space:nowrap'
        node.textContent = `${s.metric.includes('water') ? 'Water' : s.metric} ${s.reading}${s.metric.includes('_m') ? ' m' : ''}`
        markers.current.push(new maplibregl.Marker({ element: node, offset: [0, -22] }).setLngLat([s.lng, s.lat]).addTo(map))
      }
    }
    whenReady(draw)
  }, [assets, sensors, showAssets, theme, pitch])

  const fit = (animate = true) => {
    const map = mapRef.current
    if (!map) return
    const pts = (visible.filter((c) => c.lat != null && c.lng != null && c.status !== 'safe')).map((c) => [c.lng!, c.lat!] as [number, number])
    if (area && AREA_CENTER[area] && pts.length === 0) {
      map.easeTo({ center: AREA_CENTER[area], zoom: 12.5, duration: animate ? 600 : 0 })
      return
    }
    if (!pts.length) {
      map.easeTo({ center: KARACHI_CENTER, zoom: 10.6, duration: animate ? 600 : 0 })
      return
    }
    const b = new maplibregl.LngLatBounds(pts[0], pts[0])
    pts.forEach((p) => b.extend(p))
    map.fitBounds(b, { padding: 60, maxZoom: area ? 13.5 : 12, duration: animate ? 700 : 0 })
  }

  // Re-frame when the area filter changes or data first arrives.
  const framed = useRef('')
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const key = `${area || 'all'}:${visible.length > 0}:${theme}:${pitch}`
    if (framed.current === key) return
    const go = () => {
      framed.current = key
      if (!focusCaseId) fit(false)
    }
    whenReady(go)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, visible.length > 0, theme, pitch])

  // Fly to the focused case (field app, drawer).
  useEffect(() => {
    const map = mapRef.current
    const c = focusCaseId ? cases.find((x) => x.id === focusCaseId) : undefined
    if (!map || !c || c.lat == null || c.lng == null) return
    const go = () => {
      if (routeFrom) {
        const b = new maplibregl.LngLatBounds(routeFrom, [c.lng!, c.lat!])
        map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 600 })
      } else {
        map.flyTo({ center: [c.lng!, c.lat!], zoom: 14.5, duration: 700 })
      }
    }
    whenReady(go)
  }, [focusCaseId, cases.length, routeFrom, theme, pitch]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    recenter: () => fit(true),
  }))

  return <div ref={el} className={`w-full h-full ${className}`} />
})

export default LiveMap
