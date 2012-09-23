#!/usr/bin/env node

var _ = require('underscore')._,
    carrier = require('carrier'),
    spawn = require('child_process').spawn,
    colors = require('colors'),
    async = require('async'),
    commander = require('commander'),
    sys = require('sys'),
    fs = require('fs'),
    path = require('path'),
    jsdom = require('jsdom'),
    request = require('request'),
    iconv = require('iconv')
    ;

var exe_mkvinfo = 'mkvinfo';
var exe_mkvextract = 'mkvextract';
var exe_ffmpeg = 'ffmpeg';
var exe_mp4box = 'MP4Box';

var temp_dir = '.';

var max_audio_recoders = 2;

var test_mkv = process.argv[2] || 'Ed.Wood.1994.720p.mkv';
//var test_mkv = 'Line Of Sight.mkv';

var language_map_2_to_3 = {"aa":"aar","ab":"abk","af":"afr","ak":"aka","sq":"alb","am":"amh","ar":"ara","an":"arg","hy":"arm","as":"asm","av":"ava","ae":"ave","ay":"aym","az":"aze","ba":"bak","bm":"bam","eu":"baq","be":"bel","bn":"ben","bh":"bih","bi":"bis","bs":"bos","br":"bre","bg":"bul","my":"bur","ca":"cat","ch":"cha","ce":"che","zh":"chi","cu":"chu","cv":"chv","kw":"cor","co":"cos","cr":"cre","cs":"cze","da":"dan","dv":"div","nl":"dut","dz":"dzo","en":"eng","eo":"epo","et":"est","ee":"ewe","fo":"fao","fj":"fij","fi":"fin","fr":"fre","fy":"fry","ff":"ful","ka":"geo","de":"ger","gd":"gla","ga":"gle","gl":"glg","gv":"glv","el":"gre","gn":"grn","gu":"guj","ht":"hat","ha":"hau","he":"heb","hz":"her","hi":"hin","ho":"hmo","hr":"hrv","hu":"hun","ig":"ibo","is":"ice","io":"ido","ii":"iii","iu":"iku","ie":"ile","ia":"ina","id":"ind","ik":"ipk","it":"ita","jv":"jav","ja":"jpn","kl":"kal","kn":"kan","ks":"kas","kr":"kau","kk":"kaz","km":"khm","ki":"kik","rw":"kin","ky":"kir","kv":"kom","kg":"kon","ko":"kor","kj":"kua","ku":"kur","lo":"lao","la":"lat","lv":"lav","li":"lim","ln":"lin","lt":"lit","lb":"ltz","lu":"lub","lg":"lug","mk":"mac","mh":"mah","ml":"mal","mi":"mao","mr":"mar","ms":"may","mg":"mlg","mt":"mlt","mn":"mon","na":"nau","nv":"nav","nr":"nbl","nd":"nde","ng":"ndo","ne":"nep","nn":"nno","nb":"nob","no":"nor","ny":"nya","oc":"oci","oj":"oji","or":"ori","om":"orm","os":"oss","pa":"pan","fa":"per","pi":"pli","pl":"pol","pt":"por","ps":"pus","qu":"que","rm":"roh","ro":"rum","rn":"run","ru":"rus","sg":"sag","sa":"san","si":"sin","sk":"slo","sl":"slv","se":"sme","sm":"smo","sn":"sna","sd":"snd","so":"som","st":"sot","es":"spa","sc":"srd","sr":"srp","ss":"ssw","su":"sun","sw":"swa","sv":"swe","ty":"tah","ta":"tam","tt":"tat","te":"tel","tg":"tgk","tl":"tgl","th":"tha","bo":"tib","ti":"tir","to":"ton","tn":"tsn","ts":"tso","tk":"tuk","tr":"tur","tw":"twi","ug":"uig","uk":"ukr","ur":"urd","uz":"uzb","ve":"ven","vi":"vie","vo":"vol","cy":"wel","wa":"wln","wo":"wol","xh":"xho","yi":"yid","yo":"yor","za":"zha","zu":"zul"};

var language_priority = ['eng','rus','fre'];

var kinopoisk_headers = { 
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/534.55.3 (KHTML, like Gecko) Version/5.1.3 Safari/534.53.10',
    'Accept-Language': 'ru-RU'
};

