// Ordered score metadata is shared by validation, the rating form, and summaries.
const EVENT_RATING_OPTIONS = Object.freeze([
  Object.freeze({ score: 1, emoji: '😞', label: 'Terrible' }),
  Object.freeze({ score: 2, emoji: '🙁', label: 'Poor' }),
  Object.freeze({ score: 3, emoji: '😐', label: 'Okay' }),
  Object.freeze({ score: 4, emoji: '🙂', label: 'Good' }),
  Object.freeze({ score: 5, emoji: '🤩', label: 'Excellent' }),
]);
const EVENT_RATING_SCORES = Object.freeze(EVENT_RATING_OPTIONS.map(option => option.score));

module.exports = { EVENT_RATING_OPTIONS, EVENT_RATING_SCORES };
