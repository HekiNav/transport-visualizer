import { GeoJSONSource, LngLatBounds, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import flatpickr from "flatpickr";
import * as GeoJSON from "geojson"
import Split from 'split.js'
import type { Instance } from 'flatpickr/dist/types/instance';
import SlimSelect from 'slim-select';
import Toastify from "toastify-js"

import './style.css'
import "toastify-js/src/toastify.css"


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
  routeType: "BUS" | "TRAIN_LONG_DISTANCE" | "TRAIN_COMMUTER" | "TRAIN_FREIGHT" | "TRAIN_SHUNT" | "TRAIN_OTHER" | "TRAIN_REGIONAL" | "TRAIN_TRANSFER" | "TRAIN_SLEEPER" | "TRAM" | "FERRY" | "LIGHT_RAIL";
  startPointId: string;
  startPointName: string | null;
  messages?: APIMessage[]
}

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
      //loadMap()
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
      "line-color": "#00ffff1f",
      "line-width": 1
    }
  })
  loadDatePicker()

  if (localStorage.getItem("selectedStations")) {
    try {
      console.log(JSON.parse(localStorage.getItem("selectedStations") || "[]"))
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
    return
  }

  const response = await fetch(API_URL + `/api/v1/trips?messages&departureDateRange=${dateRange}&dataSource=${dataSources.join(",")}&routeType=${routeTypes.join(",")}&terminus=${terminuses.join(",")}`)
  const json: APIResponse<APITrip[]> = await response.json()
  if (!json.success) {
    throw json.message
  }

  if (json.data.length == 0) {
    Toastify({
      text: "No data for the selected filters",
      duration: 3000,
      close: true,
      gravity: "top",
      position: "right",
      className: "border-neutral-200 border-2 p-1 rounded text-neutral-200 accent-cyan-500 text-xl active:border-cyan-500 disabled:border-neutral-500 bg-neutral-900!",
      stopOnFocus: true,
    }).showToast()
  }

  const bounds = (json.data[0] && json.data[0].messages && json.data[0].messages?.length > 1) ? new LngLatBounds(json.data[0].messages![0], json.data[0].messages![1]) : null

  const polylines: GeoJSON.Feature<GeoJSON.LineString, APITrip>[] = json.data.map(({ messages, ...trip }) => {
    if (bounds) messages?.forEach(msg => bounds.extend(msg))
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: (messages || []).map(msg => [msg.lng, msg.lat])
      },
      properties: trip
    }
  });
  (map.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: polylines
  })
  if (bounds) map.fitBounds(bounds, {
    padding: 100,
    essential: true,
    duration: 1000
  })
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