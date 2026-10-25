import mqtt from "mqtt"
import { db, type Tx } from "./prisma/db"
import { and, or, type CollectionRowOf } from "@prisma/orm-postgres/orm-client";
import express, { type NextFunction, type Request, type Response } from "express"
import rateLimit from "express-rate-limit";
import z, { success } from "zod";
import cors from "cors"

// Types
export type Message = CollectionRowOf<typeof db.orm.public.Message>
export type Trip = CollectionRowOf<typeof db.orm.public.Trip>
export type RouteType = Trip["routeType"]

export type MQTTMessage<T = "DIGITRAFFIC" | "HSL"> = {
  source: T,
  data: any
}
export type LatLng = {
  lat: number,
  lng: number
}
export type DigiTrafficTrain = {
  trainNumber: number,
  departureDate: string,
  operator: {
    name: string
    shortCode: string
  }
  timeTableRows: {
    station: {
      shortCode: string
      name: string
    }
  }[]
  trainType: {
    name: string
    trainCategory: {
      name: string
    }
  }
}

export type HslRoute = {
  shortName: string
  gtfsId: string
  type: number,
  mode: string
  longName: string
  agency: {
    name: string
    gtfsId: string
  }
  stops: {
    name: string
    code: string
  }[]
}

type DetailsFor<T = "HSL" | "DIGITRAFFIC"> =
  T extends "HSL" ? HslRoute[] : DigiTrafficTrain[];

// GraphQL queries
const digitrafficTrainDetailsQuery = `
query TrainDetailsQuery($trainNumber: Int!, $depDate: Date!) {
  train(trainNumber: $trainNumber, departureDate: $depDate) {
    trainNumber
    departureDate
    operator {
      name
      shortCode
    }
    timeTableRows {
      station {
        shortCode
        name
      }
    }
    trainType {
      name
      trainCategory {
        name
      }
    }
  }
}
`
export const digitrafficAllTrainDetailsQuery = `
query AllTrainDetailsQuery($depDate: Date!) {
  trainsByDepartureDate(departureDate: $depDate) {
    departureDate
    trainNumber
    operator {
      name
      shortCode
    }
    timeTableRows {
      station {
        shortCode
        name
      }
    }
    trainType {
      name
      trainCategory {
        name
      }
    }
  }
}
`
export const hslAllRouteDetailsQuery = `
{
  routes {
    shortName
    gtfsId
    type
    mode
    longName
    agency {
      name
      gtfsId
    }
    stops {
      name
      code
    }
  }
}
`

export const hslRouteDetailsQuery = `
query RouteQuery($id: String!) {
  route(id: $id) {
    shortName
    gtfsId
    type
    mode
    longName
    agency {
      name
      gtfsId
    }
    stops {
      name
      code
    }
  }
}
`

const digitrafficClient = mqtt.connect("wss://rata.digitraffic.fi/mqtt");

const hslClient = mqtt.connect("mqtts://mqtt.hsl.fi:8883/");

// Batching
let lastDigitrafficBatch: number = Date.now()
const nextDigitrafficBatch: Buffer[] = []

let lastHslBatch: number = Date.now()
const nextHslBatch: Buffer[] = []

const seenTrips = new Map<string, { trip: Trip, lastPos: LatLng, lastTime: Temporal.ZonedDateTime }>()

export function uncompressedLength(req: Request, res: Response, next: NextFunction) {
  const send = res.send.bind(res)

  res.send = (body?: any) => {
    if (!res.headersSent && !res.getHeader("X-Uncompressed-Length")) {
      const len = typeof body === "string" ? Buffer.byteLength(body) : Buffer.isBuffer(body) ? body.length : undefined
      if (len !== undefined) res.set("X-Uncompressed-Length", String(len))
    }
    return send(body)
  }

  next()
}

start()

