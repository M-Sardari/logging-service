import axios from 'axios';
import * as Transport from 'winston-transport';

export class LokiTransport extends Transport {
  private lokiUrl: string;

  constructor(opts) {
    super(opts);
    this.lokiUrl = opts.lokiUrl;
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    // استخراج level و message از info
    const { level, message, ...labels } = info;

    // ساخت label‌ها - اطمینان از اینکه همه label ها رشته هستند
    const streamLabels = {
      job: 'nestjs-app',
      level,
      ...Object.entries(labels).reduce(
        (acc, [key, value]) => {
          acc[key] = String(value);
          return acc;
        },
        {} as Record<string, string>,
      ),
    };

    const logStream = {
      streams: [
        {
          stream: streamLabels,
          values: [
            [
              `${Date.now()}000000`, // نانوثانیه براساس فرمت Loki
              info.message,
            ],
          ],
        },
      ],
    };

    axios.post(`${this.lokiUrl}/loki/api/v1/push`, logStream).catch((error) => {
      console.error('Error pushing logs to Loki:', error);
    });

    callback();
  }
}
