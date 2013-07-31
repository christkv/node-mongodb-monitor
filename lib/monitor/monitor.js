var http = require('http');

// Read in the configuration file for the monitor
var Monitor = exports.Monitor = function() {  
  this.servers = [];
  this.interval = 1000;
  this.output = null;
  this.reporting = 'numberofconnections';
}

Monitor.createFromConfig = function(config) {  
}

Monitor.createFromParameters = function(interval, output, servers, reporting, accumulate) {
  // Create new monitor object
  var monitor = new Monitor();
  // Split up the servers by comma
  var serverStrings = servers.split(/\,/);
  
  for(var i = 0; i < serverStrings.length; i++) {
    var parts = serverStrings[i].split(/\:/);
    monitor.addServer(new Server(parts[0], parseInt(parts[1]), accumulate));
  }  
  
  // Set the options
  monitor.interval = interval;
  monitor.output = output;
  monitor.reporting = reporting;
  monitor.accumulate = accumulate;
  // Return instance
  return monitor;
}

Monitor.prototype.addServer = function(server) {
  this.servers.push(server);
}

// Start the server
Monitor.prototype.start = function(callback) {
  var self = this;
  // We have defined an output file to dump our data
  if(this.output != null) {
    fs.open(this.output, 'w+', function(err, fd) {
      if(err != null) {
        // Set output fd
        self.outputFd = fd;        
        // Let's start the server
        __mainLoop(self);
      } else {
        callback(err, null);
      }
    })
  } else {
    // Start the server
    __mainLoop(self);    
  }
}

var __mainLoop = function(self) {
  // Set up the interval
  self.intervalId = setInterval(function() {
    // For each server instance let's do a rest request against the mongodb server
    for(var i = 0; i < self.servers.length; i++) {
      // Get one of the servers
      var server = self.servers[i];
      new function(serverInstance) {
        // Perform a rest request against the server and store the information in that server
        // instance
        var req = http.get({host:serverInstance.host, port:serverInstance.port, path:'/serverStatus'}, function(res) {          
          var data = '';
          res.on("data", function(chunk) { data += chunk; })
          res.on("end", function() {
            try {
              // Parse JSON object
              var object = JSON.parse(data);
              // Store object in server instance
              serverInstance.addServerStatus(object);
            } catch(err) {   
              console.dir(err);
            }
          })
        })
        
        // Error emitted
        req.on('error', function() {
          serverInstance.addServerStatus({connections:{current:0}, localTime: {$date: ''}});
        })        
      }(server);
    }    
  }, self.interval);
  
  // if reporting is defined
  if(self.reporting != null) {
    self.reportingIntervalId = setInterval(function() {
      if(self.reporting === 'numberofconnections') {
        reportingNumberOfConnections(self);
      }
    }, self.interval);
  }
}

var reportingNumberOfConnections = function(self) {
  // Print the type of reporting done
  console.log("==================================== reporting on [" + self.reporting + "] at " + new Date().getTime());
  // For each server instance let's do a rest request against the mongodb server
  for(var i = 0; i < self.servers.length; i++) {
    // Get one of the servers
    var server = self.servers[i];
    // Let's grab the last object stored and then present the number of open connections
    var metricsObject = server.getLastServerStatus();

    if(metricsObject != null) {
      console.log("[" + server.host + ":" + server.port + "] at " + metricsObject.localTime['$date'] + " = " + metricsObject.connections.current);
    } else {
      console.log("[" + server.host + ":" + server.port + "] not connected");      
    }
  }      
}

var Server = function(host, port, accumulate) {
  this.host = host;
  this.port = port;
  this.accumulate = accumulate;
  this.metrics = {serverStatus:[]};
}

Server.prototype.addServerStatus = function(object) {
  if(this.accumulate == false) {
    this.metrics['serverStatus']= [object];  
  } else {
    this.metrics['serverStatus'].push(object);      
  }  
}

Server.prototype.getLastServerStatus = function() {
  if(this.metrics['serverStatus'].length == 0) return null;
  return this.metrics['serverStatus'][this.metrics['serverStatus'].length - 1];
}