var kinopoisk_base = 'http://www.kinopoisk.ru';


function make_temp_name(name) {
    return path.join(temp_dir, name);
}

function mkv_find_internal_tracks(mkv, callback) {
    var tracks = [];
    var track = null;
    carrier.carry(spawn(exe_mkvinfo, [mkv.file_name]).stdout).
	on('line', function (line) {
	    var m;
	    if(/A track/.test(line)) {
		if(track) 
		    tracks.push(track);
		track = { internal: true, language: 'eng' };
	    } else if(track && (m = line.match(/Track number: (\d+)/))) {
		track.number = parseInt(m[1]);
	    } else if(track && (m = line.match(/Track type: (\w+)/))) {
		track.type = m[1];
	    } else if(track && (m = line.match(/Codec ID: (\S+)/))) {
		track.codec = m[1];
	    } else if(track && (m = line.match(/Language: (\S+)/))) {
		track.language = m[1];
	    }
	})
	.on('error', function (err) {
	    callback("can't load mkv info:" + err);
	})
	.on('end', function () {
	    if(track) {
		tracks.push(track);
	    }
	    console.log('Found tracks '.green + sys.inspect(tracks).cyan);
	    callback(null, _.extend(mkv, { tracks: tracks }));
	});
    ;
}

function mkv_check_has_avc(mkv, callback) {
    callback(mkv.tracks && _.detect(mkv.tracks, function (t) { 
	return t.type == 'video' && /AVC/.test(t.codec) ? t : null
    }) ? null : "can't find suitable AVC video track", mkv);
}

function mkv_make_context(mkv_file_name, callback) {
    var full_name = path.normalize(mkv_file_name);
    callback(null, { 
	file_name: full_name, 
	directory: path.dirname(full_name),
	directory_mode: false,
	base_name: path.basename(mkv_file_name, mkv_file_name.slice(-4))
    });
}

function spawn_collect(exe, args, callback) {
    console.log('Running '.green + exe.yellow + ' ' + args.join(' '));
    var result = '';
    var process = spawn(exe, args).on('exit', function(code) {
	console.log('Finished '.green + exe.yellow + ' code ' + code);
	if(code != 0)
	    callback(exe + ' returned ' + code + ': ' + result.split(/\r?\n/)[0]);
	else
	    callback(null, code, result);
    }).on('error', callback);
    process.stdout.on('data', function(data) { result = result + data }).on('error', callback);
    process.stderr.on('data', function(data) { result = result + data }).on('error', callback);
}

function track_extension(track) {
    if(track.type == 'video')
	return '264';
    if(track.type == 'subtitles')
	return 'srt';
    if(track.type == 'audio' && track.codec == 'A_AAC') 
	return 'aac';
    if(track.type == 'audio' && track.codec == 'A_AC3') 
	return 'ac3';
    if(track.type == 'audio') 
	return 'audio';
    return 'data';
}

function safe_name(name) {
    return name.replace(/[^A-Za-zА-Яа-я0-9]/g, '_');
}

function mkv_extract_internal_tracks(mkv, callback) {
    var tracks = _.map(mkv.tracks, function(track) {
	return _.extend(track, {
	    file_name: make_temp_name('tmp-' + safe_name(mkv.base_name) + '_track_' + track.number + '.' + track_extension(track)),
	    extracted: true
	});
    });
    
    var result = '';


    // test
    if(0) {
	mkv.mkvextract_output = "didn't run"; // for debugging
	mkv.mkvextract_result = 0;
	callback(null, _.extend(mkv, { tracks : tracks }));
	return;
    }
    // end of test

    spawn_collect(exe_mkvextract, 
		  [ 'tracks', mkv.file_name].concat(_.map(tracks, function (t) { return t.number + ':' + t.file_name })),
		  function(err, code, result) {
		      console.log('Extracted'.green);
		      if(err) 
			  callback(err);
		      else {
			  mkv.mkvextract_output = result; // for debugging
			  mkv.mkvextract_result = code;
			  callback(null, _.extend(mkv, { tracks : tracks }));
		      }
		  });
}