// Functions
async function start() {


  digitrafficClient.on("connect", () => {
    console.log("Connected to DIGITRAFFIC")
    digitrafficClient.subscribe("train-locations/#", (err) => {
    })
  })

  hslClient.on("connect", () => {
    console.log("Connected to HSL")
    hslClient.subscribe("/hfp/v2/journey/ongoing/vp/#", (err) => {
    })
  })

  const allDigitrafficTrainDetails = (await GraphQl(digitrafficAllTrainDetailsQuery, process.env.DIGITRAFFIC_GRAPHQL || "https://rata.digitraffic.fi/api/v2/graphql/graphql", { depDate: new Date().toISOString().slice(0, 10) }, JSON.parse(process.env.DIGITRAFFIC_HEADERS || "{}") || {}))?.data?.trainsByDepartureDate
  const allHslDetails = (await GraphQl(hslAllRouteDetailsQuery, (process.env.HSL_GRAPHQL || "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1") + "?digitransit-subscription-key=" + process.env.DIGITRANSIT_KEY, {}, { "Content-Type": "application/json" }))?.data?.routes

  digitrafficClient.on("message", (topic, message) => {

    if (Date.now() - lastDigitrafficBatch >= 500) {
      const currentDigitrafficBatch = [...nextDigitrafficBatch]
      lastDigitrafficBatch = Date.now()
      nextDigitrafficBatch.length = 0
      //console.log(`Processing batch: ${currentDigitrafficBatch.length} messages`)
      db.transaction(tx =>
        Promise.all(currentDigitrafficBatch.map((msg, i) => parseMessage({ data: JSON.parse(msg.toString()), source: "DIGITRAFFIC" }, allDigitrafficTrainDetails, tx)))
      )
    }

    nextDigitrafficBatch.push(message)
  });

  hslClient.on("message", async (topic, message) => {

    if (Date.now() - lastHslBatch >= 500) {
      const currentHslBatch = [...nextHslBatch]
      lastHslBatch = Date.now()
      nextHslBatch.length = 0
      //console.log(`Processing HSL batch: ${currentHslBatch.length} messages`)
      await Promise.all(currentHslBatch.map((msg, i) => db.transaction(tx => parseMessage({ data: JSON.parse(msg.toString()).VP, source: "HSL" }, allHslDetails, tx))))
    }

    nextHslBatch.push(message)
  });

  const app = express()

  app.use(uncompressedLength)

  const limiter = rateLimit({
    limit: Number(process.env.RATE_LIMIT_AMOUNT),
    windowMs: Number(process.env.RATE_LIMIT_MINUTES) * 60_000,
    message: { code: 429, message: `Requests are rate limited to ${process.env.RATE_LIMIT_AMOUNT} in a ${process.env.RATE_LIMIT_MINUTES} minute period`, success: false }
  })
  app.use(cors({
    exposedHeaders: ["X-Uncompressed-Length"],
  }))
  app.use(limiter)

  app.listen(process.env.API_PORT, () => {
    console.log("Api ready")
  })

  app.get("/api/v1/trips", async (req, res) => {
    let query = db.orm.public.Trip

    try {
      if (req.query.departureDate) {
        query = query.where(p => p.departureDate.eq(Temporal.PlainDate.from(req.query.departureDate!.toString())))
      }
      if (req.query.departureDateRange) {
        const [min, max] = req.query.departureDateRange.toString().split(":")
        if (!min || !max) throw "Invalid departureDateRange format. Valid format is YYYY-MM-DD:YYYY-MM-DD"
        query = query.where(p => and(p.departureDate.lte(Temporal.PlainDate.from(max)), p.departureDate.gte(Temporal.PlainDate.from(min))))
      }
      if (req.query.startPoint) {
        query = query.where(p => p.startPointId.in(req.query.startPoint?.toString().split(",") || []))
      }
      if (req.query.endPoint) {
        query = query.where(p => p.endPointId.in(req.query.endPoint?.toString().split(",") || []))
      }
      if (req.query.terminus) {
        query = query.where(p => or(p.startPointId.in(req.query.terminus?.toString().split(",") || []), p.endPointId.in(req.query.terminus?.toString().split(",") || [])))
      }
      if (req.query.dataSource) {
        const typeEnum = z.array(z.enum(["DIGITRAFFIC", "HSL"]))
        const { success, data, error } = await typeEnum.safeParseAsync(req.query.dataSource.toString().split(","))
        if (!success) {
          throw `Invalid dataSource: ${z.treeifyError(error).errors}`
        } else {
          query = query.where(p => p.dataSource.in(data))
        }
      }
      if (req.query.routeType) {
        const typeEnum = z.array(z.enum(["BUS", "TRAIN_LONG_DISTANCE", "TRAIN_COMMUTER", "TRAIN_FREIGHT", "TRAIN_SHUNT", "TRAIN_OTHER", "TRAIN_REGIONAL", "TRAIN_TRANSFER", "TRAIN_SLEEPER", "TRAM", "FERRY", "LIGHT_RAIL", "METRO"]))
        const { success, data, error } = await typeEnum.safeParseAsync(req.query.routeType.toString().split(","))
        if (!success) {
          throw `Invalid routeType: ${z.treeifyError(error).errors}`
        } else {
          query = query.where(p => p.routeType.in(data))
        }
      }
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Failed to parse parameter: ${error}`,
        success: false
      })
      return
    }

    if (req.query.messages !== undefined) {
      query = query.include("messages", (p) => p.orderBy((e) => e.timestamp.asc()))
    }
    try {
      const trips = await query.all()
      res.json({
        data: trips,
        success: true
      })
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Failed to query data: ${error}`,
        success: false
      })
    }

  })
  app.get("/api/v1/dates", async (req, res) => {
    try {
      let query = db.orm.public.Trip.select("departureDate").distinct("departureDate")
      try {
        if (req.query.dataSource) {
          const typeEnum = z.array(z.enum(["DIGITRAFFIC", "HSL"]))
          const { success, data, error } = await typeEnum.safeParseAsync(req.query.dataSource.toString().split(","))
          if (!success) {
            throw `Invalid dataSource: ${z.treeifyError(error).errors}`
          } else {
            query = query.where(p => p.dataSource.in(data))
          }
        }
      } catch (error) {
        res.status(500).json({
          code: 500,
          message: `Failed to parse parameter: ${error}`,
          success: false
        })
        return
      }
      const dates = await query.all()
      res.json({
        data: dates.map(t => t.departureDate),
        success: true
      })
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: `Failed to query data: ${error}`,
        success: false
      })
    }

  })

}

