module.exports = function(RED) {
    "use strict";
    var EventEmitter = require('events').EventEmitter;
	var util  = require('util');
    var dgram = require('dgram');
    var net   = require('net');
	var path  = require('path');
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
        
		//Log on socket events
		node.socket.on("listening", function() {
			node.log("Listener started.");
		});
		
		node.socket.on("close", function() {
			node.log("Listener closed.");
		});
		
		node.socket.on("error", function (error) {
            node.error(error.message, []);
        });
		
        //tidy up when flow stops
        node.on('close', function() {
           node.socket.close(); 		   
           node.connectedTo = [];
		   node.log("Listener closed.");
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
                
				//Variable to indicate that this was a single, succesful, connect message,
				//so no msg needs to be sent.
				var connectOnly;
				
                for (var i = 0;  i < loopLength; i++) {
                    //If message is connect request, add sender info to list
                    if (packet.packets[i].address == "/connect" && packet.packets[i].args == node.passcode)
                    { 
                        node.connectTo(info.address); 
						
						//If this /connect message was the only message, 
						if (loopLength == 1) { connectOnly = true; }
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
                            payload.push({address:packet.packets[i].address, args:packet.packets[i].args});
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
				else if (connectOnly) {}
                else {
                    node.send({payload:{rejected:true}, packetInfo:info});
                }
            }
            catch (error) {
                node.error(error.message);
            }            
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
        
        node.debug = false;
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
			var debug = null;
			
			if (msg._qlab) {
                if (msg._qlab._debug) {
                    node.debug = true;
			        debug = true;
			        node.log("debug mode on.")
                }
                else if (msg._qlab._debug === false) {
                    node.debug = false;
                    debug = false;
                    node.log("debug mode off.")
                }
			}
			
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
				packet = {address:msg.topic, args:msg.payload.split(' ')}; 
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

			if (node.debug) { node.log("[10] Packet to send: " + JSON.stringify(packet)); }
			
            try 
			{				
				if (!packet) {
					throw new Error("Received no data. Please use documented format.")
				}
				var qlabMessage = new QlabMessage(packet, false, node.passcode, node.debug);
				
				//In order to clear message when flow stops
				currentMessage = qlabMessage;
				
				qlabMessage.on('error', function(error){
				    node.error(error.message);
				});				
				
				node.qlab.setDebug(debug).createSocket().send(qlabMessage);
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
		this.onNoReply   = config.onNoReply;
		
        var node = this;
		
        node.debug = false;		
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
			var debug = null;
			
			if (msg._qlab) {
                if (msg._qlab._debug) {
                    node.debug = true;
			        debug = true;
			        node.log("[0] Debug mode on.")
                }
                else if (msg._qlab._debug === false) {
                    node.debug = false;
                    debug = false;
                    node.log("[00] Debug mode off.")
                }
			}		
			
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
			
			
			if (node.debug) { node.log("[20] Packet to send: " + JSON.stringify(packet)); }			
			
            try 
			{	
				if (!packet) {
					throw new Error("Received no data. Please use documented format.")
				}
				var qlabMessage = new QlabMessage(packet, true, node.passcode, node.debug);
				
				//In order to clear message when flow stops
				currentMessage = qlabMessage;
				
				qlabMessage.on('reply', function(debug){
					//Pass the debug state back from the config node, so that it propogates
					//To all the Qlab nodes.
					node.debug = debug;
					
				    msg.payload = qlabMessage.reply;
					node.send(msg);
				});
				
				qlabMessage.on('noReply', function(debug){
					//Pass the debug state back from the config node, so that it propogates
					//To all the Qlab nodes.
					node.debug = debug;
					
					if (node.onNoReply == "ignore") {
						if (node.debug) { node.log("[30] No verified reply, ignoring exception."); }			
					}
					else {
						node.error("No reply from Qlab.", msg);
					}
				});				
				
				qlabMessage.on('error', function(error){
				    node.error(error.message);
				});
				
				node.qlab.setDebug(debug).createSocket().send(qlabMessage);
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
        
        this.debug = false;
		this.numListening = 0;
        
        var node = this;
        
        this.setDebug = function(debug) {
            if (debug === true || debug === false) { node.debug = debug; }
            return node;
        };
	    
		this.maybeDestroySocket;
		
		this.createSocket = function() {
			
			//if socket does not already exist
			if (!node.socket) {
				
				if (node.protocol == 'tcp') {
					
					//create TCP socket
					node.socket = new net.Socket();															
					
                    if (node.debug) { node.log("[40] Creating TCP socket."); }					
					
					//This seems to be the problem section. Commenting it out, and will add a qlabMessage error in the Send message section.
					//node.socket.on("error", function(error) {
					//	node.emit("error", error);
					//});	
					
					node.maybeDestroySocket = function() {
						//If nobody is listening, destroy socket.
                        if (node.numListening === 0) {
                            if (node.debug) { node.log("[50] Socket closed because nobody listening (1)"); }
							
							node.socket.destroy();
							node.socket = undefined;
                            node.listening = false;
                        }
					};
					
					node.socket.on("data", function(data) {
						node.maybeDestroySocket();	
                    });	
				}
				
				else if (node.protocol == "udp") {
					
					//create UDP socket
					node.socket = dgram.createSocket({type:'udp4', reuseAddr:true});
					
					if (node.debug) { node.log("[60] Creating UDP socket"); }
					
					//This seems to be the problem section. Commenting it out, and will add a qlabMessage error in the Send message section.
					//node.socket.on("error", function(error) {
					//	node.emit("error", error);
					//});	
					
					node.maybeDestroySocket = function() {
						//destroy socket if nobody is waiting for a reply		
                        if (node.numListening === 0) {
                            node.socket.close();
                            node.socket = undefined;
                            node.listening = false;
                        }
					};
					
                    node.socket.on("message", function(data) {
						node.maybeDestroySocket();
                    });						
				}
				
				//If there's any problem, trigger error in qlabMessage, to ensure that exception is caught
				//and caught by the correct node. (THIS IS THE EXPERIMENTAL BUG FIX)
				node.socket.on("error", function(error, qlabMessage) {
					node.listening = false;
					(node.protocol =="tcp") ? node.socket.destroy() : node.socket.close();
					node.socket = undefined;
					
					if (node.debug) { node.log("[70] Socket error, closing socket."); }
					if (qlabMessage) qlabMessage.emit("error", error);
					else node.error("Error: " + error.message, {});
				});	
				
			}
			return node;
		};
		
		
		this.send = function(qlabMessage) {			
			
			//numListening tracks how many messages are waiting for replies
			if (node.numListening < 0) { node.numListening = 0; }
			if (qlabMessage.needsReply) { node.numListening++; }			
            
			if (!node.socket) {
			    node.createSocket();
			}
			
			//This function will be different depending on TCP vs UDP.
			var addReplyListener;
						
			
			if (node.protocol == "tcp") {	
				
				//Encode message to send. Do this first so that any errors
				//from incorrect message formatting stop the flow before
				//event handlers get attached to the socket.
				qlabMessage.toOSC().toSlip().toBuffer();
				
				if (node.debug) { node.log("[80] Encoded data to send: " + JSON.stringify(qlabMessage.data)); }
				
				addReplyListener = function() {
				    node.socket.prependOnceListener("data", function(data){
				        qlabMessage.emit("replyRaw", data);
				    });
				};
				
				
				if (qlabMessage.needsReply) {
                    qlabMessage.on("replyRaw", function(data) { 
                        
                        qlabMessage.reply = data;
                        
                        if (node.debug) { node.log("[90] Reply received: "+ JSON.stringify(qlabMessage.reply)); }
                        
                        qlabMessage.fromSlip(function() { qlabMessage.fromOSCBuffer().fromJSON(); } );
                        
                        if (node.debug) { node.log("[100] Decoded: "+ JSON.stringify(qlabMessage.reply)); }
                        
                        if (qlabMessage.verifyReply()) { 
							if (node.debug) { node.log("[110] Reply verified"); }
							node.numListening--; 
                            qlabMessage.needsReply = false; 
                            qlabMessage.emit("reply", node.debug);
                        }
                        else {
                            if (node.debug) { node.log("[120] Reply not verified"); }
                            addReplyListener();
                        }
                    });
				}
                
                addReplyListener();						

				
				//If port is not already open, then open it.
				//Once it's open, attach event listeners and
				//Send message.
				if (!node.listening) {
					if (node.debug) { node.log("[130] Attempting to open TCP connection."); }
					node.listening = true;
					node.socket.connect(node.sendPort, node.ipAddress, function(){	
					    
					    if (node.debug) { 
					        node.log("[140] Listening on socket."); 
					        node.log("[140] numListening = " + node.numListening);
					    }
						
						//if there's a passcode, send "/connect" message first
						if (qlabMessage.passcode) {
						    if (node.debug) { node.log("[150] Sending /connect message"); }
						    node.socket.write(qlabMessage.generateConnectMessage("tcp"));
						}
						
						//Send message, and close port when finished, unless this or another
						//message is still waiting for a reply.
						if (node.debug) { node.log("[160] Sending message"); }
						node.socket.write(qlabMessage.data, function() {
							if (node.debug) { node.log("[170] Message sent."); }
							node.maybeDestroySocket();	
						});
					});
				}
				
				else { 
                    //if there's a passcode, send "/connect" message first
					if (qlabMessage.passcode) {
					    if (node.debug) { node.log("[180] Sending /connect message"); }
					    node.socket.write(qlabMessage.generateConnectMessage("tcp"));
					}
                    
                    if (node.debug && !node.socket.connecting) { node.log("[190] Sending message"); }
					else if (node.debug && node.socket.connecting) { node.log("[191] Still connecting, adding message to que."); }
                    node.socket.write(qlabMessage.data, function() {
						if (node.debug) { node.log("[200] Message sent."); }
						node.maybeDestroySocket();	
					}); 
				}
				
				setTimeout(function() {
					if (qlabMessage.needsReply) {
				        if (node.debug) { node.log("[210] Reply timeout"); }					    
						
						node.numListening--;
						qlabMessage.emit("noReply", node.debug);
					}
					
					if (node.listening) {
						node.maybeDestroySocket();
					}
				}, 1000);
			}
			
			
			else if (node.protocol == "udp") {
			    //encode message to send. Do this first so that any errors
				//from incorrect message formatting stop the flow before
				//event handlers get attached to the socket.
				qlabMessage.toOSC().toBuffer();
				
				if (node.debug) { node.log("[220] Encoded data to send: " + JSON.stringify(qlabMessage.data)); }
				
			    addReplyListener = function() {
				    node.socket.prependOnceListener("message", function(data){
				        qlabMessage.emit("replyRaw", data);
				    });
				};
				
				
                if (qlabMessage.needsReply) {
                    qlabMessage.on("replyRaw", function(data) { 
                        
                        qlabMessage.reply = data;
                                                
                        if (node.debug) { node.log("[230] Reply received: "+ JSON.stringify(qlabMessage.reply)); }
                        //Decode message
                        qlabMessage.fromOSCBuffer().fromJSON();
                        
                        if (node.debug) { node.log("[240] Decoded: "+ JSON.stringify(qlabMessage.reply)); }
                        
                        
                        if (qlabMessage.verifyReply()) { 
                            if (node.debug) { node.log("[250] Reply verified"); }
							node.numListening--; 
                            qlabMessage.needsReply = false; 
                            qlabMessage.emit("reply", node.debug);
                        }
                        else {
                            if (node.debug) { node.log("[260] Reply not verified"); }
                            addReplyListener();
                        }
                    });
                }
                
				
                addReplyListener();                               
                
                if (qlabMessage.needsReply) {  
					if (!node.listening) {
						node.socket.bind(node.listenPort, "0.0.0.0", function(){
							node.listening = true;
						    
						    if (node.debug) { 
                                node.log("[270] Listening on socket."); 
                                node.log("[270] numListening = " + node.numListening);
                            }
                            
						});
					}
				}
			    
				//if there's a passcode, send "/connect" message first
				if (qlabMessage.passcode) {
				    if (node.debug) { node.log("[280] Sending /connect message"); }
				    node.socket.send(qlabMessage.generateConnectMessage("udp"),0, qlabMessage.connectMessage.length, node.sendPort,node.ipAddress);
				}			    
                
                if (node.debug) { node.log("[290] Sending packet"); }
                node.socket.send(qlabMessage.data,0, qlabMessage.data.length, node.sendPort,node.ipAddress, function(error) {
				    if (node.debug) { node.log("[300] Packet sent."); }
					if (error) {node.socket.emit('error', new Error(error.message), qlabMessage); }
					node.maybeDestroySocket();						
				});
				
				setTimeout(function() {
					if (qlabMessage.needsReply) {
					    if (node.debug) { node.log("[310] Reply timeout."); }
						node.numListening--;
						qlabMessage.emit("noReply", node.debug);
					}
					
					if (node.listening) {
						node.maybeDestroySocket();
					}
				}, 1000);
			}
		};
    }
    RED.nodes.registerType("qlab config",QlabConfig);       
    
    
    
    
	function QlabMessage(data, needsReply, passcode, debug) {
		 EventEmitter.call(this);
		
		this.data = data;
		this.needsReply = needsReply;
		this.passcode = passcode || null;
		this.debug = debug || false;
		
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
                //store message to compare with reply
                qlabMessage.originalData = JSON.parse(JSON.stringify(qlabMessage.data));
                
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
		
		
		//Should return true if qlabMessage needs reply AND the 
		//reply received is for the message sent. Otherwise,
		//return false (including if the message simply needs no reply)
		this.verifyReply = function() {
			//Only return true if actually listening for reply
			if (qlabMessage.needsReply) { 
				
				var sentAddress = qlabMessage.originalData.address.split("/");
				var replyAddress = qlabMessage.reply.address.split("/");

				//only return true if reply actually came from Qlab.
				//All Qlab replies begin with "/reply"
				if (replyAddress[1] == "reply") {
				
					//If final elements in both addresses are the same return true.
					//The whole addresses might not be the same because Qlab
					//Auto fills the workspace/id section if it is left out.
					if (sentAddress[sentAddress.length - 1] == replyAddress[replyAddress.length - 1])
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
	
	RED.httpAdmin.get('/__qlab/autocomplete.js', function(req, res) {
        var filename = path.join(__dirname , '/auto-complete/auto-complete.min.js');
        res.sendFile(filename);
    });
	
	RED.httpAdmin.get('/__qlab/qlabCommandList.js', function(req, res) {
        var filename = path.join(__dirname , '/qlabCommandList.js');
        res.sendFile(filename);
    });
	
	RED.httpAdmin.get('/__qlab/autocomplete.css', function(req, res) {
        var filename = path.join(__dirname , '/auto-complete/auto-complete.css');
        res.sendFile(filename);
    });	
};
