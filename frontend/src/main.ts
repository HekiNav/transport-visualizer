import { GeoJSONSource, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import flatpickr from "flatpickr";
import * as GeoJSON from "geojson"
import Split from 'split.js'
import './style.css'
import type { Instance } from 'flatpickr/dist/types/instance';

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
}).setSizes([20, 80])

const picker = flatpickr("#daterange", {
  mode: "range",
  onClose: (selectedDates, dateStr) => {
    if (selectedDates.length < 1) loadMap()
    if (dateStr.split(" to ").length == 1) loadMap(`${dateStr}:${dateStr}`)
    else loadMap(dateStr.replace(" to ", ":"))
  }
}) as Instance

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
      "line-color": "#0ff2",
      "line-width": 1
    }
  })  
  initDatepicker()
  loadMap()

}
async function loadMap(dateRange = "") {
  const response = await fetch(API_URL + `/api/v1/trips?messages&departureDateRange=${dateRange}`)
  const json: APIResponse<APITrip[]> = await response.json()
  if (!json.success) {
    throw json.message
  }

  const polylines: GeoJSON.Feature<GeoJSON.LineString, {}>[] = json.data.map(({ messages, ...trip }) =>
  ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: (messages || []).map(msg => [msg.lng, msg.lat])
    },
    properties: {}
  })
  );
  (map.getSource("lines") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: polylines
  })
}

async function initDatepicker() {
  const response = await fetch(API_URL + "/api/v1/dates")
  const json: APIResponse<APITrip[]> = await response.json()
  if (!json.success) {
    console.error(json.message)
    return
  }
  picker.set("minDate", json.data[0])
  picker.set("maxDate", json.data[json.data.length - 1])
}

map.once("style.load", start)