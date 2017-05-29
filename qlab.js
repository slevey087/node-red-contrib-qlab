module.exports = function(RED) {
    "use strict";
    var osc = require('osc');
    var dgram = require('dgram');
    
    function QlabIn(config) {
        RED.nodes.createNode(this,config);
            
        this.port = config.port;
        this.passcode = config.passcode;
        var node = this;

    
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
