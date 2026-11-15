// Read-only preview by default. See --help; database changes require --apply.
// This utility never changes event ownership or resets existing credentials.
const { run } = require('./friendFixtureUtils');

if (require.main === module) run('seed');
