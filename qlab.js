module.exports = function(RED) {
    "use strict";
    var osc = require('osc');
    var dgram = require('dgram');
    
    function QlabNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        
        node.on('input', function(msg) {
            
            
        });
    
    }
    RED.nodes.registerType("qlab",QlabNode111);
}
