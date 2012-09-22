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

node.js, a few modules, mkvtoolsnix, MP4Box and ffmpeg
