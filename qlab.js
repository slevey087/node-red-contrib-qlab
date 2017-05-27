module.exports = function(RED) {
    "use strict";
    var osc = require('osc');
    var dgram = require('dgram');
    
    function QlabIn(config) {
        RED.nodes.createNode(this,config);
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
        var node = this;
    
    }
    RED.nodes.registerType("qlab cofig",QlabConfig);    
}
