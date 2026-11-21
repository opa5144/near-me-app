const { reconcileEventLifecycle } = require('../services/eventLifecycleService');

// Archival is independent of notification delivery. A restart catches up due
// records; API date predicates stay authoritative between bounded batches.
function startEventLifecycleWorker() {
  let stopped = process.env.EVENT_LIFECYCLE_WORKER_ENABLED === 'false';
  let timer;
  let running = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    running = reconcileEventLifecycle({ shouldStop: () => stopped }).then(summary => {
      if (!stopped) timer = setTimeout(tick, summary.scanned >= 100 ? 50 : 30000);
    }).catch(error => {
      console.error('Event lifecycle processing failed:', error.name);
      if (!stopped) timer = setTimeout(tick, 30000);
    });
  };
  tick();
  return { async stop() { stopped = true; clearTimeout(timer); await running; } };
}

module.exports = { startEventLifecycleWorker };