// Very messy message parsing
export async function parseMessage<T extends "HSL" | "DIGITRAFFIC" = "HSL" | "DIGITRAFFIC">(msg: MQTTMessage<T>, detailData: DetailsFor<T>[], tx: Tx) {
  try {
    const json = msg.data
    const tripId = msg.source == "HSL" ? `HSL/${json.oday}/${json.start}/${json.route}/${json.dir}-${json.oper}/${json.veh}` : `${json.departureDate}/${json.trainNumber}`

    const msgPos = msg.source == "HSL" ? { lat: json.lat, lng: json.long } : { lat: json.location.coordinates[1], lng: json.location.coordinates[0] }

    if (!seenTrips.has(tripId)) {
      let trip: Trip | null = null
      const dbTrip = await tx.orm.public.Trip.where({ tripId: tripId }).first()
      if (dbTrip) {
        trip = dbTrip
      } else {
        // Prefer already cached data on initial ingest to
        const details = msg.source == "HSL" ? await getHslDetails(addHSLPrefix(json.route), json.oday, detailData as any) : await getDigitrafficDetails(json.trainNumber, json.departureDate, detailData as any)
        if (!details) {
          return null
        } else {
          trip = { ...details, tripId, dataSource: msg.source }
        }
        await tx.orm.public.Trip.create(trip)
      }
      seenTrips.set(tripId, { trip, lastPos: { lat: 0, lng: 0 }, lastTime: new Temporal.ZonedDateTime(0n, "Europe/Helsinki") })
    }
    const now = Temporal.Instant.from(msg.source == "HSL" ? json.tst : json.timestamp).toZonedDateTimeISO("Europe/Helsinki")
    const seen = seenTrips.get(tripId)

    // This should never happen
    if (!seen) return
    // Overlap in data, exclude HSL commuter trains becaus ethey existin DIGITRAFFIC data already
    if (msg.source == "HSL" && seen.trip.routeType == "TRAIN_COMMUTER") return

    const distance = haversineDistance(seen.lastPos, msgPos)

    // skip event if its been less than 15 seconds or the vehicle has moved less than 10m
    if (Temporal.Duration.compare(now.since(seen.lastTime), Temporal.Duration.from({ seconds: 15 })) == -1) {
      //console.log(`Skipping ${seen.trip.route} due to time: ${now.since(seen.lastTime).toString()}`)
    } else if (distance < 0.01 || (distance > 10 && seen.lastPos.lat != 0)) {
      //console.log(`Skipping ${seen.trip.route} due to distance`)
      seenTrips.set(tripId, { trip: seen.trip, lastPos: msgPos, lastTime: seen.lastTime })
    } else {
      //console.log(`Logging ${seen.trip.route}`)
      await tx.orm.public.Message.create({
        ...msgPos,
        timestamp: Temporal.Instant.from(now),
        tripId
      })

      seenTrips.set(tripId, { trip: seen.trip, lastPos: msgPos, lastTime: now })
    }

  } catch (error) {
    console.error(`Failed to parse MQTT Message: ${error}`)
    return null
  }
  return null
}


