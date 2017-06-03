module.exports = function(RED) {
    "use strict";
    var EventEmitter = require('events').EventEmitter;
	var util = require('util');
    var dgram = require('dgram');
    var net   = require('net');
    var slip  = require('slip');
	var osc   = require('osc');
	
    
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
			
            try 
			{				
				packet = new Buffer(osc.writePacket(packet));
				var qlabMessage = new QlabMessage(packet, false);
				qlabMessage.on('noReply', function(){
					node.log("No reply, closing socket");
				});
				
				node.qlab.createSocket().send(qlabMessage);
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
			var packet;
			
			if (msg.topic) {
				packet = {address:msg.topic, args:msg.payload}; 
			}
			
            try 
			{				
				//packet = new Buffer(osc.writePacket(packet));
				var qlabMessage = new QlabMessage(packet, true).toOSC().toSlip().toBuffer();
				qlabMessage.on('noReply', function(){
					node.log("No reply, closing socket");
				});
				
				qlabMessage.on('reply', function(){
					node.send({payload:qlabMessage.data});
				});
				
				node.qlab.createSocket().send(qlabMessage);
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
				
				
			node.log("Socket created.");
			}
			
			return node;
		};
		
		
		this.send = function(qlabMessage) {			
			
			//numListening tracks how many messages are waiting for replies
			if (qlabMessage.needsReply) { node.numListening++; }			
            
            
			if (!node.socket) {
			    node.createSocket();
			}
			
			if (node.protocol == "tcp") {	
				
				//If port is not already open, then open it.
				//Once it's open, attach event listeners and
				//Send message.
				if (!node.listening) {
					node.socket.connect(node.sendPort, node.ipAddress, function(){
						node.listening = true;
						node.log("Listening on socket. numListening = " + node.numListening);
						
						//If a reply is received, verify that it's for the sending message
						//If so, pass along data. If not, keep listening
						node.socket.once("data", function(data) {
							if (qlabMessage.verifyReply()) { 
								node.numListening--; 
								qlabMessage.emit("replyRaw", data);
							}								
							
							console.log(node.numListening);
							//If nobody is listening, destroy socket.
							if (node.numListening === 0) {
								node.socket.destroy();
								node.listening = false;
								node.log("Socket destroyed");
							}							
						});	
						
						//Send message, and close port when finished, unless this or another
						//message is still waiting for a reply.
						node.socket.write(qlabMessage.data, function() {
							if (node.numListening === 0) {
								node.socket.destroy();
								node.listening = false;
								node.log("Socket closed because nobody listening");
							}	
						});
						
						
					});
				}
				else { 
					node.socket.once("data", function(data) {
						if (qlabMessage.verifyReply()) { 
							node.numListening--; 
							qlabMessage.emit("replyRaw", data);
						}	
						
						
						if (node.numListening === 0) {
							node.socket.destroy();
							node.listening = false;
							node.log("Socket destroyed");
						}
					
						qlabMessage.emit("replyRaw", data);
						qlabMessage.checkReply;
                    });	
                    
					node.socket.write(qlabMessage.data, function() {
						if (node.numListening === 0) {
							node.socket.destroy();
							node.listening = false;
							node.log("Socket closed because nobody listening");
						}	
					}); 
					
					
				}
				node.socket.setTimeout(1000, function() {
					if (qlabMessage.needsReply) {
						node.numListening--;
						qlabMessage.emit("noReply");
					}
					
					if (node.listening) {
						if (!node.numListening) {
							node.socket.destroy();
							node.listening = false;
						}
					}
				});
			}
			else if (node.protocol == "udp") {
			    if (qlabMessage.needsReply) {  
				
					if (!node.listening) {
						node.socket.bind(node.listenPort, node.ipAddress, function(){
							node.listening = true;
							node.log("Port bound");
							
							node.socket.once("message", function(data) {
								if (qlabMessage.verifyReply()) { 
									node.numListening--; 
									qlabMessage.emit("replyRaw", data);
								}								
								
								if (node.numListening === 0) {
									node.socket.close();
									node.socket = undefined;
									node.listening = false;
								}
							});							
						});
					}
					else { 
						node.socket.once("message", function(data) {
							if (qlabMessage.verifyReply()) { 
								node.numListening--; 
								qlabMessage.emit("replyRaw", data);
							}							
						
						
							if (node.numListening === 0) {
								node.socket.close();
								node.socket = undefined;
								node.listening = false;
							}
					
							
						});	                    									
					}					
				}
				
				node.socket.send(qlabMessage.data,node.sendPort,node.ipAddress, function(error) {
					if (error) {node.socket.emit('error', new Error(error.message)); }
					if (node.numListening === 0) {
							node.socket.close();
							node.socket = undefined;
							node.listening = false;
							node.log("Socket closed because nobody listening");
						}	
					
				});
				setTimeout(function() {
					if (qlabMessage.needsReply) {
						node.numListening--;
						qlabMessage.emit("noReply");
					}
					
					if (node.listening) {
						if (!node.numListening) {
							node.socket.close();
							node.socket = undefined;
							node.listening = false;
						}
					}
				}, 1000);
			}
		};
		
		this.closeSocket = function() {
		    node.listening = false;
		    node.numListening = 0;
		    node.socket = undefined;
		};
	 
	 

	 
    }
    RED.nodes.registerType("qlab config",QlabConfig);       
    
	function QlabMessage(data, needsReply, callingNode) {
		 EventEmitter.call(this);
		
		this.data = data;
		this.needsReply = needsReply;
		this.callingNode = callingNode;
		
		this.reply = {};
		
		var qlabMessage = this;
						
		this.toSlip = function() {
			qlabMessage.data = slip.encode(qlabMessage.data);
			return qlabMessage;
		};
		
		this.toOSC = function() {
			try {
				qlabMessage.data = osc.writePacket(qlabMessage.data);
			}
			catch (error) {
				qlabMessage.emit("error", new Error(error.message));
			}
			return qlabMessage;
		};
		
		this.toBuffer = function() {
			qlabMessage.data = new Buffer(qlabMessage.data);
			return qlabMessage;
		};
		
		this.fromOSCBuffer = function() {
			try {
				qlabMessage.data = osc.readPacket(qlabMessage.data, {metadata:false, unpackSingleArgs:false});
			}
			catch (error) {
				qlabMessage.emit("error", new Error(error.message));
			}
			return qlabMessage;
		};
		
		this.fromSlip = function(callback) {
			
			function emitError(message, errorMessage) {
				qlabMessage.emit("error", new Error(errorMessage));
			}
			
			var decoder = new slip.Decoder({
				onMessage: function(message) {
								qlabMessage.data = message;
								console.log("made it to the slip callback");
								callback();
								},
				onError  : emitError
			});

			decoder.decode(qlabMessage.data);
			
			return qlabMessage;
		};
		
		this.getData = function() {
			
		};
		
		this.getReply = function() {
			
		};
		
		this.verifyReply = function() {
			//preferably, each instance would overwrite this function.
			if (qlabMessage.needsReply)
				{ return true; }
			else 
				{ return false; }
		};
		
		qlabMessage.on("replyRaw", function() { 
			qlabMessage.needsReply = false; 
			qlabMessage.fromSlip(function() {qlabMessage.fromOSCBuffer().emit("reply");} );
			console.log("Reply received");
		});
		
	}
	util.inherits(QlabMessage, EventEmitter);
};
