const {
  Pool
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

module.exports = {
  query: (text, params, cb) => {
    return pool.query(text, params, (e, res) => {
      console.log('Execute query', {
        text,
        rows: res.rowCount
      });
      cb(e, res);
    })
  },
  getClient: (cb) => {
    pool.connnect((e, client, done) => {
      cb(e, client, done)
    })
  }
}