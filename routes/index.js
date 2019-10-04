var express = require('express');
var router = express.Router();

/* GET home page. */
let d = new Date();
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Luas data archiving service ',
    time: `${d}`
  });
});

module.exports = router;