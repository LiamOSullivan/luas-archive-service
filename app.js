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
// const HTMLParser = require('node-html-parser');
const DomParser = require('dom-parser');

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
    console.log('File successfully processed');
    // console.log(stopIDs);
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
getLuasHTML(luasAPIBase + '1')
  .then((html) => {

    let parser = new DomParser();
    let htmlDoc = parser.parseFromString(html);
    console.log(htmlDoc.getElementById('cplBody_lblMessage').childNodes[0].text);

    let headings = htmlDoc.getElementsByTagName("th");
    console.log("#cols = " + headings.length + "\n");
    let rows = htmlDoc.getElementsByTagName("tr");
    console.log("#rows = " + rows.length + "\n");
    let tableData = [];
    for (let i = 1; i < rows.length; i += 1) {
      let obj = {};
      for (let j = 0; j < headings.length; j += 1) {
        let heading = headings[j]
          .childNodes[0];
        // .nodeValue;
        console.log("heading: " + JSON.stringify(heading));
        let value = rows[i].getElementsByTagName("td")[j].innerHTML;
        console.log("\nvalue: " + value);
        obj[heading] = value;
      }
      console.log("obj: " + JSON.stringify(obj));
      tableData.push(obj);
    }
    tableData.forEach((d, i) => {
      console.log(d.route + " Due: " + d.duetime + "");
      //only return n results
      // if (i <= 7) {
      //   luasRT += "<br><b>" + d["Direction"] +
      //     "</b> to <b>" + d["Destination"] + "</b>";
      //   if (d["Time"]) {
      //     let min = d["Time"].split(":")[1];
      //     if (min === "00") {
      //       luasRT += " is <b>Due now</b>";
      //
      //     } else {
      //       luasRT += " is due in <b>" + min + "</b> mins";
      //     }
      //   } else {
      //     "n/a";
      //   }
      // }

    });

  })
  .catch((e) => {
    console.log(`Error fetching html data \n ${e}`);
  });



// console.log(getLuasHTML(luasAPIBase + '1'));

cron.schedule('*/1 * * * *', () => {
  // util.log(`Running luas cron`);
  // const html = getLuasHTML(luasAPIBase + '1')
  // const htmlDoc = HTMLParser.parse(luasAPIBase + '1');
  // console.log(htmlDoc);
  // console.log(htmlDoc.firstChild.structure);

  // d3.html(luasAPIBase + '1')
  //   .then(function(htmlDoc) {
  //     //                console.log(htmlDoc.body);
  //     let infoString = htmlDoc.getElementById("cplBody_lblMessage")
  //       .childNodes[0].nodeValue;
  //     //console.log("info: " + infoString + "\n");
  //     let headings = htmlDoc.getElementsByTagName("th");
  //     //console.log("#cols = " + headings.length + "\n");
  //     let rows = htmlDoc.getElementsByTagName("tr");
  //     //console.log("#rows = " + rows.length + "\n");
  //     let tableData = [];
  //     for (let i = 1; i < rows.length; i += 1) {
  //       let obj = {};
  //       for (let j = 0; j < headings.length; j += 1) {
  //         let heading = headings[j]
  //           .childNodes[0]
  //           .nodeValue;
  //         let value = rows[i].getElementsByTagName("td")[j].innerHTML;
  //         //console.log("\nvalue: "+ value);
  //         obj[heading] = value;
  //       }
  //       //console.log("\n");
  //       tableData.push(obj);
  //     }
});

module.exports = app;