import assert from 'assert';
import debug from 'debug';
import PgBoss from 'pg-boss';

interface Config {
  dbConnectionString: string
}

type JobCallback = (job: any) => Promise<void>;

const log = debug('vulcanize:job-queue');

export class JobQueue {
  _config: Config;
  _boss: PgBoss;

  constructor (config: Config) {
    this._config = config;
    this._boss = new PgBoss(this._config.dbConnectionString);
    this._boss.on('error', error => log(error));
  }

  async start (): Promise<void> {
    await this._boss.start();
  }

  async subscribe (queue: string, callback: JobCallback): Promise<void> {
    await this._boss.subscribe(queue, async (job: any) => {
      console.log(`Processing queue ${queue} job ${job.id}...`);
      await callback(job);
    });
  }

  async pushJob (queue: string, job: any): Promise<void> {
    assert(this._boss);

    const jobId = await this._boss.publish(queue, job);
    log(`Created job in queue ${queue}: ${jobId}`);
  }
}
