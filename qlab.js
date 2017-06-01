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
            setTimeout(function() { node.disconnectFrom(ipAddress); }, 31000);
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
        };
        
        //create udp socket
        node.socket = dgram.createSocket({type:'udp4', reuseAddr:true});
        
        //tidy up when flow stops
        node.on('close', function() {
           node.socket.close(); 
           node.connectedTo = [];
        });
        
        
        // Listen for incoming OSC single-messages.
        node.socket.on("message", function (message, info) {
            
            //in case of error
            try {
                //translate incoming packet
                var packet = osc.readPacket(message, {metadata:false, unpackSingleArgs:false});
            
                var payload = {};  
                
                //Assume single message
                var loopLength = 1;
                
                //if packet has 'packets' property, then it's a bundle, otherwise
                //it's a single message. See 'osc' documentation.
                if (packet.hasOwnProperty('packets')) {
                    loopLength = packet.packets.length;
                }
                else {
                    //put single message into array
                    var temp = [];
                    temp.push(JSON.parse(JSON.stringify(packet)));
                    packet = {};
                    packet.packets = temp.slice();
                    
                }
                
                
                for (var i = 0;  i < loopLength; i++) {
                    if (packet.packets[i].address == "/connect" && packet.packets[i].args == node.passcode)
                    { 
                        node.connectTo(info.address); 
                    }
                    
                    else {
                        //assume not connected unless connection is recorded or
                        //not requiring passcode
                        var connected = false;
                        
                        if (node.requirePasscode)
                        {
                            if (node.checkConnection(info.address)) { connected = true; }
                        }
                        else { connected = true; }
                        
                        if (node.connected) {
                            payload.push({address:packet.packets[i].address, arguments:packet.packets[i].args});
                        }
                        else { node.error("Receiving commands without proper passcode/connection.", {}); }
                    }
                }
                
                //Don't send array if there's only one send-able message
                if (payload.length == 1) { payload = payload[0]; }
                
                node.send({payload:payload, packetInfo:info});
            }
            catch (error) {
                node.error(error.message);
            }            
        });         
        
        node.socket.on("error", function (error) {
            node.error(error.message, []);
        });
        
        // Open the socket.
        try {
            var options = {port:node.port, exclusive:false};
            node.socket.bind(options);
        }
        catch (error) {
            node.error(error.message);
        }
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
