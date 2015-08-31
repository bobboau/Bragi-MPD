# Bragi-MPD
Full featured, mobile friendly MPD web client, based on MPD.js

Intro
-----

Bragi-MPD a fully featured, HTML5, mobile friendly MPD web client made using [MPD.js](https://github.com/bobboau/MPD.js). Bragi-MPD is intended to allow you to play your music the way you want to wherever you are and with any device capable of loading a web page. You can manage playlists, search your music database, or manually navigate your music files. Inherantly multi-user friendly it is like it's namesake, great at parties.

Installation and Setup
---------------------

You must have a [working instalation of MPD](http://www.musicpd.org/doc/user/) for many linux distributions this is little more than 'apt-get install mpd'.

Once you have MPD working you will need to spin up an instance of [Websockify](https://github.com/kanaka/websockify). Once you have Websockify downloaded and you have navigated to it's directory and assuming you use the standard port for MPD, you can start up an instance of it that should allow you to get started with MPD.js with the following command:

    ./run 8800 localhost:6600

The version of all client side dependencies Bragi-MPD was built with are included in the repo. You simply have to clone the repo or download a zipped copy and extract into the webroot of a webserver, or if you don't feel like setting up a full webserver on Linux environments you can serve the files useing this command from the root of the repo folder.

    python -m SimpleHTTPServer

After that you should be able to start playing your music by navigating to your server in a web browser.
