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
      util.log(`***
                  Dashboard is in dev- run query now
                ***`);
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
  const queryTimeMS = Date.now();
  // if(SAVE_DATA_TO_FILE) luasExampleData = createOutputStream();
  stops.forEach((stop, i) => {
    //console.log(i + " Get stop " + stop);
    if (i == stops.length - 1) {
      //console.log("***");
    }
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
        let stopData = [];
        const timestamp = new Date();
        const ms = Date.now();
        for (let i = 1; i < rows.length; i += 1) {
          let obj = {};
          obj["StopID"] = stop;
          obj["timestamp"] = timestamp;

          for (let j = 0; j < headings.length; j += 1) {
            let heading = headings[j].childNodes[0].text;
            // .nodeValue;
            // console.log("heading: " + JSON.stringify(heading));
            let value = rows[i].getElementsByTagName("td")[j].innerHTML;
            // console.log("\nvalue: " + value);
            obj[heading] = value;
          }
          // console.log("obj: " + JSON.stringify(obj));
          stopData.push(obj);
        }
        // console.log(stopData);
        // /console.log(`Stop #${stop} returned records size: ${stopData.length}`);
        if (SAVE_DATA_TO_FILE) {
          const dir = path.join(__dirname, 'data', 'historic', `${queryTimeMS}`);
          const filename = `luas-stop${stop.padStart(2, '0')}-${ms}.json`;
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
          }
          fs.writeFileSync(path.join(dir, filename), `${JSON.stringify(stopData, null, 2)}`);
          console.log(`Luas data written to ${dir}/${filename}`);
        }
      })
      .catch((e) => {
        console.log(`Error fetching html Luas data \n ${e}`);
      });
  });
};


// console.log(getLuasHTML(luasAPIBase + '1'));

function luasCron(stops) {
  cron.schedule('*/1 * * * *', () => {
    util.log(`Running luas cron`);
    getLuasBatch(stops, false); // don't save example data as text
  })
};

// db.connect((err) => {
//   if (err) throw err
//   // db.query(`
//   //   CREATE TABLE IF NOT EXISTS quote_docs (
//   //     id SERIAL,
//   //     doc jsonb,
//   //     CONSTRAINT author CHECK (length(doc->>'author') > 0 AND (doc->>'author') IS NOT NULL),
//   //     CONSTRAINT quote CHECK (length(doc->>'quote') > 0 AND (doc->>'quote') IS NOT NULL)
//   //   )
//   // `, (err) => {
//   //   if (err) throw err
//   //
//   //   if (params.author && params.quote) {
//   //     db.query(`
//   //       INSERT INTO quote_docs (doc)
//   //       VALUES ($1);
//   //     `, [params], (err) => {
//   //       if (err) throw err
//   //       list(db, params)
//   //     })
//   //   }
//   //
//   //   if (!params.quote) list(db, params)
//   else {
//     console.log(`Connected to DB ${db}`);
//     list(db, `Neal Stephenson`)
//   }
// })
//
// function list(db, params) {
//   // if (!params.author) return db.end()
//   db.query(`
//     SELECT * FROM quotes
//     WHERE author LIKE ${db.escapeLiteral(params)}
//   `, (err, results) => {
//     if (err) throw err
//     results.rows.forEach(({
//       author,
//       quote
//     }) => {
//       console.log(`${author} ${quote}`)
//     })
//     db.end()
//   })
// }


module.exports = app;