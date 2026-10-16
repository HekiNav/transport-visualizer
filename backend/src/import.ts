import fs from 'fs';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { db, type Tx } from './prisma/db';
import streamArray from 'stream-json/streamers/stream-array.js';
import type { CollectionRowOf } from '@prisma/orm-postgres/orm-client';


// Types
type Trip = CollectionRowOf<typeof db.orm.public.Trip>
type RouteType = Trip["routeType"]

type MQTTMessage = {
  source: "DIGITRAFFIC",
  data: any
}
type LatLng = {
  lat: number,
  lng: number
}
type DigiTrafficTrain = {
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

const digitrafficAllTrainDetailsQuery = `
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

const seenTrips = new Map<string, { trip: Trip, lastPos: LatLng, lastTime: Temporal.ZonedDateTime }>()


const stats = { total: 0, noDetails: 0, tooSoon: 0, tooClose: 0, logged: 0 }

async function parseMessage(msg: MQTTMessage, digitrafficTrainDetails: DigiTrafficTrain[], tx: Tx) {
  stats.total++
  try {
    const json = msg.data
    const tripId = `${json.departureDate}/${json.trainNumber}`

    const msgPos = { lat: json.location.coordinates[1], lng: json.location.coordinates[0] }

    if (!seenTrips.has(tripId)) {
      let trip: Trip | null = null
      const dbTrip = await tx.orm.public.Trip.where({ tripId: tripId }).first()
      if (dbTrip) {
        trip = dbTrip
      } else {
        // Prefer already cached data on initial ingest to
        const details = await getDigitrafficDetails(json.trainNumber, json.departureDate, digitrafficTrainDetails)
        if (!details) {
          return null
        } else {
          trip = { ...details, tripId, dataSource: msg.source }
        }
        await tx.orm.public.Trip.create(trip)
      }
      seenTrips.set(tripId, { trip, lastPos: { lat: 0, lng: 0 }, lastTime: new Temporal.ZonedDateTime(0n, "Europe/Helsinki") })
    }
    const now = Temporal.Instant.from(json.timestamp).toZonedDateTimeISO("Europe/Helsinki")
    const seen = seenTrips.get(tripId)

    // This should never happen
    if (!seen) return

    const distance = haversineDistance(seen.lastPos, msgPos)

    // skip event if its been less than 15 seconds or the vehicle has moved less than 10m
    if (Temporal.Duration.compare(now.since(seen.lastTime).abs(), Temporal.Duration.from({ seconds: 15 })) == -1) {
      //console.log(`Skipping ${seen.trip.route} due to time: ${now.since(seen.lastTime).toString()}`)
      stats.tooSoon++
    } else if (distance < 0.01 || (distance > 10 && seen.lastPos.lat != 0)) {
      //console.log(`Skipping ${seen.trip.route} due to distance`)
      stats.tooClose++
      seenTrips.set(tripId, { trip: seen.trip, lastPos: msgPos, lastTime: seen.lastTime })
    } else {
      //console.log(`Logging ${seen.trip.route}`)
      stats.logged++
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

async function getDigitrafficDetails(trainNumber: number, depDate: string, digitrafficTrainDetails: DigiTrafficTrain[]): Promise<Omit<Trip, "dataSource" | "tripId"> | null> {
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


async function GraphQl(query: string, url: string, variables: { [key: string]: any } = {}, headers = {}) {
  try {
    return await (await fetch(url, {
      body: JSON.stringify({
        query,
        variables
      }),
      method: "POST",
      headers
    })).json()
  } catch (error) {
    console.error(`Failed to parse GraphQl Message: ${error}`)
    return null
  }
}



const BATCH_SIZE = 5000;

const allDigitrafficTrainDetails = (await GraphQl(digitrafficAllTrainDetailsQuery, process.env.DIGITRAFFIC_GRAPHQL || "https://rata.digitraffic.fi/api/v2/graphql/graphql", { depDate: "2026-10-01" }, JSON.parse(process.env.DIGITRAFFIC_HEADERS || "{}") || {}))?.data?.trainsByDepartureDate


async function flush(batch: any[]) {
    await db.transaction(async (tx) => {
        for (const value of batch) {
            await parseMessage(
                { data: value, source: 'DIGITRAFFIC' },
                allDigitrafficTrainDetails,
                tx
            );
        }
    });
}

async function importData() {
    const pipeline = chain([
        fs.createReadStream('src/train-locations-2026-10-01.json'),
        parser(),
        streamArray(),
    ]);

    let batch: any[] = [];
    let count = 0;

    for await (const { value } of pipeline) {
        batch.push(value);

        if (batch.length >= BATCH_SIZE) {
            await flush(batch);
            count += batch.length;
            batch = [];
            console.log(`Committed ${count}`);
        }
    }

    if (batch.length) {
        await flush(batch); // final batch
        count += batch.length;
    }

    console.log('END', count, stats);
}

importData().catch((err) => {
    console.error(err);
    process.exit(1);
});
