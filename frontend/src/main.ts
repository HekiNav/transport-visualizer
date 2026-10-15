import './style.css'
import { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new Map({
  container: 'map',
  style: "./map_style.json",
  center: [0, 0],
  zoom: 1
});