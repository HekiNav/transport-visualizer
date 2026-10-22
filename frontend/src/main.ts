import { GeoJSONSource, LngLatBounds, Map, MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import flatpickr from "flatpickr";
import * as GeoJSON from "geojson"
import Split from 'split.js'
import type { Instance } from 'flatpickr/dist/types/instance';
import SlimSelect from 'slim-select';
import Toastify from "toastify-js"
import Coloris from "@melloware/coloris";
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'range-slider-element';
import { FFmpeg } from '@ffmpeg/ffmpeg';


import './style.css'
import "toastify-js/src/toastify.css"
import "@melloware/coloris/dist/coloris.css";
import 'range-slider-element/style.css';
import { fetchFile } from '@ffmpeg/util';


/// █████ █   █ ████  █████  ████
///   █    █ █  █   █ █     █
///   █     █   ████  ████   ███
///   █     █   █     █         █
///   █     █   █     █████ ████

// API Types
type APIMessage = {
  lat: number;
  lng: number;
  messageId: number;
  timestamp: string;
  tripId: string;
}

type APITrip = {
  tripId: string;
  dataSource: "DIGITRAFFIC";
  departureDate: string;
  endPointId: string;
  endPointName: string | null;
  operatorId: string;
  operatorName: string | null;
  route: string | null;
  routeType: APIRouteType;
  startPointId: string;
  startPointName: string | null;
  messages?: APIMessage[]
}

type APIRouteType = /* "BUS" | */ "TRAIN_LONG_DISTANCE" | "TRAIN_COMMUTER" | "TRAIN_FREIGHT" | "TRAIN_SHUNT" | "TRAIN_OTHER" | "TRAIN_REGIONAL" | "TRAIN_TRANSFER" | "TRAIN_SLEEPER"/*  | "TRAM" | "FERRY" | "LIGHT_RAIL" */

type APIError = {
  code: number,
  message: string,
  success: false
}

type APIResponse<T> = {
  data: T,
  success: true
} | APIError

type DigitrafficStation = {
  countryCode: string,
  latitude: number,
  longitude: number,
  passengerTraffic: boolean,
  stationName: string,
  stationShortCode: string,
  stationUICCode: number,
  type: "STATION" | "STOPPING_POINT" | "TURNOUT_IN_THE_OPEN_LINE"
}

///  ████  ███  █   █  ████ █████  ███  █   █ █████  ████
/// █     █   █ ██  █ █       █   █   █ ██  █   █   █
/// █     █   █ █ █ █  ███    █   █████ █ █ █   █    ███
/// █     █   █ █  ██     █   █   █   █ █  ██   █       █
///  ████  ███  █   █ ████    █   █   █ █   █   █   ████


const resolutions = {
  "480P_H": [640, 480],
  "480P_V": [480, 640],
  "720P_H": [1280, 720],
  "720P_V": [720, 1280],
  "1080P_H": [1920, 1080],
  "1080P_V": [1080, 1920],
  "1440P_H": [2560, 1440],
  "1440P_V": [1440, 2560],
  "2160P_H": [3480, 2160],
  "2160P_V": [2160, 3480]
}

const toastConfig = {
  className: "border-neutral-200 border-2 p-1 rounded-lg! text-neutral-200 accent-cyan-500 text-xl bg-neutral-900! p-2!",
  style: {
    background: "0",
    boxShadow: "none"
  }
}

const routeTypeNames: { [t in APIRouteType]: string } = {
  TRAIN_COMMUTER: "Commuter train",
  TRAIN_FREIGHT: "Freight train",
  TRAIN_LONG_DISTANCE: "Long-distance train",
  TRAIN_REGIONAL: "Regional train",
  TRAIN_SLEEPER: "Sleeper train",
  TRAIN_TRANSFER: "Stock transfer train",
  TRAIN_SHUNT: "Shunting train",
  TRAIN_OTHER: "Other train",
}

const ColorSwatch = {
  RED_PINK: "#ff0088",
  PURPLE: "#8800ff",
  BLUE_CYAN: "#0088ff",
  CYAN_GREEN: "#00ff88",
  GREEN_YELLOW: "#88ff00",
  ORANGE: "#ff8800",
  WHITE: "#ffffff",
  PINK: "#ff00ff",
  BLUE: "#0000ff",
  CYAN: "#00ffff",
  GREEN: "#00ff00",
  YELLOW: "#ffff00",
  RED: "#ff0000"


}


const defaultColors: { [t in APIRouteType]: string } = {
  TRAIN_COMMUTER: ColorSwatch.PURPLE,
  TRAIN_FREIGHT: ColorSwatch.BLUE,
  TRAIN_SLEEPER: ColorSwatch.CYAN,
  TRAIN_LONG_DISTANCE: ColorSwatch.GREEN,
  TRAIN_TRANSFER: ColorSwatch.YELLOW,
  TRAIN_SHUNT: ColorSwatch.ORANGE,
  TRAIN_REGIONAL: ColorSwatch.RED,
  TRAIN_OTHER: ColorSwatch.PINK,
}

const API_URL = "https://tvis-api-dev.hekinav.dev"
const DAY = 24 * 60 * 60 * 1000



/// █   █  ███  ████  █████  ███  ████  █     █████  ████
/// █   █ █   █ █   █   █   █   █ █   █ █     █     █
/// █   █ █████ ████    █   █████ ████  █     ████   ███
///  █ █  █   █ █  █    █   █   █ █   █ █     █         █
///   █   █   █ █   █ █████ █   █ ████  █████ █████ ████

let selectedColors = { ...defaultColors }
let selectedColor = ColorSwatch.CYAN
let lastColorReload = 0
let otherMapLoaded = false
let exportDateRange: [Date, Date] | null = null
let abortExport: AbortController | null = null
let abortLoad: AbortController | null = null

let timelapse = false
let timelapseFrameDuration = 60_000
let timelapseTailLength = 10
let timelapseSpeedMultiplier = 1
let trips: APITrip[] = []
let timelapseData: APITrip[][] = []
let timelapseFrame: number = 0
let timelapseTimeout: number | null = null


///  ████ █████ █████ █   █ ████
/// █     █       █   █   █ █   █
///  ███  ████    █   █   █ ████
///     █ █       █   █   █ █
/// ████  █████   █    ███  █

setWorkerUrl(workerUrl);

// HTML Elements

Coloris.init();

Split(['#content', '#map'], {
  direction: 'horizontal',
  minSize: 50,
  snapOffset: 0,
  gutterSize: 10,
  gutterAlign: "center"
}).setSizes([40, 60])

const picker = flatpickr("#daterange", {
  mode: "range",
  onClose: () => loadMap(false)
}) as Instance
picker.setDate(["2026-10-18", "2026-10-18"])

const loadButton: HTMLButtonElement = document.querySelector("#load")!

loadButton.addEventListener("click", () => loadMap(true))

const resetColorsButton: HTMLButtonElement = document.querySelector("#resetColors")!

resetColorsButton.addEventListener("click", () => {
  selectedColors = { ...defaultColors }
  selectedColor = ColorSwatch.CYAN
  loadColorPickers()
})

const opacity: HTMLInputElement = document.querySelector("#opacity")!
const opacityLabel: HTMLInputElement = document.querySelector("#opacityLabel")!

opacity.addEventListener("change", onOpacity)
opacity.addEventListener("mousemove", onOpacity)

const exportRange: HTMLInputElement = document.querySelector("#exportRange")!
const exportRangeLabel: HTMLSpanElement = document.querySelector("#exportRangeLabel")!

exportRange.addEventListener("change", onExportRange)
exportRange.addEventListener("mousemove", onExportRange)

const timelapseSpeed: HTMLInputElement = document.querySelector("#timelapseSpeed")!
const timelapseSpeedLabel: HTMLInputElement = document.querySelector("#timelapseSpeedLabel")!

timelapseSpeed.addEventListener("change", onTimelapseSpeed)
timelapseSpeed.addEventListener("mousemove", onTimelapseSpeed)

const toggleTimelapseButton: HTMLButtonElement = document.querySelector("#toggleTimelapse")!
const timelapseContainer: HTMLButtonElement = document.querySelector("#timelapse")!

toggleTimelapseButton.addEventListener("click", () => {
  timelapse = !timelapse
  timelapseContainer.hidden = !timelapse
  toggleTimelapseButton.textContent = timelapse ? "Switch to normal mode" : "Switch to timelapse"
  time.hidden = !timelapse
  if (timelapse) {
    renderTimelapseFrame(timelapseFrame)
  } else {
    drawTrips()
  }
})


const totalFrames: HTMLSpanElement = document.querySelector("#totalFrames")!
const currentFrame: HTMLSpanElement = document.querySelector("#currentFrame")!

const time: HTMLDivElement = document.querySelector("#time")!

const playTimelapseButton: HTMLButtonElement = document.querySelector("#playTimelapse")!

playTimelapseButton.addEventListener("click", () => {
  if (!timelapse) return
  toggleTimelapse();
})

const backgroundMapCheckbox: HTMLInputElement = document.querySelector("#backgroundMap")!

backgroundMapCheckbox.addEventListener("change", () => {
  // map breaks if togglig visibility and loading trip paths at the same time
  [map, exportMap].forEach(m => {

    if (!m.loaded() || !m.isStyleLoaded()) {
      Toastify({
        text: "Map not loaded, please wait and try again",
        duration: 3000,
        gravity: "top",
        position: "right",
        ...toastConfig,
      }).showToast()
      return
    }
    m
      .getLayersOrder()
      .map(id => m.getLayer(id))
      .filter(layer => layer?.source == "openmaptiles")
      .forEach(layer => {
        m?.setLayoutProperty(layer?.id || "", "visibility", backgroundMapCheckbox.checked ? "visible" : "none")
      })
  })

})

const colorsByRoutetypeCheckbox: HTMLInputElement = document.querySelector("#routeTypeColors")!

colorsByRoutetypeCheckbox.addEventListener("change", () => {
  loadColorPickers()
})

const colorsContainer: HTMLInputElement = document.querySelector("#colors")!

const dataSourcePicker = new SlimSelect({
  select: '#dataSource',
  settings: {
    closeOnSelect: false,
    placeholderText: "Filter by data sources",
    searchPlaceholder: "Search data sources"
  },
  events: {
    afterChange() {
      loadDatePicker(dataSourcePicker.getSelected())
    },
  }
})

const routeTypePicker = new SlimSelect({
  select: '#routeType',
  settings: {
    closeOnSelect: false,
    placeholderText: "Filter by route types",
    searchPlaceholder: "Search route types"
  },
  events: {
    afterChange() {
      loadColorPickers()
    },
  }
})


const terminusPicker = new SlimSelect({
  select: '#terminus',
  settings: {
    closeOnSelect: false,
    placeholderText: "Filter by terminuses",
    searchPlaceholder: "Search stations"
  },
  data: getStoredStationList(),
  events: {
    afterChange() {
      //loadMap()
      localStorage.setItem("selectedStations", JSON.stringify(terminusPicker.getSelected()))
    },
  }
})

const exportResPicker = new SlimSelect({
  select: '#exportResolution',
  settings: {
    closeOnSelect: true,
    placeholderText: "Select resolution",
    searchPlaceholder: "Search resolutions"
  }
})

const exportMapContainer: HTMLDivElement = document.querySelector("#exportMapContainer")!
const exportButton: HTMLButtonElement = document.querySelector("#export")!

exportButton.addEventListener("click", () => {
  exportTimelapse()
})

/// Map

const map = new Map({
  container: 'map',
  style: "./map_style.json",
  center: [27, 65],
  zoom: 5,
  minPitch: 0,
  maxPitch: 0
});

const exportMap = new Map({
  container: 'exportMap',
  style: "./map_style.json",
  interactive: false,
  center: [27, 65],
  zoom: 5,
  pixelRatio: 1,
  canvasContextAttributes: { preserveDrawingBuffer: true }
});

exportMap.on("moveend", onExportMapChange)
exportMap.on("zoomend", onExportMapChange)

/// █████ █   █ █   █  ████ █████ █████  ███  █   █  ████
/// █     █   █ ██  █ █       █     █   █   █ ██  █ █
/// ████  █   █ █ █ █ █       █     █   █   █ █ █ █  ███
/// █     █   █ █  ██ █       █     █   █   █ █  ██     █
/// █      ███  █   █  ████   █   █████  ███  █   █ ████

function toMB(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1)
}

