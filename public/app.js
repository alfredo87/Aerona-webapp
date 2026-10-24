const text = (id, value) => {
  const element = document.getElementById(id);
  if (element.textContent === value) return;
  element.classList.remove("value-change");
  void element.offsetWidth;
  element.textContent = value;
  element.classList.add("value-change");
};
const alarmDescriptions = {
  "150": "P03 — Low refrigerant pressure protection"
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
    const alarmActive = data.alarmActive?.state === "on";
    const alarmCode = String(data.activeAlarm?.state || "");
    const alarmBanner = document.getElementById("alarm-banner");
    alarmBanner.hidden = !alarmActive;
    if (alarmActive) {
      const hasCode = alarmCode && !["unknown", "unavailable", "none"].includes(alarmCode.toLowerCase());
      const description = hasCode ? alarmDescriptions[alarmCode] : "";
      text("alarm-message", description || `Controller alarm active${hasCode ? ` — code ${alarmCode}` : ""}`);
      text("alarm-detail", description ? `Controller code ${alarmCode}. Contact your installer if it recurs; do not repeatedly reset it.` : "Check the controller alarm list before clearing it.");
    }
    const effectiveTarget = Number.parseFloat(data.comfortTarget.state);
    text("comfort", Number.isFinite(effectiveTarget) ? `${effectiveTarget.toFixed(1)} °C` : "—");
    const calculatedTarget = Number.parseFloat(data.calculatedTarget.state);
    const calculatedTargetLine = document.getElementById("calculated-target");
    if (Number.isFinite(calculatedTarget)) {
      text("calculated-target", `Weather target ${calculatedTarget.toFixed(1)} °C`);
      calculatedTargetLine.hidden = false;
    } else {
      calculatedTargetLine.hidden = true;
    }
    const roomDisplay = Number.parseFloat(data.roomTemp.state);
    text("room", Number.isFinite(roomDisplay) ? `${roomDisplay.toFixed(1)} °C` : "—");
    text("outdoor", show(data.outdoorTemp));
    text("eco", show(data.ecoTarget));
    const roomTemperature = Number.parseFloat(data.roomTemp.state);
    const comfortTarget = effectiveTarget;
    // A five-degree approach band makes the rim meaningful near the target.
    const roomProgress = Number.isFinite(roomTemperature) && Number.isFinite(comfortTarget)
      ? Math.min(1, Math.max(0, (roomTemperature - (comfortTarget - 5)) / 5))
      : 0;
    document.querySelector(".heating").style.setProperty("--room-progress", `${roomProgress}turn`);
    const resumeAt = Number(data.arrivalHeat?.resumeAt) || 0;
    const arrivalActive = resumeAt > Date.now();
    text("arrival-status", arrivalActive
      ? `Comfort until ${new Date(resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Following schedule");
    document.querySelector(".arrival-card").classList.toggle("arrival-active", arrivalActive);
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
    const valveState = String(data.valveState?.state || "").trim().toUpperCase();
    text("valve-state", `3-way valve: ${["CH", "DHW"].includes(valveState) ? valveState : "—"}`);
    text("flow", show(data.flowRate, "L/min"));
    text("fan", show(data.fanSpeed, "rpm"));
    text("pressure", show(data.waterPressure, "bar"));
    text("thermal-power", show(data.thermalPower));
    text("cop", show(data.cop));
    text("spf", show(data.seasonalPerformance));
    text("heating-cop", show(data.heatingCop));
    text("dhw-cop", show(data.dhwCop));
    text("heating-cop-label", data.heatingCop.retained ? "Last heating COP" : "Heating COP");
    text("dhw-cop-label", data.dhwCop.retained ? "Last DHW COP" : "DHW COP");
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
  const action = button.dataset.action;
  const dhw = action === "dhw-boost";
  const hours = Number(button.dataset.hours);
  const prompt = dhw
    ? "Start one-off DHW cylinder loading?"
    : action === "arrival-heat"
      ? `Use Circuit 2 Comfort mode for ${hours} hour${hours === 1 ? "" : "s"}, then automatically resume the normal schedule?`
      : action === "away-eco"
        ? "Hold Circuit 2 at its Night/Eco target until you choose Resume schedule?"
        : "Return Circuit 2 to its normal schedule now?";
  if (!confirm(prompt)) return;
  button.disabled = true;
  button.classList.add("sending");
  text("notice", "Sending request…");
  try {
    const response = await fetch(`/api/actions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "arrival-heat" ? JSON.stringify({ hours }) : undefined
    });
    if (!response.ok) throw new Error();
    text("notice", dhw ? "DHW boost requested." : action === "arrival-heat" ? "Arrival Heat started." : action === "away-eco" ? "Circuit 2 is holding the Eco target." : "Circuit 2 returned to Scheduled mode.");
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
