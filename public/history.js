const groups = ["climate", "performance", "efficiency", "flow", "fan", "pressure"];
let hours = 24;

const number = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value);
const time = (timestamp, includeDate = false) => new Date(timestamp).toLocaleString([], includeDate
  ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
  : { hour: "2-digit", minute: "2-digit" });

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

  const allPoints = usable.flatMap((series) => series.points.map(([, value]) => value));
  let min = Math.min(...allPoints);
  let max = Math.max(...allPoints);
  const padding = Math.max((max - min) * 0.12, max === min ? Math.max(Math.abs(max) * 0.12, 1) : 0.2);
  min -= padding;
  max += padding;
  const width = 1000;
  const height = 250;
  const edge = 40;
  const x = (timestamp) => edge + ((timestamp - data.startTime) / (data.endTime - data.startTime)) * (width - edge * 2);
  const y = (value) => height - edge - ((value - min) / (max - min)) * (height - edge * 2);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${data.title} over the selected period`);
  [0, 0.5, 1].forEach((fraction) => {
    const line = document.createElementNS(svg.namespaceURI, "line");
    const position = edge + fraction * (height - edge * 2);
    line.setAttribute("x1", edge); line.setAttribute("x2", width - edge); line.setAttribute("y1", position); line.setAttribute("y2", position);
    line.setAttribute("class", "chart-grid");
    svg.append(line);
  });
  usable.forEach((series) => {
    const line = document.createElementNS(svg.namespaceURI, "polyline");
    line.setAttribute("points", series.points.map(([timestamp, value]) => `${x(timestamp)},${y(value)}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", series.colour);
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.append(line);
  });
  [[data.startTime, time(data.startTime, hours === 168)], [(data.startTime + data.endTime) / 2, time((data.startTime + data.endTime) / 2, hours === 168)], [data.endTime, time(data.endTime, hours === 168)]].forEach(([timestamp, label]) => {
    const text = document.createElementNS(svg.namespaceURI, "text");
    text.setAttribute("x", x(timestamp)); text.setAttribute("y", height - 12); text.setAttribute("text-anchor", "middle"); text.setAttribute("class", "chart-axis"); text.textContent = label;
    svg.append(text);
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
