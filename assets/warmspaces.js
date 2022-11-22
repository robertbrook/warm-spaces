/**
	Open Innovations Warm Places Finder
	Version 0.1
 */
(function(root){

	var OI = root.OI || {};
	if(!OI.ready){
		OI.ready = function(fn){
			// Version 1.1
			if(document.readyState != 'loading') fn();
			else document.addEventListener('DOMContentLoaded', fn);
		};
	}

	function WarmSpacesFinder(opts){
		if(!opts) opts = {};

		this.name = "Open Innovations Warm Spaces Finder";
		this.version = "0.1";
		var logger = new Log({"title":this.name,"version":this.version});
		var log = logger.message;

		if(!opts.el){
			log("error","No output area to attach to.");
			return this;
		}
		
		// Create geo-location button
		this.btn = document.getElementById('find');
		if(!this.btn){
			this.btn = document.createElement('button');
			this.btn.innerHTML = "Find spaces near me";
			this.btn.classList.add('c13-bg');
			opts.el.appendChild(this.btn);
		}
		var _obj = this;
		this.btn.addEventListener('click',function(){ _obj.getLocation(); });

		// Create an element before the list
		this.loader = document.createElement('div');
		this.loader.classList.add('loader');
		opts.el.appendChild(this.loader);

		// Create list output area
		this.list = document.createElement('ul');
		this.list.classList.add('list','grid');
		

		// Create a tiled data layer object
		this.tiler = OI.TiledDataLayer(merge({
			'url':'https://odileeds.github.io/osm-geojson/tiles/bins/{z}/{x}/{y}.geojson',
			'zoomLevels': [12],
			'finder': this,
			//'map': this.map,
			'loaded':function(tiles,attr){
				log('info','There are '+tiles.length+' tiles.');
				var geo = {'type':'FeatureCollection','features':[]};
				for(var i = 0; i < tiles.length; i++){
					for(var f = 0; f < tiles[i].data.features.length; f++){
						if(tiles[i].data.features[f].type==="Feature") geo.features.push(tiles[i].data.features[f]);
					}
				}

				var lat = attr.finder.lat;
				var lon = attr.finder.lon;

				var features = geo.features;
				for(var i = 0; i < features.length; i++){
					c = features[i].geometry.coordinates;
					features[i].distance = greatCircle([lon,lat],c);
				}
				var sorted = features.sort(function(a,b){return a.distance - b.distance;});
				
				// Build list
				attr.finder.buildList(sorted);
			}
		},opts.tiles||{}));
		
		// Set or load the sources
		if(typeof opts.sources==="object"){
			this.sources = opts.sources;
		}else{
			if(typeof opts.sources==="string"){
				// Parse unprocessed Jekyll string
				opts.sources = opts.sources.replace(/\{% include_relative ([^\%]+) %\}/,function(m,p1){ return p1; });
			}
			fetch(opts.sources||"data/sources.json",{})
				.then(response => { return response.json(); })
				.then(json => {
					this.sources = json;
				}).catch(error => {
					log("error",'Unable to load sources.');
				});
		}
		
		this.buildList = function(geosort){

			var acc,logacc,base,frac,options,distance,imin,tmin,i,p,d,html,accuracy;
			// We want to round to the accuracy of the geolocation
			acc = this.location.coords.accuracy;
			logacc = Math.log10(acc);
			base = Math.floor(logacc);
			frac = logacc - base;
			// We now want to check whether frac falls closest to 1, 2, 5, or 10 (in log
			// space). There are more efficient ways of doing this but this is just for clarity.
			options = [1,2,5,10];
			distance = new Array(options.length);
			imin = -1;
			tmin = 1e100;
			for(i = 0; i < options.length; i++){
				distance[i] = Math.abs(frac - Math.log10(options[i]));
				if(distance[i] < tmin){
					tmin = distance[i];
					imin = i;
				}
			}
			// Now determine the actual spacing
			accuracy = Math.pow(10,(base))*options[imin];

			html = '';
			for(i = 0; i < 30; i++){
				p = geosort[i].properties;
				d = Math.ceil(geosort[i].distance/accuracy)*accuracy;
				var hours = processHours(p.hours);
				var cls = hours.class;
				
				html += '<li><div>';
				html += (p.url ? '<a class="'+cls+'" href="'+p.url+'/" target="_source">' : '<div class="'+cls+'">');
				html += '<div class="doublepadded">';
				html += '<h3>'+p.title+'</h3>';
				if(p.address) html += '<p class="address">'+p.address+'</p>';
				html += '<p><span class="dist">'+d+'m</span> or so away</p>';
				if(p.description) html += '<p><strong>Description:</strong> '+p.description+'</p>';
				if(p.hours){
					html += '<p class="times"><strong>Opening hours:</strong></p>'+hours.times;
				}
				html += '</div>';
				html += (p.url ? '</a>':'</div>');
				html += formatSource(this.sources[p._source]);
				html += '</div></li>';
			}
			this.list.innerHTML = html;
			opts.el.appendChild(this.list);
			this.loader.innerHTML = '<ul id="key"><li><span class="keyitem c14-bg"></span> opening soon</li><li><span class="keyitem c13-bg"></span> open</li><li><span class="keyitem c12-bg"></span> closing soon</li><li><span class="keyitem b5-bg"></span> closed</li></ul>';
			return this;
		};
		function formatSource(source){
			var html = "";
			if(source.url) html += '<a href="'+source.url+'" target="_source">';
			if(source.title) html += source.title;
			if(source.url) html += '</a>';
			if(source.map && source.map.url && source.map.url!=source.url){
				html += ' / <a href="'+source.map.url+'" target="_source">Map</a>'
			}
			return (html ? '<div class="source b2-bg"><strong>Source:</strong> '+html+'</div>' : '');
		}
		Date.prototype.getNthOfMonth = function(){
			var dd = new Date(this),
				month = this.getMonth(),
				year = this.getFullYear(),
				day = this.getDate(),
				today = this.getDay(),
				n = 0;
			var i,d;
			for(i = 1; i <= day; i++){
				dd.setDate(i);
				d = dd.getDay();
				if(d==today) n++;
				
			}
			return n;
		};
		function processHours(times){
			var i,d,dow,now,nth,days,day,bits,bitpart,cls,okday,today,ranges,r,ts,t1,t2,hh,newtimes,ofmonth;
			cls = "b5-bg";
			newtimes = "";
			if(times){
				longdays = {"Su":"Sun","Mo":"Mon","Tu":"Tue","We":"Wed","Th":"Thu","Fr":"Fri","Sa":"Sat","Su":"Sun"}
				days = {"Su":0,"Mo":1,"Tu":2,"We":3,"Th":4,"Fr":5,"Sa":6,"Su":7};
				now = new Date();
				nth = now.getNthOfMonth();
				bits = times.split(/\, /);
				okday = false;
				for(i = 0; i < bits.length; i++){
					(bitpart) = bits[i].split(/ /);
					ds = bitpart[0].split(/-/);
					dow = now.getDay();
					hh = now.getHours() + now.getMinutes()/60;
					today = "";
					for(d in days){
						if(dow==days[d]) today = d;
					}
					okday = false;
					if(ds.length == 1){
						okday = (ds[0].match(today));
					}else{
						s = days[ds[0]];
						e = days[ds[1]];
						if(dow >= s && dow <= e) okday = true;
					}

					ofmonth = "";
					// Check week of month
					bitpart[0] = bitpart[0].replace(/\[([^\]]+)\]/,function(m,p1){
						if(!p1.match(nth)) okday = false;
						ofmonth = "<sup>"+p1+"</sup>"
						return "";
					});

					newtimes += '<li>'+longdays[bitpart[0]]+ofmonth+': '+bitpart[1]+'</li>';

					if(okday){
						ranges = bitpart[1].split(/,/);
						//console.log(bits,bitpart,'matches this day of week');
						for(r = 0; r < ranges.length; r++){
							ts = ranges[r].split(/-/);
							t1 = ts[0].split(/:/);
							t2 = ts[1].split(/:/);
							t1 = parseInt(t1[0]) + parseInt(t1[1])/60;
							t2 = parseInt(t2[0]) + parseInt(t2[1])/60;
							if(t1 <= hh && t2 > hh) cls = "c13-bg";
							if(hh < t1 && hh > t1-0.5) cls = "c14-bg";
							if(hh < t2 && hh > t2-0.25) cls = "c12-bg";
						}
					}
				}
			}
			return {'class':cls,'times':(newtimes ? '<ul class="times">'+newtimes+'</ul>':'')};
		};
		this.getLocation = function(){ this.startLocation("getCurrentPosition"); };
		this.startLocation = function(type){

			this.loader.innerHTML = '<svg version="1.1" width="64" height="64" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(.11601 0 0 .11601 -49.537 -39.959)"><path d="m610.92 896.12m183.9-106.17-183.9-106.17-183.9 106.17v212.35l183.9 106.17 183.9-106.17z" fill="black"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.7;1" dur="1s" begin="-0.83333s" repeatCount="indefinite" /></path><path d="m794.82 577.6m183.9-106.17-183.9-106.17-183.9 106.17v212.35l183.9 106.17 183.9-106.17z" fill="black"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.7;1" dur="1s" begin="-0.6666s" repeatCount="indefinite" /></path><path d="m1162.6 577.6m183.9-106.17-183.9-106.17-183.9 106.17v212.35l183.9 106.17 183.9-106.17z" fill="black"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.7;1" dur="1s" begin="-0.5s" repeatCount="indefinite" /></path><path d="m1346.5 896.12m183.9-106.17-183.9-106.17-183.9 106.17v212.35l183.9 106.17 183.9-106.17z" fill="black"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.7;1" dur="1s" begin="-0.3333s" repeatCount="indefinite" /></path><path d="m1162.6 1214.6m183.9-106.17-183.9-106.17-183.9 106.17v212.35l183.9 106.17 183.9-106.17z" fill="black"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.7;1" dur="1s" begin="-0.1666s" repeatCount="indefinite" /></path><path d="m794.82 1214.6m183.9-106.17-183.9-106.17-183.9 106.17v212.35l183.9 106.17 183.9-106.17z" fill="black"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.7;1" dur="1s" begin="0s" repeatCount="indefinite" /></path></g></svg>';

			if(!type) type = "watchPosition";
			// Start watching the user location
			var _obj = this;
			log('info','Getting location...');
			this.watchID = navigator.geolocation[type](function(position){
				_obj.updateLocation(position);
			},function(){
				log("Having trouble finding your location.");
			},{
				enableHighAccuracy: true,
				maximumAge				: 30000,
				timeout					 : 27000
			});
		};
		this.stopLocation = function(){
			navigator.geolocation.clearWatch(this.watchID);
			return this;
		};		
		this.updateLocation = function(position){
			this.lat = position.coords.latitude;
			this.lon = position.coords.longitude;
			this.location = position;
			log('info','Got location',position,this.lat,this.lon);
			
			dlat = 0.05;
			dlon = 0.05;
			var bounds = {"_southWest": {
					"lat": this.lat-dlat,
					"lng": this.lon-dlon
				},
				"_northEast": {
					"lat": this.lat+dlat,
					"lng": this.lon+dlon
				}
			};

			this.tiler.getTiles(bounds,opts.tiles.zoomLevels[0]);
			return this;
		};
		
		return this;
	}
	function greatCircle(a,b){
		// Inputs [longitude,latitude]
		var d2r = Math.PI/180;
		var R = 6.3781e6; // metres
		var f1 = a[1]*d2r;
		var f2 = b[1]*d2r;
		var dlat = (a[1]-b[1])*d2r;
		var dlon = (a[0]-b[0])*d2r;

		var a = Math.sin(dlat/2) * Math.sin(dlat/2) +
				Math.cos(f1) * Math.cos(f2) *
				Math.sin(dlon/2) * Math.sin(dlon/2);
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

		return R * c;
	}		
	function TiledDataLayer(opts){
		if(!opts) opts = {};
		this.title = "TiledDataLayer";
		this.version = "0.1";

		var logger = new Log({"title":this.title,"version":this.version});
		var log = logger.message;

		if(!opts.url){
			log("error",'No url provided for data layer');
			return this;
		}

		var tiles = [];
		var tileLookup = {};
		
		if(typeof L==="undefined") log("warn",'No map to attach to');

		var R = 6378137, sphericalScale = 0.5 / (Math.PI * R);

		function tile2lon(x,z){ return (x/Math.pow(2,z)*360-180); }
		function tile2lat(y,z){ var n=Math.PI-2*Math.PI*y/Math.pow(2,z); return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)))); }

		/* Adapted from: https://gist.github.com/mourner/8825883 */
		this.xyz = function(bounds, z) {

			if(typeof bounds.N==="number") bounds = {'_northEast':{'lat':bounds.N,'lng':bounds.E},'_southWest':{'lat':bounds.S,'lng':bounds.W}};

			var n,s,e,w,x,y,t,min,max;
			// Find bounds
			n = bounds._northEast.lat;
			s = bounds._southWest.lat;
			e = bounds._northEast.lng;
			w = bounds._southWest.lng;
			// Reduce bounds to any limits that have been set
			if(opts.limits){
				n = Math.min(n,opts.limits.N);
				s = Math.max(s,opts.limits.S);
				e = Math.min(e,opts.limits.E);
				w = Math.min(e,opts.limits.W);
			}

			min = project(n, w, z);
			max = project(s, e, z);
			t = [];
			for(x = min.x; x <= max.x; x++) {
				for(y = min.y; y <= max.y; y++) t.push({ x: x, y: y, z: z, b: {'_northEast':{'lat':tile2lat(y,z),'lng':tile2lon(x+1,z)},'_southWest':{'lat':tile2lat(y+1,z),'lng':tile2lon(x,z)}} });
			}
			return t;
		};
		if(opts.map){
			var layerGroup = new L.LayerGroup();
			var geojsonlayer;
		}
		this.addToMap = function(geojson,config){

			if(opts.map){

				layerGroup.addTo(opts.map);
				
				var colour = config.colour||"#e6007c";

				function createIcon(data, category){
					return L.divIcon({
						'className': 'oi-map-marker',
						'html': '<svg overflow="visible" width="24" height="40" class="oi-map-marker" style="transform:translate3d(0,0,0)"><path d="M 0,0 L -10.84,-22.86 A 12 12 1 1 1 10.84,-22.86 L 0,0 z" fill="{fill}" fill-opacity="1"></path><ellipse cx="0" cy="-27.5" rx="4" ry="4" fill="white"></ellipse></svg>'.replace(/\{fill\}/,colour),
						iconSize: [0, 0],
						iconAnchor: [0, 0]
					});
				}

				var mapIcon = createIcon();

				if(geojsonlayer) layerGroup.removeLayer(geojsonlayer);
				
				if(typeof L.markerClusterGroup==="function"){

					geojsonlayer = L.markerClusterGroup({
						chunkedLoading: true,
						maxClusterRadius: 60,
						iconCreateFunction: function (cluster){
							return L.divIcon({ html: '<div class="marker-group" style="background:'+colour+';color:white;border-radius:100%;text-align:center;font-size:0.8em;line-height:2.5em;width:2.5em;opacity:0.85;">'+cluster.getChildCount()+'</div>', className: '' });
						},
						disableClusteringAtZoom: 17,
						spiderfyOnMaxZoom: true,
						showCoverageOnHover: false,
						zoomToBoundsOnClick: true
					});
					markerList = [];
					for(var i = 0; i < geojson.features.length; i++){
						if(geojson.features[i].geometry.type=="Point"){
							ll = geojson.features[i].geometry.coordinates;
							tempmark = L.marker([ll[1],ll[0]],{icon: mapIcon});
							markerList.push(tempmark);
						}
					}
					geojsonlayer.addLayers(markerList);

				}else if(typeof PruneClusterForLeaflet==="function"){

					// https://github.com/SINTEF-9012/PruneCluster
					geojsonlayer = new PruneClusterForLeaflet();
					
					geojsonlayer.BuildLeafletClusterIcon = function(cluster) {
						var max,i,c,fs,c2,c3,n,s;
						var population = cluster.population; // the number of markers inside the cluster
						max = 0;
						for(i = 0; i < this.Cluster._clusters.length; i++) max = Math.max(max,this.Cluster._clusters[i].population);
						//c = OI.ColourScale.getColour(1-population/max);
						c = OI.ColourScale.getColour(1);
						c2 = c.colour.replace(",1)",",0.5)");
						c3 = c.colour.replace(",1)",",0.2)");
						fs = 0.7 + Math.sqrt(population/max)*0.3;
						n = (""+population).length;
						if(n==1) s = 1.8
						else if(n==2) s = 2.2
						else if(n==3) s = 2.6;
						else if(n==4) s = 3;
						else if(n==5) s = 3;
						return L.divIcon({ html: '<div class="marker-group" style="background:'+c.colour+';color:'+(c.contrast)+';box-shadow:0 0 0 0.2em '+c2+',0 0 0 0.4em '+c3+';font-family:Poppins;border-radius:100%;text-align:center;font-size:'+fs+'em;line-height:'+s+'em;width:'+s+'em;opacity:0.85;">'+population+'</div>', className: '' });
					};
					
					for(var i = 0; i < geojson.features.length; i++){
						if(geojson.features[i].geometry.type=="Point"){
							ll = geojson.features[i].geometry.coordinates;
							var marker = new PruneCluster.Marker(ll[1],ll[0]);
							marker.data.icon = createIcon;
							marker.category = 0;
							geojsonlayer.RegisterMarker(marker);
						}
					}
					
				}else{

					geojsonlayer = L.geoJson(geojson,{
						pointToLayer(feature, latlng) {
							return L.marker(latlng, {icon: mapIcon });
						}
					});					

				}

				layerGroup.addLayer(geojsonlayer);

			}
			return this;
		};
		function newFetch(url, o, cb){
			fetch(url,{})
			.then(response => { return response.json(); })
			.then(json => {
				tileLookup[o.z][o.y][o.x].loaded = true;
				tileLookup[o.z][o.y][o.x].data = json;
				if(typeof cb==="function") cb.call(this);
			}).catch(error => {
				tileLookup[o.z][o.y][o.x].loaded = true;
				tileLookup[o.z][o.y][o.x].data = {'type':'FeatureCollection','features':[]};
				if(typeof cb==="function") cb.call(this);
				log("error",'Unable to load URL '+url);
			});
			return;
		}
		this.normaliseZoom = function(z){
			// Take a default zoom level
			var zoom = (typeof opts.zoom==="number") ? opts.zoom : 10;
			// If a zoom is provided, set it
			if(typeof z==="number") zoom = z;
			// Find the nearest zoom level to the required zoom
			var idx = -1;
			var min = Infinity;
			for(var i = 0; i < opts.zoomLevels.length; i++){
				v = Math.abs(zoom-opts.zoomLevels[i]);
				if(v < min){
					idx = i;
					min = v;
				}
			}
			if(idx >= 0) zoom = opts.zoomLevels[idx];
			return zoom;
		};
		this.getTiles = function(bounds,z){
			z = this.normaliseZoom(z);
			var i,x,y;
			tiles = this.xyz(bounds,z);
			if(!tileLookup[z]) tileLookup[z] = {};

			function loaded(){
				// Check if tiles loaded
				var ok = true;
				for(i = 0; i < tiles.length; i++){
					if(!tileLookup[tiles[i].z][tiles[i].y][tiles[i].x].loaded) ok = false;
				}
				if(!ok) return this;
				
				if(typeof opts.loaded==="function"){
					var t = [];
					var tile;
					for(i = 0; i < tiles.length; i++){
						tile = JSON.parse(JSON.stringify(tiles[i]));
						tile.data = tileLookup[tiles[i].z][tiles[i].y][tiles[i].x].data;
						t.push(tile);
					}
					opts.loaded.call(opts.this||this,t,opts,{'bounds':bounds,'z':z});
				}
				return this;
			}

			for(i = 0; i < tiles.length; i++){
				y = tiles[i].y;
				x = tiles[i].x;
				if(!tileLookup[z][y]) tileLookup[z][y] = {};
				if(!tileLookup[z][y][x]){
					tileLookup[z][y][x] = {
						'loaded': false,
						'url': opts.url.replace(/\{x\}/g,x).replace(/\{y\}/g,y).replace(/\{z\}/g,z)
					};
					//log('info','Get '+tileLookup[z][y][x].url);
					tileLookup[z][y][x].fetch = newFetch.call(this,tileLookup[z][y][x].url,{'x':x,'y':y,'z':z},loaded);
				}
			}
			return loaded.call(this);
		};

		/* 
		Adapts a group of functions from Leaflet.js to work headlessly
		https://github.com/Leaflet/Leaflet
		*/
		function project(lat,lng,zoom) {
			var d = Math.PI / 180,
			max = 1 - 1E-15,
			sin = Math.max(Math.min(Math.sin(lat * d), max), -max),
			scale = 256 * Math.pow(2, zoom);

			var point = {
				x: R * lng * d,
				y: R * Math.log((1 + sin) / (1 - sin)) / 2
			};

			point.x = tiled(scale * (sphericalScale * point.x + 0.5));
			point.y = tiled(scale * (-sphericalScale * point.y + 0.5));

			return point;
		}

		function tiled(num) {
			return Math.floor(num/256);
		}
		
		return this;
	}
	function Log(opt){
		// Console logging version 2.0
		if(!opt) opt = {};
		if(!opt.title) opt.title = "Log";
		if(!opt.version) opt.version = "2.0";
		this.message = function(...args){
			var t = args.shift();
			if(typeof t!=="string") t = "log";
			var ext = ['%c'+opt.title+' '+opt.version+'%c'];
			if(args.length > 0){
				ext[0] += ':';
				if(typeof args[0]==="string") ext[0] += ' '+args.shift();
			}
			ext.push('font-weight:bold;');
			ext.push('');
			if(args.length > 0) ext = ext.concat(args);
			console[t].apply(null,ext);
		};
		return this;
	}


	// Recursively merge properties of two objects 
	function merge(obj1, obj2){
		for(var p in obj2){
			try{
				if(obj2[p].constructor==Object) obj1[p] = merge(obj1[p], obj2[p]);
				else obj1[p] = obj2[p];
			}catch(e){ obj1[p] = obj2[p]; }
		}
		return obj1;
	}

	OI.TiledDataLayer = function(opts){ return new TiledDataLayer(opts); };	
	OI.WarmSpacesFinder = function(opts){ return new WarmSpacesFinder(opts); };	

	root.OI = OI||root.OI||{};
	
})(window || this);