function lowerBound(times: number[], target: number) {
  let lo = 0, hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

async function start() {
  (document.querySelector("#loading") as HTMLDivElement).style.opacity = "0";
  setTimeout(() => {
    (document.querySelector("#loading") as HTMLDivElement).style.display = "none"
  }, 500);
  [map, exportMap].forEach(m => {

    m.addSource("lines", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      }
    })
    m.addLayer({
      id: "lines",
      source: "lines",
      type: "line",
      paint: {
        "line-color": "#fff",
        "line-width": 1,
        "line-opacity": 0.5
      }
    })
    m.addSource("points", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      }
    })
    m.addLayer({
      id: "points",
      source: "points",
      type: "circle",
      paint: {
        "circle-color": "#fff",
        "circle-radius": 2,
        "circle-opacity": 0.5
      }
    })
  })

  loadDatePicker()
  loadColorPickers()
  onOpacity()
  onTimelapseSpeed()
  onExportRange()

  if (localStorage.getItem("selectedStations")) {
    try {
      terminusPicker.setSelected(JSON.parse(localStorage.getItem("selectedStations") || "[]"))
    } catch (error) {
      console.error(`Failed to load stored station list`)
    }
  }


  if (!localStorage.getItem("stationList")) {
    // load stations
    const stationResponse = await fetch("https://rata.digitraffic.fi/api/v1/metadata/stations")
    const stationList: DigitrafficStation[] = await stationResponse.json()
    terminusPicker.setData(stationList.map(s => ({
      value: s.stationShortCode,
      text: `${s.stationName} (${s.stationShortCode})`
    })))
    localStorage.setItem("stationList", JSON.stringify({ timeStamp: new Date().toISOString(), stationList: terminusPicker.getData() }))
    loadMap()
  } else {
    loadMap()
  }
  setMapLineWidth(map, 1)
  setMapLineWidth(exportMap, 1)
}

