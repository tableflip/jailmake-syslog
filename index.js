var syslogParser = require('glossy').Parse; // or wherever your glossy libs are
var dgram  = require("dgram");
var server = dgram.createSocket("udp4");
var DDPClient = require('ddp')

var ddpclient = new DDPClient({
  host: process.argv[2] || "localhost",
  port: 3000,
  /* optional: */
  auto_reconnect: true,
  auto_reconnect_timer: 500,
  use_ejson: true,  // default is false
  use_ssl: false, //connect to SSL server,
  use_ssl_strict: true, //Set to false if you have root ca trouble.
  maintain_collections: true //Set to false to maintain your own collections.
})

ddpclient.connect(function(error) {
  console.log('connected!');

  if (error) {
    console.log('DDP connection error!');
    return;
  }
})

var users = {
  "f8:a9:d0:0d:a4:e7": { name: "Evans" },
  "1c:b0:94:a8:50:a6": { name: "Liam" },
  "cc:fa:00:e9:22:d0": { name: "Bernard" }
}

var router = {
  "Associated with station": online,
  "Disassociated with station": offline
}

function findUser (msg) {
  if(!msg.mac) return
  var user = users[msg.mac]
  if (!user) user = users[msg.mac] = {status: 'offline', lastSeen: 'never'}
  msg.user = user
  return user
}

function userEvent (msg) {
  if(!msg.user) return
  msg.user.lastSeen = new Date().toISOString() // TODO: could extract value from sylog msg...
  console.log("%s - %s - %s is %s", msg.user.lastSeen, msg.mac, msg.user.name, msg.user.status)
}

function online (msg) {
  if(!msg.user) return
  msg.user.status = "online"
}

function offline (msg) {
  if(!msg.user) return
  msg.user.status = "offline"
}

/* Split messages that contain a mac like so:
  from { message: "Associated with station 18:34:51:d1:73:ff" }
    to { event: "Associated with station", mac:"18:34:51:d1:73:ff"}
*/
function macParser(msg) {
  // "Associated with station 18:34:51:d1:73:ff" => ["Associated with station", "18:34:51:d1:73:ff"]
  var regex = /^\d+: (.+) ((?:\w\w:){5}\w\w)$/
  var res = regex.exec(msg.message)

  // console.log('regex', res)

  if(res) {
    msg.mac = res[2]
    msg.event = res[1]
  }

  return msg
}

/* handles parsed syslog msgs like
  {
    facility: 'local4', // these can either be a valid integer,
    severity: 'error',  // or a relevant string
    host: 'localhost',
    appName: 'sudo',
    pid: '123',
    date: new Date(Date()),
    message: 'Nice, Neat, New, Oh Wow'
  }
*/
function syslogMessageHandler(msg) {

  macParser(msg)
  // console.error('msg', msg)
  if (!msg.event) return // not a mac msg
  // console.log(msg.mac, msg.event)
  findUser(msg)
  var handler = router[msg.event] || function() {}
  handler(msg)
  userEvent(msg)
}

server.on("message", function(rawMessage) {
  syslogParser.parse(rawMessage.toString('utf8', 0), syslogMessageHandler)
});

server.on("listening", function() {
  var address = server.address();
  console.log("Server now listening at " +
      address.address + ":" + address.port);
});

server.bind(514); // Remember ports < 1024 need suid
