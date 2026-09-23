import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 8787);
const haUrl = (process.env.HA_URL || "").replace(/\/$/, "");
const haToken = process.env.HA_TOKEN || "";
const appUsername = process.env.APP_USERNAME || "";
const appPassword = process.env.APP_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const cookieSecure = process.env.COOKIE_SECURE === "true";
const publicDir = join(process.cwd(), "public");
const sessionLifetimeSeconds = 60 * 24 * 60 * 60;

if (!haUrl || !haToken || !appUsername || !appPassword || !sessionSecret) {
  throw new Error("HA_URL, HA_TOKEN, APP_USERNAME, APP_PASSWORD and SESSION_SECRET must be set in .env");
}

const entities = {
  comfortTarget: "sensor.grant_circuit_2_comfort_target",
  roomTemp: "sensor.grant_circuit_2_room_temperature",
  outdoorTemp: "sensor.grant_aerona_econet_outdoor_sensor_temperature",
  ecoTarget: "sensor.grant_circuit_2_eco_target",
  mode: "sensor.grant_circuit_2_mode",
  boostRemaining: "sensor.grant_circuit_2_boost_remaining",
  dhwSetpoint: "sensor.grant_dhw_setpoint",
  cylinderTemp: "sensor.grant_aerona_econet_cylinder_temperature",
  power: "sensor.grant_controller_electrical_power",
  energyToday: "sensor.grant_estimated_electrical_energy_today",
  energyTotal: "sensor.grant_estimated_electrical_energy"
};

function credentialsMatch(username, password) {
  const supplied = `${username}:${password}`;
  const expected = `${appUsername}:${appPassword}`;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function signedSession(expiresAt) {
  const signature = createHmac("sha256", sessionSecret).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${signature}`;
}

function sessionCookie(value, maxAge) {
  return `aerona_session=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${cookieSecure ? "; Secure" : ""}`;
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie || "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function authorised(request) {
  const session = cookieValue(request, "aerona_session");
  if (!session) return false;
  const separator = session.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = Number(session.slice(0, separator));
  const signature = session.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = signedSession(expiresAt).split(".")[1];
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) request.destroy();
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid request")); }
    });
    request.on("error", reject);
  });
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Cache-Control": "no-store", ...headers });
  response.end(body);
}

async function fromHa(path, options = {}) {
  const response = await fetch(`${haUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${haToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Home Assistant returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function overview() {
  const entries = await Promise.all(Object.entries(entities).map(async ([key, entityId]) => {
    const state = await fromHa(`/api/states/${entityId}`);
    return [key, { state: state.state, unit: state.attributes.unit_of_measurement || "" }];
  }));
  return Object.fromEntries(entries);
}

function contentType(path) {
  return ({ ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json" })[extname(path)] || "application/octet-stream";
}

async function staticFile(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const path = normalize(join(publicDir, requested));
  if (!path.startsWith(publicDir)) return send(response, 403, "Forbidden");
  try {
    const contents = await readFile(path);
    send(response, 200, contents, { "Content-Type": contentType(path) });
  } catch {
    send(response, 404, "Not found");
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === "GET" && (url.pathname === "/login" || url.pathname === "/login.html")) {
      return staticFile("/login.html", response);
    }
    if (request.method === "POST" && url.pathname === "/api/login") {
      const { username, password } = await readJson(request);
      if (!credentialsMatch(String(username || ""), String(password || ""))) {
        return send(response, 401, JSON.stringify({ error: "Incorrect username or password." }), { "Content-Type": "application/json" });
      }
      const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
      return send(response, 204, "", { "Set-Cookie": sessionCookie(signedSession(expiresAt), sessionLifetimeSeconds) });
    }
    if (request.method === "POST" && url.pathname === "/api/logout") {
      return send(response, 204, "", { "Set-Cookie": sessionCookie("", 0) });
    }
    if (!authorised(request)) {
      if (url.pathname.startsWith("/api/")) return send(response, 401, JSON.stringify({ error: "Please sign in." }), { "Content-Type": "application/json" });
      response.writeHead(302, { Location: "/login", "Cache-Control": "no-store" });
      return response.end();
    }
    if (request.method === "GET" && url.pathname === "/api/overview") {
      return send(response, 200, JSON.stringify(await overview()), { "Content-Type": "application/json" });
    }
    if (request.method === "POST" && url.pathname === "/api/actions/circuit2-boost") {
      await fromHa("/api/services/script/turn_on", { method: "POST", body: JSON.stringify({ entity_id: "script.grant_circuit2_20c_20m_boost" }) });
      return send(response, 204, "");
    }
    if (request.method === "POST" && url.pathname === "/api/actions/dhw-boost") {
      await fromHa("/api/services/rest_command/grant_dhw_one_off_loading", { method: "POST", body: "{}" });
      return send(response, 204, "");
    }
    if (request.method === "GET") return staticFile(url.pathname, response);
    return send(response, 404, "Not found");
  } catch (error) {
    console.error(error.message);
    return send(response, 502, JSON.stringify({ error: "Home Assistant could not complete the request." }), { "Content-Type": "application/json" });
  }
}).listen(port, "0.0.0.0", () => console.log(`Aerona web app listening on port ${port}`));
