module.exports = function(RED) {
    "use strict";
    var osc   = require('osc');
    var dgram = require('dgram');
    var net   = require('net');
    
    function QlabIn(config) {
        RED.nodes.createNode(this,config);
            
        this.port 	  = config.port;
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
            
                var payload = [];  
                
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
                
                //Variable to indicate whether message has permission
                var connected;
                
                for (var i = 0;  i < loopLength; i++) {
                    //If message is connect request, add sender info to list
                    if (packet.packets[i].address == "/connect" && packet.packets[i].args == node.passcode)
                    { 
                        node.connectTo(info.address); 
                    }
                    
                    //If message is connect request but wrong password, then don't allow subsequent messages
                    else if (packet.packets[i].address == "/connect" && packet.packets[i].args !== node.passcode)
                    {
                        connected = false;
                        
                        //If this was previously allowed user, dis-allow them
                        if (node.checkConnection(info.address)) { node.disconnectFrom(info.address); }
                    }
                    else {
                        //assume not connected unless connection is recorded or
                        //not requiring passcode
                        connected = false;
                        
                        if (node.requirePasscode)
                        {
                            if (node.checkConnection(info.address)) { connected = true; }
                        }
                        else { connected = true; }
                        
                        if (connected) {
                            payload.push({address:packet.packets[i].address, arguments:packet.packets[i].args});
                        }
                        else { node.error("Receiving commands without proper passcode/connection.", {}); }
                    }
                }
                
                //Don't send array if there's only one send-able message
                if (payload.length == 1) { payload = payload[0]; }
                
                //If proper passcodes, send message. If not, send rejection notice with
                //packet info.
                if (connected) {
                    node.send({payload:payload, packetInfo:info});
                }
                else {
                    node.send({payload:{rejected:true}, packetInfo:info});
                }
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
        
		// Retrieve the config node
        this.qlab 		 = RED.nodes.getNode(config.qlab);
		this.passcode 	 = config.passcode;
		this.workspaceId = config.workspaceId;
		
        var node = this;
        
		node.qlab.createSocket();
		
		//put event handlers here
		
        node.on('input', function(msg) {
			var packet;
			
			if (msg.topic) {
				packet = {address:msg.topic, args:msg.payload}; 
			}
			
            try {
				packet = new Buffer(osc.writePacket(packet));
				node.qlab.createSocket().send(packet, function(){
					node.log("callback reached");
				});
			}
			catch (error) {
				node.error(error.message);
			}
			
			
        });
    
    }
    RED.nodes.registerType("qlab out",QlabOut);
    
    
    function QlabQuery(config) {
        RED.nodes.createNode(this,config);
        
		// Retrieve the config node
        this.qlab 		 = RED.nodes.getNode(config.qlab);
		this.passcode 	 = config.passcode;
		this.workspaceId = config.workspaceId;
		
        var node = this;
		
		
        
        node.on('input', function(msg) {
			try {
				node.qlab.createSocket().send(msg.payload, function(){
					node.log("callback reached");
				});
			}
			catch (error) {
				node.error(error.message);
			}
        });
    
    }
    RED.nodes.registerType("qlab query",QlabQuery);    
    
    
    function QlabConfig(config) {
         RED.nodes.createNode(this,config);
         
        this.ipAddress 	= config.ipAddress;
        this.protocol 	= config.protocol;
				
        this.sendPort	= 53000;
        this.listenPort = 53001;	//for UDP only
        
		this.numListening = 0;
		
        var node = this;
     
	 
		this.createSocket = function() {
			
			//if socket does not already exist
			if (!node.socket) {
				
				if (node.protocol == 'tcp') {
					
					//create TCP socket
					node.socket = new net.Socket();															
					
					node.socket.on("error", function(error) {
						node.emit("error", error);
					});									
				}
				
				else if (node.protocol == "udp") {
					
					//create UDP socket
					node.socket = dgram.createSocket({type:'udp4', reuseAddr:true});
					
										node.socket.on("connect", function() {
						
					});					
					
					node.socket.on("error", function(error) {
						node.emit("error", error);
					});										
				}
				
				
			
			}
			
			return node;
		};
		
		
		this.send = function(message, waitForReply, callback) {
			var onReply = callback;
			var toSend = message;
			
			
			if (!callback) {
				onReply = function
			}
			
			if (node.socket) {
				
				
				if (node.protocol == "tcp") {
					
					if (waitForReply) { 
						node.numListening++; 
						node.socket.once("data", function() { node.numListening--; } )
					}	
					
					if (!node.listening) {
						node.socket.connect(node.sendPort, node.ipAddress, function(){
							node.listening = true;
							
							node.socket.once("data")							
							node.socket.write(message);
						});
					}
					else { node.socket.write(message); }
				}
			}
		};
	 
	 

	 
    }
    RED.nodes.registerType("qlab config",QlabConfig);       
    
};

