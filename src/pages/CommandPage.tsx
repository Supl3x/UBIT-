import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { t } from '../i18n'
import LiveMap, { type LiveMapHandle } from '../components/LiveMap'

export default function CommandPage() {
  const navigate = useNavigate()
  const { language, cases, openCaseDrawer, showToast, assignments, mapAssets, mapSensors, weather } = useStore()
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [showFlood, setShowFlood] = useState(true)
  const [showAssets, setShowAssets] = useState(true)
  const mapRef = useRef<LiveMapHandle>(null)
  const tracked = cases.length
  const t1 = cases.filter((c) => c.tier === 1).length
  const t2 = cases.filter((c) => c.tier === 2).length
  const t3 = cases.filter((c) => c.tier === 3).length
  const unknownN = cases.filter((c) => c.unknown).length

  const handleOpenCase = (caseId: string) => {
    openCaseDrawer(caseId)
  }

  const handleAreaSelect = (area: string) => {
    setSelectedArea(area === 'all' || selectedArea === area ? null : area)
  }

  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()
  const handleRecenter = () => {
    mapRef.current?.recenter()
    showToast(t('mapRecentered', 'en'), t('mapRecentered', 'ur'), 'info')
  }

  const filteredCases = selectedArea ? cases.filter((c) => c.area === selectedArea) : cases

  return (
    <div className="bg-background font-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen">
      {/* 1. TOP METRIC / INCIDENT TRIAGE COMMAND BAR */}
      <section className="w-full bg-surface-container-low/90 backdrop-blur-md rounded-xl p-space-md shadow-lg relative overflow-hidden">
        <div className="absolute -top-12 -left-12 w-64 h-64 bg-primary-container/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -right-10 w-72 h-72 bg-secondary-container/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-space-md">
          {/* Title & Mission Context */}
          <div className="flex items-center gap-space-md min-w-0">
            <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary-container shrink-0 shadow-md">
              <span className="material-symbols-outlined text-display-lg-mobile" style={{ fontVariationSettings: "'FILL' 1" }}>flood</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-md text-headline-sm text-on-surface font-bold tracking-tight">Active Flood Basin Command</span>
                <span className="text-outline-variant font-telemetry-sm">/</span>
                <span className="font-urdu-headline text-body-lg text-primary font-bold">لائائیو ایمرجنسی کمانڈ</span>
              </div>
              <div className="flex items-center gap-space-sm text-on-surface-variant font-body-sm">
                <span>Karachi South &amp; East Drainage Basins</span>
                <span className="w-1 h-1 rounded-full bg-outline"></span>
                <span className="font-telemetry-sm text-telemetry-sm text-secondary">Telemetry Freshness: 3.8s</span>
              </div>
            </div>
          </div>
          {/* Live Metric Triage Strips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-space-sm w-full xl:w-auto">
            {/* Total Tracked */}
            <div className="bg-surface-container/70 rounded-lg p-space-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant uppercase">Tracked</span>
                <span className="material-symbols-outlined text-telemetry-sm text-on-surface-variant">groups</span>
              </div>
              <div className="mt-1 flex items-baseline gap-space-xs">
                <span className="font-telemetry-lg text-telemetry-lg text-on-surface font-bold">{tracked.toLocaleString()}</span>
                <span className="font-urdu-body text-telemetry-sm text-on-surface-variant">شہری</span>
              </div>
              <span className="font-body-sm text-on-surface-variant/75 text-[11px] truncate">Lyari, Malir, Korangi</span>
            </div>
            {/* Tier 1: Life Threat */}
            <div className="bg-error-container/20 rounded-lg p-space-sm flex flex-col justify-between shadow-[0_0_16px_rgba(229,83,61,0.15)] relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="font-telemetry-sm text-telemetry-sm text-error font-semibold uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping"></span> Tier 1 Life
                </span>
                <span className="font-urdu-body text-telemetry-sm text-error">خطرہ جاں</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-telemetry-lg text-telemetry-lg text-error font-extrabold">{t1}</span>
                <span className="font-telemetry-sm text-telemetry-sm text-error/80">Immediate</span>
              </div>
              <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden mt-1">
                <div className="bg-error h-full w-full"></div>
              </div>
            </div>
            {/* Tier 2: Urgent */}
            <div className="bg-surface-container/70 rounded-lg p-space-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-telemetry-sm text-telemetry-sm text-primary uppercase font-semibold">Tier 2 Urgent</span>
                <span className="font-urdu-body text-telemetry-sm text-primary">فوری</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-telemetry-lg text-telemetry-lg text-primary font-bold">{t2}</span>
                <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">Cases</span>
              </div>
              <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden mt-1">
                <div className="bg-primary-container h-full w-3/4"></div>
              </div>
            </div>
            {/* Tier 3: Watch */}
            <div className="bg-surface-container/70 rounded-lg p-space-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-telemetry-sm text-telemetry-sm text-secondary uppercase font-semibold">Tier 3 Watch</span>
                <span className="font-urdu-body text-telemetry-sm text-secondary">نگرانی</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-telemetry-lg text-telemetry-lg text-secondary font-bold">{t3}</span>
                <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">Stable</span>
              </div>
              <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden mt-1">
                <div className="bg-secondary-container h-full w-2/5"></div>
              </div>
            </div>
            {/* Unknown / Welfare Check */}
            <div className="bg-surface-container/70 rounded-lg p-space-sm flex flex-col justify-between relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#5F7A8C_1px,transparent_1px)] [background-size:6px_6px]"></div>
              <div className="flex items-center justify-between">
                <span className="font-telemetry-sm text-telemetry-sm text-outline uppercase font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-telemetry-sm">help_center</span> Unknown
                </span>
                <span className="font-urdu-body text-telemetry-sm text-outline">نامعلوم</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-telemetry-lg text-telemetry-lg text-on-surface font-bold">{unknownN}</span>
                <span className="font-telemetry-sm text-telemetry-sm text-error/90 font-medium tracking-tight">Zero-Ping</span>
              </div>
              <span className="font-body-sm text-[11px] text-tertiary truncate">Default to High Exposure</span>
            </div>
            {/* Avg Response Latency */}
            <div className="bg-surface-container-high/80 rounded-lg p-space-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant uppercase">Resp Latency</span>
                <span className="material-symbols-outlined text-telemetry-sm text-secondary">speed</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-telemetry-lg text-telemetry-lg text-secondary font-bold">2m 14s</span>
              </div>
              <span className="font-urdu-body text-[11px] text-on-surface-variant truncate">اوسط رسپانس وقت (مطلوبہ &lt; 3m)</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MAIN SPLIT INTERFACE (60% Map / 40% Queue) */}
      <section className="w-full grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-lg">
        {/* LEFT COLUMN: 3D TILTED LIVE HAZARD MAP */}
        <div className="lg:col-span-7 flex flex-col gap-space-sm">
          <div className="bg-surface-container-low/95 rounded-xl p-space-md shadow-xl flex flex-col gap-space-md relative overflow-hidden">
            {/* Map Header & Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-space-sm z-10">
              <div className="flex items-center gap-space-sm">
                <div className="px-space-sm py-1 rounded bg-surface-container-high text-primary font-telemetry-sm text-telemetry-sm flex items-center gap-1.5 shadow-sm">
                  <span className="material-symbols-outlined text-telemetry-md">map</span>
                  <span>Live Map</span>
                </div>
                <div className="flex items-center bg-surface-container rounded-lg p-0.5">
                  <button
                    onClick={() => handleAreaSelect('all')}
                    className={`px-space-sm py-1 rounded font-body-sm text-body-sm ${!selectedArea ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:text-on-surface'} transition-colors`}
                  >
                    All Karachi
                  </button>
                  <button
                    onClick={() => handleAreaSelect('lyari')}
                    className={`px-space-sm py-1 rounded font-body-sm text-body-sm ${selectedArea === 'lyari' ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:text-on-surface'} transition-colors`}
                  >
                    Lyari Basin
                  </button>
                  <button
                    onClick={() => handleAreaSelect('malir')}
                    className={`px-space-sm py-1 rounded font-body-sm text-body-sm ${selectedArea === 'malir' ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:text-on-surface'} transition-colors`}
                  >
                    Malir Nadi
                  </button>
                  <button
                    onClick={() => handleAreaSelect('korangi')}
                    className={`px-space-sm py-1 rounded font-body-sm text-body-sm ${selectedArea === 'korangi' ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:text-on-surface'} transition-colors`}
                  >
                    Korangi
                  </button>
                </div>
              </div>
              {/* Controls Stack */}
              <div className="flex items-center gap-space-xs">
                <button className="px-space-sm py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-telemetry-sm text-telemetry-sm flex items-center gap-1 transition-colors" title="Toggle Unknown Beacons">
                  <span className="w-2 h-2 rounded-full bg-outline"></span>
                  <span>Hatched Unknowns</span>
                </button>
                <div className="flex items-center bg-surface-container rounded-lg overflow-hidden">
                  <button
                    onClick={handleZoomIn}
                    className="w-8 h-8 flex items-center justify-center text-on-surface hover:bg-surface-container-high"
                    title="Zoom In"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-headline-sm">add</span>
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="w-8 h-8 flex items-center justify-center text-on-surface hover:bg-surface-container-high"
                    title="Zoom Out"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-headline-sm">remove</span>
                  </button>
                  <button
                    onClick={handleRecenter}
                    className="w-8 h-8 flex items-center justify-center text-on-surface hover:bg-surface-container-high"
                    title="Recenter View"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-body-sm">my_location</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Live map (MapLibre): real basemap, case beacons, rescue assets, sensor flood zones, dispatch routes */}
            <div className="relative w-full h-[520px] rounded-lg overflow-hidden bg-surface-container-lowest shadow-inner">
              <LiveMap
                ref={mapRef}
                cases={cases}
                assets={mapAssets}
                sensors={mapSensors}
                assignments={assignments}
                area={selectedArea}
                showAssets={showAssets}
                showFlood={showFlood}
                onSelectCase={handleOpenCase}
              />
              {/* Bottom floating legend + live hazard telemetry */}
              <div className="absolute bottom-2 left-2 right-2 z-10 pointer-events-none bg-surface-container-low/85 backdrop-blur-md px-space-md py-space-xs rounded-lg flex flex-wrap items-center justify-between text-telemetry-sm font-telemetry-sm text-on-surface-variant">
                <div className="flex items-center gap-space-md">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-error"></span> Tier 1 Life Threat</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary"></span> Tier 2 Urgent</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-outline"></span> Ring = Unknown Welfare</span>
                </div>
                <div className="flex items-center gap-space-sm">
                  {weather ? (
                    <>
                      <span className="text-secondary">Rain next 24h: {weather.rain24h ?? '--'} mm</span>
                      <span className="text-outline-variant">|</span>
                      <span className="text-primary">Peak: {weather.peakHourly ?? '--'} mm/h</span>
                      <span className="text-outline-variant">|</span>
                      <span>{weather.source === 'open-meteo' ? 'Open-Meteo live' : 'Demo clock'}</span>
                    </>
                  ) : (
                    <span>Forecast not loaded</span>
                  )}
                </div>
              </div>
            </div>
            {/* Layer Toggles & Interactive Map Sliders */}
            <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container/60 p-space-sm rounded-lg text-body-sm">
              <div className="flex items-center gap-space-md">
                <label className="flex items-center gap-2 cursor-pointer text-on-surface">
                  <input checked={showFlood} onChange={(e) => setShowFlood(e.target.checked)} className="w-4 h-4 rounded accent-primary-container bg-surface-container-highest" type="checkbox" />
                  <span className="font-medium text-body-sm">Sensor flood zones</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-on-surface">
                  <input checked={showAssets} onChange={(e) => setShowAssets(e.target.checked)} className="w-4 h-4 rounded accent-primary-container bg-surface-container-highest" type="checkbox" />
                  <span className="font-medium text-body-sm">Rescue assets and sensors</span>
                </label>
              </div>
              <div className="flex items-center gap-2 font-telemetry-sm text-telemetry-sm text-on-surface-variant">
                <span>Forecast source:</span>
                <span className="text-primary font-semibold">Open-Meteo</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: MULTI-TIER PRIORITY RESCUE QUEUE */}
        <div className="lg:col-span-5 flex flex-col gap-space-sm">
          <div className="bg-surface-container-low/95 rounded-xl p-space-md shadow-xl flex flex-col gap-space-md">
            {/* Queue Header with Search & Auto-refresh */}
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-primary text-headline-sm">sort</span>
                  <span className="font-headline-sm text-headline-sm font-bold text-on-surface">Priority Rescue Queue</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container text-secondary font-telemetry-sm text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                  <span>LIVE REFRESH 5s</span>
                </div>
              </div>
              <div className="h-0.5 w-16 bg-primary-container rounded-full"></div>
            </div>
            {/* Search & Filter Controls */}
            <div className="flex flex-col gap-space-xs">
              <div className="relative w-full">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-body-md">search</span>
                <input className="w-full pl-10 pr-4 py-2 bg-surface-container rounded-lg text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary-container" placeholder="Search citizen by name, CNIC (42201-...), or phone..." type="text" />
              </div>
              {/* Tier Filter Tabs with Counter Badges */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
                <button className="px-space-sm py-1 rounded-lg text-body-sm font-medium bg-surface-container-high text-on-surface">All ({tracked})</button>
                <button className="px-space-sm py-1 rounded-lg text-body-sm font-semibold bg-error-container/30 text-error flex items-center gap-1">
                  <span>Tier 1</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-error text-on-error text-telemetry-sm font-bold">{t1}</span>
                </button>
                <button className="px-space-sm py-1 rounded-lg text-body-sm font-medium text-primary hover:bg-surface-container flex items-center gap-1">
                  <span>Tier 2</span>
                  <span className="text-telemetry-sm text-primary/80">{t2}</span>
                </button>
                <button className="px-space-sm py-1 rounded-lg text-body-sm font-medium text-outline hover:bg-surface-container flex items-center gap-1">
                  <span>Unknown</span>
                  <span className="text-telemetry-sm text-outline">{unknownN}</span>
                </button>
              </div>
            </div>
            {/* Case Cards List */}
            <div className="flex flex-col gap-space-sm max-h-[560px] overflow-y-auto pr-1">
              {filteredCases.map((caseItem) => (
                <article key={caseItem.id} className="bg-surface-container/90 rounded-xl p-space-md flex flex-col gap-space-xs shadow-lg relative overflow-hidden transition-transform hover:-translate-y-0.5 cursor-pointer" onClick={() => handleOpenCase(caseItem.id)}>
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${caseItem.tier === 1 ? 'bg-error' : caseItem.tier === 2 ? 'bg-primary-container' : 'bg-secondary-container'}`}></div>
                  <div className="flex items-start justify-between gap-2 pl-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-space-xs">
                        <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">{caseItem.name}</h3>
                        <span className="text-on-surface-variant font-urdu-body text-headline-sm">{caseItem.nameUrdu}</span>
                      </div>
                      <div className="flex items-center gap-2 font-body-sm text-on-surface-variant text-[12px]">
                        <span>{caseItem.age} yrs</span>
                        <span>•</span>
                        <span>{caseItem.location}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className={`px-2 py-0.5 rounded ${caseItem.tier === 1 ? 'bg-error text-on-error' : caseItem.tier === 2 ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'} font-telemetry-lg text-headline-sm font-extrabold shadow-[0_0_12px_rgba(229,83,61,0.5)]`}>
                        {caseItem.risk.toFixed(1)}
                      </div>
                      <span className="font-telemetry-sm text-[10px] text-on-surface-variant mt-0.5">96% Model Conf</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-surface-variant/40 pl-2">
                    <span className={`font-headline-sm text-body-sm ${caseItem.tier === 1 ? 'text-error' : 'text-primary'} font-bold`}>
                      {caseItem.tier === 1 ? 'Urgent Action Required' : 'Action Required'}
                    </span>
                    <button className="px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary-container font-headline-sm text-body-sm font-bold flex items-center gap-1 shadow-md hover:bg-primary-fixed transition-all">
                      <span>Open Case</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
