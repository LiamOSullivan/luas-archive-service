const createError = require('http-errors')
const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')
const cron = require('node-cron')
const util = require('util')
const moment = require('moment')
const fetch = require("node-fetch")
const fs = require('fs')
const indexRouter = require('./routes/index')
const usersRouter = require('./routes/users')
const csv = require('csv-parser');
const DomParser = require('dom-parser');
const pg = require('pg');
const db = new pg.Client();

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

/*
Parse the file list of stop ids to query later
*/
let stopIDs = [];
let stopID;

fs.createReadStream('data/luas-stops.txt')
  .pipe(csv({
    separator: '\t'
  }))
  .on('headers', (headers) => {
    stopID = headers[0]; //hack: first header was being returned as a string?
  })
  .on('data', (row) => {
    // console.log(`Stop ID: ${row[stopID]}`);
    stopIDs.push(row[stopID]);
  })
  .on('end', () => {
    console.log('Luas Stops file successfully processed');
    // console.log(stopIDs);
    luasCron(stopIDs); //start batch script on a schedule
    if (app.get('env') === 'development') {
      util.log(`************************************
                  Service is in dev- run query now
                  ************************************`);
      getLuasBatch(stopIDs, true); //start batch script now (for dev), save example data as text
    }
  })
  .on('error', (e) => {
    console.error(`There's been an error ${e}`);
  });

let luasAPIBase = "https://luasforecasts.rpa.ie/analysis/view.aspx?id=";

// use an async function that returns a promise, making the susequent call thenable
const getLuasHTML = async url => {
  try {
    const response = await fetch(url);
    const html = await response.text();
    // console.log("\n******\nLuas Data: " + JSON.stringify(html) + "\n******\n");
    return html;

  } catch (error) {
    return util.log(error);
  }
};

//the call to the function returns a promise, so easy to proceed with response data with then()

function getLuasBatch(stops, SAVE_DATA_TO_FILE) {
  const stopQueryDateMS = Date.now();
  // if(SAVE_DATA_TO_FILE) luasExampleData = createOutputStream();
  let stopData = [];
  stops.forEach((stop, i) => {
    //console.log(i + " Get stop " + stop);
    getLuasHTML(luasAPIBase + stop)
      .then((html) => {
        let parser = new DomParser();
        let htmlDoc = parser.parseFromString(html);
        // console.log(htmlDoc.getElementById('cplBody_lblMessage').childNodes[0].text);
        //console.log(i + " Got stop " + stop);
        let headings = htmlDoc.getElementsByTagName("th");
        // console.log("#cols = " + headings.length + "\n");
        let rows = htmlDoc.getElementsByTagName("tr");
        // console.log("#rows = " + rows.length + "\n");

        const stopQueryDate = new Date();
        const year = stopQueryDate.getFullYear().toString();
        const month = stopQueryDate.getMonth().toString().padStart(2, '0');
        const day = stopQueryDate.getDay().toString().padStart(2, '0');
        const hour = stopQueryDate.getHours().toString().padStart(2, '0');
        const dirName = `${year}-${month}-${day}-${hour}`;

        let obj = {};
        obj["stopID"] = stop;
        obj["stopQueryDate"] = stopQueryDate;
        obj["count"] = rows.length - 1;
        obj["results"] = [];

        //no of rows ion the data is the number of trams listed to arrive
        for (let i = 1; i < rows.length; i += 1) {
          let tramObj = {};
          for (let j = 0; j < headings.length; j += 1) {
            let key = headings[j].childNodes[0].text;
            // console.log("heading: " + JSON.stringify(heading));
            let value = rows[i].getElementsByTagName("td")[j].innerHTML;
            // console.log("\nvalue: " + value);
            tramObj[`${key}`] = value;
          }
          obj["results"].push(tramObj);

        }
        stopData.push(obj);
        // console.log(`Push Stop #${stop} stopData size: ${stopData.length}`);
        /***
        TODO: pipe to writable stream for file here instead of this
        ***/
        if (stopData.length === stops.length) {
          // console.log("Finito");
          if (SAVE_DATA_TO_FILE) {
            // console.log("Save file");
            const dir = path.join(__dirname, 'data', 'historic', dirName);
            // const filename = `luas-stop${stop.padStart(2, '0')}-${ms}.json`;
            const filename = `luas-${stopQueryDateMS}.json`;
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir);
            }
            fs.writeFileSync(path.join(dir, filename), `${JSON.stringify(stopData, null, 2)}`);
            console.log(`Luas data written to ${dir}/${filename}`);
          }
        }
      })
      .catch((e) => {
        console.log(`Error fetching html Luas data \n ${e}`);
      })
  });
};


// console.log(getLuasHTML(luasAPIBase + '1'));

function luasCron(stops) {
  cron.schedule('*/1 * * * *', () => {
    util.log(`Running luas cron`);
    getLuasBatch(stops, true); // don't save example data as text
  })
};
// Connection string
// const CONNECT_STRING = 'host=luas-archive-db-server.postgres.database.azure.com port=5432 dbname={your_database} user=losullivan@luas-archive-db-server password={your_password} sslmode=disable';
//
// const host = 'luas-archive-db-server.postgres.database.azure.com',
//   port = 5432,
//   dbname = 'luas-archive-db-server',
//   user = 'losullivan@luas-archive-db-server',
//   password = '*********';
// sslmode = true;
//
// let client = new pg.Client({
//   user: user,
//   password: password,
//   database: dbname,
//   port: port,
//   host: host,
//   ssl: false
// });
//
// client.connect((e) => {
//   console.log("Error connecting to DB " + e);
// });
//     list(db, `Neal Stephenson`)

module.exports = app;