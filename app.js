var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var logger = require('winston');
var listener = require('./server')(io, logger);
var shortid = require('shortid');

logger.configure({
 transports: [
    new (logger.transports.Console)({
      timestamp: function() {
        return new Date(Date.now()).toISOString();
      },
      formatter: function(options) {
        // Return string will be passed to logger.
        return '[' + options.timestamp() + '] ' + options.level.toUpperCase() + ' '+ (options.message ? options.message : '') +
          (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
      }
    })
  ]
});

app.set('port', (process.env.PORT || 3000));

app.get('/background.jpg', function (req, res) {
  var kNumImages = 10;
  var image_number = Math.floor(Math.random() * kNumImages);
  res.sendFile(__dirname + '/static/' + image_number + '.jpg');
});

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/frontend/index.html');
});
app.get('/room', function (req, res) {
  res.redirect('/room/' + shortid.generate());
});
app.get('/room/:room_name', function (req, res) {
  res.sendFile(__dirname + '/frontend/room.html');
});

io.on('connection', listener);

http.listen(app.get('port'), function () {
  logger.info('http.listen', { 'Port': app.get('port') });
});
