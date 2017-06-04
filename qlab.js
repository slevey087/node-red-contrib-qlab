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
		this.command 	 = config.command
		
        var node = this;
        
		var currentMessage = null;
		
		if (node.workspaceId) {
			node.workspaceString = "/workspace/" + node.workspaceId;
        }
		else {
			node.workspaceString = "";
		}
		
		node.qlab.createSocket();
		
		//put event handlers here
		
        node.on('input', function(msg) {
			var packet;
			var command;
			var args;
			
			if (node.command) {
				command = node.command.split(" ");
				
				packet = {address: command[0], args: command.slice(1)};				
				if (packet.args === "") { packet.args = undefined; }
			}
			else if (msg.payload.address) {
				args = msg.payload.args || null;
				packet = {address:msg.payload.address, args: args}
			}			
			else if (msg.topic) {
				packet = {address:msg.topic, args:msg.payload}; 
				if (packet.args === "") { packet.args = undefined; }
			}
			else if (typeof msg.payload == "string" && msg.payload !== "") {
				command = msg.payload.split(" ");
				packet = {address: command[0], args: command.slice(1)};
			}
			else {
				packet = null;
			}
			
			
			if ((packet) && msg.workspace !== false) {
				packet.address = node.workspaceString + packet.address;
			}

			
            try 
			{				
				if (!packet) {
					throw new Error("Received no data. Please use documented format.")
				}
				var qlabMessage = new QlabMessage(packet, false, node.passcode);
				
				node.qlab.createSocket().send(qlabMessage);
			}
			catch (error) {
				node.error(error.message);
			}						
        });   
		node.on('close', function() {
			if (currentMessage) {
				currentMessage.message = "";
				currentMessage.needsReply = false;				
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
		this.command 	 = config.command;
		
        var node = this;
		
		var currentMessage = null;
		
		if (node.workspaceId) {
			node.workspaceString = "/workspace/" + node.workspaceId;
        }
		else {
			node.workspaceString = "";
		}
		
        node.on('input', function(msg) {
			var packet;
			var command;
			var args;
			
			if (node.command) {
				command = node.command.split(" ");
				
				packet = {address: command[0], args: command.slice(1)};				
				if (packet.args === "") { packet.args = undefined; }
			}
			else if (msg.payload.address) {
				args = msg.payload.args || null;
				packet = {address:msg.payload.address, args: args}
			}			
			else if (msg.topic) {
				packet = {address:msg.topic, args:msg.payload}; 
				if (packet.args === "") { packet.args = undefined; }
			}
			else if (typeof msg.payload == "string" && msg.payload !== "") {
				command = msg.payload.split(" ");
				packet = {address: command[0], args: command.slice(1)};
			}
			else {
				packet = null;
			}
			
			
			if ((packet) && msg.workspace !== false) {
				packet.address = node.workspaceString + packet.address;
			}
			
			
            try 
			{	
				if (!packet) {
					throw new Error("Received no data. Please use documented format.")
				}
				var qlabMessage = new QlabMessage(packet, true, node.passcode);
				
				//In order to clear message when flow stops
				currentMessage = qlabMessage;
				
				qlabMessage.on('reply', function(){
					node.send({payload:qlabMessage.reply});
				});
				
				qlabMessage.on('noReply', function(){
					node.warn("No reply, closing socket");
				});				
				
				qlabMessage.on('error', function(error){
				    node.error(error.message);
				});
				
				node.qlab.createSocket().send(qlabMessage);
			}
			catch (error) {
				node.error(error.message, msg);
				msg = {};
			}
        });
		
		node.on('close', function() {
			if (currentMessage) {
				currentMessage.message = "";
				currentMessage.needsReply = false;				
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
					
					node.socket.on("data", function(data) {
                        console.log("num listening: " + node.numListening);
                        //If nobody is listening, destroy socket.
                        if (node.numListening === 0) {
                            node.socket.destroy();
                            console.log("listener count" + node.socket.listenerCount("data"));
                            node.listening = false;
                            node.log("Nobody listening, socket destroyed");
                        }							
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
					
                    node.socket.on("message", function(data) {
                        //destroy socket if nobody is waiting for a reply		
                        if (node.numListening === 0) {
                            node.socket.close();
                            console.log("listener count" + node.socket.listenerCount("data"));
                            node.socket = undefined;
                            node.listening = false;
                        }
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
			
			var addReplyListener;
			
			if (node.protocol == "tcp") {	
				
				//encode message to send. Do this first so that any errors
				//from incorrect message formatting stop the flow before
				//event handlers get attached to the socket.
				qlabMessage.toOSC().toSlip().toBuffer();
				
				addReplyListener = function() {
				    node.socket.prependOnceListener("data", function(data){
				        qlabMessage.emit("replyRaw", data);
				    });
				};
				
				
				if (qlabMessage.needsReply) {
                    qlabMessage.on("replyRaw", function(data) { 
                        
                        qlabMessage.reply = data;
                        console.log("Reply received");
                        qlabMessage.fromSlip(function() { qlabMessage.fromOSCBuffer().fromJSON(); } );
                        
                        if (qlabMessage.verifyReply()) { 
							node.numListening--; 
                            qlabMessage.needsReply = false; 
                            qlabMessage.emit("reply");
                        }
                        else {
                            addReplyListener();
                        }
                    });
				}
                
                addReplyListener();						

				
				//If port is not already open, then open it.
				//Once it's open, attach event listeners and
				//Send message.
				if (!node.listening) {
					node.listening = true;
					node.socket.connect(node.sendPort, node.ipAddress, function(){						
						node.log("Listening on socket. numListening = " + node.numListening);
						
						//if there's a passcode, send "/connect" message first
						if (qlabMessage.passcode) {
						    node.socket.write(qlabMessage.generateConnectMessage("tcp"));
						}
						
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
                    //if there's a passcode, send "/connect" message first
					if (qlabMessage.passcode) {
					    node.socket.write(qlabMessage.generateConnectMessage("tcp"));
					}
                    
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
			    //encode message to send. Do this first so that any errors
				//from incorrect message formatting stop the flow before
				//event handlers get attached to the socket.
				qlabMessage.toOSC().toBuffer();
				
			    addReplyListener = function() {
				    node.socket.prependOnceListener("message", function(data){
				        qlabMessage.emit("replyRaw", data);
				    });
				};
				
				
                if (qlabMessage.needsReply) {
                    qlabMessage.on("replyRaw", function(data) { 
                        
                        qlabMessage.reply = data;
                        console.log("Reply received");
                        qlabMessage.fromOSCBuffer().fromJSON();
                        
                        if (qlabMessage.verifyReply()) { 
							node.numListening--; 
                            qlabMessage.needsReply = false; 
                            console.log("reply verified");
                            qlabMessage.emit("reply");
                        }
                        else {
                            addReplyListener();
                        }
                    });
                }
                
				
                addReplyListener();                               
                
                if (qlabMessage.needsReply) {  
					if (!node.listening) {
						node.socket.bind(node.listenPort, "0.0.0.0", function(){
							node.listening = true;
							node.log("Port bound");
						});
					}
				}
			    
				//if there's a passcode, send "/connect" message first
				if (qlabMessage.passcode) {
				    node.socket.send(qlabMessage.generateConnectMessage("udp"),0, qlabMessage.connectMessage.length, node.sendPort,node.ipAddress);
				}			    
			    	
				node.socket.send(qlabMessage.data,0, qlabMessage.data.length, node.sendPort,node.ipAddress, function(error) {
				    node.log("packet sent");
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
    
    
    
    
	function QlabMessage(data, needsReply, passcode) {
		 EventEmitter.call(this);
		
		this.data = data;
		this.needsReply = needsReply;
		this.passcode = passcode || null;
		
		this.connectMessage = null;
		
		var qlabMessage = this;
		
		
        this.generateConnectMessage = function(protocol) {
            var packet = {address:"/connect", args:qlabMessage.passcode};
            
            if (protocol == "tcp") {
                try {
                    qlabMessage.connectMessage = new Buffer(slip.encode(osc.writePacket(packet)));
                    return qlabMessage.connectMessage;
                }   
                catch (error) {
                    qlabMessage.emit("error", new Error(error.message));
                }
            }
            else if (protocol == "udp") {
                try {
                    qlabMessage.connectMessage = new Buffer(osc.writePacket(packet));
                    return qlabMessage.connectMessage;
                }   
                catch (error) {
                    qlabMessage.emit("error", new Error(error.message));
                }
            }
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
		
						
		this.toSlip = function() {
			qlabMessage.data = slip.encode(qlabMessage.data);
			return qlabMessage;
		};
		
		
		this.toBuffer = function() {
			qlabMessage.data = new Buffer(qlabMessage.data);
			return qlabMessage;
		};
		
		
		this.fromOSCBuffer = function() {
			try {
				qlabMessage.reply = osc.readPacket(qlabMessage.reply, {metadata:false, unpackSingleArgs:false});
			}
			catch (error) {
				qlabMessage.emit("error", new Error(error.message));
			}
			return qlabMessage;
		};
		
		
		this.fromSlip = function(callback) {
		    
			var handleReply = function(message) {
			    qlabMessage.reply = message;
			    callback();
			};
			
			var emitError = function(message, errorMessage) {
				qlabMessage.emit("error", new Error(errorMessage));
			};
			
			var decoder = new slip.Decoder({
				onMessage: handleReply,
				onError  : emitError
			});

			decoder.decode(qlabMessage.reply);
			
			return qlabMessage;
		};
		
		
		this.fromJSON = function() {
            try {
                qlabMessage.reply.args[0] = JSON.parse(qlabMessage.reply.args[0]);
                
                //If there's only one argument and it just got turned into
                //an object, than replace array with that object.
                if (qlabMessage.reply.args.length == 1) {
                    qlabMessage.reply.args = qlabMessage.reply.args[0];
                }
            } 
            catch (e) {
                //wasn't JSON, do nothing.
            }
            return qlabMessage;
		};
		
		
		//overwrite this function in nodes above, with code specifically
		//meant to verify reply for given message.
		//Should return true if qlabMessage needs reply AND the 
		//reply received is for the message sent. Otherwise,
		//return false (including if the message simply needs no reply)
		this.verifyReply = function() {
			//Only return true if actually listening for reply
			if (qlabMessage.needsReply) { 
				
				sentAddress = qlabMessage.data.split("/");
				replyAddress = qlabMessage.reply.split("/");
				
				//only return true if reply actually came from Qlab.
				//All Qlab replies begin with "/reply"
				if (replyAddress[1] == "reply") {
				
					//If final elements in both addresses are the same return true.
					//The whole addresses might not be the same because Qlab
					//Auto fills the workspace/id section if it is left out.
					if (sentAddress[sentAddres.length - 1] == replyAddress[replyAddress.length - 1])
					{ 
						return true; 
					}
					
					//If reply is to connect request, ignore it, but send error
					//if bad passcode.
					else if (qlabMessage.reply.address.match(/connect$/)) {
						if (qlabMessage.reply.args.data == "badpass") {
							qlabMessage.emit("error", new Error("Incorrect passcode"));
						}
						return false; 
					}
					else {
						return false;
					}
				}
				else {
					return false;
				}
			}
			else 
				{ return false; }
		};
		
	}
	util.inherits(QlabMessage, EventEmitter);
};
