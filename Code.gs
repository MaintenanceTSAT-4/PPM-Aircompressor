// ===================================================
//  PPM Air Compressor — Google Apps Script Backend v3
// ===================================================

var SHEET_NAME      = "PPM_Records";
var INSPECTOR_SHEET = "Inspectors";
var HEADERS = [
  "วันที่",              // 1
  "เวลา",               // 2
  "เครื่องจักร",         // 3
  "1. Pressure Load/Unload",  // 4
  "2. อุณหภูมิ < 100°C",     // 5
  "3. Pressure Oil Separator",// 6
  "4. กระแส Motor",           // 7
  "5. กระแส Fan Motor",       // 8
  "6. ระดับน้ำมัน",            // 9
  "7. ชั่วโมงทำงาน (hrs)",    // 10
  "8. ทำความสะอาดพื้นที่",    // 11
  "9. ผู้ตรวจสอบ",            // 12
  "หมายเหตุ",               // 13
  "ข้อมูลเพิ่มเติม",         // 14  (custom checklist JSON)
  "สถานะ",                 // 15
  "ผู้ Approve",           // 16
  "วันที่ Approve"         // 17
];

// ============ MAIN HANDLERS ============

function doGet(e) {
  var action = e.parameter.action;
  if (action === "getInspectors")       return jsonResponse(getInspectors());
  if (action === "getRecords")          return jsonResponse(getRecords());
  if (action === "getLatestByMachine")  return jsonResponse(getLatestByMachine());
  if (action === "getPending")          return jsonResponse(getPending());
  return jsonResponse({ status: "ok", message: "PPM API v3" });
}

function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var action = data.action;
    if (action === "addRecord")       return jsonResponse(addRecord(data));
    if (action === "updateRecord")    return jsonResponse(updateRecord(data));
    if (action === "approveRecord")   return jsonResponse(approveRecord(data));
    if (action === "addInspector")    return jsonResponse(addInspector(data.name));
    if (action === "deleteInspector") return jsonResponse(deleteInspector(data.name));
    return jsonResponse({ status: "error", message: "Unknown action" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ============ RECORD FUNCTIONS ============

function addRecord(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, SHEET_NAME, HEADERS);
  var now   = new Date();
  var row   = [
    Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy"),
    Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm"),
    data.machine            || "",
    data.pressureLoadUnload || "",
    data.temperature        || "",
    data.pressureOilSep     || "",
    data.motorCurrent       || "",
    data.fanMotorCurrent    || "",
    data.oilLevel           || "",
    data.runningHours       || "",
    data.areaCleaning       || "",
    data.inspector          || "",
    data.remarks            || "",
    data.customData         || "",
    "รอ Approve",           // initial status
    "",                     // approver
    ""                      // approve date
  ];
  sheet.appendRow(row);
  autoFormatSheet(sheet);
  return { status: "success", message: "บันทึกข้อมูลเรียบร้อย — รอ Approve" };
}

function updateRecord(data) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = ss.getSheetByName(SHEET_NAME);
  if (!sheet)  return { status: "error", message: "ไม่พบ Sheet" };
  var rowIndex = parseInt(data.rowIndex) + 2;
  if (rowIndex < 2 || rowIndex > sheet.getLastRow())
    return { status: "error", message: "ไม่พบแถวข้อมูล" };

  var orig = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  var row  = [
    orig[0], orig[1],          // keep date, time
    data.machine            || "",
    data.pressureLoadUnload || "",
    data.temperature        || "",
    data.pressureOilSep     || "",
    data.motorCurrent       || "",
    data.fanMotorCurrent    || "",
    data.oilLevel           || "",
    data.runningHours       || "",
    data.areaCleaning       || "",
    data.inspector          || "",
    data.remarks            || "",
    data.customData         || orig[13] || "",
    orig[14] || "รอ Approve", // keep status
    orig[15] || "",
    orig[16] || ""
  ];
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
  autoFormatSheet(sheet);
  return { status: "success", message: "แก้ไขข้อมูลเรียบร้อย" };
}

