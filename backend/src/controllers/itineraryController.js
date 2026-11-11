const { generateSchedule } = require('../services/itineraryService');
const { ServiceError } = require('../services/serviceError');

async function generate(req, res) {
  try {
    const schedule = await generateSchedule(req.body);
    return res.status(200).json({ success: true, ...schedule });
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { generate };
