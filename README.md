# Bragi-MPD
Full featured, mobile friendly MPD web client. Based on MPD.js

Intro
-----

Bragi-MPD a fully featured, HTML5, mobile friendly MPD web client made using [MPD.js](https://github.com/bobboau/MPD.js). Bragi-MPD is intended to allow you to play your music the way you want to wherever you are and with any device capable of loading a web page. You can manage playlists, search your music database, or manually navigate your music files. IOnherently multi-user friendly it is like it's namesake, great at parties.

Bragi supports managing multiple outputs per MPD instance, and can be configured to manage multiple instances (on multiple hosts) making it ideally suited to controlling music on zoned sound systems.

Features
--------

Bragi aims to be a full featured MPD client, though it is work in progress and new features are always being added the goal is to leave no good feature unimplemented.

 * playback control (available in all interfaces)
  * play/pause
  * volume control
  * seek
  * previous/next
  * display of metadata of currently playing song
 * Queue management
  * play a song on the queue
  * add songs by various means (mentioned elsewhere, i.e. search, playlist, manual file lookup)
  * remove a song from the queue
  * reorder songs on the queue
  * show currently playing song ont the queue
  * remove currently playing song from the queue  
  * save queue as playlist
  * clear queue
 * Playlists
  * add song(s) in a playlist to the queue
  * add song from a playlist to the queue and play
  * remove song from playlist
  * reorder songs in playlist
  * delete playlist
  * rename playlist
 * File exploration
  * view and explore the MPD file database directly
  * add individual songs from a directory to queue / playlist
  * add all songs from a directory to queue / playlist
 * Search
  * search based on progressively filtered tags
  * free form search on all tags
  * add results to queue or playlist
 * Settings
  * change MPD settings, such as random, single play, crossfade, and consume
 * Outputs
  * enable/disable outputs manually or switch cleanly
 * Instances
  * control multiple MPD instances (requires configuration)


Installation and Setup
---------------------

You must have a [working installation of MPD](http://www.musicpd.org/doc/user/) for many Linux distributions this is little more than 'apt-get install mpd'.

Once you have MPD working you will need to spin up an instance of [Websockify](https://github.com/kanaka/websockify). Once you have Websockify downloaded and you have navigated to it's directory and assuming you use the standard port for MPD, you can start up an instance of it that should allow you to get started with MPD.js with the following command:

    ./run 8800 localhost:6600

The version of all client side dependencies Bragi-MPD was built with are included in the repo. You simply have to clone the repo or download a zipped copy and extract into the webroot of a webserver. Apache or lighttpd would be good choices for this. If you don't feel like setting up a full webserver on Linux environments and just want to quickly test it out you can serve the files using this command from the root of the repo folder.

    python -m SimpleHTTPServer

After that you should be able to start playing your music by navigating to your server in a web browser.

Configuration
-------------

Configuration is done in the config.js file. The default config file has one instance on one host setup. If only one client is set up the instances tab will not be shown in the interface, otherwise you will be able to switch which instance you are controlling in the instance tab. You can have as many instances as you want. Each instance allows you to specify a name, port number (default 8800), and host name (if not specified it will use the root of the host name you loaded the page from)
