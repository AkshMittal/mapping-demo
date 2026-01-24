export const trailhead = {
  name: "Jobri",
  distKm: 0,          // start of route
  type: "trailhead"
};
export const camps = [
  {
    campIdx: 0,
    name: "Chika",
    distKm: 3.7,               // cumulative km from start
    day: 1,                    // 1-based trekking day
    fromName: null,            // no camp before first
    toName: "Balu Ka Ghera"
  },
  {
    campIdx: 1,
    name: "Balu Ka Ghera",
    distKm: 3.7 + 5.5,         // = 9.2 cumulative
    day: 2,
    fromName: "Chika",
    toName: "Shea Goru"
  },
  {
    campIdx: 2,
    name: "Shea Goru",
    distKm: 3.7 + 5.5 + 4.5,   // = 13.7 cumulative
    day: 3,
    fromName: "Balu Ka Ghera",
    toName: "Chhatru"
  },
  {
    campIdx: 3,
    name: "Chhatru",
    distKm: 3.7 + 5.5 + 4.5 + 7.3, // = 21.0 cumulative
    day: 4,
    fromName: "Shea Goru",
    toName: null                // endpoint, no next camp
  }
];
