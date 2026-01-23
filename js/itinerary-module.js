import {camps, trailhead} 
from "../routes/hampta-pass/camps.js";
let campIndices = [];
let dayBounds = [];
let lastDay = null;

// ======= SETTERS =======
export function setCamps(arr) {
    camps = arr;
}

export function setCampIndices(arr) {
    campIndices = arr;
}
export function getCampIndices() {
    return campIndices;
}

export function setDayBounds(arr) {
    dayBounds = arr;
}
export function getDayBounds() {
    return dayBounds;
}

// ======= DAY LOGIC =======
export function getDayForIndex(i) {
    let day = 0;
    for (let b = 0; b < dayBounds.length - 1; b++) {
        if (i >= dayBounds[b+1]) day++;
        else break;
    }
    return day;
}



// ======= CAMP LOGIC =======
export function getCampContext(i) {
  const campIdx = campIndices.indexOf(i);

  if (campIdx !== -1) {
    return {
      type: "at",
      campIdx,
      camp: camps[campIdx]
    };
  }

  const day = getDayForIndex(i);

  return {
    type: "between",
    fromCamp: (day === 0) ? trailhead : camps[day - 1],
    toCamp: (day < camps.length) ? camps[day] : null
  };
}

export function getDayContext(i) {
  const day = getDayForIndex(i); // 0-based segment index

  // fromCamp is trailhead for day 0
  const fromCamp = (day === 0)
      ? trailhead
      : camps[day - 1];

  const toCamp = (day < camps.length)
      ? camps[day]
      : null; // after final camp (optional endpoint)

  const isCampBoundary = campIndices.includes(i);

  return {
    dayIndex: day,
    fromCamp,
    toCamp,
    isStartOfDay: isCampBoundary,
    isEndOfDay: isCampBoundary
  };
}