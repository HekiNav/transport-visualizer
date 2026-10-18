import { GeoJSONSource, LngLatBounds, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import flatpickr from "flatpickr";
import * as GeoJSON from "geojson"
import Split from 'split.js'
import type { Instance } from 'flatpickr/dist/types/instance';
import SlimSelect from 'slim-select';
import Toastify from "toastify-js"
import Coloris from "@melloware/coloris";

import './style.css'
import "toastify-js/src/toastify.css"
import "@melloware/coloris/dist/coloris.css";

// API Types
type APIMessage = {
  lat: number;
  lng: number;
  messageId: number;
  timestamp: Temporal.Instant;
  tripId: string;
}

type APITrip = {
  tripId: string;
  dataSource: "DIGITRAFFIC";
  departureDate: Temporal.PlainDate;
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



let selectedColors = { ...defaultColors }
let selectedColor = ColorSwatch.CYAN
let lastColorReload = 0

let timelapse = false
let timelapseFrameDuration = 60_000
let timelapseTailLength = 10
let trips: APITrip[] = []
let timelapseData: APITrip[][] = []
let timelapseFrame: number = 0
let timelapseTimeout: number | null = null

Coloris.init();

Split(['#content', '#map'], {
  direction: 'horizontal',
  minSize: 50,
  snapOffset: 0,
  gutterSize: 10,
  gutterAlign: "center"
}).setSizes([30, 70])

const picker = flatpickr("#daterange", {
  mode: "range",
  onClose: loadMap
}) as Instance
picker.setDate(["2026-10-01", "2026-10-02"])

const loadButton: HTMLButtonElement = document.querySelector("#load")!

loadButton.addEventListener("click", loadMap)

const resetColorsButton: HTMLButtonElement = document.querySelector("#resetColors")!

resetColorsButton.addEventListener("click", () => {
  selectedColors = { ...defaultColors }
  selectedColor = ColorSwatch.CYAN
  loadColorPickers()
})

const toggleTimelapseButton: HTMLButtonElement = document.querySelector("#toggleTimelapse")!
const timelapseContainer: HTMLButtonElement = document.querySelector("#timelapse")!

toggleTimelapseButton.addEventListener("click", () => {
  timelapse = !timelapse
  timelapseContainer.hidden = !timelapse
  toggleTimelapseButton.textContent = timelapse ? "Switch to normal mode" : "Switch to timelapse"
  map?.setPaintProperty("lines", "line-opacity", timelapse ? 1 : 0.01)
  if (timelapse) {
    renderTimelapseFrame(timelapseFrame)
  } else {
    drawTrips()
  }
})

const playTimelapseButton: HTMLButtonElement = document.querySelector("#playTimelapse")!

playTimelapseButton.addEventListener("click", () => {
  if (!timelapse) return
  if (timelapseTimeout) {
    playTimelapseButton.textContent = "Play"
    clearInterval(timelapseTimeout)
    timelapseTimeout = null
  } else {
    playTimelapseButton.textContent = "Stop"
    timelapseTimeout = setInterval(() => {
      timelapseFrame++
      renderTimelapseFrame(timelapseFrame)
    }, 100)
  }
})

const backgroundMapCheckbox: HTMLInputElement = document.querySelector("#backgroundMap")!

backgroundMapCheckbox.addEventListener("change", () => {
  // map breaks if togglig visibility and loading trip paths at the same time
  if (!map.loaded() || !map.isStyleLoaded()) {
    Toastify({
      text: "Map not loaded, please wait and try again",
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
    return
  }
  map
    .getLayersOrder()
    .map(id => map.getLayer(id))
    .filter(layer => layer?.source == "openmaptiles")
    .forEach(layer => {
      map?.setLayoutProperty(layer?.id || "", "visibility", backgroundMapCheckbox.checked ? "visible" : "none")
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

const map = new Map({
  container: 'map',
  style: "./map_style.json",
  center: [27, 65],
  zoom: 5
});

const API_URL = "http://localhost:3333"

async function start() {
  map.addSource("lines", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  })
  map.addLayer({
    id: "lines",
    source: "lines",
    type: "line",
    paint: {
      "line-color": "#fff",
      "line-width": 1,
      "line-opacity": 0.01
    }
  })
  map.addSource("points", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  })
  map.addLayer({
    id: "points",
    source: "points",
    type: "circle",
    paint: {
      "circle-color": "#fff",
      "circle-radius": 2
    }
  })
  loadDatePicker()
  loadColorPickers()

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

function reloadMapColours() {
  lastColorReload = Date.now()
  let lastTime = lastColorReload
  setTimeout(() => {
    if (lastTime != lastColorReload) return
    if (colorsByRoutetypeCheckbox.checked) {
      map?.setPaintProperty("lines", "line-color", ["match", ["get", "routeType"], ...Object.entries(selectedColors).flat() as [string, string, ...string[]], "#fff"])
      map?.setPaintProperty("points", "circle-color", ["match", ["get", "routeType"], ...Object.entries(selectedColors).flat() as [string, string, ...string[]], "#fff"])
    } else {
      map?.setPaintProperty("lines", "line-color", selectedColor)
      map?.setPaintProperty("points", "circle-color", selectedColor)
    }
  }, 100)
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

async function loadMap() {

  let dateRange: string | null = null
  const dates = picker.selectedDates.map(e => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`)
  if (dates.length == 1) dateRange = `${dates[0]}:${dates[0]}`
  if (dates.length > 1) dateRange = `${dates[0]}:${dates[1]}`

  const dataSources = dataSourcePicker.getSelected()
  const routeTypes = routeTypePicker.getSelected()
  const terminuses = terminusPicker.getSelected()

  if (dateRange == null || dataSources.length == 0 || routeTypes.length == 0) {
    (map.getSource("lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: []
    })
    Toastify({
      text: "No data for the selected filters. Try to add a data source and routeType",
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
    return
  }
  try {
    const response = await fetch(API_URL + `/api/v1/trips?messages&departureDateRange=${dateRange}&dataSource=${dataSources.join(",")}&routeType=${routeTypes.join(",")}&terminus=${terminuses.join(",")}`)
    const json: APIResponse<APITrip[]> = await response.json()


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
      return
    }

    reloadMapColours()

    trips = json.data

    generateTimelapse()


    if (timelapse) {
      timelapseFrame = 0
      renderTimelapseFrame(timelapseFrame)
    } else {
      drawTrips()
    }
    fitMap()




    Toastify({
      text: `Loaded ${json.data.length} trips`,
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
  } catch (error) {
    Toastify({
      text: `Failed to load trips: ${error} ${String(error).includes("RangeError: Invalid string length") ? ". POSSIBLE FIX: Try to request less data." : ""}`,
      duration: 3000,
      gravity: "top",
      position: "right",
      ...toastConfig,
    }).showToast()
  }
}

function drawTrips() {
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
  (map.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: polylines
  });
  (map.getSource("points") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: []
  });
}

function fitMap() {
  const bounds = (trips[0] && trips[0].messages && trips[0].messages?.length > 1) ? new LngLatBounds(trips[0].messages![0], trips[0].messages![1]) : null;
  trips.forEach(({ messages }) => {
    if (bounds) messages?.forEach(msg => bounds.extend(msg));
  })
  if (bounds) map.fitBounds(bounds, {
    padding: 100,
    essential: true,
    duration: 1000
  });
}

function generateTimelapse() {
  timelapseData = []

  const tripTimes = trips.map(trip =>
    (trip.messages ?? []).map(m => Temporal.Instant.from(m.timestamp).epochMilliseconds)
  )

  const DAY = 24 * 60 * 60 * 1000
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

      // filter out if trip is outside frame
      if (times[0] >= end || times[times.length - 1] < start) continue

      const first = lowerBound(times, start)
      const last = lowerBound(times, end) - 1
      if (first >= last) continue

      frameTrips.push({
        ...trip,
        messages: trip.messages.slice(first, last + 1),
      })
    }
    timelapseData.push(frameTrips)
  }
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

function renderTimelapseFrame(frame: number) {
  (map.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [
      ...timelapseData[frame].map<GeoJSON.Feature<GeoJSON.LineString, APITrip>>(trip => {
        const line: number[][] = []
        for (let i = Math.max(0, frame - timelapseTailLength); i < frame; i++) {
          const prevTrip = timelapseData[i].find(t => t.tripId == trip.tripId)
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
  (map.getSource("points") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [
      ...timelapseData[frame].map<GeoJSON.Feature<GeoJSON.Point, APITrip>>(trip => ({
        type: "Feature" as const,
        geometry: {
          type: "Point",
          coordinates: [trip.messages![trip.messages!.length - 1].lng, trip.messages![trip.messages!.length - 1].lat]
        },
        properties: trip
      }))
    ]
  });
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

map.once("style.load", start)