export async function getDigitrafficDetails(trainNumber: number, depDate: string, digitrafficTrainDetails: DigiTrafficTrain[]): Promise<Omit<Trip, "dataSource" | "tripId"> | null> {
  const train: DigiTrafficTrain = digitrafficTrainDetails.find(train => train.departureDate == depDate && train.trainNumber == trainNumber) || (await GraphQl(digitrafficTrainDetailsQuery, process.env.DIGITRAFFIC_GRAPHQL || "https://rata.digitraffic.fi/api/v2/graphql/graphql", { trainNumber, depDate }, JSON.parse(process.env.DIGITRAFFIC_HEADERS || "{}") || {})).data.train[0]
  if (!train) return null
  const firstStation = train.timeTableRows[0]!.station
  const lastStation = train.timeTableRows[train.timeTableRows.length - 1]!.station

  return {
    startPointId: firstStation.shortCode,
    startPointName: firstStation.name,
    endPointId: lastStation.shortCode,
    endPointName: lastStation.name,
    operatorId: train.operator.shortCode,
    operatorName: train.operator.name,
    routeType: digitrafficDataToRouteType(train.trainType),
    route: `${train.trainType.name} ${trainNumber}`,
    departureDate: Temporal.PlainDate.from(depDate)
  }
}

export async function getHslDetails(routeId: string, depDate: string, hslDetails: HslRoute[]): Promise<Omit<Trip, "dataSource" | "tripId"> | null> {
  const route: HslRoute = hslDetails.find(route => route.gtfsId == routeId) ||
    (await GraphQl(hslRouteDetailsQuery, (process.env.HSL_GRAPHQL || "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1") + "?digitransit-subscription-key=" + process.env.DIGITRANSIT_KEY, { id: routeId }, { "Content-Type": "application/json" }))?.data?.route
  if (!route) return null
  const firstStation = route.stops[0]!
  const lastStation = route.stops[route.stops.length - 1]!

  return {
    startPointId: firstStation.code,
    startPointName: firstStation.name,
    endPointId: lastStation.code,
    endPointName: lastStation.name,
    operatorId: stripHSLPrefix(route.agency.gtfsId),
    operatorName: route.agency.name,
    routeType: hslRouteType(route.type || -1, route.mode),
    route: route.shortName,
    departureDate: Temporal.PlainDate.from(depDate)
  }
}

function stripHSLPrefix(input: string) {
  return input.replace("HSL:", "")
}

function addHSLPrefix(input: string) {
  return `HSL:${input}`
}

