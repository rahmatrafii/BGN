"use strict";

const fs = require("fs");
const path = require("path");

// Path to raw pedi-growth data
const PEDI_DATA_DIR = path.join(__dirname, "../../temp-who/package/dist/data");
const OUTPUT_DIR = path.join(__dirname, "../data/who");

// Helper to lookup and interpolate LMS from table
function lookupLms(table, index, key = "age") {
  if (table.length === 0) return null;
  const first = table[0];
  const last = table[table.length - 1];

  if (index <= first[key]) return first;
  if (index >= last[key]) return last;

  let lo = 0;
  let hi = table.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (table[mid][key] === index) return table[mid];
    if (table[mid][key] < index) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const lower = table[hi];
  const upper = table[lo];
  if (lower[key] === upper[key]) return lower;

  const fraction = (index - lower[key]) / (upper[key] - lower[key]);
  return {
    [key]: index,
    L: lower.L + (upper.L - lower.L) * fraction,
    M: lower.M + (upper.M - lower.M) * fraction,
    S: lower.S + (upper.S - lower.S) * fraction,
  };
}

function generateLhfa(gender) {
  const file0to5 = JSON.parse(fs.readFileSync(path.join(PEDI_DATA_DIR, `lhfa-${gender}-0-5.json`), "utf8"));
  const file5to19 = JSON.parse(fs.readFileSync(path.join(PEDI_DATA_DIR, `hfa-${gender}-5-19.json`), "utf8"));

  const lmsList = [];

  // Month 0 to 23 (under 2 years): Length-for-age standard
  for (let m = 0; m < 24; m++) {
    const days = m * (730 / 24);
    const resolved = lookupLms(file0to5, days, "age");
    lmsList.push({
      age: m,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  // Month 24 to 60 (2 to 5 years): Height-for-age standard (Day 731 to 1826)
  for (let m = 24; m <= 60; m++) {
    const days = 731 + (m - 24) * ((1826 - 731) / 36);
    const resolved = lookupLms(file0to5, days, "age");
    lmsList.push({
      age: m,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  // Month 61 to 228 (5 to 19 years): use hfa-5-19 table directly
  for (let m = 61; m <= 228; m++) {
    const resolved = lookupLms(file5to19, m, "age");
    lmsList.push({
      age: m,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  const result = {
    indicator: "length-height-for-age",
    sex: gender,
    unit: "month",
    lms: lmsList,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `lhfa_${gender}.json`),
    JSON.stringify(result, null, 2) + "\n",
    "utf8"
  );
  console.log(`Generated lhfa_${gender}.json`);
}

function generateWfa(gender) {
  const file0to5 = JSON.parse(fs.readFileSync(path.join(PEDI_DATA_DIR, `wfa-${gender}-0-5.json`), "utf8"));
  const file5to10 = JSON.parse(fs.readFileSync(path.join(PEDI_DATA_DIR, `wfa-${gender}-5-10.json`), "utf8"));
  
  // Load original file to extract weight data above 10 years (120 months)
  const originalFile = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, `wfa_${gender}.json`), "utf8"));
  const originalLms = originalFile.lms;

  const lmsList = [];

  // Month 0 to 60 (under 5): map to days (m * 30.4375)
  for (let m = 0; m <= 60; m++) {
    const days = m * 30.4375;
    const resolved = lookupLms(file0to5, days, "age");
    lmsList.push({
      age: m,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  // Month 61 to 120 (5 to 10 years): use wfa-5-10 table directly
  for (let m = 61; m <= 120; m++) {
    const resolved = lookupLms(file5to10, m, "age");
    lmsList.push({
      age: m,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  // Month 121 to 228 (10 to 19 years): interpolate from original sparse file
  // (WHO does not have weight-for-age standards above 10 years, so we preserve the original implementation's data)
  for (let m = 121; m <= 228; m++) {
    const resolved = lookupLms(originalLms, m, "age");
    lmsList.push({
      age: m,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  const result = {
    indicator: "weight-for-age",
    sex: gender,
    unit: "month",
    lms: lmsList,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `wfa_${gender}.json`),
    JSON.stringify(result, null, 2) + "\n",
    "utf8"
  );
  console.log(`Generated wfa_${gender}.json`);
}

function generateWfh(gender) {
  const fileWfh = JSON.parse(fs.readFileSync(path.join(PEDI_DATA_DIR, `wfh-${gender}.json`), "utf8"));

  const lmsList = [];

  // Height from 65 to 120 cm with step 0.5 cm
  for (let h = 65; h <= 120; h += 0.5) {
    // Find matching height entry in 0.1 cm step file
    const resolved = lookupLms(fileWfh, h, "age");
    lmsList.push({
      h: h,
      L: Number(resolved.L.toFixed(4)),
      M: Number(resolved.M.toFixed(4)),
      S: Number(resolved.S.toFixed(5)),
    });
  }

  const result = {
    indicator: "weight-for-height",
    sex: gender,
    unit: "cm",
    lms: lmsList,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `wfh_${gender}.json`),
    JSON.stringify(result, null, 2) + "\n",
    "utf8"
  );
  console.log(`Generated wfh_${gender}.json`);
}

// Generate all files
const genders = ["boys", "girls"];
for (const gender of genders) {
  generateLhfa(gender);
  generateWfa(gender);
  generateWfh(gender);
}
console.log("WHO data generation complete!");
