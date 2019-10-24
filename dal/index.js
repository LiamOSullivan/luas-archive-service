const {
  Pool,
  Client
} = require('pg');

const config = {
  host: process.env.REALTIME_DB_SERVERNAME,
  port: 5432,
  database: process.env.LUAS_ARCHIVE_DB_NAME,
  user: process.env.REALTIME_DB_USER,
  password: process.env.REALTIME_DB_PASSWORD,
  ssl: true,
}

const pool = new Pool(config);
const client = new Client(config); //export some functions in client

module.exports = {
  query: (text, params, cb) => {
    return pool.query(text, params, (e, res) => {
      console.log('Execute query', {
        text,
        rows: res.rowCount || []
      });
      cb(e, res); //assume this calls done from below?
    })
  },
  getClient: (cb) => {
    pool.connnect((e, client, done) => {
      cb(e, client, done);
    })
  },
  client: client //export this to access e.g. escapeLiteral()
}