function add_external_track(mkv, file, type, more) {
    var ext = path.extname(file);
    var base = path.basename(file, ext);
    
    var lang2 = file.length - mkv.base_name.length - 4 >= 2 ? base.slice(-2) : '';
    var lang3 = language_map_2_to_3[lang2];
    
    console.log('Found external '.green + type.white + ' language: '.green + (''+lang3).white + ' file: '.green + file.white);
    
    mkv.tracks.push(_.extend({ 
	external: true, 
	file_name: path.join(mkv.directory, file), 
	type: type, 
	language: lang3 ? lang3 : "eng" 
    }, more));
}

function mkv_gather_external_tracks(mkv, callback) {
    fs.readdir(mkv.directory, function(err, files) {
	if(err) {
	    callback("can't list files in directory: " + err);
	} else {
	    _.each(files, function(file) {
		var ext = path.extname(file).toLowerCase();

		if(mkv.directory_mode) {
		    // TODO: implement me
		} else if(file.indexOf(mkv.base_name) === 0) {
		    if(ext === '.srt') {
			add_external_track(mkv, file, 'subtitles');
		    } else if(ext === '.ac3') {
			add_external_track(mkv, file, 'audio', { codec: 'A_AC3' });
		    } else if(ext === '.aac' || ext === '.m4a') {
			add_external_track(mkv, file, 'audio', { codec: 'A_AAC' }); // can it be ????
		    }
		}
	    });
	    callback(null, mkv);
	}
    });
}

function is_track_audio_needs_recoding(track) {
    return track.type == 'audio' && track.codec != 'A_AAC';
}

function recode_audio_track(track, callback) {
    var recoded_name = make_temp_name(track.file_name + '_recoded.aac');
    async.waterfall([
	async.apply(audio_detect_bitrate, track.file_name),
	function (bitrate, callback) {
	    spawn_collect(exe_ffmpeg, [ 
		'-y', '-stats',
		'-i', track.file_name, 
		'-acodec', 'libfaac', '-ab', bitrate, '-f', 'adts', 
		recoded_name
	    ], callback);
	},
	function (code, result, callback) {
	    track.ffmpeg_output = result; 
	    track.ffmpeg_result = code;
	    
//	    fs.unlink(track.file_name); 
	    
	    track.original_file_name = track.file_name;
	    track.file_name = recoded_name;
	    track.codec = 'A_AAC';
	    
	    callback(null, track);
	}
    ], callback);
}

function audio_detect_bitrate(file_name, callback) {
    var bitrate;
    carrier.carry(spawn(exe_ffmpeg, ['-i', file_name]).on('error', callback).stderr)
	.on('line', function (line) {
	    var m;
	    if(!bitrate && (m = line.match(/bitrate: (\d+)/))) {
		bitrate = m[1] + 'k';
	    }
	})
	.on('error', function (err) {
	    callback("can't load bitrate info:" + err);
	})
	.on('end', function () {
	    if(!bitrate) {
		callback("can't find bitrate for " + file_name);
	    } else {
		console.log('Detected bitrate for '.green + file_name + (' ' + bitrate).yellow); 
		callback(null, bitrate);
	    }
	});
}

function audio_recode_necessary_tracks(mkv, callback) {
    var to_recode = _.filter(mkv.tracks, is_track_audio_needs_recoding);
    console.log('Need to recode: '.blue + sys.inspect(to_recode).cyan);
    async.forEachLimit(to_recode, max_audio_recoders, recode_audio_track, function (err) {
	callback(err, mkv);
    });
}

function is_subtitles(track) {
    return track.type === 'subtitles';
}

function is_audio(track) {
    return track.type === 'audio';
}

function is_video(track) {
    return track.type === 'video';
}

function language_order(track) {
    var i = _.indexOf(language_priority, track.language);
    return i >= 0 ? i : language_priority.length;
}

function make_output_name(mkv) {
    return path.join(mkv.directory, mkv.base_name + '.m4v');
}

function lang_tag(track) {
    return (track.language ? ':lang=' + track.language : '');
}

