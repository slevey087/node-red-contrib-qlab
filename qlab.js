module.exports = function(RED) {
    "use strict";
    var osc = require('osc');
    var dgram = require('dgram');
    
    function QlabIn(config) {
        RED.nodes.createNode(this,config);
            
        this.port = config.port;
        this.passcode = config.passcode;
        var node = this;
  
        //require passcode if one is given by user        
        if (node.passcode !== "")   
            {   node.requirePasscode = true; }            
        else                        
            {   node.requirePasscode = false; }        
        
        //initialize with no connections.
        node.connectedTo = [];
        
        node.connectTo = function(ipAddress) {
            node.connectedTo.push(ipAddress);
            setTimeout(function() {node.disconnectFrom(ipAddress)}, 31000);
            return true;
        };
        
        node.disconnectFrom = function(ipAddress) {
            var index = node.connectedTo.indexOf(ipAddress);
            if (index > -1) {
                node.connectedTo.splice(index, 1);
            }
            return true;
        };
        
        node.checkConnection = function(ipAddress) {
            var index = node.connectedTo.indexOf(ipAddress);
            if (index > -1) { return true; }
            else { return false; }
        }
      
        
        
        // Create an osc.js UDP Port listening on port 57121.
        var udpPort = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: node.port,
            metadata: false
        };
            
                                      
       // Listen for incoming OSC bundles.
        udpPort.on("bundle", function (oscBundle, timeTag, info) {
            
            var packets = oscBundle.packets.slice();                      
            var payload = [];
            
            for (var i = 0, len = packets.length; i < len; i++) {
                if (packets[i].address == "/connect" && packets[i].args == node.passcode)
                { 
                    node.connectTo(info.address); 
                }
                
                else {
                    var connected = false;
                    
                    if (node.requirePasscode)
                    {
                        if (node.checkConnection(info.address)) { connected = true; }
                    }
                    else { connected = true; }
                    
                    if (node.connected) {
                        payload.push({address:packets[i].address,arguments:packets[i].args});
                    }
                    else { node.error("Receiving commands without proper passcode/connection.", {}); }
                }
            }
            
            //Don't send array if there's only one send-able message
            if (payload.length == 1) { payload = payload[0]; }
            
            node.send({payload:payload, packetInfo:info});
            
        }); 
        

        // Listen for incoming OSC single-messages.
        udpPort.on("message", function (oscMessage, timeTag, info) {
            
            var packet = oscMessage;                      
            var payload = {};            
            
            if (packet.address == "/connect" && packet.args == node.passcode)
            { 
                node.connectTo(info.address); 
            }
                
            else {
                var connected = false;
                    
                if (node.requirePasscode)
                {
                    if (node.checkConnection(info.address)) { connected = true; }
                }
                //Always connected if passcode not required
                else { connected = true; }
                
                if (node.connected) {
                    payload = {address:packet.address,arguments:packet.args};
                }
                else { node.error("Receiving commands without proper passcode/connection.", {}); }
            }
            
            node.send({payload:payload, packetInfo:info});
        });         
        
        udpPort.on("error", function (error) {
            node.error(error.message, []);
        });
        
        // Open the socket.
        udpPort.open();        
});

    
    }
    RED.nodes.registerType("qlab in",QlabIn);

    
    function QlabOut(config) {
        RED.nodes.createNode(this,config);
        
        var node = this;
        
        node.on('input', function(msg) {
              
        });
    
    }
    RED.nodes.registerType("qlab out",QlabOut);
    
    
    function QlabQuery(config) {
        RED.nodes.createNode(this,config);
        
        var node = this;
        
        node.on('input', function(msg) {
              
        });
    
    }
    RED.nodes.registerType("qlab query",QlabQuery);    
    
    
    function QlabConfig(config) {
         RED.nodes.createNode(this,config);
         
        this.ipAddress = config.ipAddress;
        this.passcode = config.passcode;
        this.sendPort = 53000;
        this.listenPort = 53001;
        
        var node = this;
     
    }
    RED.nodes.registerType("qlab cofig",QlabConfig);       
    
}
