# ecoNET MQTT publisher on YunoHost

This optional companion container polls the ecoNET controller locally and publishes
its values to Home Assistant's Mosquitto broker. It is useful for values that are
not already provided by the Home Assistant REST sensors, including the three-way
valve state.

Run it on an always-on Docker host such as YunoHost. Do not expose the controller
or MQTT broker to the internet.

## Deploy

From a checkout of this repository on YunoHost:

```bash
cd ~/aerona-webapp/deploy/econet-mqtt-publisher
cp .env.example .env
nano .env
sudo docker compose up -d --build
```

Set the controller and MQTT passwords only in the local `.env` file. It is
ignored by Git and must never be committed.

## Check it

```bash
sudo docker compose ps
sudo docker compose logs --tail=60
```

Home Assistant should show the `Grant Aerona ecoNET` MQTT device within roughly
one polling interval. In particular,
`sensor.grant_aerona_econet_three_way_valve_state` should report `CH` or
`DHW` while the controller supplies that value.

The container uses `restart: unless-stopped`, so it resumes after a YunoHost
reboot.