function mpeg4_mux_output(mkv, callback) {
    var options = [];
  
    _.chain(mkv.tracks).filter(is_video).each(function (track) {
	options.push('-add');
	options.push(track.file_name);
    });
    
    _.chain(mkv.tracks).filter(is_audio).sortBy(language_order).each(function (track) {
	options.push('-add');
	options.push(track.file_name + lang_tag(track) + ':group=3');
    });
    
    _.chain(mkv.tracks).filter(is_subtitles).sortBy(language_order).each(function (track) {
	options.push('-add');
	options.push(track.file_name + ':hdlr=sbtl' + lang_tag(track) + ':group=2:layer=1');
    });
    
    options.push('-new');
    options.push(make_output_name(mkv));
    
    if(mkv.tags) {
	var tags = [];
	for(var tag in mkv.tags) {
	    tags.push(tag + '=' + mkv.tags[tag]);
	}
	if(tags.length) {
	    options.push('-itags');
	    options.push(tags.join(':'));
	}
    }
    
    spawn_collect(exe_mp4box, 
		  options,
		  function(err, code, result) {
		      mkv.mp4box_output = result; 
		      mkv.mp4box_result = code;
		      callback(err, mkv);
		  });
    
}

function cleanup_temporary_files(mkv,callback) {
    console.log('Cleaning up'.green);
    
    _.each(mkv.tracks, function (track) {
	if(!track.external) {
	    fs.unlink(track.file_name);
	    if(track.original_file_name) {
		fs.unlink(track.original_file_name);
	    }
	}
    });
    
    if(mkv.tags && mkv.tags.cover)
	fs.unlink(mkv.tags.cover);
    
    callback(null, mkv);
}

function http_jquery(query, callback) {
    async.waterfall([
	async.apply(request, _.extend({ 
	    headers: kinopoisk_headers,
	    encoding: 'binary'
	}, query)),
	function(response, body, callback) {
	    if(response && response.statusCode == 200) {
		body = new Buffer(body, 'binary');
		var conv = new iconv.Iconv('windows-1251', 'utf8');
		body = conv.convert(body).toString();
		callback(null, { html: body, scripts: [ 'http://code.jquery.com/jquery-1.8.2.min.js' ]});
	    } else {
		callback("http error: " + response.statusCode, response);
	    }
	},
	jsdom.env
    ], function(err, window) {
	callback(err, err ? null : window.jQuery);
    });
}

function kinopoisk_find_movies(name, callback)
{
    var search = name.replace(/[^A-Za-zА-Яа-я0-9]+/g, ' ').replace(/\s+$/,'').replace(/^\s+/,'');
    var year = '';
    var m;
    if((m = search.match(/[^0-9]([0-9]{4})$/))) {
	year = m[1];
	search = search.replace(/[0-9]{4}$/, '');
    }
    http_jquery({ uri: 'http://www.kinopoisk.ru/index.php?level=7&from=forma&result=adv&m_act%5Bfrom%5D=forma&m_act%5Bwhat%5D=content' 
		  + '&m_act%5Bfind%5D=' + search.replace(/ /g, '%20')
		  + '&m_act%5Byear%5D=' + year 
		}, 
		function(err, $) {
		    if(err)
			callback(err);
		    else {
			var results = [];
			$('.element').each(function (idx) {
			    var l = $(this).find('p.name a');
			    var name = l.text();
			    var origname = $(this).find('.info .gray:first').text();
			    var href = l.attr('href');
			    var year = $(this).find('.year').text();
			    results.push({ name: name, origname: origname, year: year, url: kinopoisk_base + href });
			});
			callback(null, results);
		    }
		});
}

