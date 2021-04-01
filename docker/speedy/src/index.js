const Influx = require('influx');
const speedTest = require('speedtest-net');
const schedule = require('node-schedule');
const convertHrtime = require('convert-hrtime');

const settings = {
  SPEEDY_DB_HOST: process.env.SPEEDY_DB_HOST,
  SPEEDY_DB_NAME: process.env.SPEEDY_DB_NAME,
  SPEEDY_DB_PORT: process.env.SPEEDY_DB_PORT || 8086,
  SPEEDY_INTERVAL: process.env.SPEEDY_INTERVAL || '* * * * *',
  SPEEDY_MAX_TIME: process.env.SPEEDY_MAX_TIME || 50000,
  SPEEDY_DEBUG: process.env.SPEEDY_DEBUG || false
};

const influx = new Influx.InfluxDB({
  host: settings.SPEEDY_DB_HOST,
  database: settings.SPEEDY_DB_NAME || 'speedy',
  schema: [
    {
      measurement: 'speedtest',
      fields: {
        download: Influx.FieldType.INTEGER,
        upload: Influx.FieldType.INTEGER,
        originalUpload: Influx.FieldType.INTEGER,
        originalUploadTime: Influx.FieldType.INTEGER,
        originalDownload: Influx.FieldType.INTEGER,
        originalDownloadTime: Influx.FieldType.INTEGER,
        executionTime: Influx.FieldType.FLOAT,
        jitter: Influx.FieldType.FLOAT,
        latency: Influx.FieldType.FLOAT,
        packetLoss: Influx.FieldType.FLOAT
      },
      tags: [
        'interval',
        'isp',
        'host'
      ]
    }
  ]
});

console.log('Speedy settings:', settings);

// run it every minute                                                                  
schedule.scheduleJob(settings.SPEEDY_INTERVAL, () => {
  runSpeedTest();
});

function progress(event) {
  if (settings.SPEEDY_DEBUG) {
    if (event.type == 'log') {
      console.dir(event);
    }
    if (event.type == 'testStart') {
      influx.getDatabaseNames()
        .then(names => {
          if (!names.includes(settings.SPEEDY_DB_NAME)) {
            console.log(influx.createDatabase(settings.SPEEDY_DB_NAME));
          }
        });
      console.dir(event);
    }
  }
}

function writeData(data, timeTotal) {
  influx.writePoints([{
    measurement: 'speedtest',
    fields: {
      download: data.download.bandwidth,
      upload: data.upload.bandwidth,
      originalUpload: data.upload.bytes,
      originalUploadTime: data.upload.elapsed,
      originalDownload: data.download.bytes,
      originalDownloadTime: data.download.elapsed,
      executionTime: convertHrtime(timeTotal).s,
      jitter: data.ping.jitter,
      latency: data.ping.latency,
      packetLoss: data.packetLoss
    },
    tags: {
      interval: settings.SPEEDY_INTERVAL,
      isp: data.isp,
      host: data.server.host
    }
  }]).catch(err => {
    console.error('Error writing to InfluxDB:', err);
  });
}

async function runSpeedTest() {
  const t = process.hrtime();
  let data = null;

  const cancel = speedTest.makeCancel();
  setTimeout(cancel, settings.SPEEDY_MAX_TIME);

  try {
    data = await speedTest({
      acceptLicense: true,
      acceptGdpr: true,
      progress,
      cancel
    });

    writeData(data, process.hrtime(t));
  } catch (err) {
    console.log(err.message);
  } finally {
    if (data !== null)
      console.log('{ download: ' + data.download.bandwidth + ', upload: ' + data.upload.bandwidth + ', ping: ' + data.ping.latency + '}');
  }
};
