# Building a private web app for a Grant Aerona heat pump

## Abstract

This case study describes a local-first monitoring and control system for a Grant Aerona heat pump fitted with an ecoNET 300 controller. It began as an attempt to improve on the vendor phone app: one clear mobile view of the system, a handful of useful remote controls, and better insight into heat-pump performance. It became a small self-hosted HTTPS web application, with Home Assistant as the integration and security boundary.

It is an owner-built supervisory interface, not a replacement for the heat-pump controller, installer commissioning or servicing. The ecoNET controller continues to control the heat pump and retain its safety limits.

## 1. Initial goals

The installation consists of a Grant Aerona heat pump, tank-mounted ecoNET 300 touchscreen controller, DHW cylinder, Circuit 2 radiators, white room thermostat and outdoor sensor. Home Assistant already ran on an always-on BRIX computer.

The project goals were to:

- show the important heating, DHW and performance values in one phone-friendly view;
- use the controller's LAN interface rather than depend entirely on a vendor cloud app;
- make a few familiar, reversible controls available remotely;
- understand day-to-day efficiency from live data; and
- keep controller and Home Assistant credentials out of the mobile browser.

The active controls were deliberately constrained to known user-facing actions: one-off DHW loading, Circuit 2 Comfort/Day mode, Circuit 2 Night/Eco mode, and return to the normal schedule. The native weekly schedule and heating curve remain controller-owned settings.

## 2. Final architecture

```text
Phone browser
     |
     | HTTPS, app login, signed 60-day session
     v
YunoHost Nginx + Aerona web-app Docker container
     |
     | Home Assistant REST API; token is server-side only
     v
Home Assistant on the BRIX
     |
     | private-LAN controller HTTP
     v
Grant ecoNET 300 controller  --->  Aerona heat pump, DHW and Circuit 2
```

The Docker app runs on an always-on Debian/YunoHost server, bound only to `127.0.0.1`. YunoHost's Nginx reverse proxy publishes it over a certificate-backed HTTPS subdomain. Port 8787 is not opened to the internet. The browser cannot see the ecoNET credentials, cannot see the Home Assistant token, and cannot make arbitrary Home Assistant requests.

## 3. Alternatives considered

### Controller touchscreen and ecoNET phone app

They remain useful for full configuration, service functions and the native schedule. They did not offer the preferred dashboard or a convenient “warm the house before arrival” workflow.

### A Home Assistant dashboard only

Home Assistant is central to the solution and can display the data. A dedicated app was chosen because it could be designed around one installation, present only the commonly used controls, and be comfortable on a phone.

### Direct browser access to ecoNET

This was rejected. It would expose the controller's basic-auth credentials in the browser and make remote access unsafe. Direct controller calls remain within the private LAN, issued by Home Assistant.

### Running Docker on the Manjaro desktop

This worked initially, but the app disappeared whenever the desktop slept. Moving it to the always-on YunoHost/Debian server solved that reliability problem.

### Editing the native weekly schedule

The controller contains packed schedule parameters, but the documented Wi-Fi schedule endpoint returned an empty schedule object. Writing packed internal values without a verified write protocol risks corrupting the schedule. A safer alternative was adopted: temporary Comfort mode for a chosen duration, and Eco mode until manually resumed.

## 4. Methodology

The work proceeded in small, testable layers.

1. **Discover the interface.** Live data was read from `/econet/regParams`; editable settings from `/econet/editParams`; before/after comparisons identified known controller parameters.
2. **Create stable HA entities.** REST sensors translate controller JSON into named Home Assistant entities with units. A small set of `rest_command` services performs known writes.
3. **Validate each action.** Commands were first called in Home Assistant Developer Tools, then verified in the API response and on the ecoNET touchscreen.
4. **Calculate operational performance.** Water flow, flow/return temperatures and electrical power were combined into estimated thermal output and COP.
5. **Build a narrow application API.** The app reads selected HA entities and calls selected HA services. It does not expose an arbitrary HA proxy.
6. **Harden deployment.** Secrets live in `.env`; a server-side login session replaced recurring browser Basic Auth prompts; an HTTPS reverse proxy is the only public entry point.
7. **Tune cautiously.** Weather compensation was enabled without changing curve or shift at the same time, allowing its behaviour to be observed first.

