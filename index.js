// Tech Ministry - UMD Listener

var instance_skel = require('../../instance_skel');
var debug;
var log;

var net = require('net');
var dgram = require('dgram');
var packet = require('packet');
var umd = null;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions();

	return self;
}

instance.prototype.init = function () {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.status(self.STATUS_OK);
	
	self.TallyArray = [];
	
	self.callbacks = {};
	self.pages = {};
	
	self.CHOICES_PAGES = [];

	self.CHOICES_BANKS = [];

	for (var bank = 1; bank <= 32; bank++) {
		self.CHOICES_BANKS.push({ label: 'Bank ' + bank, id: bank });
	}
	
	self.pages_getall();
	self.addSystemCallback('page_update', self.pages_update.bind(self));

	self.initModule();
	self.init_feedbacks();
	self.init_variables();
	self.init_presets();
};

instance.prototype.pages_getall = function() {
	var self = this;

	self.system.emit('get_page', function (pages) {
		self.pages = pages;
	});
};

instance.prototype.pages_update = function() {
	var self = this;

	// Update dropdowns
	self.init_feedbacks();
};

instance.prototype.addSystemCallback = function(name, cb) {
	var self = this;

	if (self.callbacks[name] === undefined) {
		self.callbacks[name] = cb.bind(self);
		self.system.on(name, cb);
	}
};

instance.prototype.updateConfig = function (config) {
	var self = this;
	self.config = config;

	self.status(self.STATUS_OK);

	self.initModule();
	self.init_feedbacks();
	self.init_variables();
};

instance.prototype.initModule = function () {
	var self = this;
	
	self.setUpTSLServer();
	
	self.actions(); // export actions
	self.feedbackActionsEnabled = true;
};

instance.prototype.setUpTSLServer = function () {
	var self = this;
	
	self.stopTSLServer(); //stop the server before attempting to start up a new one
	
	let port = self.config.port;
	
	let parser = packet.createParser();
	
	parser.packet('tsl', 'b8{x1, b7 => address},b8{x2, b2 => brightness, b1 => tally4, b1 => tally3, b1 => tally2, b1 => tally1 }, b8[16] => label');
	
	let protocol = self.config.protocol;
	
	if (!protocol) {
		protocol = 'udp';
	}
	
	if (protocol === 'tcp') {
		// Start a TCP server
		try {
			umd = net.createServer(function (socket) {
				// Handle incoming messages
				socket.on('data', function (data) {
					parser.extract('tsl', function (result) {
						result.label = new Buffer(result.label).toString();
						self.processTSLTally(result);
					});
					parser.parse(data);
				});

				socket.on('close', function () {
					self.status(self.STATUS_OK, 'TSL 3.1 Server Closed.');
				});

			}).listen(port);
		}
		catch (error) {
			self.status(self.status_ERROR, 'TSL 3.1 Server Error occurred: ' + error);
		}
	}
	else {
		//Start a UDP server
		try {
			umd = dgram.createSocket('udp4');
			
			umd.on('error', (err) => {
				debug('error',err);
				umd.close();
			});

			umd.on('message', (msg, rinfo) => {
				parser.extract('tsl', function (res) {
					res.label = new Buffer(res.label).toString();
					res.sender = rinfo.address;
					self.processTSLTally(res);
				});
				parser.parse(msg);
			});

			umd.bind(port);
		}
		catch (error) {
			self.status(self.status_ERROR, 'TSL 3.1 Server Error occurred: ' + error);
		}
	}
}

instance.prototype.stopTSLServer = function () {
	var self = this;
	
	let protocol = self.config.protocol;
	
	try {		
		if (umd !== null) {
			if (umd.server) {
				umd.server.close();
			}
			else {
				umd.close();	
			}
		}
	}
	catch (error) {
		self.status(self.status_ERROR, 'TSL 3.1 Server Error occurred: ' + error);
	}
	finally {
		umd = null;
	}
}