function kinopoisk_get_movie_info(url, callback)
{
    http_jquery({ uri: url },
		function(err, $) {
		    if(err)
			callback(err);
		    else {
			var r = {};
			r.name = $('h1.moviename-big:first').text().trim();
			r.original_name = $('span[itemprop=alternativeHeadline]').text().trim();
			
			var info = {};
			$('table.info tr').each(function () {
			    var key = $(this).find('td:first').text();
			    var value = $(this).find('td:last').text();
			    info[key] = value;
			});
			
			r.actors = _.filter($('td.actor_list span[itemprop=actors] a').map(function () { return $(this).text() }).toArray(), 
					    function(a) { return a != '...' }).join(', ');
			r.year = info['год'].replace(/[^0-9]+/g,'');
			r.genre = info['жанр'].replace(/, .+$/, '').replace(/\s+/g,'');
			
			r.description = $('div.brand_words:first').text().trim();

			var imgsrc = '' + $('img[itemprop=image]').attr('src');
			var bigsrc = null;
			var m;
			if((m = imgsrc.match(/([0-9]+\.jpg)/ig))) {
			    bigsrc = 'http://st.kinopoisk.ru/images/film_big/' + m[0];
			} else {
			    imgsrc = null;
			}
			

			if(bigsrc || imgsrc) {
			    kinopoisk_load_poster((bigsrc || imgsrc), function(err, image) {
				if(err && imgsrc) {
				    kinopoisk_load_poster(imgsrc, function(err, image) {
					if(!err && image) {
					    r.poster = image;
					    r.poster_format = 'jpeg';
					}
					callback(null, r);
				    });
				} else {
				    if(!err && image) {
					r.poster = image;
					r.poster_format = 'jpeg';
				    } 
				    callback(null, r);
				}
			    });
			} else {
			    callback(null, r);
			}
		    }
		});
}

function kinopoisk_load_poster(url, callback) {
    request({ url: url, headers: kinopoisk_headers, followRedirect: false, encoding: 'binary' }, function(err, response, body) {
	if(response && response.statusCode == 200) {
	    callback(null, new Buffer(body, 'binary'));
	} else {
	    callback("can't load poster");
	}
    });
}

function kinopoisk_choose_first(movies, callback)
{
    if(movies.length < 1) 
	callback('no matching movies found');
    else
	callback(null, movies[0].url);
}

function kinopoisk_find_best(name, callback) 
{
    async.waterfall([
	async.apply(kinopoisk_find_movies, name),
	kinopoisk_choose_first,
	kinopoisk_get_movie_info
    ], callback);
}

function mkv_scrape_metadata(mkv, callback)
{
    console.log('Scraping metadata '.green);
    kinopoisk_find_best(mkv.base_name, function(err, movie) {
	if(!err) {
	    console.log(('Found movie ' + movie.name).green);
	    mkv.kinpoisk_error = err;
	    
	    mkv.tags = {};
	    mkv.tags.artist = movie.actors;
	    mkv.tags.name = movie.original_name != undefined ? movie.original_name + ' / ' + movie.name : movie.name;
	    mkv.tags.created = movie.year;
	    mkv.tags.genre = movie.genre;
	    mkv.tags.comment = movie.description.replace(/[:]/g,' ').replace(/\s+/g, ' ');
	    
	    if(movie.poster) {
		var poster_file_name = make_temp_name(safe_name(mkv.base_name) + '_poster.' + movie.poster_format);
		fs.writeFile(poster_file_name, movie.poster, null, function(err) {
		    mkv.tags.cover = poster_file_name;
		    callback(null, mkv);
		});
	    } else {
		callback(null, mkv);
	    }
	} else {
	    mkv.tags = { artist: 'Unknown', name: mkv.base_name };
	    callback(null, mkv);
	}
    });
}

function mkv_process_file(mkv_file_name, callback) {
    async.waterfall([
	async.apply(mkv_make_context, mkv_file_name),
	mkv_find_internal_tracks,
	mkv_check_has_avc,
	
	function(mkv, callback) {
	    async.parallel([
		async.apply(mkv_scrape_metadata, mkv),
		async.apply(async.waterfall, [
		    async.apply(mkv_extract_internal_tracks, mkv),
		    mkv_gather_external_tracks,
		    audio_recode_necessary_tracks
		])
	    ], function (err) {
		callback(err, mkv);
	    })
	},
	
	mpeg4_mux_output,
	cleanup_temporary_files
    ], callback);
}

mkv_process_file(test_mkv, function (err, mkv) {
    var log_name = 'mkvtunes.log';
    fs.writeFile(log_name, sys.inspect(mkv), 'utf-8', function (errwr) {
	console.log(errwr ? ('Failed to write log ' + errwr).red : ('Saved log to ' + log_name).green);
    });
    if(err) {
	console.log('Error: '.red + err.white);
    } else {
	console.log('Successfully finished'.green);
    }
});
