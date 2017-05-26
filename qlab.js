module.exports = function(RED) {
    function QlabNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        
        node.on('input', function(msg) {
            
            
        });
    
    }
    RED.nodes.registerType("qlab",QlabNode111);
}