instance.prototype.processTSLTally = function (tallyObj) {
	//add the tally object to the array and update the latest received value
	var self = this;
	
	let foundInArray = false;
	
	if ((tallyObj.tally1 === 1) && (tallyObj.tally2 === 1)) {
		tallyObj.tally1a2 = 1;
	}
	else {
		tallyObj.tally1a2 = 0;
	}

	for (let i = 0; i < self.TallyArray.length; i++)
	{
		if (self.TallyArray[i].address === tallyObj.address)
		{
			//update in place
			self.TallyArray[i].label = tallyObj.label;
			self.TallyArray[i].tally1_last = self.TallyArray[i].tally1;
			self.TallyArray[i].tally1 = tallyObj.tally1;
			self.TallyArray[i].tally2_last = self.TallyArray[i].tally2;
			self.TallyArray[i].tally2 = tallyObj.tally2;
			
			self.TallyArray[i].tally1a2 = tallyObj.tally1a2;
			
			self.TallyArray[i].tally3_last = self.TallyArray[i].tally3;
			self.TallyArray[i].tally3 = tallyObj.tally3;
			self.TallyArray[i].tally4_last = self.TallyArray[i].tally4;
			self.TallyArray[i].tally4 = tallyObj.tally4;
			self.TallyArray[i].brightness = tallyObj.brightness;
			foundInArray = true;
			break;
		}
	}

	if (!foundInArray)
	{
		self.TallyArray.push(tallyObj);
	}
	
	self.updateVariable('address_' + tallyObj.address + '_label', tallyObj.label);
	self.updateVariable('address_' + tallyObj.address + '_tally1', tallyObj.tally1);
	self.updateVariable('address_' + tallyObj.address + '_tally2', tallyObj.tally2);
	self.updateVariable('address_' + tallyObj.address + '_tally3', tallyObj.tally3);
	self.updateVariable('address_' + tallyObj.address + '_tally4', tallyObj.tally4);
	
	self.checkFeedbacks('tally_address_color');
	self.checkFeedbacks('tally_address_buttonpress');
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module can be configured to receive TSL 3.1 data from your remote device. (Use multiple instances to receive data from multiple devices.)'
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Target Port',
			default: 9800,
			width: 4,
			regex: self.REGEX_PORT
		},
		{
			type: 'dropdown',
			id: 'protocol',
			label: 'TCP or UDP',
			default: 'tcp',
			choices: [ {id: 'tcp', label: 'TCP'}, {id: 'udp', label: 'UDP'} ]
		}
	]
}

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this;

	self.stopTSLServer();
	
	debug('destroy', self.id);
}

instance.prototype.actions = function (system) {
	var self = this;

	self.system.emit('instance_actions', self.id, {
		'enable': {
			label: 'Enable Feedback Button Actions'
		},
		'disable': {
			label: 'Disable Feedback Button Actions'
		}
	});
};

instance.prototype.action = function (action) {
	var self = this;
	var options = action.options;
	
	var port = self.config.port;

	switch (action.action) {
		case 'enable':
			self.feedbackActionsEnabled = true;
			break;
		case 'disable':
			self.feedbackActionsEnabled = false;
			break;
		default:
			break;
	}
};

instance.prototype.init_feedbacks = function() {
	var self = this;
	
	self.CHOICES_PAGES.length = 0;
	for (var page in self.pages) {
		var name = 'Page ' + page;

		if (self.pages[page].name !== undefined && self.pages[page].name != 'PAGE') {
			name += ' (' + self.pages[page].name + ')';
		}
		self.CHOICES_PAGES.push({
			label: name,
			id: page
		});
	}

	// feedbacks
	var feedbacks = {};

	feedbacks['tally_address_color'] = {
		label: 'Change Button Color If Tally Received',
		description: 'If Tally Number Received for Tally Address, change the color of the button.',
		options: [
			{
				type: 'textinput',
				label: 'Tally Address',
				id: 'address',
				default: 0,
				width: 4,
				regex: self.REGEX_NUMBER
			},
			{
				type: 'dropdown',
				label: 'Tally Number',
				id: 'number',
				default: 'tally1',
				choices: [ {id: 'tally1', label: 'Tally 1 (PVW)'}, {id: 'tally2', label: 'Tally 2 (PGM)'}, {id: 'tally1a2', label: 'Tally 1+2 (PVW+PGM)'}, {id: 'tally3', label: 'Tally 3'}, {id: 'tally4', label: 'Tally 4'} ]
			},
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0,255,0)
			},
		]
	};
	
	//add a feedback option to select address, number, and an instance action to execute when this matches
	feedbacks['tally_address_buttonpress'] = {
		label: 'Press A Button If Tally Received',
		description: 'If Tally Number Received for Tally Address, press the selected button.',
		options: [
			{
				type: 'textinput',
				label: 'Tally Address',
				id: 'address',
				default: 0,
				width: 4,
				regex: self.REGEX_NUMBER
			},
			{
				type: 'dropdown',
				label: 'Tally Number',
				id: 'number',
				default: 'tally1',
				choices: [ {id: 'tally1', label: 'Tally 1 (PVW)'}, {id: 'tally2', label: 'Tally 2 (PGM)'}, {id: 'tally1a2', label: 'Tally 1+2 (PVW+PGM)'}, {id: 'tally3', label: 'Tally 3'}, {id: 'tally4', label: 'Tally 4'} ]
			},
			{
				type: 'dropdown',
				label: 'Page',
				id: 'page',
				default: '1',
				choices: self.CHOICES_PAGES
			},
			{
				type: 'dropdown',
				label: 'Bank',
				id: 'bank',
				default: '1',
				choices: self.CHOICES_BANKS
			}
		]
	};

	self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.feedback = function(feedback, bank) {
	var self = this;
	
	if (feedback.type === 'tally_address_color') {
		if (self.TallyArray !== undefined) {
			var tallyObj = self.TallyArray.find(a => a.address === parseInt(feedback.options.address));
			if (tallyObj) {
				if (tallyObj[feedback.options.number] === 1) {
					return { color: feedback.options.fg, bgcolor: feedback.options.bg };
				}
			}
		}
	}
	
	if (feedback.type === 'tally_address_buttonpress') {
		if (self.feedbackActionsEnabled) {
			if (self.TallyArray !== undefined) {
				var tallyObj = self.TallyArray.find(a => a.address === parseInt(feedback.options.address));
				if (tallyObj) {
					if (tallyObj[feedback.options.number] === 1) {
						//press the button if options.number + _last is not 1 (so button press is not repeated if data is re-sent unless state is changed first)
						if (tallyObj[feedback.options.number + '_last'] !== 1) {
							//do the thing
							self.system.emit('bank-pressed', feedback.options.page, feedback.options.bank, true, 'self');
							self.system.emit('bank-pressed', feedback.options.page, feedback.options.bank, false, 'self');
						}
						return {};
					}
				}
			}
		}
	}

	return {};
}