function getStoredStationList() {
  const fallbackStations = [
    { value: "loading", text: "Loading stations...", disabled: true }
  ]
  try {
    const storedList = JSON.parse(localStorage.getItem("stationList") || "")
    return storedList.stationList
  } catch (error) {
    return fallbackStations
  }
}

///       █   █ █████ █   █ █
///       █   █   █   ██ ██ █
/// █████ █████   █   █ █ █ █
///       █   █   █   █   █ █
///       █   █   █   █   █ █████

function toggleTimelapse() {
  if (timelapseTimeout) {
    playTimelapseButton.textContent = "Play";
    clearInterval(timelapseTimeout);
    timelapseTimeout = null;
  } else {
    playTimelapseButton.textContent = "Stop";
    timelapseTimeout = setInterval(() => {
      timelapseFrame++;
      renderTimelapseFrame(timelapseFrame);
      if (timelapseFrame >= timelapseData.length - 1) {
        playTimelapseButton.textContent = "Play";
        clearInterval(timelapseTimeout || undefined);
        timelapseTimeout = null;
      }
    }, 100 / timelapseSpeedMultiplier);
  }
}

function onOpacity() {
  [map, exportMap].forEach(m => {

    m?.setPaintProperty("lines", "line-opacity", Number(opacity.value) / 100);
    m?.setPaintProperty("points", "circle-opacity", Number(opacity.value) / 100);
  })

  opacityLabel.textContent = `${opacity.value}%`;
}

