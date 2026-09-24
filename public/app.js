const text = (id, value) => {
  const element = document.getElementById(id);
  if (element.textContent === value) return;
  element.classList.remove("value-change");
  void element.offsetWidth;
  element.textContent = value;
  element.classList.add("value-change");
};
const show = (entry, fallbackUnit = "") => {
  if (entry.state === "unavailable" || entry.state === "unknown") return "—";
  return `${entry.state}${entry.unit || fallbackUnit ? ` ${entry.unit || fallbackUnit}` : ""}`;
};

async function refresh() {
  try {
    const response = await fetch("/api/overview");
    if (!response.ok) throw new Error();
    const data = await response.json();
    const minutes = Number.parseFloat(data.boostRemaining.state) || 0;
    const effectiveTarget = minutes > 0 ? 20 : Number.parseFloat(data.comfortTarget.state);
    text("comfort", Number.isFinite(effectiveTarget) ? `${effectiveTarget.toFixed(1)} °C` : "—");
    text("room", show(data.roomTemp));
    text("outdoor", show(data.outdoorTemp));
    text("eco", show(data.ecoTarget));
    const roomTemperature = Number.parseFloat(data.roomTemp.state);
    const comfortTarget = effectiveTarget;
    // A five-degree approach band makes the rim meaningful near the target.
    const roomProgress = Number.isFinite(roomTemperature) && Number.isFinite(comfortTarget)
      ? Math.min(1, Math.max(0, (roomTemperature - (comfortTarget - 5)) / 5))
      : 0;
    document.querySelector(".heating").style.setProperty("--room-progress", `${roomProgress}turn`);
    text("boost", show(data.boostRemaining));
    document.querySelector(".heating-action").style.setProperty("--progress", `${Math.min(20, Math.max(0, minutes)) / 20}turn`);
    text("dhw", show(data.dhwSetpoint));
    text("cylinder", show(data.cylinderTemp));
    text("dhw-button-value", show(data.cylinderTemp));
    const cylinder = Number.parseFloat(data.cylinderTemp.state);
    const dhwTarget = Number.parseFloat(data.dhwSetpoint.state);
    const dhwAtTarget = Number.isFinite(cylinder) && Number.isFinite(dhwTarget) && cylinder >= dhwTarget;
    const dhwButton = document.querySelector(".dhw-action");
    dhwButton.style.setProperty("--progress", `${Number.isFinite(cylinder) && Number.isFinite(dhwTarget) && dhwTarget > 0 ? Math.min(1, Math.max(0, cylinder / dhwTarget)) : 0}turn`);
    dhwButton.classList.toggle("at-target", dhwAtTarget);
    text("dhw-button-status", dhwAtTarget ? "Cylinder at target" : "Heating towards target");
    text("power", show(data.power));
    text("today", show(data.energyToday));
    text("total", show(data.energyTotal));
    text("flow", show(data.flowRate, "L/min"));
    text("fan", show(data.fanSpeed, "rpm"));
    text("pressure", show(data.waterPressure, "bar"));
    text("thermal-power", show(data.thermalPower));
    text("cop", show(data.cop));
    text("spf", show(data.seasonalPerformance));
    text("heating-cop", show(data.heatingCop));
    text("dhw-cop", show(data.dhwCop));
    text("heating-spf", show(data.heatingSpf));
    text("dhw-spf", show(data.dhwSpf));
    text("mode", data.mode.state);
    text("updated", `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    document.body.classList.add("ready");
  } catch {
    text("updated", "Home Assistant unavailable");
  }
}

document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
  const dhw = button.dataset.action === "dhw-boost";
  if (!confirm(dhw ? "Start one-off DHW cylinder loading?" : "Start the 20°C radiator boost for 20 minutes?")) return;
  button.disabled = true;
  button.classList.add("sending");
  text("notice", "Sending request…");
  try {
    const response = await fetch(`/api/actions/${button.dataset.action}`, { method: "POST" });
    if (!response.ok) throw new Error();
    text("notice", dhw ? "DHW boost requested." : "Radiator boost started.");
    setTimeout(refresh, 1500);
  } catch {
    text("notice", "The request could not be completed.");
  } finally {
    button.disabled = false;
    button.classList.remove("sending");
  }
}));

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.assign("/login");
});

refresh();
setInterval(refresh, 15000);
