import { GeoJSONSource, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import flatpickr from "flatpickr";
import * as GeoJSON from "geojson"
import Split from 'split.js'
import './style.css'
import type { Instance } from 'flatpickr/dist/types/instance';
import SlimSelect from 'slim-select';

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
    closeOnSelect: false
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
    closeOnSelect: false
  },
  events: {
    afterChange() {
      //loadMap()
    },
  }
})

const map = new Map({
  container: 'map',
  style: "./map_style.json",
  center: [0, 0],
  zoom: 1
});

const API_URL = "http://localhost:3333"

function start() {
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
  loadMap()
}


async function loadMap() {
  
  let dateRange: string | null = null
  const dates = picker.selectedDates.map(e => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`)
  if (dates.length == 1) dateRange = `${dates[0]}:${dates[0]}`
  if (dates.length > 1) dateRange = `${dates[0]}:${dates[1]}`

  const dataSources = dataSourcePicker.getSelected()
  const routeTypes = routeTypePicker.getSelected()

  if (dateRange == null || dataSources.length == 0 || routeTypes.length == 0) {
    (map.getSource("lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: []
    })
    return
  }

  const response = await fetch(API_URL + `/api/v1/trips?messages&departureDateRange=${dateRange}&dataSource=${dataSources.join(",")}&routeType=${routeTypes.join(",")}`)
  const json: APIResponse<APITrip[]> = await response.json()
  if (!json.success) {
    throw json.message
  }

  const polylines: GeoJSON.Feature<GeoJSON.LineString, APITrip>[] = json.data.map(({ messages, ...trip }) =>
  ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: (messages || []).map(msg => [msg.lng, msg.lat])
    },
    properties: trip
  })
  );
  (map.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: polylines
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