function onExportRange() {
  const start = picker.selectedDates[0].getTime()
  const end = (picker.selectedDates[1] || picker.selectedDates[0]).getTime() + DAY

  exportDateRange = exportRange.value.split(",").map(e => new Date(start + (end - start) * (Number(e) / Number(exportRange.max)))).map(d => d.getTime() == end ? new Date(d.getTime() - 60_000) : d).slice(0, 2) as [Date, Date]

  exportRangeLabel.textContent = `${exportDateRange.map(e => `${String(e.getDate())}.${String(e.getMonth() + 1)}.${e.getFullYear()} ${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`).join(" - ")}`;
}

function onTimelapseSpeed() {
  timelapseSpeedMultiplier = Number(timelapseSpeed.value)
  timelapseSpeedLabel.textContent = `${timelapseSpeed.value}x`;
  if (timelapseTimeout) {
    toggleTimelapse()
    toggleTimelapse()
  }
}

function loadColorPickers() {
  colorsContainer.innerHTML = "";
  if (colorsByRoutetypeCheckbox.checked) {
    (Object.entries(selectedColors) as [APIRouteType, string][]).filter(([type]) => routeTypePicker.getSelected().some(t => t == type)).forEach(([type, color]) => {
      colorsContainer.innerHTML += `
        <div class="w-full flex justify-start gap-4 items-center full my-1">
          <input type="text" data-coloris id="color-${type}" autocomplete="off" value="${color}">
          <label for="color-${type}" class="text-nowrap grow-1 text-lg text-neutral-200">${routeTypeNames[type]}</label>
        </div>
        `
      Coloris({
        el: `#color-${type}`,
        alpha: false,
        format: "hex",
        theme: "polaroid",
        themeMode: "dark",
        onChange: (c, el) => { selectedColors[el?.id.slice(6) as APIRouteType] = c; reloadMapColours() },
        swatches: Object.values(ColorSwatch)
      })
    })
  } else {
    colorsContainer.innerHTML += `
        <div class="w-full flex justify-start gap-4 items-center full my-1">
          <input type="text" data-coloris id="color" autocomplete="off" value="${selectedColor}">
        </div>
        `
    Coloris({
      el: `#color`,
      alpha: false,
      format: "hex",
      theme: "polaroid",
      themeMode: "dark",
      onChange: (c) => { selectedColor = c; reloadMapColours() },
      swatches: Object.values(ColorSwatch)
    })
  }
  reloadMapColours()
}

async function loadDatePicker(dataSources: string[] = []) {
  const response = await fetch(API_URL + `/api/v1/dates?dataSource=${dataSources.join(",")}`)
  const json: APIResponse<APITrip[]> = await response.json()
  if (!json.success) {
    console.error(json.message)
    return
  }
  picker.set("minDate", json.data[0])
  picker.set("maxDate", json.data[json.data.length - 1])
  //loadMap()
}

///       █   █  ███  ████
///       ██ ██ █   █ █   █
/// █████ █ █ █ █████ ████
///       █   █ █   █ █
///       █   █ █   █ █

function onExportMapChange() {
  console.log(exportMap.getBounds())
}

function reloadMapColours() {
  lastColorReload = Date.now()
  let lastTime = lastColorReload
  setTimeout(() => {
    if (lastTime != lastColorReload) return
    [map, exportMap].forEach(m => {

      if (colorsByRoutetypeCheckbox.checked) {
        m?.setPaintProperty("lines", "line-color", ["match", ["get", "routeType"], ...Object.entries(selectedColors).flat() as [string, string, ...string[]], "#fff"])
        m?.setPaintProperty("points", "circle-color", ["match", ["get", "routeType"], ...Object.entries(selectedColors).flat() as [string, string, ...string[]], "#fff"])
      } else {
        m?.setPaintProperty("lines", "line-color", selectedColor)
        m?.setPaintProperty("points", "circle-color", selectedColor)
      }
    })
  }, 100)
}

function setMapLineWidth(m: MapLibreMap, width: number) {
  m?.setPaintProperty("lines", "line-width", width)
  m?.setPaintProperty("points", "circle-radius", width)
}


async function loadMap(fromButton = false) {


  if (abortLoad) {
    abortLoad.abort()
    if (fromButton) return
  }

  loadButton.textContent = "Abort load"

  abortLoad = new AbortController()

  const progressToast = Toastify({
    text: "Loading trips. This will take some time. Please wait.",
    duration: 100000000_000,
    gravity: "top",
    position: "right",
    ...toastConfig,
  })
  progressToast.showToast()

  if (timelapseTimeout) toggleTimelapse()

  abortLoad.signal.addEventListener("abort", () => {
    progressToast.hideToast()
    loadButton.textContent = "Load"
    abortLoad = null
  })

  let dateRange: string | null = null
  const formatDate = (e: Date) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`
  if (picker.selectedDates.length == 1) dateRange = `${formatDate(new Date(picker.selectedDates[0].getTime() - DAY))}:${formatDate(picker.selectedDates[0])}`
  if (picker.selectedDates.length > 1) dateRange = `${formatDate(new Date(picker.selectedDates[0].getTime() - DAY))}:${formatDate(picker.selectedDates[1])}`

  const dataSources = dataSourcePicker.getSelected()
  const routeTypes = routeTypePicker.getSelected()
  const terminuses = terminusPicker.getSelected()

  if (dateRange == null || dataSources.length == 0 || routeTypes.length == 0) {
    (map.getSource("lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: []
    })
    progressToast.hideToast()
    Toastify({
      text: "No data for the selected filters. Try to add a data source and routeType",
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
    abortLoad.abort()
    return
  }
  try {

    const response = await fetch(API_URL + `/api/v1/trips?messages&departureDateRange=${dateRange}&dataSource=${dataSources.join(",")}&routeType=${routeTypes.join(",")}&terminus=${terminuses.join(",")}`, { signal: abortLoad?.signal })
    if (!response.ok || !response.body) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }

    const total = Number(response.headers.get("x-uncompressed-length")) || 0

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    let nextPercent = 1

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunks.push(value)
      received += value.length

      const percent = (received / total) * 100
      if (percent >= nextPercent) {
        progressToast.toastElement!.textContent = `Downloaded ${Math.floor(percent)}% (${toMB(received)} / ${toMB(total)} MB)`
        nextPercent = percent + 1
      }
    }

    progressToast.toastElement!.textContent = `Download complete. Processing...`

    const body = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.length
    }
    chunks.length = 0

    if (abortLoad.signal.aborted) return

    const json: APIResponse<APITrip[]> = JSON.parse(new TextDecoder().decode(body))


    if (!json.success) {
      throw json.message
    }

    if (json.data.length == 0) {
      Toastify({
        text: "No data for the selected filters",
        duration: 3000,
        gravity: "top",
        position: "right",
        ...toastConfig,
      }).showToast()
      abortLoad.abort()
      return
    }
    if (abortLoad.signal.aborted) return

    reloadMapColours()
    onExportRange()

    trips = json.data.reduce((p, c) => {
      const startTime = picker.selectedDates[0]
      const filteredMessages = c.messages!.filter(msg => new Date(msg.timestamp).getTime() >= startTime.getTime())
      if (filteredMessages.length == 0) return p
      return [...p, { ...c, messages: filteredMessages }]
    }, new Array<APITrip>())

    generateTimelapse()


    if (timelapse) {
      timelapseFrame = 0
      renderTimelapseFrame(timelapseFrame)
    } else {
      drawTrips()
    }
    fitMap()


    progressToast.hideToast()
    loadButton.textContent = "Load"
    abortLoad = null

    Toastify({
      text: `Loaded ${json.data.length} trips`,
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
  } catch (error) {
    if (String(error).includes("AbortError")) return
    Toastify({
      text: `Failed to load trips: ${error} ${String(error).includes("RangeError: Invalid string length") ? ". POSSIBLE FIX: Try to request less data." : ""}`,
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
  }
}

function drawTrips(m: MapLibreMap = map) {
  const polylines: GeoJSON.Feature<GeoJSON.LineString, APITrip>[] = trips.map(({ messages, ...trip }) => {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: (messages || []).map(msg => [msg.lng, msg.lat])
      },
      properties: { ...trip }
    };
  });
  (m.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: polylines
  });
  (m.getSource("points") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: []
  });
}

function fitMap(m: MapLibreMap = map, duration = 1000) {
  const bounds = (trips[0] && trips[0].messages && trips[0].messages?.length > 1) ? new LngLatBounds(trips[0].messages![0], trips[0].messages![1]) : null;
  trips.forEach(({ messages }) => {
    if (bounds) messages?.forEach(msg => bounds.extend(msg));
  })
  if (bounds) m.fitBounds(bounds, {
    padding: 100,
    essential: true,
    duration: duration
  });
}

///       █████ █████ █   █ █████ █      ███  ████   ████ █████
///         █     █   ██ ██ █     █     █   █ █   █ █     █
/// █████   █     █   █ █ █ ████  █     █████ ████   ███  ████
///         █     █   █   █ █     █     █   █ █         █ █
///         █   █████ █   █ █████ █████ █   █ █     ████  █████

function generateTimelapse() {
  timelapseData = []

  const tripTimes = trips.map(trip =>
    (trip.messages ?? []).map(m => Temporal.Instant.from(m.timestamp).epochMilliseconds)
  )

  const t0 = picker.selectedDates[0].getTime()
  const t1 = (picker.selectedDates[1] || picker.selectedDates[0]).getTime() + DAY
  const frameCount = Math.ceil((t1 - t0) / timelapseFrameDuration)

  for (let i = 0; i < frameCount; i++) {
    const start = t0 + i * timelapseFrameDuration
    const end = start + timelapseFrameDuration

    const frameTrips: APITrip[] = []

    for (let t = 0; t < trips.length; t++) {
      const trip = trips[t]
      const times = tripTimes[t]
      if (!trip.messages || times.length === 0) continue

      if (times[0] >= end || times[times.length - 1] < start) continue

      const first = lowerBound(times, start)
      const endIdx = lowerBound(times, end)

      let messages: typeof trip.messages
      if (first < endIdx) {
        // trip is active (messages in frame)
        messages = trip.messages.slice(first, endIdx)
      } else {
        // trip is inactive, but not ended
        messages = trip.messages.slice(first - 1, first)
      }

      frameTrips.push({ ...trip, messages })
    }
    timelapseData.push(frameTrips)
  }
  totalFrames.textContent = timelapseData.length.toString()
}

function renderTimelapseFrame(frame: number, m: MapLibreMap = map, htmlDetails = true, data = timelapseData) {

  (m.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [
      ...data[frame].map<GeoJSON.Feature<GeoJSON.LineString, APITrip>>(trip => {
        const line: number[][] = []
        for (let i = Math.max(0, frame - timelapseTailLength); i < frame; i++) {
          const prevTrip = data[i].find(t => t.tripId == trip.tripId)
          if (prevTrip) line.push(...prevTrip.messages!.map(msg => ([msg.lng, msg.lat])))
        }
        line.push(...trip.messages!.map(msg => ([msg.lng, msg.lat])))
        return {
          type: "Feature" as const,
          geometry: {
            type: "LineString",
            coordinates: line
          },
          properties: trip
        }
      })
    ]
  });
  (m.getSource("points") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [
      ...data[frame].map<GeoJSON.Feature<GeoJSON.Point, APITrip>>(trip => ({
        type: "Feature" as const,
        geometry: {
          type: "Point",
          coordinates: [trip.messages![trip.messages!.length - 1].lng, trip.messages![trip.messages!.length - 1].lat]
        },
        properties: trip
      }))
    ]
  });

  const [min, max] = (!htmlDetails && exportDateRange) || picker.selectedDates/* data.reduce((pf, cf) => {
    const [tripSmallest, tripLargest] = cf.reduce((pt, ct) => {
      const [msgSmallest, msgLargest] = ct.messages!.reduce((pm, cm) => {
        const time = new Date(cm.timestamp).getTime()
        if (time < pm[0]) return [time, pm[1]]
        if (time > pm[1]) return [pm[0], time]
        else return pm
      }, [0, 0] as [number, number])
      if (msgSmallest < pt[0]) return [msgSmallest, pt[1]]
      if (msgLargest > pt[1]) return [pt[0], msgLargest]
      else return pt
    }, [0, 0] as [number, number])
    if (tripSmallest < pf[0]) return [tripSmallest, pf[1]]
    if (tripLargest > pf[1]) return [pf[0], tripLargest]
    else return pf
  }, [0, 0] as [number, number]) */

  m.triggerRepaint()

  const date = Temporal.Instant.fromEpochMilliseconds(min.getTime() + frame * timelapseFrameDuration).toZonedDateTimeISO("Europe/Helsinki")
  const text = `${date.day}.${date.month}.${date.year} ${date.hour.toString().padStart(2, "0")}:${date.minute.toString().padStart(2, "0")}`
  if (htmlDetails) {
    currentFrame.textContent = (timelapseFrame + 1).toString();
    time.textContent = text
  } else {
    return text
  }
}

///       █████ █   █ ████   ███  ████  █████
///       █      █ █  █   █ █   █ █   █   █
/// █████ ████    █   ████  █   █ ████    █
///       █      █ █  █     █   █ █  █    █
///       █████ █   █ █      ███  █   █   █

async function exportTimelapse() {
  if (abortExport) {
    abortExport.abort()
    return
  }
  exportButton.textContent = "Abort export"

  abortExport = new AbortController()

  const progressToast = Toastify({
    text: `Compiling timelapse...`,
    duration: 10000000000,
    gravity: "top",
    position: "right",
    ...toastConfig,
  })
  progressToast.showToast()

  exportMapContainer.hidden = false

  const ffmpeg = new FFmpeg()
  await ffmpeg.load()

  abortExport.signal.addEventListener("abort", () => {
    ffmpeg.terminate()
    abortExport = null
    exportButton.textContent = "Export"
    progressToast.hideToast()
  })

  const resolution = resolutions[exportResPicker.getSelected()[0] as keyof typeof resolutions]
  if (!resolution) return

  exportMapContainer.style.width = `${resolution[0]}px`
  exportMapContainer.style.height = `${resolution[1]}px`
  //exportMapContainer.style.transform = `scale(0.1)`

  if (!abortExport) return

  await new Promise<void>((res) => setTimeout(() => res(), 1000))

  const canvas = exportMap.getCanvas()

  fitMap(exportMap, 0)
  setMapLineWidth(exportMap, 1 * (Math.max(...resolution) / 1000))

  await new Promise<void>((res) => setTimeout(() => res(), 1000))



  const filtered = exportDateRange ? timelapseData.reduce((pf, cf) => {
    const frame = cf.reduce((pt, ct) => {
      const filtered = ct.messages?.filter(msg => (new Date(msg.timestamp).getTime() >= exportDateRange![0].getTime()) && (new Date(msg.timestamp).getTime() < exportDateRange![1].getTime()))
      if (filtered?.length) return [...pt, { ...ct, messages: filtered }]
      if (filtered?.length == 0 && ct.messages!.length > 0) return [...pt, null]
      return pt
    }, new Array<APITrip | null>())
    if (frame.filter(t => t === null).length > frame.length * 0.5) return pf
    return [...pf, frame.filter(t => t !== null)]
  }, new Array<APITrip[]>()) : timelapseData

  if (!abortExport) return
  await ffmpeg.writeFile('font.ttf', await fetchFile("/Jost-VariableFont_wght.ttf"));

  for (let i = 0; i < filtered.length; i++) {
    if (!abortExport) return
    progressToast.toastElement!.textContent = `Rendering frames: ${Math.floor(i / filtered.length * 100)}%` //(${i + 1}/${filtered.length})
    renderTimelapseFrame(i, exportMap, false, filtered)
    await new Promise<void>((res) => exportMap.once("idle", () => res()))
    if (!abortExport) return
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(b)))
    if (!abortExport) return
    await ffmpeg.writeFile(`frame_${i}.png`, await blob.bytes())
  }
  exportMapContainer.hidden = true

  let log = ""
  ffmpeg.on("progress", (ev) => {
    progressToast.toastElement!.textContent = `Compiling video: ${Math.floor(ev.progress * 1000) / 10}%`
  })
  ffmpeg.on("log", (ev) => {
    log += ev.message + "\n"
  })
  const status = await ffmpeg.exec([
    "-framerate", String(10 * timelapseSpeedMultiplier),
    "-i", "frame_%d.png",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "out.mp4",
  ]);
  if (status != 0) {
    progressToast.toastElement!.textContent = "ffmpeg error! see console"
    console.error(log)
    return
  }
  const data = await ffmpeg.readFile("out.mp4")
  const blob = new Blob([typeof data == "string" ? data : new Uint8Array(data)], { type: "video/mp4" })
  const url = URL.createObjectURL(blob)

  progressToast.hideToast()

  const a = document.createElement("a")
  a.href = url
  a.download = `tvis-out.mp4`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)



  ffmpeg.terminate()
  abortExport = null
  exportButton.textContent = "Export"
}

map.once("style.load", () => { if (otherMapLoaded) start(); else otherMapLoaded = true })
exportMap.once("style.load", () => { if (otherMapLoaded) start(); else otherMapLoaded = true })