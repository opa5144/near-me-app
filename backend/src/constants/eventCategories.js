// Share category names across event validation and account preferences without
// depending on whether the Event schema stores one value or an array.
const EVENT_CATEGORIES = Object.freeze(['Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art']);

module.exports = { EVENT_CATEGORIES };
