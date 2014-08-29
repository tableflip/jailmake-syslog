var syslogParser = require('glossy').Parse; // or wherever your glossy libs are
var dgram  = require("dgram");
var server = dgram.createSocket("udp4");
var DDPClient = require('ddp')

var ddpclient = new DDPClient({
  host: process.argv[2] || "jail.meteor.com",
  port: process.argv[3] || 80,
  /* optional: */
  auto_reconnect: true,
  auto_reconnect_timer: 500,
  use_ejson: true,  // default is false
  use_ssl: false, //connect to SSL server,
  use_ssl_strict: true, //Set to false if you have root ca trouble.
  maintain_collections: true //Set to false to maintain your own collections.
})

console.log('JAILmake syslog server online. Commencing initiation sequence...')

ddpclient.connect(function(error) {
  if (error) {
    console.log('Failed to connect to: %s:%s', ddpclient.host, ddpclient.port)
    return;
  }
  console.log('Connected to: %s:%s', ddpclient.host, ddpclient.port)
  poll()
})
ddpclient.on('socket-close', function(code, message) {
  console.log('Lost connection to  %s:%s', ddpclient.host, ddpclient.port)
  sending = false
})
ddpclient.on('socket-error', function(error) {
  console.log("Error in connection to %s:%s - %j", ddpclient.host, ddpclient.port, error)
  sending = false
})

var outbox = []

var sending = false

var router = {
  "Associated with station": online,
  "Disassociated with station": offline
}

function online (msg) {
  if(!msg) return
  msg.status = "online"
}

function offline (msg) {
  if(!msg) return
  msg.status = "offline"
}

function poll (){
  setTimeout(function(){
    poll()
    if(!outbox.length || sending === true) return
    var msg = outbox[outbox.length-1]
    sending = true
    ddpclient.call(
      'syslog',
      [msg.mac,new Date(),msg.status],
      function (err, result){
       sending = false
       if(result === msg.mac) {
         outbox.pop()
         console.log('  DDP OUT: %s %s (%s more in queue)', msg.mac, msg.status, outbox.length)
       }
      }
    )
  },500)
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
  var handler = router[msg.event] || function() {}
  handler(msg)
  outbox.unshift(msg)
  console.log('SYSLOG IN: %s %s', msg.mac, msg.status)
}

server.on("message", function(rawMessage) {
  syslogParser.parse(rawMessage.toString('utf8', 0), syslogMessageHandler)
});

server.on("listening", function() {
  var address = server.address();
  console.log("Listening for syslog messages at: " +
      address.address + ":" + address.port);
});

server.bind(514); // Remember ports < 1024 need suid