function digitrafficDataToRouteType(trainType: { name: string, trainCategory: { name: string } }): RouteType {
  switch (trainType.name) {
    case "PAR":
      return "TRAIN_SHUNT"
    case "HL":
      return "TRAIN_COMMUTER"
    case "VET":
      return "TRAIN_TRANSFER"
    case "VEV":
      return "TRAIN_SHUNT"
    case "H":
      return "TRAIN_REGIONAL"
    case "PVS":
      return "TRAIN_LONG_DISTANCE"
    case "HV":
      return "TRAIN_SHUNT"
    case "P":
      return "TRAIN_LONG_DISTANCE"
    case "HDM":
      return "TRAIN_REGIONAL"
    case "PVV":
      return "TRAIN_LONG_DISTANCE"
    case "VLI":
      return "TRAIN_SHUNT"
    case "S":
      return "TRAIN_LONG_DISTANCE"
    case "HLV":
      return "TRAIN_COMMUTER"
    case "T":
      return "TRAIN_FREIGHT"
    case "V":
      return "TRAIN_SHUNT"
    case "W":
      return "TRAIN_SHUNT"
    case "IC2":
      return "TRAIN_LONG_DISTANCE"
    case "IC":
      return "TRAIN_LONG_DISTANCE"
    case "HSM":
      return "TRAIN_COMMUTER"
    case "AE":
      return "TRAIN_LONG_DISTANCE"
    case "PYO":
      return "TRAIN_SLEEPER"
    case "MV":
      return "TRAIN_TRANSFER"
    case "MUS":
      return "TRAIN_LONG_DISTANCE"
    case "TYO":
      return "TRAIN_OTHER"
    case "MUV":
      return "TRAIN_TRANSFER"
    case "SAA":
      return "TRAIN_SHUNT"
    case "LIV":
      return "TRAIN_OTHER"
    case "RJ":
      return "TRAIN_FREIGHT"
    case "PAI":
      return "TRAIN_SHUNT"
    default:
      return "TRAIN_OTHER"
  }
}

function hslRouteType(mode: number, stringMode?: string): RouteType {
  switch (mode) {
    case 109:
      return "TRAIN_COMMUTER"
    case 102:
      return "TRAIN_LONG_DISTANCE"
    case 701:
    case 704:
    case 700:
    case 715:
    case 702:
    case 714:
    case 3:
      return "BUS"
    case 900:
      return "LIGHT_RAIL"
    case 0:
      return "TRAM"
    case 1:
      return "METRO"
    case 4:
    case 1008:
      return "FERRY"
    default:
      switch (stringMode) {
        case "BUS-EXPRESS": return "BUS"
        case "COACH": return "BUS"
        case "SPEEDTRAM": return "LIGHT_RAIL"
        case "BUS": return "BUS"
        case "TRANSIT": return "BUS"
        case "RAIL": return "TRAIN_COMMUTER"
        case "SUBWAY": return "METRO"
        case "TRAM": return "TRAM"
        case "TROLLEYBUS": return "TRAM"
        case "FERRY": return "FERRY"
      }
      return "BUS"
  }
}

function haversineDistance(coords1: LatLng, coords2: LatLng) {
  function toRad(x: number) {
    return x * Math.PI / 180;
  }

  var lon1 = coords1.lng;
  var lat1 = coords1.lat;

  var lon2 = coords2.lng;
  var lat2 = coords2.lat;

  var R = 6371; // km

  var x1 = lat2 - lat1;
  var dLat = toRad(x1);
  var x2 = lon2 - lon1;
  var dLon = toRad(x2)
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c;

  return d;
}


export async function GraphQl(query: string, url: string, variables: { [key: string]: any } = {}, headers = {}) {
  try {
    const text = await (await fetch(url, {
      body: JSON.stringify({
        query,
        variables
      }),
      method: "POST",
      headers
    })).text()
    return JSON.parse(text)
  } catch (error) {
    console.error(`Failed to parse GraphQl Message: ${error}`)
    return null
  }
}