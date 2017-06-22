# node-red-contrib-qlab
Node-Red nodes to communicate with Qlab, via OSC. Installs 3 nodes, 2 to control Qlab from Node-Red, and one to control Node-Red from Qlab.

## Installation


## Usage

### Background information: 
[Qlab Network Cues](https://figure53.com/docs/qlab/v4/control/network-cues/)

[Using OSC To Control Qlab](https://figure53.com/docs/qlab/v4/control/using-osc-to-control-qlab/)

[Qlab OSC Dictionary](https://figure53.com/docs/qlab/v4/scripting/osc-dictionary-v4/)

[Qlab OSC Queries](https://figure53.com/docs/qlab/v4/scripting/osc-queries/)

### Input Node
The input node can be used to receive OSC commands from Qlab Network Cues ("OSC Cues" in Qlab 3). Ensure that IP and port information match in both Qlab and Node-Red, and then send messages by firing the Qlab cues. This node will output an object of the form:
```
{
  address:"/an/OSC/address",
  args: "with some arguments"
}
```

### Output Node
The output node is for sending messages meant to control Qlab, which do not need a reply. Messages can be supplied to the node in several ways, each outlined in the runtime "Info" text. Messages can be delivered via TCP or UDP. The node natively handles Qlab's 4-digit passcode functionality, and can automatically add the (optional) workspace ID before workspace OSC methods. The node also has an auto-fill dropdown with the entire Qlab OSC Dictionary (updated as of 6/21/2017).


### Query Node
The query node is for sending messages meant to query Qlab, which do require a reply. Messages can be supplied to the node in several ways, each outlined in the runtime "Info" text. Messages can be delivered via TCP or UDP. The node natively handles Qlab's 4-digit passcode functionality, and can automatically add the (optional) workspace ID before workspace OSC methods. The node also has an auto-fill dropdown with the entire Qlab OSC Dictionary (updated as of 6/21/2017).

Replies received will be outputted as an object of the form:
```
{
  address:"/an/OSC/address",
  args: "with some arguments"
}
```
This node can be set to thow a catchable exception in the event that no reply is received from Qlab.
