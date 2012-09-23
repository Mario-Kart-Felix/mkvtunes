# Why?

Because teh internets prefer MKV container for movies, but iOS devices
and iTunes work best with MP4. Video stream usually stored in
aftermentioned MKVs needs no transcoding H.264.

Hence, this script. It demuxes MKV, gathers external sound &
subtitles, converts sound from AC3 to AAC (if needed), scrapes movie
matadata tags and cover from KinoPoisk.ru (IMDB is coming) and packs
everything into nice standalone MP4 file ready for iTunes or streaming
into iOS.

# How

## Requirements

- node.js
- mkvtoolnix
- MP4Box (gpac)
- ffmpeg

For Mac:

	$ brew install mkvtoolnix gpac ffmpeg node
	$ cd mkvtunes
	$ npm -g install
	
For apt-based Linux:
	
	$ sudo add-apt-repository ppa:chris-lea/node.js
	$ sudo apt-get update
	$ sudo apt-get install nodejs npm mkvtoolnix gpac ffmpeg 
	$ cd mkvtunes
	$ npm -g install