function approveRecord(data) {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = ss.getSheetByName(SHEET_NAME);
  if (!sheet)  return { status: "error", message: "ไม่พบ Sheet" };
  var rowIndex = parseInt(data.rowIndex) + 2;
  if (rowIndex < 2 || rowIndex > sheet.getLastRow())
    return { status: "error", message: "ไม่พบแถวข้อมูล" };

  var now        = new Date();
  var dateStr    = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  var newStatus  = data.approved ? "Approved ✅" : "Rejected ❌";

  // Update the full row if edited fields were provided
  if (data.machine) {
    var orig = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    var row  = [
      orig[0], orig[1],
      data.machine            || orig[2],
      data.pressureLoadUnload || orig[3],
      data.temperature        || orig[4],
      data.pressureOilSep     || orig[5],
      data.motorCurrent       || orig[6],
      data.fanMotorCurrent    || orig[7],
      data.oilLevel           || orig[8],
      data.runningHours       || orig[9],
      data.areaCleaning       || orig[10],
      data.inspector          || orig[11],
      data.remarks            || orig[12],
      orig[13],
      newStatus,
      data.approver  || "",
      dateStr
    ];
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
  } else {
    sheet.getRange(rowIndex, 15).setValue(newStatus);
    sheet.getRange(rowIndex, 16).setValue(data.approver || "");
    sheet.getRange(rowIndex, 17).setValue(dateStr);
  }

  // Color the row
  var color = data.approved ? "#E8F5E9" : "#FFEBEE";
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setBackground(color);

  return { status: "success", message: newStatus + " เรียบร้อย" };
}

function getRecords() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { status: "success", data: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status: "success", data: [] };

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var records = values.map(function(row, i) {
    return buildRecord(row, i);
  }).reverse();
  return { status: "success", data: records };
}

function getPending() {
  var result = getRecords();
  if (result.status !== "success") return result;
  var pending = result.data.filter(function(r) { return r.status === "รอ Approve"; });
  return { status: "success", data: pending };
}

function getLatestByMachine() {
  var result = getRecords();
  if (result.status !== "success") return result;
  var latest = {};
  result.data.forEach(function(r) {
    if (r.machine && !latest[r.machine]) latest[r.machine] = r;
  });
  return { status: "success", data: latest };
}

function buildRecord(row, i) {
  return {
    rowIndex:           i,
    date:               row[0],  time:        row[1],
    machine:            row[2],
    pressureLoadUnload: row[3],  temperature: row[4],
    pressureOilSep:     row[5],  motorCurrent:row[6],
    fanMotorCurrent:    row[7],  oilLevel:    row[8],
    runningHours:       row[9],  areaCleaning:row[10],
    inspector:          row[11], remarks:     row[12],
    customData:         row[13], status:      row[14],
    approver:           row[15], approveDate: row[16]
  };
}

// ============ INSPECTOR FUNCTIONS ============

function getInspectors() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INSPECTOR_SHEET);
  if (!sheet) return { status: "success", data: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return { status: "success", data: [] };
  var names = sheet.getRange(1, 1, lastRow, 1).getValues()
    .map(function(r) { return r[0]; }).filter(function(n) { return n !== ""; });
  return { status: "success", data: names };
}

function addInspector(name) {
  if (!name || name.trim() === "") return { status: "error", message: "กรุณาระบุชื่อ" };
  name = name.trim();
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, INSPECTOR_SHEET, []);
  var lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    var existing = sheet.getRange(1, 1, lastRow, 1).getValues().flat();
    if (existing.indexOf(name) !== -1) return { status: "error", message: "มีชื่อนี้อยู่แล้ว" };
  }
  sheet.appendRow([name]);
  return { status: "success", message: "เพิ่มชื่อ " + name + " เรียบร้อย" };
}

function deleteInspector(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INSPECTOR_SHEET);
  if (!sheet) return { status: "error", message: "ไม่พบข้อมูล" };
  var lastRow = sheet.getLastRow();
  var values  = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === name) { sheet.deleteRow(i + 1); return { status: "success", message: "ลบชื่อเรียบร้อย" }; }
  }
  return { status: "error", message: "ไม่พบชื่อ: " + name };
}

// ============ HELPERS ============

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      var hr = sheet.getRange(1, 1, 1, headers.length);
      hr.setValues([headers]);
      hr.setFontWeight("bold");
      hr.setBackground("#1565C0");
      hr.setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function autoFormatSheet(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  sheet.autoResizeColumns(1, HEADERS.length);
}

function jsonResponse(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
