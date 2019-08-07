## Tech Ministry - UMD Listener

This module enables Companion to listen to TSL 3.1 data via either TCP or UDP on the port you specify.

### Configuration
* The remote device must be configured to send TSL 3.1 data to the IP address of the Companion software on the port you specify.
* Configure the instance with the port you wish to receive TSL data on.
* Choose whether data should be received via TCP or UDP.

### To use the module
Add feedback to a button and choose the feedback action you wish to use. This is primarily a feedback-only module.

**Available actions:**
* Enable Feedback Button Actions
* Disable Feedback Button Actions

**Available feedback actions:**
* Change Button Color If Tally Received
* Press A Button If Tally Received (can execute another Companion action if a particular tally address and value is received)