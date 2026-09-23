# Aerona LAN web app

A phone-friendly dashboard and control surface for a Grant Aerona / ecoNET controller. It runs in Docker on a local machine and talks only to Home Assistant; the browser never contacts the ecoNET hub directly.

![Licence](https://img.shields.io/badge/licence-not%20yet%20chosen-lightgrey)

## What it does

- Displays Circuit 2 target, room and outdoor temperatures, heating mode, live electrical power, and estimated energy.
- Displays the actual cylinder temperature and DHW target.
- Provides a 20°C / 20-minute Circuit 2 boost and a one-off DHW-loading request.
- Uses a local sign-in page with an HttpOnly 60-day device session.
- Keeps the Home Assistant token and controller credentials out of the browser.

## Prerequisites

- Docker and Docker Compose on a machine that can reach Home Assistant.
- A Home Assistant Long-Lived Access Token.
- Home Assistant entities with the IDs configured in `server.js`, including:
  - `sensor.grant_circuit_2_room_temperature`
  - `sensor.grant_aerona_econet_cylinder_temperature`
  - `sensor.grant_aerona_econet_outdoor_sensor_temperature`
  - the Circuit 2, DHW and energy sensors listed in `server.js`
- The HA actions `script.grant_circuit2_20c_20m_boost` and `rest_command.grant_dhw_one_off_loading`.

The Circuit 2 room sensor should read the controller value at `curr.Circuit2thermostatTemp`, not the ASHP ambient-air value.

## Deploy

1. In Home Assistant, open your user profile and create a **Long-Lived Access Token**. Treat it as a password; never commit or share it.
2. Create your private environment file:

   ```bash
   cp .env.example .env
   nano .env
   ```

3. Set `HA_URL` to your real Home Assistant URL, paste the token into `HA_TOKEN`, choose a strong `APP_PASSWORD`, then generate a session secret:

   ```bash
   openssl rand -hex 32
   ```

   Paste that output after `SESSION_SECRET=` in `.env`.

4. Build and start the app:

   ```bash
   docker compose up -d --build
   docker compose logs --tail=50
   ```

5. Open `http://YOUR_DOCKER_HOST:8787` from your LAN. Sign in once; the device session lasts 60 days unless you choose **Sign out**.

## Security model

The browser communicates only with this app. The app holds the Home Assistant token server-side and exposes only the dashboard's selected sensors and two verified actions. It does not expose a general Home Assistant API or direct ecoNET access.

This deployment uses HTTP and is intended for a trusted LAN. Do not expose port 8787 to the internet. Use HTTPS before broader network use.

## Repository hygiene

`.env` is excluded by `.gitignore`. Before any commit, run:

```bash
git status --ignored
```

Confirm that `.env` appears under ignored files and never under files staged for commit.
