// Removes only unchanged relationships recorded by this utility's seed manifest.
// Every account, profile, security record, event, and adopted relationship is retained.
const { run } = require('./friendFixtureUtils');

if (require.main === module) run('cleanup');
