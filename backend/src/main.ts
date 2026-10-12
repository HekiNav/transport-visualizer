import mqtt from "mqtt"

const client = mqtt.connect("wss://rata.digitraffic.fi/mqtt");

client.on("connect", () => {
  console.log("Connected")
  client.subscribe("train-locations/#", (err) => {
  })
})

let startTime: null | number = null
let msgCount = 0

client.on("message", (topic, message) => {
  if (!startTime) startTime = Date.now()
  msgCount++
  if (Date.now() - startTime >= 5000) {
    client.end();
    console.log(msgCount)
  }
});