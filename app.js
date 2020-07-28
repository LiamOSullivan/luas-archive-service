require('dotenv').config()
const createError = require('http-errors')
const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')
const cron = require('node-cron')
const fetch = require('node-fetch')
const fs = require('fs')
const indexRouter = require('./routes/index')
const usersRouter = require('./routes/users')
const csv = require('csv-parser')
const DomParser = require('dom-parser')
// const pg = require('pg')
const app = express()

// view engine setup
app.set('views', path.join(__dirname, 'views'))
// app.set('view engine', 'pug')

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({
  extended: false
}))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

app.use('/', indexRouter)
app.use('/users', usersRouter)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404))
})

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

/*
Parse the file list of stop ids to query later
*/
const stopIDs = []
let stopID

fs.createReadStream('data/luas-stops.txt')
  .pipe(csv({
    separator: '\t'
  }))
  .on('headers', (headers) => {
    stopID = headers[0] // hack: first header was being returned as a string?
  })
  .on('data', (row) => {
    // console.log(`Stop ID: ${row[stopID]}`);
    stopIDs.push(row[stopID])
  })
  .on('end', () => {
    console.log('Luas Stops file successfully processed')
    // console.log(stopIDs);
    luasCron(stopIDs) // start batch script on a schedule
    if (app.get('env') === 'development') {
      console.log(`************************************
                  Service is in dev- run query now
                  ************************************`)
      getLuasBatch(stopIDs, true) // start batch script now (for dev), save example data as text
    }
  })
  .on('error', (e) => {
    console.error(`There's been an error ${e}`)
  })

const luasAPIBase = 'https://luasforecasts.rpa.ie/analysis/view.aspx?id='

// use an async function that returns a promise, making the susequent call thenable
const getLuasHTML = async url => {
  try {
    const response = await fetch(url)
    const html = await response.text()
    // console.log("\n******\nLuas Data: " + JSON.stringify(html) + "\n******\n");
    return html
  } catch (error) {
    return console.log(error)
  }
}

// the call to the function returns a promise, so easy to proceed with response data with then()

function getLuasBatch (stops, SAVE_DATA_TO_FILE) {
  const stopQueryDateMS = Date.now()
  // if(SAVE_DATA_TO_FILE) luasExampleData = createOutputStream();
  const stopData = []
  stops.forEach((stop, idx) => {
    // console.log(i + " Get stop " + stop);
    getLuasHTML(luasAPIBase + stop)
      .then((html) => {
        const parser = new DomParser()
        const htmlDoc = parser.parseFromString(html)
        // console.log(htmlDoc.getElementById('cplBody_lblMessage').childNodes[0].text);
        // console.log(i + " Got stop " + stop);
        const headings = htmlDoc.getElementsByTagName('th')
        // console.log("#cols = " + headings.length + "\n");
        const rows = htmlDoc.getElementsByTagName('tr')
        // console.log("#rows = " + rows.length + "\n");

        const stopQueryDate = new Date()
        const year = stopQueryDate.getFullYear().toString()
        let month = stopQueryDate.getMonth() + 1
        month = month.toString().padStart(2, '0')
        const day = stopQueryDate.getDate().toString().padStart(2, '0')
        const hour = stopQueryDate.getHours().toString().padStart(2, '0')
        const dirName = `${year}-${month}-${day}-${hour}`

        const obj = {}

        obj.stopID = stop
        obj.stopQueryDate = stopQueryDate
        obj.count = rows.length - 1
        obj.results = []

        // no of rows ion the data is the number of trams listed to arrive
        for (let i = 1; i < rows.length; i += 1) {
          const tramObj = {}

          for (let j = 0; j < headings.length; j += 1) {
            const key = headings[j].childNodes[0].text
            // console.log("heading: " + JSON.stringify(heading));
            const value = rows[i].getElementsByTagName('td')[j].innerHTML
            // console.log("\nvalue: " + value);
            tramObj[`${key}`] = value
          }
          obj.results.push(tramObj)
        }
        stopData.push(obj)

        // console.log(`Push Stop #${stop} stopData size: ${stopData.length}`);
        /***
        TODO: pipe to writable stream for file here instead of this
        ***/
        if (stopData.length === stops.length) {
          // console.log("Finito");
          if (SAVE_DATA_TO_FILE) {
            // console.log("Save file");
            const dir = path.join(__dirname, 'data', 'historic', dirName)
            // const filename = `luas-stop${stop.padStart(2, '0')}-${ms}.json`;
            const filename = `luas-${stopQueryDateMS}.json`
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir)
            }
            fs.writeFileSync(path.join(dir, filename), `${JSON.stringify(stopData, null, 2)}`)
            console.log(`Luas data written to ${dir}/${filename}`)
          }
        }
      })
      .catch((e) => {
        console.log(`Error fetching html Luas data \n ${e}`)
      })
  }) // end foreach
};