This separation makes faults easier to trace: controller, HA mapping, HA service, app display and reverse proxy are independent layers.

## 5. Final objectives achieved

The completed dashboard shows:

- Circuit 2 effective heating target, room temperature, outdoor temperature and active mode;
- Night/Eco target and schedule state;
- actual cylinder temperature and DHW target;
- live electrical power and estimated energy today and since setup;
- water flow rate, fan speed and water pressure;
- estimated thermal output, live COP, combined seasonal SPF, and split heating/DHW COP and SPF when the three-way-valve state identifies the load; and
- a last-update time, making it clear that data is sampled.

It offers these active controls:

- **DHW boost:** asks the controller for its one-off cylinder loading;
- **Arrival Heat:** sets Circuit 2 to Comfort/Day for 1, 2, 4 or 8 hours, then restores Scheduled mode automatically;
- **Hold Eco while away:** sets Circuit 2 to Night/Eco until manually resumed; and
- **Resume schedule:** returns control to the controller's day/night programme.

The scheduled return time is stored in a Docker-mounted `data/` directory, so a container restart does not silently leave Comfort mode active.

## 6. Controller data and performance calculations

The implementation maps observed controller data to Home Assistant entities. Important examples are:

| Purpose | ecoNET source |
| --- | --- |
| Circuit 2 room temperature | `curr.Circuit2thermostatTemp` |
| Cylinder temperature | `curr.TempCWU` |
| Outdoor temperature | `curr.TempWthr` |
| Water flow | `curr.currentFlow` |
| Electrical power | live electrical-power tile × 1000 |

Estimated heat output is calculated as:

```text
thermal output (W) = flow (L/min) × (flow temperature − return temperature) × 69.77
live COP = estimated thermal output / electrical power
```

The `69.77` factor is the approximate heat capacity and density of water expressed for litres per minute and degrees Celsius. Home Assistant integration sensors accumulate estimated thermal and electrical energy; their ratio produces the displayed seasonal performance factor (SPF).

The results are useful operational estimates, particularly for trends and comparisons. They are not certified SCOP figures. Sensor accuracy, measurement position, pump consumption, defrosting, DHW stratification, auxiliary heat, sampling interval and integration start date all influence them. Billing-grade or certification-grade figures require a dedicated electricity meter and calibrated heat meter.

## 7. Weather compensation

The installation had been in Fixed mode, which hid the curve-editing menu. Switching to Weather mode revealed the controller's heating curve. The existing curve of 1.1 with shift 0 was deliberately retained at first.

Weather compensation can improve efficiency by asking for only the necessary flow temperature as outdoor conditions change. A sensible adjustment process is:

1. leave curve and shift unchanged for several days of normal occupation;
2. observe comfort, flow temperature, compressor behaviour and COP over varying weather;
3. make one small curve or shift change only if rooms are consistently too warm or cool;
4. allow one or two days before judging the result; and
5. do not change schedule, room setpoint and curve at the same time.

