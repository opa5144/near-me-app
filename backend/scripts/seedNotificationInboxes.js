// Compatibility entry point: the earlier ten-type preview was intentionally synthetic.
// It is retired. This command now previews/repairs only source-backed notifications;
// --apply requires the same private snapshot as the community refresh coordinator.
const { run } = require('./refreshDemoCommunity');

if (require.main === module) void run([...process.argv.slice(2), '--notifications-only']);
