// ============================================================
//  PPM Air Compressor — Express API Server
//  Credentials stay server-side; browser calls /api/*
// ============================================================
const express = require("express");
const path    = require("path");
require("dotenv").config();

// ── Supabase (service-role key — never sent to browser) ─────
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Serve static HTML ──────────────────────────────────────
app.use(express.static(path.join(__dirname, ".")));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================================================
//  Helper: normalize a v_ppm_records_full row
// ============================================================
function norm(r) {
  const d   = new Date(r.created_at);
  const pad = n => String(n).padStart(2, "0");
  return {
    id:                  r.id,
    date:                pad(d.getDate()) + "/" + pad(d.getMonth()+1) + "/" + d.getFullYear(),
    time:                pad(d.getHours())  + ":" + pad(d.getMinutes()),
    machine:             r.machine_id || r.machine_label || "",
    pressureLoadUnload:  r.pressure_load_unload  || "",
    temperature:         r.temperature            || "",
    pressureOilSep:      r.pressure_oil_sep       || "",
    motorCurrent:        r.motor_current           || "",
    fanMotorCurrent:     r.fan_motor_current       || "",
    oilLevel:            r.oil_level               || "",
    runningHours:        r.running_hours != null ? String(r.running_hours) : "",
    areaCleaning:        r.area_cleaning            || "",
    inspector:           r.inspector                || "",
    remarks:             r.remarks                  || "",
    status:              r.status                   || "รอ Approve",
    approver:            r.approver_name            || "",
    approveDate:         r.approved_at              || "",
  };
}

// ============================================================
//  GET /api/records          — all records (with optional filters)
//  GET /api/records/pending  — status = "รอ Approve"
//  GET /api/records/latest   — latest per machine
// ============================================================
app.get("/api/records/pending", async (req, res) => {
  const { data, error } = await supabase
    .from("v_ppm_records_full")
    .select("*")
    .eq("status", "รอ Approve")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(norm));
});

app.get("/api/records/latest", async (req, res) => {
  const { data, error } = await supabase
    .from("v_ppm_records_full")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const latest = {};
  data.forEach(r => {
    const m = r.machine_id || r.machine_label;
    if (m && !latest[m]) latest[m] = norm(r);
  });
  res.json(latest);
});

app.get("/api/records", async (req, res) => {
  let q = supabase
    .from("v_ppm_records_full")
    .select("*")
    .order("created_at", { ascending: false });
  if (req.query.machine) q = q.eq("machine_id", req.query.machine);
  if (req.query.status)  q = q.eq("status",     req.query.status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(norm));
});

// ============================================================
//  POST /api/records — insert new inspection record
// ============================================================
app.post("/api/records", async (req, res) => {
  const d = req.body;
  if (!d.machine || !d.inspector) {
    return res.status(400).json({ error: "กรุณาระบุเครื่องและผู้ตรวจสอบ" });
  }

  // lookup FK ids (graceful fallback if not found)
  const [{ data: mRows }, { data: iRows }] = await Promise.all([
    supabase.from("machines")  .select("id").eq("machine_id", d.machine)  .maybeSingle(),
    supabase.from("inspectors").select("id").eq("name",       d.inspector).maybeSingle(),
  ]);

  const { data, error } = await supabase
    .from("ppm_records")
    .insert({
      machine_id:           mRows?.id   ?? null,
      machine_label:        d.machine,
      inspector_id:         iRows?.id   ?? null,
      inspector_name:       d.inspector,
      pressure_load_unload: d.pressureLoadUnload || null,
      temperature:          d.temperature        || null,
      pressure_oil_sep:     d.pressureOilSep     || null,
      motor_current:        d.motorCurrent        || null,
      fan_motor_current:    d.fanMotorCurrent     || null,
      oil_level:            d.oilLevel            || null,
      running_hours:        d.runningHours ? Number(d.runningHours) : null,
      area_cleaning:        d.areaCleaning        || null,
      remarks:              d.remarks             || null,
      status:               "รอ Approve",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // custom items
  if (d.customData && data?.id) {
    try {
      const custom = JSON.parse(d.customData);
      const items  = Object.entries(custom).map(([k, v]) => ({
        record_id: data.id,
        item_name: v.label || k,
        value:     v.value || "",
      }));
      if (items.length) await supabase.from("record_custom_items").insert(items);
    } catch (_) {}
  }

  res.json({ status: "success", id: data.id });
});

// ============================================================
//  PATCH /api/records/:id — edit record fields
// ============================================================
app.patch("/api/records/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const d = req.body;
  const patch = {};
  if (d.machine)             patch.machine_label        = d.machine;
  if (d.runningHours != null) patch.running_hours       = Number(d.runningHours) || null;
  if (d.pressureLoadUnload)  patch.pressure_load_unload = d.pressureLoadUnload;
  if (d.temperature)         patch.temperature          = d.temperature;
  if (d.pressureOilSep)      patch.pressure_oil_sep     = d.pressureOilSep;
  if (d.motorCurrent)        patch.motor_current        = d.motorCurrent;
  if (d.fanMotorCurrent)     patch.fan_motor_current    = d.fanMotorCurrent;
  if (d.oilLevel)            patch.oil_level            = d.oilLevel;
  if (d.areaCleaning)        patch.area_cleaning        = d.areaCleaning;
  if (d.inspector)           patch.inspector_name       = d.inspector;
  if (d.remarks !== undefined) patch.remarks            = d.remarks;

  const { error } = await supabase
    .from("ppm_records")
    .update(patch)
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: "success" });
});