instance.prototype.init_variables = function() {
	var self = this;

	var variables = [];

	self.setVariableDefinitions(variables);
}

instance.prototype.updateVariable = function (variableName, value) {
	var self = this;
	
	self.setVariable(variableName, value);
};

instance.prototype.init_presets = function () {
	var self = this;
	var presets = [];

	presets.push({
		category: 'Tallies',
		label: 'Change Button Color to Green when Tally Address is in PVW, Red when in PGM, Yellow when in PVW+PGM',
		bank: {
			style: 'text',
			text: '1',
			size: 'auto',
			color: self.rgb(255,255,255),
			bgcolor: 0
		},
		feedbacks: [
			{
				type: 'tally_address_color',
				options: {
					bg: self.rgb(0,255,0),
					fg: self.rgb(255,255,255),
					address: 1,
					number: 'tally1'
				}
			},
			{
				type: 'tally_address_color',
				options: {
					bg: self.rgb(255,0,0),
					fg: self.rgb(255,255,255),
					address: 1,
					number: 'tally2'
				}
			},
			{
				type: 'tally_address_color',
				options: {
					bg: self.rgb(255,200,0),
					fg: self.rgb(255,255,255),
					address: 1,
					number: 'tally1a2'
				}
			}
		],
		actions: [
		]
	});
	
	presets.push({
		category: 'Tallies',
		label: 'Change Button Color to Green when Tally Address is in PVW',
		bank: {
			style: 'text',
			text: '1',
			size: 'auto',
			color: self.rgb(255,255,255),
			bgcolor: 0
		},
		feedbacks: [
			{
				type: 'tally_address_color',
				options: {
					bg: self.rgb(0,255,0),
					fg: self.rgb(255,255,255),
					address: 1,
					number: 'tally1'
				}
			}
		],
		actions: [
		]
	});
	
	presets.push({
		category: 'Tallies',
		label: 'Change Button Color to Red when Tally Address is in PGM',
		bank: {
			style: 'text',
			text: '1',
			size: 'auto',
			color: self.rgb(255,255,255),
			bgcolor: 0
		},
		feedbacks: [
			{
				type: 'tally_address_color',
				options: {
					bg: self.rgb(255,0,0),
					fg: self.rgb(255,255,255),
					address: 1,
					number: 'tally2'
				}
			}
		],
		actions: [
		]
	});
	
	presets.push({
		category: 'Tallies',
		label: 'Change Button Color to Yellow when Tally Address is in PVW+PGM',
		bank: {
			style: 'text',
			text: '1',
			size: 'auto',
			color: self.rgb(255,255,255),
			bgcolor: 0
		},
		feedbacks: [
			{
				type: 'tally_address_color',
				options: {
					bg: self.rgb(255,200,0),
					fg: self.rgb(255,255,255),
					address: 1,
					number: 'tally1a2'
				}
			}
		],
		actions: [
		]
	});

	self.setPresetDefinitions(presets);
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;