Grant UK provides useful background in its [heating-curve guidance](https://www.grantuk.com/professional/support/product-support/air-source-heat-pumps/general-advice/how-to-adjust-the-heating-curve-using-the-aerona-smart-controller/). Commissioning limits and safety settings should remain with a competent installer.

## 8. User guide

### Sign in

Open the app's HTTPS address and sign in using the app credentials. The server creates a signed HttpOnly cookie valid for 60 days. Use **Sign out** on a shared device.

### Read the dashboard

- The large heating circle shows the effective Circuit 2 target. During Arrival Heat it follows Comfort mode; otherwise it follows the normal scheduled state.
- Room and outdoor temperatures appear inside the heating circle.
- The hot-water circle shows actual cylinder temperature and the smaller DHW target. Its progress ring shows approach to target.
- The system row shows flow rate, fan speed and water pressure. Zero flow or fan speed while idle is normal.
- Performance values should be read as trends across complete heating or DHW cycles, not as laboratory measurements.

### Start DHW boost

Tap **DHW boost**. This requests one-off cylinder loading from the controller. Confirm it through the dashboard: cylinder temperature, three-way-valve state and electrical power should respond as expected. The controller retains all stopping and safety conditions.

### Warm the house before arriving

Choose 1 h, 2 h, 4 h or 8 h under **Warm house before arrival**. Circuit 2 enters Comfort/Day mode, then returns to Scheduled mode automatically. Choose **Resume schedule** to end it early.

### Hold Eco while away

Choose **Hold Eco while away** to use Circuit 2 Night/Eco mode indefinitely. It is appropriate for an open-ended absence. Choose **Resume schedule** when returning.

### Change weather compensation

Change the curve at the controller, not the app. Alter one variable at a time and use the dashboard to compare room comfort, flow temperature and COP. Never bypass frost protection, safety limits or installer configuration.

### Troubleshoot a missing value

Some delay is normal because HA and the app poll data. If a value stays unavailable:

1. check its Home Assistant entity in **Developer Tools → States**;
2. confirm Home Assistant can reach ecoNET over the LAN;
3. check the corresponding HA REST sensor configuration;
4. inspect app logs with `sudo docker compose logs --tail=80`; and
5. refresh the browser only after the HA entity is valid.

Showing an unavailable state is safer than inventing a value.

## 9. Advantages and disadvantages

### Advantages

- **Local-first operation:** the controller retains normal control and the integration works on the private LAN.
- **Focused mobile UI:** one screen presents the values and actions relevant to this installation.
- **Credential isolation:** ecoNET credentials and HA token remain server-side; only HTTPS reaches the internet.
- **Useful remote scenarios:** temporary Comfort and indefinite Eco meet arrival and absence needs without rewriting the native schedule.
- **Operational visibility:** flow, fan speed, pressure and estimated COP make heat-pump behaviour easier to interpret.
- **Independence:** source code, calculations and deployment are inspectable and maintainable without depending on a vendor cloud interface.

### Disadvantages and limitations

- **Unofficial parameter mapping:** ecoNET fields were discovered rather than supplied as a stable public API; firmware or product variants may differ.
- **No native schedule editor:** packed schedule writes are intentionally not attempted without a verified protocol.
- **Estimated efficiency:** COP and SPF are operational estimates, not certified measurements.
- **More services to maintain:** controller, LAN, Home Assistant, Docker host, reverse proxy and app must remain healthy.
- **Sampling rather than control-loop speed:** values have a small polling delay.
- **Not a safety system:** it must not be used for commissioning, refrigerant work, electrical safety or emergency control.
- **Web app rather than native iOS software:** it can be added to an iPhone home screen, but it is not an App Store application.

## 10. Future work

The strongest improvements would be a dedicated electricity meter, a calibrated heat meter, automated configuration backups, and alerts for low pressure, failed requests or prolonged poor COP. Native schedule editing should only be considered after a safe controller write format has been independently verified.

## Conclusion

This project shows that a useful heat-pump interface need not replace the manufacturer's controller or expose it to the internet. Keeping ecoNET local, using Home Assistant as the boundary, and publishing only a few tested actions through a small HTTPS app delivers a clearer view of the Aerona and practical control for ordinary life.

The essential discipline is restraint: observe first, make one change at a time, and allow the heat pump's own safety and scheduling functions to remain authoritative.

## 11.Acknowledgement
This project was completed with the use of chatGPT Version 26.908.70816
