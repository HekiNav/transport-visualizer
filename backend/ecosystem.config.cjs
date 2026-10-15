module.exports = {
  apps : [{
    name   : "tvis",
    script : "./dist/index.cjs",
    cron_restart: "0 * * * *"
  }]
}