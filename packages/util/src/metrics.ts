import promClient, { register } from 'prom-client';
import express, { Application } from 'express';

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

export async function startMetricsServer (host: string, port: number): Promise<void> {
  // Add default metrics
  promClient.collectDefaultMetrics();

  app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);

    const metrics = await register.metrics();
    res.send(metrics);
  });

  app.listen(port, () => {
    console.log(`Metrics exposed at http://${host}:${port}/metrics`);
  });
}