// console.log(getLuasHTML(luasAPIBase + '1'));

function luasCron (stops) {
  cron.schedule('*/1 * * * *', () => {
    console.log('Running luas cron')
    getLuasBatch(stops, true) // don't save example data as text
  })
};

/********************

Database Access Layer

*********************/

// Connection string
// const CONNECT_STRING = 'host=luas-archive-db-server.postgres.database.azure.com port=5432 dbname={your_database} user=losullivan@luas-archive-db-server password={your_password} sslmode=disable';
//
// let d = new Date()
// let author = `test author`
// let quote = `test quote ${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}`
// const params = {
//   'stopID': '44',
//   'stopQueryDate': '2019-10-24T15:00:04.556Z',
//   'count': 6,
//   'results': [{
//     'Direction': 'Inbound',
//     'Destination': 'Parnell',
//     'Time': '00:06:23',
//     'AVLS': '00:07:03',
//     'Tram': '4001',
//     'Action': 'a',
//     'Msg Sent': '24/10/2019 15:59:58',
//     'Msg Received': '24/10/2019 15:59:58',
//     'Msg Processed': '24/10/2019 15:59:59',
//     'XML ID': '23008',
//     'Total Lag': '1.3310332',
//     'Create Lag': '0.4349533',
//     'Process Lag': '0.8960799'
//   },
//     {
//       'Direction': 'Inbound',
//       'Destination': 'Parnell',
//       'Time': '00:14:23',
//       'AVLS': '00:15:03',
//       'Tram': '5023',
//       'Action': 'a',
//       'Msg Sent': '24/10/2019 15:59:59',
//       'Msg Received': '24/10/2019 15:59:59',
//       'Msg Processed': '24/10/2019 16:00:00',
//       'XML ID': '23010',
//       'Total Lag': '1.5055758',
//       'Create Lag': '0.6904078',
//       'Process Lag': '0.815168'
//     },
//     {
//       'Direction': 'Outbound',
//       'Destination': "Bride's Glen",
//       'Time': '00:01:58',
//       'AVLS': '00:02:38',
//       'Tram': '5024',
//       'Action': 'a',
//       'Msg Sent': '24/10/2019 16:00:01',
//       'Msg Received': '24/10/2019 16:00:01',
//       'Msg Processed': '24/10/2019 16:00:01',
//       'XML ID': '23011',
//       'Total Lag': '0.7910377',
//       'Create Lag': '0.6656845',
//       'Process Lag': '0.1253532'
//     },
//     {
//       'Direction': 'Outbound',
//       'Destination': "Bride's Glen",
//       'Time': '00:11:20',
//       'AVLS': '00:12:00',
//       'Tram': '5030',
//       'Action': 'a',
//       'Msg Sent': '24/10/2019 15:59:59',
//       'Msg Received': '24/10/2019 15:59:59',
//       'Msg Processed': '24/10/2019 16:00:00',
//       'XML ID': '23010',
//       'Total Lag': '1.8677786',
//       'Create Lag': '0.6904078',
//       'Process Lag': '1.1773708'
//     },
//     {
//       'Direction': 'Outbound',
//       'Destination': "Bride's Glen",
//       'Time': '00:12:19',
//       'AVLS': '00:12:59',
//       'Tram': '5004',
//       'Action': 'a',
//       'Msg Sent': '24/10/2019 15:59:58',
//       'Msg Received': '24/10/2019 15:59:58',
//       'Msg Processed': '24/10/2019 15:59:59',
//       'XML ID': '23009',
//       'Total Lag': '1.9091918',
//       'Create Lag': '0.6560336',
//       'Process Lag': '1.2531582'
//     },
//     {
//       'Direction': 'Outbound',
//       'Destination': "Bride's Glen",
//       'Time': '00:16:16',
//       'AVLS': '00:16:56',
//       'Tram': '5010',
//       'Action': 'a',
//       'Msg Sent': '24/10/2019 15:59:58',
//       'Msg Received': '24/10/2019 15:59:58',
//       'Msg Processed': '24/10/2019 16:00:00',
//       'XML ID': '23009',
//       'Total Lag': '2.1600199',
//       'Create Lag': '0.6560336',
//       'Process Lag': '1.5039863'
//     }
//   ]
// }
//
// const db = require('./dal')
// let selectALlString = `SELECT * FROM luas_stops_readings;`
//
// db.query(selectALlString, [], (e, res) => {
//   if (e) {
//     return next(e)
//   }
//   console.log(`Query Res: ${JSON.stringify(res.rows[res.rows.length - 1])}`)
// })
//
// let createTableString =
//   `CREATE TABLE IF NOT EXISTS luas_stops_readings (
//     id SERIAL,
//     doc jsonb
//     );`
// // TODO: add constraints to the above
// // CONSTRAINT stop_id CHECK (length(doc->>'stopID') > 0 AND (doc->>'stop_id') IS NOT NULL),
// // CONSTRAINT stop_query_date CHECK (length(doc->>'quote') > 0 AND (doc->>'quote') IS NOT NULL)
//
// let insertString = `INSERT INTO luas_stops_readings(doc) VALUES ($1);`
//
// db.query(createTableString, [], (e, res) => {
//   // if (e) {
//   // return e; //if this were in an API call you'd call next(e) here
//   if (e) throw err
//
//   console.log(`Query ${createTableString}`)
//   // console.log(`Res: ${JSON.stringify(res)}`);
//   db.query(insertString, [params], (e, res) => {
//     if (e) throw e
//     console.log(`Query ${insertString} `)
//     // console.log(`Res: ${JSON.stringify(res)}`);
//   })
// })
//
// db.query(selectALlString, [], (e, res) => {
//   if (e) {
//     return next(e)
//   }
//   console.log(`Query Res: ${JSON.stringify(res.rows[res.rows.length - 1])}`)
// })
//
// // let listString =
// //   `SELECT * FROM quote_docs
// //     WHERE doc ->> 'author' LIKE ${db.client.escapeLiteral(params.author)};`;
//
// // db.query(listString, [params], (e, res) => {
// //   if (err) throw err
// //   console.log(`Query ${listString} `);
// //   // console.log(`Res: ${JSON.stringify(res.rows[0])}`);
// //
// // });
// // //
// // client.connect((e) => {
// //   if (e) {
// //     console.log("Error connecting to DB " + e);
// //     throw e;
// //   } else {
// //     dbHeartbeatCron();
// //     console.log(`Successfully connected to DB ${config.database} `);
// //
// //     client.query(`
// //       CREATE TABLE IF NOT EXISTS quote_docs (
// //         id SERIAL,
// //         doc jsonb,
// //         CONSTRAINT author CHECK (length(doc->>'author') > 0 AND (doc->>'author') IS NOT NULL),
// //         CONSTRAINT quote CHECK (length(doc->>'quote') > 0 AND (doc->>'quote') IS NOT NULL)
// //       )`, (err) => {
// //       if (err) throw err
// //
// //       if (params.author && params.quote) {
// //         console.log(`Query INSERT ${JSON.stringify(params)}`);
// //         client.query(`
// //           INSERT INTO quote_docs (doc)
// //           VALUES ($1);
// //         `, [params], (err) => {
// //           if (err) throw err
// //           list(client, params);
// //         })
// //       } else {
// //         console.log(`No author and/or quote`);
// //       }
// //     });
// //   }
// // });
// //
// // function list(client, params) {
// //   if (!params.author) {
// //     console.log(`End!`);
// //     return client.end();
// //   }
// //   console.log(`Run list!`);
// //   client.query(`
// //     SELECT * FROM quote_docs
// //     WHERE doc ->> 'author' LIKE ${client.escapeLiteral(params.author)}
// //   `, (err, results) => {
// //     if (err) throw err
// //     results.rows
// //       .map(({
// //         doc
// //       }) => doc)
// //       .forEach(({
// //         author,
// //         quote
// //       }) => {
// //         // console.log(`${author} ${quote}`)
// //       })
// //     client.end()
// //   })
// // }
//
// // //
// //
// // //test db time query
//
// function dbHeartbeatCron () {
//   cron.schedule('*/1 * * * *', () => {
//     util.log(`Checking DB heartbeat\n`)
//     // client
//     //   .query('SELECT NOW() as now')
//     //   .then(res => console.log(`Heartbeat - ${JSON.stringify(res.rows[0])}`))
//     //   .catch(e => console.error(`Heartbeat - ${e.stack}`));
//   })
// };

// test table query
// client
//   .query('SELECT * FROM test_table_01')
//   .then(res => console.log(res.rows[0]))
//   .catch(e => console.error(e.stack));

// res:-
// { test_id: 123,
//   test_name: 'Testy Mc Testface',
//   last_login: null }

// const query = {
//   text: 'INSERT INTO users(name, email) VALUES($1, $2)',
//   values: ['brianc', 'brian.m.carlson@gmail.com'],
// }

module.exports = app