// ============================================================
//  POST /api/records/:id/approve — approve or reject
// ============================================================
app.post("/api/records/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "invalid id" });

  const { approved, approver, ...editFields } = req.body;
  if (!approver) return res.status(400).json({ error: "กรุณาระบุชื่อผู้ Approve" });

  const patch = {
    status:       approved ? "Approved ✅" : "Rejected ❌",
    approver_name: approver,
    approved_at:  new Date().toISOString(),
    ...( editFields.runningHours != null
         ? { running_hours: Number(editFields.runningHours) || null }
         : {}),
    ...(editFields.pressureLoadUnload ? { pressure_load_unload: editFields.pressureLoadUnload } : {}),
    ...(editFields.temperature        ? { temperature:          editFields.temperature }         : {}),
    ...(editFields.pressureOilSep     ? { pressure_oil_sep:     editFields.pressureOilSep }      : {}),
    ...(editFields.motorCurrent       ? { motor_current:        editFields.motorCurrent }        : {}),
    ...(editFields.fanMotorCurrent    ? { fan_motor_current:    editFields.fanMotorCurrent }     : {}),
    ...(editFields.oilLevel           ? { oil_level:            editFields.oilLevel }            : {}),
    ...(editFields.areaCleaning       ? { area_cleaning:        editFields.areaCleaning }        : {}),
    ...(editFields.inspector          ? { inspector_name:       editFields.inspector }           : {}),
    ...(editFields.remarks !== undefined ? { remarks:           editFields.remarks }             : {}),
  };

  const { error } = await supabase
    .from("ppm_records")
    .update(patch)
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: "success" });
});

// ============================================================
//  GET  /api/inspectors      — list all
//  POST /api/inspectors      — add
//  DELETE /api/inspectors/:name — remove
// ============================================================
app.get("/api/inspectors", async (req, res) => {
  const { data, error } = await supabase
    .from("inspectors")
    .select("name")
    .order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(r => r.name));
});

app.post("/api/inspectors", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "กรุณาระบุชื่อ" });
  const { error } = await supabase.from("inspectors").insert({ name });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: "success" });
});

app.delete("/api/inspectors/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { error } = await supabase.from("inspectors").delete().eq("name", name);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: "success" });
});

// ============================================================
//  Health check
// ============================================================
app.get("/api/health", async (req, res) => {
  const { data, error } = await supabase.from("machines").select("machine_id").limit(1);
  res.json({
    ok:       !error,
    machines: data?.length ?? 0,
    error:    error?.message ?? null,
  });
});

// ============================================================
//  Start
// ============================================================
app.listen(PORT, () => {
  console.log(`PPM server listening on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? "✅ set" : "❌ MISSING"}`);
  console.log(`Service key:  ${process.env.SUPABASE_SERVICE_KEY ? "✅ set" : "❌ MISSING"}`);
});
