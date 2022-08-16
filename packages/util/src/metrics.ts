import promClient, { register } from 'prom-client';
import express, { Application } from 'express';
import debug from 'debug';
import assert from 'assert';

import { MetricsConfig } from './config';

const log = debug('vulcanize:metrics');

// Create custom metrics
export const lastProcessedBlock = new promClient.Gauge({
  name: 'last_processed_block',
  help: 'Last processed block'
});

export const lastBlockProcessDuration = new promClient.Gauge({
  name: 'last_block_process_duration_ms',
  help: 'Last block process duration (ms)'
});

export const lastBlockNumEvents = new promClient.Gauge({
  name: 'last_block_num_events',
  help: 'Number of events in the last block'
});

// Export metrics on a server
const app: Application = express();

export async function startMetricsServer (metrics: MetricsConfig): Promise<void> {
  if (!metrics) {
    log('Metrics is disabled. To enable add metrics host and port.');
    return;
  }

  assert(metrics.host, 'Missing config for metrics host');
  assert(metrics.port, 'Missing config for metrics port');

  // Add default metrics
  promClient.collectDefaultMetrics();

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);

    const metrics = await register.metrics();
    res.send(metrics);
  });

  app.listen(metrics.port, metrics.host, () => {
    log(`Metrics exposed at http://${metrics.host}:${metrics.port}/metrics`);
  });
}
