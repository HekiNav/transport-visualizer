import './style.css'
import { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as GeoJSON from "geojson"

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

const map = new Map({
  container: 'map',
  style: "./map_style.json",
  center: [0, 0],
  zoom: 1
});

const API_URL = "http://localhost:3333"

async function start() {
  const response = await fetch(API_URL + "/api/v1/trips?messages&departureDate=2026-10-15")
  const json: APIResponse<APITrip[]> = await response.json()
  if (!json.success) {
    throw json.message
  }

  const polylines: GeoJSON.Feature<GeoJSON.LineString, {}>[] = json.data.map(trip => 
    ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: (trip.messages || []).map(msg => [msg.lng, msg.lat])
      },
      properties: {}
    })
  )
  map.addSource("lines", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: polylines
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
}
start()