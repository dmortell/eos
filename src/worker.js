// Version: 1

// alternate https://github.com/open-nomie/nomie5/blob/v5-develop/public/service-worker.js
// https://github.com/matyunya/smelte/blob/master/src/service-worker.js

// 1. Save the files to the user's device
// The "install" event is called when the ServiceWorker starts up.
// All ServiceWorker code must be inside events.

var root='/eire-eos';

self.addEventListener('install', function(e) {
	console.log('install');
	// wait until we have cached all of our files
	e.waitUntil(	  // Here we call our cache "myonsenuipwa", but you can name it anything unique
	  caches.open('onsenuipwa').then(cache => {		// If the request for any of these resources fails, _none_ of the resources will be added to the cache.
		return cache.addAll([
		  root+'/',
		  root+'/index.php',
		  root+'/manifest.json',
		  //'https://unpkg.com/onsenui/css/onsenui.min.css',
		  // 'https://unpkg.com/onsenui/css/onsenui-core.min.css',
		  // 'https://unpkg.com/onsenui/css/onsen-css-components.min.css',
		  // 'https://unpkg.com/onsenui/js/onsenui.min.js',
		]);
	  })
	);
});

// 2. Intercept requests and return the cached version instead
self.addEventListener('fetch', function(e) {
	e.respondWith(	  // check if this file exists in the cache
	  caches.match(e.request)		// Return the cached file, or else try to get it from the server
		.then(response => response || fetch(e.request))
	);
});