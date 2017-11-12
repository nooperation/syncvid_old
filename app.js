const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const logger = require('winston');
const listener = require('./server')(io, logger);
const shortid = require('shortid');

logger.configure({
  transports: [
    new (logger.transports.Console)({
      timestamp() {
        return new Date(Date.now()).toISOString();
      },
      formatter(options) {
        // Return string will be passed to logger.
        const message = options.message ? options.message : '';
        const meta = options.meta && Object.keys(options.meta).length ? `\n\t${JSON.stringify(options.meta)}` : '';
        return `[${options.timestamp()}] ${options.level.toUpperCase()} ${message}${meta}`;
      },
    }),
  ],
});

app.set('port', (process.env.PORT || 3000));

app.get('/background.jpg', (req, res) => {
  const NumImages = 10;
  const imageNumber = Math.floor(Math.random() * NumImages);
  res.sendFile(`${__dirname}/static/${imageNumber}.jpg`);
});

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/frontend/index.html`);
});
app.get('/room', (req, res) => {
  res.redirect(`/room/${shortid.generate()}`);
});
app.get('/room/:room_name', (req, res) => {
  res.sendFile(`${__dirname}/frontend/room.html`);
});

io.on('connection', listener);

http.listen(app.get('port'), () => {
  logger.info('http.listen', { Port: app.get('port') });
});
