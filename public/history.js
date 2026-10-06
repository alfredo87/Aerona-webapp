const groups = ["climate", "performance", "efficiency", "flow", "fan", "pressure"];
let hours = 24;

const number = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value);
const time = (timestamp, includeDate = false) => new Date(timestamp).toLocaleString([], includeDate
  ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
  : { hour: "2-digit", minute: "2-digit" });
const axisNumber = (value) => Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : number(value);

function niceScale(values) {
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (low === high) {
    const adjustment = Math.max(Math.abs(low) * 0.08, 0.5);
    low -= adjustment;
    high += adjustment;
  }
  if (low >= 0 && low < (high - low) * 0.12) low = 0;
  const targetStep = (high - low) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const normalised = targetStep / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step) };
}

function tickTimes(startTime, endTime) {
  const tick = new Date(startTime);
  if (hours === 24) {
    tick.setMinutes(0, 0, 0);
    if (tick.getTime() <= startTime) tick.setHours(tick.getHours() + 1);
  } else {
    tick.setHours(0, 0, 0, 0);
    if (tick.getTime() <= startTime) tick.setDate(tick.getDate() + 1);
  }
  const ticks = [];
  while (tick.getTime() < endTime) {
    ticks.push(tick.getTime());
    if (hours === 24) tick.setHours(tick.getHours() + 1);
    else tick.setDate(tick.getDate() + 1);
  }
  return ticks;
}

function chart(data) {
  const usable = data.series.filter((series) => series.points.length);
  const card = document.createElement("article");
  card.className = `chart-card${data.series.length > 1 ? " chart-card-wide" : ""}`;
  const heading = document.createElement("h2");
  heading.textContent = data.title;
  card.append(heading);
  if (!usable.length) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "No recorded data is available for this period yet.";
    card.append(empty);
    return card;
  }

  const width = 1000;
  const height = 250;
  const edge = 80;
  const x = (timestamp) => edge + ((timestamp - data.startTime) / (data.endTime - data.startTime)) * (width - edge * 2);
  const byAxis = (axis) => usable.filter((series) => (series.axis || "left") === axis);
  const scales = Object.fromEntries(["left", "right"].flatMap((axis) => {
    const values = byAxis(axis).flatMap((series) => series.points.map(([, value]) => value));
    return values.length ? [[axis, niceScale(values)]] : [];
  }));
  const y = (value, axis = "left") => {
    const scale = scales[axis];
    return height - edge - ((value - scale.min) / (scale.max - scale.min)) * (height - edge * 2);
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${data.title} over the selected period`);
  const addAxis = (axis, drawGrid) => {
    const scale = scales[axis];
    if (!scale) return;
    const xPosition = axis === "left" ? edge : width - edge;
    const direction = axis === "left" ? -10 : 10;
    const anchor = axis === "left" ? "end" : "start";
    const unit = [...new Set(byAxis(axis).map((series) => series.unit))].join("/");
    const visibleUnit = unit === "COP/SPF" ? "" : ` ${unit}`;
    scale.ticks.forEach((value) => {
      const position = y(value, axis);
      if (drawGrid) {
        const line = document.createElementNS(svg.namespaceURI, "line");
        line.setAttribute("x1", edge); line.setAttribute("x2", width - edge); line.setAttribute("y1", position); line.setAttribute("y2", position);
        line.setAttribute("class", "chart-grid");
        svg.append(line);
      }
      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", xPosition + direction); label.setAttribute("y", position + 6); label.setAttribute("text-anchor", anchor); label.setAttribute("class", "chart-y-axis");
      label.textContent = `${axisNumber(value)}${visibleUnit}`;
      svg.append(label);
    });
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", xPosition); line.setAttribute("x2", xPosition); line.setAttribute("y1", edge); line.setAttribute("y2", height - edge);
    line.setAttribute("class", "chart-grid");
    svg.append(line);
  };
  addAxis("left", true);
  addAxis("right", false);
  tickTimes(data.startTime, data.endTime).forEach((timestamp, index) => {
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", x(timestamp)); line.setAttribute("x2", x(timestamp)); line.setAttribute("y1", edge); line.setAttribute("y2", height - edge);
    line.setAttribute("class", "chart-grid chart-time-tick");
    svg.append(line);
    const showLabel = hours === 168 || index % 3 === 0;
    if (showLabel) {
      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", x(timestamp)); label.setAttribute("y", height - 12); label.setAttribute("text-anchor", "middle"); label.setAttribute("class", "chart-axis");
      label.textContent = hours === 24 ? time(timestamp) : new Date(timestamp).toLocaleDateString([], { weekday: "short", day: "numeric" });
      svg.append(label);
    }
  });
  usable.forEach((series) => {
    const line = document.createElementNS(svg.namespaceURI, "polyline");
    line.setAttribute("points", series.points.map(([timestamp, value]) => `${x(timestamp)},${y(value, series.axis || "left")}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", series.colour);
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.append(line);
  });
  card.append(svg);
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  usable.forEach((series) => {
    const last = series.points.at(-1)?.[1];
    const item = document.createElement("span");
    item.innerHTML = `<i style="background:${series.colour}"></i>${series.label} <b>${number(last)} ${series.unit}</b>`;
    legend.append(item);
  });
  card.append(legend);
  return card;
}

async function load() {
  const target = document.getElementById("history-charts");
  const status = document.getElementById("history-status");
  status.textContent = "Loading history…";
  try {
    const responses = await Promise.all(groups.map(async (group) => {
      const response = await fetch(`/api/history?group=${group}&hours=${hours}`);
      if (!response.ok) throw new Error();
      return response.json();
    }));
    target.replaceChildren(...responses.map(chart));
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    status.textContent = "History is unavailable";
    target.replaceChildren();
  }
}

document.querySelectorAll("[data-hours]").forEach((button) => button.addEventListener("click", () => {
  hours = Number(button.dataset.hours);
  document.querySelectorAll("[data-hours]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  load();
}));

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.assign("/login");
});

load();
